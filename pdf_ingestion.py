"""Textbook PDF ingestion via Gemini context cache and PyMuPDF diagram crops."""

from __future__ import annotations

import env_loader  # noqa: F401 - loads .env before genai.Client()

import asyncio
import logging
from pathlib import Path
from typing import Any

import fitz
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from ai_generator import bloom_system_instruction, _parse_model_json, _response_text
from subject_tools import tools_for_subject
from cache_manager import EphemeralContextCache
from database import AsyncSessionLocal, bank_has_duplicate
from deduplicator import get_embedding
from models import (
    AIQuestionBank,
    APPROVAL_STATUS_APPROVED,
    SUB_BANK_TYPE_NORMAL,
    generate_ai_question_id,
    normalize_bloom_level,
)

logger = logging.getLogger(__name__)

_MAX_OUTPUT_TOKENS = 1500
_CHUNK_PAGES = 5
_DPI = 300
_PDF_MODEL = "gemini-3.7-flash"
_PROJECT_ROOT = Path(__file__).resolve().parent
DIAGRAMS_DIR = _PROJECT_ROOT / "static" / "diagrams"

client = genai.Client()


class PdfExtractedQuestion(BaseModel):
    question_text: str = Field(..., min_length=1)
    options: list[str] = Field(default_factory=list)
    correct_answer: str = Field(..., min_length=1)
    step_by_step_solution: str = Field(..., min_length=1)
    bloom_level: str = Field(..., min_length=1)
    difficulty_offset: int = Field(default=0, ge=-2, le=2)
    diagram_boxes: list[list[float]] = Field(default_factory=list)
    diagram_page_numbers: list[int] = Field(default_factory=list)
    question_id: str | None = None


class PdfChunkExtractionOutput(BaseModel):
    questions: list[PdfExtractedQuestion] = Field(default_factory=list)


def _difficulty_label(base: str, difficulty_offset: int) -> str:
    offset = int(difficulty_offset)
    if offset >= 1:
        return "Hard"
    if offset <= -1:
        return "Easy"
    return (base or "Medium").strip() or "Medium"


def _chunk_prompt(start_page: int, end_page: int) -> str:
    return (
        f"Extract every usable practice or exam-style question that appears on PDF pages "
        f"{start_page} through {end_page} (inclusive) of the cached textbook.\n"
        "Ignore headers, footers, watermarks, page numbers, publisher boilerplate, "
        "and other noise.\n"
        "For each question return question_text, options (empty list if not MCQ), "
        "correct_answer, step_by_step_solution, bloom_level, and difficulty_offset "
        "(-2 easier … +2 harder).\n"
        "When a figure or diagram belongs in the stem, insert placeholders "
        "{{DIAGRAM_1}}, {{DIAGRAM_2}}, … in question_text in order.\n"
        "For each diagram provide diagram_boxes as [ymin, xmin, ymax, xmax] normalized "
        "to 0–1 on that diagram's PDF page (top-left origin), and matching "
        "diagram_page_numbers (1-based absolute page index in the full PDF).\n"
        "Return JSON only, matching the response schema."
    )


def _generate_chunk_sync(
    *,
    cache_name: str,
    prompt: str,
    subject: str | None,
) -> PdfChunkExtractionOutput:
    response = client.models.generate_content(
        model=_PDF_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            max_output_tokens=_MAX_OUTPUT_TOKENS,
            tools=tools_for_subject(subject),
            response_mime_type="application/json",
            response_schema=PdfChunkExtractionOutput,
            system_instruction=bloom_system_instruction(subject),
            cached_content=cache_name,
        ),
    )
    raw = _response_text(response)
    parsed = _parse_model_json(raw, PdfChunkExtractionOutput)
    assert isinstance(parsed, PdfChunkExtractionOutput)
    return parsed


async def _extract_chunk(
    cache_name: str,
    start_page: int,
    end_page: int,
    *,
    subject: str,
) -> PdfChunkExtractionOutput:
    prompt = _chunk_prompt(start_page, end_page)
    return await asyncio.to_thread(
        _generate_chunk_sync,
        cache_name=cache_name,
        prompt=prompt,
        subject=subject,
    )


