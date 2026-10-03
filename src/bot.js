const crypto = require("node:crypto");
const { Bot, InlineKeyboard, InputFile } = require("grammy");
const { autoRetry } = require("@grammyjs/auto-retry");
const { config } = require("./config");
const { fetchTiktok, isTiktokUrl } = require("./tiktok");
const { fetchInstagram, isInstagramUrl, isInstagramStoryUrl } = require("./instagram");
const { sendResult } = require("./send");
const { downloadBuffer, audioExtension, TooLargeError } = require("./download");
const { AudioStore, UserLimiter } = require("./state");

const log = (...args) => console.log(new Date().toISOString(), ...args);

const PLATFORMS = [
  { name: "tiktok", label: "TikTok", matches: isTiktokUrl, fetch: fetchTiktok },
  { name: "instagram", label: "Instagram", matches: isInstagramUrl, fetch: fetchInstagram },
];

const SAMPLE_URLS =
  "Contoh link yang didukung:\n" +
  "- TikTok: https://www.tiktok.com/@user/video/123\n" +
  "- TikTok foto: https://www.tiktok.com/@user/photo/123\n" +
  "- TikTok pendek: https://vt.tiktok.com/XXXXXXX/\n" +
  "- Instagram post: https://www.instagram.com/p/XXXXXXXXX/\n" +
  "- Instagram reel: https://www.instagram.com/reel/XXXXXXXXX/";

const HELP_TEXT =
  "🤝 Bantuan\n" +
  "- Kirim link TikTok (video atau foto/slide) atau Instagram (post, carousel, reel)\n" +
  "- Video TikTok dikirim tanpa watermark, foto dikirim sebagai album\n" +
  "- Kalau ada musiknya (TikTok), tekan tombol 🎵 Download MP3\n" +
  "- Instagram Story belum didukung\n" +
  "- Jika ukuran melebihi batas upload Telegram, bot mengirim link langsung";

function formatUptime(ms) {
  let s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  s %= 86400;
  const h = Math.floor(s / 3600);
  s %= 3600;
  const m = Math.floor(s / 60);
  s %= 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h || parts.length) parts.push(`${h}h`);
  if (m || parts.length) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

