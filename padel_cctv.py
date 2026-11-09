#!/usr/bin/env python3
"""
Papan Skor Padel + Perekam CCTV — Multi-Lapangan (v2)
------------------------------------------------------
Menjalankan papan skor di browser dan merekam stream RTSP dari CCTV
untuk 3 lapangan sekaligus. Setiap lapangan punya session, kamera, dan
konfigurasi sendiri. Dilengkapi sistem login (admin + PIN per lapangan).

Butuh: Python 3.8+ dan ffmpeg (tanpa library Python tambahan).
Jalankan:  python padel_cctv.py
Buka:      http://localhost:8080
"""
import datetime
import hashlib
import json
import os
import queue
import re
import secrets
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE, "config.json")

COURT_DEFAULT = {
    "post_roll_seconds": 15,
    "audio": True,
    "overlay": {
        "enabled": True, "position": "top-left", "scale": 1.0,
        "offset_seconds": 0.0, "preset": "veryfast", "crf": 21, "keep_original": True
    },
    "match_rules": {
        "mode": "golden",
        "bestOf": 3,
        "games": 6,
        "superTb": False,
        "target": 24
    }
}

GLOBAL_DEFAULTS = {
    "port": 8080,
    "ffmpeg": "ffmpeg",
    "ffprobe": "ffprobe",
}


def _sha256(s):
    return hashlib.sha256(s.encode()).hexdigest()


def find_binary(bin_name):
    """Cari file executable di folder project, PATH, atau direktori WinGet."""
    exe_name = bin_name if bin_name.endswith(".exe") else f"{bin_name}.exe"
    # 1. Folder project
    for candidate in [os.path.join(BASE, exe_name), os.path.join(BASE, bin_name)]:
        if os.path.isfile(candidate):
            return candidate
    # 2. PATH sistem
    which_bin = shutil.which(bin_name) or shutil.which(exe_name)
    if which_bin:
        return which_bin
    # 3. WinGet Links
    local_appdata = os.environ.get("LOCALAPPDATA", "")
    if local_appdata:
        winget_link = os.path.join(local_appdata, "Microsoft", "WinGet", "Links", exe_name)
        if os.path.isfile(winget_link):
            return winget_link
        # 4. WinGet Packages
        packages_dir = os.path.join(local_appdata, "Microsoft", "WinGet", "Packages")
        if os.path.isdir(packages_dir):
            for root, _, files in os.walk(packages_dir):
                if exe_name in files:
                    return os.path.join(root, exe_name)
    return bin_name


def load_config():
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, encoding="utf-8") as f:
            cfg = json.load(f)
    else:
        # Generate fresh config with hashed credentials
        cfg = {
            "port": 8080,
            "ffmpeg": "ffmpeg",
            "ffprobe": "ffprobe",
            "auth": {
                "admin_username": "admin",
                "admin_password_hash": _sha256("admin123"),
                "courts": {
                    "1": {"pin_hash": _sha256("1111"), "name": "Lapangan 1"},
                    "2": {"pin_hash": _sha256("2222"), "name": "Lapangan 2"},
                    "3": {"pin_hash": _sha256("3333"), "name": "Lapangan 3"},
                },
            },
            "courts": [
                {
                    "id": i,
                    "name": f"Lapangan {i}",
                    "output_dir": f"rekaman/lapangan{i}",
                    **COURT_DEFAULT,
                    "cameras": [
                        {"name": "Kamera Utama",
                         "rtsp": f"rtsp://admin:PASSWORD@192.168.1.{63+i}:554/Streaming/Channels/101"}
                    ],
                }
                for i in range(1, 4)
            ],
        }
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2, ensure_ascii=False)
        print("config.json dibuat dengan kredensial default.")

    # Resolve output_dir per court
    for court_cfg in cfg.get("courts", []):
        out = court_cfg.get("output_dir", f"rekaman/lapangan{court_cfg.get('id',1)}")
        court_cfg["output_dir"] = out if os.path.isabs(out) else os.path.join(BASE, out)
        os.makedirs(court_cfg["output_dir"], exist_ok=True)
        # Copy fonts
        fonts = os.path.join(BASE, "fonts")
        if os.path.isdir(fonts):
            shutil.copytree(fonts, os.path.join(court_cfg["output_dir"], "_fonts"), dirs_exist_ok=True)
        # Merge overlay defaults
        ov = dict(COURT_DEFAULT["overlay"])
        ov.update(court_cfg.get("overlay") or {})
        court_cfg["overlay"] = ov
        # Merge match rules defaults
        mr = dict(COURT_DEFAULT["match_rules"])
        mr.update(court_cfg.get("match_rules") or {})
        court_cfg["match_rules"] = mr
        court_cfg.setdefault("names", ["Tim A", "Tim B"])

    # Deteksi ffmpeg / ffprobe di folder project, PATH, atau WinGet
    for key in ["ffmpeg", "ffprobe"]:
        found = find_binary(cfg.get(key, key))
        if found and os.path.isfile(found):
            cfg[key] = found
            bin_dir = os.path.dirname(found)
            if bin_dir and bin_dir not in os.environ.get("PATH", ""):
                os.environ["PATH"] = bin_dir + os.pathsep + os.environ.get("PATH", "")

    return cfg


CFG = load_config()
import overlay      # noqa: E402
import cari_kamera  # noqa: E402

# ── Auth session store ───────────────────────────────────────────────────────
AUTH_SESSIONS = {}   # sid → {role, court_id?, expires}
_auth_lock = threading.Lock()


def _cleanup_sessions():
    """Hapus session yang sudah expired (lazy)."""
    now = time.time()
    with _auth_lock:
        expired = [sid for sid, s in AUTH_SESSIONS.items() if s["expires"] < now]
        for sid in expired:
            del AUTH_SESSIONS[sid]


def check_auth(handler, required_role="any", court_id=None):
    """Return session dict jika valid, None jika tidak."""
    _cleanup_sessions()
    cookie_hdr = handler.headers.get("Cookie", "")
    sid = None
    for part in cookie_hdr.split(";"):
        part = part.strip()
        if part.startswith("sid="):
            sid = part[4:]
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


def handle_login(data):
    """Proses login, return dict hasil beserta sid jika sukses."""
    cfg_auth = CFG.get("auth", {})
    if data.get("type") == "admin":
        pw_hash = _sha256(data.get("password", ""))
        if pw_hash != cfg_auth.get("admin_password_hash", ""):
            return {"ok": False, "message": "Password salah"}
        sid = secrets.token_hex(16)
        with _auth_lock:
            AUTH_SESSIONS[sid] = {"role": "admin", "expires": time.time() + 43200}
        return {"ok": True, "role": "admin", "sid": sid}
    elif data.get("type") == "court":
        cid = str(data.get("court_id", ""))
        pin_hash = _sha256(str(data.get("pin", "")))
        court_auth = cfg_auth.get("courts", {}).get(cid)
        if not court_auth or pin_hash != court_auth.get("pin_hash", ""):
            return {"ok": False, "message": "PIN salah"}
        sid = secrets.token_hex(16)
        with _auth_lock:
            AUTH_SESSIONS[sid] = {"role": "court", "court_id": int(cid), "expires": time.time() + 43200}
        return {"ok": True, "role": "court", "court_id": int(cid), "sid": sid}
    return {"ok": False, "message": "Tipe login tidak valid"}


# ── Helpers ──────────────────────────────────────────────────────────────────
def slug(s, n=24):
    s = re.sub(r"[^A-Za-z0-9]+", "-", str(s)).strip("-")
    return s[:n] or "Tim"


def mask(url):
    return re.sub(r"(rtsp://[^:/@]+):[^@]*@", r"\1:***@", url)


