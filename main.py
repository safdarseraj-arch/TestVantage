"""TestVantage API — FastAPI services for the onlinetest stack (Hybrid AI, pools, analytics)."""

from __future__ import annotations

import env_loader  # noqa: F401 - loads .env before local imports

import logging
from datetime import date, datetime, time, timezone
from typing import Any

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, model_validator

import ai_generator
import deduplicator
from database import AsyncSessionLocal, bank_has_duplicate, init_db
from models import (
    AIQuestionBank,
    AIQuestionCloneBatch,
    APPROVAL_STATUS_APPROVED,
    SUB_BANK_TYPE_AI,
    SUB_BANK_TYPE_PYQ,
    SUB_BANK_TYPE_SIMILAR_PYQ,
    SUB_BANK_TYPES,
    PerQuestionAttemptInput,
    fetch_student_performance_by_bloom,
    generate_ai_question_id,
    generate_child_question_id,
    generate_clone_batch_id,
    normalize_bloom_level,
    refresh_student_performance,
    save_test_results_for_attempt,
)
from question_pool import fetch_master_pool_rows, parse_bloom_levels_param

logger = logging.getLogger(__name__)

app = FastAPI(
    title="TestVantage API",
    description=(
        "Backend for TestVantage (question bank workflows, practice pools, student analytics, "
        "and Hybrid AI question generation). Same process as the Node app; AI routes under /api/generate."
    ),
    openapi_tags=[
        {
            "name": "AI generation",
            "description": "Hybrid AI batch drafts and scaled clone jobs for the question bank.",
        },
    ],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class BatchGenerateRequest(BaseModel):
    """Batch generator form fields from the React dashboard."""

    subject: str = Field(..., min_length=1)
    exam: str = Field(..., min_length=1)
    difficulty: str = Field(..., min_length=1)
    topic: str | None = Field(default=None, min_length=1)
    chapter: str | None = Field(default=None, min_length=1)
    count: int = Field(default=1, ge=1, le=100)
    question_type: str | None = Field(default=None, min_length=1)

    @model_validator(mode="after")
    def _chapter_or_topic(self) -> BatchGenerateRequest:
        chapter = (self.chapter or "").strip()
        topic = (self.topic or "").strip()
        resolved = chapter or topic
        if not resolved:
            raise ValueError("chapter or topic is required")
        self.chapter = resolved
        self.topic = resolved
        return self


class CloneScaledRequest(BaseModel):
    """Scaled clone job: parent stem, count, and relative difficulty offset."""

    parent_question_id: str = Field(..., min_length=1)
    source_question_text: str = Field(..., min_length=1)
    count: int = Field(..., ge=1)
    difficulty_offset: int = Field(..., ge=-1, le=2)
    parent_is_pyq: bool = Field(
        default=False,
        description="True when parent is a PYQ not yet in question_bank (e.g. client-only stem).",
    )


@app.on_event("startup")
async def on_startup() -> None:
    try:
        await init_db()
    except Exception:
        logger.exception(
            "Database init failed — batch jobs can be queued but will not persist until Postgres is up "
            "(CREATE EXTENSION vector; DATABASE_URL in .env)."
        )


def _resolve_clone_model(difficulty_offset: int) -> str:
    if difficulty_offset >= 1:
        return "gemini-1.5-pro"
    return "gemini-2.5-flash"


_CLONE_CHUNK_SIZE = 5


def _resolve_question_type(params: dict[str, Any], draft: ai_generator.QuestionOutput) -> str:
    explicit = str(params.get("question_type") or "").strip()
    if explicit:
        return explicit
    if draft.options:
        return "MCQ"
    return "NVQ"


async def _insert_question(
    params: dict[str, Any],
    draft: ai_generator.QuestionOutput,
    embedding: list[float],
) -> None:
    async with AsyncSessionLocal() as session:
        if await bank_has_duplicate(session, embedding):
            logger.info(
                "Skipping duplicate question for subject=%s chapter=%s",
                params.get("subject"),
                params.get("topic"),
            )
            return

        bloom_level = normalize_bloom_level(draft.bloom_level)
        chapter = str(params.get("chapter") or params["topic"])
        topic = str(params.get("topic") or "").strip() or None

        row = AIQuestionBank(
            question_id=generate_ai_question_id(params["subject"]),
            subject=str(params["subject"]),
            exam=str(params["exam"]),
            difficulty=str(params["difficulty"]),
            chapter=chapter,
            topic=topic if topic and topic != chapter else None,
            bloom_level=bloom_level,
            question_type=_resolve_question_type(params, draft),
            question_text=draft.question_text,
            options=draft.options,
            correct_answer=draft.correct_answer,
            step_by_step_solution=draft.step_by_step_solution,
            embedding=embedding,
            sub_bank_type=SUB_BANK_TYPE_AI,
            is_child=False,
            parent_id=None,
            approval_status=APPROVAL_STATUS_APPROVED,
        )
        session.add(row)
        await session.commit()
        logger.info("Inserted AI question %s", row.question_id)


async def process_generation_job(params: dict) -> None:
    job = dict(params)
    count = int(job.pop("count", 1))
    for _ in range(count):
        target_model = ai_generator.resolve_target_model(job)
        draft = await ai_generator.draft_question(job, target_model)
        embedding = await deduplicator.get_embedding(draft.question_text)
        await _insert_question(job, draft, embedding)


def _clone_to_json_entry(
    child_id: str,
    parent_question_id: str,
    clone: ai_generator.SingleCloneItem,
    *,
    bloom_level: str | None = None,
) -> dict[str, Any]:
    entry: dict[str, Any] = {
        "child_id": child_id,
        "parent_id": parent_question_id,
        "is_child": True,
        "text": clone.question_text,
        "options": clone.options,
        "answer": clone.correct_answer,
        "solution": clone.step_by_step_solution,
    }
    if bloom_level:
        entry["bloom_level"] = bloom_level
    return entry


def _clone_difficulty_label(parent: AIQuestionBank | None, difficulty_offset: int) -> str:
    if parent is not None:
        return parent.difficulty
    if difficulty_offset >= 1:
        return "Hard"
    if difficulty_offset <= -1:
        return "Easy"
    return "Medium"


def _clone_question_type(parent: AIQuestionBank | None, clone: ai_generator.SingleCloneItem) -> str:
    if parent is not None:
        return parent.question_type
    return "MCQ" if clone.options else "NVQ"


def _clone_sub_bank_type(parent: AIQuestionBank | None, params: dict[str, Any]) -> str:
    """similar_pyq for PYQ parents; otherwise ai child clones."""
    if bool(params.get("parent_is_pyq")):
        return SUB_BANK_TYPE_SIMILAR_PYQ
    if parent is not None and parent.sub_bank_type == SUB_BANK_TYPE_PYQ:
        return SUB_BANK_TYPE_SIMILAR_PYQ
    return SUB_BANK_TYPE_AI


async def _generate_clones_up_to_count(
    source_text: str,
    count: int,
    difficulty_offset: int,
    target_model: str,
) -> list[ai_generator.SingleCloneItem]:
    clones: list[ai_generator.SingleCloneItem] = []
    while len(clones) < count:
        chunk = min(_CLONE_CHUNK_SIZE, count - len(clones))
        batch = await ai_generator.generate_clones_batch(
            source_text,
            chunk,
            difficulty_offset,
            target_model,
        )
        clones.extend(batch)
    return clones[:count]


async def process_clone_scaled_job(batch_id: str, params: dict[str, Any]) -> None:
    parent_question_id = str(params["parent_question_id"]).strip()
    source_question_text = str(params["source_question_text"])
    requested_count = int(params["count"])
    difficulty_offset = int(params["difficulty_offset"])
    target_model = _resolve_clone_model(difficulty_offset)

    try:
        raw_clones = await _generate_clones_up_to_count(
            source_question_text,
            requested_count,
            difficulty_offset,
            target_model,
        )
    except Exception:
        logger.exception("Clone generation failed for batch_id=%s", batch_id)
        raise

    verified: list[dict[str, Any]] = []
    batch_embeddings: list[list[float]] = []

    async with AsyncSessionLocal() as session:
        parent_row = await session.get(AIQuestionBank, parent_question_id)
        for index, clone in enumerate(raw_clones, start=1):
            child_id = generate_child_question_id(parent_question_id, index)
            try:
                embedding = await deduplicator.get_embedding(clone.question_text)
            except Exception:
                logger.exception(
                    "Embedding failed for batch_id=%s child_id=%s; skipping",
                    batch_id,
                    child_id,
                )
                continue

            if await bank_has_duplicate(session, embedding):
                logger.info(
                    "Skipping duplicate clone (bank) batch_id=%s child_id=%s",
                    batch_id,
                    child_id,
                )
                continue

            if deduplicator.is_duplicate(embedding, batch_embeddings):
                logger.info(
                    "Skipping duplicate clone (batch) batch_id=%s child_id=%s",
                    batch_id,
                    child_id,
                )
                continue

            batch_embeddings.append(embedding)
            clone_sub_bank = _clone_sub_bank_type(parent_row, params)
            clone_bloom = normalize_bloom_level(clone.bloom_level)
            verified.append(
                _clone_to_json_entry(
                    child_id,
                    parent_question_id,
                    clone,
                    bloom_level=clone_bloom,
                )
            )
            session.add(
                AIQuestionBank(
                    question_id=child_id,
                    exam=parent_row.exam if parent_row else "UNKNOWN",
                    subject=parent_row.subject if parent_row else "GEN",
                    chapter=parent_row.chapter if parent_row else "",
                    topic=parent_row.topic if parent_row else None,
                    bloom_level=clone_bloom,
                    question_type=_clone_question_type(parent_row, clone),
                    difficulty=_clone_difficulty_label(parent_row, difficulty_offset),
                    question_text=clone.question_text,
                    correct_answer=clone.correct_answer,
                    step_by_step_solution=clone.step_by_step_solution,
                    options=clone.options,
                    embedding=embedding,
                    sub_bank_type=clone_sub_bank,
                    parent_id=parent_question_id,
                    is_child=True,
                    approval_status=APPROVAL_STATUS_APPROVED,
                )
            )

        row = AIQuestionCloneBatch(
            batch_id=batch_id,
            parent_question_id=parent_question_id,
            requested_count=requested_count,
            difficulty_offset=difficulty_offset,
            clones_json=verified,
        )
        session.add(row)
        await session.commit()
        logger.info(
            "Saved clone batch %s: %s/%s clones after dedup",
            batch_id,
            len(verified),
            requested_count,
        )


@app.post("/api/generate/batch", tags=["AI generation"])
async def generate_batch(body: BatchGenerateRequest, background_tasks: BackgroundTasks) -> dict[str, str]:
    background_tasks.add_task(process_generation_job, body.model_dump())
    return {"status": "Job Queued"}


@app.post("/api/questions/clone-scaled", tags=["AI generation"])
async def clone_scaled(body: CloneScaledRequest, background_tasks: BackgroundTasks) -> dict[str, str]:
    batch_id = generate_clone_batch_id()
    job = {**body.model_dump(), "batch_id": batch_id}
    background_tasks.add_task(process_clone_scaled_job, batch_id, job)
    return {"status": "Cloning Batch Queued", "batch_id": batch_id}


def _resolve_student_id(
    student_id: str | None,
    x_student_id: str | None = Header(default=None, alias="X-Student-Id"),
) -> str:
    sid = (student_id or x_student_id or "").strip()
    if not sid:
        raise HTTPException(status_code=400, detail="student_id is required (query or X-Student-Id header)")
    return sid


def _parse_optional_date(raw: str | None, *, end_of_day: bool = False) -> datetime | None:
    text = (raw or "").strip()
    if not text:
        return None
    try:
        if len(text) <= 10:
            parsed = date.fromisoformat(text[:10])
            if end_of_day:
                return datetime.combine(parsed, time(23, 59, 59, 999999), tzinfo=timezone.utc)
            return datetime.combine(parsed, time.min, tzinfo=timezone.utc)
        normalized = text.replace("Z", "+00:00")
        dt = datetime.fromisoformat(normalized)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid date: {raw!r}") from exc


class TestResultRowIn(BaseModel):
    question_id: str = Field(..., min_length=1)
    is_correct: bool
    score: float = 0.0
    max_score: float = 0.0
    bloom_level: str | None = None
    time_spent_ms: int | None = Field(default=None, ge=0)
    subject: str | None = None
    chapter: str | None = None
    topic: str | None = None


class SaveTestResultsRequest(BaseModel):
    attempt_id: str = Field(..., min_length=1)
    test_id: str = Field(..., min_length=1)
    student_id: str = Field(..., min_length=1)
    rows: list[TestResultRowIn] = Field(default_factory=list, min_length=1)
    refresh_performance_cache: bool = True


class PracticePickRequest(BaseModel):
    exam: str | None = None
    subject: str | None = None
    chapter: str | None = None
    topic: str | None = None
    difficulty: str | None = None
    sub_bank_type: str | None = Field(
        default=None,
        description="One of normal, pyq, ai, similar_pyq; omit for full master pool.",
    )
    bloom_levels: list[str] | None = None
    limit: int = Field(default=500, ge=1, le=5000)


@app.get("/api/questions/pool")
async def get_question_pool(
    exam: str | None = None,
    subject: str | None = None,
    chapter: str | None = None,
    topic: str | None = None,
    difficulty: str | None = None,
    sub_bank_type: str | None = Query(default=None),
    bloom_levels: list[str] | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=5000),
) -> dict[str, Any]:
    sub_types = [sub_bank_type] if (sub_bank_type or "").strip() in SUB_BANK_TYPES else None
    blooms = parse_bloom_levels_param(bloom_levels)
    async with AsyncSessionLocal() as session:
        rows = await fetch_master_pool_rows(
            session,
            sub_bank_types=sub_types,
            exam=exam,
            subject=subject,
            chapter=chapter,
            topic=topic,
            difficulty=difficulty,
            bloom_levels=blooms,
            limit=limit,
        )
    return {"count": len(rows), "questions": rows, "bloom_levels": blooms}


