from __future__ import annotations

import logging

import aiohttp

from bot.context import BotContext
from bot.downloader_client import ApiRejectedError, DownloaderError
from bot.media_normalizer import extract_result
from handlers.flow import send_result_flow
from handlers.utils import build_api, fetch_with_redirect


async def process_generic(ctx: BotContext, *, platform: str, message, url: str, req_id: str, user_id: int) -> None:
    logger = logging.getLogger("bot")
    api = build_api(ctx, platform)
    try:
        async with aiohttp.ClientSession() as session:
            data = await fetch_with_redirect(ctx, api, session, req_id=req_id, user_id=user_id, url=url, platform=platform)
    except ApiRejectedError as e:
        logger.warning("downloader_rejected id=%s user=%s url=%s error=%s", req_id, user_id, url, str(e))
        await message.reply_text("Link tidak bisa diproses. Pastikan link valid dan kontennya publik.")
        return
    except DownloaderError as e:
        logger.warning("downloader_error id=%s user=%s url=%s error=%s", req_id, user_id, url, str(e))
        await message.reply_text("Maaf, server downloader sedang sibuk. Coba lagi nanti.")
        return
    except Exception:
        logger.exception("unexpected_downloader_error id=%s user=%s url=%s", req_id, user_id, url)
        await message.reply_text("Terjadi kesalahan saat memproses tautan.")
        return

    norm_result = extract_result(data, platform)
    await send_result_flow(ctx, platform=platform, message=message, result=norm_result, req_id=req_id, user_id=user_id, api=api, original_url=url)