# ── CameraRecorder ───────────────────────────────────────────────────────────
class CameraRecorder:
    """Merekam satu kamera. Jika stream putus, otomatis menyambung lagi ke file _partN."""

    def __init__(self, cam, court_cfg):
        self.name = cam.get("name", "Kamera")
        self.url = cam["rtsp"]
        self._court_cfg = court_cfg
        self.proc = None
        self.part = 1
        self.active = False
        self.files = []
        self.anchors = []
        self.error = ""
        self.base = ""
        self.log_path = ""

    def start(self, base):
        self.base = base
        self.part = 1
        self.files = []
        self.anchors = []
        self.error = ""
        self.active = True
        self.log_path = f"{base}_{slug(self.name)}.log"
        self._spawn()
        threading.Thread(target=self._watch, daemon=True).start()

    def _spawn(self):
        suffix = f"_part{self.part}" if self.part > 1 else ""
        out = f"{self.base}_{slug(self.name)}{suffix}.mp4"
        ffmpeg = CFG.get("ffmpeg", "ffmpeg")
        cmd = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
               "-rtsp_transport", "tcp", "-i", self.url,
               "-map", "0:v:0"]
        if self._court_cfg.get("audio", True):
            cmd += ["-map", "0:a:0?", "-c:a", "aac", "-b:a", "96k"]
        cmd += ["-c:v", "copy",
                "-movflags", "+frag_keyframe+empty_moov+default_base_moof",
                "-progress", "pipe:1", "-stats_period", "0.5", "-nostats",
                "-f", "mp4", out]
        log = open(self.log_path, "a", encoding="utf-8")
        log.write(f"\n[{datetime.datetime.now():%H:%M:%S}] mulai {mask(self.url)} -> {os.path.basename(out)}\n")
        log.flush()
        self.proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=log,
                                     text=True, bufsize=1)
        self.files.append(out)
        self.anchors.append(None)
        self.started_at = time.time()
        threading.Thread(target=self._progress, args=(self.proc, len(self.files) - 1), daemon=True).start()

    def _progress(self, proc, i):
        n = 0
        for line in proc.stdout:
            if line.startswith("out_time_us=") and n < 30:
                try:
                    us = int(line.split("=")[1])
                except ValueError:
                    continue
                if us <= 0:
                    continue
                a = time.time() - us / 1e6
                if i < len(self.anchors):
                    self.anchors[i] = a if self.anchors[i] is None else min(self.anchors[i], a)
                n += 1

    def _watch(self):
        while self.active:
            p = self.proc
            if p and p.poll() is not None and self.active:
                self.error = self._last_log_line() or f"ffmpeg berhenti (kode {p.returncode})"
                print(f"[{self.name}] stream terputus: {self.error}. Menyambung ulang…")
                time.sleep(3)
                if not self.active:
                    break
                last = self.files[-1]
                if not os.path.exists(last) or os.path.getsize(last) < 1024:
                    if os.path.exists(last):
                        os.remove(last)
                    self.files.pop()
                    self.anchors.pop()
                else:
                    self.part += 1
                self._spawn()
            elif p and p.poll() is None and time.time() - self.started_at > 5:
                self.error = ""
            time.sleep(1)

    def _last_log_line(self):
        try:
            with open(self.log_path, encoding="utf-8", errors="ignore") as f:
                lines = [ln.strip() for ln in f if ln.strip()]
            return lines[-1][:160] if lines else ""
        except OSError:
            return ""

    def stop(self):
        self.active = False
        p = self.proc
        if p and p.poll() is None:
            try:
                p.stdin.write("q")
                p.stdin.flush()
                p.wait(timeout=10)
            except Exception:
                p.terminate()
                try:
                    p.wait(timeout=5)
                except Exception:
                    p.kill()
        return [(f, a) for f, a in zip(self.files, self.anchors)
                if os.path.exists(f) and os.path.getsize(f) > 1024]

    def status(self):
        alive = bool(self.active and self.proc and self.proc.poll() is None)
        size = 0
        if self.files and os.path.exists(self.files[-1]):
            size = os.path.getsize(self.files[-1])
        recording = alive and size > 0
        return {"name": self.name, "recording": recording,
                "connecting": alive and not recording,
                "placeholder": "PASSWORD@" in self.url,
                "error": self.error,
                "file": os.path.basename(self.files[-1]) if self.files else "",
                "mb": round(size / 1e6, 1)}


def _save_court_state(court_id, state):
    """Menyimpan status skor pertandingan terakhir ke file json agar tahan mati lampu / restart."""
    fpath = os.path.join(BASE, f"court_{court_id}_state.json")
    if not state or not state.get("started"):
        if os.path.exists(fpath):
            try:
                os.remove(fpath)
            except OSError:
                pass
        return
    try:
        with open(fpath, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2, ensure_ascii=False)
    except OSError as e:
        print(f"Gagal menyimpan court state: {e}")


def _load_court_state(court_id):
    """Memuat status skor pertandingan terakhir saat server mulai / restart."""
    fpath = os.path.join(BASE, f"court_{court_id}_state.json")
    if os.path.exists(fpath):
        try:
            with open(fpath, encoding="utf-8") as f:
                return json.load(f)
        except (OSError, json.JSONDecodeError):
            return None
    return None


