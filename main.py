"""TestVantages API — FastAPI services for the onlinetest stack (Hybrid AI, pools, analytics)."""

from __future__ import annotations

import env_loader  # noqa: F401 - loads .env before local imports
from pathlib import Path

import logging
import os
import uuid
from datetime import date, datetime, time, timezone
from typing import Any

from fastapi import BackgroundTasks, FastAPI, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, or_, select

import ai_generator
import deduplicator
from database import AsyncSessionLocal, bank_has_duplicate, init_db
from models import (
    AIQuestionBank,
    AIQuestionCloneBatch,
    APPROVAL_STATUS_APPROVED,
    APPROVAL_STATUS_NEEDS_ACTION,
    APPROVAL_STATUS_PENDING_REVIEW,
    SUB_BANK_TYPE_AI,
    SUB_BANK_TYPE_PYQ,
    SUB_BANK_TYPE_SIMILAR_PYQ,
    SUB_BANK_TYPES,
    PerQuestionAttemptInput,
    fetch_student_performance_by_bloom,
    generate_ai_question_id,
    generate_child_question_id,
    generate_clone_batch_id,
    next_child_question_index,
    normalize_bloom_level,
    refresh_student_performance,
    save_test_results_for_attempt,
)
from cache_manager import estimate_tokens
from pdf_ingestion import DIAGRAMS_DIR, process_cached_book, process_pdf
from question_pool import fetch_master_pool_rows, parse_bloom_levels_param
from hybrid_metadata import (
    batch_params_from_request,
    clone_parent_metadata,
    normalize_question_type_code,
    prepare_clone_for_insert,
    repair_hybrid_question,
    resolve_batch_question_type,
    resolve_hybrid_curriculum_tags,
    validate_hybrid_question,
)

logger = logging.getLogger(__name__)

_db_initialized = False

_GEMINI_KEY_MESSAGE = (
    "GEMINI_API_KEY is missing. Add it to onlinetest/.env, then press F5."
)
_POSTGRES_MESSAGE = (
    "Hybrid AI database is not ready (Postgres or pgvector). "
    "Start Postgres, then press F5. See POSTGRES-SETUP-SIMPLE.txt."
)
_hybrid_jobs: dict[str, dict[str, Any]] = {}


