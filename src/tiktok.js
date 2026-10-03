const Tiktok = require("@tobyg74/tiktok-api-dl");
const { config } = require("./config");

// v1 = TikTok API, v2 = SSSTik, v3 = MusicalDown. Tried in order until one returns media.
const VERSIONS = ["v1", "v2", "v3"];

const TIKTOK_HOSTS = ["tiktok.com"];

function isTiktokUrl(text) {
  let url;
  try {
    url = new URL(text);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  return TIKTOK_HOSTS.some((d) => host === d || host.endsWith("." + d));
}

const first = (v) => (Array.isArray(v) ? v[0] : v) || null;

function authorText(author) {
  if (!author) return null;
  const nickname = author.nickname;
  const username = author.username || author.uniqueId;
  if (nickname && username) return `${nickname} (@${username})`;
  return nickname || (username ? `@${username}` : null);
}

/**
 * Convert one version's `result` into a single shape:
 * { type, author, desc, videoUrl, images: [url], music: { url, title, author } | null }
 */
function normalize(version, r) {
  const images = Array.isArray(r.images) ? r.images.filter(Boolean) : [];
  const videoUrl =
    version === "v3"
      ? r.videoSD || r.videoHD || null // videoSD is the no-watermark file (same bytes as v1/v2)
      : first(r.video?.playAddr);
  const musicUrl = first(r.music?.playUrl);
  return {
    type: images.length ? "image" : "video",
    author: authorText(r.author),
    desc: (r.desc || "").trim() || null,
    videoUrl: images.length ? null : videoUrl,
    images,
    music: musicUrl ? { url: musicUrl, title: r.music.title || null, author: r.music.author || null } : null,
  };
}

/** Returns { version, ...normalized } or throws with the per-version errors. */
async function fetchTiktok(url) {
  const errors = [];
  for (const version of VERSIONS) {
    try {
      const res = await Tiktok.Downloader(url, { version, proxy: config.tiktokProxy });
      if (res?.status !== "success" || !res.result) {
        errors.push(`${version}: ${res?.message || "no result"}`);
        continue;
      }
      const data = normalize(version, res.result);
      if (!data.videoUrl && data.images.length === 0) {
        errors.push(`${version}: no media in result`);
        continue;
      }
      return { version, ...data };
    } catch (err) {
      errors.push(`${version}: ${err?.message || err}`);
    }
  }
  const err = new Error(`All downloader versions failed: ${errors.join(" | ")}`);
  err.code = "ALL_VERSIONS_FAILED";
  throw err;
}

module.exports = { fetchTiktok, isTiktokUrl, normalize };