# ── Session ──────────────────────────────────────────────────────────────────
class Session:
    def __init__(self, court_cfg):
        self._cfg = court_cfg
        self.lock = threading.Lock()
        self.recorders = [CameraRecorder(c, court_cfg) for c in court_cfg.get("cameras", [])]
        self.recording = False
        self.t0 = 0
        self.base = ""
        self.events_path = ""
        self.stop_timer = None
        self.stop_at = 0
        self.recent = []
        self.bookmarks = []
        self.match_state = _load_court_state(court_cfg.get("id"))
        self._render_q = None  # set externally after RenderQueue created

    def reset_match(self):
        with self.lock:
            self.match_state = None
            self.bookmarks = []
            fpath = os.path.join(BASE, f"court_{self._cfg['id']}_state.json")
            if os.path.exists(fpath):
                try:
                    os.remove(fpath)
                except OSError:
                    pass
            print(f"🔄 RESET MATCH STATE [{self._cfg['name']}]: Siap untuk pertandingan baru")
            return {"ok": True}

    def _save_bookmarks_file(self, target_base=None):
        base = target_base or self.base
        if not base or not self.bookmarks:
            return
        klip_path = base + "_klip.json"
        try:
            payload = {
                "court_id": self._cfg["id"],
                "court_name": self._cfg["name"],
                "names": self._cfg.get("names", ["Tim A", "Tim B"]),
                "total_bookmarks": len(self.bookmarks),
                "bookmarks": list(self.bookmarks)
            }
            with open(klip_path, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2, ensure_ascii=False)
        except OSError as e:
            print(f"Gagal menulis file _klip.json: {e}")

    def start(self, info):
        with self.lock:
            if self.recording:
                return {"ok": True, "already": True}
            self.bookmarks = []
            if info.get("state") and isinstance(info["state"], dict):
                self.match_state = info["state"]
                _save_court_state(self._cfg["id"], self.match_state)
            names = info.get("names") or self._cfg.get("names") or ["Tim A", "Tim B"]
            # Sinkronkan format aturan pertandingan jika dikirimkan di start
            rules = self._cfg.setdefault("match_rules", dict(COURT_DEFAULT["match_rules"]))
            if "mode" in info:
                rules["mode"] = info["mode"]
            if "match_rules" in info and isinstance(info["match_rules"], dict):
                rules.update({k: v for k, v in info["match_rules"].items() if k in ("mode", "bestOf", "games", "superTb", "target")})
            _save_court_settings(self._cfg["id"], rules=rules, names=names)
            stamp = datetime.datetime.now()
            # Buat folder khusus per pertandingan: [YYYY-MM-DD_HH-MM-SS]_[Nama-Tim]
            folder_name = f"{stamp:%Y-%m-%d_%H-%M-%S}_{slug(names[0])}-vs-{slug(names[1])}"
            self.match_dir = os.path.join(self._cfg["output_dir"], folder_name)
            os.makedirs(self.match_dir, exist_ok=True)
            # Cek kapasitas harddisk sebelum rekam
            threading.Thread(target=clean_old_recordings, daemon=True).start()
            self.base = os.path.join(
                self.match_dir,
                f"{stamp:%Y%m%d_%H%M%S}_{slug(names[0])}-vs-{slug(names[1])}"
            )
            for r in self.recorders:
                r.start(self.base)
            self.recording = True
            self.has_board = True
            self.t0 = time.time()
            self.events_path = self.base + "_poin.jsonl"
            self._write_event({"event": "mulai", "names": names,
                               "mode": info.get("mode"),
                               "waktu": stamp.isoformat(timespec="seconds")})
            print(f"● REKAM [{self._cfg['name']}]: {folder_name}")
            return {"ok": True, "folder": folder_name}

    def _write_event(self, data):
        if not self.events_path:
            return
        now = time.time()
        data = {"t": round(now - self.t0, 1), "w": round(now, 3), **data}
        with open(self.events_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(data, ensure_ascii=False) + "\n")

    def set_settings(self, data):
        with self.lock:
            rules = self._cfg.setdefault("match_rules", dict(COURT_DEFAULT["match_rules"]))
            # Proteksi Human Error: Aturan format pertandingan tidak boleh diubah saat pertandingan sedang merekam
            if not self.recording:
                if "mode" in data and data["mode"] in ("golden", "adv", "star", "americano"):
                    rules["mode"] = data["mode"]
                if "bestOf" in data:
                    try:
                        rules["bestOf"] = int(data["bestOf"])
                    except (ValueError, TypeError):
                        pass
                if "games" in data:
                    try:
                        rules["games"] = int(data["games"])
                    except (ValueError, TypeError):
                        pass
                if "superTb" in data:
                    rules["superTb"] = bool(data["superTb"])
                if "target" in data:
                    try:
                        rules["target"] = int(data["target"])
                    except (ValueError, TypeError):
                        pass
            clean_names = None
            if data.get("names") and len(data["names"]) >= 2:
                clean_names = [str(data["names"][0]).strip() or "Tim A", str(data["names"][1]).strip() or "Tim B"]
                self._cfg["names"] = clean_names
            _save_court_settings(self._cfg["id"], rules=rules, names=clean_names)
            if self.recording and clean_names:
                self._write_event({"event": "ganti_nama", "names": clean_names})
            return {"ok": True, "settings": rules, "names": self._cfg.get("names"), "locked": self.recording}

    def set_names(self, names):
        with self.lock:
            if names and len(names) >= 2:
                clean_names = [str(names[0]).strip() or "Tim A", str(names[1]).strip() or "Tim B"]
                self._cfg["names"] = clean_names
                _save_court_names(self._cfg["id"], clean_names)
                if self.recording:
                    self._write_event({"event": "ganti_nama", "names": clean_names})
                return {"ok": True, "names": clean_names}
            return {"ok": False, "message": "Format nama pemain tidak valid"}

    def event(self, data):
        with self.lock:
            if data.get("event") == "ganti_nama" and data.get("names"):
                return self.set_names(data["names"])
            # Feature 4: Simpan state skor terkini di server (tahan restart/refresh)
            if data.get("state") and isinstance(data["state"], dict):
                self.match_state = data["state"]
                _save_court_state(self._cfg["id"], self.match_state)
            if self.recording:
                if data.get("board") and data.get("event") != "papan":
                    self.has_board = True
                ev = data.get("event")
                if ev in ("bookmark", "mark", "highlight"):
                    now = time.time()
                    elapsed = round(now - self.t0, 1)
                    bm = {
                        "t": elapsed,
                        "time_str": f"{int(elapsed // 60):02d}:{int(elapsed % 60):02d}",
                        "skor": data.get("skor", ""),
                        "note": data.get("note", "highlight")
                    }
                    self.bookmarks.append(bm)
                    self._save_bookmarks_file()
                    print(f"❤️ PENANDA MOMEN KLIP [{self._cfg['name']}]: #{len(self.bookmarks)} pada {bm['time_str']} (Skor: {bm['skor']})")
                self._write_event(data)
                return {"ok": True, "bookmarks": len(self.bookmarks)}
        return {"ok": True}

    def schedule_stop(self, delay, summary):
        with self.lock:
            if not self.recording:
                return {"ok": False}
            self._cancel()
            self._write_event({"event": "selesai", "skor": summary})
            delay = max(0, float(delay if delay is not None else self._cfg.get("post_roll_seconds", 15)))
            self.stop_at = time.time() + delay
            self.stop_timer = threading.Timer(delay, self.stop, kwargs={"summary": summary})
            self.stop_timer.daemon = True
            self.stop_timer.start()
            return {"ok": True, "in": delay}

    def _cancel(self):
        if self.stop_timer:
            self.stop_timer.cancel()
        self.stop_timer = None
        self.stop_at = 0

    def cancel_stop(self):
        with self.lock:
            had = self.stop_timer is not None
            self._cancel()
            if had:
                self._write_event({"event": "selesai dibatalkan"})
            return {"ok": True, "cancelled": had}

    def stop(self, summary=None):
        with self.lock:
            if not self.recording:
                return {"ok": True}
            self._cancel()
            self.recording = False
            vids = []
            for r in self.recorders:
                vids += r.stop()
            tag = ("_" + re.sub(r"[^0-9\-]+", "_", summary).strip("_")) if summary else ""
            newbase = self.base + tag

            def moved(f):
                if tag and f and f.startswith(self.base) and os.path.exists(f):
                    nf = newbase + f[len(self.base):]
                    try:
                        os.replace(f, nf)
                        return nf
                    except OSError:
                        pass
                return f

            for f, a in vids:
                self._write_event({"event": "video", "suffix": f[len(self.base):], "anchor": a})
            final, paths = [], []
            for f, a in vids:
                nf = moved(f)
                paths.append(nf)
                # Tampilkan relatif terhadap output_dir agar nama folder pertandingan terlihat jelas
                rel_name = os.path.relpath(nf, self._cfg["output_dir"]).replace("\\", "/")
                final.append(rel_name)
            for f in [self.events_path] + [r.log_path for r in self.recorders]:
                moved(f)
            # Simpan file daftar momen klip / bookmarks final
            if self.bookmarks:
                self._save_bookmarks_file(newbase)
            ov = self._cfg.get("overlay", {})
            if ov.get("enabled", True) and getattr(self, "has_board", False):
                rq = self._render_q
                if rq:
                    for pth in paths:
                        rq.add(pth)
            else:
                if paths:
                    def _clip_raw(p):
                        try:
                            import clipper
                            clipper.create_clips_for_video(p, dict(CFG))
                        except Exception as e:
                            print(f"⚠️ [Clipper] Gagal memotong klip: {e}")
                    threading.Thread(target=_clip_raw, args=(paths[0],), daemon=True).start()
            self.recent = (final + self.recent)[:8]
            self.events_path = ""
            print(f"■ SELESAI [{self._cfg['name']}]: {', '.join(final) or 'tidak ada video tersimpan'}")
            return {"ok": True, "files": final}

    def status(self):
        rq = self._render_q
        render_jobs = rq.status() if rq else []
        is_render_busy = any(j.get("state") in ("antre", "proses") for j in render_jobs)
        return {
            "court_id": self._cfg["id"],
            "court_name": self._cfg["name"],
            "names": self._cfg.get("names", ["Tim A", "Tim B"]),
            "settings": self._cfg.get("match_rules", COURT_DEFAULT["match_rules"]),
            "recording": self.recording,
            "renders": render_jobs,
            "render_busy": is_render_busy,
            "elapsed": round(time.time() - self.t0) if self.recording else 0,
            "stopping_in": max(0, round(self.stop_at - time.time())) if self.stop_at else None,
            "cameras": [r.status() for r in self.recorders],
            "bookmarks": list(self.bookmarks),
            "match_state": self.match_state,
            "recent": self.recent,
            "post_roll": self._cfg.get("post_roll_seconds", 15),
            "folder": self._cfg["output_dir"],
        }

    def test(self):
        res = []
        probe = CFG.get("ffprobe") or "ffprobe"
        for c in self._cfg.get("cameras", []):
            try:
                out = subprocess.run(
                    [probe, "-v", "error", "-rtsp_transport", "tcp",
                     "-select_streams", "v:0",
                     "-show_entries", "stream=codec_name,width,height",
                     "-of", "json", c["rtsp"]],
                    capture_output=True, text=True, timeout=15)
                if out.returncode == 0:
                    s = json.loads(out.stdout).get("streams", [{}])[0]
                    res.append({"name": c["name"], "ok": True,
                                "info": f"{s.get('codec_name','?')} {s.get('width','?')}×{s.get('height','?')}"})
                else:
                    res.append({"name": c["name"], "ok": False,
                                "info": (out.stderr.strip().splitlines() or ["gagal"])[-1][:160]})
            except subprocess.TimeoutExpired:
                res.append({"name": c["name"], "ok": False,
                            "info": "Tidak ada jawaban dari kamera (cek IP dan jaringan)"})
            except FileNotFoundError:
                res.append({"name": c["name"], "ok": False,
                            "info": "ffprobe tidak ditemukan. Pasang ffmpeg dulu."})
        return {"results": res}