def _normalize_box(raw: list[float]) -> tuple[float, float, float, float]:
    if len(raw) != 4:
        raise ValueError(f"diagram box must have 4 values, got {raw!r}")
    ymin, xmin, ymax, xmax = (float(v) for v in raw)
    ymin = max(0.0, min(1.0, ymin))
    xmin = max(0.0, min(1.0, xmin))
    ymax = max(0.0, min(1.0, ymax))
    xmax = max(0.0, min(1.0, xmax))
    if ymax <= ymin or xmax <= xmin:
        raise ValueError(f"invalid diagram box extents: {raw!r}")
    return ymin, xmin, ymax, xmax


def _crop_diagram_png(
    doc: fitz.Document,
    *,
    page_number: int,
    box: list[float],
    dest: Path,
) -> None:
    page_index = page_number - 1
    if page_index < 0 or page_index >= doc.page_count:
        raise ValueError(f"page_number {page_number} out of range (1..{doc.page_count})")
    ymin, xmin, ymax, xmax = _normalize_box(box)
    page = doc[page_index]
    width = page.rect.width
    height = page.rect.height
    clip = fitz.Rect(xmin * width, ymin * height, xmax * width, ymax * height)
    scale = _DPI / 72.0
    matrix = fitz.Matrix(scale, scale)
    pix = page.get_pixmap(matrix=matrix, clip=clip)
    dest.parent.mkdir(parents=True, exist_ok=True)
    pix.save(str(dest))


def _resolve_diagram_pages(
    item: PdfExtractedQuestion,
    *,
    chunk_start: int,
    chunk_end: int,
) -> list[int]:
    boxes = item.diagram_boxes or []
    if not boxes:
        return []
    pages = list(item.diagram_page_numbers or [])
    if len(pages) < len(boxes):
        default_page = chunk_start
        pages.extend([default_page] * (len(boxes) - len(pages)))
    return pages[: len(boxes)]


def _apply_diagram_assets(
    doc: fitz.Document,
    *,
    question_id: str,
    question_text: str,
    boxes: list[list[float]],
    page_numbers: list[int],
) -> str:
    if not boxes:
        return question_text

    text = question_text
    for idx, box in enumerate(boxes, start=1):
        page_no = page_numbers[idx - 1]
        filename = f"{question_id}_fig_{idx}.png"
        dest = DIAGRAMS_DIR / filename
        _crop_diagram_png(doc, page_number=page_no, box=box, dest=dest)
        markdown = f"![Figure](/static/diagrams/{filename})"
        placeholder = f"{{{{DIAGRAM_{idx}}}}}"
        if placeholder in text:
            text = text.replace(placeholder, markdown)
        else:
            text = f"{text}\n\n{markdown}"
    return text


async def _save_questions_chunk(
    items: list[PdfExtractedQuestion],
    *,
    doc: fitz.Document,
    subject: str,
    exam: str,
    chapter: str,
    topic: str | None,
    question_type: str,
    difficulty: str,
    chunk_start: int,
    chunk_end: int,
) -> tuple[int, int]:
    saved = 0
    skipped = 0
    async with AsyncSessionLocal() as session:
        for item in items:
            bloom = normalize_bloom_level(item.bloom_level)
            if bloom is None:
                logger.warning("Skipping question with invalid bloom_level: %r", item.bloom_level)
                skipped += 1
                continue

            qid = (item.question_id or "").strip() or generate_ai_question_id(subject)
            page_numbers = _resolve_diagram_pages(
                item,
                chunk_start=chunk_start,
                chunk_end=chunk_end,
            )
            try:
                question_text = _apply_diagram_assets(
                    doc,
                    question_id=qid,
                    question_text=item.question_text.strip(),
                    boxes=item.diagram_boxes,
                    page_numbers=page_numbers,
                )
            except Exception:
                logger.exception("Diagram crop failed for question_id=%s", qid)
                skipped += 1
                continue

            options = [str(o).strip() for o in (item.options or []) if str(o).strip()]
            try:
                embedding = await get_embedding(question_text)
            except Exception:
                logger.exception("Embedding failed for question_id=%s", qid)
                skipped += 1
                continue

            if await bank_has_duplicate(session, embedding):
                logger.info("Skipping duplicate PDF question (subject=%s)", subject)
                skipped += 1
                continue

            row = AIQuestionBank(
                question_id=qid,
                subject=subject.strip(),
                exam=exam.strip(),
                chapter=chapter.strip(),
                topic=(topic.strip() if topic else None),
                question_type=question_type.strip(),
                difficulty=_difficulty_label(difficulty, item.difficulty_offset),
                bloom_level=bloom,
                question_text=question_text,
                options=options,
                correct_answer=item.correct_answer.strip(),
                step_by_step_solution=item.step_by_step_solution.strip(),
                embedding=embedding,
                sub_bank_type=SUB_BANK_TYPE_NORMAL,
                is_child=False,
                parent_id=None,
                approval_status=APPROVAL_STATUS_APPROVED,
            )
            session.add(row)
            saved += 1

        if saved:
            await session.commit()
    return saved, skipped