def _gemini_api_key() -> str:
    return (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip()


def _require_gemini_api_key() -> None:
    if not _gemini_api_key():
        raise HTTPException(status_code=503, detail=_GEMINI_KEY_MESSAGE)


def _public_generation_error(exc: BaseException) -> str:
    msg = str(exc).strip()
    low = msg.lower()
    if "gemini_api_key" in low or "api_key" in low or "api key" in low:
        return _GEMINI_KEY_MESSAGE
    if any(bit in low for bit in ("postgres", "asyncpg", "could not connect", "connection refused", "database")):
        return _POSTGRES_MESSAGE
    if "truncated" in low or "invalid or truncated json" in low or "unterminated string" in low:
        return (
            "Gemini returned a cut-off question, so nothing was saved. "
            "Press F5 and try Generate again."
        )
    if msg:
        return msg[:400]
    return "Hybrid AI did not save a question. Check the bottom terminal (.hybrid-api.log)."


def _remember_job(job_id: str, *, kind: str, requested: int) -> None:
    _hybrid_jobs[job_id] = {
        "job_id": job_id,
        "kind": kind,
        "status": "queued",
        "requested": int(requested),
        "inserted": 0,
        "error": None,
    }
    if len(_hybrid_jobs) > 80:
        finished = [key for key, row in _hybrid_jobs.items() if row.get("status") in ("done", "error")]
        for key in finished[:-40]:
            _hybrid_jobs.pop(key, None)


def _finish_job(job_id: str | None, *, inserted: int, errors: list[str]) -> None:
    if not job_id or job_id not in _hybrid_jobs:
        return
    job = _hybrid_jobs[job_id]
    job["inserted"] = inserted
    if inserted > 0:
        job["status"] = "done"
        job["error"] = None
    else:
        job["status"] = "error"
        job["error"] = errors[-1] if errors else "Hybrid AI did not save any questions."


async def ensure_hybrid_db_ready() -> bool:
    """Retry init_db when Postgres was down at uvicorn startup."""
    global _db_initialized
    if _db_initialized:
        return True
    try:
        await init_db()
        _db_initialized = True
        return True
    except Exception:
        logger.exception("Hybrid AI database is not ready (Postgres / vector extension)")
        return False

def _hybrid_cors_origins() -> list[str]:
    local = ("http://localhost:5173", "http://127.0.0.1:5173")
    prod = ("https://www.testvantages.com", "https://testvantages.com")
    extra = os.environ.get("TESTVANTAGE_CORS_ORIGINS", "").strip()
    if extra:
        merged = [*local, *(o.strip() for o in extra.split(",") if o.strip())]
    else:
        merged = [*local, *prod]
    return list(dict.fromkeys(merged))


app = FastAPI(
    title="TestVantages API",
    description=(
        "Backend for TestVantages (question bank workflows, practice pools, student analytics, "
        "and Hybrid AI question generation). Same process as the Node app; AI routes under /api/generate."
    ),
    openapi_tags=[
        {
            "name": "AI generation",
            "description": "Hybrid AI batch drafts and scaled clone jobs for the question bank.",
        },
    ],
)

_STATIC_ROOT = Path(__file__).resolve().parent / "static"
_STATIC_ROOT.mkdir(parents=True, exist_ok=True)
DIAGRAMS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(_STATIC_ROOT)), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_hybrid_cors_origins(),
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
    unit: str | None = Field(default=None, description="Curriculum unit. A chapter name here is replaced with its parent unit.")
    section: str | None = Field(default=None, description="Alias of unit from the question bank.")
    count: int = Field(default=1, ge=1, le=100)
    question_type: str | None = Field(default=None, min_length=1)
    toughness_level: int | None = Field(
        default=None,
        ge=1,
        le=10,
        description="T1–T10. Combined with exam, subject, and chapter to pick the Gemini model.",
    )

    @model_validator(mode="after")
    def _chapter_or_topic(self) -> BatchGenerateRequest:
        chapter = (self.chapter or "").strip()
        topic = (self.topic or "").strip()
        resolved = chapter or topic
        if not resolved:
            raise ValueError("chapter or topic is required")
        self.chapter = resolved
        self.topic = resolved
        try:
            canonical = batch_params_from_request(self.model_dump())
        except ValueError as exc:
            raise ValueError(str(exc)) from exc
        self.subject = canonical["subject"]
        self.exam = canonical["exam"]
        self.difficulty = canonical["difficulty"]
        self.unit = canonical.get("unit") or None
        self.section = canonical.get("unit") or None
        self.chapter = canonical["chapter"]
        self.topic = canonical["topic"]
        self.question_type = canonical["question_type"]
        level = canonical.get("toughness_level")
        self.toughness_level = int(level) if level is not None else None
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
    reference_material_path: str | None = Field(
        default=None,
        description="Optional syllabus/style reference file path for batch context caching.",
    )

    use_caching_optimizer: bool = Field(
        default=False,
        description="When true, use Gemini context caching for large reference material during cloning.",
    )

    subject: str | None = Field(
        default=None,
        description="Subject for Gemini tool routing; inferred from parent in bank when omitted.",
    )
    exam: str | None = Field(
        default=None,
        description="When parent is not in Postgres (client-only PYQ), store this exam on clones.",
    )
    chapter: str | None = Field(
        default=None,
        description="Chapter tag for client-only parents (defaults to General).",
    )
    topic: str | None = Field(default=None, description="Optional topic finer than chapter.")


class OfficialPyqFillRequest(BaseModel):
    """Ask Hybrid AI for bank metatags, answer, and solution. Stem is not rewritten."""

    question_text: str = Field(..., min_length=1)
    options: list[str] = Field(default_factory=list)
    subject: str | None = None
    unit: str | None = None
    section: str | None = None
    chapter: str | None = None
    topic: str | None = None
    question_type: str | None = None
    exam: str | None = None
    toughness_level: str | None = None
    source: str | None = None
    answer: str | None = None
    solution: str | None = None


class OfficialPyqReplicaQuestionRequest(BaseModel):
    """One similar question for a pending replica paper. Not published."""

    parent_question_id: str = Field(..., min_length=1)
    source_question_text: str = Field(..., min_length=1)
    difficulty_offset: int = Field(..., ge=-1, le=2)
    subject: str | None = None
    exam: str | None = None
    chapter: str | None = None
    topic: str | None = None
    unit: str | None = None
    avoid_texts: list[str] = Field(default_factory=list)


class CloneEstimateTokensRequest(BaseModel):
    """Estimate clone-batch token usage before queueing a scaled job."""

    source_question_text: str = Field(..., min_length=1)
    count: int = Field(..., ge=1)
    include_syllabus: bool = False


_CLONE_CACHE_TOKEN_MINIMUM = 32_768
_SYLLABUS_TOKEN_ESTIMATE_STUB = (
    "TestVantages syllabus and style reference stub used for clone-batch token estimates.\n"
    "Includes JEE/NEET taxonomy labels, MCQ formatting rules, and bloom-level guidance.\n"
)


def _build_clone_token_estimate_text(
    source_question_text: str,
    count: int,
    *,
    include_syllabus: bool,
) -> str:
    repeated = (source_question_text or "").strip() * max(1, int(count))
    if include_syllabus:
        return f"{repeated}\n\n{_SYLLABUS_TOKEN_ESTIMATE_STUB}"
    return repeated



@app.on_event("startup")
async def on_startup() -> None:
    await ensure_hybrid_db_ready()


