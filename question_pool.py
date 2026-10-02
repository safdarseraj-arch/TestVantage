"""Master pool query helpers - Bloom filter and parent/child exclusion."""

from __future__ import annotations

from typing import Any, Sequence

from sqlalchemy import Select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from models import (
    AIQuestionBank,
    APPROVAL_STATUS_APPROVED,
    BLOOM_LEVEL_VALUES,
    SUB_BANK_TYPES,
    master_question_pool_select,
    normalize_bloom_level,
)
from parent_child_exclusion import enforce_parent_child_exclusion


def parse_bloom_levels_param(values: Sequence[str] | None) -> list[str] | None:
    """Normalize repeated query params; empty / omitted => no Bloom filter."""
    if not values:
        return None
    seen: list[str] = []
    for raw in values:
        normalized = normalize_bloom_level(raw)
        if normalized and normalized not in seen:
            seen.append(normalized)
    return seen or None


def apply_master_pool_filters(
    stmt: Select[tuple[AIQuestionBank]],
    *,
    sub_bank_types: Sequence[str] | None = None,
    exam: str | None = None,
    subject: str | None = None,
    chapter: str | None = None,
    topic: str | None = None,
    difficulty: str | None = None,
    bloom_levels: Sequence[str] | None = None,
    approved_only: bool = True,
) -> Select[tuple[AIQuestionBank]]:
    if approved_only:
        stmt = stmt.where(AIQuestionBank.approval_status == APPROVAL_STATUS_APPROVED)
    if sub_bank_types:
        allowed = [t for t in sub_bank_types if t in SUB_BANK_TYPES]
        if allowed:
            stmt = stmt.where(AIQuestionBank.sub_bank_type.in_(allowed))
    exam_val = (exam or "").strip()
    if exam_val:
        stmt = stmt.where(AIQuestionBank.exam == exam_val)
    subject_val = (subject or "").strip()
    if subject_val:
        stmt = stmt.where(AIQuestionBank.subject == subject_val)
    chapter_val = (chapter or "").strip()
    if chapter_val:
        stmt = stmt.where(AIQuestionBank.chapter == chapter_val)
    topic_val = (topic or "").strip()
    if topic_val:
        stmt = stmt.where(or_(AIQuestionBank.topic == topic_val, AIQuestionBank.chapter == topic_val))
    difficulty_val = (difficulty or "").strip()
    if difficulty_val:
        stmt = stmt.where(AIQuestionBank.difficulty == difficulty_val)
    blooms = parse_bloom_levels_param(list(bloom_levels) if bloom_levels else None)
    if blooms:
        stmt = stmt.where(AIQuestionBank.bloom_level.in_(blooms))
    return stmt


def bank_row_to_pick_dict(row: AIQuestionBank) -> dict[str, Any]:
    return {
        "id": row.question_id,
        "question_id": row.question_id,
        "exam": row.exam,
        "subject": row.subject,
        "chapter": row.chapter,
        "topic": row.topic,
        "difficulty": row.difficulty,
        "bloom_level": row.bloom_level,
        "question_type": row.question_type,
        "question_text": row.question_text,
        "text": row.question_text,
        "options": row.options,
        "correct_answer": row.correct_answer,
        "sub_bank_type": row.sub_bank_type,
        "parent_id": row.parent_id,
        "is_child": row.is_child,
    }


async def fetch_master_pool_rows(
    session: AsyncSession,
    *,
    sub_bank_types: Sequence[str] | None = None,
    exam: str | None = None,
    subject: str | None = None,
    chapter: str | None = None,
    topic: str | None = None,
    difficulty: str | None = None,
    bloom_levels: Sequence[str] | None = None,
    limit: int | None = None,
) -> list[dict[str, Any]]:
    stmt = apply_master_pool_filters(
        master_question_pool_select(),
        sub_bank_types=sub_bank_types,
        exam=exam,
        subject=subject,
        chapter=chapter,
        topic=topic,
        difficulty=difficulty,
        bloom_levels=bloom_levels,
    )
    if limit is not None and limit > 0:
        stmt = stmt.limit(limit)
    rows = (await session.scalars(stmt)).all()
    dicts = [bank_row_to_pick_dict(row) for row in rows]
    return enforce_parent_child_exclusion(dicts)


def all_bloom_level_labels() -> tuple[str, ...]:
    return BLOOM_LEVEL_VALUES