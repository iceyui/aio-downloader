const crypto = require("node:crypto");
const { config } = require("../config");
const { fetchTiktok, isTiktokUrl } = require("../tiktok");
const { fetchInstagram, isInstagramUrl, isInstagramStoryUrl } = require("../instagram");
const { sendResult } = require("../send");
const { log } = require("../log");

const PLATFORMS = [
  { name: "tiktok", label: "TikTok", matches: isTiktokUrl, fetch: fetchTiktok },
  { name: "instagram", label: "Instagram", matches: isInstagramUrl, fetch: fetchInstagram },
];

/** Any text message: find the first link, detect its platform, download and send the media. */
function registerLinkHandler(bot, { buttonTasks, limiter }) {
  bot.on("message:text", async (ctx) => {
    const url = ctx.msg.text.match(/https?:\/\/\S+/)?.[0];
    const platform = url && PLATFORMS.find((p) => p.matches(url));
    if (!platform) {
      await ctx.reply(ctx.t("invalidLink", { sampleUrls: ctx.t("sampleUrls") }));
      return;
    }
    if (platform.name === "instagram" && isInstagramStoryUrl(url)) {
      // Checked before calling the downloader: stories need a logged-in session and always come back empty.
      await ctx.reply(ctx.t("storyUnsupported"));
      return;
    }

    const userId = ctx.from.id;
    if (!limiter.tryAcquire(userId)) {
      await ctx.reply(ctx.t("tooManyRequests", { limit: config.maxConcurrentPerUser }));
      return;
    }

    const reqId = crypto.randomBytes(6).toString("hex");
    ctx.react("👍").catch(() => {});
    const progress = await ctx.reply(ctx.t("processing", { platform: platform.label }));
    try {
      log(`request_start id=${reqId} user=${userId} platform=${platform.name} url=${url}`);
      const data = await platform.fetch(url);
      const counts = data.items.reduce((acc, it) => ({ ...acc, [it.kind]: (acc[it.kind] || 0) + 1 }), {});
      log(
        `request_success id=${reqId} platform=${platform.name} source=${data.version || `attempt${data.attempt}`}` +
          ` photos=${counts.photo || 0} videos=${counts.video || 0} music=${Boolean(data.music)}`,
      );
      await sendResult(ctx, { data, sourceUrl: url, reqId, buttonTasks });
    } catch (err) {
      log(`request_failed id=${reqId} platform=${platform.name}`, err.message);
      await ctx.reply(
        err.code === "ALL_VERSIONS_FAILED" ? ctx.t("fetchFailed", { platform: platform.label }) : ctx.t("sendFailed"),
      );
    } finally {
      limiter.release(userId);
      ctx.api.deleteMessage(progress.chat.id, progress.message_id).catch(() => {});
    }
  });
}

module.exports = { registerLinkHandler };