function createBot() {
  const bot = new Bot(config.botToken);
  bot.api.config.use(autoRetry());

  const audioStore = new AudioStore();
  const limiter = new UserLimiter(config.maxConcurrentPerUser);
  const startedAt = Date.now();

  const runtimeText = () =>
    "🕒 Runtime Bot\n" +
    `- Uptime: ${formatUptime(Date.now() - startedAt)}\n` +
    `- Concurrency/user: ${config.maxConcurrentPerUser}\n` +
    `- Max upload: ${Math.round(config.maxUploadBytes / (1024 * 1024))} MB`;

  bot.command("start", (ctx) =>
    ctx.reply(
      [
        "👋 Selamat datang di Downloader Bot!",
        "",
        "✨ Platform: TikTok • Instagram",
        "",
        "📌 Cara pakai:",
        "1) Kirim link TikTok atau Instagram ke sini",
        "2) Bot mengirim video atau foto-fotonya",
        "3) Kalau ada musiknya (TikTok), tekan tombol 🎵 Download MP3",
        "",
        "ℹ️ Catatan:",
        "- Bot tidak menyimpan file",
        "- Instagram Story belum didukung",
        "- Hormati hak cipta & ToS platform",
        "",
        SAMPLE_URLS,
      ].join("\n"),
      { reply_markup: new InlineKeyboard().text("Bantuan", "help").text("Runtime", "runtime") },
    ),
  );
  bot.command("help", (ctx) => ctx.reply(HELP_TEXT));
  bot.command("runtime", (ctx) => ctx.reply(runtimeText()));
  bot.callbackQuery("help", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(HELP_TEXT);
  });
  bot.callbackQuery("runtime", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(runtimeText());
  });

  bot.callbackQuery(/^mp3:(.+)$/, async (ctx) => {
    const token = ctx.match[1];
    const task = audioStore.get(token);
    if (!task) return ctx.answerCallbackQuery({ text: "Permintaan MP3 sudah kedaluwarsa. Kirim ulang link-nya." });
    if (ctx.from.id !== task.userId) return ctx.answerCallbackQuery({ text: "Tombol ini bukan milik Anda.", show_alert: true });
    if (task.inProgress) return ctx.answerCallbackQuery({ text: "Sedang menyiapkan MP3..." });

    task.inProgress = true;
    await ctx.answerCallbackQuery({ text: "Menyiapkan MP3..." });
    try {
      const { buffer } = await downloadBuffer(task.url);
      const name = (task.title || "tiktok_audio").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 60);
      await ctx.replyWithAudio(new InputFile(buffer, `${name}.${audioExtension(buffer)}`), {
        title: task.title || undefined,
        performer: task.performer || undefined,
        reply_parameters: { message_id: ctx.callbackQuery.message.message_id, allow_sending_without_reply: true },
      });
      audioStore.delete(token);
      // Remove the used MP3 button, keep the rest of the keyboard.
      const rows = (ctx.callbackQuery.message.reply_markup?.inline_keyboard || [])
        .map((row) => row.filter((b) => b.callback_data !== ctx.callbackQuery.data))
        .filter((row) => row.length);
      await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: rows } }).catch(() => {});
    } catch (err) {
      task.inProgress = false;
      log(`mp3_failed user=${ctx.from.id}`, err.message);
      await ctx.reply(
        err instanceof TooLargeError
          ? `File musik terlalu besar (${err.size} bytes). Unduh langsung:\n${task.url}`
          : "Gagal menyiapkan MP3. Coba tekan tombolnya lagi.",
        { link_preview_options: { is_disabled: true } },
      );
    }
  });

  bot.on("message:text", async (ctx) => {
    const url = ctx.msg.text.match(/https?:\/\/\S+/)?.[0];
    const platform = url && PLATFORMS.find((p) => p.matches(url));
    if (!platform) {
      await ctx.reply("Kirim link TikTok atau Instagram yang valid.\n" + SAMPLE_URLS);
      return;
    }
    if (platform.name === "instagram" && isInstagramStoryUrl(url)) {
      // Checked before calling the downloader: stories need a logged-in session and always come back empty.
      await ctx.reply("Instagram Story belum didukung. Kirim link post, carousel, atau reel.");
      return;
    }

    const userId = ctx.from.id;
    if (!limiter.tryAcquire(userId)) {
      await ctx.reply(`Kamu masih punya ${config.maxConcurrentPerUser} link yang sedang diproses. Tunggu sebentar ya.`);
      return;
    }

    const reqId = crypto.randomBytes(6).toString("hex");
    ctx.react("👍").catch(() => {});
    const progress = await ctx.reply(`⏳ Sedang memproses link ${platform.label} kamu...`);
    try {
      log(`request_start id=${reqId} user=${userId} platform=${platform.name} url=${url}`);
      const data = await platform.fetch(url);
      const counts = data.items.reduce((acc, it) => ({ ...acc, [it.kind]: (acc[it.kind] || 0) + 1 }), {});
      log(
        `request_success id=${reqId} platform=${platform.name} source=${data.version || `attempt${data.attempt}`}` +
          ` photos=${counts.photo || 0} videos=${counts.video || 0} music=${Boolean(data.music)}`,
      );
      await sendResult(ctx, { data, sourceUrl: url, reqId, audioStore });
    } catch (err) {
      log(`request_failed id=${reqId} platform=${platform.name}`, err.message);
      await ctx.reply(
        err.code === "ALL_VERSIONS_FAILED"
          ? `Gagal mengambil konten. Pastikan link ${platform.label} valid dan postingannya publik, lalu coba lagi.`
          : "Terjadi kesalahan saat mengirim hasil. Coba lagi nanti.",
      );
    } finally {
      limiter.release(userId);
      ctx.api.deleteMessage(progress.chat.id, progress.message_id).catch(() => {});
    }
  });

  bot.catch((err) => log("unhandled_error", err.error?.message || err.message));
  return bot;
}

module.exports = { createBot };
