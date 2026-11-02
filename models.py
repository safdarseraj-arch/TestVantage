"""SQLAlchemy models and ID helpers for the master question bank (unified pool)."""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from datetime import date, datetime
from enum import Enum
from typing import Literal, Sequence

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    case,
    false,
    func,
    select,
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.sql.selectable import Select

EMBEDDING_DIM = 768

# Sub-bank discriminator for the unified master pool (single table).
SUB_BANK_TYPE_NORMAL = "normal"
SUB_BANK_TYPE_PYQ = "pyq"
SUB_BANK_TYPE_AI = "ai"
SUB_BANK_TYPE_SIMILAR_PYQ = "similar_pyq"

SubBankType = Literal["normal", "pyq", "ai", "similar_pyq"]

SUB_BANK_TYPES: tuple[SubBankType, ...] = (
    SUB_BANK_TYPE_NORMAL,
    SUB_BANK_TYPE_PYQ,
    SUB_BANK_TYPE_AI,
    SUB_BANK_TYPE_SIMILAR_PYQ,
)

APPROVAL_STATUS_PENDING_REVIEW = "PENDING_REVIEW"
APPROVAL_STATUS_APPROVED = "APPROVED"
# Incomplete Hybrid AI stems stay in the pool but must not be treated as approved.
APPROVAL_STATUS_NEEDS_FIX = "NEEDS_FIX"
# Failed completeness check: draft tray "Needs action", not a ready Hybrid AI card.
APPROVAL_STATUS_NEEDS_ACTION = "NEEDS_ACTION"

_SUB_BANK_TYPE_CHECK = (
    "sub_bank_type IN ('normal', 'pyq', 'ai', 'similar_pyq')"
)


class BloomLevel(str, Enum):
    """Bloom's Taxonomy cognitive levels (stored verbatim in the database)."""

    KNOWLEDGE = "Knowledge"
    UNDERSTANDING = "Understanding"
    APPLICATION = "Application"
    ANALYSIS = "Analysis"
    EVALUATION = "Evaluation"
    CREATION = "Creation"


BLOOM_LEVEL_VALUES: tuple[str, ...] = tuple(level.value for level in BloomLevel)

_BLOOM_LEVEL_CHECK = (
    "bloom_level IS NULL OR bloom_level IN ("
    "'Knowledge', 'Understanding', 'Application', "
    "'Analysis', 'Evaluation', 'Creation'"
    ")"
)


def normalize_bloom_level(value: str | BloomLevel | None) -> str | None:
    """Return a canonical Bloom label or None when empty / unknown."""
    if value is None:
        return None
    if isinstance(value, BloomLevel):
        return value.value
    raw = str(value).strip()
    if not raw:
        return None
    for allowed in BLOOM_LEVEL_VALUES:
        if raw.casefold() == allowed.casefold():
            return allowed
    raise ValueError(
        f"bloom_level must be one of {', '.join(BLOOM_LEVEL_VALUES)}; got {raw!r}"
    )


class Base(DeclarativeBase):
    pass


def master_question_pool_select() -> Select[tuple["AIQuestionBank"]]:
    """SELECT for the full master pool (normal, pyq, ai, similar_pyq).

    Do not filter on ``sub_bank_type`` unless you intentionally want a sub-bank slice.
    """
    return select(AIQuestionBank)


def generate_ai_question_id(subject: str) -> str:
    """Return ``TV-AI-{SUBJECT}-{HEX}`` with an uppercase subject slug and uuid hex chunk."""
    raw = (subject or "GEN").strip().upper()
    slug = re.sub(r"[^A-Z0-9]", "", raw) or "GEN"
    return f"TV-AI-{slug}-{uuid.uuid4().hex[:12]}"


def generate_clone_batch_id() -> str:
    """Return a unique 32-character lowercase hex string for clone batch primary keys."""
    return uuid.uuid4().hex


def generate_child_question_id(parent_id: str, index: int) -> str:
    """Return ``{parent_id}C{index}`` (index is 1-based, e.g. MAM00001I + 1 -> MAM00001IC1)."""
    if not (parent_id or "").strip():
        raise ValueError("parent_id must be non-empty")
    if index < 1:
        raise ValueError("index must be >= 1")
    return f"{parent_id.strip()}C{index}"


