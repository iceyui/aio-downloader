# AIO Downloader Telegram Bot

Bot Telegram untuk memproses URL media dari beberapa platform melalui downloader API, lalu mengirim hasil ke user.

## Dukungan platform

- TikTok
- Douyin
- Instagram
- Threads
- Facebook
- YouTube

## Cara kerja singkat

1. User kirim URL ke bot.
2. Bot deteksi platform dari hostname.
3. Bot panggil endpoint downloader sesuai `config.yml` (bisa per-platform).
4. Hasil dinormalisasi ke format internal.
5. Bot kirim:
- Video terbaik (jika ada).
- Gambar sebagai album atau satu per satu.
- Audio via tombol `Download MP3`.

Catatan YouTube:
- Bot tidak upload video YouTube ke Telegram.
- Bot kirim tombol kualitas (tautan langsung per resolusi).

## Struktur repo

- `main.py`: entrypoint runtime.
- `bot/`: core app, config, state, platform detector, normalizer.
- `handlers/`: handler Telegram (`/start`, text URL, callback MP3, util flow).
- `processors/`: processor per platform.
- `config.yml`: endpoint downloader default + override per-platform.

## Konfigurasi

### 1) Environment variables

Salin `.env.example` ke `.env`, lalu isi minimal:

- `TELEGRAM_BOT_TOKEN`
- `DOWNLOADER_API_KEY` (opsional, sesuai kebutuhan API)

Variabel batas/performa:

- `MAX_UPLOAD_TO_TELEGRAM_BYTES` (default 52428800)
- `MAX_CONCURRENT_PER_USER` (default 3)
- `HTTP_CONNECT_TIMEOUT` (default 10)
- `HTTP_READ_TIMEOUT` (default 60)
- `HTTP_TOTAL_TIMEOUT` (default 120)

### 2) Endpoint downloader

Salin `config.yml.example` ke `config.yml` lalu sesuaikan:

```yaml
endpoints:
  default: https://api.pitucode.com/downloader/aio
  per_platform:
    tiktok: https://api.pitucode.com/downloader/ttsave
    douyin: https://api.pitucode.com/douyin-downloader
    instagram: https://api.pitucode.com/downloader/igstory
    threads: https://api.pitucode.com/downloader/aio
    facebook: https://api.pitucode.com/downloader/fbdown
    youtube: https://api.pitucode.com/downloader/aio
```

## Jalankan lokal

Prasyarat: Python 3.10+.

```bash
pip install -r requirements.txt
python main.py
```

Opsional (rate limiter PTB):

```bash
pip install "python-telegram-bot[rate-limiter]==21.6"
```

## Deploy ke Coolify

Repo ini sudah punya `Dockerfile`, jadi paling mudah pakai mode Dockerfile di Coolify.

1. Buat resource baru: `Application` di Coolify.
2. Source: pilih Git repository ini.
3. Build pack: pilih `Dockerfile`.
4. Tambahkan environment variables dari `.env.example` (minimal token Telegram + API key bila perlu).
5. Pastikan file `config.yml` ikut ada di repo (atau mount sesuai kebutuhan).
6. Deploy.

Rekomendasi:
- Gunakan `HEALTHCHECK` bawaan di `Dockerfile` (CMD non-HTTP, cek proses bot).
- Di Coolify, healthcheck UI berbasis HTTP bisa dimatikan jika tidak diperlukan.

## Penggunaan bot

Kirim URL yang didukung ke chat bot. Bot akan membalas progress lalu mengirim media/tombol unduh.

## Catatan

- Hormati hak cipta dan ToS platform.
- Jika file terlalu besar untuk Telegram, bot akan kirim tautan langsung.
