"""
Manajemen konfigurasi aplikasi (`.env` + `config.json`).

Kredensial sensitif (password admin, PIN lapangan, URL RTSP kamera, IP server, port)
disimpan terpisah di file `.env`, sedangkan pengaturan non-sensitif (nama lapangan,
format pertandingan, overlay video, clipping, retensi storage) disimpan di `config.json`.
"""
import hashlib
import json
import os
import re
import shutil
import threading

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_PATH = os.path.join(BASE, ".env")
CONFIG_PATH = os.path.join(BASE, "config.json")
PLACEHOLDER = "PASSWORD@"

_cfg_lock = threading.Lock()
_env_cache = {}

COURT_DEFAULT = {
    "post_roll_seconds": 15,
    "audio": True,
    "overlay": {
        "enabled": True,
        "position": "top-left",
        "scale": 1.0,
        "offset_seconds": 0.0,
        "preset": "veryfast",
        "crf": 21,
        "keep_original": True,
    },
    "match_rules": {
        "mode": "golden",
        "bestOf": 3,
        "games": 6,
        "superTb": False,
        "target": 24,
    },
}

CLIPPING_DEFAULT = {
    "enabled": True,
    "pre_roll_seconds": 12.0,
    "post_roll_seconds": 4.0,
    "create_reel": True,
}

AUTO_CLIPPING_DEFAULT = {
    "enabled": True,
    "sensitivity": 0.5,
    "max_clips": 5,
    "pre_roll_seconds": 10.0,
    "post_roll_seconds": 4.0,
    "min_gap_seconds": 15,
    "output_format": "landscape",  # "landscape" (16:9) | "vertical" (9:16) | "square" (1:1)
    "crop_focus": "center",        # "left" | "center" | "right"
    "create_reel": True,
}

STORAGE_DEFAULT = {
    "retention_days": 7,
    "min_free_gb": 15.0,
}

GLOBAL_DEFAULTS = {
    "port": 8080,
    "ffmpeg": "ffmpeg",
    "ffprobe": "ffprobe",
}


def sha256(s: str) -> str:
    """Menghasilkan hash SHA-256 hex dari string."""
    return hashlib.sha256(str(s).encode("utf-8")).hexdigest()


def _parse_env_line(line: str):
    """Parse satu baris .env menjadi (key, value) atau None jika komentar/kosong."""
    stripped = line.strip()
    if not stripped or stripped.startswith("#"):
        return None
    if stripped.startswith("export "):
        stripped = stripped[7:].strip()
    if "=" not in stripped:
        return None
    key, raw_val = stripped.split("=", 1)
    key = key.strip()
    if not key:
        return None
    val = raw_val.strip()
    if len(val) >= 2 and val[0] == val[-1] and val[0] in ('"', "'"):
        quote_char = val[0]
        val = val[1:-1]
        if quote_char == '"':
            val = val.replace('\\"', '"').replace("\\\\", "\\")
    else:
        val = re.sub(r"\s+#.*$", "", val).strip()
    return key, val


def _format_env_value(val: str) -> str:
    """Format nilai untuk ditulis aman ke file .env."""
    s = "" if val is None else str(val)
    needs_quotes = (
        s != s.strip()
        or " #" in s
        or s.startswith("#")
        or "\n" in s
        or '"' in s
        or "'" in s
    )
    if needs_quotes:
        escaped = s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
        return f'"{escaped}"'
    return s


def load_env(path: str = None) -> dict:
    """Memuat file .env ke cache internal dan `os.environ` tanpa library eksternal."""
    target_path = path or ENV_PATH
    parsed = {}
    if os.path.isfile(target_path):
        with open(target_path, encoding="utf-8") as f:
            for line in f:
                res = _parse_env_line(line)
                if res:
                    k, v = res
                    parsed[k] = v
                    os.environ.setdefault(k, v)
    _env_cache.clear()
    _env_cache.update(parsed)
    return dict(parsed)


def get_env(key: str, default: str = "") -> str:
    """Ambil nilai environment variable (prioritas OS env > file .env > default)."""
    if key in os.environ:
        return os.environ[key]
    return _env_cache.get(key, default)


