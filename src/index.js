const { run } = require("@grammyjs/runner");
const { config } = require("./config");
const { createBot } = require("./bot");

async function main() {
  if (!config.botToken) throw new Error("TELEGRAM_BOT_TOKEN belum diset.");

  const bot = createBot();
  // Same as the old bot: ignore messages sent while the bot was offline.
  await bot.api.deleteWebhook({ drop_pending_updates: true });
  const me = await bot.api.getMe();

  console.log("================ TikTok Downloader Bot ================");
  console.log(`Bot: @${me.username} | Downloader: @tobyg74/tiktok-api-dl (v1 -> v2 -> v3)`);
  console.log("Bot starting... kirim /start ke bot Telegram Anda.");

  // The runner handles updates concurrently, so one slow download does not block other users.
  const runner = run(bot);
  const stop = () => runner.isRunning() && runner.stop();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

main().catch((err) => {
  // Telegram answers 401/404 when the token is wrong or a placeholder.
  if (err?.error_code === 401 || err?.error_code === 404) {
    console.error("TELEGRAM_BOT_TOKEN tidak valid. Ambil token asli dari @BotFather (format: 123456789:AAxxxx...).");
  } else {
    console.error(err);
  }
  process.exit(1);
});
