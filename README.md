# AIO Downloader Telegram Bot

Bot Telegram untuk memproses URL video TikTok melalui TikTok Downloader v2 API dari pitucode, lalu mengirim videonya ke user.

## Dukungan platform

- **TikTok** (didukung penuh)

Platform lain masih **coming soon** (dalam tahap pengembangan, belum ada endpoint yang dipasang):

- Douyin
- Instagram
- Threads
- Facebook
- YouTube (akan pakai tombol pilihan kualitas, tidak auto-upload video)

## Cara kerja singkat

1. User kirim URL ke bot.
2. Bot deteksi platform dari hostname.
3. Bot memanggil endpoint `tiktok-downloader-v2` melalui `processors/generic.py` (API key di header `x-api-key`).
4. Respons `data` (`cdn_url`, `author`, `video`, ...) diadaptasi ke format internal di `bot/media_normalizer.py`.
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
  - `generic.py`: saat ini menangani TikTok via endpoint `tiktok-downloader-v2`. Platform lain (Douyin, Instagram, dll) masih coming soon.
  - `youtube.py`: khusus YouTube (tidak auto-upload video, hanya kirim pilihan kualitas) — coming soon.
  - File legacy lain (`tiktok.py`, `instagram.py`, `facebook.py`, `douyin.py`, `threads.py`) masih ada untuk referensi tapi tidak lagi dipakai di flow utama.
- `config.yml`: mendefinisikan endpoint default (`tiktok-downloader-v2`).

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
- Key ini dikirim sebagai header `x-api-key` (sesuai dokumentasi pitucode). Nama header bisa diganti lewat `DOWNLOADER_APIKEY_HEADER_NAME`.
- Beberapa endpoint premium mungkin memerlukan upgrade berbayar, tapi endpoint downloader yang digunakan bot ini umumnya bisa diakses dengan key gratis.

### 2) Endpoint downloader

Repo ini memakai **TikTok Downloader v2** dari pitucode:

```yaml
endpoints:
  default: https://api.pitucode.com/tiktok-downloader-v2
```

Contoh pemanggilan (URL target sebagai query `url`, API key di header):

```bash
curl -G "https://api.pitucode.com/tiktok-downloader-v2"   --data-urlencode "url=https://www.tiktok.com/@user/video/123"   -H "x-api-key: YOURAPIKEY"
```

Contoh respons sukses (dipersingkat):

```json
{
  "success": true,
  "data": {
    "source_url": "https://www.tiktok.com/@user/video/123",
    "cdn_url": "https://cdn.zass.in/xxxx.mp4",
    "file_size": 641125,
    "description": "",
    "author": { "username": "user", "nickname": "Nama" },
    "video": { "duration": 15, "cover": "https://...", "format": "mp4", "direct_play_url": "https://..." }
  }
}
```

Bot mengirim `cdn_url` ke Telegram (`direct_play_url` butuh cookie TikTok, jadi tidak dipakai).
Kalau API membalas `success: false` (link tidak valid/privat) atau 4xx (API key salah), bot langsung memberi tahu user tanpa retry supaya kuota tidak terbuang. Retry (maks. 3x) hanya untuk error 5xx/jaringan.

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
