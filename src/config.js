require("dotenv").config({ quiet: true });

function intEnv(name, fallback) {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const config = {
  botToken: process.env.TELEGRAM_BOT_TOKEN || "",
  // Telegram Bot API upload limit is 50 MB.
  maxUploadBytes: intEnv("MAX_UPLOAD_TO_TELEGRAM_BYTES", 50 * 1024 * 1024),
  maxConcurrentPerUser: intEnv("MAX_CONCURRENT_PER_USER", 3),
  httpTimeoutMs: intEnv("HTTP_TIMEOUT_SECONDS", 120) * 1000,
  // Optional proxy passed to the TikTok downloader, e.g. http://user:pass@host:port
  tiktokProxy: process.env.TIKTOK_PROXY || undefined,
};

module.exports = { config };
