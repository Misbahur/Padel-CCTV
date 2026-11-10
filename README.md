# 🎾 Padel CCTV — Papan Skor Digital & Perekam CCTV Multi-Lapangan

Aplikasi papan skor padel digital multi-lapangan terintegrasi dengan perekam CCTV RTSP otomatis, pemotong klip highlight momen seru, overlay skor gaya siaran TV, serta halaman berbagi video lewat QR Code ke ponsel pemain.

---

## ✨ Fitur Utama

- **Multi-Lapangan & Autentikasi Peran**:
  - Mendukung pengelolaan **3 lapangan sekaligus** dengan konfigurasi, kamera, sesi rekaman, dan status pertandingan terpisah.
  - **Login Admin** (`/dashboard`) & **PIN 4-digit per lapangan** (`/court/1`, `/court/2`, `/court/3`).
  - **Mode Kios TV** di layar lapangan untuk mencegah perubahan tidak sengaja oleh pemain.
- **Papan Skor Digital Interaktif**:
  - 4 mode skor: **Golden Point (punto de oro)**, **Advantage (klasik)**, **Star Point (FIP)**, dan **Americano / Mexicano**.
  - Pilihan Best of 1 / Best of 3 set, 4 / 6 game per set, opsi Super Tiebreak, indikator servis bola, animasi poin, dan layar pemenang.
  - **Proteksi Human Error**: format permainan otomatis terkunci saat pertandingan berjalan, debounce sinyal remote, audio feedback, dan ketahanan restart via `court_<id>_state.json`.
- **Perekaman CCTV Otomatis (RTSP)**:
  - Rekaman mulai otomatis saat tombol **Main** ditekan dan berhenti setelah selesai + **post-roll** selebrasi (default 15 detik).
  - Format MP4 terfragmentasi (`+frag_keyframe+empty_moov`) tahan listrik mati mendadak dan auto-reconnect (`_part2`, `_part3`) jika stream terputus.
- **Video Overlay Skor & Klip Highlight (Love ❤️)**:
  - Render subtitle ASS bergaya siaran TV secara otomatis menjadi file `*_skor.mp4`.
  - Tandai momen seru selama pertandingan menggunakan tombol **Love ❤️** pada remote.
  - Pemotongan klip highlight individual & kompilasi **Reels Highlight** dengan durasi **pre-roll** dan **post-roll** yang bisa dikustomisasi dari Dashboard Admin maupun modal media.
- **Berbagi Video via QR Code (LAN)**:
  - Generate QR Code otomatis menggunakan **IP LAN lokal server** (bukan `localhost`), dengan deteksi IP otomatis maupun override manual di Dashboard.
  - Halaman mobile `/share/<court_id>/<folder>` agar pemain bisa langsung menonton & mengunduh video/klip dari HP di Wi-Fi yang sama.
- **Manajemen Storage Otomatis**:
  - Pembersihan rekaman lama otomatis berdasarkan batas usia retensi hari dan sisa minimum ruang harddisk.
- **Deteksi Kamera ONVIF & Remote Bluetooth**:
  - Pencarian kamera di jaringan lokal via ONVIF WS-Discovery (`tools/cari_kamera.py`) dan auto-probe URL RTSP (Bardi, Hikvision, Dahua/Imou, EZVIZ, Tapo, Uniview, dll).
  - Mendukung remote Bluetooth keyboard/shutter & remote sentuh (MIXIO, TikTok remote) beserta live signal debugger.

---

## 📋 Kebutuhan Sistem

