const { Bot } = require("grammy");
const { autoRetry } = require("@grammyjs/auto-retry");
const { config } = require("./config");
const { ButtonTaskStore, UserLimiter, LanguageStore } = require("./state");
const { DEFAULT_LANGUAGE, normalizeLanguage, t } = require("./i18n");
const { registerCommands, menuFor } = require("./handlers/commands");
const { registerMusicButton } = require("./handlers/music");
const { registerHdButton } = require("./handlers/hd");
const { registerLinkHandler } = require("./handlers/link");
const { log } = require("./log");

/** Returns { bot, menu } where `menu` is the default (English) "/" command menu to publish. */
function createBot() {
  const bot = new Bot(config.botToken);
  bot.api.config.use(autoRetry());

  const deps = {
    buttonTasks: new ButtonTaskStore(),
    limiter: new UserLimiter(config.maxConcurrentPerUser),
    languageStore: new LanguageStore(config.languageStorePath),
    startedAt: Date.now(),
  };

  // Every handler gets ctx.lang (the user's saved choice, English by default) and ctx.t(key, vars).
  bot.use((ctx, next) => {
    ctx.lang = normalizeLanguage(deps.languageStore.get(ctx.from?.id) || DEFAULT_LANGUAGE);
    ctx.t = (key, vars) => t(ctx.lang, key, vars);
    return next();
  });

  // Order matters: commands and button callbacks first, the catch-all text handler last.
  registerCommands(bot, deps);
  registerMusicButton(bot, deps);
  registerHdButton(bot, deps);
  registerLinkHandler(bot, deps);

  bot.catch((err) => log("unhandled_error", err.error?.message || err.message));
  return { bot, menu: menuFor(DEFAULT_LANGUAGE) };
}

module.exports = { createBot };
