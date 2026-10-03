const crypto = require("node:crypto");

const AUDIO_TOKEN_TTL_MS = 30 * 60 * 1000;

/** Pending "Download MP3" buttons, keyed by a short token that fits in callback_data (64 bytes). */
class AudioStore {
  constructor() {
    this.tasks = new Map();
    // Drop expired tokens so the map does not grow forever.
    setInterval(() => this.purge(), 5 * 60 * 1000).unref();
  }

  add({ userId, url, title, performer }) {
    const token = crypto.randomBytes(12).toString("hex");
    this.tasks.set(token, { userId, url, title, performer, createdAt: Date.now(), inProgress: false });
    return token;
  }

  get(token) {
    const task = this.tasks.get(token);
    if (task && Date.now() - task.createdAt > AUDIO_TOKEN_TTL_MS) {
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
      if (now - task.createdAt > AUDIO_TOKEN_TTL_MS) this.tasks.delete(token);
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

module.exports = { AudioStore, UserLimiter };
