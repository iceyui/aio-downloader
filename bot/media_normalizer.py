from __future__ import annotations

from typing import Any, Dict, List, Optional
from urllib.parse import urlparse


def _infer_ext_from_url(url: str) -> Optional[str]:
    try:
        path = urlparse(url).path
        if "." in path:
            ext = path.rsplit(".", 1)[-1].lower()
            if 1 <= len(ext) <= 5:
                return ext
    except Exception:
        return None
    return None


def _normalize_media_item(m: Dict[str, Any], platform: str) -> Dict[str, Any]:
    url = m.get("url") or m.get("download_url") or m.get("direct") or m.get("link") or ""
    mime = (m.get("mimeType") or m.get("mime_type") or "").lower()
    ext = (m.get("extension") or m.get("ext") or "").lower()
    if not ext:
        if mime.startswith("video/"):
            ext = mime.split("/", 1)[-1].split(";")[0]
        elif mime.startswith("audio/"):
            ext = mime.split("/", 1)[-1].split(";")[0]
    if not ext:
        ext = _infer_ext_from_url(url) or ""

    t = (m.get("type") or "").lower()
    # Infer type if missing or ambiguous
    if not t:
        if mime.startswith("audio/"):
            t = "audio"
        elif mime.startswith("video/"):
            t = "video"
        elif ext in {"mp3", "m4a", "aac", "opus", "ogg", "oga"}:
            t = "audio"
        elif ext in {"mp4", "mkv", "mov", "webm", "m4v"}:
            t = "video"
        elif ext in {"jpg", "jpeg", "png", "webp"}:
            t = "image"

    quality = m.get("quality") or m.get("label") or ""

    # data_size normalization
    data_size = m.get("data_size")
    if data_size is None:
        # Some backends expose size under different keys; try best-effort conversion
        for key in ("size", "filesize", "fileSize", "content_length"):
            if key in m:
                data_size = m.get(key)
                break
    try:
        data_size_int = int(data_size) if data_size is not None else None
    except Exception:
        data_size_int = None

    duration = m.get("duration")
    try:
        duration_int = int(duration) if duration is not None else None
    except Exception:
        duration_int = None

    has_audio = False
    if t == "audio" or m.get("is_audio") is True:
        has_audio = True
    else:
        if m.get("audioQuality") not in (None, "", "null"):
            has_audio = True
        # Codec hints inside mimeType
        if any(tok in mime for tok in ["mp4a", "vorbis", "opus", "ac-3", "ec-3"]):
            has_audio = True

    normalized = {
        "url": url,
        "type": t or "file",
        "extension": ext or None,
        "quality": quality,
        "data_size": data_size_int,
        "duration": duration_int,
        "filename": m.get("filename"),
        "mimeType": mime or None,
        # carry through useful platform-specific fields
        "formatId": m.get("formatId") or m.get("itag"),
        "has_audio": has_audio,
    }
    return normalized


def _adapt_tiktok_v2(d: Dict[str, Any]) -> Dict[str, Any]:
    """Map tiktok-downloader-v2 `data` into the internal result shape.

    Input: {source_url, cdn_url, file_size, description, author{username,nickname},
            video{duration, cover, format, direct_play_url}}
    """
    author = d.get("author") if isinstance(d.get("author"), dict) else {}
    video = d.get("video") if isinstance(d.get("video"), dict) else {}
    nickname = author.get("nickname")
    username = author.get("username")
    if nickname and username:
        author_text = f"{nickname} (@{username})"
    else:
        author_text = nickname or (f"@{username}" if username else None)

    medias: List[Dict[str, Any]] = []
    # cdn_url is re-hosted by pitucode and fetchable by Telegram; direct_play_url needs TikTok cookies.
    if isinstance(d.get("cdn_url"), str) and d["cdn_url"].startswith("http"):
        medias.append({
            "url": d["cdn_url"],
            "type": "video",
            "extension": video.get("format") or "mp4",
            "quality": "hd_no_watermark",
            "data_size": d.get("file_size"),
            "duration": video.get("duration"),
        })
    for img in d.get("images") or []:
        img_url = img.get("url") if isinstance(img, dict) else img
        if isinstance(img_url, str) and img_url.startswith("http"):
            medias.append({"url": img_url, "type": "image"})

    return {
        "url": d.get("source_url"),
        "author": author_text,
        "title": d.get("description") or None,
        "thumbnail": video.get("cover"),
        "medias": medias,
    }


def extract_result(data: Dict[str, Any], platform: str) -> Dict[str, Any]:
    """Pick the payload from an API response (v2 `data` or legacy `result`) and normalize it."""
    payload = data.get("data")
    if isinstance(payload, dict):
        raw = _adapt_tiktok_v2(payload)
    else:
        raw = data.get("result") or {}
    return normalize_result(raw, platform)


def normalize_result(result: Dict[str, Any], platform: str) -> Dict[str, Any]:
    # Top-level passthrough with media normalization
    medias = result.get("medias") or []
    if not isinstance(medias, list):
        medias = []
    normalized_medias: List[Dict[str, Any]] = []
    for m in medias:
        if isinstance(m, dict):
            normalized_medias.append(_normalize_media_item(m, platform))

    out = dict(result)
    out["medias"] = normalized_medias
    return out

