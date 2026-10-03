const { igdl } = require("btch-downloader");

const INSTAGRAM_HOSTS = ["instagram.com", "instagr.am"];
const MAX_ATTEMPTS = 3; // the btch backend sometimes answers 503
const REQUEST_TIMEOUT_MS = 60_000;

function isInstagramUrl(text) {
  let url;
  try {
    url = new URL(text);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  return INSTAGRAM_HOSTS.some((d) => host === d || host.endsWith("." + d));
}

/** Stories need a logged-in session; the downloader returns empty items for them. */
function isInstagramStoryUrl(text) {
  try {
    return /^\/stories\//.test(new URL(text).pathname);
  } catch {
    return false;
  }
}

/**
 * btch-downloader returns proxy links (d.rapidcdn.app/v2?token=<JWT>) whose payload holds the
 * original Instagram CDN URL. The proxy serves the same file for every item of a carousel, so we
 * read the original URL out of the token and download from Instagram directly.
 */
function originalUrl(proxyUrl) {
  try {
    const token = new URL(proxyUrl).searchParams.get("token");
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.url === "string" ? payload.url : null;
  } catch {
    return null;
  }
}

function mediaKind(url) {
  try {
    return new URL(url).pathname.toLowerCase().endsWith(".mp4") ? "video" : "photo";
  } catch {
    return "photo";
  }
}

/** Convert the btch `result` array into [{ kind: "photo"|"video", url }], without duplicates. */
function normalize(result) {
  const items = [];
  const seen = new Set();
  for (const m of Array.isArray(result) ? result : []) {
    if (!m?.url) continue;
    const url = originalUrl(m.url) || m.url;
    // The backend repeats each media N times for an N-item carousel; dedupe on the path (query = signature).
    const key = url.split("?")[0];
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ kind: mediaKind(url), url });
  }
  return items;
}

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout after ${ms} ms`)), ms))]);

/**
 * Returns the send.js shape { platform, author, desc, items, music } or throws with code
 * ALL_VERSIONS_FAILED. The backend gives no caption/author, so those stay null.
 */
async function fetchInstagram(url) {
  const errors = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await withTimeout(igdl(url), REQUEST_TIMEOUT_MS);
      const items = res?.status ? normalize(res.result) : [];
      if (items.length) return { platform: "instagram", author: null, desc: null, items, music: null, attempt };
      errors.push(`attempt ${attempt}: ${res?.message || "no media in result"}`);
    } catch (err) {
      errors.push(`attempt ${attempt}: ${err?.message || err}`);
    }
  }
  const err = new Error(`Instagram downloader failed: ${errors.join(" | ")}`);
  err.code = "ALL_VERSIONS_FAILED";
  throw err;
}

module.exports = { fetchInstagram, isInstagramUrl, isInstagramStoryUrl, normalize };
