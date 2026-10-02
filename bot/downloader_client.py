from __future__ import annotations

import asyncio
import json
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode

import aiohttp
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential


class DownloaderError(Exception):
    pass


class TransientDownloaderError(DownloaderError):
    """Server-side/network failure worth retrying (5xx)."""


class ApiRejectedError(DownloaderError):
    """API answered but refused the request (bad key, invalid/private URL). Not retried."""


class TooLargeError(DownloaderError):
    def __init__(self, size: int, limit: int):
        super().__init__(f"Content too large: {size} > {limit}")
        self.size = size
        self.limit = limit


class DownloaderClient:
    def __init__(
        self,
        base_url: str,
        api_key: Optional[str] = None,
        connect_timeout: int = 10,
        read_timeout: int = 60,
        total_timeout: int = 120,
        url_param_name: str = "url",
        apikey_header_name: str = "x-api-key",
    ) -> None:
        self.base_url = base_url.rstrip("?")
        self.api_key = api_key
        self.url_param_name = url_param_name or "url"
        self.apikey_header_name = apikey_header_name or "x-api-key"
        self._timeout = aiohttp.ClientTimeout(
            total=total_timeout, connect=connect_timeout, sock_read=read_timeout
        )

    # Only retry transient failures: a rejected request would just burn API quota.
    @retry(
        wait=wait_exponential(multiplier=0.5, min=0.5, max=4),
        stop=stop_after_attempt(3),
        retry=retry_if_exception_type((TransientDownloaderError, aiohttp.ClientError, asyncio.TimeoutError)),
    )
    async def fetch(self, session: aiohttp.ClientSession, url: str) -> Dict[str, Any]:
        query = urlencode({self.url_param_name: url})
        final_url = f"{self.base_url}?{query}"
        headers = {self.apikey_header_name: self.api_key} if self.api_key else {}

        async with session.get(final_url, headers=headers, timeout=self._timeout) as resp:
            if resp.status >= 500:
                raise TransientDownloaderError(f"Server error: {resp.status}")
            if resp.status != 200:
                text = await resp.text()
                try:
                    msg = json.loads(text).get("message")
                except Exception:
                    msg = None
                raise ApiRejectedError(f"Status {resp.status}: {msg or text[:200]}")
            data = await resp.json(content_type=None)

        if not isinstance(data, dict) or not data:
            raise DownloaderError("Empty response from downloader")

        if data.get("success") is False:
            raise ApiRejectedError(data.get("message") or "Downloader returned unsuccess status")

        # tiktok-downloader-v2 returns the payload under "data"; older endpoints used "result".
        if not isinstance(data.get("data"), dict) and not isinstance(data.get("result"), dict):
            raise DownloaderError("Invalid response: missing data/result")

        return data

    async def head_size(self, session: aiohttp.ClientSession, url: str) -> Optional[int]:
        try:
            async with session.head(url, timeout=self._timeout, allow_redirects=True) as resp:
                cl = resp.headers.get("Content-Length")
                if cl is not None and cl.isdigit():
                    return int(cl)
        except Exception:
            return None
        return None

    async def download_to_file(self, session: aiohttp.ClientSession, url: str, dest_path: str) -> int:
        async with session.get(url, timeout=self._timeout) as resp:
            if resp.status != 200:
                text = await resp.text()
                raise DownloaderError(f"Download status {resp.status}: {text[:200]}")
            size = 0
            with open(dest_path, "wb") as f:
                async for chunk in resp.content.iter_chunked(1024 * 64):
                    f.write(chunk)
                    size += len(chunk)
            return size

    async def download_to_bytes(self, session: aiohttp.ClientSession, url: str, max_bytes: int) -> bytes:
        async with session.get(url, timeout=self._timeout) as resp:
            if resp.status != 200:
                text = await resp.text()
                raise DownloaderError(f"Download status {resp.status}: {text[:200]}")
            buf = bytearray()
            async for chunk in resp.content.iter_chunked(1024 * 64):
                buf += chunk
                if len(buf) > max_bytes:
                    raise TooLargeError(len(buf), max_bytes)
            return bytes(buf)

    async def resolve_redirects(self, session: aiohttp.ClientSession, url: str) -> str:
        try:
            async with session.get(url, timeout=self._timeout, allow_redirects=True) as resp:
                return str(resp.url)
        except Exception:
            return url
