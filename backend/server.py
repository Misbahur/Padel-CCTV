"""
HTTP Server & Router utama aplikasi Papan Skor Padel + Perekam CCTV.
"""
import json
import os
import re
import shutil
import sys
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from backend import clipper, overlay
from backend.auth import check_auth, handle_login, handle_logout
from backend.cleanup import (
    clear_remote_signals,
    get_remote_signals,
    log_remote_signal,
    start_cleanup_daemon,
)
from backend.config import (
    BASE,
    CFG,
    get_safe_public_config,
    save_admin_password_hash,
    save_clipping_settings,
    save_court_pin_hash,
    save_server_ip,
    sha256,
    update_admin_court_configs,
)
from backend.media import generate_qr_svg, get_court_media, serve_file_with_range
from backend.network import get_all_lan_ips, get_base_url, get_local_ip, local_ips
from backend.recorder import SESSIONS, add_camera, init_sessions, remove_camera
from tools import cari_kamera

STATIC_MIME_TYPES = {
    ".js": "application/javascript",
    ".css": "text/css",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
}


class Handler(BaseHTTPRequestHandler):
    """Handler HTTP untuk halaman web React SPA, streaming media, dan API kontrol lapangan."""

    def log_message(self, *a):
        pass

    # ── Response helpers ─────────────────────────────────────────────────
    def _json(self, obj, code=200, extra_headers=None):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if extra_headers:
            for k, v in extra_headers.items():
                self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _html(self, path: str, code=200):
        try:
            with open(path, "rb") as f:
                body = f.read()
            self.send_response(code)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        except FileNotFoundError:
            self._json({"error": "File tidak ditemukan"}, 404)

    def _serve_static(self, base_dir: str, rel_path: str):
        fpath = os.path.join(base_dir, rel_path)
        if ".." in rel_path or not os.path.isfile(fpath):
            self._json({"error": "not found"}, 404)
            return
        ext = os.path.splitext(rel_path)[1].lower()
        ctype = STATIC_MIME_TYPES.get(ext, "application/octet-stream")
        with open(fpath, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _redirect(self, location: str, code=302):
        self.send_response(code)
        self.send_header("Location", location)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _read_body(self) -> dict:
        n = int(self.headers.get("Content-Length") or 0)
        try:
            return json.loads(self.rfile.read(n) or b"{}")
        except ValueError:
            return {}

    # ── GET dispatcher ───────────────────────────────────────────────────
    def do_GET(self):
        path = self.path.split("?")[0]
        spa_entry = os.path.join(BASE, "web", "index.html")
        has_spa = os.path.isdir(os.path.join(BASE, "web", "assets")) and os.path.isfile(spa_entry)

        if path in ("/", "/index.html"):
            self._redirect("/login")
            return

        if path == "/login":
            self._html(spa_entry if has_spa else os.path.join(BASE, "web", "login.html"))
            return

        if path == "/dashboard":
            if not check_auth(self, required_role="admin"):
                self._redirect("/login?next=/dashboard")
                return
            self._html(spa_entry if has_spa else os.path.join(BASE, "web", "dashboard.html"))
            return

        m = re.match(r"^/court/(\d+)$", path)
        if m:
            cid = int(m.group(1))
            if not check_auth(self, court_id=cid):
                self._redirect(f"/login?next=/court/{cid}")
                return
            self._html(spa_entry if has_spa else os.path.join(BASE, "web", "court.html"))
            return

        if path.startswith("/assets/"):
            self._serve_static(os.path.join(BASE, "web", "assets"), path[8:])
            return

        if path.startswith("/web/"):
            self._serve_static(os.path.join(BASE, "web"), path[5:])
            return

        if path.startswith("/media/"):
            rel_file = path[7:]
            if ".." in rel_file:
                self._json({"error": "forbidden"}, 403)
                return
            base_dir = os.path.normpath(os.path.join(BASE, "rekaman"))
            full_path = os.path.normpath(os.path.join(base_dir, rel_file))
            if not full_path.startswith(base_dir) or not os.path.isfile(full_path):
                self._json({"error": "file not found"}, 404)
                return
            serve_file_with_range(self, full_path)
            return

        if path.startswith("/share/"):
            share_page = os.path.join(BASE, "web", "share.html")
            if os.path.isfile(share_page):
                self._html(share_page)
            else:
                self._json({"error": "share page not found"}, 404)
            return

        self._handle_get_api(path)

    def _handle_get_api(self, path: str):
        if path == "/api/auth/me":
            sess = check_auth(self)
            if not sess:
                self._json({"ok": False, "message": "Belum login"}, 401)
                return
            info = {"ok": True, "role": sess["role"]}
            if "court_id" in sess:
                info["court_id"] = sess["court_id"]
            self._json(info)
            return

        if path == "/api/system/info":
            base_url = get_base_url()
            ip = get_local_ip()
            port = int(CFG.get("port", 8080))
            self._json({
                "ok": True,
                "ip": ip,
                "port": port,
                "base_url": base_url,
                "server_ip": CFG.get("server_ip", ""),
                "all_ips": get_all_lan_ips(),
                "is_localhost": (ip == "127.0.0.1" or "localhost" in base_url),
                "server": {"local_ip": ip, "port": port, "base_url": base_url},
            })
            return

        if path == "/api/qr":
            query = self.path.split("?")[1] if "?" in self.path else ""
            params = urllib.parse.parse_qs(query)
            text = params.get("text", [""])[0]
            if not text:
                self._json({"error": "parameter text dibutuhkan"}, 400)
                return
            try:
                svg_data = generate_qr_svg(text)
                self.send_response(200)
                self.send_header("Content-Type", "image/svg+xml")
                self.send_header("Content-Length", str(len(svg_data)))
                self.send_header("Cache-Control", "public, max-age=86400")
                self.end_headers()
                self.wfile.write(svg_data)
            except Exception as e:
                self._json({"error": str(e)}, 500)
            return

        m = re.match(r"^/api/court/(\d+)/media$", path)
        if m:
            cid = int(m.group(1))
            self._json({"ok": True, "court_id": cid, "sessions": get_court_media(cid)})
            return

        m = re.match(r"^/api/court/(\d+)/status$", path)
        if m:
            cid = int(m.group(1))
            if not check_auth(self, court_id=cid):
                self._json({"error": "unauthorized"}, 401)
                return
            s = SESSIONS.get(cid)
            if not s:
                self._json({"error": "Lapangan tidak ditemukan"}, 404)
                return
            self._json(s.status())
            return

        if path == "/api/admin/status":
            if not check_auth(self, required_role="admin"):
                self._json({"error": "unauthorized"}, 401)
                return
            self._json({"ok": True, "courts": {cid: s.status() for cid, s in SESSIONS.items()}})
            return

        if path == "/api/admin/config":
            if not check_auth(self, required_role="admin"):
                self._json({"error": "unauthorized"}, 401)
                return
            self._json({"ok": True, "config": get_safe_public_config()})
            return

        self._json({"error": "not found"}, 404)

    # ── POST dispatcher ──────────────────────────────────────────────────
    def do_POST(self):
        path = self.path.split("?")[0]
        data = self._read_body()

        if path == "/api/auth/login":
            result = handle_login(data)
            sid = result.pop("sid", None)
            headers = {"Set-Cookie": f"sid={sid}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200"} if sid else None
            self._json(result, extra_headers=headers)
            return

        if path == "/api/auth/logout":
            handle_logout(self)
            self._json({"ok": True}, extra_headers={"Set-Cookie": "sid=; Path=/; HttpOnly; Max-Age=0"})
            return

        m = re.match(r"^/api/court/(\d+)/(.+)$", path)
        if m:
            self._handle_court_post(int(m.group(1)), m.group(2), data)
            return

        if path.startswith("/api/admin/"):
            self._handle_admin_post(path, data)
            return

        self._json({"error": "not found"}, 404)

    def _handle_court_post(self, cid: int, action: str, data: dict):
        if not check_auth(self, court_id=cid):
            self._json({"error": "unauthorized"}, 401)
            return
        s = SESSIONS.get(cid)
        if not s:
            self._json({"error": "Lapangan tidak ditemukan"}, 404)
            return

        if action == "start":
            self._json(s.start(data))
        elif action == "set-names":
            self._json(s.set_names(data.get("names", [])))
        elif action == "set-settings":
            self._json(s.set_settings(data))
        elif action == "event":
            self._json(s.event(data))
        elif action == "stop":
            if data.get("delay") is not None or data.get("auto"):
                self._json(s.schedule_stop(data.get("delay"), data.get("summary")))
            else:
                self._json(s.stop(data.get("summary")))
        elif action == "cancel-stop":
            self._json(s.cancel_stop())
        elif action == "reset-match":
            self._json(s.reset_match())
        elif action == "create-clips":
            self._handle_create_clips(cid, s, data)
        elif action == "test":
            self._json(s.test())
        elif action == "discover":
            self._json({"cameras": cari_kamera.discover()})
        elif action == "add-camera":
            self._json(add_camera(cid, data))
        elif action == "remove-camera":
            self._json(remove_camera(cid, data))
        elif action == "log-key":
            self._json(log_remote_signal(cid, data))
        elif action == "get-log-key":
            self._json({"signals": get_remote_signals(cid)})
        elif action == "clear-log-key":
            self._json(clear_remote_signals())
        else:
            self._json({"error": "not found"}, 404)

    def _handle_create_clips(self, cid: int, session, data: dict):
        sessions = get_court_media(cid)
        if not sessions:
            self._json({"error": "Tidak ada rekaman"}, 404)
            return
        req_folder = data.get("folder")
        target_sess = next((x for x in sessions if x["folder"] == req_folder), None) if req_folder else sessions[0]
        if not target_sess or not target_sess.get("main_video"):
            self._json({"error": "Sesi rekaman atau video tidak ditemukan"}, 404)
            return
        target_video = os.path.join(session._cfg["output_dir"], target_sess["folder"], target_sess["main_video"])
        if not os.path.isfile(target_video):
            self._json({"error": "File video tidak ditemukan"}, 404)
            return

        pre_roll = data.get("pre_roll")
        post_roll = data.get("post_roll")
        pre_val = float(pre_roll) if pre_roll is not None and str(pre_roll).strip() != "" else None
        post_val = float(post_roll) if post_roll is not None and str(post_roll).strip() != "" else None

        res = clipper.create_clips_for_video(
            target_video,
            dict(CFG),
            pre_roll=pre_val,
            post_roll=post_val,
            create_reel=data.get("create_reel"),
        )
        self._json({"ok": True, "result": res})

    def _handle_admin_post(self, path: str, data: dict):
        if not check_auth(self, required_role="admin"):
            self._json({"error": "unauthorized"}, 401)
            return

        if path == "/api/admin/config":
            try:
                if "courts" in data:
                    update_admin_court_configs(data["courts"])
                self._json({"ok": True})
            except Exception as e:
                self._json({"ok": False, "message": str(e)}, 500)
            return

        if path == "/api/admin/change-password":
            try:
                if data.get("type") == "admin":
                    new_pw = data.get("new_password", "")
                    if len(new_pw) < 6:
                        self._json({"ok": False, "message": "Password minimal 6 karakter"})
                        return
                    save_admin_password_hash(sha256(new_pw))
                elif data.get("type") == "court":
                    cid = str(data.get("court_id", ""))
                    new_pin = str(data.get("new_pin", ""))
                    if not re.match(r"^\d{4}$", new_pin):
                        self._json({"ok": False, "message": "PIN harus 4 digit angka"})
                        return
                    save_court_pin_hash(cid, sha256(new_pin))
                else:
                    self._json({"ok": False, "message": "Tipe tidak valid"})
                    return
                self._json({"ok": True})
            except Exception as e:
                self._json({"ok": False, "message": str(e)}, 500)
            return

        if path == "/api/admin/set-server-ip":
            new_ip = str(data.get("server_ip", "")).strip()
            save_server_ip(new_ip)
            self._json({"ok": True, "server_ip": new_ip, "base_url": get_base_url()})
            return

        if path == "/api/admin/set-clipping":
            clip_cfg = {
                "enabled": bool(data.get("enabled", True)),
                "pre_roll_seconds": float(data.get("pre_roll_seconds", 12.0)),
                "post_roll_seconds": float(data.get("post_roll_seconds", 4.0)),
                "create_reel": bool(data.get("create_reel", True)),
            }
            save_clipping_settings(clip_cfg)
            self._json({"ok": True, "clipping": clip_cfg})
            return

        self._json({"error": "not found"}, 404)


def run(argv=None):
    """Menjalankan CLI render manual atau HTTP server multi-lapangan."""
    args = argv if argv is not None else sys.argv

    if len(args) > 2 and args[1] == "--render":
        render_cfg = dict(CFG)
        court_cfgs = CFG.get("courts", [])
        if court_cfgs:
            render_cfg["overlay"] = court_cfgs[0].get("overlay", CFG.get("overlay", {}))
        if "--offset" in args:
            render_cfg["overlay"]["offset_seconds"] = float(args[args.index("--offset") + 1])
        out = overlay.render(args[2], render_cfg, progress=lambda p: print(f"\r  {p}%", end="", flush=True))
        print(f"\nSelesai: {out}")
        return

    ffmpeg_bin = CFG.get("ffmpeg", "ffmpeg")
    if not shutil.which(ffmpeg_bin) and not os.path.exists(ffmpeg_bin):
        print("PERINGATAN: ffmpeg tidak ditemukan. Papan skor tetap jalan, tapi rekaman tidak bisa dibuat.")
        print("Windows: buka Command Prompt lalu ketik  winget install ffmpeg")

    init_sessions()
    start_cleanup_daemon()

    port = int(CFG.get("port", 8080))
    srv = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print("=" * 60)
    print(" Papan Skor Padel + CCTV — Multi-Lapangan")
    print(f" Login Admin  : http://localhost:{port}/login")
    print(f" Dashboard    : http://localhost:{port}/dashboard")
    for c in CFG.get("courts", []):
        print(f" {c.get('name', 'Lapangan'):12s} : http://localhost:{port}/court/{c.get('id')}")
    for ip in local_ips():
        print(f" Dari jaringan: http://{ip}:{port}")
    print(" Tekan Ctrl+C untuk berhenti.")
    print("=" * 60)
    print(" Pengaturan sensitif (.env) & konfigurasi (config.json) aktif.")
    print("=" * 60)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nMenutup… rekaman yang sedang berjalan disimpan dulu.")
        for s in SESSIONS.values():
            s.stop("dihentikan")
        srv.server_close()
