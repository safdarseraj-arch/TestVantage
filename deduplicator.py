"""Question deduplication via Gemini text embeddings and cosine similarity."""

from __future__ import annotations

import env_loader  # noqa: F401 - loads .env before genai.Client()

import asyncio

import numpy as np
from google import genai
from google.genai import types

client = genai.Client()

# text-embedding-004 is gone from the v1beta API. Keep 768 dims to match question_bank.embedding.
_EMBEDDING_MODEL = "gemini-embedding-001"
_EMBEDDING_DIM = 768
_DUPLICATE_THRESHOLD = 0.85


def _embed_sync(text: str) -> list[float]:
    response = client.models.embed_content(
        model=_EMBEDDING_MODEL,
        contents=text,
        config=types.EmbedContentConfig(output_dimensionality=_EMBEDDING_DIM),
    )
    embeddings = getattr(response, "embeddings", None) or []
    if not embeddings:
        raise ValueError("Embedding API returned no vectors.")
    values = getattr(embeddings[0], "values", None)
    if values is None:
        raise ValueError("Embedding response missing vector values.")
    return list(values)


async def get_embedding(text: str) -> list[float]:
    """Return a 768-d embedding for ``text`` using ``gemini-embedding-001``."""
    stripped = (text or "").strip()
    if not stripped:
        raise ValueError("Cannot embed empty text.")
    return await asyncio.to_thread(_embed_sync, stripped)


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    va = np.asarray(a, dtype=np.float64)
    vb = np.asarray(b, dtype=np.float64)
    if va.shape != vb.shape:
        raise ValueError("Embedding vectors must have the same dimension.")
    norm_a = np.linalg.norm(va)
    norm_b = np.linalg.norm(vb)
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return float(np.dot(va, vb) / (norm_a * norm_b))


def is_duplicate(new_vector: list[float], existing_vectors: list[list[float]]) -> bool:
    """Return True if ``new_vector`` is similar to any existing vector (cosine > 0.85)."""
    if not existing_vectors:
        return False
    for existing in existing_vectors:
        if _cosine_similarity(new_vector, existing) > _DUPLICATE_THRESHOLD:
            return True
    return False
