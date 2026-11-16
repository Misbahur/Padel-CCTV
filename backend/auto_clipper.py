"""
Modul Auto-Clip AI (Fase 2 - Deteksi Gerakan Visual + Energi Audio Lokal).

Menganalisis video pertandingan untuk mendeteksi momen reli/gerakan intensitas tinggi
dan lonjakan suara smash/sorakan secara otomatis tanpa mengganggu proses rekaman maupun render skor utama.
Mendukung pilihan mode deteksi (Gerakan+Suara, Gerakan Saja, Suara Saja), auto-fallback bila audio bisu,
pilihan target jumlah klip, dan format output (Landscape 16:9, Vertical 9:16, Square 1:1).
"""
from datetime import datetime
import json
import os
import re
import subprocess

from backend.clipper import concat_clips_to_reel, find_ff_tools, probe_duration

try:
    import cv2
    import numpy as np
    CV2_AVAILABLE = True
    CV2_IMPORT_ERROR = ""
except ImportError as exc:
    CV2_AVAILABLE = False
    CV2_IMPORT_ERROR = str(exc)

AUTO_KLIP_META = "_auto_klip.json"

DETECTION_MODES = ("motion_audio", "motion", "audio")
FORMAT_CHOICES = ("landscape", "vertical", "square")
CROP_FOCUS_MAP = {
    "left": 0.15,
    "center": 0.50,
    "right": 0.85,
}


def build_format_vf(output_format: str = "landscape", crop_focus: str = "center"):
    """Bangun filter video FFmpeg sesuai format output (16:9, 9:16 Reels/TikTok, atau 1:1 Square)."""
    fmt = (output_format or "landscape").lower().strip()
    if fmt == "landscape":
        return None

    focus_ratio = CROP_FOCUS_MAP.get((crop_focus or "center").lower().strip(), 0.50)

    if fmt == "vertical":
        # Crop rasio 9:16 lalu skala ke 1080x1920 penuh siap upload Reels/TikTok/Shorts
        return (
            f"crop='min(iw,trunc(ih*9/16/2)*2)':'trunc(ih/2)*2':"
            f"'max(0,min(iw-ow,(iw-ow)*{focus_ratio:.2f}))':'0',"
            "scale=1080:1920:force_original_aspect_ratio=decrease,"
            "pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1"
        )

    if fmt == "square":
        # Crop rasio 1:1 lalu skala ke 1080x1080 untuk feed media sosial
        return (
            f"crop='min(iw,trunc(ih/2)*2)':'min(ih,trunc(iw/2)*2)':"
            f"'max(0,min(iw-ow,(iw-ow)*{focus_ratio:.2f}))':'0',"
            "scale=1080:1080:force_original_aspect_ratio=decrease,"
            "pad=1080:1080:(ow-iw)/2:(oh-ih)/2,setsar=1"
        )

    return None


def _ffmpeg_cut_auto(
    video_path: str,
    start_sec: float,
    duration: float,
    output_path: str,
    ffmpeg: str = "ffmpeg",
    output_format: str = "landscape",
    crop_focus: str = "center",
) -> bool:
    """Potong satu segmen klip menggunakan FFmpeg dengan opsi crop format output."""
    cmd = [
        ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
        "-ss", f"{max(0.0, start_sec):.2f}",
        "-i", video_path,
        "-t", f"{max(1.0, duration):.2f}",
    ]
    vf = build_format_vf(output_format, crop_focus)
    if vf:
        cmd += ["-vf", vf]
    cmd += [
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
        output_path,
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
        return proc.returncode == 0 and os.path.isfile(output_path) and os.path.getsize(output_path) > 1024
    except Exception:
        return False


def compute_motion_scores(video_path: str, sample_fps: float = 3.0, progress_cb=None) -> list:
    """
    Hitung skor aktivitas gerakan per detik dari video menggunakan OpenCV.
    Menggunakan sub-sampling (~3 fps) dan grab/retrieve agar cepat bahkan untuk video 90 menit.
    Mengembalikan list tuple (detik, skor_gerakan).
    """
    if not CV2_AVAILABLE:
        raise RuntimeError(
            "OpenCV/NumPy belum terinstall. Jalankan: pip install opencv-python-headless numpy"
        )

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Tidak bisa membuka video: {video_path}")

    fps = float(cap.get(cv2.CAP_PROP_FPS) or 25.0)
    if fps <= 0 or fps > 240:
        fps = 25.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    total_seconds = max(1, int(total_frames / fps)) if total_frames > 0 else 0

    frame_step = max(1, int(round(fps / max(1.0, sample_fps))))
    sec_buckets = {}
    prev_gray = None
    frame_idx = 0

    try:
        while True:
            grabbed = cap.grab()
            if not grabbed:
                break

            if frame_idx % frame_step == 0:
                ret, frame = cap.retrieve()
                if not ret or frame is None:
                    break
                small = cv2.resize(frame, (320, 180))
                gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)

                sec = int(frame_idx / fps)
                if prev_gray is not None:
                    diff = cv2.absdiff(gray, prev_gray)
                    score = float(np.mean(diff))
                    sec_buckets.setdefault(sec, []).append(score)
                else:
                    sec_buckets.setdefault(sec, [0.0])
                prev_gray = gray

                if progress_cb and total_seconds > 0:
                    progress_cb(min(1.0, sec / total_seconds))

            frame_idx += 1
    finally:
        cap.release()

    if not sec_buckets:
        return []

    max_sec = max(sec_buckets.keys())
    scores = []
    last_val = 0.0
    for s in range(max_sec + 1):
        vals = sec_buckets.get(s)
        if vals:
            last_val = float(np.mean(vals))
        scores.append((s, last_val))

    return scores


