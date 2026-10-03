# TikTok & Instagram Downloader Telegram Bot

A Telegram bot (Node.js) that downloads **TikTok** content (watermark-free videos, photo slideshows, music) and **Instagram** posts (photos, carousels, videos, reels). Free, no API key needed. The platform is detected automatically from the link.

The bot speaks **English** by default and **Bahasa Indonesia** on request (`/language`).

## Features

### TikTok
- **Video**: no watermark, captioned with author + description (description capped at 1000 characters).
- **Photo slideshow**: sent as an album (max 10 per album, split automatically when longer).
- **Music**: a `🎵 Download MP3` button; the audio is only downloaded when tapped. The button works only for the user who sent the link and expires after 30 minutes.
- **HD**: a `🎬 HD` button under videos sends the 1080p no-watermark version (the default one is 576p). It's fetched only when tapped because it's ~5-7x bigger (a 46 s video: 5.6 MB vs 37.9 MB), so it's uploaded rather than sent by URL; above 50 MB the bot sends a direct link. Sources: `@tobyg74` v3 `videoHD`, then `btch-downloader` (same file). Same owner-only / 30-minute rules as the MP3 button.
- Full links (`tiktok.com/@user/video/...`, `.../photo/...`) and short links (`vt.tiktok.com`, `vm.tiktok.com`).

### Instagram
- **Photo posts**, **carousels** (albums, photos and videos can be mixed), **videos** and **reels** (`instagram.com/p/...`, `/reel/...`).
- No caption / account name (the data source doesn't provide them).
- **Stories are not supported** (they require a logged-in session); Story links are answered right away without calling the downloader.

### Bot
- Commands: `/start`, `/help`, `/runtime`, `/language`. They are published to Telegram's `/` menu on every start.
- **Languages**: English (default) and Bahasa Indonesia. Each user picks theirs with `/language`; the choice is saved to `data/languages.json` and survives restarts. The `/` menu of that chat switches language too.

## How it works

1. The user sends a link (it can be inside other text). The bot detects the platform from the domain.
2. The bot fetches the media:
   - **TikTok** via [`@tobyg74/tiktok-api-dl`](https://github.com/TobyG74/tiktok-api-dl), falling back in this order:
     - `v1`: TikTok API (most complete: video, photos, music with its title)
     - `v2`: SSSTik (video, photos, music)
     - `v3`: MusicalDown (video, photos, no music)
     - `btch`: last resort via `btch-downloader`'s `ttdl()` (third-party backend; no account name or song title, HD video ~30+ MB). Photos and videos come back in the same field, so each link is classified by its `Content-Type`.

     The next source is only tried when the previous one fails or returns no media.
   - **Instagram** via [`btch-downloader`](https://github.com/hostinger-bot/btch-downloader) (calls a third-party backend, retried up to 3 times). It returns proxy links; the bot reads the original Instagram CDN URL out of each link's token and removes duplicates (the backend repeats every item N times for an N-item carousel, and its proxy serves the same file for every item).
3. The bot sends the result to Telegram with step-by-step fallbacks:
   - **Single video**: Telegram fetches the URL itself; if that fails the bot downloads it into memory and uploads it (max 50 MB); if it is bigger, the bot sends a direct download link.
   - **Photos / albums**: by URL, then uploaded as photos/videos, then uploaded as documents.

Updates are handled concurrently (`@grammyjs/runner`), so one slow download doesn't block other users. Each user is limited to `MAX_CONCURRENT_PER_USER` links at a time.

## Project structure

```
src/
  index.js            entry point: validate config, publish the "/" menu, start polling, graceful shutdown
  bot.js              wires the bot: middleware (language), state, and all handlers
  handlers/
    commands.js       /start /help /runtime /language + their buttons; one command list for handlers and the "/" menu
    link.js           messages with a link: detect platform, download, send the result
    music.js          the 🎵 Download MP3 button
    hd.js             the 🎬 HD button (TikTok 1080p)
    keyboard.js       shared helpers for inline buttons
  i18n.js             every user-facing text in English and Bahasa Indonesia
  tiktok.js           TikTok downloader v1 -> v2 -> v3 -> btch, normalized output; HD lookup
  instagram.js        Instagram downloader (btch-downloader), original URLs + dedupe
  send.js             sends videos / albums / the music button to Telegram
  download.js         in-memory downloads with a size cap, audio format detection, photo/video probing
  state.js            button tokens for MP3/HD (30 min expiry), per-user limit, saved language choices
  config.js           reads environment variables
  log.js              timestamped logging helper
```

### Adding or changing a text

All user-facing texts live in `src/i18n.js` under `en` and `id`. Every key must exist in both languages; placeholders are written as `{name}`.

## Configuration

Copy `.env.example` to `.env` and fill it in:

| Variable | Required | Default | Description |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | yes | - | Token from @BotFather |
| `MAX_UPLOAD_TO_TELEGRAM_BYTES` | no | `52428800` | Upload limit to Telegram (50 MB) |
| `MAX_CONCURRENT_PER_USER` | no | `3` | Links one user can have processing at the same time |
| `HTTP_TIMEOUT_SECONDS` | no | `120` | Media download timeout |
| `TIKTOK_PROXY` | no | - | Proxy for the TikTok downloader (not used for Instagram), if TikTok blocks the server IP |
| `LANGUAGE_STORE_PATH` | no | `data/languages.json` | File where each user's language choice is saved |

## Run locally

Requires Node.js 20+.

```bash
npm install
npm start
```

## Run with Docker

```bash
docker build -t downloader-bot .
docker run -d --name downloader-bot --env-file .env -v downloader-bot-data:/app/data --restart unless-stopped downloader-bot
```

The image uses `node:22-alpine` and has a `HEALTHCHECK` that checks the bot process (not HTTP). The `/app/data` volume keeps users' language choices across container rebuilds.

## Notes

- Don't run two instances with the same bot token at the same time (e.g. local + server): Telegram allows only one polling client per bot.
- Both downloader libraries are unofficial. TikTok: if TikTok / SSSTik / MusicalDown change their sites, a source can stop working; the v1 -> v2 -> v3 -> btch fallback reduces the impact. Instagram: depends on a third-party backend (`backend1.tioo.eu.org`, which uses snapsave.app); if it goes down, Instagram stops working. Check for library updates regularly.
- `btch-downloader` also installs heavy build dependencies (typescript, esbuild, ...), so `node_modules` / the Docker image is fairly large (~200 MB).
- The bot doesn't store media on disk; files are downloaded into memory and uploaded.
- Respect copyright and the TikTok / Instagram terms of service.