def set_env_vars(updates: dict, remove_keys=None, path: str = None):
    """Perbarui dan hapus key tertentu di `.env` sambil menjaga komentar & urutan baris."""
    target_path = path or ENV_PATH
    remove_set = set(remove_keys or [])
    with _cfg_lock:
        lines = []
        if os.path.isfile(target_path):
            with open(target_path, encoding="utf-8") as f:
                lines = f.read().splitlines()

        remaining = dict(updates or {})
        new_lines = []

        for line in lines:
            parsed = _parse_env_line(line)
            if not parsed:
                new_lines.append(line)
                continue
            k, _ = parsed
            if k in remove_set and k not in remaining:
                _env_cache.pop(k, None)
                os.environ.pop(k, None)
                continue
            if k in remaining:
                val_str = str(remaining.pop(k))
                new_lines.append(f"{k}={_format_env_value(val_str)}")
                _env_cache[k] = val_str
                os.environ[k] = val_str
            else:
                new_lines.append(line)

        for k, v in remaining.items():
            val_str = str(v)
            new_lines.append(f"{k}={_format_env_value(val_str)}")
            _env_cache[k] = val_str
            os.environ[k] = val_str

        for k in remove_set:
            if k not in (updates or {}):
                _env_cache.pop(k, None)
                os.environ.pop(k, None)

        content = "\n".join(new_lines).rstrip("\n") + "\n" if new_lines else ""
        with open(target_path, "w", encoding="utf-8") as f:
            f.write(content)


def find_binary(bin_name: str) -> str:
    """Cari file executable di folder project, PATH, atau direktori WinGet."""
    exe_name = bin_name if bin_name.endswith(".exe") else f"{bin_name}.exe"
    for candidate in (os.path.join(BASE, exe_name), os.path.join(BASE, bin_name)):
        if os.path.isfile(candidate):
            return candidate
    which_bin = shutil.which(bin_name) or shutil.which(exe_name)
    if which_bin:
        return which_bin
    local_appdata = os.environ.get("LOCALAPPDATA", "")
    if local_appdata:
        winget_link = os.path.join(local_appdata, "Microsoft", "WinGet", "Links", exe_name)
        if os.path.isfile(winget_link):
            return winget_link
        packages_dir = os.path.join(local_appdata, "Microsoft", "WinGet", "Packages")
        if os.path.isdir(packages_dir):
            for root, _, files in os.walk(packages_dir):
                if exe_name in files:
                    return os.path.join(root, exe_name)
    return bin_name


def _default_json_config() -> dict:
    """Struktur default config.json non-sensitif."""
    return {
        "clipping": dict(CLIPPING_DEFAULT),
        "auto_clipping": dict(AUTO_CLIPPING_DEFAULT),
        "storage": dict(STORAGE_DEFAULT),
        "courts": [
            {
                "id": i,
                "name": f"Lapangan {i}",
                "output_dir": f"rekaman/lapangan{i}",
                "post_roll_seconds": COURT_DEFAULT["post_roll_seconds"],
                "audio": COURT_DEFAULT["audio"],
                "overlay": dict(COURT_DEFAULT["overlay"]),
                "cameras": [{"name": "Kamera Utama", "env_key": f"COURT_{i}_CAM_1_RTSP"}],
                "names": ["Tim A", "Tim B"],
                "match_rules": dict(COURT_DEFAULT["match_rules"]),
            }
            for i in range(1, 4)
        ],
    }


def _resolve_court_cameras(cid: int, raw_cams: list) -> list:
    """Gabungkan metadata kamera dari config.json dengan URL RTSP dari .env."""
    resolved = []
    seen_slots = set()

    for idx, cam in enumerate(raw_cams or [], 1):
        env_rtsp_key = cam.get("env_key") or f"COURT_{cid}_CAM_{idx}_RTSP"
        env_name_key = f"COURT_{cid}_CAM_{idx}_NAME"
        rtsp = get_env(env_rtsp_key).strip() or (cam.get("rtsp") or "").strip()
        name = get_env(env_name_key).strip() or cam.get("name") or f"Kamera {idx}"
        seen_slots.add(env_rtsp_key)
        if rtsp:
            resolved.append({"name": name, "rtsp": rtsp, "env_key": env_rtsp_key})

    # Cek jika ada kamera tambahan di .env yang belum tercatat di config.json
    extra_pattern = re.compile(rf"^COURT_{cid}_CAM_(\d+)_RTSP$")
    extra_indices = []
    for key in set(_env_cache.keys()) | set(os.environ.keys()):
        m = extra_pattern.match(key)
        if m and key not in seen_slots:
            extra_indices.append((int(m.group(1)), key))

    for idx, env_rtsp_key in sorted(extra_indices):
        rtsp = get_env(env_rtsp_key).strip()
        if not rtsp:
            continue
        name = get_env(f"COURT_{cid}_CAM_{idx}_NAME").strip() or f"Kamera {idx}"
        resolved.append({"name": name, "rtsp": rtsp, "env_key": env_rtsp_key})

    return resolved


