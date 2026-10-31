#!/usr/bin/env python3
"""
Papan Skor Padel + Perekam CCTV
--------------------------------
Menjalankan papan skor di browser dan merekam stream RTSP dari CCTV
saat tombol "Main" ditekan. Rekaman berhenti otomatis saat pertandingan
selesai (ditambah beberapa detik penutup), lalu file diberi nama
berisi nama tim dan skor akhir.

Butuh: Python 3.8+ dan ffmpeg (tanpa library Python tambahan).
Jalankan:  python padel_cctv.py
Buka:      http://localhost:8080
"""
import datetime
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
import queue
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

BASE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE, "config.json")
DEFAULTS = {
    "port": 8080,
    "output_dir": "rekaman",
    "post_roll_seconds": 15,
    "ffmpeg": "ffmpeg",
    "ffprobe": "ffprobe",
    "audio": True,
    "overlay": {"enabled": True, "position": "top-left", "scale": 1.0, "offset_seconds": 0.0,
                "preset": "veryfast", "crf": 21, "keep_original": True},
    "cameras": [
        {"name": "Lapangan 1", "rtsp": "rtsp://admin:password@192.168.1.64:554/Streaming/Channels/101"}
    ],
}


def load_config():
    cfg = dict(DEFAULTS)
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, encoding="utf-8") as f:
            cfg.update(json.load(f))
    else:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(DEFAULTS, f, indent=2)
        print("config.json dibuat. Isi alamat RTSP kamera Anda, lalu jalankan lagi.")
    ov = dict(DEFAULTS["overlay"])
    ov.update(cfg.get("overlay") or {})
    cfg["overlay"] = ov
    out = cfg["output_dir"]
    cfg["output_dir"] = out if os.path.isabs(out) else os.path.join(BASE, out)
    os.makedirs(cfg["output_dir"], exist_ok=True)
    fonts = os.path.join(BASE, "fonts")
    if os.path.isdir(fonts):
        shutil.copytree(fonts, os.path.join(cfg["output_dir"], "_fonts"), dirs_exist_ok=True)
    return cfg


CFG = load_config()
import overlay  # noqa: E402
import cari_kamera  # noqa: E402


def slug(s, n=24):
    s = re.sub(r"[^A-Za-z0-9]+", "-", str(s)).strip("-")
    return s[:n] or "Tim"


def mask(url):
    """Sembunyikan password di log."""
    return re.sub(r"(rtsp://[^:/@]+):[^@]*@", r"\1:***@", url)


