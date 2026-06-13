# AIO Downloader Telegram Bot

Bot Telegram untuk memproses URL media TikTok melalui unified downloader API pitucode, lalu mengirim hasil ke user.

## Dukungan platform

- **TikTok** (didukung penuh)

Platform lain masih **coming soon** (dalam tahap pengembangan / akan menggunakan unified endpoint yang sama):

- Douyin
- Instagram
- Threads
- Facebook
- YouTube (akan pakai tombol pilihan kualitas, tidak auto-upload video)

## Cara kerja singkat

1. User kirim URL ke bot.
2. Bot deteksi platform dari hostname.
3. Bot memanggil unified downloader endpoint (`/downloader/aio`) melalui `processors/generic.py`.
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
- `bot/`: core app, config, state, platform detector, normalizer, downloader client.
- `handlers/`: handler Telegram (`/start`, text URL, callback MP3, result flow).
- `processors/`:
  - `generic.py`: saat ini menangani TikTok menggunakan unified endpoint. Platform lain (Douyin, Instagram, dll) masih coming soon dan akan menggunakan jalur yang sama.
  - `youtube.py`: khusus YouTube (tidak auto-upload video, hanya kirim pilihan kualitas) — coming soon.
  - File legacy lain (`tiktok.py`, `instagram.py`, `facebook.py`, `douyin.py`, `threads.py`) masih ada untuk referensi tapi tidak lagi dipakai di flow utama.
- `config.yml`: hanya mendefinisikan endpoint default (unified AIO).

## Konfigurasi

### 1) Environment variables

Salin `.env.example` ke `.env`, lalu isi minimal:

- `TELEGRAM_BOT_TOKEN`
- `DOWNLOADER_API_KEY` (wajib untuk memanggil API pitucode — lihat cara daftar di bawah)

Variabel batas/performa:

- `MAX_UPLOAD_TO_TELEGRAM_BYTES` (default 52428800)
- `MAX_CONCURRENT_PER_USER` (default 3)
- `HTTP_CONNECT_TIMEOUT` (default 10)
- `HTTP_READ_TIMEOUT` (default 60)
- `HTTP_TOTAL_TIMEOUT` (default 120)

### Mendapatkan DOWNLOADER_API_KEY dari pitucode.com

Untuk menggunakan downloader API (termasuk untuk TikTok dll):

1. Buka [https://pitucode.com](https://pitucode.com)
2. Daftar akun **gratis** di [https://pitucode.com/auth/register](https://pitucode.com/auth/register)  
   (Tidak perlu kartu kredit)
3. Login, lalu buka dashboard di [https://pitucode.com/dashboards](https://pitucode.com/dashboards)
4. Copy API key yang tersedia.
5. Paste ke file `.env`:

   ```env
   DOWNLOADER_API_KEY=API_KEY_KAMU_DISINI
   ```

**Catatan penting:**
- Tier gratis biasanya memberikan 100 request/hari (cukup untuk penggunaan bot pribadi).
- Key ini akan dikirim sebagai query parameter `?apikey=...` (sesuai dokumentasi pitucode).
- Beberapa endpoint premium mungkin memerlukan upgrade berbayar, tapi endpoint downloader yang digunakan bot ini umumnya bisa diakses dengan key gratis.

### 2) Endpoint downloader

Repo ini sekarang menggunakan **unified endpoint** sesuai rekomendasi pitucode:

```yaml
endpoints:
  # Saat ini untuk TikTok. Platform lain masih coming soon (akan menggunakan endpoint yang sama).
  default: https://api.pitucode.com/downloader/aio
```

Tidak lagi ada `per_platform` override (sebelumnya ada `ttsave`, `igstory`, `fbdown`, dll). 
TikTok saat ini melewati `processors/generic.py` + endpoint `/aio` yang sama. Platform lain akan mengikuti setelah siap.

Contoh pemanggilan (seperti yang direkomendasikan pitucode):
```
https://api.pitucode.com/downloader/aio?apikey=YOURAPIKEY&url=https://www.tiktok.com/...
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
