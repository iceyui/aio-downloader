const { InputFile } = require("grammy");
const { downloadBuffer, audioExtension, TooLargeError } = require("../download");
const { removePressedButton, replyToButtonMessage, withButtonProgress } = require("./keyboard");
const { log } = require("../log");

/** "🎵 Download MP3" button: downloads the stored audio URL and sends it to the link's sender. */
function registerMusicButton(bot, { buttonTasks }) {
  bot.callbackQuery(/^mp3:(.+)$/, async (ctx) => {
    const token = ctx.match[1];
    const task = buttonTasks.get(token);
    if (!task) return ctx.answerCallbackQuery({ text: ctx.t("mp3Expired") });
    if (ctx.from.id !== task.userId) return ctx.answerCallbackQuery({ text: ctx.t("notYourButton"), show_alert: true });
    if (task.inProgress) return ctx.answerCallbackQuery({ text: ctx.t("mp3Preparing") });

    task.inProgress = true;
    await ctx.answerCallbackQuery({ text: ctx.t("mp3Preparing") });
    try {
      // Audio is small and quick, so no status message: just the button label and the chat action.
      await withButtonProgress(ctx, { loadingText: ctx.t("btnMp3Loading"), chatAction: "upload_voice" }, async () => {
        const { buffer } = await downloadBuffer(task.url);
        const name = (task.title || "tiktok_audio").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 60);
        await ctx.replyWithAudio(new InputFile(buffer, `${name}.${audioExtension(buffer)}`), {
          title: task.title || undefined,
          performer: task.performer || undefined,
          ...replyToButtonMessage(ctx),
        });
      });
      buttonTasks.delete(token);
      await removePressedButton(ctx);
    } catch (err) {
      task.inProgress = false;
      log(`mp3_failed user=${ctx.from.id}`, err.message);
      await ctx.reply(
        err instanceof TooLargeError
          ? ctx.t("mp3TooLarge", { size: (err.size / (1024 * 1024)).toFixed(1), url: task.url })
          : ctx.t("mp3Failed"),
        { link_preview_options: { is_disabled: true } },
      );
    }
  });
}

module.exports = { registerMusicButton };