@app.get("/health")
@app.get("/api/health")
async def hybrid_api_health() -> dict[str, Any]:
    """API + Postgres readiness. Direct: GET /health on port 8000. UI: /api/health via Vite."""
    db_ok = await ensure_hybrid_db_ready()
    pool_ai_count = 0
    if db_ok:
        try:
            async with AsyncSessionLocal() as session:
                pool_ai_count = int(
                    await session.scalar(
                        select(func.count())
                        .select_from(AIQuestionBank)
                        .where(AIQuestionBank.sub_bank_type == SUB_BANK_TYPE_AI)
                    )
                    or 0
                )
        except Exception:
            logger.exception("Hybrid health could not count AI rows")
            db_ok = False
    return {
        "ok": db_ok,
        "api": True,
        "database": "ready" if db_ok else "unavailable",
        "pool_ai_count": pool_ai_count,
    }


def _resolve_clone_model(difficulty_offset: int) -> str:
    if difficulty_offset >= 1:
        return "gemini-3-pro"
    return "gemini-3.7-flash"


_CLONE_CHUNK_SIZE = 5


def _clone_use_caching_optimizer(params: dict[str, Any]) -> bool:
    if bool(params.get("use_caching_optimizer")):
        return True
    ref = str(params.get("reference_material_path") or "").strip()
    env_on = (os.getenv("BATCH_OPTIMIZE") or "").strip().lower() in ("1", "true", "yes", "on")
    return env_on or bool(ref)



def _resolve_question_type(params: dict[str, Any], draft: ai_generator.QuestionOutput) -> str:
    explicit = params.get("question_type")
    if explicit:
        code = str(explicit).strip().upper()
        if code in ("SCQ", "MSQ", "NVQ"):
            return code
        return resolve_batch_question_type(str(explicit))
    return normalize_question_type_code(None, has_options=bool(draft.options))


async def _insert_question(
    params: dict[str, Any],
    result: ai_generator.DraftPipelineResult,
    embedding: list[float],
) -> bool:
    """Insert one AI draft. Needs action rows are stored without curriculum tags."""
    draft = result.draft
    qtype = _resolve_question_type(params, draft)
    repaired = repair_hybrid_question(draft, qtype)
    needs_action = result.tray == "needs_action"
    if not needs_action:
        errors = validate_hybrid_question(repaired, qtype)
        if errors:
            raise ValueError("Hybrid draft validation failed: " + "; ".join(errors))

    async with AsyncSessionLocal() as session:
        if await bank_has_duplicate(session, embedding):
            logger.info(
                "Skipping duplicate question for subject=%s chapter=%s",
                params.get("subject"),
                params.get("topic"),
            )
            return False

        bloom_level = normalize_bloom_level(repaired.bloom_level)
        tag_payload = result.tags if isinstance(getattr(result, "tags", None), dict) else {}
        if needs_action:
            # Editor tags stay blank. sub_bank_type stays ai so the row remains in the Hybrid tray.
            chapter = ""
            unit = None
            topic = None
            stored_subject = ""
            stored_exam = ""
            stored_difficulty = ""
            stored_qtype = ""
            stored_toughness = None
            approval = APPROVAL_STATUS_NEEDS_ACTION
        else:
            if not tag_payload.get("mapped"):
                tag_payload = resolve_hybrid_curriculum_tags(
                    params.get("subject"),
                    unit=result.unit or params.get("unit") or params.get("section"),
                    chapter=result.chapter or params.get("chapter"),
                    topic=result.topic or params.get("topic"),
                )
            if not tag_payload.get("mapped") and not tag_payload.get("chapter"):
                raise ValueError(
                    "chapter is not in the Main question bank curriculum; the row was not stored"
                )
            chapter = str(tag_payload.get("chapter") or "")
            unit = tag_payload.get("unit") or None
            topic = tag_payload.get("topic") or None
            if topic == chapter:
                topic = None
            stored_subject = str(tag_payload.get("subject") or params["subject"])
            stored_exam = str(tag_payload.get("exam") or params["exam"])
            stored_difficulty = str(tag_payload.get("difficulty") or params["difficulty"])
            stored_qtype = str(tag_payload.get("question_type") or qtype)
            stored_toughness = tag_payload.get("toughness_level")
            if stored_toughness is None:
                stored_toughness = result.toughness_level
            approval = APPROVAL_STATUS_PENDING_REVIEW

        row = AIQuestionBank(
            question_id=generate_ai_question_id(params["subject"]),
            subject=stored_subject,
            exam=stored_exam,
            difficulty=stored_difficulty,
            chapter=chapter,
            unit=unit,
            topic=topic,
            bloom_level=bloom_level,
            question_type=stored_qtype,
            question_text=repaired.question_text,
            options=repaired.options,
            correct_answer=repaired.correct_answer,
            step_by_step_solution=repaired.step_by_step_solution or "",
            embedding=embedding,
            sub_bank_type=SUB_BANK_TYPE_AI,
            is_child=False,
            parent_id=None,
            approval_status=approval,
            needs_action=needs_action,
            is_pattern=False,
            toughness_level=stored_toughness,
        )
        session.add(row)
        await session.commit()
        logger.info(
            "Inserted AI question %s tray=%s",
            row.question_id,
            "needs_action" if needs_action else "ready",
        )
        return True


