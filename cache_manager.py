"""Ephemeral Gemini context caches for large reference material (google-genai SDK)."""

from __future__ import annotations

import env_loader  # noqa: F401 - loads .env before genai.Client()

import asyncio
import logging
from pathlib import Path
from typing import Any

from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

client = genai.Client()

_CACHE_TTL = "600s"
_DEFAULT_CACHE_MODEL = "gemini-3.7-flash"
_ALLOWED_CACHE_MODELS = frozenset({"gemini-3.7-flash", "gemini-3-pro"})
_DEFAULT_TOKEN_COUNT_MODEL = _DEFAULT_CACHE_MODEL


def _validate_model_name(model_name: str) -> str:
    normalized = (model_name or "").strip()
    if normalized not in _ALLOWED_CACHE_MODELS:
        allowed = ", ".join(sorted(_ALLOWED_CACHE_MODELS))
        raise ValueError(f"model_name must be one of: {allowed}")
    return normalized


def _create_cache_sync(
    *,
    model_name: str,
    display_name: str,
    contents: Any,
) -> types.CachedContent:
    return client.caches.create(
        model=model_name,
        config=types.CreateCachedContentConfig(
            display_name=display_name,
            contents=contents,
            ttl=_CACHE_TTL,
        ),
    )


def _upload_file_sync(path: Path, display_name: str) -> types.File:
    return client.files.upload(
        file=path,
        config=types.UploadFileConfig(display_name=display_name),
    )


def _delete_cache_sync(name: str) -> None:
    client.caches.delete(name=name)


def _delete_file_sync(name: str) -> None:
    client.files.delete(name=name)


def _count_tokens_sync(text: str, model_name: str) -> int:
    response = client.models.count_tokens(model=model_name, contents=text)
    total = getattr(response, "total_tokens", None)
    if total is None:
        raise ValueError("count_tokens returned no total_tokens.")
    return int(total)


class EphemeralContextCache:
    """Async context manager that creates a short-lived Gemini context cache."""

    def __init__(
        self,
        *,
        source: str,
        display_name: str,
        model_name: str = _DEFAULT_CACHE_MODEL,
    ) -> None:
        """
        ``source`` is either a readable file path or a large reference prompt string.
        """
        if not (source or "").strip():
            raise ValueError("source must be a non-empty file path or prompt string.")
        if not (display_name or "").strip():
            raise ValueError("display_name is required.")

        self._source = source
        self._display_name = display_name.strip()
        self._model_name = _validate_model_name(model_name)
        self.cache: types.CachedContent | None = None
        self._uploaded_file: types.File | None = None

    async def __aenter__(self) -> types.CachedContent:
        path = Path(self._source)
        if path.is_file():
            uploaded = await asyncio.to_thread(
                _upload_file_sync,
                path.resolve(),
                self._display_name,
            )
            self._uploaded_file = uploaded
            contents: Any = uploaded
        else:
            contents = self._source

        self.cache = await asyncio.to_thread(
            _create_cache_sync,
            model_name=self._model_name,
            display_name=self._display_name,
            contents=contents,
        )
        return self.cache

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        try:
            return None
        finally:
            if self.cache and self.cache.name:
                await asyncio.to_thread(_delete_cache_sync, self.cache.name)
            if self._uploaded_file and self._uploaded_file.name:
                await asyncio.to_thread(_delete_file_sync, self._uploaded_file.name)
            logger.info(
                "Cache and source files successfully cleared from Google storage."
            )


async def estimate_tokens(text: str) -> int:
    """Estimate token count for ``text`` via ``client.models.count_tokens``."""
    stripped = (text or "").strip()
    if not stripped:
        return 0
    return await asyncio.to_thread(
        _count_tokens_sync,
        stripped,
        _DEFAULT_TOKEN_COUNT_MODEL,
    )