def load_config() -> dict:
    """Memuat `.env` + `config.json` lalu menyiapkan direktori, font, dan binary."""
    load_env()

    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, encoding="utf-8") as f:
            cfg = json.load(f)
    else:
        cfg = _default_json_config()
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2, ensure_ascii=False)
        print("config.json dibuat dari konfigurasi default.")

    # Network & binary settings (.env meng-override config.json jika diset)
    port_env = get_env("PORT").strip()
    cfg["port"] = int(port_env) if port_env.isdigit() else int(cfg.get("port", GLOBAL_DEFAULTS["port"]))

    server_ip_env = get_env("SERVER_IP").strip()
    if server_ip_env:
        cfg["server_ip"] = server_ip_env
    elif "server_ip" not in cfg:
        cfg["server_ip"] = ""

    base_url_env = get_env("BASE_URL").strip()
    if base_url_env:
        cfg["base_url"] = base_url_env

    cfg["ffmpeg"] = get_env("FFMPEG_PATH").strip() or cfg.get("ffmpeg", GLOBAL_DEFAULTS["ffmpeg"])
    cfg["ffprobe"] = get_env("FFPROBE_PATH").strip() or cfg.get("ffprobe", GLOBAL_DEFAULTS["ffprobe"])

    # Clipping, Auto-Clipping & Storage defaults
    clip_cfg = dict(CLIPPING_DEFAULT)
    clip_cfg.update(cfg.get("clipping") or {})
    cfg["clipping"] = clip_cfg

    auto_cfg = dict(AUTO_CLIPPING_DEFAULT)
    auto_cfg.update(cfg.get("auto_clipping") or {})
    cfg["auto_clipping"] = auto_cfg

    storage_cfg = dict(STORAGE_DEFAULT)
    storage_cfg.update(cfg.get("storage") or {})
    if get_env("STORAGE_RETENTION_DAYS").strip():
        storage_cfg["retention_days"] = float(get_env("STORAGE_RETENTION_DAYS"))
    if get_env("STORAGE_MIN_FREE_GB").strip():
        storage_cfg["min_free_gb"] = float(get_env("STORAGE_MIN_FREE_GB"))
    cfg["storage"] = storage_cfg

    # Auth resolution (prioritas: plaintext di .env -> hash di .env -> config.json -> default)
    json_auth = cfg.get("auth") or {}
    admin_user = get_env("ADMIN_USERNAME").strip() or json_auth.get("admin_username", "admin")
    admin_pw_plain = get_env("ADMIN_PASSWORD")
    admin_pw_hash = get_env("ADMIN_PASSWORD_HASH").strip()
    if admin_pw_plain:
        resolved_admin_hash = sha256(admin_pw_plain)
    elif admin_pw_hash:
        resolved_admin_hash = admin_pw_hash
    else:
        resolved_admin_hash = json_auth.get("admin_password_hash") or sha256("admin123")

    courts_auth = {}
    for court_cfg in cfg.get("courts", []):
        cid = court_cfg.get("id", 1)
        cid_str = str(cid)
        cname = court_cfg.get("name", f"Lapangan {cid}")
        pin_plain = get_env(f"COURT_{cid}_PIN").strip()
        pin_hash = get_env(f"COURT_{cid}_PIN_HASH").strip()
        json_pin_hash = json_auth.get("courts", {}).get(cid_str, {}).get("pin_hash")
        if pin_plain:
            resolved_pin_hash = sha256(pin_plain)
        elif pin_hash:
            resolved_pin_hash = pin_hash
        else:
            resolved_pin_hash = json_pin_hash or sha256(str(cid) * 4)
        courts_auth[cid_str] = {"pin_hash": resolved_pin_hash, "name": cname}

    cfg["auth"] = {
        "admin_username": admin_user,
        "admin_password_hash": resolved_admin_hash,
        "courts": courts_auth,
    }

    # Resolve per-court settings, output directories, cameras, and fonts
    fonts_dir = os.path.join(BASE, "fonts")
    for court_cfg in cfg.get("courts", []):
        cid = court_cfg.get("id", 1)
        out = court_cfg.get("output_dir", f"rekaman/lapangan{cid}")
        court_cfg["output_dir"] = out if os.path.isabs(out) else os.path.join(BASE, out)
        os.makedirs(court_cfg["output_dir"], exist_ok=True)
        if os.path.isdir(fonts_dir):
            shutil.copytree(fonts_dir, os.path.join(court_cfg["output_dir"], "_fonts"), dirs_exist_ok=True)

        ov = dict(COURT_DEFAULT["overlay"])
        ov.update(court_cfg.get("overlay") or {})
        court_cfg["overlay"] = ov

        mr = dict(COURT_DEFAULT["match_rules"])
        mr.update(court_cfg.get("match_rules") or {})
        court_cfg["match_rules"] = mr

        court_cfg.setdefault("names", ["Tim A", "Tim B"])
        court_cfg["cameras"] = _resolve_court_cameras(cid, court_cfg.get("cameras"))

    # Locate ffmpeg / ffprobe & inject into PATH if found locally/WinGet
    for key in ("ffmpeg", "ffprobe"):
        found = find_binary(cfg.get(key, key))
        if found and os.path.isfile(found):
            cfg[key] = found
            bin_dir = os.path.dirname(found)
            if bin_dir and bin_dir not in os.environ.get("PATH", ""):
                os.environ["PATH"] = bin_dir + os.pathsep + os.environ.get("PATH", "")

    return cfg


