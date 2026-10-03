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

/** File extension for an audio buffer: TikTok serves MP3 for some sounds and AAC/M4A for others. */
function audioExtension(buffer) {
  const head = buffer.subarray(0, 12);
  if (head.subarray(0, 3).toString("latin1") === "ID3") return "mp3";
  if (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) return "mp3";
  if (head.subarray(4, 8).toString("latin1") === "ftyp") return "m4a";
  return "mp3";
}

module.exports = { downloadBuffer, audioExtension, TooLargeError };
