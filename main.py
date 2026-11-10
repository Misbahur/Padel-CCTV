#!/usr/bin/env python3
"""
Entry point utama Papan Skor Padel + Perekam CCTV Multi-Lapangan.

Jalankan server web:
    python main.py

Render overlay papan skor ke video secara manual:
    python main.py --render <path_video.mp4> [--offset 1.5]
"""
from backend.server import run

if __name__ == "__main__":
    run()
