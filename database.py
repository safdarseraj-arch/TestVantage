"""Async SQLAlchemy engine and pgvector duplicate helpers for the AI question bank."""

from __future__ import annotations

from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent / ".env", override=False)
except ImportError:
    # Install python-dotenv or rely on env_loader (stdlib .env parse) when importing this module.
    import env_loader  # noqa: F401

import os
from typing import Sequence

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from deduplicator import is_duplicate
from models import (  # noqa: F401 — register ORM tables with Base.metadata
    AIQuestionBank,
    AIQuestionCloneBatch,
    Base,
    StudentPerformance,
    TestResult,
    master_question_pool_select,
)

_SCHEMA_PATCHES: tuple[str, ...] = (
    "ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS topic VARCHAR(256)",
    "ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS bloom_level VARCHAR(32)",
    """
    DO $$ BEGIN
      ALTER TABLE question_bank
        ADD CONSTRAINT ck_question_bank_bloom_level
        CHECK (bloom_level IS NULL OR bloom_level IN (
          'Knowledge', 'Understanding', 'Application',
          'Analysis', 'Evaluation', 'Creation'
        ));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_question_bank_meta_filter
      ON question_bank (chapter, topic, difficulty, bloom_level);
    """,
    "ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS sub_bank_type VARCHAR(32)",
    "ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS parent_id VARCHAR(128)",
    "ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS is_child BOOLEAN",
    "ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS approval_status VARCHAR(32)",
    """
    UPDATE question_bank
    SET sub_bank_type = 'ai'
    WHERE sub_bank_type IS NULL OR TRIM(sub_bank_type) = '';
    """,
    """
    UPDATE question_bank
    SET approval_status = 'PENDING_REVIEW'
    WHERE approval_status IS NULL OR TRIM(approval_status) = '';
    """,
    """
    UPDATE question_bank
    SET is_child = FALSE
    WHERE is_child IS NULL;
    """,
    "ALTER TABLE test_results ADD COLUMN IF NOT EXISTS time_spent_ms INTEGER",
    "ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS unit VARCHAR(256)",
    "ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS needs_action BOOLEAN DEFAULT FALSE",
    "ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS is_pattern BOOLEAN DEFAULT FALSE",
    "ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS toughness_level INTEGER",
    """
    UPDATE question_bank
    SET needs_action = FALSE
    WHERE needs_action IS NULL;
    """,
    """
    UPDATE question_bank
    SET is_pattern = FALSE
    WHERE is_pattern IS NULL;
    """,
)

_DEFAULT_URL = "postgresql+asyncpg://postgres:postgres@127.0.0.1:5432/testvantages"


def _async_database_url(raw: str | None) -> str:
    url = (raw or _DEFAULT_URL).strip()
    if url.startswith("postgresql+psycopg://"):
        return "postgresql+asyncpg://" + url[len("postgresql+psycopg://") :]
    if url.startswith("postgres://"):
        return "postgresql+asyncpg://" + url[len("postgres://") :]
    if url.startswith("postgresql://"):
        return "postgresql+asyncpg://" + url[len("postgresql://") :]
    return url


DATABASE_URL = _async_database_url(os.getenv("DATABASE_URL"))

engine = create_async_engine(DATABASE_URL, pool_pre_ping=True)
AsyncSessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, autoflush=False, expire_on_commit=False)


async def _apply_schema_patches(conn) -> None:
    for statement in _SCHEMA_PATCHES:
        await conn.execute(text(statement.strip()))


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.create_all)
        await _apply_schema_patches(conn)


async def find_duplicate_vectors(
    session: AsyncSession,
    new_vector: list[float],
    limit: int = 32,
) -> list[list[float]]:
    """Return nearest stored embeddings for cosine duplicate checks."""
    distance = AIQuestionBank.embedding.cosine_distance(new_vector)
    stmt = (
        master_question_pool_select()
        .with_only_columns(AIQuestionBank.embedding)
        .order_by(distance)
        .limit(limit)
    )
    rows: Sequence[list[float]] = (await session.scalars(stmt)).all()
    return [list(row) for row in rows]


async def bank_has_duplicate(session: AsyncSession, new_vector: list[float]) -> bool:
    """True when pgvector neighbors indicate cosine similarity > 0.85."""
    neighbors = await find_duplicate_vectors(session, new_vector)
    return is_duplicate(new_vector, neighbors)