CFG = load_config()


def _update_json_config(updater_fn):
    """Helper thread-safe untuk membaca & menulis config.json tanpa menyisakan rahasia."""
    with _cfg_lock:
        if os.path.exists(CONFIG_PATH):
            with open(CONFIG_PATH, encoding="utf-8") as f:
                raw = json.load(f)
        else:
            raw = _default_json_config()
        updater_fn(raw)
        # Pastikan kredensial & server_ip tidak ikut tersimpan ke config.json
        raw.pop("auth", None)
        raw.pop("server_ip", None)
        raw.pop("base_url", None)
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(raw, f, indent=2, ensure_ascii=False)


def _sanitized_camera_refs(court_id: int, cams: list) -> list:
    return [
        {"name": cam.get("name", f"Kamera {idx}"), "env_key": f"COURT_{court_id}_CAM_{idx}_RTSP"}
        for idx, cam in enumerate(cams, 1)
    ]


def save_cameras(court_id: int, cams: list):
    """Simpan RTSP kamera ke `.env` dan metadata kamera ke `config.json`."""
    updates = {}
    for idx, cam in enumerate(cams, 1):
        updates[f"COURT_{court_id}_CAM_{idx}_NAME"] = cam.get("name", f"Kamera {idx}")
        updates[f"COURT_{court_id}_CAM_{idx}_RTSP"] = cam.get("rtsp", "")

    # Bersihkan key kamera lama yang melebihi jumlah kamera baru
    remove_keys = []
    cam_key_pat = re.compile(rf"^COURT_{court_id}_CAM_(\d+)_(RTSP|NAME)$")
    for k in list(_env_cache.keys()) + list(os.environ.keys()):
        m = cam_key_pat.match(k)
        if m and int(m.group(1)) > len(cams):
            remove_keys.append(k)
    set_env_vars(updates, remove_keys=remove_keys)

    cam_refs = _sanitized_camera_refs(court_id, cams)

    def _apply(raw):
        for c in raw.get("courts", []):
            if c.get("id") == court_id:
                c["cameras"] = cam_refs
                break

    _update_json_config(_apply)

    in_mem = [
        {"name": cam.get("name", f"Kamera {idx}"), "rtsp": cam.get("rtsp", ""), "env_key": f"COURT_{court_id}_CAM_{idx}_RTSP"}
        for idx, cam in enumerate(cams, 1)
    ]
    for c in CFG.get("courts", []):
        if c.get("id") == court_id:
            c["cameras"] = in_mem


def save_court_settings(court_id: int, rules=None, names=None):
    """Simpan pengaturan format pertandingan dan/atau nama tim untuk satu lapangan."""
    def _apply(raw):
        for c in raw.get("courts", []):
            if c.get("id") == court_id:
                if rules is not None:
                    c["match_rules"] = rules
                if names is not None:
                    c["names"] = names
                break

    _update_json_config(_apply)

    for c in CFG.get("courts", []):
        if c.get("id") == court_id:
            if rules is not None:
                c["match_rules"] = rules
            if names is not None:
                c["names"] = names


