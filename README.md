# TikTok Downloader Telegram Bot

Bot Telegram (Node.js) untuk mengunduh konten TikTok: **video tanpa watermark**, **foto/slide**, dan **musiknya**. Gratis, tanpa API key, memakai library [`@tobyg74/tiktok-api-dl`](https://github.com/TobyG74/tiktok-api-dl).

## Fitur

- **Video**: dikirim tanpa watermark, dengan caption author + deskripsi.
- **Foto/slide**: dikirim sebagai album (maks. 10 per album, otomatis dipecah kalau lebih).
- **Musik**: tombol `🎵 Download MP3` di bawah hasil; audio baru diunduh saat tombol ditekan. Tombol hanya bisa dipakai pengirim link dan berlaku 30 menit.
- Link panjang (`tiktok.com/@user/video/...`, `.../photo/...`) dan pendek (`vt.tiktok.com`, `vm.tiktok.com`).
- Perintah: `/start`, `/help`, `/runtime`.

## Cara kerja

1. User kirim link TikTok (boleh di tengah teks).
2. Bot mengambil data lewat `Tiktok.Downloader` dengan urutan fallback:
   - `v1`: TikTok API (paling lengkap: video, foto, musik + judulnya)
   - `v2`: SSSTik (video, foto, musik)
   - `v3`: MusicalDown (video, foto, tanpa musik)

   Versi berikutnya hanya dicoba kalau versi sebelumnya gagal atau tidak mengembalikan media.
3. Bot mengirim hasil ke Telegram dengan fallback bertahap:
   - **Video**: Telegram mengambil URL langsung, kalau gagal bot mengunduh ke memori lalu upload (maks. 50 MB), kalau lebih besar bot mengirim link unduhan langsung.
   - **Foto**: album via URL, kalau gagal upload sebagai foto, kalau masih gagal upload sebagai dokumen (TikTok kadang menyajikan foto dalam format `.webp`).

Update Telegram diproses paralel (`@grammyjs/runner`), jadi satu unduhan lambat tidak menahan user lain. Tiap user dibatasi `MAX_CONCURRENT_PER_USER` link sekaligus.

## Struktur repo

```
src/
  index.js     entrypoint: validasi config, start polling, graceful shutdown
  bot.js       handler Telegram: /start /help /runtime, pesan link, tombol MP3
  tiktok.js    panggil downloader v1 -> v2 -> v3 dan samakan bentuk hasilnya
  send.js      kirim video / album foto / tombol musik ke Telegram
  download.js  unduh media ke memori dengan batas ukuran + deteksi format audio
  state.js     token tombol MP3 (kedaluwarsa 30 menit) + batas proses per user
  config.js    baca environment variables
```

## Konfigurasi

Salin `.env.example` ke `.env`, lalu isi:

| Variabel | Wajib | Default | Keterangan |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ya | - | Token dari @BotFather |
| `MAX_UPLOAD_TO_TELEGRAM_BYTES` | tidak | `52428800` | Batas upload ke Telegram (50 MB) |
| `MAX_CONCURRENT_PER_USER` | tidak | `3` | Link yang boleh diproses bersamaan per user |
| `HTTP_TIMEOUT_SECONDS` | tidak | `120` | Timeout unduhan media |
| `TIKTOK_PROXY` | tidak | - | Proxy untuk downloader, kalau IP server diblokir TikTok |

## Jalankan lokal

Prasyarat: Node.js 20+.

```bash
npm install
npm start
```

## Deploy ke Coolify

Repo ini punya `Dockerfile` (`node:22-alpine`), jadi pakai mode Dockerfile di Coolify.

1. Buat resource baru: `Application`.
2. Source: pilih Git repository ini (branch yang dipakai).
3. Build pack: `Dockerfile`.
4. Tambahkan environment variables dari `.env.example` (minimal `TELEGRAM_BOT_TOKEN`).
5. Deploy.

`HEALTHCHECK` bawaan mengecek proses bot (bukan HTTP), jadi healthcheck HTTP di Coolify bisa dimatikan.

Jangan jalankan dua instance bot dengan token yang sama sekaligus (misalnya lokal + Coolify): Telegram hanya mengizinkan satu polling per bot.

## Catatan

- Library downloader adalah scraper tidak resmi. Kalau TikTok / SSSTik / MusicalDown mengubah situsnya, versi tertentu bisa berhenti bekerja; fallback v1 -> v2 -> v3 mengurangi dampaknya. Cek update library secara berkala.
- Bot tidak menyimpan file di disk; media diunduh ke memori lalu diupload.
- Hormati hak cipta dan ToS TikTok.