@app.post("/api/practice/pick-pool")
async def post_practice_pick_pool(body: PracticePickRequest) -> dict[str, Any]:
    sub_types = [body.sub_bank_type] if (body.sub_bank_type or "").strip() in SUB_BANK_TYPES else None
    blooms = parse_bloom_levels_param(body.bloom_levels)
    async with AsyncSessionLocal() as session:
        rows = await fetch_master_pool_rows(
            session,
            sub_bank_types=sub_types,
            exam=body.exam,
            subject=body.subject,
            chapter=body.chapter,
            topic=body.topic,
            difficulty=body.difficulty,
            bloom_levels=blooms,
            limit=body.limit,
        )
    return {"count": len(rows), "questions": rows, "bloom_levels": blooms}


@app.post("/api/test/pick-pool")
async def post_test_pick_pool(body: PracticePickRequest) -> dict[str, Any]:
    return await post_practice_pick_pool(body)


@app.get("/api/analytics/student-performance")
async def get_student_performance_analytics(
    student_id: str | None = Query(default=None),
    date_from: str | None = Query(default=None, alias="from"),
    date_to: str | None = Query(default=None, alias="to"),
    x_student_id: str | None = Header(default=None, alias="X-Student-Id"),
) -> dict[str, Any]:
    sid = _resolve_student_id(student_id, x_student_id)
    start = _parse_optional_date(date_from, end_of_day=False)
    end = _parse_optional_date(date_to, end_of_day=True)
    async with AsyncSessionLocal() as session:
        rows = await fetch_student_performance_by_bloom(
            session,
            sid,
            date_from=start,
            date_to=end,
        )
    return {
        "student_id": sid,
        "from": date_from,
        "to": date_to,
        "by_bloom": [
            {
                "bloom_level": row.bloom_level,
                "accuracy_pct": row.accuracy_pct,
                "avg_time_seconds": row.avg_time_seconds,
                "attempts": row.attempts,
            }
            for row in rows
        ],
    }


@app.post("/api/test-results/attempt")
async def post_test_results_attempt(body: SaveTestResultsRequest) -> dict[str, Any]:
    inputs = [
        PerQuestionAttemptInput(
            question_id=row.question_id,
            is_correct=row.is_correct,
            score=row.score,
            max_score=row.max_score,
            bloom_level=row.bloom_level,
            time_spent_ms=row.time_spent_ms,
            subject=row.subject,
            chapter=row.chapter,
            topic=row.topic,
        )
        for row in body.rows
    ]
    async with AsyncSessionLocal() as session:
        saved = await save_test_results_for_attempt(
            session,
            attempt_id=body.attempt_id,
            test_id=body.test_id,
            student_id=body.student_id,
            rows=inputs,
        )
        if body.refresh_performance_cache:
            await refresh_student_performance(session, body.student_id)
        await session.commit()
    return {
        "ok": True,
        "saved_count": len(saved),
        "attempt_id": body.attempt_id,
        "student_id": body.student_id.strip(),
    }
