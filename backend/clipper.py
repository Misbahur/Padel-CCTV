"""
Modul Pemotong Video Klip Highlight (Padel CCTV Clipper)

Memotong klip momen seru berdasarkan tanda tombol Love ❤️ pada remote Mixio
yang tercatat di file `_klip.json` atau `_poin.jsonl`.
Menghasilkan:
1. File klip terpisah per momen (misal: 12s sebelum tombol ditekan s/d 3s setelahnya)
2. File kompilasi reels highlight gabungan (semua momen seru jadi 1 video)
"""

import json
import os
import re
import subprocess
import sys


def find_ff_tools(cfg=None):
    cfg = cfg or {}
    ffmpeg = cfg.get("ffmpeg") or "ffmpeg"
    ffprobe = cfg.get("ffprobe") or "ffprobe"
    return ffmpeg, ffprobe


def probe_duration(video_path, ffprobe="ffprobe"):
    """Mengambil durasi video dalam detik menggunakan ffprobe."""
    try:
        out = subprocess.run(
            [ffprobe, "-v", "error", "-select_streams", "v:0",
             "-show_entries", "format=duration", "-of", "json", video_path],
            capture_output=True, text=True, timeout=20
        )
        data = json.loads(out.stdout or "{}")
        dur_str = data.get("format", {}).get("duration", "0")
        return float(dur_str or 0)
    except Exception as e:
        print(f"⚠️ [Clipper] Gagal probe durasi video: {e}")
        return 0.0


def find_log_and_anchor(video_path):
    """Mencari file _poin.jsonl dan menghitung waktu anchor video."""
    folder, filename = os.path.split(os.path.abspath(video_path))
    best_log, best_pre = None, None
    for f in os.listdir(folder):
        if f.endswith("_poin.jsonl"):
            pre = f[:-len("_poin.jsonl")]
            if filename.startswith(pre) and (best_pre is None or len(pre) > len(best_pre)):
                best_log = os.path.join(folder, f)
                best_pre = pre
    if not best_log:
        return None, 0.0

    # Cari anchor
    suffix = filename[len(best_pre):]
    # Normalisasi suffix jika ada _skor
    suffix_clean = suffix.replace("_skor", "")
    evs = []
    try:
        with open(best_log, encoding="utf-8") as fl:
            for line in fl:
                line = line.strip()
                if line:
                    evs.append(json.loads(line))
    except Exception:
        pass

    anchor = None
    for e in evs:
        if e.get("event") == "video" and (e.get("suffix") == suffix or e.get("suffix") == suffix_clean):
            anchor = e.get("anchor")
            break
    if anchor is None:
        st = next((e for e in evs if e.get("event") == "mulai"), None)
        if st:
            anchor = st.get("w")
    return best_log, (anchor or 0.0)


