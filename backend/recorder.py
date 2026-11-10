"""
Manajemen perekaman CCTV (`CameraRecorder`), sesi pertandingan per lapangan (`Session`),
antrean render video overlay (`RenderQueue`), serta penambahan/penghapusan kamera.
"""
import datetime
import json
import os
import queue
import re
import subprocess
import threading
import time

from backend import clipper, overlay
from backend.cleanup import clean_old_recordings
from backend.config import (
    BASE,
    CFG,
    COURT_DEFAULT,
    PLACEHOLDER,
    mask_rtsp,
    save_cameras,
    save_court_names,
    save_court_settings,
)
from tools import cari_kamera

SESSIONS = {}   # court_id (int) -> Session
RENDERS = {}    # court_id (int) -> RenderQueue


def slug(s, n=24):
    """Konversi nama tim/kamera menjadi slug aman untuk nama file."""
    cleaned = re.sub(r"[^A-Za-z0-9]+", "-", str(s)).strip("-")
    return cleaned[:n] or "Tim"


def _court_state_path(court_id: int) -> str:
    return os.path.join(BASE, f"court_{court_id}_state.json")


def save_court_state(court_id: int, state):
    """Menyimpan status skor pertandingan terakhir agar tahan mati lampu / restart."""
    fpath = _court_state_path(court_id)
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


def load_court_state(court_id: int):
    """Memuat status skor pertandingan terakhir saat server mulai / restart."""
    fpath = _court_state_path(court_id)
    if os.path.exists(fpath):
        try:
            with open(fpath, encoding="utf-8") as f:
                return json.load(f)
        except (OSError, json.JSONDecodeError):
            return None
    return None


class CameraRecorder:
    """Merekam satu kamera RTSP via FFmpeg; otomatis menyambung ulang ke file _partN jika putus."""

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
        self.started_at = 0.0

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
        cmd = [
            ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
            "-rtsp_transport", "tcp", "-i", self.url,
            "-map", "0:v:0",
        ]
        if self._court_cfg.get("audio", True):
            cmd += ["-map", "0:a:0?", "-c:a", "aac", "-b:a", "96k"]
        cmd += [
            "-c:v", "copy",
            "-movflags", "+frag_keyframe+empty_moov+default_base_moof",
            "-progress", "pipe:1", "-stats_period", "0.5", "-nostats",
            "-f", "mp4", out,
        ]
        log = open(self.log_path, "a", encoding="utf-8")
        log.write(f"\n[{datetime.datetime.now():%H:%M:%S}] mulai {mask_rtsp(self.url)} -> {os.path.basename(out)}\n")
        log.flush()
        self.proc = subprocess.Popen(
            cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=log, text=True, bufsize=1
        )
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
                anchor = time.time() - us / 1e6
                if i < len(self.anchors):
                    self.anchors[i] = anchor if self.anchors[i] is None else min(self.anchors[i], anchor)
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
        return [
            (f, a) for f, a in zip(self.files, self.anchors)
            if os.path.exists(f) and os.path.getsize(f) > 1024
        ]

    def status(self):
        alive = bool(self.active and self.proc and self.proc.poll() is None)
        size = 0
        if self.files and os.path.exists(self.files[-1]):
            size = os.path.getsize(self.files[-1])
        recording = alive and size > 0
        return {
            "name": self.name,
            "recording": recording,
            "connecting": alive and not recording,
            "placeholder": PLACEHOLDER in self.url,
            "error": self.error,
            "file": os.path.basename(self.files[-1]) if self.files else "",
            "mb": round(size / 1e6, 1),
        }


