"""
Manajemen autentikasi & sesi login (admin + PIN per lapangan).
"""
import secrets
import threading
import time

from backend.config import CFG, sha256

SESSION_TTL_SECONDS = 43200  # 12 jam

AUTH_SESSIONS = {}   # sid -> {"role": ..., "court_id"?: int, "expires": float}
_auth_lock = threading.Lock()


def _extract_sid(handler) -> str | None:
    """Ambil session ID (`sid`) dari header Cookie HTTP."""
    cookie_hdr = handler.headers.get("Cookie", "")
    for part in cookie_hdr.split(";"):
        part = part.strip()
        if part.startswith("sid="):
            return part[4:]
    return None


def _cleanup_sessions():
    """Hapus session yang sudah kedaluwarsa (lazy cleanup)."""
    now = time.time()
    with _auth_lock:
        expired = [sid for sid, s in AUTH_SESSIONS.items() if s["expires"] < now]
        for sid in expired:
            del AUTH_SESSIONS[sid]


def check_auth(handler, required_role="any", court_id=None):
    """Kembalikan dict sesi jika valid & sesuai hak akses, atau None jika tidak."""
    _cleanup_sessions()
    sid = _extract_sid(handler)
    if not sid:
        return None
    with _auth_lock:
        sess = AUTH_SESSIONS.get(sid)
    if not sess:
        return None
    if sess["expires"] < time.time():
        with _auth_lock:
            AUTH_SESSIONS.pop(sid, None)
        return None
    if required_role == "admin" and sess["role"] != "admin":
        return None
    if court_id is not None and sess["role"] != "admin" and sess.get("court_id") != court_id:
        return None
    return sess


def handle_login(data: dict) -> dict:
    """Proses login admin atau lapangan; kembalikan dict hasil dan `sid` jika sukses."""
    cfg_auth = CFG.get("auth", {})
    login_type = data.get("type")

    if login_type == "admin":
        expected_user = cfg_auth.get("admin_username", "admin")
        provided_user = data.get("username")
        if provided_user is not None and str(provided_user).strip() != expected_user:
            return {"ok": False, "message": "Username atau password salah"}
        pw_hash = sha256(data.get("password", ""))
        if pw_hash != cfg_auth.get("admin_password_hash", ""):
            return {"ok": False, "message": "Password salah"}
        sid = secrets.token_hex(16)
        with _auth_lock:
            AUTH_SESSIONS[sid] = {"role": "admin", "expires": time.time() + SESSION_TTL_SECONDS}
        return {"ok": True, "role": "admin", "sid": sid}

    if login_type == "court":
        cid = str(data.get("court_id", ""))
        pin_hash = sha256(str(data.get("pin", "")))
        court_auth = cfg_auth.get("courts", {}).get(cid)
        if not court_auth or pin_hash != court_auth.get("pin_hash", ""):
            return {"ok": False, "message": "PIN salah"}
        sid = secrets.token_hex(16)
        with _auth_lock:
            AUTH_SESSIONS[sid] = {
                "role": "court",
                "court_id": int(cid),
                "expires": time.time() + SESSION_TTL_SECONDS,
            }
        return {"ok": True, "role": "court", "court_id": int(cid), "sid": sid}

    return {"ok": False, "message": "Tipe login tidak valid"}


def handle_logout(handler):
    """Hapus session aktif dari store berdasarkan cookie permintaan."""
    sid = _extract_sid(handler)
    if sid:
        with _auth_lock:
            AUTH_SESSIONS.pop(sid, None)
