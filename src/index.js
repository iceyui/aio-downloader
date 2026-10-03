const { run } = require("@grammyjs/runner");
const { config } = require("./config");
const { createBot } = require("./bot");

async function main() {
  if (!config.botToken) throw new Error("TELEGRAM_BOT_TOKEN is not set.");

  const { bot, menu } = createBot();
  // Same as the old bot: ignore messages sent while the bot was offline.
  await bot.api.deleteWebhook({ drop_pending_updates: true });
  const me = await bot.api.getMe();
  // Publish the default (English) "/" menu so it always matches the handlers registered in code.
  // Users who pick another language via /language get a chat-specific menu in that language.
  await bot.api.setMyCommands(menu);

  console.log("================ Downloader Bot ================");
  console.log(`Bot: @${me.username} | Platforms: TikTok, Instagram`);
  console.log(`Menu: ${menu.map((c) => "/" + c.command).join(" ")}`);
  console.log("Bot started. Send /start to your bot on Telegram.");

  // The runner handles updates concurrently, so one slow download does not block other users.
  const runner = run(bot);
  const stop = () => runner.isRunning() && runner.stop();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

main().catch((err) => {
  // Telegram answers 401/404 when the token is wrong or a placeholder.
  if (err?.error_code === 401 || err?.error_code === 404) {
    console.error("TELEGRAM_BOT_TOKEN is invalid. Get a real token from @BotFather (format: 123456789:AAxxxx...).");
  } else {
    console.error(err);
  }
  process.exit(1);
});
