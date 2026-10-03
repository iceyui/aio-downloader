const { config } = require("./config");

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

class TooLargeError extends Error {
  constructor(size, limit) {
    super(`Content too large: ${size} > ${limit}`);
    this.size = size;
    this.limit = limit;
  }
}

/** Download a URL into memory, aborting once it exceeds `maxBytes`. Returns { buffer, contentType }. */
async function downloadBuffer(url, maxBytes = config.maxUploadBytes) {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    redirect: "follow",
    signal: AbortSignal.timeout(config.httpTimeoutMs),
  });
  if (!res.ok) throw new Error(`Download status ${res.status}`);

  const declared = Number(res.headers.get("content-length"));
  if (declared > maxBytes) {
    await res.body?.cancel();
    throw new TooLargeError(declared, maxBytes);
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > maxBytes) throw new TooLargeError(size, maxBytes);
    chunks.push(chunk);
  }
  return { buffer: Buffer.concat(chunks), contentType: res.headers.get("content-type") || "" };
}

function kindFromMagic(head) {
  if (head[0] === 0xff && head[1] === 0xd8) return "photo"; // JPEG
  if (head.subarray(0, 4).toString("latin1") === "\x89PNG") return "photo";
  if (head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WEBP") return "photo";
  if (head.subarray(4, 8).toString("latin1") === "ftyp") return "video";
  return null;
}

/**
 * Tell whether a URL serves a photo or a video without downloading it: Content-Type from a HEAD
 * request, falling back to the first bytes of a ranged GET. Returns "photo" | "video" | null.
 */
async function probeKind(url) {
  const headers = { "User-Agent": USER_AGENT };
  try {
    const res = await fetch(url, { method: "HEAD", headers, redirect: "follow", signal: AbortSignal.timeout(15_000) });
    const type = res.headers.get("content-type") || "";
    if (type.startsWith("image/")) return "photo";
    if (type.startsWith("video/")) return "video";
  } catch {
    // fall through to the ranged GET
  }
  try {
    const res = await fetch(url, { headers: { ...headers, Range: "bytes=0-15" }, redirect: "follow", signal: AbortSignal.timeout(15_000) });
    const head = Buffer.from(await res.arrayBuffer()).subarray(0, 16);
    return kindFromMagic(head);
  } catch {
    return null;
  }
}

/** File extension for an audio buffer: TikTok serves MP3 for some sounds and AAC/M4A for others. */
function audioExtension(buffer) {
  const head = buffer.subarray(0, 12);
  if (head.subarray(0, 3).toString("latin1") === "ID3") return "mp3";
  if (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) return "mp3";
  if (head.subarray(4, 8).toString("latin1") === "ftyp") return "m4a";
  return "mp3";
}

module.exports = { downloadBuffer, audioExtension, probeKind, TooLargeError };