async def process_generation_job(params: dict, job_id: str | None = None) -> None:
    if job_id and job_id in _hybrid_jobs:
        _hybrid_jobs[job_id]["status"] = "running"
    errors: list[str] = []
    inserted = 0
    try:
        try:
            job = batch_params_from_request(dict(params))
        except ValueError as exc:
            logger.exception("Invalid batch generation params")
            errors.append(_public_generation_error(exc))
            return
        if not await ensure_hybrid_db_ready():
            logger.error(
                "Hybrid batch skipped — Postgres not ready. Start Postgres (see POSTGRES-SETUP-SIMPLE.txt) and press F5."
            )
            errors.append(_POSTGRES_MESSAGE)
            return
        if not _gemini_api_key():
            logger.error("Hybrid batch skipped — GEMINI_API_KEY is missing")
            errors.append(_GEMINI_KEY_MESSAGE)
            return
        count = int(job.pop("count", 1))
        for _ in range(count):
            target_model = ai_generator.resolve_target_model(job)
            try:
                result = await ai_generator.draft_question(job, target_model)
                embedding = await deduplicator.get_embedding(result.draft.question_text)
                saved = await _insert_question(job, result, embedding)
                if saved:
                    inserted += 1
                else:
                    errors.append("Hybrid AI skipped a duplicate question already in Postgres.")
            except ValueError as exc:
                logger.warning(
                    "Skipping hybrid batch row — draft failed validation for subject=%s chapter=%s: %s",
                    job.get("subject"),
                    job.get("chapter"),
                    exc,
                )
                errors.append(_public_generation_error(exc))
            except Exception as exc:
                logger.exception(
                    "Skipping hybrid batch row — draft/insert failed for subject=%s chapter=%s",
                    job.get("subject"),
                    job.get("chapter"),
                )
                errors.append(_public_generation_error(exc))
    finally:
        _finish_job(job_id, inserted=inserted, errors=errors)


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
        return normalize_question_type_code(parent.question_type, has_options=bool(clone.options or parent.options))
    return normalize_question_type_code(None, has_options=bool(clone.options))


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
    *,
    subject: str | None = None,
    use_caching_optimizer: bool = False,
    reference_material_path: str | None = None,
) -> list[ai_generator.SingleCloneItem]:
    return await ai_generator.generate_clones_up_to_count(
        source_text,
        count,
        difficulty_offset,
        target_model,
        subject=subject,
        chunk_size=_CLONE_CHUNK_SIZE,
        use_caching_optimizer=use_caching_optimizer,
        reference_material_path=reference_material_path,
    )