def _gaussian_smooth(values: "np.ndarray", sigma: float) -> "np.ndarray":
    """Gaussian smoothing 1D murni dengan NumPy (tanpa dependency SciPy)."""
    if sigma <= 0 or len(values) < 3:
        return values.astype(float)
    radius = max(1, int(round(3.0 * sigma)))
    x = np.arange(-radius, radius + 1, dtype=float)
    kernel = np.exp(-0.5 * (x / sigma) ** 2)
    kernel /= kernel.sum()
    padded = np.pad(values.astype(float), pad_width=radius, mode="edge")
    return np.convolve(padded, kernel, mode="valid")


def _find_peaks_np(
    values: "np.ndarray",
    distance: int,
    min_prominence: float = 0.0,
    min_height: float = 0.0,
) -> list:
    """Temukan puncak lokal berdasarkan ketinggian minimum, prominence, dan jarak minimum (murni NumPy)."""
    n = len(values)
    if n < 3:
        return []

    # Deteksi local maxima termasuk plateau sederhana
    candidates = []
    i = 1
    while i < n - 1:
        if values[i] > values[i - 1]:
            if values[i] > values[i + 1]:
                candidates.append(i)
            elif values[i] == values[i + 1]:
                j = i + 1
                while j < n - 1 and values[j] == values[i]:
                    j += 1
                if j < n and values[j] < values[i]:
                    candidates.append((i + j - 1) // 2)
                i = j
                continue
        i += 1

    scored = []
    for idx in candidates:
        h = float(values[idx])
        if h < min_height:
            continue

        left_min = h
        for li in range(idx - 1, -1, -1):
            val = float(values[li])
            if val < left_min:
                left_min = val
            if val > h:
                break

        right_min = h
        for ri in range(idx + 1, n):
            val = float(values[ri])
            if val < right_min:
                right_min = val
            if val > h:
                break

        prom = h - max(left_min, right_min)
        if prom >= min_prominence:
            scored.append((idx, h, prom))

    # Urutkan tertinggi terlebih dulu lalu saring sesuai jarak minimum (greedy)
    scored.sort(key=lambda item: item[1], reverse=True)
    selected = []
    for idx, _h, prom in scored:
        if all(abs(idx - kept_idx) >= distance for kept_idx, _ in selected):
            selected.append((idx, prom))

    selected.sort(key=lambda item: item[1], reverse=True)
    return selected


def find_highlight_peaks(scores: list, sensitivity: float = 0.5, min_gap_sec: int = 15) -> list:
    """
    Deteksi puncak momen paling aktif dari deret skor gerakan per detik.
    Mengembalikan daftar tuple (peak_second, prominence_score) terurut dari yang paling seru.
    """
    if not scores:
        return []

    sens = max(0.0, min(1.0, float(sensitivity)))
    times = [s[0] for s in scores]
    values = np.array([s[1] for s in scores], dtype=float)

    if len(values) < 3:
        best_i = int(np.argmax(values))
        return [(times[best_i], float(values[best_i]))]

    sigma = 2.5 if len(values) >= 20 else 1.0
    smoothed = _gaussian_smooth(values, sigma=sigma)

    mean_val = float(np.mean(smoothed))
    std_val = float(np.std(smoothed))
    effective_gap = max(2, min(int(min_gap_sec), max(2, len(values) // 3)))

    prominence = max(0.05, std_val * (1.8 - sens * 1.5))
    min_height = mean_val + std_val * (0.8 - sens * 0.9)

    peaks = _find_peaks_np(
        smoothed,
        distance=effective_gap,
        min_prominence=prominence,
        min_height=max(0.0, min_height),
    )

    if not peaks and std_val > 0.02:
        peaks = _find_peaks_np(
            smoothed,
            distance=effective_gap,
            min_prominence=max(0.02, std_val * 0.35),
            min_height=0.0,
        )

    if not peaks:
        best_i = int(np.argmax(smoothed))
        return [(times[best_i], round(float(smoothed[best_i]), 3))]

    return [(times[idx], round(float(prom), 3)) for idx, prom in peaks]


def has_audio_stream(video_path: str, ffprobe: str = "ffprobe") -> bool:
    """Periksa apakah file video memiliki stream audio yang valid."""
    if not os.path.isfile(video_path):
        return False
    cmd = [
        ffprobe, "-v", "error",
        "-select_streams", "a",
        "-show_entries", "stream=codec_name",
        "-of", "default=noprint_wrappers=1:nokey=1",
        video_path,
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        return bool(proc.stdout.strip())
    except Exception:
        return False


def compute_audio_scores(
    video_path: str,
    ffmpeg: str = "ffmpeg",
    ffprobe: str = "ffprobe",
    sample_rate: int = 8000,
    progress_cb=None,
) -> tuple:
    """
    Ekstrak energi audio per detik (RMS & peak amplitude) menggunakan FFmpeg + NumPy murni.
    Mendeteksi lonjakan suara keras (smash, pantulan kaca, sorakan).
    Mengembalikan (scores, meta) di mana:
      scores = list tuple (detik, skor_audio 0.0 - 1.0)
      meta = {"has_audio": bool, "is_silent": bool, "max_rms": float, "mean_rms": float}
    """
    empty_meta = {"has_audio": False, "is_silent": True, "max_rms": 0.0, "mean_rms": 0.0}
    if not has_audio_stream(video_path, ffprobe):
        return [], empty_meta

    cmd = [
        ffmpeg, "-hide_banner", "-loglevel", "error",
        "-i", video_path,
        "-vn", "-ac", "1", "-ar", str(sample_rate),
        "-f", "s16le", "-",
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=300)
        if proc.returncode != 0 or not proc.stdout:
            return [], empty_meta
    except Exception:
        return [], empty_meta

    samples = np.frombuffer(proc.stdout, dtype=np.int16)
    if len(samples) < sample_rate:
        return [], empty_meta

    total_sec = len(samples) // sample_rate
    rms_arr = np.zeros(total_sec, dtype=float)
    peak_arr = np.zeros(total_sec, dtype=float)

    for s in range(total_sec):
        chunk = samples[s * sample_rate : (s + 1) * sample_rate].astype(float)
        rms_arr[s] = np.sqrt(np.mean(chunk ** 2))
        peak_arr[s] = np.max(np.abs(chunk))

    max_rms = float(np.max(rms_arr)) if total_sec > 0 else 0.0
    mean_rms = float(np.mean(rms_arr)) if total_sec > 0 else 0.0
    std_rms = float(np.std(rms_arr)) if total_sec > 0 else 0.0

    # Deteksi apakah audio hening / mati / mic off
    is_silent = max_rms < 60.0 or std_rms < 8.0

    if is_silent:
        return [], {
            "has_audio": True,
            "is_silent": True,
            "max_rms": round(max_rms, 1),
            "mean_rms": round(mean_rms, 1),
        }

    def _norm(arr):
        mn, mx = np.min(arr), np.max(arr)
        return (arr - mn) / (mx - mn) if (mx - mn) > 1e-6 else np.zeros_like(arr)

    norm_rms = _norm(rms_arr)
    norm_peak = _norm(peak_arr)

    composite = 0.60 * norm_rms + 0.40 * norm_peak
    smoothed = _gaussian_smooth(composite, sigma=1.2)

    scores = [(s, round(float(smoothed[s]), 4)) for s in range(total_sec)]
    return scores, {
        "has_audio": True,
        "is_silent": False,
        "max_rms": round(max_rms, 1),
        "mean_rms": round(mean_rms, 1),
    }


def combine_scores(
    motion_scores: list,
    audio_scores: list,
    motion_weight: float = 0.5,
    audio_weight: float = 0.5,
) -> list:
    """
    Gabungkan deret skor gerakan (visual) dan skor audio menjadi satu deret skor komposit.
    Panjang diselaraskan secara otomatis dengan penyesuaian durasi maksimal.
    """
    if not motion_scores and not audio_scores:
        return []
    if not audio_scores:
        return motion_scores
    if not motion_scores:
        return audio_scores

    max_sec = max(motion_scores[-1][0], audio_scores[-1][0])
    m_dict = dict(motion_scores)
    a_dict = dict(audio_scores)

    m_vals = np.array([m_dict.get(s, 0.0) for s in range(max_sec + 1)], dtype=float)
    a_vals = np.array([a_dict.get(s, 0.0) for s in range(max_sec + 1)], dtype=float)

    def _minmax(arr):
        mn, mx = np.min(arr), np.max(arr)
        return (arr - mn) / (mx - mn) if (mx - mn) > 1e-6 else np.zeros_like(arr)

    norm_m = _minmax(m_vals)
    norm_a = _minmax(a_vals)

    w_m = max(0.05, float(motion_weight))
    w_a = max(0.05, float(audio_weight))
    total_w = w_m + w_a

    combined = (w_m * norm_m + w_a * norm_a) / total_w
    return [(s, round(float(combined[s]), 4)) for s in range(max_sec + 1)]


def _cleanup_old_auto_files(session_folder: str):
    """Hapus hasil auto-klip lama di folder sesi sebelum membuat set baru."""
    try:
        for fname in os.listdir(session_folder):
            if ("_auto_klip_" in fname or "_auto_reel" in fname) and fname.endswith(".mp4"):
                try:
                    os.remove(os.path.join(session_folder, fname))
                except OSError:
                    pass
    except OSError:
        pass


def run_auto_clip(
    video_path: str,
    session_folder: str,
    cfg: dict,
    max_clips: int = None,
    detection_mode: str = None,
    sensitivity: float = None,
    sensitivity_motion: float = None,
    sensitivity_audio: float = None,
    pre_roll: float = None,
    post_roll: float = None,
    min_gap: int = None,
    output_format: str = None,
    crop_focus: str = None,
    create_reel: bool = None,
    progress_cb=None,
) -> dict:
    """
    Pipeline utama Auto-Clip AI Fase 2:
    1. Periksa ketersediaan audio & mode deteksi (Gerakan+Suara / Gerakan Saja / Suara Saja)
    2. Fallback otomatis ke Gerakan Saja jika video tidak memiliki audio / audio hening
    3. Analisis visual reli (OpenCV) & lonjakan volume audio (FFmpeg)
    4. Cari puncak momen terbaik sesuai sensitivitas & target max_clips
    5. Potong klip via FFmpeg sesuai format (Landscape 16:9 / Vertical 9:16 / Square 1:1)
    6. Gabungkan menjadi auto-reel (opsional) dan simpan metadata _auto_klip.json
    """
    if not CV2_AVAILABLE:
        return {
            "success": False,
            "error": (
                "Library OpenCV/NumPy belum terinstall di server. "
                "Jalankan: pip install -r requirements.txt"
            ),
        }

    if not os.path.isfile(video_path):
        return {"success": False, "error": f"File video tidak ditemukan: {video_path}"}

    auto_cfg = (cfg or {}).get("auto_clipping", {})
    mode_req = (detection_mode or auto_cfg.get("detection_mode", "motion_audio")).lower().strip()
    if mode_req not in DETECTION_MODES:
        mode_req = "motion_audio"

    sens = float(sensitivity if sensitivity is not None else auto_cfg.get("sensitivity", 0.5))
    sens_m = float(sensitivity_motion if sensitivity_motion is not None else auto_cfg.get("sensitivity_motion", sens))
    sens_a = float(sensitivity_audio if sensitivity_audio is not None else auto_cfg.get("sensitivity_audio", sens))
    limit_clips = max(1, int(max_clips if max_clips is not None else auto_cfg.get("max_clips", 5)))
    pre = max(1.0, float(pre_roll if pre_roll is not None else auto_cfg.get("pre_roll_seconds", 10.0)))
    post = max(1.0, float(post_roll if post_roll is not None else auto_cfg.get("post_roll_seconds", 4.0)))
    gap = max(3, int(min_gap if min_gap is not None else auto_cfg.get("min_gap_seconds", 15)))
    fmt = (output_format or auto_cfg.get("output_format", "landscape")).lower().strip()
    if fmt not in FORMAT_CHOICES:
        fmt = "landscape"
    focus = (crop_focus or auto_cfg.get("crop_focus", "center")).lower().strip()
    if focus not in CROP_FOCUS_MAP:
        focus = "center"
    want_reel = bool(auto_cfg.get("create_reel", True) if create_reel is None else create_reel)

    ffmpeg, ffprobe = find_ff_tools(cfg)

    try:
        has_audio = False
        is_silent = False
        fallback_applied = False
        fallback_reason = ""
        actual_mode = mode_req

        audio_scores = []
        audio_meta = {}

        # ── 1. Analisis Audio (bila mode motion_audio atau audio) ────────
        if mode_req in ("motion_audio", "audio"):
            if progress_cb:
                progress_cb(0.04, "Menganalisis spektrum energi suara (smash & sorakan)...")
            audio_scores, audio_meta = compute_audio_scores(
                video_path,
                ffmpeg=ffmpeg,
                ffprobe=ffprobe,
                sample_rate=8000,
            )
            has_audio = audio_meta.get("has_audio", False)
            is_silent = audio_meta.get("is_silent", True)

            if not has_audio or is_silent:
                fallback_applied = True
                if not has_audio:
                    fallback_reason = "Video tidak memiliki track audio. Analisis otomatis dialihkan ke Gerakan Saja."
                else:
                    fallback_reason = "Audio terdeteksi hening/tanpa mic aktif. Analisis otomatis dialihkan ke Gerakan Saja."
                actual_mode = "motion"

        # ── 2. Analisis Gerakan Visual (bila mode motion_audio atau motion) ──
        motion_scores = []
        if actual_mode in ("motion_audio", "motion"):
            start_pct = 0.12 if mode_req == "motion_audio" else 0.04
            end_pct = 0.52
            if progress_cb:
                progress_cb(start_pct, "Memindai pergerakan visual pemain di video (OpenCV)...")
            motion_scores = compute_motion_scores(
                video_path,
                sample_fps=3.0,
                progress_cb=lambda p: progress_cb(
                    start_pct + p * (end_pct - start_pct),
                    "Menganalisis intensitas reli dan kecepatan bola...",
                ) if progress_cb else None,
            )
            if not motion_scores:
                return {"success": False, "error": "Gagal membaca frame visual dari video sumber"}

        # ── 3. Penyatuan Skor Sesuai Mode ─────────────────────────────────
        if actual_mode == "motion_audio":
            if progress_cb:
                progress_cb(0.54, "Menggabungkan intensitas reli visual dan hentakan audio...")
            scores = combine_scores(
                motion_scores=motion_scores,
                audio_scores=audio_scores,
                motion_weight=sens_m,
                audio_weight=sens_a,
            )
        elif actual_mode == "audio":
            scores = audio_scores
        else:  # actual_mode == "motion"
            scores = motion_scores

        if not scores:
            return {"success": False, "error": "Tidak ada data skor aktivitas yang dihasilkan"}

        if progress_cb:
            progress_cb(0.58, "Menentukan puncak momen terbaik...")

        peaks = find_highlight_peaks(scores, sensitivity=sens, min_gap_sec=gap)
        selected_peaks = sorted(peaks[:limit_clips], key=lambda item: item[0])

        if not selected_peaks:
            return {
                "success": True,
                "total": 0,
                "clips": [],
                "reel": None,
                "detection_mode_requested": mode_req,
                "detection_mode_used": actual_mode,
                "fallback_applied": fallback_applied,
                "fallback_reason": fallback_reason,
                "message": "Tidak ada puncak momen terdeteksi pada video ini",
            }

        duration_probe = probe_duration(video_path, ffprobe)
        video_duration = duration_probe if duration_probe > 0 else float(scores[-1][0] + 1)

        _cleanup_old_auto_files(session_folder)

        base = os.path.splitext(os.path.basename(video_path))[0]
        clean_base = re.sub(r"_skor$", "", base)
        fmt_tag = "9x16" if fmt == "vertical" else ("1x1" if fmt == "square" else "16x9")

        clips = []
        clip_paths = []

        for idx, (peak_sec, score_val) in enumerate(selected_peaks):
            start = max(0.0, float(peak_sec) - pre)
            end = min(video_duration, float(peak_sec) + post)
            dur = end - start
            if dur < 1.5:
                continue

            mm = int(peak_sec // 60)
            ss = int(peak_sec % 60)
            time_label = f"{mm:02d}:{ss:02d}"
            time_file = f"{mm:02d}-{ss:02d}"
            out_name = f"{clean_base}_auto_klip_{idx+1:02d}_{time_file}_{fmt_tag}.mp4"
            out_path = os.path.join(session_folder, out_name)

            if progress_cb:
                pct = 0.60 + (idx / len(selected_peaks)) * 0.30
                progress_cb(pct, f"Memotong klip AI {idx+1}/{len(selected_peaks)} ({fmt.upper()})...")

            ok = _ffmpeg_cut_auto(
                video_path=video_path,
                start_sec=start,
                duration=dur,
                output_path=out_path,
                ffmpeg=ffmpeg,
                output_format=fmt,
                crop_focus=focus,
            )
            if ok:
                size_mb = round(os.path.getsize(out_path) / (1024 * 1024), 2)
                clips.append({
                    "index": len(clips) + 1,
                    "file": out_name,
                    "peak_second": peak_sec,
                    "time_str": time_label,
                    "start": round(start, 2),
                    "duration": round(dur, 2),
                    "score": score_val,
                    "format": fmt,
                    "size_mb": size_mb,
                })
                clip_paths.append(out_path)

        reel_filename = None
        if want_reel and len(clip_paths) > 1:
            if progress_cb:
                progress_cb(0.92, "Menggabungkan menjadi Auto Reel Highlight...")
            reel_name = f"{clean_base}_auto_reel_{fmt_tag}.mp4"
            reel_path = os.path.join(session_folder, reel_name)
            made_reel = concat_clips_to_reel(
                clip_paths, reel_path, ffmpeg=ffmpeg, working_dir=session_folder, log_prefix="[AutoClipper]"
            )
            if made_reel:
                reel_filename = reel_name

        meta = {
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "video_source": os.path.basename(video_path),
            "detection_mode_requested": mode_req,
            "detection_mode_used": actual_mode,
            "fallback_applied": fallback_applied,
            "fallback_reason": fallback_reason,
            "has_audio": has_audio,
            "audio_meta": audio_meta,
            "settings": {
                "detection_mode": mode_req,
                "sensitivity": sens,
                "sensitivity_motion": sens_m,
                "sensitivity_audio": sens_a,
                "max_clips": limit_clips,
                "pre_roll_seconds": pre,
                "post_roll_seconds": post,
                "min_gap_seconds": gap,
                "output_format": fmt,
                "crop_focus": focus,
                "create_reel": want_reel,
            },
            "video_duration": round(video_duration, 1),
            "total_clips": len(clips),
            "clips": clips,
            "reel_video": reel_filename,
        }
        meta_path = os.path.join(session_folder, AUTO_KLIP_META)
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2, ensure_ascii=False)

        if progress_cb:
            msg = f"Selesai! {len(clips)} klip AI siap."
            if fallback_applied:
                msg += " (Audio hening -> Otomatis beralih ke Gerakan)"
            progress_cb(1.0, msg)

        return {
            "success": True,
            "total": len(clips),
            "clips": clips,
            "reel": reel_filename,
            "settings": meta["settings"],
            "detection_mode_requested": mode_req,
            "detection_mode_used": actual_mode,
            "fallback_applied": fallback_applied,
            "fallback_reason": fallback_reason,
            "message": f"Berhasil membuat {len(clips)} Auto-Klip ({fmt.upper()})",
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def get_auto_clip_status(session_folder: str):
    """Baca metadata `_auto_klip.json` dari folder sesi pertandingan."""
    meta_path = os.path.join(session_folder, AUTO_KLIP_META)
    if not os.path.isfile(meta_path):
        return None
    try:
        with open(meta_path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None