class CameraRecorder:
    """Merekam satu kamera. Jika stream putus, otomatis menyambung lagi ke file _partN."""

    def __init__(self, cam):
        self.name = cam.get("name", "Kamera")
        self.url = cam["rtsp"]
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
        cmd = [CFG["ffmpeg"], "-hide_banner", "-loglevel", "error", "-y",
               "-rtsp_transport", "tcp", "-i", self.url,
               "-map", "0:v:0"]
        if CFG.get("audio", True):
            cmd += ["-map", "0:a:0?", "-c:a", "aac", "-b:a", "96k"]
        cmd += ["-c:v", "copy",
                # MP4 terfragmentasi: file tetap bisa diputar walau listrik/laptop mati mendadak
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
        """Catat jam dinding saat detik ke-0 video, untuk menyelaraskan papan skor."""
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
                # buang file kosong dari percobaan yang gagal
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
                lines = [l.strip() for l in f if l.strip()]
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
        return [(f, a) for f, a in zip(self.files, self.anchors) if os.path.exists(f) and os.path.getsize(f) > 1024]

    def status(self):
        alive = bool(self.active and self.proc and self.proc.poll() is None)
        size = 0
        if self.files and os.path.exists(self.files[-1]):
            size = os.path.getsize(self.files[-1])
        recording = alive and size > 0
        return {"name": self.name, "recording": recording, "connecting": alive and not recording,
                "placeholder": "PASSWORD@192.168.1.64" in self.url,
                "error": self.error,
                "file": os.path.basename(self.files[-1]) if self.files else "", "mb": round(size / 1e6, 1)}


class Session:
    def __init__(self):
        self.lock = threading.Lock()
        self.recorders = [CameraRecorder(c) for c in CFG["cameras"]]
        self.recording = False
        self.t0 = 0
        self.base = ""
        self.events_path = ""
        self.stop_timer = None
        self.stop_at = 0
        self.recent = []

    def start(self, info):
        with self.lock:
            if self.recording:
                return {"ok": True, "already": True}
            names = info.get("names") or ["Tim A", "Tim B"]
            stamp = datetime.datetime.now()
            self.base = os.path.join(CFG["output_dir"],
                                     f"{stamp:%Y%m%d_%H%M%S}_{slug(names[0])}-vs-{slug(names[1])}")
            for r in self.recorders:
                r.start(self.base)
            self.recording = True
            self.has_board = False
            self.t0 = time.time()
            self.events_path = self.base + "_poin.jsonl"
            self._write_event({"event": "mulai", "names": names, "mode": info.get("mode"),
                               "waktu": stamp.isoformat(timespec="seconds")})
            print(f"● REKAM: {os.path.basename(self.base)}")
            return {"ok": True}

    def _write_event(self, data):
        if not self.events_path:
            return
        now = time.time()
        data = {"t": round(now - self.t0, 1), "w": round(now, 3), **data}
        with open(self.events_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(data, ensure_ascii=False) + "\n")

    def event(self, data):
        with self.lock:
            if self.recording:
                if data.get("board") and data.get("event") != "papan":
                    self.has_board = True
                self._write_event(data)
        return {"ok": True}

    def schedule_stop(self, delay, summary):
        with self.lock:
            if not self.recording:
                return {"ok": False}
            self._cancel()
            self._write_event({"event": "selesai", "skor": summary})
            delay = max(0, float(delay if delay is not None else CFG["post_roll_seconds"]))
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
                final.append(os.path.basename(nf))
            for f in [self.events_path] + [r.log_path for r in self.recorders]:
                moved(f)
            if CFG["overlay"].get("enabled") and summary is not None and getattr(self, "has_board", False):
                for pth in paths:
                    RENDERS.add(pth)
            self.recent = (final + self.recent)[:8]
            self.events_path = ""
            print(f"■ SELESAI: {', '.join(final) or 'tidak ada video tersimpan'}")
            return {"ok": True, "files": final}

    def status(self):
        return {"recording": self.recording, "renders": RENDERS.status(),
                "elapsed": round(time.time() - self.t0) if self.recording else 0,
                "stopping_in": max(0, round(self.stop_at - time.time())) if self.stop_at else None,
                "cameras": [r.status() for r in self.recorders],
                "recent": self.recent,
                "post_roll": CFG["post_roll_seconds"],
                "folder": CFG["output_dir"]}

    def test(self):
        res = []
        probe = CFG.get("ffprobe") or "ffprobe"
        for c in CFG["cameras"]:
            try:
                out = subprocess.run([probe, "-v", "error", "-rtsp_transport", "tcp", "-select_streams", "v:0",
                                      "-show_entries", "stream=codec_name,width,height", "-of", "json", c["rtsp"]],
                                     capture_output=True, text=True, timeout=15)
                if out.returncode == 0:
                    s = json.loads(out.stdout).get("streams", [{}])[0]
                    res.append({"name": c["name"], "ok": True,
                                "info": f"{s.get('codec_name', '?')} {s.get('width', '?')}×{s.get('height', '?')}"})
                else:
                    res.append({"name": c["name"], "ok": False, "info": (out.stderr.strip().splitlines() or ["gagal"])[-1][:160]})
            except subprocess.TimeoutExpired:
                res.append({"name": c["name"], "ok": False, "info": "Tidak ada jawaban dari kamera (cek IP dan jaringan)"})
            except FileNotFoundError:
                res.append({"name": c["name"], "ok": False, "info": "ffprobe tidak ditemukan. Pasang ffmpeg dulu."})
        return {"results": res}


class RenderQueue:
    """Membuat video dengan papan skor satu per satu di latar belakang."""

    def __init__(self):
        self.q = queue.Queue()
        self.jobs = []
        self.lock = threading.Lock()
        threading.Thread(target=self._run, daemon=True).start()

    def add(self, path):
        job = {"file": os.path.basename(path), "path": path, "state": "antre", "progress": 0, "error": ""}
        with self.lock:
            self.jobs.insert(0, job)
            del self.jobs[8:]
        self.q.put(job)

    def _run(self):
        while True:
            job = self.q.get()
            job["state"] = "proses"
            try:
                out = overlay.render(job["path"], CFG, progress=lambda p: job.update(progress=p))
                job.update(state="selesai", progress=100, out=os.path.basename(out))
                print(f"▶ Video dengan skor: {os.path.basename(out)}")
                if not CFG["overlay"].get("keep_original", True):
                    os.remove(job["path"])
            except Exception as e:  # noqa: BLE001
                job.update(state="gagal", error=str(e)[:200])
                print(f"✗ Gagal membuat video skor untuk {job['file']}: {e}")

    def status(self):
        with self.lock:
            return [{k: j.get(k) for k in ("file", "state", "progress", "error", "out")} for j in self.jobs]


RENDERS = RenderQueue()

PLACEHOLDER = "PASSWORD@192.168.1.64"


def save_cameras(cams):
    """Tulis daftar kamera ke config.json tanpa mengubah pengaturan lain."""
    raw = {}
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, encoding="utf-8") as f:
            raw = json.load(f)
    raw["cameras"] = cams
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(raw, f, indent=2, ensure_ascii=False)
    CFG["cameras"] = cams