def next_child_question_index(parent_id: str, existing_ids: Sequence[str]) -> int:
    """Smallest C number not already used on this parent (C1, C2, … are never reused)."""
    parent = (parent_id or "").strip()
    if not parent:
        raise ValueError("parent_id must be non-empty")
    pattern = re.compile(rf"^{re.escape(parent)}C(\d+)$")
    used: set[int] = set()
    for raw in existing_ids:
        match = pattern.match(str(raw or "").strip())
        if match:
            used.add(int(match.group(1)))
    index = 1
    while index in used:
        index += 1
    return index


def generate_test_result_row_id() -> str:
    """Primary key for a single question row inside a test attempt."""
    return uuid.uuid4().hex


class AIQuestionBank(Base):
    """Master question bank: manual, PYQ, AI-generated, and similar-PYQ clones in one table."""

    __tablename__ = "question_bank"
    __table_args__ = (
        CheckConstraint(_SUB_BANK_TYPE_CHECK, name="ck_question_bank_sub_bank_type"),
        CheckConstraint(_BLOOM_LEVEL_CHECK, name="ck_question_bank_bloom_level"),
        Index(
            "ix_question_bank_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
        Index(
            "ix_question_bank_meta_filter",
            "chapter",
            "topic",
            "difficulty",
            "bloom_level",
        ),
    )

    question_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    exam: Mapped[str] = mapped_column(String(64), nullable=False)
    subject: Mapped[str] = mapped_column(String(64), nullable=False)
    chapter: Mapped[str] = mapped_column(String(256), nullable=False)
    # Curriculum unit (Algebra, Calculus, …). Chapter stays the nested chapter name.
    unit: Mapped[str | None] = mapped_column(String(256), nullable=True)
    topic: Mapped[str | None] = mapped_column(String(256), nullable=True)
    question_type: Mapped[str] = mapped_column(String(64), nullable=False)
    difficulty: Mapped[str] = mapped_column(String(32), nullable=False)
    bloom_level: Mapped[str | None] = mapped_column(String(32), nullable=True)
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    correct_answer: Mapped[str] = mapped_column(String(512), nullable=False)
    step_by_step_solution: Mapped[str] = mapped_column(Text, nullable=False)
    options: Mapped[list] = mapped_column(JSON, nullable=False)
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIM), nullable=False)
    approval_status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default=APPROVAL_STATUS_PENDING_REVIEW,
        server_default=APPROVAL_STATUS_PENDING_REVIEW,
    )
    sub_bank_type: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default=SUB_BANK_TYPE_AI,
        server_default=SUB_BANK_TYPE_AI,
    )
    parent_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    is_child: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=false(),
    )
    # Failed Hybrid check. Ready drafts stay False and keep curriculum tags.
    needs_action: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=false(),
    )
    # Marked so a similar / replica batch can be requested later.
    is_pattern: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=false(),
    )
    # T1–T10. Selects Flash vs Pro at generation time.
    toughness_level: Mapped[int | None] = mapped_column(Integer, nullable=True)


class AIQuestionCloneBatch(Base):
    __tablename__ = "ai_question_clone_batches"
    __table_args__ = (
        CheckConstraint(
            "difficulty_offset IN (-1, 0, 1, 2)",
            name="ck_ai_question_clone_batches_difficulty_offset",
        ),
    )

    batch_id: Mapped[str] = mapped_column(String(32), primary_key=True, default=generate_clone_batch_id)
    parent_question_id: Mapped[str] = mapped_column(String(128), nullable=False)
    requested_count: Mapped[int] = mapped_column(Integer, nullable=False)
    # Allowed difficulty_offset values: -1 (easier), 0 (same), 1, 2 (harder steps).
    difficulty_offset: Mapped[int] = mapped_column(Integer, nullable=False)
    # Each clone entry may include optional ``bloom_level`` (inherits from parent at save time).
    clones_json: Mapped[list] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class TestResult(Base):
    """One row per question within a submitted test attempt (Bloom denormalized at save time)."""

    __tablename__ = "test_results"
    __table_args__ = (
        CheckConstraint(_BLOOM_LEVEL_CHECK, name="ck_test_results_bloom_level"),
        UniqueConstraint("attempt_id", "question_id", name="uq_test_results_attempt_question"),
        Index("ix_test_results_student_bloom", "student_id", "bloom_level"),
        Index("ix_test_results_test_student", "test_id", "student_id"),
        Index("ix_test_results_attempt", "attempt_id"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=generate_test_result_row_id)
    attempt_id: Mapped[str] = mapped_column(String(128), nullable=False)
    test_id: Mapped[str] = mapped_column(String(128), nullable=False)
    student_id: Mapped[str] = mapped_column(String(128), nullable=False)
    question_id: Mapped[str] = mapped_column(String(128), nullable=False)
    is_correct: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())
    score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0, server_default="0")
    max_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0, server_default="0")
    bloom_level: Mapped[str | None] = mapped_column(String(32), nullable=True)
    time_spent_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    subject: Mapped[str | None] = mapped_column(String(64), nullable=True)
    chapter: Mapped[str | None] = mapped_column(String(256), nullable=True)
    topic: Mapped[str | None] = mapped_column(String(256), nullable=True)
    answered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


