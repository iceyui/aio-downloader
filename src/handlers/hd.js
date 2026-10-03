const crypto = require("node:crypto");
const { fetchTiktokHd } = require("../tiktok");
const { sendVideo } = require("../send");
const { removePressedButton, replyToButtonMessage, withButtonProgress } = require("./keyboard");
const { log } = require("../log");

/**
 * "🎬 HD" button under TikTok videos: fetches the 1080p no-watermark file only when asked,
 * because it is ~5-7x bigger than the normal one and usually needs an upload instead of a URL send.
 */
function registerHdButton(bot, { buttonTasks }) {
  bot.callbackQuery(/^hd:(.+)$/, async (ctx) => {
    const token = ctx.match[1];
    const task = buttonTasks.get(token);
    if (!task) return ctx.answerCallbackQuery({ text: ctx.t("hdExpired") });
    if (ctx.from.id !== task.userId) return ctx.answerCallbackQuery({ text: ctx.t("notYourButton"), show_alert: true });
    if (task.inProgress) return ctx.answerCallbackQuery({ text: ctx.t("hdPreparing") });

    task.inProgress = true;
    await ctx.answerCallbackQuery({ text: ctx.t("hdPreparing") });
    const reqId = crypto.randomBytes(6).toString("hex");
    try {
      log(`hd_start id=${reqId} user=${ctx.from.id} url=${task.sourceUrl}`);
      const progress = { loadingText: ctx.t("btnHdLoading"), statusText: ctx.t("hdProgress"), chatAction: "upload_video" };
      await withButtonProgress(ctx, progress, async () => {
        const hdUrl = await fetchTiktokHd(task.sourceUrl);
        const caption = [ctx.t("hdCaption"), task.caption].filter(Boolean).join("\n");
        await sendVideo(ctx, { platform: "tiktok" }, hdUrl, { ...replyToButtonMessage(ctx), caption }, `${reqId}_hd`);
      });
      log(`hd_success id=${reqId}`);
      buttonTasks.delete(token);
      await removePressedButton(ctx);
    } catch (err) {
      task.inProgress = false;
      log(`hd_failed id=${reqId}`, err.message);
      await ctx.reply(ctx.t("hdFailed"));
    }
  });
}

module.exports = { registerHdButton };