async def process_clone_scaled_job(batch_id: str, params: dict[str, Any]) -> None:
    if batch_id in _hybrid_jobs:
        _hybrid_jobs[batch_id]["status"] = "running"
    clone_errors: list[str] = []
    parent_question_id = str(params["parent_question_id"]).strip()
    source_question_text = str(params["source_question_text"])
    requested_count = int(params["count"])
    difficulty_offset = int(params["difficulty_offset"])
    target_model = _resolve_clone_model(difficulty_offset)
    use_caching_optimizer = _clone_use_caching_optimizer(params)
    reference_material_path = str(params.get("reference_material_path") or "").strip() or None
    subject = str(params.get("subject") or "").strip() or None
    if not subject:
        async with AsyncSessionLocal() as session:
            parent_for_subject = await session.get(AIQuestionBank, parent_question_id)
            if parent_for_subject and parent_for_subject.subject:
                subject = str(parent_for_subject.subject).strip() or None

    try:
        raw_clones = await _generate_clones_up_to_count(
            source_question_text,
            requested_count,
            difficulty_offset,
            target_model,
            subject=subject,
            use_caching_optimizer=use_caching_optimizer,
            reference_material_path=reference_material_path,
        )
    except Exception as exc:
        logger.exception("Clone generation failed for batch_id=%s", batch_id)
        clone_errors.append(_public_generation_error(exc))
        _finish_job(batch_id, inserted=0, errors=clone_errors)
        return

    verified: list[dict[str, Any]] = []
    batch_embeddings: list[list[float]] = []

    try:
        async with AsyncSessionLocal() as session:
            parent_row = await session.get(AIQuestionBank, parent_question_id)
            clone_exam, clone_subject, clone_chapter, clone_topic = clone_parent_metadata(params, parent_row)
            parent_unit = getattr(parent_row, "unit", None) if parent_row is not None else None
            clone_tags = resolve_hybrid_curriculum_tags(
                clone_subject,
                unit=parent_unit or params.get("unit") or params.get("section"),
                chapter=clone_chapter,
                topic=clone_topic,
            )
            if clone_tags["mapped"]:
                clone_chapter = clone_tags["chapter"]
                clone_topic = clone_tags["topic"] or None
                clone_unit = clone_tags["unit"]
            else:
                clone_unit = None
            existing_child_ids = list(
                (
                    await session.execute(
                        select(AIQuestionBank.question_id).where(
                            or_(
                                AIQuestionBank.parent_id == parent_question_id,
                                AIQuestionBank.question_id.startswith(f"{parent_question_id}C"),
                            )
                        )
                    )
                ).scalars().all()
            )
            used_child_ids = list(existing_child_ids)
            for clone in raw_clones:
                child_index = next_child_question_index(parent_question_id, used_child_ids)
                child_id = generate_child_question_id(parent_question_id, child_index)
                clone_qtype = _clone_question_type(parent_row, clone)
                repaired, validation_errors = prepare_clone_for_insert(clone, clone_qtype)
                if validation_errors:
                    logger.warning(
                        "Skipping hybrid clone — validation failed batch_id=%s child_id=%s: %s",
                        batch_id,
                        child_id,
                        validation_errors,
                    )
                    clone_errors.append("Hybrid draft validation failed: " + "; ".join(validation_errors))
                    continue
                try:
                    embedding = await deduplicator.get_embedding(repaired.question_text)
                except Exception as exc:
                    logger.exception(
                        "Embedding failed for batch_id=%s child_id=%s; skipping",
                        batch_id,
                        child_id,
                    )
                    clone_errors.append(_public_generation_error(exc))
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
                used_child_ids.append(child_id)
                clone_sub_bank = _clone_sub_bank_type(parent_row, params)
                clone_bloom = normalize_bloom_level(repaired.bloom_level)
                if clone_bloom is None and parent_row is not None and parent_row.bloom_level:
                    clone_bloom = normalize_bloom_level(parent_row.bloom_level)
                verified.append(
                    _clone_to_json_entry(
                        child_id,
                        parent_question_id,
                        ai_generator.SingleCloneItem(
                            question_text=repaired.question_text,
                            options=repaired.options,
                            correct_answer=repaired.correct_answer,
                            step_by_step_solution=repaired.step_by_step_solution,
                            bloom_level=repaired.bloom_level,
                        ),
                        bloom_level=clone_bloom,
                    )
                )
                session.add(
                    AIQuestionBank(
                        question_id=child_id,
                        exam=clone_exam,
                        subject=clone_subject,
                        chapter=clone_chapter,
                        unit=clone_unit,
                        topic=clone_topic,
                        bloom_level=clone_bloom,
                        question_type=clone_qtype,
                        difficulty=_clone_difficulty_label(parent_row, difficulty_offset),
                        question_text=repaired.question_text,
                        correct_answer=repaired.correct_answer,
                        step_by_step_solution=repaired.step_by_step_solution,
                        options=repaired.options,
                        embedding=embedding,
                        sub_bank_type=clone_sub_bank,
                        parent_id=parent_question_id,
                        is_child=True,
                        approval_status=APPROVAL_STATUS_PENDING_REVIEW,
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
    except Exception as exc:
        logger.exception("Clone save failed for batch_id=%s", batch_id)
        clone_errors.append(_public_generation_error(exc))
        _finish_job(batch_id, inserted=0, errors=clone_errors)
        return
    _finish_job(batch_id, inserted=len(verified), errors=clone_errors)


@app.post("/api/generate/batch", tags=["AI generation"])
async def generate_batch(body: BatchGenerateRequest, background_tasks: BackgroundTasks) -> dict[str, str]:
    if not await ensure_hybrid_db_ready():
        raise HTTPException(status_code=503, detail=_POSTGRES_MESSAGE)
    _require_gemini_api_key()
    job_id = uuid.uuid4().hex
    _remember_job(job_id, kind="batch", requested=int(body.count))
    background_tasks.add_task(process_generation_job, body.model_dump(), job_id)
    return {"status": "Job Queued", "job_id": job_id}


@app.get("/api/generate/jobs/{job_id}", tags=["AI generation"])
async def get_generation_job(job_id: str) -> dict[str, Any]:
    job = _hybrid_jobs.get(job_id)
    if job is None:
        raise HTTPException(
            status_code=404,
            detail="Hybrid AI job was not found. Queue Generate again.",
        )
    return job


@app.post("/api/questions/clone-scaled", tags=["AI generation"])
async def clone_scaled(body: CloneScaledRequest, background_tasks: BackgroundTasks) -> dict[str, str]:
    if not await ensure_hybrid_db_ready():
        raise HTTPException(status_code=503, detail=_POSTGRES_MESSAGE)
    _require_gemini_api_key()
    batch_id = generate_clone_batch_id()
    job = {**body.model_dump(), "batch_id": batch_id}
    _remember_job(batch_id, kind="clone", requested=int(body.count))
    background_tasks.add_task(process_clone_scaled_job, batch_id, job)
    return {"status": "Cloning Batch Queued", "batch_id": batch_id, "job_id": batch_id}


@app.post("/api/clones/estimate-tokens", tags=["AI generation"])
async def estimate_clone_tokens(body: CloneEstimateTokensRequest) -> dict[str, Any]:
    text_for_estimate = _build_clone_token_estimate_text(
        body.source_question_text,
        body.count,
        include_syllabus=body.include_syllabus,
    )
    total = await estimate_tokens(text_for_estimate)
    return {
        "estimated_tokens": total,
        "eligible_for_caching": total >= _CLONE_CACHE_TOKEN_MINIMUM,
    }


async def _run_process_cached_book(file_path: str, subject: str = "General") -> None:
    try:
        await process_cached_book(
            file_path,
            subject=subject,
            display_name=Path(file_path).stem,
        )
    except Exception:
        logger.exception("Cached book ingestion failed for %s", file_path)
    finally:
        try:
            Path(file_path).unlink(missing_ok=True)
        except OSError:
            logger.warning("Could not remove temp PDF %s", file_path)


@app.post("/api/ingest/book-cached")
async def ingest_book_cached(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    subject_form: str | None = Form(default=None),
    subject: str | None = Query(default=None),
) -> dict[str, str]:
    resolved_subject = (subject or subject_form or "General").strip() or "General"
    suffix = Path(file.filename or "upload.pdf").suffix or ".pdf"
    tmp_path = _STATIC_ROOT / "uploads" / f"book_cached_{uuid.uuid4().hex}{suffix}"
    tmp_path.parent.mkdir(parents=True, exist_ok=True)
    data = await file.read()
    tmp_path.write_bytes(data)
    background_tasks.add_task(_run_process_cached_book, str(tmp_path), resolved_subject)
    return {
        "status": "Ingestion started",
        "file_name": file.filename or "upload.pdf",
        "subject": resolved_subject,
    }


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


class PatternMarkRequest(BaseModel):
    is_pattern: bool = True


@app.post("/api/questions/{question_id}/pattern", tags=["Question bank"])
async def mark_question_pattern(question_id: str, body: PatternMarkRequest) -> dict[str, Any]:
    """Mark or clear a pattern flag so similar questions can be requested later."""
    if not await ensure_hybrid_db_ready():
        raise HTTPException(status_code=503, detail=_POSTGRES_MESSAGE)
    qid = (question_id or "").strip()
    if not qid:
        raise HTTPException(status_code=400, detail="question_id is required")
    async with AsyncSessionLocal() as session:
        row = await session.get(AIQuestionBank, qid)
        if row is None:
            raise HTTPException(status_code=404, detail="Question was not found in the Hybrid pool.")
        row.is_pattern = bool(body.is_pattern)
        await session.commit()
    return {"question_id": qid, "is_pattern": bool(body.is_pattern), "patternQuestion": bool(body.is_pattern)}


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
    approved_only: bool = Query(default=True),
) -> dict[str, Any]:
    sub_types = [sub_bank_type] if (sub_bank_type or "").strip() in SUB_BANK_TYPES else None
    blooms = parse_bloom_levels_param(bloom_levels)
    try:
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
                approved_only=approved_only,
            )
    except Exception:
        logger.exception("Hybrid pool fetch failed")
        raise HTTPException(status_code=503, detail=_POSTGRES_MESSAGE) from None
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
    try:
        async with AsyncSessionLocal() as session:
            rows = await fetch_student_performance_by_bloom(
                session,
                sid,
                date_from=start,
                date_to=end,
            )
    except OSError as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                'Database is not reachable. Set DATABASE_URL in .env and start Postgres '
                '(pgvector) for Bloom analytics.'
            ),
        ) from exc
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

