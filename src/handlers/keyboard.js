const { log } = require("../log");

// Last keyboard this process set on each message. The callback's own copy of the keyboard is a
// snapshot from when the button was pressed, so two buttons running at once (MP3 + HD) would
// otherwise undo each other's edits (e.g. a used MP3 button reappearing when HD finishes).
const latestKeyboards = new Map();
const KEYBOARD_MEMORY_MS = 60 * 60 * 1000;

function editPressedButton(ctx, mapButton) {
  const msg = ctx.callbackQuery.message;
  const key = `${msg?.chat?.id}:${msg?.message_id}`;
  const current = latestKeyboards.get(key) || msg?.reply_markup?.inline_keyboard || [];
  const rows = current
    .map((row) => row.map((b) => (b.callback_data === ctx.callbackQuery.data ? mapButton(b) : b)).filter(Boolean))
    .filter((row) => row.length);
  if (!latestKeyboards.has(key)) setTimeout(() => latestKeyboards.delete(key), KEYBOARD_MEMORY_MS).unref();
  latestKeyboards.set(key, rows);
  return ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: rows } }).catch(() => {});
}

/** Remove the button that was just pressed from its message, keeping the rest of the keyboard. */
function removePressedButton(ctx) {
  return editPressedButton(ctx, () => null);
}

/** Change the label of the button that was just pressed (e.g. "⏳ HD..." while working). */
function setPressedButtonText(ctx, text) {
  return editPressedButton(ctx, (b) => ({ ...b, text }));
}

/** Reply to the message that carries the pressed button. */
function replyToButtonMessage(ctx) {
  return { reply_parameters: { message_id: ctx.callbackQuery.message.message_id, allow_sending_without_reply: true } };
}

/**
 * Run `work` while showing progress: the pressed button reads `loadingText`, a status message
 * is posted under the button's message, and Telegram's "sending video…" style chat action is
 * refreshed (it expires after ~5 s). The status message is always removed afterwards; on failure
 * the button gets its original label back so it can be tapped again.
 */
async function withButtonProgress(ctx, { loadingText, statusText, chatAction }, work) {
  const originalText = (ctx.callbackQuery.message?.reply_markup?.inline_keyboard || [])
    .flat()
    .find((b) => b.callback_data === ctx.callbackQuery.data)?.text;
  await setPressedButtonText(ctx, loadingText);
  const status = statusText
    ? await ctx.reply(statusText, replyToButtonMessage(ctx)).catch((err) => log("progress_message_failed", err.message))
    : null;
  const sendAction = () => ctx.replyWithChatAction(chatAction).catch(() => {});
  sendAction();
  const timer = setInterval(sendAction, 4500);
  try {
    return await work();
  } catch (err) {
    if (originalText) await setPressedButtonText(ctx, originalText);
    throw err;
  } finally {
    clearInterval(timer);
    if (status) ctx.api.deleteMessage(status.chat.id, status.message_id).catch(() => {});
  }
}

module.exports = { removePressedButton, setPressedButtonText, replyToButtonMessage, withButtonProgress };
