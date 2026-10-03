const { InlineKeyboard, InputFile, InputMediaBuilder } = require("grammy");
const { downloadBuffer, TooLargeError } = require("./download");

const log = (...args) => console.log(new Date().toISOString(), ...args);

const MAX_DESC_CHARS = 1000;
const TELEGRAM_CAPTION_LIMIT = 1024;

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

function buildKeyboard(data, sourceUrl, audioStore, userId) {
  const kb = new InlineKeyboard();
  if (data.music) {
    const token = audioStore.add({
      userId,
      url: data.music.url,
      title: data.music.title,
      performer: data.music.author,
    });
    kb.text("🎵 Download MP3", `mp3:${token}`).row();
  }
  kb.url("Buka di TikTok", sourceUrl);
  return kb;
}

const mb = (bytes) => (bytes / (1024 * 1024)).toFixed(1);

async function sendVideo(ctx, data, extra, reqId) {
  // 1) Let Telegram fetch the URL itself (fast, no bandwidth on our side; limited to ~20 MB by Telegram).
  try {
    await ctx.replyWithVideo(data.videoUrl, { ...extra, supports_streaming: true });
    return;
  } catch (err) {
    log(`video_url_send_failed id=${reqId}`, err.description || err.message);
  }
  // 2) Download into memory and upload (up to the 50 MB upload limit).
  try {
    const { buffer } = await downloadBuffer(data.videoUrl);
    await ctx.replyWithVideo(new InputFile(buffer, `tiktok_${reqId}.mp4`), { ...extra, supports_streaming: true });
  } catch (err) {
    if (err instanceof TooLargeError) {
      // 3) Too big for Telegram: hand out the direct link (as text, signed URLs are too long for a button).
      await ctx.reply(
        `Video terlalu besar (${mb(err.size)} MB) untuk dikirim lewat Telegram.\nUnduh langsung:\n${data.videoUrl}`,
        { reply_markup: extra.reply_markup, link_preview_options: { is_disabled: true } },
      );
      return;
    }
    throw err;
  }
}

/**
 * Send images, trying progressively safer forms because Telegram may refuse TikTok URLs
 * or the .webp format TikTok serves for photo posts: URL -> uploaded photo -> uploaded document.
 */
async function sendImages(ctx, images, caption, reqId) {
  const chunks = [];
  for (let i = 0; i < images.length; i += 10) chunks.push(images.slice(i, i + 10));

  for (const [chunkIdx, urls] of chunks.entries()) {
    const capFor = (i) => (chunkIdx === 0 && i === 0 && caption ? { caption } : {});
    const send = (items) =>
      items.length === 1
        ? items[0].type === "photo"
          ? ctx.replyWithPhoto(items[0].media, items[0].caption ? { caption: items[0].caption } : {})
          : ctx.replyWithDocument(items[0].media, items[0].caption ? { caption: items[0].caption } : {})
        : ctx.replyWithMediaGroup(items);

    try {
      await send(urls.map((u, i) => InputMediaBuilder.photo(u, capFor(i))));
      continue;
    } catch (err) {
      log(`images_url_send_failed id=${reqId}`, err.description || err.message);
    }

    const buffers = [];
    for (const [i, u] of urls.entries()) {
      const { buffer, contentType } = await downloadBuffer(u, 10 * 1024 * 1024);
      const ext = contentType.includes("webp") ? "webp" : contentType.includes("png") ? "png" : "jpg";
      buffers.push({ buffer, name: `tiktok_${reqId}_${chunkIdx * 10 + i + 1}.${ext}` });
    }
    try {
      await send(buffers.map((b, i) => InputMediaBuilder.photo(new InputFile(b.buffer, b.name), capFor(i))));
      continue;
    } catch (err) {
      log(`images_upload_photo_failed id=${reqId}`, err.description || err.message);
    }
    await send(buffers.map((b, i) => InputMediaBuilder.document(new InputFile(b.buffer, b.name), capFor(i))));
  }
}

async function sendResult(ctx, { data, sourceUrl, reqId, audioStore }) {
  const caption = buildCaption(data);
  const keyboard = buildKeyboard(data, sourceUrl, audioStore, ctx.from.id);
  const replyTo = { reply_parameters: { message_id: ctx.msg.message_id, allow_sending_without_reply: true } };

  if (data.videoUrl) {
    await sendVideo(ctx, data, { ...replyTo, caption: caption || undefined, reply_markup: keyboard }, reqId);
    return;
  }

  await sendImages(ctx, data.images, caption, reqId);
  // Media groups cannot carry buttons, so the music button goes in a follow-up message.
  if (data.music) {
    const label = [data.music.title, data.music.author].filter(Boolean).join(" - ");
    await ctx.reply(`🎵 ${label || "Musik"}`, { reply_markup: keyboard });
  }
}

module.exports = { sendResult, buildCaption };