@app.post("/api/ingest/pdf")
async def ingest_pdf(
    file: UploadFile = File(...),
    subject: str = Form(...),
    exam: str = Form("JEE Main"),
    chapter: str = Form("General"),
    topic: str | None = Form(None),
    question_type: str = Form("MCQ"),
    difficulty: str = Form("Medium"),
) -> dict[str, Any]:
    suffix = Path(file.filename or "upload.pdf").suffix or ".pdf"
    tmp_path = _STATIC_ROOT / "uploads" / f"ingest_{uuid.uuid4().hex}{suffix}"
    tmp_path.parent.mkdir(parents=True, exist_ok=True)
    data = await file.read()
    tmp_path.write_bytes(data)
    try:
        return await process_pdf(
            tmp_path,
            subject,
            exam=exam,
            chapter=chapter,
            topic=topic,
            question_type=question_type,
            difficulty=difficulty,
            display_name=Path(file.filename or "textbook").stem,
        )
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except OSError:
            logger.warning("Could not remove temp PDF %s", tmp_path)


@app.post("/api/official-pyq/fill-tags", tags=["Official PYQ"])
async def official_pyq_fill_tags(body: OfficialPyqFillRequest) -> dict[str, Any]:
    """Return suggested tags, answer, and solution. Does not save or change the stem."""
    options = [str(opt or "") for opt in (body.options or [])]
    options_text = "\n".join(f"{chr(65 + i)}) {opt}" for i, opt in enumerate(options))
    params = {
        "question_text": body.question_text,
        "options_text": options_text,
        "subject": body.subject,
        "unit": body.unit or body.section,
        "section": body.section or body.unit,
        "chapter": body.chapter,
        "topic": body.topic,
        "question_type": body.question_type,
        "exam": body.exam,
        "toughness_level": body.toughness_level,
        "source": body.source,
        "answer": body.answer,
        "solution": body.solution,
    }
    try:
        filled = await ai_generator.fill_published_pyq(params)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=_public_generation_error(exc)) from exc
    return {"ok": True, **filled}