def save_court_names(court_id: int, names):
    """Alias kompatibilitas untuk menyimpan nama tim saja."""
    save_court_settings(court_id, names=names)


def update_admin_court_configs(courts_updates: list):
    """Perbarui nama lapangan dan pengaturan overlay dari Dashboard Admin."""
    def _apply(raw):
        for upd in courts_updates:
            cid = upd.get("id")
            for c in raw.get("courts", []):
                if c.get("id") == cid:
                    if "name" in upd:
                        c["name"] = upd["name"]
                    if "overlay" in upd:
                        c.setdefault("overlay", {}).update(upd["overlay"])
                    break

    _update_json_config(_apply)

    for upd in courts_updates:
        cid = upd.get("id")
        for cc in CFG.get("courts", []):
            if cc.get("id") == cid:
                if "name" in upd:
                    cc["name"] = upd["name"]
                    CFG.get("auth", {}).get("courts", {}).get(str(cid), {})["name"] = upd["name"]
                if "overlay" in upd:
                    cc.setdefault("overlay", {}).update(upd["overlay"])


def save_server_ip(server_ip: str):
    """Simpan override SERVER_IP ke `.env` dan memory."""
    set_env_vars({"SERVER_IP": server_ip})
    _update_json_config(lambda _raw: None)
    CFG["server_ip"] = server_ip


def save_clipping_settings(clip_cfg: dict):
    """Simpan pengaturan pemotongan klip highlight ke `config.json`."""
    _update_json_config(lambda raw: raw.__setitem__("clipping", clip_cfg))
    CFG["clipping"] = clip_cfg


def save_auto_clipping_settings(auto_cfg: dict):
    """Simpan pengaturan Auto-Clip AI ke `config.json`."""
    merged = dict(AUTO_CLIPPING_DEFAULT)
    merged.update(CFG.get("auto_clipping") or {})
    merged.update(auto_cfg or {})
    _update_json_config(lambda raw: raw.__setitem__("auto_clipping", merged))
    CFG["auto_clipping"] = merged


def save_admin_password_hash(new_hash: str):
    """Simpan hash password admin ke `.env` dan bersihkan plaintext jika ada."""
    set_env_vars({"ADMIN_PASSWORD_HASH": new_hash}, remove_keys=["ADMIN_PASSWORD"])
    _update_json_config(lambda _raw: None)
    CFG.setdefault("auth", {})["admin_password_hash"] = new_hash


def save_court_pin_hash(court_id: str, new_hash: str):
    """Simpan hash PIN lapangan ke `.env` dan bersihkan plaintext PIN jika ada."""
    cid = str(court_id)
    set_env_vars({f"COURT_{cid}_PIN_HASH": new_hash}, remove_keys=[f"COURT_{cid}_PIN"])
    _update_json_config(lambda _raw: None)
    CFG.setdefault("auth", {}).setdefault("courts", {}).setdefault(cid, {})["pin_hash"] = new_hash


def mask_rtsp(url: str) -> str:
    """Sembunyikan password pada URL RTSP untuk log maupun respons API publik."""
    return re.sub(r"(rtsp://[^:/@]+):[^@]*@", r"\1:***@", str(url))


def get_safe_public_config() -> dict:
    """Kembalikan salinan konfigurasi tanpa hash password/PIN dan tanpa password RTSP."""
    safe_cfg = dict(CFG)
    safe_auth = dict(safe_cfg.get("auth", {}))
    safe_auth.pop("admin_password_hash", None)
    safe_courts_auth = {}
    for cid, cv in safe_auth.get("courts", {}).items():
        safe_courts_auth[cid] = {k: v for k, v in cv.items() if k != "pin_hash"}
    safe_auth["courts"] = safe_courts_auth
    safe_cfg["auth"] = safe_auth

    safe_courts = []
    for c in CFG.get("courts", []):
        cc = dict(c)
        cc["cameras"] = [
            {**cam, "rtsp": mask_rtsp(cam.get("rtsp", ""))}
            for cam in c.get("cameras", [])
        ]
        safe_courts.append(cc)
    safe_cfg["courts"] = safe_courts
    safe_cfg["clipping"] = CFG.get("clipping", dict(CLIPPING_DEFAULT))
    safe_cfg["auto_clipping"] = CFG.get("auto_clipping", dict(AUTO_CLIPPING_DEFAULT))
    return safe_cfg