# ── RenderQueue ──────────────────────────────────────────────────────────────
class RenderQueue:
    """Membuat video dengan papan skor satu per satu di latar belakang."""

    def __init__(self, court_cfg):
        self._court_cfg = court_cfg
        self.q = queue.Queue()
        self.jobs = []
        self.lock = threading.Lock()
        threading.Thread(target=self._run, daemon=True).start()

    def add(self, path):
        rel_file = os.path.relpath(path, self._court_cfg["output_dir"]).replace("\\", "/")
        job = {"file": rel_file, "path": path,
               "state": "antre", "progress": 0, "error": ""}
        with self.lock:
            self.jobs.insert(0, job)
            del self.jobs[8:]
        self.q.put(job)

    def _run(self):
        while True:
            job = self.q.get()
            job["state"] = "proses"
            # Build a merged cfg for overlay.render
            merged = dict(CFG)
            merged["overlay"] = self._court_cfg.get("overlay", CFG.get("overlay", {}))
            merged["audio"] = self._court_cfg.get("audio", True)
            try:
                out = overlay.render(job["path"], merged, progress=lambda p: job.update(progress=p))
                out_rel = os.path.relpath(out, self._court_cfg["output_dir"]).replace("\\", "/")
                job.update(state="selesai", progress=100, out=out_rel)
                print(f"▶ Video dengan skor [{self._court_cfg['name']}]: {out_rel}")
                if not merged["overlay"].get("keep_original", True):
                    os.remove(job["path"])

                # Pembuatan klip highlight otomatis dari tombol Love ❤️ yang ditandai
                try:
                    import clipper
                    clip_info = clipper.create_clips_for_video(out, merged)
                    if clip_info and clip_info.get("total", 0) > 0:
                        job["clips"] = clip_info.get("clips", [])
                        job["reel"] = clip_info.get("reel")
                        print(f"✨ Highlights [{self._court_cfg['name']}]: Berhasil membuat {clip_info['total']} klip & reels momen seru!")
                except Exception as ce:
                    print(f"⚠️ [Clipper] Gagal membuat klip highlight: {ce}")
            except Exception as e:
                job.update(state="gagal", error=str(e)[:200])
                print(f"✗ Gagal membuat video skor [{self._court_cfg['name']}] {job['file']}: {e}")

    def status(self):
        with self.lock:
            return [{k: j.get(k) for k in ("file", "state", "progress", "error", "out")}
                    for j in self.jobs]


# ── Inisialisasi multi-lapangan ──────────────────────────────────────────────
SESSIONS = {}   # court_id (int) → Session
RENDERS = {}    # court_id (int) → RenderQueue

for _court_cfg in CFG.get("courts", []):
    _cid = _court_cfg["id"]
    SESSIONS[_cid] = Session(_court_cfg)
    RENDERS[_cid] = RenderQueue(_court_cfg)
    SESSIONS[_cid]._render_q = RENDERS[_cid]


# ── Camera helpers per court ─────────────────────────────────────────────────
PLACEHOLDER = "PASSWORD@"


def _save_cameras(court_id, cams):
    """Tulis daftar kamera ke config.json untuk satu lapangan."""
    raw = {}
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, encoding="utf-8") as f:
            raw = json.load(f)
    for c in raw.get("courts", []):
        if c["id"] == court_id:
            c["cameras"] = cams
            break
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(raw, f, indent=2, ensure_ascii=False)
    # Update in-memory
    for c in CFG.get("courts", []):
        if c["id"] == court_id:
            c["cameras"] = cams


def _save_court_settings(court_id, rules=None, names=None):
    """Tulis pengaturan pertandingan dan/atau nama tim ke config.json untuk satu lapangan."""
    raw = {}
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, encoding="utf-8") as f:
            raw = json.load(f)
    for c in raw.get("courts", []):
        if c["id"] == court_id:
            if rules is not None:
                c["match_rules"] = rules
            if names is not None:
                c["names"] = names
            break
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(raw, f, indent=2, ensure_ascii=False)
    for c in CFG.get("courts", []):
        if c["id"] == court_id:
            if rules is not None:
                c["match_rules"] = rules
            if names is not None:
                c["names"] = names


def _save_court_names(court_id, names):
    """Tulis nama tim ke config.json untuk satu lapangan (kompatibilitas)."""
    _save_court_settings(court_id, names=names)


def _save_server_ip(server_ip):
    """Tulis server_ip atau base_url ke config.json."""
    raw = {}
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, encoding="utf-8") as f:
            raw = json.load(f)
    raw["server_ip"] = server_ip
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(raw, f, indent=2, ensure_ascii=False)
    CFG["server_ip"] = server_ip


def _save_clipping_settings(clip_cfg):
    """Tulis pengaturan clipping ke config.json."""
    raw = {}
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, encoding="utf-8") as f:
            raw = json.load(f)
    raw["clipping"] = clip_cfg
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(raw, f, indent=2, ensure_ascii=False)
    CFG["clipping"] = clip_cfg


def get_all_lan_ips():
    """Mendapatkan seluruh daftar IP LAN lokal yang valid (non-loopback, non-APIPA)."""
    ips = []
    # 1. Metode UDP connect
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        if ip and not ip.startswith("127.") and not ip.startswith("169.254."):
            if ip not in ips:
                ips.append(ip)
    except Exception:
        pass

    # 2. Hostname DNS resolution (sangat andal saat offline / tanpa internet)
    try:
        host = socket.gethostname()
        for ip in socket.gethostbyname_ex(host)[2]:
            if not ip.startswith("127.") and not ip.startswith("169.254."):
                if ip not in ips:
                    ips.append(ip)
    except Exception:
        pass

    # 3. getaddrinfo
    try:
        for item in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = item[4][0]
            if not ip.startswith("127.") and not ip.startswith("169.254."):
                if ip not in ips:
                    ips.append(ip)
    except Exception:
        pass

    return ips