def load_bookmarks(video_path):
    """
    Memuat daftar bookmark (penanda momen klip) untuk sebuah video.
    Mendahulukan file _klip.json, lalu fallback membaca event bookmark di _poin.jsonl.
    """
    folder, name = os.path.split(os.path.abspath(video_path))
    base_no_ext = os.path.splitext(name)[0]
    # Bersihkan _skor atau suffix kamera jika ada
    clean_base = re.sub(r"(_IP-Camera|_skor|\.mp4)+$", "", base_no_ext)

    # 1. Cek file _klip.json yang cocok di folder
    klip_files = [f for f in os.listdir(folder) if f.endswith("_klip.json")]
    for kf in klip_files:
        k_pre = kf[:-len("_klip.json")]
        if clean_base.startswith(k_pre) or k_pre.startswith(clean_base) or name.startswith(k_pre):
            k_path = os.path.join(folder, kf)
            try:
                with open(k_path, encoding="utf-8") as f:
                    data = json.load(f)
                    bms = data.get("bookmarks", [])
                    if bms:
                        return bms, k_path
            except Exception as e:
                print(f"⚠️ [Clipper] Gagal membaca {kf}: {e}")

    # 2. Fallback: Parse dari _poin.jsonl
    log_path, anchor = find_log_and_anchor(video_path)
    if log_path and os.path.isfile(log_path):
        bms = []
        try:
            with open(log_path, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        e = json.loads(line)
                        if e.get("event") == "bookmark":
                            bms.append(e)
                    except ValueError:
                        pass
            if bms:
                # Simpan juga ke file _klip.json agar ke depan langsung terbaca
                klip_target = log_path.replace("_poin.jsonl", "_klip.json")
                try:
                    payload = {
                        "court_id": 1,
                        "court_name": "Lapangan",
                        "total_bookmarks": len(bms),
                        "bookmarks": bms
                    }
                    with open(klip_target, "w", encoding="utf-8") as kf:
                        json.dump(payload, kf, indent=2, ensure_ascii=False)
                except Exception:
                    pass
                return bms, klip_target
        except Exception as e:
            print(f"⚠️ [Clipper] Gagal membaca log {log_path}: {e}")

    return [], None


def create_clips_for_video(video_path, cfg=None, pre_roll=None, post_roll=None, create_reel=None, progress_cb=None):
    """
    Membuat klip-klip highlight dari video pertandingan.
    
    Argumen:
    - video_path: path ke file video MP4 (sebaiknya yang sudah ada overlay skor)
    - cfg: konfigurasi (berisi path ffmpeg, ffprobe, clipping, dll)
    - pre_roll: detik sebelum tombol love ditekan (default dari config, misal 12.0s)
    - post_roll: detik sesudah tombol love ditekan (default dari config, misal 4.0s)
    - create_reel: jika True, menggabungkan klip menjadi 1 reel kompilasi highlight
    - progress_cb: callback fungsi progress (p: int 0..100)
    
    Mengembalikan dict hasil pemotongan klip.
    """
    if not os.path.isfile(video_path):
        raise FileNotFoundError(f"Video tidak ditemukan: {video_path}")

    cfg = cfg or {}
    clip_cfg = cfg.get("clipping", {})
    if not isinstance(clip_cfg, dict):
        clip_cfg = {}

    if pre_roll is None:
        pre_roll = float(clip_cfg.get("pre_roll_seconds", 12.0))
    else:
        pre_roll = float(pre_roll)

    if post_roll is None:
        post_roll = float(clip_cfg.get("post_roll_seconds", 4.0))
    else:
        post_roll = float(post_roll)

    if create_reel is None:
        create_reel = bool(clip_cfg.get("create_reel", True))

    ffmpeg, ffprobe = find_ff_tools(cfg)
    folder = os.path.dirname(os.path.abspath(video_path))
    filename = os.path.basename(video_path)
    base_name = os.path.splitext(filename)[0]

    bookmarks, klip_json_path = load_bookmarks(video_path)
    if not bookmarks:
        print(f"ℹ️ [Clipper] Tidak ada penanda momen klip (Love ❤️) untuk video: {filename}")
        return {"total": 0, "clips": [], "reel": None}

    total_dur = probe_duration(video_path, ffprobe)
    if total_dur <= 0:
        total_dur = 99999.0  # fallback jika ffprobe gagal

    log_path, anchor = find_log_and_anchor(video_path)

    print(f"✂️ [Clipper] Memproses {len(bookmarks)} momen klip (Pre-roll: {pre_roll}s, Post-roll: {post_roll}s, Total: {pre_roll+post_roll}s) untuk: {filename}")
    cut_clips = []
    temp_concat_files = []

    for idx, bm in enumerate(bookmarks):
        # Tentukan titik waktu penanda dalam video
        # Jika ada wall-time 'w' dan 'anchor', hitung selisihnya
        if bm.get("w") and anchor and bm["w"] >= anchor:
            t_mark = bm["w"] - anchor
        else:
            t_mark = float(bm.get("t", 0.0))

        start_time = max(0.0, t_mark - float(pre_roll))
        end_time = min(total_dur, t_mark + float(post_roll))
        duration = max(1.0, end_time - start_time)

        # Nama file klip rapi dan informatif
        time_clean = (bm.get("time_str") or f"{int(t_mark//60)}-{int(t_mark%60):02d}").replace(":", "-")
        skor_clean = re.sub(r"[^0-9\-]+", "_", bm.get("skor", "")).strip("_")
        skor_tag = f"_{skor_clean}" if skor_clean else ""

        clip_filename = f"{base_name}_klip_{idx+1:02d}_{time_clean}{skor_tag}.mp4"
        clip_path = os.path.join(folder, clip_filename)

        print(f"  🎬 Klip #{idx+1}: [{time_clean}] (mulai: {start_time:.1f}s, durasi: {duration:.1f}s) -> {clip_filename}")

        # Jalankan FFmpeg untuk memotong klip
        cmd = [
            ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
            "-ss", f"{start_time:.2f}",
            "-t", f"{duration:.2f}",
            "-i", video_path,
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart",
            clip_path
        ]
        
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode == 0 and os.path.isfile(clip_path) and os.path.getsize(clip_path) > 1024:
            rel_path = os.path.basename(clip_path)
            cut_clips.append({
                "index": idx + 1,
                "file": clip_filename,
                "path": clip_path,
                "time_str": bm.get("time_str", time_clean),
                "skor": bm.get("skor", ""),
                "start": start_time,
                "duration": duration,
                "size_mb": round(os.path.getsize(clip_path) / (1024 * 1024), 2)
            })
            temp_concat_files.append(clip_path)
        else:
            print(f"  ❌ Gagal memotong klip #{idx+1}: {proc.stderr[:160]}")

        if progress_cb and len(bookmarks) > 0:
            progress_cb(int((idx + 1) / (len(bookmarks) + (1 if create_reel else 0)) * 90))

    # Gabungkan menjadi 1 file Reels Highlight Kompilasi jika lebih dari 0 klip
    reel_path = None
    reel_filename = None
    if create_reel and temp_concat_files:
        reel_filename = f"{base_name}_highlights_reels.mp4"
        reel_path = os.path.join(folder, reel_filename)
        concat_txt_path = os.path.join(folder, f"{base_name}_concat_tmp.txt")

        try:
            with open(concat_txt_path, "w", encoding="utf-8") as cf:
                for cp in temp_concat_files:
                    # Escape path untuk concat filter ffmpeg
                    safe_cp = os.path.basename(cp).replace("'", "'\\''")
                    cf.write(f"file '{safe_cp}'\n")

            print(f"🎞️ [Clipper] Menggabungkan {len(temp_concat_files)} klip menjadi reels: {reel_filename}...")
            concat_cmd = [
                ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
                "-f", "concat", "-safe", "0",
                "-i", concat_txt_path,
                "-c", "copy",
                "-movflags", "+faststart",
                reel_path
            ]
            concat_proc = subprocess.run(concat_cmd, cwd=folder, capture_output=True, text=True)
            if concat_proc.returncode != 0 or not os.path.isfile(reel_path):
                # Fallback: re-encode jika copy stream berbeda
                concat_cmd = [
                    ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
                    "-f", "concat", "-safe", "0",
                    "-i", concat_txt_path,
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
                    "-c:a", "aac",
                    "-movflags", "+faststart",
                    reel_path
                ]
                subprocess.run(concat_cmd, cwd=folder, capture_output=True, text=True)

            if os.path.isfile(reel_path) and os.path.getsize(reel_path) > 1024:
                print(f"  ✅ Reels highlight berhasil dibuat: {reel_filename} ({round(os.path.getsize(reel_path)/1e6, 2)} MB)")
            else:
                reel_path = None
                reel_filename = None
        finally:
            if os.path.exists(concat_txt_path):
                try:
                    os.remove(concat_txt_path)
                except OSError:
                    pass

    # Perbarui file _klip.json dengan metadata klip & reel yang sudah jadi
    if klip_json_path and os.path.isfile(klip_json_path):
        try:
            with open(klip_json_path, "r", encoding="utf-8") as kf:
                data = json.load(kf)
            data["clips"] = cut_clips
            data["reel_video"] = reel_filename
            data["clipping_settings"] = {
                "pre_roll_seconds": pre_roll,
                "post_roll_seconds": post_roll,
                "duration_seconds": round(pre_roll + post_roll, 1)
            }
            with open(klip_json_path, "w", encoding="utf-8") as kf:
                json.dump(data, kf, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"⚠️ [Clipper] Gagal memperbarui metadata di {klip_json_path}: {e}")

    if progress_cb:
        progress_cb(100)

    return {
        "total": len(cut_clips),
        "clips": cut_clips,
        "reel": reel_filename,
        "reel_path": reel_path
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Penggunaan: python backend/clipper.py <path_ke_video.mp4>")
        sys.exit(1)
    target_vid = sys.argv[1]
    res = create_clips_for_video(target_vid)
    print(json.dumps(res, indent=2))
