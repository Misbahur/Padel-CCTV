# 🏸 Papan Skor Padel + Perekam CCTV

Aplikasi digital scoreboard padel terintegrasi dengan sistem perekam CCTV RTSP secara otomatis. Dibangun menggunakan Python (backend) dan antarmuka web modern (frontend) tanpa ketergantungan library pihak ketiga (*zero Python dependencies*, hanya butuh Python standard library dan `ffmpeg`).

---

## ✨ Fitur Utama

- **Papan Skor Digital Interaktif**:
  - 4 mode skor: **Advantage (klasik)**, **Golden Point (punto de oro)**, **Star Point (FIP)**, dan **Americano/Mexicano**.
  - Pilihan Best of 1 atau Best of 3 set, 4 atau 6 game per set, serta opsi Super Tiebreak (ke 10).
  - Tampilan visual responsif gaya siaran TV, lengkap dengan nama tim, indikator servis bola, animasi penambahan poin, dan selebrasi pemenang.
- **Perekaman CCTV Otomatis (RTSP)**:
  - Rekaman mulai otomatis saat pertandingan dimulai (tombol **Main**) dan otomatis berhenti setelah pertandingan selesai (+ post-roll selebrasi).
  - Format MP4 terfragmentasi (`+frag_keyframe+empty_moov`), file video tetap aman dan bisa diputar meskipun listrik/laptop mati mendadak.
  - Auto-reconnect jika stream kamera terputus di tengah pertandingan.
  - Mendukung banyak kamera secara simultan.
- **Deteksi Kamera Otomatis (ONVIF)**:
  - Pencarian kamera otomatis di jaringan lokal via protokol ONVIF WS-Discovery dan auto-probe profil RTSP (mendukung Bardi, Hikvision, Dahua/Imou, EZVIZ, Tapo, Uniview, dll).
- **Video Overlay TV-Style (Post-Processing)**:
  - Membuat video kedua dengan skor tertempel langsung (*burned-in* subtitle ASS bergaya siaran TV profesional).
  - Log setiap poin tersimpan dalam format `.jsonl` dengan timestamp detik presisi.
- **Dukungan Remote Bluetooth**:
  - Kompatibel dengan remote Bluetooth (seperti tomsis/remote shutter, remote TikTok, MIXIO, page turner, dll).
  - Mendukung gestur sentuh (touch mode) dan tombol media session.

---

## 📋 Kebutuhan Sistem

1. **Python 3.8+** ([python.org](https://www.python.org/downloads/)) — centang *Add Python to PATH* saat instalasi.
2. **FFmpeg & FFprobe**:
   ```cmd
   winget install ffmpeg
   ```
   Atau unduh manual dan pastikan `ffmpeg` serta `ffprobe` dapat diakses dari terminal/PATH.

---

## 🚀 Cara Menjalankan

1. Salin konfigurasi awal:
   ```cmd
   copy config.example.json config.json
   ```
2. Jalankan aplikasi:
   - Klik ganda file `jalankan.bat`
   - Atau melalui terminal:
     ```bash
     python padel_cctv.py
     ```
3. Buka browser:
   - Laptop lokal: `http://localhost:8080`
   - Dari tablet / HP wasit (dalam satu jaringan Wi-Fi): `http://<IP-LAPTOP>:8080`

---

## 📁 Struktur Project

```text
padel-cctv/
├── fonts/                 # Font Barlow Condensed untuk overlay & UI
├── web/
│   └── index.html         # Frontend web papan skor + kontrol kamera
├── cari_kamera.py         # Skrip pencari kamera ONVIF & RTSP probe
├── overlay.py             # Generator subtitle ASS & video burn overlay
├── padel_cctv.py          # Server HTTP utama & manajer perekaman ffmpeg
├── config.example.json    # Contoh template konfigurasi kamera & output
├── jalankan.bat           # Shortcut peluncuran untuk Windows
└── PANDUAN.txt            # Panduan teknis lengkap
```

---

## 🎮 Kontrol Remote Bluetooth

Default tombol kontrol:
- **Main / Mulai**: Tombol Kamera (📷) / Enter / Space
- **Poin Tim A**: Panah Kiri (`<`) / Volume Up
- **Poin Tim B**: Panah Kanan (`>`) / Volume Down
- **Ganti Servis**: Panah Atas (`⌃`) / Page Up
- **Batalkan Poin (Undo)**: Tombol Hati (`🤍`) / Panah Bawah (`⌄`) / Backspace

Tombol remote juga dapat dipetakan ulang secara bebas melalui menu **"Atur tombol remote"** di antarmuka web.

---

## 📄 Lisensi

Open source untuk komunitas padel dan pengembang. Silakan disesuaikan dengan kebutuhan lapangan Anda!
