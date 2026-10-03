# TikTok & Instagram Downloader Telegram Bot

Bot Telegram (Node.js) untuk mengunduh konten **TikTok** (video tanpa watermark, foto/slide, musik) dan **Instagram** (post foto, carousel, video, reel). Gratis, tanpa API key. Platform dikenali otomatis dari link yang dikirim.

## Fitur

### TikTok
- **Video**: tanpa watermark, dengan caption author + deskripsi (deskripsi maks. 1000 karakter, sisanya dipotong).
- **Foto/slide**: dikirim sebagai album (maks. 10 per album, otomatis dipecah kalau lebih).
- **Musik**: tombol `🎵 Download MP3`; audio baru diunduh saat tombol ditekan. Tombol hanya bisa dipakai pengirim link dan berlaku 30 menit.
- Link panjang (`tiktok.com/@user/video/...`, `.../photo/...`) dan pendek (`vt.tiktok.com`, `vm.tiktok.com`).

### Instagram
- **Post foto**, **carousel** (album, bisa campur foto + video), **video**, dan **reel** (`instagram.com/p/...`, `/reel/...`).
- Tanpa caption / nama akun (sumber datanya tidak menyediakan).
- **Story belum didukung** (butuh login); link Story langsung dibalas tanpa memanggil downloader.

Perintah: `/start`, `/help`, `/runtime`.

## Cara kerja

1. User kirim link (boleh di tengah teks). Bot mengenali platform dari domain link.
2. Bot mengambil data:
   - **TikTok** lewat [`@tobyg74/tiktok-api-dl`](https://github.com/TobyG74/tiktok-api-dl) dengan urutan fallback:
     - `v1`: TikTok API (paling lengkap: video, foto, musik + judulnya)
     - `v2`: SSSTik (video, foto, musik)
     - `v3`: MusicalDown (video, foto, tanpa musik)

     Versi berikutnya hanya dicoba kalau versi sebelumnya gagal atau tidak mengembalikan media.
   - **Instagram** lewat [`btch-downloader`](https://github.com/hostinger-bot/btch-downloader) (memanggil server pihak ketiga, dicoba ulang maks. 3x). Hasilnya berupa link proxy; bot mengambil URL Instagram asli dari token link tersebut dan membuang duplikat (server itu mengulang tiap media sebanyak jumlah media di carousel).
3. Bot mengirim hasil ke Telegram dengan fallback bertahap:
   - **Video tunggal**: Telegram mengambil URL langsung, kalau gagal bot mengunduh ke memori lalu upload (maks. 50 MB), kalau lebih besar bot mengirim link unduhan langsung.
   - **Foto / album**: via URL, kalau gagal upload sebagai foto/video, kalau masih gagal upload sebagai dokumen.

Update Telegram diproses paralel (`@grammyjs/runner`), jadi satu unduhan lambat tidak menahan user lain. Tiap user dibatasi `MAX_CONCURRENT_PER_USER` link sekaligus.

## Struktur repo

```
src/
  index.js      entrypoint: validasi config, start polling, graceful shutdown
  bot.js        handler Telegram: deteksi platform, /start /help /runtime, tombol MP3
  tiktok.js     downloader TikTok v1 -> v2 -> v3, samakan bentuk hasilnya
  instagram.js  downloader Instagram (btch-downloader), ambil URL asli + buang duplikat
  send.js       kirim video / album / tombol musik ke Telegram
  download.js   unduh media ke memori dengan batas ukuran + deteksi format audio
  state.js      token tombol MP3 (kedaluwarsa 30 menit) + batas proses per user
  config.js     baca environment variables
```

## Konfigurasi

Salin `.env.example` ke `.env`, lalu isi:

| Variabel | Wajib | Default | Keterangan |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ya | - | Token dari @BotFather |
| `MAX_UPLOAD_TO_TELEGRAM_BYTES` | tidak | `52428800` | Batas upload ke Telegram (50 MB) |
| `MAX_CONCURRENT_PER_USER` | tidak | `3` | Link yang boleh diproses bersamaan per user |
| `HTTP_TIMEOUT_SECONDS` | tidak | `120` | Timeout unduhan media |
| `TIKTOK_PROXY` | tidak | - | Proxy untuk downloader TikTok (tidak dipakai Instagram), kalau IP server diblokir TikTok |

## Jalankan lokal

Prasyarat: Node.js 20+.

```bash
npm install
npm start
```

## Jalankan dengan Docker

```bash
docker build -t tiktok-downloader-bot .
docker run -d --name tiktok-bot --env-file .env --restart unless-stopped tiktok-downloader-bot
```

Image memakai `node:22-alpine` dan punya `HEALTHCHECK` yang mengecek proses bot (bukan HTTP).

## Catatan

- Jangan jalankan dua instance bot dengan token yang sama sekaligus (misalnya lokal + server): Telegram hanya mengizinkan satu polling per bot.

- Kedua library downloader tidak resmi. TikTok: kalau TikTok / SSSTik / MusicalDown mengubah situsnya, versi tertentu bisa berhenti bekerja; fallback v1 -> v2 -> v3 mengurangi dampaknya. Instagram: bergantung pada server pihak ketiga (`backend1.tioo.eu.org`, yang memakai snapsave.app); kalau server itu mati, Instagram ikut berhenti. Cek update library secara berkala.
- `btch-downloader` ikut memasang dependency build yang berat (typescript, esbuild, dll.), jadi `node_modules` / image Docker cukup besar (~200 MB).
- Bot tidak menyimpan file di disk; media diunduh ke memori lalu diupload.
- Hormati hak cipta dan ToS TikTok / Instagram.