def get_local_ip():
    """Mendapatkan alamat IP lokal (LAN) server agar bisa di-share ke HP pemain via Wi-Fi."""
    # 1. Prioritaskan server_ip dari config jika sudah diatur manual oleh admin
    cfg_ip = CFG.get("server_ip")
    if cfg_ip and str(cfg_ip).strip() and not str(cfg_ip).startswith("127.") and "localhost" not in str(cfg_ip):
        return str(cfg_ip).strip()

    # 2. Ambil dari daftar IP LAN yang terdeteksi
    all_ips = get_all_lan_ips()
    for ip in all_ips:
        if ip.startswith("192.168.") or ip.startswith("10."):
            return ip
    for ip in all_ips:
        if ip.startswith("172."):
            parts = ip.split(".")
            if len(parts) >= 2 and 16 <= int(parts[1]) <= 31:
                return ip

    if all_ips:
        return all_ips[0]

    return "127.0.0.1"


def get_base_url():
    """Menghasilkan base URL lengkap (http://IP:PORT) yang siap dipakai untuk QR Code."""
    custom = CFG.get("base_url")
    if custom and "localhost" not in custom and "127.0.0.1" not in custom:
        return custom.rstrip("/")

    cfg_ip = CFG.get("server_ip")
    if cfg_ip and (str(cfg_ip).startswith("http://") or str(cfg_ip).startswith("https://")):
        return str(cfg_ip).rstrip("/")

    ip = get_local_ip()
    port = int(CFG.get("port", 8080))
    if cfg_ip and ":" in str(cfg_ip) and not str(cfg_ip).startswith("http"):
        return f"http://{cfg_ip}"

    return f"http://{ip}:{port}"


def clean_old_recordings(retention_days=7, min_free_gb=15.0):
    """
    Membersihkan rekaman CCTV lama otomatis jika:
    1. Usia rekaman melebihi retention_days (default 7 hari)
    2. Sisa kapasitas harddisk kurang dari min_free_gb (default 15 GB)
    """
    storage_cfg = CFG.get("storage", {})
    retention_days = float(storage_cfg.get("retention_days", retention_days))
    min_free_gb = float(storage_cfg.get("min_free_gb", min_free_gb))

    base_rekaman = os.path.join(BASE, "rekaman")
    if not os.path.isdir(base_rekaman):
        return

    now = time.time()
    max_age_sec = retention_days * 86400

    match_folders = []
    try:
        for root, dirs, _ in os.walk(base_rekaman):
            for d in dirs:
                if d.startswith("202") and ("-" in d or "_vs_" in d):
                    d_path = os.path.join(root, d)
                    try:
                        mtime = os.path.getmtime(d_path)
                        match_folders.append({"path": d_path, "name": d, "mtime": mtime})
                    except Exception:
                        pass
    except Exception as e:
        print(f"⚠️ [Cleanup] Error scan folder rekaman: {e}")
        return

    match_folders.sort(key=lambda x: x["mtime"])

    # 1. Hapus yang melebihi batas hari
    for item in list(match_folders):
        age = now - item["mtime"]
        if age > max_age_sec:
            try:
                shutil.rmtree(item["path"])
                print(f"🧹 [Auto-Cleanup] Menghapus rekaman kedaluwarsa ({round(age/86400, 1)} hari): {item['name']}")
                match_folders.remove(item)
            except Exception as e:
                print(f"⚠️ [Auto-Cleanup] Gagal menghapus {item['name']}: {e}")

    # 2. Cek kapasitas harddisk
    try:
        total, used, free = shutil.disk_usage(base_rekaman)
        free_gb = free / (1024 ** 3)
    except Exception:
        free_gb = 999.0

    while free_gb < min_free_gb and match_folders:
        oldest = match_folders.pop(0)
        try:
            shutil.rmtree(oldest["path"])
            print(f"🧹 [Auto-Cleanup Harddisk] Sisa disk {free_gb:.1f} GB (< {min_free_gb} GB). Menghapus rekaman terlama: {oldest['name']}")
            total, used, free = shutil.disk_usage(base_rekaman)
            free_gb = free / (1024 ** 3)
        except Exception as e:
            print(f"⚠️ [Auto-Cleanup] Gagal menghapus {oldest['name']}: {e}")
            break


def get_court_media(court_id):
    """Mengambil daftar pertandingan yang telah selesai beserta file video & highlight."""
    s = SESSIONS.get(court_id)
    if not s:
        return []
    output_dir = s._cfg.get("output_dir")
    if not output_dir or not os.path.isdir(output_dir):
        return []

    sessions = []
    try:
        entries = sorted(os.listdir(output_dir), reverse=True)
    except OSError:
        return []

    for item in entries:
        fpath = os.path.join(output_dir, item)
        if not os.path.isdir(fpath) or item.startswith("_"):
            continue

        try:
            files = os.listdir(fpath)
        except OSError:
            continue

        full_vid, skor_vid, reels_vid, klip_json = None, None, None, None
        clips = []

        for f in files:
            if f.endswith("_highlights_reels.mp4"):
                reels_vid = f
            elif f.endswith("_skor.mp4"):
                skor_vid = f
            elif f.endswith(".mp4") and "_klip_" not in f and not full_vid:
                full_vid = f
            elif f.endswith("_klip.json"):
                klip_json = f

        total_bm = 0
        clip_settings = None
        if klip_json:
            try:
                with open(os.path.join(fpath, klip_json), encoding="utf-8") as kf:
                    kdata = json.load(kf)
                    total_bm = kdata.get("total_bookmarks", len(kdata.get("bookmarks", [])))
                    clip_settings = kdata.get("clipping_settings")
                    raw_clips = kdata.get("clips", [])
                    for rc in raw_clips:
                        c_file = rc.get("file")
                        if c_file and os.path.isfile(os.path.join(fpath, c_file)):
                            clips.append({
                                "file": c_file,
                                "url": f"/media/lapangan{court_id}/{item}/{c_file}",
                                "time_str": rc.get("time_str", ""),
                                "skor": rc.get("skor", ""),
                                "duration": rc.get("duration", 0),
                                "size_mb": rc.get("size_mb", 0)
                            })
            except Exception:
                pass

        if not clips:
            for f in sorted(files):
                if "_klip_" in f and f.endswith(".mp4"):
                    sz = round(os.path.getsize(os.path.join(fpath, f)) / (1024 * 1024), 2)
                    clips.append({
                        "file": f,
                        "url": f"/media/lapangan{court_id}/{item}/{f}",
                        "time_str": "",
                        "skor": "",
                        "size_mb": sz
                    })

        main_vid = skor_vid or full_vid
        if not main_vid and not clips and not reels_vid:
            continue

        main_size = round(os.path.getsize(os.path.join(fpath, main_vid)) / (1024 * 1024), 2) if main_vid else 0
        reel_size = round(os.path.getsize(os.path.join(fpath, reels_vid)) / (1024 * 1024), 2) if reels_vid else 0

        parts = item.split("_", 2)
        date_str = parts[0] if len(parts) > 0 else ""
        time_str = parts[1].replace("-", ":") if len(parts) > 1 else ""
        teams_str = parts[2].replace("-vs-", " vs ").replace("-", " ") if len(parts) > 2 else item

        base_url = get_base_url()
        share_path = f"/share/{court_id}/{item}"
        share_url = f"{base_url}{share_path}"
        qr_url = f"/api/qr?text={urllib.parse.quote(share_url)}"

        sessions.append({
            "folder": item,
            "title": teams_str.upper(),
            "date": f"{date_str} {time_str}",
            "main_video": main_vid,
            "main_url": f"/media/lapangan{court_id}/{item}/{main_vid}" if main_vid else None,
            "main_size_mb": main_size,
            "has_skor": bool(skor_vid),
            "reels_video": reels_vid,
            "reels_url": f"/media/lapangan{court_id}/{item}/{reels_vid}" if reels_vid else None,
            "reels_size_mb": reel_size,
            "total_bookmarks": total_bm or len(clips),
            "clips": clips,
            "clipping_settings": clip_settings,
            "share_path": share_path,
            "share_url": share_url,
            "qr_url": qr_url
        })

    return sessions[:20]


# ── Perekam Sinyal Remote (Live Debugger) ───────────────────────────────────
REMOTE_LOG_FILE = os.path.join(BASE, "remote_signals.log")
_remote_signals = []
_remote_lock = threading.Lock()