@app.post("/api/official-pyq/replica-question", tags=["Official PYQ"])
async def official_pyq_replica_question(body: OfficialPyqReplicaQuestionRequest) -> dict[str, Any]:
    """One similar question. Caller stores it as Pending review. This does not approve or publish."""
    from hybrid_metadata import hybrid_code_execution_subject

    model = _resolve_clone_model(int(body.difficulty_offset))
    code_subject = hybrid_code_execution_subject(
        {
            "subject": body.subject,
            "unit": body.unit,
            "section": body.unit,
            "chapter": body.chapter,
            "topic": body.topic,
        }
    )
    try:
        clone = await ai_generator.generate_official_replica(
            body.source_question_text,
            int(body.difficulty_offset),
            model,
            subject=code_subject or (body.subject or None),
            avoid_texts=[str(item) for item in (body.avoid_texts or []) if str(item or "").strip()],
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=_public_generation_error(exc)) from exc
    return {
        "ok": True,
        "model": model,
        "difficulty_offset": int(body.difficulty_offset),
        "parent_question_id": body.parent_question_id.strip(),
        "question_text": clone.question_text,
        "options": list(clone.options or []),
        "correct_answer": clone.correct_answer,
        "step_by_step_solution": clone.step_by_step_solution,
    }


class OfficialPyqCompareQuestionRequest(BaseModel):
    """One card vs the original page. Reports differences only; never rewrites the card."""

    paper_id: str = Field(..., min_length=1)
    go_to: int = Field(..., ge=1)
    printed_number: int = Field(..., ge=1)
    card_text: str = ""
    passage_text: str = ""
    subject: str = ""
    occurrence: int = Field(0, ge=0)
    same_number_count: int = Field(1, ge=1)
    options: list[str] = Field(default_factory=list)
    answer_key: str | None = None
    has_figure: bool = False
    drawn_text: str = ""
    drawn_passage: str = ""
    drawn_options: list[str] = Field(default_factory=list)


class OfficialPyqCompareCountRequest(BaseModel):
    paper_id: str = Field(..., min_length=1)
    card_numbers: list[int] = Field(default_factory=list)


def _compare_http_error(exc: BaseException) -> HTTPException:
    import official_pyq_compare as opc

    if isinstance(exc, opc.OriginalMissingError):
        return HTTPException(
            status_code=404,
            detail={"code": "original_missing", "message": opc.ORIGINAL_MISSING_MESSAGE},
        )
    if isinstance(exc, opc.GeminiKeyMissingError):
        return HTTPException(
            status_code=503,
            detail={"code": "gemini_key_missing", "message": opc.GEMINI_KEY_MISSING_MESSAGE},
        )
    low = str(exc).lower()
    if "402" in low or "resource_exhausted" in low or "prepayment credits" in low or "quota" in low:
        return HTTPException(
            status_code=402,
            detail={
                "code": "gemini_quota",
                "message": "Gemini credits or quota are used up (402). Top up in Google AI Studio, then try again.",
            },
        )
    if isinstance(exc, ValueError):
        return HTTPException(status_code=400, detail={"code": "bad_request", "message": str(exc)[:300]})
    return HTTPException(
        status_code=502,
        detail={"code": "compare_failed", "message": _public_generation_error(exc)},
    )


@app.get("/api/official-pyq/original/{paper_id}", tags=["Official PYQ"])
async def official_pyq_original_status(paper_id: str) -> dict[str, Any]:
    """Is the original PDF / page image stored for this pending paper?"""
    import official_pyq_compare as opc

    try:
        return {"ok": True, **opc.original_status(paper_id)}
    except ValueError as exc:
        raise _compare_http_error(exc) from exc