class Session:
    """State pertandingan, log poin `.jsonl`, penanda momen klip, & kontrol rekam satu lapangan."""

    def __init__(self, court_cfg):
        self._cfg = court_cfg
        self.lock = threading.Lock()
        self.recorders = [CameraRecorder(c, court_cfg) for c in court_cfg.get("cameras", [])]
        self.recording = False
        self.has_board = False
        self.t0 = 0
        self.base = ""
        self.match_dir = ""
        self.events_path = ""
        self.stop_timer = None
        self.stop_at = 0
        self.recent = []
        self.bookmarks = []
        self.match_state = load_court_state(court_cfg.get("id"))
        self._render_q = None

    def reset_match(self):
        with self.lock:
            self.match_state = None
            self.bookmarks = []
            fpath = _court_state_path(self._cfg["id"])
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
                "bookmarks": list(self.bookmarks),
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
                save_court_state(self._cfg["id"], self.match_state)
            names = info.get("names") or self._cfg.get("names") or ["Tim A", "Tim B"]
            rules = self._cfg.setdefault("match_rules", dict(COURT_DEFAULT["match_rules"]))
            if "mode" in info:
                rules["mode"] = info["mode"]
            if "match_rules" in info and isinstance(info["match_rules"], dict):
                rules.update({k: v for k, v in info["match_rules"].items() if k in ("mode", "bestOf", "games", "superTb", "target")})
            save_court_settings(self._cfg["id"], rules=rules, names=names)

            stamp = datetime.datetime.now()
            folder_name = f"{stamp:%Y-%m-%d_%H-%M-%S}_{slug(names[0])}-vs-{slug(names[1])}"
            self.match_dir = os.path.join(self._cfg["output_dir"], folder_name)
            os.makedirs(self.match_dir, exist_ok=True)
            threading.Thread(target=clean_old_recordings, daemon=True).start()

            self.base = os.path.join(
                self.match_dir,
                f"{stamp:%Y%m%d_%H%M%S}_{slug(names[0])}-vs-{slug(names[1])}",
            )
            for r in self.recorders:
                r.start(self.base)
            self.recording = True
            self.has_board = True
            self.t0 = time.time()
            self.events_path = self.base + "_poin.jsonl"
            self._write_event({
                "event": "mulai",
                "names": names,
                "mode": info.get("mode"),
                "waktu": stamp.isoformat(timespec="seconds"),
            })
            print(f"● REKAM [{self._cfg['name']}]: {folder_name}")
            return {"ok": True, "folder": folder_name}

    def _write_event(self, data):
        if not self.events_path:
            return
        now = time.time()
        payload = {"t": round(now - self.t0, 1), "w": round(now, 3), **data}
        with open(self.events_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=False) + "\n")

    def set_settings(self, data):
        with self.lock:
            rules = self._cfg.setdefault("match_rules", dict(COURT_DEFAULT["match_rules"]))
            if not self.recording:
                if "mode" in data and data["mode"] in ("golden", "adv", "star", "americano"):
                    rules["mode"] = data["mode"]
                for int_key in ("bestOf", "games", "target"):
                    if int_key in data:
                        try:
                            rules[int_key] = int(data[int_key])
                        except (ValueError, TypeError):
                            pass
                if "superTb" in data:
                    rules["superTb"] = bool(data["superTb"])

            clean_names = None
            if data.get("names") and len(data["names"]) >= 2:
                clean_names = [str(data["names"][0]).strip() or "Tim A", str(data["names"][1]).strip() or "Tim B"]
                self._cfg["names"] = clean_names

            save_court_settings(self._cfg["id"], rules=rules, names=clean_names)
            if self.recording and clean_names:
                self._write_event({"event": "ganti_nama", "names": clean_names})
            return {"ok": True, "settings": rules, "names": self._cfg.get("names"), "locked": self.recording}

    def set_names(self, names):
        with self.lock:
            if names and len(names) >= 2:
                clean_names = [str(names[0]).strip() or "Tim A", str(names[1]).strip() or "Tim B"]
                self._cfg["names"] = clean_names
                save_court_names(self._cfg["id"], clean_names)
                if self.recording:
                    self._write_event({"event": "ganti_nama", "names": clean_names})
                return {"ok": True, "names": clean_names}
            return {"ok": False, "message": "Format nama pemain tidak valid"}

    def event(self, data):
        with self.lock:
            if data.get("event") == "ganti_nama" and data.get("names"):
                return self.set_names(data["names"])
            if data.get("state") and isinstance(data["state"], dict):
                self.match_state = data["state"]
                save_court_state(self._cfg["id"], self.match_state)
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
                        "note": data.get("note", "highlight"),
                    }
                    self.bookmarks.append(bm)
                    self._save_bookmarks_file()
                    print(
                        f"❤️ PENANDA MOMEN KLIP [{self._cfg['name']}]: #{len(self.bookmarks)} "
                        f"pada {bm['time_str']} (Skor: {bm['skor']})"
                    )
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

            def _moved(f):
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
            for f, _ in vids:
                nf = _moved(f)
                paths.append(nf)
                rel_name = os.path.relpath(nf, self._cfg["output_dir"]).replace("\\", "/")
                final.append(rel_name)

            for f in [self.events_path] + [r.log_path for r in self.recorders]:
                _moved(f)

            if self.bookmarks:
                self._save_bookmarks_file(newbase)

            ov = self._cfg.get("overlay", {})
            if ov.get("enabled", True) and getattr(self, "has_board", False):
                if self._render_q:
                    for pth in paths:
                        self._render_q.add(pth)
            elif paths:
                def _clip_raw(p):
                    try:
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
                    [
                        probe, "-v", "error", "-rtsp_transport", "tcp",
                        "-select_streams", "v:0",
                        "-show_entries", "stream=codec_name,width,height",
                        "-of", "json", c["rtsp"],
                    ],
                    capture_output=True, text=True, timeout=15,
                )
                if out.returncode == 0:
                    s = json.loads(out.stdout).get("streams", [{}])[0]
                    res.append({
                        "name": c["name"],
                        "ok": True,
                        "info": f"{s.get('codec_name', '?')} {s.get('width', '?')}×{s.get('height', '?')}",
                    })
                else:
                    res.append({
                        "name": c["name"],
                        "ok": False,
                        "info": (out.stderr.strip().splitlines() or ["gagal"])[-1][:160],
                    })
            except subprocess.TimeoutExpired:
                res.append({
                    "name": c["name"],
                    "ok": False,
                    "info": "Tidak ada jawaban dari kamera (cek IP dan jaringan)",
                })
            except FileNotFoundError:
                res.append({
                    "name": c["name"],
                    "ok": False,
                    "info": "ffprobe tidak ditemukan. Pasang ffmpeg dulu.",
                })
        return {"results": res}