def log_remote_signal(court_id, data):
    entry = {
        "court_id": court_id,
        "timestamp": datetime.datetime.now().strftime("%H:%M:%S.%f")[:-3],
        **data
    }
    with _remote_lock:
        _remote_signals.insert(0, entry)
        del _remote_signals[50:]
    try:
        with open(REMOTE_LOG_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception:
        pass
    print(f"[REMOTE SIGNAL C{court_id}] {json.dumps(entry, ensure_ascii=False)}")
    return {"ok": True}


def get_remote_signals(court_id=None):
    with _remote_lock:
        if court_id is None:
            return list(_remote_signals)
        return [s for s in _remote_signals if s.get("court_id") == court_id]


def clear_remote_signals():
    with _remote_lock:
        _remote_signals.clear()
    try:
        if os.path.exists(REMOTE_LOG_FILE):
            os.remove(REMOTE_LOG_FILE)
    except Exception:
        pass
    return {"ok": True}


def add_camera(court_id, data):
    custom_rtsp = (data.get("rtsp") or "").strip()
    name = (data.get("name") or "").strip()
    sess = SESSIONS.get(court_id)
    if not sess:
        return {"ok": False, "message": f"Lapangan {court_id} tidak ditemukan"}

    if custom_rtsp:
        if not custom_rtsp.startswith("rtsp://"):
            return {"ok": False, "message": "Alamat RTSP harus diawali dengan rtsp://"}
        name = name or f"Kamera {len(sess.recorders) + 1}"
        with sess.lock:
            if sess.recording:
                return {"ok": False, "message": "Tidak bisa menyimpan kamera saat sedang merekam."}
            court_cfg_list = CFG.get("courts", [])
            court_cfg = next((c for c in court_cfg_list if c["id"] == court_id), None)
            if not court_cfg:
                return {"ok": False, "message": "Konfigurasi lapangan tidak ditemukan"}
            cams = [c for c in court_cfg.get("cameras", [])
                    if PLACEHOLDER not in c.get("rtsp", "") and c.get("name") != name]
            cams.append({"name": name, "rtsp": custom_rtsp})
            _save_cameras(court_id, cams)
            sess.recorders = [CameraRecorder(c, sess._cfg) for c in cams]
        return {"ok": True, "name": name, "label": "RTSP Manual", "info": "Tersimpan"}

    ip = (data.get("ip") or "").strip()
    port = data.get("port")
    if not re.match(r"^\d{1,3}(\.\d{1,3}){3}$", ip):
        return {"ok": False, "message": "Tulis IP kamera, contoh 192.168.1.50 atau masukkan URL RTSP manual"}
    res = cari_kamera.probe(ip, (data.get("user") or "admin").strip(),
                            data.get("password") or "",
                            CFG.get("ffprobe") or "ffprobe",
                            port=port)
    if not res["ok"]:
        return res
    name = name or f"Kamera {ip.split('.')[-1]}"
    with sess.lock:
        if sess.recording:
            return {"ok": False, "message": "Kamera ditemukan, tapi tidak bisa disimpan saat sedang merekam."}
        court_cfg_list = CFG.get("courts", [])
        court_cfg = next((c for c in court_cfg_list if c["id"] == court_id), None)
        if not court_cfg:
            return {"ok": False, "message": "Konfigurasi lapangan tidak ditemukan"}
        cams = [c for c in court_cfg.get("cameras", [])
                if PLACEHOLDER not in c.get("rtsp", "") and c.get("name") != name]
        cams.append({"name": name, "rtsp": res["url"]})
        _save_cameras(court_id, cams)
        sess.recorders = [CameraRecorder(c, sess._cfg) for c in cams]
    return {"ok": True, "name": name, "label": res["label"], "info": res["info"]}


def remove_camera(court_id, data):
    sess = SESSIONS.get(court_id)
    if not sess:
        return {"ok": False, "message": f"Lapangan {court_id} tidak ditemukan"}
    with sess.lock:
        if sess.recording:
            return {"ok": False, "message": "Tidak bisa menghapus kamera saat sedang merekam."}
        court_cfg = next((c for c in CFG.get("courts", []) if c["id"] == court_id), None)
        if not court_cfg:
            return {"ok": False, "message": "Konfigurasi lapangan tidak ditemukan"}
        cams = [c for c in court_cfg.get("cameras", []) if c.get("name") != data.get("name")]
        _save_cameras(court_id, cams)
        sess.recorders = [CameraRecorder(c, sess._cfg) for c in cams]
    return {"ok": True}


# ── HTTP Handler ─────────────────────────────────────────────────────────────
def _court_id_from_path(path):
    """Ambil court_id integer dari path /api/court/<n>/... atau None."""
    m = re.match(r"^/api/court/(\d+)/", path)
    if m:
        return int(m.group(1))
    return None


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    # ── response helpers ──────────────────────────────────────────────────
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

    def _html(self, path, code=200):
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

    def _redirect(self, location, code=302):
        self.send_response(code)
        self.send_header("Location", location)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _read_body(self):
        n = int(self.headers.get("Content-Length") or 0)
        try:
            return json.loads(self.rfile.read(n) or b"{}")
        except ValueError:
            return {}

    def _serve_file_with_range(self, fpath):
        """Melayani streaming dan download file video dengan dukungan Range Request (HTTP 206)."""
        file_size = os.path.getsize(fpath)
        ext = os.path.splitext(fpath)[1].lower()
        ctype = {
            ".mp4": "video/mp4",
            ".json": "application/json",
            ".jsonl": "application/json",
            ".ass": "text/plain",
            ".log": "text/plain",
            ".txt": "text/plain",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".svg": "image/svg+xml"
        }.get(ext, "application/octet-stream")

        range_header = self.headers.get("Range")
        if not range_header or not range_header.startswith("bytes="):
            # Full content
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(file_size))
            self.send_header("Accept-Ranges", "bytes")
            if ext == ".mp4" and "download=1" in self.path:
                self.send_header("Content-Disposition", f'attachment; filename="{os.path.basename(fpath)}"')
            self.end_headers()
            with open(fpath, "rb") as f:
                while True:
                    chunk = f.read(65536)
                    if not chunk:
                        break
                    try:
                        self.wfile.write(chunk)
                    except (ConnectionResetError, BrokenPipeError):
                        break
            return

        # Partial content (Range)
        try:
            ranges = range_header.replace("bytes=", "").split("-")
            start = int(ranges[0]) if ranges[0] else 0
            end = int(ranges[1]) if ranges[1] else file_size - 1
            if start >= file_size or end >= file_size or start > end:
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{file_size}")
                self.end_headers()
                return

            length = end - start + 1
            self.send_response(206)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
            self.send_header("Content-Length", str(length))
            self.send_header("Accept-Ranges", "bytes")
            self.end_headers()

            with open(fpath, "rb") as f:
                f.seek(start)
                remaining = length
                while remaining > 0:
                    read_len = min(65536, remaining)
                    chunk = f.read(read_len)
                    if not chunk:
                        break
                    try:
                        self.wfile.write(chunk)
                    except (ConnectionResetError, BrokenPipeError):
                        break
                    remaining -= len(chunk)
        except Exception:
            self.send_response(500)
            self.end_headers()

    # ── GET ───────────────────────────────────────────────────────────────
    def do_GET(self):
        path = self.path.split("?")[0]
        spa_entry = os.path.join(BASE, "web", "index.html")
        has_spa = os.path.isdir(os.path.join(BASE, "web", "assets")) and os.path.isfile(spa_entry)

        # Root → redirect ke login
        if path in ("/", "/index.html"):
            self._redirect("/login")
            return

        # Login page — boleh diakses siapa saja
        if path == "/login":
            if has_spa:
                self._html(spa_entry)
            else:
                self._html(os.path.join(BASE, "web", "login.html"))
            return

        # Dashboard — butuh auth admin
        if path == "/dashboard":
            sess = check_auth(self, required_role="admin")
            if not sess:
                self._redirect(f"/login?next=/dashboard")
                return
            if has_spa:
                self._html(spa_entry)
            else:
                self._html(os.path.join(BASE, "web", "dashboard.html"))
            return

        # Court page — butuh auth court atau admin
        m = re.match(r"^/court/(\d+)$", path)
        if m:
            cid = int(m.group(1))
            sess = check_auth(self, court_id=cid)
            if not sess:
                self._redirect(f"/login?next=/court/{cid}")
                return
            if has_spa:
                self._html(spa_entry)
            else:
                self._html(os.path.join(BASE, "web", "court.html"))
            return

        # Static files di /assets/ (Vite build)
        if path.startswith("/assets/"):
            fname = path[8:]
            fpath = os.path.join(BASE, "web", "assets", fname)
            if ".." in fname or not os.path.isfile(fpath):
                self._json({"error": "not found"}, 404)
                return
            ext = os.path.splitext(fname)[1].lower()
            ctype = {".js": "application/javascript", ".css": "text/css",
                     ".png": "image/png", ".jpg": "image/jpeg",
                     ".svg": "image/svg+xml", ".ico": "image/x-icon",
                     ".woff": "font/woff", ".woff2": "font/woff2"
                     }.get(ext, "application/octet-stream")
            with open(fpath, "rb") as f:
                body = f.read()
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        # Static files di /web/
        if path.startswith("/web/"):
            fname = path[5:]  # strip /web/
            fpath = os.path.join(BASE, "web", fname)
            # Keamanan: jangan keluar dari folder web
            if ".." in fname or not os.path.isfile(fpath):
                self._json({"error": "not found"}, 404)
                return
            ext = os.path.splitext(fname)[1].lower()
            ctype = {".js": "application/javascript", ".css": "text/css",
                     ".png": "image/png", ".jpg": "image/jpeg",
                     ".svg": "image/svg+xml", ".ico": "image/x-icon"
                     }.get(ext, "application/octet-stream")
            with open(fpath, "rb") as f:
                body = f.read()
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        # API: /api/auth/me
        if path == "/api/auth/me":
            sess = check_auth(self)
            if not sess:
                self._json({"ok": False, "message": "Belum login"}, 401)
            else:
                info = {"ok": True, "role": sess["role"]}
                if "court_id" in sess:
                    info["court_id"] = sess["court_id"]
                self._json(info)
            return

        # Media rekaman video & highlight (dukungan streaming partial content & download)
        if path.startswith("/media/"):
            rel_file = path[7:]
            if ".." in rel_file:
                self._json({"error": "forbidden"}, 403)
                return
            full_path = os.path.normpath(os.path.join(BASE, "rekaman", rel_file))
            base_dir = os.path.normpath(os.path.join(BASE, "rekaman"))
            if not full_path.startswith(base_dir) or not os.path.isfile(full_path):
                self._json({"error": "file not found"}, 404)
                return
            self._serve_file_with_range(full_path)
            return

        # Halaman share download untuk HP pemain
        if path.startswith("/share/"):
            share_page = os.path.join(BASE, "web", "share.html")
            if os.path.isfile(share_page):
                self._html(share_page)
            else:
                self._json({"error": "share page not found"}, 404)
            return

        # API: /api/system/info
        if path == "/api/system/info":
            base_url = get_base_url()
            ip = get_local_ip()
            port = int(CFG.get("port", 8080))
            all_ips = get_all_lan_ips()
            self._json({
                "ok": True,
                "ip": ip,
                "port": port,
                "base_url": base_url,
                "server_ip": CFG.get("server_ip", ""),
                "all_ips": all_ips,
                "is_localhost": (ip == "127.0.0.1" or "localhost" in base_url),
                "server": {
                    "local_ip": ip,
                    "port": port,
                    "base_url": base_url
                }
            })
            return

        # API: /api/qr?text=... (Generate SVG QR code)
        if path == "/api/qr":
            query = self.path.split("?")[1] if "?" in self.path else ""
            params = urllib.parse.parse_qs(query)
            text = params.get("text", [""])[0]
            if not text:
                self._json({"error": "parameter text dibutuhkan"}, 400)
                return
            try:
                import qrcode
                import qrcode.image.svg
                img = qrcode.make(text, image_factory=qrcode.image.svg.SvgPathImage, box_size=10, border=2)
                svg_data = img.to_string()
                self.send_response(200)
                self.send_header("Content-Type", "image/svg+xml")
                self.send_header("Content-Length", str(len(svg_data)))
                self.send_header("Cache-Control", "public, max-age=86400")
                self.end_headers()
                self.wfile.write(svg_data)
            except Exception as e:
                self._json({"error": str(e)}, 500)
            return

        # API: /api/court/<n>/media
        m = re.match(r"^/api/court/(\d+)/media$", path)
        if m:
            cid = int(m.group(1))
            self._json({"ok": True, "court_id": cid, "sessions": get_court_media(cid)})
            return

        # API: /api/court/<n>/status
        m = re.match(r"^/api/court/(\d+)/status$", path)
        if m:
            cid = int(m.group(1))
            sess = check_auth(self, court_id=cid)
            if not sess:
                self._json({"error": "unauthorized"}, 401)
                return
            s = SESSIONS.get(cid)
            if not s:
                self._json({"error": "Lapangan tidak ditemukan"}, 404)
                return
            self._json(s.status())
            return

        # API: /api/admin/status
        if path == "/api/admin/status":
            sess = check_auth(self, required_role="admin")
            if not sess:
                self._json({"error": "unauthorized"}, 401)
                return
            all_status = {cid: s.status() for cid, s in SESSIONS.items()}
            self._json({"ok": True, "courts": all_status})
            return

        # API: /api/admin/config
        if path == "/api/admin/config":
            sess = check_auth(self, required_role="admin")
            if not sess:
                self._json({"error": "unauthorized"}, 401)
                return
            # Kembalikan config tanpa hash password
            safe_cfg = dict(CFG)
            safe_auth = dict(safe_cfg.get("auth", {}))
            safe_auth.pop("admin_password_hash", None)
            safe_courts = {}
            for cid, cv in safe_auth.get("courts", {}).items():
                safe_courts[cid] = {k: v for k, v in cv.items() if k != "pin_hash"}
            safe_auth["courts"] = safe_courts
            safe_cfg["auth"] = safe_auth
            safe_cfg["clipping"] = CFG.get("clipping", {
                "enabled": True,
                "pre_roll_seconds": 12.0,
                "post_roll_seconds": 4.0,
                "create_reel": True
            })
            self._json({"ok": True, "config": safe_cfg})
            return

        self._json({"error": "not found"}, 404)

    # ── POST ──────────────────────────────────────────────────────────────
    def do_POST(self):
        path = self.path.split("?")[0]
        data = self._read_body()

        # Auth routes
        if path == "/api/auth/login":
            result = handle_login(data)
            sid = result.pop("sid", None)
            headers = {}
            if sid:
                headers["Set-Cookie"] = f"sid={sid}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200"
            self._json(result, extra_headers=headers if headers else None)
            return

        if path == "/api/auth/logout":
            cookie_hdr = self.headers.get("Cookie", "")
            for part in cookie_hdr.split(";"):
                part = part.strip()
                if part.startswith("sid="):
                    sid = part[4:]
                    with _auth_lock:
                        AUTH_SESSIONS.pop(sid, None)
            self._json({"ok": True},
                       extra_headers={"Set-Cookie": "sid=; Path=/; HttpOnly; Max-Age=0"})
            return

        # Court API routes
        m = re.match(r"^/api/court/(\d+)/(.+)$", path)
        if m:
            cid = int(m.group(1))
            action = m.group(2)
            sess = check_auth(self, court_id=cid)
            if not sess:
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
                import clipper
                sessions = get_court_media(cid)
                if not sessions:
                    self._json({"error": "Tidak ada rekaman"}, 404)
                    return
                req_folder = data.get("folder")
                target_sess = next((x for x in sessions if x["folder"] == req_folder), None) if req_folder else sessions[0]
                if not target_sess or not target_sess.get("main_video"):
                    self._json({"error": "Sesi rekaman atau video tidak ditemukan"}, 404)
                    return
                target_video = os.path.join(s._cfg["output_dir"], target_sess["folder"], target_sess["main_video"])
                if not os.path.isfile(target_video):
                    self._json({"error": "File video tidak ditemukan"}, 404)
                    return

                pre_roll = data.get("pre_roll")
                post_roll = data.get("post_roll")
                create_reel = data.get("create_reel")

                pre_val = float(pre_roll) if pre_roll is not None and str(pre_roll).strip() != "" else None
                post_val = float(post_roll) if post_roll is not None and str(post_roll).strip() != "" else None

                res = clipper.create_clips_for_video(
                    target_video,
                    dict(CFG),
                    pre_roll=pre_val,
                    post_roll=post_val,
                    create_reel=create_reel
                )
                self._json({"ok": True, "result": res})
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
            return

        # Admin API routes
        if path == "/api/admin/config":
            sess = check_auth(self, required_role="admin")
            if not sess:
                self._json({"error": "unauthorized"}, 401)
                return
            # Update config (nama lapangan, overlay settings)
            try:
                raw = {}
                if os.path.exists(CONFIG_PATH):
                    with open(CONFIG_PATH, encoding="utf-8") as f:
                        raw = json.load(f)
                if "courts" in data:
                    for upd in data["courts"]:
                        cid = upd.get("id")
                        for c in raw.get("courts", []):
                            if c["id"] == cid:
                                if "name" in upd:
                                    c["name"] = upd["name"]
                                    # update auth name too
                                    raw.get("auth", {}).get("courts", {}).get(str(cid), {})["name"] = upd["name"]
                                if "overlay" in upd:
                                    c["overlay"].update(upd["overlay"])
                                # Update in-memory
                                for cc in CFG.get("courts", []):
                                    if cc["id"] == cid:
                                        if "name" in upd:
                                            cc["name"] = upd["name"]
                                        if "overlay" in upd:
                                            cc["overlay"].update(upd["overlay"])
                with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                    json.dump(raw, f, indent=2, ensure_ascii=False)
                self._json({"ok": True})
            except Exception as e:
                self._json({"ok": False, "message": str(e)}, 500)
            return

        if path == "/api/admin/change-password":
            sess = check_auth(self, required_role="admin")
            if not sess:
                self._json({"error": "unauthorized"}, 401)
                return
            try:
                raw = {}
                if os.path.exists(CONFIG_PATH):
                    with open(CONFIG_PATH, encoding="utf-8") as f:
                        raw = json.load(f)
                if data.get("type") == "admin":
                    new_pw = data.get("new_password", "")
                    if len(new_pw) < 6:
                        self._json({"ok": False, "message": "Password minimal 6 karakter"})
                        return
                    new_hash = _sha256(new_pw)
                    raw.setdefault("auth", {})["admin_password_hash"] = new_hash
                    CFG.setdefault("auth", {})["admin_password_hash"] = new_hash
                elif data.get("type") == "court":
                    cid = str(data.get("court_id", ""))
                    new_pin = str(data.get("new_pin", ""))
                    if not re.match(r"^\d{4}$", new_pin):
                        self._json({"ok": False, "message": "PIN harus 4 digit angka"})
                        return
                    new_hash = _sha256(new_pin)
                    raw.setdefault("auth", {}).setdefault("courts", {}).setdefault(cid, {})["pin_hash"] = new_hash
                    CFG.setdefault("auth", {}).setdefault("courts", {}).setdefault(cid, {})["pin_hash"] = new_hash
                else:
                    self._json({"ok": False, "message": "Tipe tidak valid"})
                    return
                with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                    json.dump(raw, f, indent=2, ensure_ascii=False)
                self._json({"ok": True})
            except Exception as e:
                self._json({"ok": False, "message": str(e)}, 500)
            return

        if path == "/api/admin/set-server-ip":
            sess = check_auth(self, required_role="admin")
            if not sess:
                self._json({"error": "unauthorized"}, 401)
                return
            new_ip = str(data.get("server_ip", "")).strip()
            _save_server_ip(new_ip)
            base_url = get_base_url()
            self._json({"ok": True, "server_ip": new_ip, "base_url": base_url})
            return

        if path == "/api/admin/set-clipping":
            sess = check_auth(self, required_role="admin")
            if not sess:
                self._json({"error": "unauthorized"}, 401)
                return
            clip_cfg = {
                "enabled": bool(data.get("enabled", True)),
                "pre_roll_seconds": float(data.get("pre_roll_seconds", 12.0)),
                "post_roll_seconds": float(data.get("post_roll_seconds", 4.0)),
                "create_reel": bool(data.get("create_reel", True))
            }
            _save_clipping_settings(clip_cfg)
            self._json({"ok": True, "clipping": clip_cfg})
            return

        self._json({"error": "not found"}, 404)