@app.post("/api/official-pyq/original/{paper_id}", tags=["Official PYQ"])
async def official_pyq_original_upload(paper_id: str, file: UploadFile = File(...)) -> dict[str, Any]:
    """Store the original paper file for later compare. Does not parse or change questions."""
    import official_pyq_compare as opc

    data = await file.read()
    if len(data) > 60 * 1024 * 1024:
        raise HTTPException(status_code=413, detail={"code": "too_large", "message": "File is over 60 MB."})
    try:
        return {"ok": True, **opc.save_original(paper_id, file.filename or "original.pdf", data)}
    except ValueError as exc:
        raise _compare_http_error(exc) from exc


@app.get("/api/official-pyq/original/{paper_id}/locate", tags=["Official PYQ"])
async def official_pyq_original_locate(
    paper_id: str,
    printed_number: int = Query(0, ge=0),
    card_text: str = Query("", max_length=4000),
    occurrence: int = Query(0, ge=0),
    same_number_count: int = Query(1, ge=1),
) -> dict[str, Any]:
    """Which original page holds this question. Local only (PDF text layer / saved page map); no Gemini."""
    import asyncio

    import official_pyq_compare as opc

    try:
        result = await asyncio.to_thread(
            opc.locate_question_local, paper_id, printed_number, card_text, occurrence, same_number_count
        )
    except ValueError as exc:
        raise _compare_http_error(exc) from exc
    return {"ok": True, **result}


@app.get("/api/official-pyq/original/{paper_id}/page/{page}", tags=["Official PYQ"])
async def official_pyq_original_page(paper_id: str, page: int) -> Response:
    """One original page as a PNG, drawn locally with PyMuPDF. No Gemini."""
    import asyncio

    import official_pyq_compare as opc

    try:
        data, mime = await asyncio.to_thread(opc.render_original_page, paper_id, page)
    except (opc.OriginalMissingError, ValueError) as exc:
        raise _compare_http_error(exc) from exc
    return Response(content=data, media_type=mime, headers={"Cache-Control": "private, max-age=300"})


@app.post("/api/official-pyq/compare-question", tags=["Official PYQ"])
async def official_pyq_compare_question(body: OfficialPyqCompareQuestionRequest) -> dict[str, Any]:
    """Gemini vision verdict for one card (gemini-3.7-flash, max_output_tokens=1500)."""
    import official_pyq_compare as opc

    try:
        result = await opc.compare_question(body.model_dump())
    except Exception as exc:  # noqa: BLE001 - mapped to a plain message
        raise _compare_http_error(exc) from exc
    return {"ok": True, "go_to": body.go_to, **result}


@app.post("/api/official-pyq/compare-count", tags=["Official PYQ"])
async def official_pyq_compare_count(body: OfficialPyqCompareCountRequest) -> dict[str, Any]:
    """Question count on the original paper vs the cards (flags extra / missing)."""
    import official_pyq_compare as opc

    try:
        result = await opc.compare_count(body.paper_id, body.card_numbers)
    except Exception as exc:  # noqa: BLE001
        raise _compare_http_error(exc) from exc
    return {"ok": True, **result}


class OfficialPyqReplicaSetRequest(BaseModel):
    """Four difficulties of one parent question. Not published."""

    parent_question_id: str = Field(..., min_length=1)
    source_question_text: str = Field(..., min_length=1)
    subject: str | None = None
    exam: str | None = None
    chapter: str | None = None
    topic: str | None = None
    unit: str | None = None
    avoid_texts: list[str] = Field(default_factory=list)


@app.post("/api/official-pyq/replica-set", tags=["Official PYQ"])
async def official_pyq_replica_set(body: OfficialPyqReplicaSetRequest) -> dict[str, Any]:
    """Four versions of one question. Caller files them into four pending papers."""
    from hybrid_metadata import hybrid_code_execution_subject

    code_subject = hybrid_code_execution_subject(
        {
            "subject": body.subject,
            "unit": body.unit,
            "section": body.unit,
            "chapter": body.chapter,
            "topic": body.topic,
        }
    )
    try:
        versions = await ai_generator.generate_official_replica_set(
            body.source_question_text,
            subject=code_subject or (body.subject or None),
            avoid_texts=[str(item) for item in (body.avoid_texts or []) if str(item or "").strip()],
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=_public_generation_error(exc)) from exc
    return {
        "ok": True,
        "model": "gemini-3-pro",
        "max_output_tokens": 8000,
        "parent_question_id": body.parent_question_id.strip(),
        "versions": [
            {
                "difficulty_offset": int(item.difficulty_offset),
                "question_text": item.question_text,
                "options": list(item.options or []),
                "correct_answer": item.correct_answer,
                "step_by_step_solution": item.step_by_step_solution,
            }
            for item in versions
        ],
    }