class RenderQueue:
    """Membuat video dengan papan skor satu per satu di latar belakang, lalu memotong klip highlight."""

    def __init__(self, court_cfg):
        self._court_cfg = court_cfg
        self.q = queue.Queue()
        self.jobs = []
        self.lock = threading.Lock()
        threading.Thread(target=self._run, daemon=True).start()

    def add(self, path):
        rel_file = os.path.relpath(path, self._court_cfg["output_dir"]).replace("\\", "/")
        job = {"file": rel_file, "path": path, "state": "antre", "progress": 0, "error": ""}
        with self.lock:
            self.jobs.insert(0, job)
            del self.jobs[8:]
        self.q.put(job)

    def _run(self):
        while True:
            job = self.q.get()
            job["state"] = "proses"
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

                try:
                    clip_info = clipper.create_clips_for_video(out, merged)
                    if clip_info and clip_info.get("total", 0) > 0:
                        job["clips"] = clip_info.get("clips", [])
                        job["reel"] = clip_info.get("reel")
                        print(
                            f"✨ Highlights [{self._court_cfg['name']}]: "
                            f"Berhasil membuat {clip_info['total']} klip & reels momen seru!"
                        )
                except Exception as ce:
                    print(f"⚠️ [Clipper] Gagal membuat klip highlight: {ce}")
            except Exception as e:
                job.update(state="gagal", error=str(e)[:200])
                print(f"✗ Gagal membuat video skor [{self._court_cfg['name']}] {job['file']}: {e}")

    def status(self):
        with self.lock:
            return [
                {k: j.get(k) for k in ("file", "state", "progress", "error", "out")}
                for j in self.jobs
            ]


