"""
Pengambilan daftar media rekaman/highlight per lapangan, streaming HTTP Range (206),
dan generator QR Code SVG untuk halaman berbagi ke ponsel pemain.
"""
import json
import os
import urllib.parse

from backend.network import get_base_url
from backend.recorder import SESSIONS


def get_court_media(court_id: int) -> list:
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
                for rc in kdata.get("clips", []):
                    c_file = rc.get("file")
                    if c_file and os.path.isfile(os.path.join(fpath, c_file)):
                        clips.append({
                            "file": c_file,
                            "url": f"/media/lapangan{court_id}/{item}/{c_file}",
                            "time_str": rc.get("time_str", ""),
                            "skor": rc.get("skor", ""),
                            "duration": rc.get("duration", 0),
                            "size_mb": rc.get("size_mb", 0),
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
                        "size_mb": sz,
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
            "qr_url": qr_url,
        })

    return sessions[:20]


def serve_file_with_range(handler, fpath: str):
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
        ".svg": "image/svg+xml",
    }.get(ext, "application/octet-stream")

    range_header = handler.headers.get("Range")
    if not range_header or not range_header.startswith("bytes="):
        handler.send_response(200)
        handler.send_header("Content-Type", ctype)
        handler.send_header("Content-Length", str(file_size))
        handler.send_header("Accept-Ranges", "bytes")
        if ext == ".mp4" and "download=1" in handler.path:
            handler.send_header("Content-Disposition", f'attachment; filename="{os.path.basename(fpath)}"')
        handler.end_headers()
        with open(fpath, "rb") as f:
            while True:
                chunk = f.read(65536)
                if not chunk:
                    break
                try:
                    handler.wfile.write(chunk)
                except (ConnectionResetError, BrokenPipeError):
                    break
        return

    try:
        ranges = range_header.replace("bytes=", "").split("-")
        start = int(ranges[0]) if ranges[0] else 0
        end = int(ranges[1]) if ranges[1] else file_size - 1
        if start >= file_size or end >= file_size or start > end:
            handler.send_response(416)
            handler.send_header("Content-Range", f"bytes */{file_size}")
            handler.end_headers()
            return

        length = end - start + 1
        handler.send_response(206)
        handler.send_header("Content-Type", ctype)
        handler.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
        handler.send_header("Content-Length", str(length))
        handler.send_header("Accept-Ranges", "bytes")
        handler.end_headers()

        with open(fpath, "rb") as f:
            f.seek(start)
            remaining = length
            while remaining > 0:
                chunk = f.read(min(65536, remaining))
                if not chunk:
                    break
                try:
                    handler.wfile.write(chunk)
                except (ConnectionResetError, BrokenPipeError):
                    break
                remaining -= len(chunk)
    except Exception:
        handler.send_response(500)
        handler.end_headers()


def generate_qr_svg(text: str) -> bytes:
    """Menghasilkan data gambar SVG QR Code untuk teks/URL tertentu."""
    import qrcode
    import qrcode.image.svg

    img = qrcode.make(text, image_factory=qrcode.image.svg.SvgPathImage, box_size=10, border=2)
    return img.to_string()