# ── Utils ────────────────────────────────────────────────────────────────────
def local_ips():
    ips = get_all_lan_ips()
    return ips if ips else [get_local_ip()]


# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    if len(sys.argv) > 2 and sys.argv[1] == "--render":
        # python padel_cctv.py --render video.mp4 [--offset 1.5]
        # Gunakan overlay setting dari court 1 sebagai default
        render_cfg = dict(CFG)
        court_cfgs = CFG.get("courts", [])
        if court_cfgs:
            render_cfg["overlay"] = court_cfgs[0].get("overlay", CFG.get("overlay", {}))
        if "--offset" in sys.argv:
            render_cfg["overlay"]["offset_seconds"] = float(sys.argv[sys.argv.index("--offset") + 1])
        out = overlay.render(sys.argv[2], render_cfg, progress=lambda p: print(f"\r  {p}%", end="", flush=True))
        print(f"\nSelesai: {out}")
        return

    ffmpeg_bin = CFG.get("ffmpeg", "ffmpeg")
    if not shutil.which(ffmpeg_bin) and not os.path.exists(ffmpeg_bin):
        print("PERINGATAN: ffmpeg tidak ditemukan. Papan skor tetap jalan, tapi rekaman tidak bisa dibuat.")
        print("Windows: buka Command Prompt lalu ketik  winget install ffmpeg")

    # Jalankan pemeriksaan kapasitas harddisk / auto-cleanup rekaman lama di latar belakang
    def _cleanup_daemon():
        clean_old_recordings()
        while True:
            time.sleep(3600)
            try:
                clean_old_recordings()
            except Exception:
                pass
    threading.Thread(target=_cleanup_daemon, daemon=True).start()

    port = int(CFG.get("port", 8080))
    srv = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print("=" * 60)
    print(" Papan Skor Padel + CCTV — Multi-Lapangan")
    print(f" Login Admin  : http://localhost:{port}/login")
    print(f" Dashboard    : http://localhost:{port}/dashboard")
    for i in range(1, 4):
        print(f" Lapangan {i}   : http://localhost:{port}/court/{i}")
    for ip in local_ips():
        print(f" Dari jaringan: http://{ip}:{port}")
    print(" Tekan Ctrl+C untuk berhenti.")
    print("=" * 60)
    print(" Default login: admin / admin123")
    print(" PIN Lapangan 1: 1111 | Lapangan 2: 2222 | Lapangan 3: 3333")
    print("=" * 60)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nMenutup… rekaman yang sedang berjalan disimpan dulu.")
        for s in SESSIONS.values():
            s.stop("dihentikan")
        srv.server_close()


if __name__ == "__main__":
    main()
