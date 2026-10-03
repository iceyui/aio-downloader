const { InlineKeyboard, InputFile, InputMediaBuilder } = require("grammy");
const { config } = require("./config");
const { downloadBuffer, TooLargeError } = require("./download");
const { log } = require("./log");

const MAX_DESC_CHARS = 1000;
const TELEGRAM_CAPTION_LIMIT = 1024;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // Telegram photo upload limit

const PLATFORM_LABEL = { tiktok: "TikTok", instagram: "Instagram" };

function buildCaption({ author, desc }) {
  if (!desc) return author || "";
  const prefix = author ? `${author} - "` : "";
  const suffix = author ? `"` : "";
  const budget = Math.min(MAX_DESC_CHARS, TELEGRAM_CAPTION_LIMIT - prefix.length - suffix.length);
  let text = desc;
  if (text.length > budget) {
    text = text.slice(0, budget - 3);
    // Don't leave half of an emoji (a lone UTF-16 high surrogate) at the cut.
    if (/[\uD800-\uDBFF]$/.test(text)) text = text.slice(0, -1);
    text += "...";
  }
  return prefix + text + suffix;
}

const isSingleVideo = (data) => data.items.length === 1 && data.items[0].kind === "video";

function buildKeyboard(ctx, data, { sourceUrl, caption, buttonTasks }) {
  const kb = new InlineKeyboard();
  const userId = ctx.from.id;
  let actions = 0;
  if (data.music) {
    const token = buttonTasks.add({ userId, url: data.music.url, title: data.music.title, performer: data.music.author });
    kb.text("🎵 Download MP3", `mp3:${token}`);
    actions++;
  }
  if (data.platform === "tiktok" && isSingleVideo(data)) {
    const token = buttonTasks.add({ userId, sourceUrl, caption });
    kb.text(ctx.t("btnHd"), `hd:${token}`);
    actions++;
  }
  if (actions) kb.row();
  kb.url(ctx.t("openOn", { platform: PLATFORM_LABEL[data.platform] || data.platform }), sourceUrl);
  return kb;
}

const mb = (bytes) => (bytes / (1024 * 1024)).toFixed(1);

async function sendVideo(ctx, data, url, extra, reqId) {
  // 1) Let Telegram fetch the URL itself (fast, no bandwidth on our side; limited to ~20 MB by Telegram).
  try {
    await ctx.replyWithVideo(url, { ...extra, supports_streaming: true });
    return;
  } catch (err) {
    log(`video_url_send_failed id=${reqId}`, err.description || err.message);
  }
  // 2) Download into memory and upload (up to the 50 MB upload limit).
  try {
    const { buffer } = await downloadBuffer(url);
    await ctx.replyWithVideo(new InputFile(buffer, `${data.platform}_${reqId}.mp4`), { ...extra, supports_streaming: true });
  } catch (err) {
    if (err instanceof TooLargeError) {
      // 3) Too big for Telegram: hand out the direct link (as text, signed URLs are too long for a button).
      await ctx.reply(
        ctx.t("videoTooLarge", { size: mb(err.size), url }),
        { reply_markup: extra.reply_markup, link_preview_options: { is_disabled: true } },
      );
      return;
    }
    throw err;
  }
}

function photoExtension(contentType) {
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("png")) return "png";
  return "jpg";
}

/**
 * Send photos/videos as albums of up to 10, trying progressively safer forms because Telegram may
 * refuse remote URLs or some formats (e.g. .webp): by URL -> uploaded media -> uploaded documents.
 */
async function sendAlbum(ctx, data, caption, reqId) {
  const chunks = [];
  for (let i = 0; i < data.items.length; i += 10) chunks.push(data.items.slice(i, i + 10));

  for (const [chunkIdx, items] of chunks.entries()) {
    const capFor = (i) => (chunkIdx === 0 && i === 0 && caption ? { caption } : {});
    const send = (media) => {
      if (media.length > 1) return ctx.replyWithMediaGroup(media);
      const [m] = media;
      const extra = m.caption ? { caption: m.caption } : {};
      if (m.type === "photo") return ctx.replyWithPhoto(m.media, extra);
      if (m.type === "video") return ctx.replyWithVideo(m.media, { ...extra, supports_streaming: true });
      return ctx.replyWithDocument(m.media, extra);
    };
    const asMedia = (kind, media, opts) =>
      kind === "video" ? InputMediaBuilder.video(media, { ...opts, supports_streaming: true }) : InputMediaBuilder.photo(media, opts);

    try {
      await send(items.map((it, i) => asMedia(it.kind, it.url, capFor(i))));
      continue;
    } catch (err) {
      log(`album_url_send_failed id=${reqId}`, err.description || err.message);
    }

    const files = [];
    for (const [i, it] of items.entries()) {
      const { buffer, contentType } = await downloadBuffer(it.url, it.kind === "video" ? config.maxUploadBytes : MAX_PHOTO_BYTES);
      const ext = it.kind === "video" ? "mp4" : photoExtension(contentType);
      files.push({ kind: it.kind, file: new InputFile(buffer, `${data.platform}_${reqId}_${chunkIdx * 10 + i + 1}.${ext}`) });
    }
    try {
      await send(files.map((f, i) => asMedia(f.kind, f.file, capFor(i))));
      continue;
    } catch (err) {
      log(`album_upload_media_failed id=${reqId}`, err.description || err.message);
    }
    await send(files.map((f, i) => InputMediaBuilder.document(f.file, capFor(i))));
  }
}

/** data: { platform, author, desc, items: [{ kind: "photo"|"video", url }], music: {...}|null } */
async function sendResult(ctx, { data, sourceUrl, reqId, buttonTasks }) {
  const caption = buildCaption(data);
  const keyboard = buildKeyboard(ctx, data, { sourceUrl, caption, buttonTasks });
  const replyTo = { reply_parameters: { message_id: ctx.msg.message_id, allow_sending_without_reply: true } };

  if (isSingleVideo(data)) {
    await sendVideo(ctx, data, data.items[0].url, { ...replyTo, caption: caption || undefined, reply_markup: keyboard }, reqId);
    return;
  }

  await sendAlbum(ctx, data, caption, reqId);
  // Albums cannot carry buttons, so the music button goes in a follow-up message.
  if (data.music) {
    const label = [data.music.title, data.music.author].filter(Boolean).join(" - ");
    await ctx.reply(`🎵 ${label || ctx.t("music")}`, { reply_markup: keyboard });
  }
}

module.exports = { sendResult, sendVideo, buildCaption };