1. **Python 3.8+** ([python.org](https://www.python.org/downloads/)) — centang *Add Python to PATH* saat instalasi.
2. **FFmpeg & FFprobe**:
   ```cmd
   winget install ffmpeg
   ```
   Pastikan `ffmpeg` dan `ffprobe` tersedia di PATH (atau atur path di `.env`).
3. **Node.js 18+** *(hanya dibutuhkan jika ingin memodifikasi/build ulang UI React di `frontend/`)*.

---

## 🚀 Cara Instalasi & Menjalankan

1. **Install dependency Python**:
   ```bash
   pip install -r requirements.txt
   ```
2. **Siapkan konfigurasi `.env` dan `config.json`**:
   ```cmd
   copy .env.example .env
   copy config.example.json config.json
   ```
   Sesuaikan `.env` untuk data sensitif & jaringan (password admin, PIN lapangan, URL RTSP kamera, `PORT`, `SERVER_IP`).
   > Kredensial default jika belum diubah: Admin `admin` / `admin123`, PIN Lapangan `1111`, `2222`, `3333`. Segera ubah melalui `.env` atau Dashboard Admin!
3. **Jalankan server**:
   - Klik ganda **`jalankan.bat`** (Windows), atau
   - Melalui terminal:
     ```bash
     python main.py
     ```
4. **Buka di browser**:
   - Login / Admin Dashboard: `http://localhost:8080/login` dan `http://localhost:8080/dashboard`
   - Papan skor lapangan: `http://localhost:8080/court/1` (atau `2`, `3`)
   - Dari HP/tablet dalam Wi-Fi yang sama: `http://<IP-LAN-SERVER>:8080`

### Render Overlay Manual via CLI

Jika ingin merender ulang video dengan pergeseran offset skor:
```bash
python main.py --render rekaman/lapangan1/NAMA_FOLDER/VIDEO.mp4 --offset 1.5
```

### Build Frontend (Opsional, untuk Pengembangan UI)

```bash
npm --prefix frontend install
npm --prefix frontend run build
```

---

## 📁 Struktur Project

```text
padel-cctv/
├── main.py                  # Entry point utama server & CLI --render
├── backend/                 # Modul backend Python terstruktur
│   ├── config.py            # Loader .env + config.json & helper persistensi
│   ├── auth.py              # Autentikasi admin, PIN lapangan, dan session cookie
│   ├── network.py           # Deteksi IP LAN lokal & generator base URL QR
│   ├── recorder.py          # CameraRecorder FFmpeg, Session match, & RenderQueue
│   ├── media.py             # Daftar media pertandingan, HTTP Range streaming, & QR SVG
│   ├── cleanup.py           # Auto-cleanup disk daemon & remote signal logger
│   ├── overlay.py           # Generator subtitle ASS & video burn-in skor
│   ├── clipper.py           # Pemotong klip momen Love ❤️ & kompilasi highlight reels
│   └── server.py            # HTTP server & API router
├── tools/
│   └── cari_kamera.py       # Utility scan ONVIF WS-Discovery & probe RTSP kamera
├── frontend/                # Source code antarmuka React + Vite + Tailwind CSS
├── web/                     # Hasil build frontend SPA, assets, & share.html mobile
├── fonts/                   # Font Barlow Condensed untuk overlay video
├── rekaman/                 # Penyimpanan rekaman per lapangan & sesi (di-ignore Git)
├── .env.example             # Template konfigurasi sensitif & environment
├── config.example.json      # Template konfigurasi lapangan, overlay, & clipping
├── requirements.txt         # Daftar package Python (qrcode)
├── jalankan.bat             # Launcher cepat untuk Windows
├── PANDUAN.txt              # Panduan teknis penggunaan lapangan & RTSP
└── README.md                # Dokumentasi utama project
```

---

## 🔐 Pemisahan Konfigurasi (`.env` vs `config.json`)

| File | Isi & Fungsi | Di-commit ke Git? |
|---|---|---|
| `.env` | Password/hash admin, PIN lapangan, URL RTSP kamera (termasuk user/password kamera), `PORT`, `SERVER_IP`, `BASE_URL`, path binary | ❌ Tidak (`.gitignore`) |
| `config.json` | Pengaturan non-sensitif: nama lapangan, nama tim, format skor default, setting overlay video, pre/post-roll clipping, retensi disk | ❌ Tidak (`.gitignore`) |
| `.env.example` & `config.example.json` | Template konfigurasi awal yang aman dibagikan | ✅ Ya |

> Perubahan password admin, PIN lapangan, IP server, dan kamera dari Dashboard Admin otomatis tersimpan aman ke `.env` tanpa menuliskan rahasia ke `config.json`.

---

## 🎮 Kontrol Remote Bluetooth

Default tombol kontrol:
- **Main / Mulai**: Tombol Kamera / `Enter` / `Space`
- **Poin Tim A**: Panah Kiri (`<`) / Volume Up
- **Poin Tim B**: Panah Kanan (`>`) / Volume Down
- **Batalkan Poin (Undo)**: Panah Bawah (`⌄`) / `Backspace`
- **Tandai Momen Klip (Love ❤️)**: Tombol Hati di remote / UI layar

Tombol & gestur sentuh remote dapat disesuaikan langsung melalui antarmuka papan skor.

---

## 📄 Lisensi

Open source untuk komunitas padel dan pengembang. Silakan disesuaikan dengan kebutuhan venue Anda!
