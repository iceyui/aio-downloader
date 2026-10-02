from __future__ import annotations

import logging
from typing import Dict, List, Tuple

import aiohttp
from telegram import InlineKeyboardButton, InlineKeyboardMarkup

from bot.context import BotContext
from bot.media_normalizer import extract_result
from bot.media_utils import is_video, pick_caption
from handlers.utils import build_api, fetch_with_redirect


def _extract_resolution(m: Dict) -> int:
    q = (m.get("quality") or "").lower()
    # Common patterns like "mp4 (1080p)" or "webm (720p)"
    import re

    mobj = re.search(r"(\d{3,4})p", q)
    if mobj:
        try:
            return int(mobj.group(1))
        except Exception:
            pass
    # fallback from width/height if present
    for key in ("height", "Height"):
        try:
            h = int(m.get(key))
            if 100 <= h <= 5000:
                return h
        except Exception:
            continue
    return 0


async def process_youtube(ctx: BotContext, *, platform: str, message, url: str, req_id: str, user_id: int) -> None:
    """
    YouTube-specific processor.
    - Do NOT upload video to Telegram.
    - Send a compact inline keyboard with direct links per quality (limited set).
    """
    logger = logging.getLogger("bot")
    api = build_api(ctx, platform)
    try:
        async with aiohttp.ClientSession() as session:
            data = await fetch_with_redirect(ctx, api, session, req_id=req_id, user_id=user_id, url=url, platform=platform)
    except Exception:
        logger.exception("youtube_unexpected id=%s user=%s url=%s", req_id, user_id, url)
        await message.reply_text("Terjadi kesalahan saat memproses tautan.")
        return

    result = extract_result(data, platform)

    # Build a small set of quality buttons
    medias = result.get("medias") or []
    videos = [m for m in medias if is_video(m) and isinstance(m.get("url"), str) and m.get("url").startswith("http")]

    # Group by resolution with preference for muxed (has_audio True)
    by_res: Dict[int, Dict] = {}
    for m in videos:
        res = _extract_resolution(m)
        if res <= 0:
            continue
        existing = by_res.get(res)
        if not existing:
            by_res[res] = m
        else:
            # Prefer muxed over video-only
            if (m.get("has_audio") and not existing.get("has_audio")):
                by_res[res] = m

    # Desired order of resolutions
    prefer = [2160, 1440, 1080, 720, 480, 360]
    ordered: List[Tuple[int, Dict]] = []
    for r in prefer:
        if r in by_res:
            ordered.append((r, by_res[r]))

    # Cap buttons to avoid Telegram "reply markup too long" (URLs are long)
    max_buttons = 5
    ordered = ordered[:max_buttons]

    rows: List[List[InlineKeyboardButton]] = []
    current: List[InlineKeyboardButton] = []
    for res, m in ordered:
        label = f"{res}p"
        btn = InlineKeyboardButton(text=label, url=m.get("url"))
        current.append(btn)
        if len(current) == 3:
            rows.append(current)
            current = []
    if current:
        rows.append(current)

    # Add original link
    if isinstance(result.get("url"), str) and result.get("url").startswith("http"):
        rows.append([InlineKeyboardButton(text="Buka Konten Asli", url=result["url"])])

    if not rows:
        await message.reply_text("Tidak ditemukan varian kualitas video.")
        return

    title = result.get("title")
    author = result.get("author")
    caption = f"Pilih kualitas untuk diunduh (YouTube):\n{pick_caption(author, title)}"

    # Send thumbnail image if available, otherwise text
    thumb = result.get("thumbnail") or result.get("thumb")
    try:
        if isinstance(thumb, str) and thumb.startswith("http"):
            await message.reply_photo(photo=thumb, caption=caption, reply_markup=InlineKeyboardMarkup(rows))
        else:
            await message.reply_text(caption, reply_markup=InlineKeyboardMarkup(rows))
    except Exception:
        logger.exception("youtube_send_result_failed id=%s", req_id)
        try:
            await message.reply_text(caption)
        except Exception:
            pass
