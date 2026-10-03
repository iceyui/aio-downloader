const Tiktok = require("@tobyg74/tiktok-api-dl");
const { ttdl } = require("btch-downloader");
const { config } = require("./config");
const { probeKind } = require("./download");

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
 * Convert one @tobyg74 version's `result` into the shape send.js expects:
 * { platform, author, desc, items: [{ kind: "photo"|"video", url }], music: { url, title, author } | null }
 */
function normalize(version, r) {
  const images = Array.isArray(r.images) ? r.images.filter(Boolean) : [];
  const videoUrl =
    version === "v3"
      ? r.videoSD || r.videoHD || null // videoSD is the no-watermark file (same bytes as v1/v2)
      : first(r.video?.playAddr);
  const items = images.length
    ? images.map((url) => ({ kind: "photo", url }))
    : videoUrl
      ? [{ kind: "video", url: videoUrl }]
      : [];
  const musicUrl = first(r.music?.playUrl);
  return {
    platform: "tiktok",
    author: authorText(r.author),
    desc: (r.desc || "").trim() || null,
    items,
    music: musicUrl ? { url: musicUrl, title: r.music.title || null, author: r.music.author || null } : null,
  };
}

async function fromTobyg(version, url) {
  const res = await Tiktok.Downloader(url, { version, proxy: config.tiktokProxy });
  if (res?.status !== "success" || !res.result) throw new Error(res?.message || "no result");
  return normalize(version, res.result);
}

/**
 * Last resort: btch-downloader's ttdl (third-party backend, no author, HD video ~30+ MB).
 * Photo posts come back inside `video` too, so each link is probed for its real type.
 */
async function fromBtch(url) {
  const res = await ttdl(url);
  if (!res?.status) throw new Error(res?.message || "no result");
  const links = (res.video || []).filter(Boolean);
  const kinds = await Promise.all(links.map(probeKind));
  const items = links.map((u, i) => ({ kind: kinds[i] || "video", url: u }));
  const musicUrl = first(res.audio);
  return {
    platform: "tiktok",
    author: null,
    desc: (res.title || "").trim() || null,
    items,
    // `title_audio` is only the description + " (audio)", not the real song title.
    music: musicUrl ? { url: musicUrl, title: null, author: null } : null,
  };
}

// Tried in order until one returns media.
// v1 = TikTok API, v2 = SSSTik, v3 = MusicalDown (all @tobyg74), btch = btch-downloader backend.
const SOURCES = [
  { name: "v1", run: (url) => fromTobyg("v1", url) },
  { name: "v2", run: (url) => fromTobyg("v2", url) },
  { name: "v3", run: (url) => fromTobyg("v3", url) },
  { name: "btch", run: fromBtch },
];

/** Returns { version, ...normalized } or throws with the per-source errors. */
async function fetchTiktok(url) {
  const errors = [];
  for (const source of SOURCES) {
    try {
      const data = await source.run(url);
      if (data.items.length === 0) {
        errors.push(`${source.name}: no media in result`);
        continue;
      }
      return { version: source.name, ...data };
    } catch (err) {
      errors.push(`${source.name}: ${err?.message || err}`);
    }
  }
  const err = new Error(`All downloader versions failed: ${errors.join(" | ")}`);
  err.code = "ALL_VERSIONS_FAILED";
  throw err;
}

/**
 * The 1080p no-watermark file, for the "HD" button. Sources (both serve the same file):
 * @tobyg74 v3 `videoHD`, then btch-downloader. Not v1 `downloadAddr`: that one is the watermarked copy.
 * Returns the URL or throws.
 */
async function fetchTiktokHd(url) {
  const errors = [];
  try {
    const res = await Tiktok.Downloader(url, { version: "v3", proxy: config.tiktokProxy });
    if (res?.status === "success" && res.result?.videoHD) return res.result.videoHD;
    errors.push(`v3: ${res?.message || "no videoHD"}`);
  } catch (err) {
    errors.push(`v3: ${err?.message || err}`);
  }
  try {
    const res = await ttdl(url);
    const link = res?.status ? first(res.video) : null;
    if (link && (await probeKind(link)) !== "photo") return link;
    errors.push(`btch: ${res?.message || "no video"}`);
  } catch (err) {
    errors.push(`btch: ${err?.message || err}`);
  }
  throw new Error(`No HD source: ${errors.join(" | ")}`);
}

module.exports = { fetchTiktok, fetchTiktokHd, isTiktokUrl, normalize };