class StudentPerformance(Base):
    """Optional materialized Bloom rollup per student (refresh via ``refresh_student_performance``)."""

    __tablename__ = "student_performance"
    __table_args__ = (
        CheckConstraint(_BLOOM_LEVEL_CHECK, name="ck_student_performance_bloom_level"),
        UniqueConstraint("student_id", "bloom_level", name="uq_student_performance_student_bloom"),
        Index("ix_student_performance_student", "student_id"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: uuid.uuid4().hex)
    student_id: Mapped[str] = mapped_column(String(128), nullable=False)
    bloom_level: Mapped[str | None] = mapped_column(String(32), nullable=True)
    questions_attempted: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    questions_correct: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    score_total: Mapped[float] = mapped_column(Float, nullable=False, default=0.0, server_default="0")
    max_score_total: Mapped[float] = mapped_column(Float, nullable=False, default=0.0, server_default="0")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


@dataclass(frozen=True)
class StudentBloomPerformanceRow:
    bloom_level: str
    accuracy_pct: float | None
    avg_time_seconds: float | None
    attempts: int


async def fetch_student_performance_by_bloom(
    session: AsyncSession,
    student_id: str,
    *,
    date_from: date | datetime | None = None,
    date_to: date | datetime | None = None,
) -> list[StudentBloomPerformanceRow]:
    """Bloom analytics for one student (bank join fills missing denormalized Bloom)."""
    sid = (student_id or "").strip()
    if not sid:
        return [
            StudentBloomPerformanceRow(level, None, None, 0) for level in BLOOM_LEVEL_VALUES
        ]

    effective_bloom = func.coalesce(TestResult.bloom_level, AIQuestionBank.bloom_level)
    correct_case = case((TestResult.is_correct.is_(True), 1), else_=0)
    stmt = (
        select(
            effective_bloom.label("bloom_level"),
            func.count(TestResult.id),
            func.sum(correct_case),
            func.avg(TestResult.time_spent_ms),
        )
        .select_from(TestResult)
        .outerjoin(AIQuestionBank, TestResult.question_id == AIQuestionBank.question_id)
        .where(TestResult.student_id == sid)
        .group_by(effective_bloom)
    )
    if date_from is not None:
        stmt = stmt.where(TestResult.answered_at >= date_from)
    if date_to is not None:
        stmt = stmt.where(TestResult.answered_at <= date_to)

    raw_rows = (await session.execute(stmt)).all()
    by_level: dict[str, tuple[int, int, float | None]] = {}
    for bloom_key, attempts, correct_sum, avg_ms in raw_rows:
        label = normalize_bloom_level(bloom_key) if bloom_key else None
        if not label:
            continue
        attempts_i = int(attempts or 0)
        correct_i = int(correct_sum or 0)
        avg_seconds = float(avg_ms) / 1000.0 if avg_ms is not None else None
        by_level[label] = (attempts_i, correct_i, avg_seconds)

    out: list[StudentBloomPerformanceRow] = []
    for level in BLOOM_LEVEL_VALUES:
        attempts_i, correct_i, avg_seconds = by_level.get(level, (0, 0, None))
        accuracy = (correct_i / attempts_i * 100.0) if attempts_i else None
        out.append(
            StudentBloomPerformanceRow(
                bloom_level=level,
                accuracy_pct=round(accuracy, 2) if accuracy is not None else None,
                avg_time_seconds=round(avg_seconds, 2) if avg_seconds is not None else None,
                attempts=attempts_i,
            )
        )
    return out


@dataclass(frozen=True)
class BloomAggregate:
    bloom_level: str | None
    questions_attempted: int
    questions_correct: int
    score_total: float
    max_score_total: float


async def aggregate_by_bloom(session: AsyncSession, student_id: str) -> list[BloomAggregate]:
    """Live Bloom breakdown for a student from ``test_results`` rows."""
    sid = (student_id or "").strip()
    if not sid:
        return []

    correct_case = case((TestResult.is_correct.is_(True), 1), else_=0)
    stmt = (
        select(
            TestResult.bloom_level,
            func.count(TestResult.id),
            func.sum(correct_case),
            func.coalesce(func.sum(TestResult.score), 0.0),
            func.coalesce(func.sum(TestResult.max_score), 0.0),
        )
        .where(TestResult.student_id == sid)
        .group_by(TestResult.bloom_level)
        .order_by(TestResult.bloom_level.nulls_last())
    )
    rows = (await session.execute(stmt)).all()
    return [
        BloomAggregate(
            bloom_level=row[0],
            questions_attempted=int(row[1] or 0),
            questions_correct=int(row[2] or 0),
            score_total=float(row[3] or 0.0),
            max_score_total=float(row[4] or 0.0),
        )
        for row in rows
    ]


async def bloom_level_for_question(session: AsyncSession, question_id: str) -> str | None:
    """Read Bloom label from the master bank row (None when missing or unknown id)."""
    qid = (question_id or "").strip()
    if not qid:
        return None
    row = await session.get(AIQuestionBank, qid)
    return row.bloom_level if row else None


@dataclass(frozen=True)
class PerQuestionAttemptInput:
    question_id: str
    is_correct: bool
    score: float
    max_score: float
    subject: str | None = None
    chapter: str | None = None
    topic: str | None = None
    bloom_level: str | None = None
    time_spent_ms: int | None = None


async def save_test_results_for_attempt(
    session: AsyncSession,
    *,
    attempt_id: str,
    test_id: str,
    student_id: str,
    rows: Sequence[PerQuestionAttemptInput],
) -> list[TestResult]:
    """Persist per-question scores; copy ``bloom_level`` from the bank when not supplied."""
    saved: list[TestResult] = []
    for item in rows:
        bloom = item.bloom_level
        if bloom is None:
            bloom = await bloom_level_for_question(session, item.question_id)
        else:
            bloom = normalize_bloom_level(bloom)

        bank_row = await session.get(AIQuestionBank, item.question_id.strip())
        subject = item.subject or (bank_row.subject if bank_row else None)
        chapter = item.chapter or (bank_row.chapter if bank_row else None)
        topic = item.topic or (bank_row.topic if bank_row else None)

        row = TestResult(
            attempt_id=attempt_id.strip(),
            test_id=test_id.strip(),
            student_id=student_id.strip(),
            question_id=item.question_id.strip(),
            is_correct=bool(item.is_correct),
            score=float(item.score),
            max_score=float(item.max_score),
            bloom_level=bloom,
            time_spent_ms=int(item.time_spent_ms) if item.time_spent_ms is not None else None,
            subject=subject,
            chapter=chapter,
            topic=topic,
        )
        session.add(row)
        saved.append(row)
    return saved


async def refresh_student_performance(session: AsyncSession, student_id: str) -> list[StudentPerformance]:
    """Rebuild optional ``student_performance`` cache from ``test_results`` for one student."""
    aggregates = await aggregate_by_bloom(session, student_id)
    sid = student_id.strip()

    existing = (
        await session.scalars(select(StudentPerformance).where(StudentPerformance.student_id == sid))
    ).all()
    by_bloom = {row.bloom_level: row for row in existing}

    updated: list[StudentPerformance] = []
    seen: set[str | None] = set()
    for agg in aggregates:
        seen.add(agg.bloom_level)
        perf = by_bloom.get(agg.bloom_level)
        if perf is None:
            perf = StudentPerformance(student_id=sid, bloom_level=agg.bloom_level)
            session.add(perf)
        perf.questions_attempted = agg.questions_attempted
        perf.questions_correct = agg.questions_correct
        perf.score_total = agg.score_total
        perf.max_score_total = agg.max_score_total
        updated.append(perf)

    for bloom_key, perf in by_bloom.items():
        if bloom_key not in seen:
            await session.delete(perf)

    return updated