def add_camera(data):
    ip = (data.get("ip") or "").strip()
    if not re.match(r"^\d{1,3}(\.\d{1,3}){3}$", ip):
        return {"ok": False, "message": "Tulis IP kamera, contoh 192.168.1.50"}
    res = cari_kamera.probe(ip, (data.get("user") or "admin").strip(), data.get("password") or "",
                            CFG.get("ffprobe") or "ffprobe")
    if not res["ok"]:
        return res
    name = (data.get("name") or "").strip() or f"Kamera {ip.split('.')[-1]}"
    with SESSION.lock:
        if SESSION.recording:
            return {"ok": False, "message": "Kamera ditemukan, tapi tidak bisa disimpan saat sedang merekam. "
                                            "Coba lagi setelah pertandingan selesai.", "url": mask(res["url"])}
        cams = [c for c in CFG["cameras"] if PLACEHOLDER not in c.get("rtsp", "") and c.get("name") != name]
        cams.append({"name": name, "rtsp": res["url"]})
        save_cameras(cams)
        SESSION.recorders = [CameraRecorder(c) for c in cams]
    return {"ok": True, "name": name, "label": res["label"], "info": res["info"]}


def remove_camera(data):
    with SESSION.lock:
        if SESSION.recording:
            return {"ok": False, "message": "Tidak bisa menghapus kamera saat sedang merekam."}
        cams = [c for c in CFG["cameras"] if c.get("name") != data.get("name")]
        save_cameras(cams)
        SESSION.recorders = [CameraRecorder(c) for c in cams]
    return {"ok": True}


REMOTE_LOG_FILE = os.path.join(BASE, "remote_signals.jsonl")


def log_remote_signal(data):
    entry = {
        "timestamp": datetime.datetime.now().strftime("%H:%M:%S.%f")[:-3],
        **data
    }
    line = json.dumps(entry, ensure_ascii=False)
    print(f"[REMOTE SIGNAL] {line}")
    try:
        with open(REMOTE_LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass
    return {"ok": True}


def clear_remote_signals():
    if os.path.exists(REMOTE_LOG_FILE):
        try:
            os.remove(REMOTE_LOG_FILE)
        except Exception:
            pass
    return {"ok": True}


SESSION = Session()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            with open(os.path.join(BASE, "web", "index.html"), "rb") as f:
                body = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif self.path == "/api/status":
            self._json(SESSION.status())
        else:
            self._json({"error": "not found"}, 404)

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        try:
            data = json.loads(self.rfile.read(n) or b"{}")
        except ValueError:
            data = {}
        routes = {
            "/api/start": lambda: SESSION.start(data),
            "/api/event": lambda: SESSION.event(data),
            "/api/stop": lambda: (SESSION.schedule_stop(data.get("delay"), data.get("summary"))
                                  if data.get("delay") is not None or data.get("auto")
                                  else SESSION.stop(data.get("summary"))),
            "/api/cancel-stop": SESSION.cancel_stop,
            "/api/test": SESSION.test,
            "/api/discover": lambda: {"cameras": cari_kamera.discover()},
            "/api/add-camera": lambda: add_camera(data),
            "/api/remove-camera": lambda: remove_camera(data),
            "/api/log-key": lambda: log_remote_signal(data),
            "/api/clear-log-key": clear_remote_signals,
        }
        fn = routes.get(self.path)
        self._json(fn() if fn else {"error": "not found"}, 200 if fn else 404)


def local_ips():
    ips = set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ips.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    return sorted(ips)


def main():
    if len(sys.argv) > 2 and sys.argv[1] == "--render":
        # python padel_cctv.py --render video.mp4 [--offset 1.5]
        if "--offset" in sys.argv:
            CFG["overlay"]["offset_seconds"] = float(sys.argv[sys.argv.index("--offset") + 1])
        out = overlay.render(sys.argv[2], CFG, progress=lambda p: print(f"\r  {p}%", end="", flush=True))
        print(f"\nSelesai: {out}")
        return
    if not shutil.which(CFG["ffmpeg"]) and not os.path.exists(CFG["ffmpeg"]):
        print("PERINGATAN: ffmpeg tidak ditemukan. Papan skor tetap jalan, tapi rekaman tidak bisa dibuat.")
        print("Windows: buka Command Prompt lalu ketik  winget install ffmpeg")
    port = int(CFG["port"])
    srv = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print("=" * 52)
    print(" Papan Skor Padel + CCTV")
    print(f" Buka di laptop ini : http://localhost:{port}")
    for ip in local_ips():
        print(f" Dari tablet/HP     : http://{ip}:{port}")
    print(f" Kamera             : {', '.join(c['name'] for c in CFG['cameras'])}")
    print(f" Folder rekaman     : {CFG['output_dir']}")
    print(" Tekan Ctrl+C untuk berhenti.")
    print("=" * 52)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nMenutup… rekaman yang sedang berjalan disimpan dulu.")
        SESSION.stop("dihentikan")
        srv.server_close()


if __name__ == "__main__":
    main()
