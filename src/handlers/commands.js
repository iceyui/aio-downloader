const { InlineKeyboard } = require("grammy");
const { config } = require("../config");
const { LANGUAGES, DEFAULT_LANGUAGE, t } = require("../i18n");
const { log } = require("../log");

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

/**
 * Single source for the slash commands: used to register the handlers, to publish the "/" menu
 * (setMyCommands), and to list commands in /help, so they can never drift apart.
 */
const COMMANDS = [
  { command: "start", descKey: "cmdStart", reply: replyStart },
  { command: "help", descKey: "cmdHelp", reply: replyHelp },
  { command: "runtime", descKey: "cmdRuntime", reply: replyRuntime },
  { command: "language", descKey: "cmdLanguage", reply: replyLanguage },
];

/** The "/" menu entries in the given language. */
function menuFor(lang) {
  return COMMANDS.map((c) => ({ command: c.command, description: t(lang, c.descKey) }));
}

function replyStart(ctx) {
  const kb = new InlineKeyboard()
    .text(ctx.t("btnHelp"), "help")
    .text(ctx.t("btnRuntime"), "runtime")
    .row()
    .text(ctx.t("btnLanguage"), "language");
  return ctx.reply(ctx.t("start", { sampleUrls: ctx.t("sampleUrls") }), { reply_markup: kb });
}

function replyHelp(ctx) {
  const commands = menuFor(ctx.lang).map((c) => `/${c.command} - ${c.description}`).join("\n");
  return ctx.reply(ctx.t("help", { commands }));
}

function replyRuntime(ctx, { startedAt }) {
  return ctx.reply(
    ctx.t("runtime", {
      uptime: formatUptime(Date.now() - startedAt),
      concurrency: config.maxConcurrentPerUser,
      maxUpload: Math.round(config.maxUploadBytes / (1024 * 1024)),
    }),
  );
}

function languageKeyboard(current) {
  const kb = new InlineKeyboard();
  for (const [code, { label }] of Object.entries(LANGUAGES)) {
    kb.text(code === current ? `✓ ${label}` : label, `lang:${code}`).row();
  }
  return kb;
}

function replyLanguage(ctx) {
  return ctx.reply(ctx.t("languagePrompt"), { reply_markup: languageKeyboard(ctx.lang) });
}

/**
 * Show the "/" menu in the chosen language for this private chat. English is the global default,
 * so choosing it just removes the chat-specific override.
 */
async function updateChatMenu(ctx, lang) {
  if (ctx.chat?.type !== "private") return;
  const scope = { type: "chat", chat_id: ctx.chat.id };
  try {
    if (lang === DEFAULT_LANGUAGE) await ctx.api.deleteMyCommands({ scope });
    else await ctx.api.setMyCommands(menuFor(lang), { scope });
  } catch (err) {
    log(`menu_update_failed chat=${ctx.chat.id}`, err.description || err.message);
  }
}

function registerCommands(bot, deps) {
  for (const c of COMMANDS) {
    bot.command(c.command, (ctx) => c.reply(ctx, deps));
  }

  // Inline buttons under /start reuse the same replies.
  for (const name of ["help", "runtime", "language"]) {
    const c = COMMANDS.find((x) => x.command === name);
    bot.callbackQuery(name, async (ctx) => {
      await ctx.answerCallbackQuery();
      await c.reply(ctx, deps);
    });
  }

  bot.callbackQuery(/^lang:(\w+)$/, async (ctx) => {
    const lang = ctx.match[1];
    if (!Object.hasOwn(LANGUAGES, lang)) return ctx.answerCallbackQuery();
    await deps.languageStore.set(ctx.from.id, lang);
    ctx.lang = lang;
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(ctx.t("languageChanged")).catch(() => ctx.reply(ctx.t("languageChanged")));
    await updateChatMenu(ctx, lang);
  });
}

module.exports = { registerCommands, menuFor };