async def process_pdf(
    pdf_path: str | Path,
    subject: str,
    *,
    exam: str = "JEE Main",
    chapter: str = "General",
    topic: str | None = None,
    question_type: str = "MCQ",
    difficulty: str = "Medium",
    display_name: str | None = None,
    chunk_pages: int = _CHUNK_PAGES,
) -> dict[str, Any]:
    """
    Ingest a textbook PDF: cache the file in Gemini, extract 5-page chunks,
    crop diagrams, and auto-approve rows in ``question_bank``.
    """
    path = Path(pdf_path).resolve()
    if not path.is_file():
        raise FileNotFoundError(f"PDF not found: {path}")
    if not (subject or "").strip():
        raise ValueError("subject is required.")

    label = (display_name or path.stem).strip() or path.name
    DIAGRAMS_DIR.mkdir(parents=True, exist_ok=True)

    total_saved = 0
    total_skipped = 0
    chunks_processed = 0

    async with EphemeralContextCache(
        source=str(path),
        display_name=label,
        model_name=_PDF_MODEL,
    ) as cache:
        if not cache or not cache.name:
            raise RuntimeError("EphemeralContextCache did not return a cache name.")

        doc = fitz.open(path)
        try:
            page_count = doc.page_count
            if page_count < 1:
                return {
                    "ok": True,
                    "pages": 0,
                    "chunks_processed": 0,
                    "saved": 0,
                    "skipped": 0,
                }

            step = max(1, int(chunk_pages))
            for start in range(1, page_count + 1, step):
                end = min(start + step - 1, page_count)
                extraction = await _extract_chunk(
                    cache.name,
                    start,
                    end,
                    subject=subject.strip(),
                )
                chunks_processed += 1
                if not extraction.questions:
                    continue
                saved, skipped = await _save_questions_chunk(
                    extraction.questions,
                    doc=doc,
                    subject=subject,
                    exam=exam,
                    chapter=chapter,
                    topic=topic,
                    question_type=question_type,
                    difficulty=difficulty,
                    chunk_start=start,
                    chunk_end=end,
                )
                total_saved += saved
                total_skipped += skipped
                logger.info(
                    "PDF chunk pages %s-%s: saved=%s skipped=%s",
                    start,
                    end,
                    saved,
                    skipped,
                )
        finally:
            doc.close()

    return {
        "ok": True,
        "pages": page_count,
        "chunks_processed": chunks_processed,
        "saved": total_saved,
        "skipped": total_skipped,
        "subject": subject.strip(),
        "pdf": str(path),
    }


async def process_cached_book(
    pdf_path: str | Path,
    *,
    subject: str = "General",
    exam: str = "JEE Main",
    chapter: str = "General",
    topic: str | None = None,
    question_type: str = "MCQ",
    difficulty: str = "Medium",
    display_name: str | None = None,
    chunk_pages: int = _CHUNK_PAGES,
) -> dict[str, Any]:
    """Cached textbook ingest for background jobs (wraps ``process_pdf``)."""
    path = Path(pdf_path)
    label = (display_name or path.stem).strip() or path.name
    return await process_pdf(
        path,
        subject,
        exam=exam,
        chapter=chapter,
        topic=topic,
        question_type=question_type,
        difficulty=difficulty,
        display_name=label,
        chunk_pages=chunk_pages,
    )