def init_sessions():
    """Inisialisasi Session dan RenderQueue untuk semua lapangan aktif di CFG."""
    for court_cfg in CFG.get("courts", []):
        cid = court_cfg["id"]
        if cid in SESSIONS:
            continue
        sess = Session(court_cfg)
        rq = RenderQueue(court_cfg)
        sess._render_q = rq
        SESSIONS[cid] = sess
        RENDERS[cid] = rq
    return SESSIONS, RENDERS


def _attach_camera_to_court(court_id: int, name: str, rtsp_url: str, busy_message: str):
    """Helper bersama untuk menyimpan kamera baru ke config/.env dan me-reload recorder."""
    sess = SESSIONS.get(court_id)
    if not sess:
        return {"ok": False, "message": f"Lapangan {court_id} tidak ditemukan"}
    with sess.lock:
        if sess.recording:
            return {"ok": False, "message": busy_message}
        court_cfg = next((c for c in CFG.get("courts", []) if c["id"] == court_id), None)
        if not court_cfg:
            return {"ok": False, "message": "Konfigurasi lapangan tidak ditemukan"}
        cams = [
            c for c in court_cfg.get("cameras", [])
            if PLACEHOLDER not in c.get("rtsp", "") and c.get("name") != name
        ]
        cams.append({"name": name, "rtsp": rtsp_url})
        save_cameras(court_id, cams)
        sess.recorders = [CameraRecorder(c, sess._cfg) for c in court_cfg.get("cameras", [])]
    return None


def add_camera(court_id: int, data: dict) -> dict:
    """Tambahkan kamera ke lapangan melalui URL RTSP langsung atau probe ONVIF/IP."""
    custom_rtsp = (data.get("rtsp") or "").strip()
    name = (data.get("name") or "").strip()
    sess = SESSIONS.get(court_id)
    if not sess:
        return {"ok": False, "message": f"Lapangan {court_id} tidak ditemukan"}

    if custom_rtsp:
        if not custom_rtsp.startswith("rtsp://"):
            return {"ok": False, "message": "Alamat RTSP harus diawali dengan rtsp://"}
        name = name or f"Kamera {len(sess.recorders) + 1}"
        err = _attach_camera_to_court(
            court_id, name, custom_rtsp, "Tidak bisa menyimpan kamera saat sedang merekam."
        )
        return err or {"ok": True, "name": name, "label": "RTSP Manual", "info": "Tersimpan"}

    ip = (data.get("ip") or "").strip()
    port = data.get("port")
    if not re.match(r"^\d{1,3}(\.\d{1,3}){3}$", ip):
        return {"ok": False, "message": "Tulis IP kamera, contoh 192.168.1.50 atau masukkan URL RTSP manual"}

    res = cari_kamera.probe(
        ip,
        (data.get("user") or "admin").strip(),
        data.get("password") or "",
        CFG.get("ffprobe") or "ffprobe",
        port=port,
    )
    if not res["ok"]:
        return res

    name = name or f"Kamera {ip.split('.')[-1]}"
    err = _attach_camera_to_court(
        court_id, name, res["url"], "Kamera ditemukan, tapi tidak bisa disimpan saat sedang merekam."
    )
    return err or {"ok": True, "name": name, "label": res["label"], "info": res["info"]}


def remove_camera(court_id: int, data: dict) -> dict:
    """Hapus kamera tertentu dari daftar kamera lapangan."""
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
        save_cameras(court_id, cams)
        sess.recorders = [CameraRecorder(c, sess._cfg) for c in court_cfg.get("cameras", [])]
    return {"ok": True}
