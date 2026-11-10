"""
Daemon pembersihan otomatis rekaman lama (retention & kapasitas disk)
serta perekam sinyal tombol remote Bluetooth (live debugger).
"""
import datetime
import json
import os
import shutil
import threading
import time

from backend.config import BASE, CFG

REMOTE_LOG_FILE = os.path.join(BASE, "remote_signals.log")
_remote_signals = []
_remote_lock = threading.Lock()


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

    # 1. Hapus folder yang melewati batas retensi hari
    for item in list(match_folders):
        age = now - item["mtime"]
        if age > max_age_sec:
            try:
                shutil.rmtree(item["path"])
                print(f"🧹 [Auto-Cleanup] Menghapus rekaman kedaluwarsa ({round(age/86400, 1)} hari): {item['name']}")
                match_folders.remove(item)
            except Exception as e:
                print(f"⚠️ [Auto-Cleanup] Gagal menghapus {item['name']}: {e}")

    # 2. Hapus folder terlama jika ruang disk menipis
    try:
        _, _, free = shutil.disk_usage(base_rekaman)
        free_gb = free / (1024 ** 3)
    except Exception:
        free_gb = 999.0

    while free_gb < min_free_gb and match_folders:
        oldest = match_folders.pop(0)
        try:
            shutil.rmtree(oldest["path"])
            print(
                f"🧹 [Auto-Cleanup Harddisk] Sisa disk {free_gb:.1f} GB (< {min_free_gb} GB). "
                f"Menghapus rekaman terlama: {oldest['name']}"
            )
            _, _, free = shutil.disk_usage(base_rekaman)
            free_gb = free / (1024 ** 3)
        except Exception as e:
            print(f"⚠️ [Auto-Cleanup] Gagal menghapus {oldest['name']}: {e}")
            break


def start_cleanup_daemon():
    """Jalankan pemeriksaan cleanup disk berkala setiap 1 jam di background."""
    def _daemon():
        clean_old_recordings()
        while True:
            time.sleep(3600)
            try:
                clean_old_recordings()
            except Exception:
                pass

    threading.Thread(target=_daemon, daemon=True).start()


def log_remote_signal(court_id: int, data: dict) -> dict:
    """Catat sinyal tombol remote Bluetooth ke memory dan `remote_signals.log`."""
    entry = {
        "court_id": court_id,
        "timestamp": datetime.datetime.now().strftime("%H:%M:%S.%f")[:-3],
        **data,
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


def get_remote_signals(court_id=None) -> list:
    """Ambil daftar sinyal remote terbaru untuk debugger."""
    with _remote_lock:
        if court_id is None:
            return list(_remote_signals)
        return [s for s in _remote_signals if s.get("court_id") == court_id]


def clear_remote_signals() -> dict:
    """Bersihkan riwayat log sinyal remote."""
    with _remote_lock:
        _remote_signals.clear()
    try:
        if os.path.exists(REMOTE_LOG_FILE):
            os.remove(REMOTE_LOG_FILE)
    except Exception:
        pass
    return {"ok": True}
