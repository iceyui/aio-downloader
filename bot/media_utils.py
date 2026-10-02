from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple


def summarize_result(result: Dict[str, Any]) -> Tuple[int, int, int]:
    videos = 0
    images = 0
    audios = 0
    for m in (result.get("medias") or []):
        t = (m.get("type") or "").lower()
        if t == "video":
            videos += 1
        elif t == "image":
            images += 1
        elif t == "audio":
            audios += 1
    return videos, images, audios


def pick_caption(author: Optional[str], title: Optional[str]) -> str:
    if not (author or title):
        return "."
    if not (title or "").strip():
        return author
    a = author or "-"
    t = (title or "-").strip()
    if len(t) > 200:
        t = t[:197] + "..."
    return f'{a} - "{t}"'


def iter_medias(result: Dict[str, Any]):
    for idx, m in enumerate(result.get("medias", []), start=1):
        yield idx, m


def _get_mime(m: Dict[str, Any]) -> str:
    return (m.get("mimeType") or m.get("mime_type") or "").lower()


def _get_extension(m: Dict[str, Any]) -> Optional[str]:
    ext = m.get("extension") or m.get("ext")
    if isinstance(ext, str):
        return ext.lower()
    return None


def is_audio(m: Dict[str, Any]) -> bool:
    t = (m.get("type") or "").lower()
    if t == "audio":
        return True
    if m.get("is_audio") is True:
        return True
    mime = _get_mime(m)
    if mime.startswith("audio/"):
        return True
    ext = _get_extension(m)
    if ext in {"mp3", "m4a", "aac", "opus", "ogg", "oga", "webm"}:
        return True
    return False


def is_video(m: Dict[str, Any]) -> bool:
    if is_audio(m):
        return False
    t = (m.get("type") or "").lower()
    if t == "video":
        return True
    mime = _get_mime(m)
    if mime.startswith("video/"):
        return True
    ext = _get_extension(m)
    if ext in {"mp4", "mkv", "mov", "webm", "m4v"}:
        return True
    return False


def is_image(m: Dict[str, Any]) -> bool:
    t = (m.get("type") or "").lower()
    if t == "image":
        return True
    mime = _get_mime(m)
    if mime.startswith("image/"):
        return True
    ext = _get_extension(m)
    if ext in {"jpg", "jpeg", "png", "webp", "gif"}:
        return True
    return False


def _quality_rank(q: Optional[str]) -> int:
    if not q:
        return 100
    ql = q.lower()
    # Lower is better
    priority = [
        "hd_no_watermark",
        "no_watermark",
        "hd",
        "1080",
        "720",
        "sd",
    ]
    for i, key in enumerate(priority):
        if key in ql:
            return i
    return 50


def _video_has_audio_track(m: Dict[str, Any]) -> bool:
    # Prefer muxed streams when available (useful for YouTube)
    if m.get("audioQuality") not in (None, "", "null"):
        return True
    mime = _get_mime(m)
    if any(tok in mime for tok in ["mp4a", "vorbis", "opus", "ac-3", "ec-3"]):
        return True
    return False


def choose_best_video(medias: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    videos = [m for m in medias if is_video(m)]
    if not videos:
        return None

    # Sort by: has audio track first, then quality priority, then size desc
    def sort_key(m: Dict[str, Any]):
        has_audio = _video_has_audio_track(m)
        q = _quality_rank(m.get("quality"))
        size = m.get("data_size") or 0
        try:
            size = int(size)
        except Exception:
            size = 0
        return (0 if has_audio else 1, q, -size)

    videos.sort(key=sort_key)
    return videos[0]


# Terabox utilities removed as platform support has been dropped
