from __future__ import annotations

import os
from typing import Any

import aiohttp
from tenacity import RetryError

from bot.context import BotContext
from bot.downloader_client import DownloaderClient, DownloaderError


def get_base_url_for(ctx: BotContext, platform_name: str) -> str:
    # Prefer YAML-configured per-platform endpoint if present
    plat = (platform_name or "").lower()
    if ctx.settings.endpoints_per_platform.get(plat):
        return ctx.settings.endpoints_per_platform[plat]
    return ctx.settings.downloader_api_base_url


def get_param_names(platform_name: str) -> tuple[str, str]:
    up = platform_name.upper()
    url_param = os.getenv(f"DOWNLOADER_URL_PARAM_NAME_{up}") or os.getenv("DOWNLOADER_URL_PARAM_NAME") or "url"
    key_header = os.getenv(f"DOWNLOADER_APIKEY_HEADER_NAME_{up}") or os.getenv("DOWNLOADER_APIKEY_HEADER_NAME") or "x-api-key"
    return url_param, key_header


def build_api(ctx: BotContext, platform_name: str) -> DownloaderClient:
    url_param, key_header = get_param_names(platform_name)
    return DownloaderClient(
        base_url=get_base_url_for(ctx, platform_name),
        api_key=ctx.settings.downloader_api_key,
        connect_timeout=ctx.settings.http_connect_timeout,
        read_timeout=ctx.settings.http_read_timeout,
        total_timeout=ctx.settings.http_total_timeout,
        url_param_name=url_param,
        apikey_header_name=key_header,
    )


async def fetch_with_redirect(ctx: BotContext, api: DownloaderClient, session: aiohttp.ClientSession, *, req_id: str, user_id: int, url: str, platform: str) -> dict[str, Any]:
    import logging

    logger = logging.getLogger("bot")
    logger.info(
        "request_start id=%s user=%s url=%s platform=%s endpoint=%s url_param=%s key_header=%s",
        req_id,
        user_id,
        url,
        platform,
        api.base_url,
        api.url_param_name,
        api.apikey_header_name,
    )
    resolved = await api.resolve_redirects(session, url)
    if resolved != url:
        logger.info("url_resolved id=%s from=%s to=%s", req_id, url, resolved)
    try:
        data = await api.fetch(session, resolved)
        return data
    except RetryError as e:
        cause = e.last_attempt.exception() if e.last_attempt else None
        if isinstance(cause, DownloaderError):
            raise cause
        raise DownloaderError("Downloader failed after retries") from e
