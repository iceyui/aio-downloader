const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { log } = require("./log");

const BUTTON_TOKEN_TTL_MS = 30 * 60 * 1000;

/**
 * Pending button actions ("Download MP3", "HD"), keyed by a short token that fits in
 * callback_data (64 bytes). A task is any object with at least `userId` (the link's sender).
 */
class ButtonTaskStore {
  constructor() {
    this.tasks = new Map();
    // Drop expired tokens so the map does not grow forever.
    setInterval(() => this.purge(), 5 * 60 * 1000).unref();
  }

  add(task) {
    const token = crypto.randomBytes(12).toString("hex");
    this.tasks.set(token, { ...task, createdAt: Date.now(), inProgress: false });
    return token;
  }

  get(token) {
    const task = this.tasks.get(token);
    if (task && Date.now() - task.createdAt > BUTTON_TOKEN_TTL_MS) {
      this.tasks.delete(token);
      return null;
    }
    return task || null;
  }

  delete(token) {
    this.tasks.delete(token);
  }

  purge() {
    const now = Date.now();
    for (const [token, task] of this.tasks) {
      if (now - task.createdAt > BUTTON_TOKEN_TTL_MS) this.tasks.delete(token);
    }
  }
}

/** Limits how many links one user can have processing at the same time. */
class UserLimiter {
  constructor(limit) {
    this.limit = limit;
    this.active = new Map();
  }

  tryAcquire(userId) {
    const n = this.active.get(userId) || 0;
    if (n >= this.limit) return false;
    this.active.set(userId, n + 1);
    return true;
  }

  release(userId) {
    const n = (this.active.get(userId) || 1) - 1;
    if (n <= 0) this.active.delete(userId);
    else this.active.set(userId, n);
  }
}

/**
 * Per-user language choice, persisted to a small JSON file so it survives restarts.
 * If the file can't be written (e.g. read-only disk) the choice still works until the next restart.
 */
class LanguageStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.langs = new Map();
    this.writing = Promise.resolve();
    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
      for (const [userId, lang] of Object.entries(data)) this.langs.set(Number(userId), lang);
    } catch (err) {
      if (err.code !== "ENOENT") log(`language_store_load_failed path=${filePath}`, err.message);
    }
  }

  get(userId) {
    return this.langs.get(userId) || null;
  }

  set(userId, lang) {
    this.langs.set(userId, lang);
    // Serialize writes; write to a temp file and rename so a crash never leaves a half-written file.
    const snapshot = JSON.stringify(Object.fromEntries(this.langs));
    this.writing = this.writing.then(async () => {
      try {
        await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
        const tmp = `${this.filePath}.tmp`;
        await fs.promises.writeFile(tmp, snapshot);
        await fs.promises.rename(tmp, this.filePath);
      } catch (err) {
        log(`language_store_save_failed path=${this.filePath}`, err.message);
      }
    });
    return this.writing;
  }
}

module.exports = { ButtonTaskStore, UserLimiter, LanguageStore };
