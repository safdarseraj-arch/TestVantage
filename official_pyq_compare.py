"""Compare Official PYQ cards with the original paper page (Gemini vision).

Original files live in data/official_pyq_originals/ (not served publicly).
Nothing here rewrites a question. Gemini only reports differences and may
suggest a correction copied from the page; the admin decides.
"""

from __future__ import annotations

import env_loader  # noqa: F401 - loads .env before genai.Client()

import asyncio
import json
import logging
import os
import re
from pathlib import Path
from typing import Any

import fitz
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from ai_generator import _parse_model_json, _response_text

logger = logging.getLogger(__name__)

COMPARE_MODEL = "gemini-3.7-flash"
_MAX_OUTPUT_TOKENS = 1500
_RENDER_DPI = 130
_MIN_MATCH_WORDS = 6
_MAX_INLINE_PDF_BYTES = 18 * 1024 * 1024
_PROJECT_ROOT = Path(__file__).resolve().parent
ORIGINALS_DIR = _PROJECT_ROOT / "data" / "official_pyq_originals"

ORIGINAL_MISSING_MESSAGE = "Original paper not available for this paper"
GEMINI_KEY_MISSING_MESSAGE = "Gemini key missing"

_IMAGE_SUFFIXES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}


class OriginalMissingError(LookupError):
    pass


class GeminiKeyMissingError(RuntimeError):
    pass


class CompareDifference(BaseModel):
    kind: str = Field(
        ...,
        description=(
            "One of: missing_text, wrong_number, wrong_unit, wrong_symbol, wrong_option, "
            "wrong_alignment, missing_figure, wrong_passage, extra_card, other"
        ),
    )
    detail: str = Field(..., description="Short, concrete: what the page shows vs what the card shows.")


class CompareVerdict(BaseModel):
    verdict: str = Field(..., description="matches | differs | not_found")
    differences: list[CompareDifference] = Field(default_factory=list)
    suggested_text: str = Field(
        default="",
        description="Whole corrected question text copied only from the page image. Empty if unsure or matches.",
    )
    suggested_options: list[str] = Field(
        default_factory=list,
        description="Corrected options copied only from the page image. Empty if options already match.",
    )
    suggested_passage: str = Field(
        default="",
        description="Whole corrected shared passage / question stem copied only from the page image. Empty if it matches or unsure.",
    )
    found_on_page: int | None = None


class PageMapEntry(BaseModel):
    page: int
    question_numbers: list[int] = Field(default_factory=list)


class PageMap(BaseModel):
    total_questions: int = 0
    pages: list[PageMapEntry] = Field(default_factory=list)


def gemini_key_present() -> bool:
    return bool((os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip())


_CLIENT: genai.Client | None = None


def _client() -> genai.Client:
    """One long-lived client: a discarded client closes its HTTP session mid-request."""
    global _CLIENT
    key = (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip()
    if not key:
        raise GeminiKeyMissingError(GEMINI_KEY_MISSING_MESSAGE)
    if _CLIENT is None:
        _CLIENT = genai.Client(api_key=key)
    return _CLIENT


def _safe_id(paper_id: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_.-]", "_", str(paper_id or "").strip())[:120]
    if not cleaned or cleaned.startswith("."):
        raise ValueError("Invalid paper id.")
    return cleaned


def _meta_path(paper_id: str) -> Path:
    return ORIGINALS_DIR / f"{_safe_id(paper_id)}.meta.json"


def _read_meta(paper_id: str) -> dict[str, Any]:
    path = _meta_path(paper_id)
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def _write_meta(paper_id: str, meta: dict[str, Any]) -> None:
    ORIGINALS_DIR.mkdir(parents=True, exist_ok=True)
    _meta_path(paper_id).write_text(json.dumps(meta), encoding="utf-8")


def _original_file(paper_id: str) -> Path | None:
    safe = _safe_id(paper_id)
    for suffix in (".pdf", *_IMAGE_SUFFIXES.keys()):
        path = ORIGINALS_DIR / f"{safe}{suffix}"
        if path.exists():
            return path
    return None


def save_original(paper_id: str, filename: str, data: bytes) -> dict[str, Any]:
    suffix = Path(filename or "").suffix.lower()
    is_pdf = suffix == ".pdf" or data[:5] == b"%PDF-"
    if is_pdf:
        suffix = ".pdf"
    elif suffix not in _IMAGE_SUFFIXES:
        raise ValueError("Use the original PDF or a page image (PNG / JPG / WEBP).")
    if not data:
        raise ValueError("The file is empty.")
    pages = 1
    if is_pdf:
        try:
            with fitz.open(stream=data, filetype="pdf") as doc:
                pages = doc.page_count
        except Exception as exc:  # noqa: BLE001 - surface a plain message
            raise ValueError("That PDF could not be opened.") from exc
    ORIGINALS_DIR.mkdir(parents=True, exist_ok=True)
    old = _original_file(paper_id)
    if old is not None:
        old.unlink(missing_ok=True)
    dest = ORIGINALS_DIR / f"{_safe_id(paper_id)}{suffix}"
    dest.write_bytes(data)
    _write_meta(paper_id, {"file_name": filename, "kind": "pdf" if is_pdf else "image", "pages": pages})
    return original_status(paper_id)


def original_status(paper_id: str) -> dict[str, Any]:
    path = _original_file(paper_id)
    meta = _read_meta(paper_id)
    if path is None:
        return {"available": False, "message": ORIGINAL_MISSING_MESSAGE, "gemini_key": gemini_key_present()}
    return {
        "available": True,
        "kind": meta.get("kind") or ("pdf" if path.suffix == ".pdf" else "image"),
        "pages": int(meta.get("pages") or 1),
        "file_name": meta.get("file_name") or path.name,
        "original_count": meta.get("page_map", {}).get("total_questions"),
        "gemini_key": gemini_key_present(),
    }


def _prose_words(text: str) -> list[str]:
    plain = re.sub(r"\$[^$]*\$", " ", str(text or ""))
    plain = re.sub(r"\\[a-zA-Z]+", " ", plain)
    plain = re.sub(r"[^A-Za-z0-9 ]+", " ", plain)
    return [w.lower() for w in plain.split() if len(w) > 3]


def _with_next_page(page: int, page_count: int) -> list[int]:
    return [page, page + 1] if page < page_count else [page]


def _nth_start_page(starts: list[int], occurrence: int, same_number_count: int) -> int:
    """Page of the n-th question with this printed number (restart numbering: one per subject).
    0 when the paper does not show exactly as many starts as there are cards with this number."""
    if same_number_count < 1 or len(starts) != same_number_count or occurrence >= len(starts):
        return 0
    return starts[occurrence]


def _text_layer_pages(
    doc: fitz.Document, number: int, card_text: str, occurrence: int = 0, same_number_count: int = 1
) -> list[int]:
    """1-based pages that hold this question, from the PDF text layer. [] if unsure.
    A short card ("The value of x is ____.") matches almost any page, so word overlap
    only counts with enough words; otherwise the n-th printed number is used."""
    words = set(_prose_words(card_text)[:40])
    enough_words = len(words) >= _MIN_MATCH_WORDS
    marker = re.compile(rf"(?m)^\s*(?:Q\.?\s*{number}\b|{number}\s*[.)]\s)")
    marker_pages: list[int] = []
    best_page, best_score = 0, 0.0
    for index in range(doc.page_count):
        text = doc[index].get_text("text") or ""
        if len(text.strip()) < 40:
            continue
        has_marker = bool(marker.search(text))
        if has_marker:
            marker_pages.append(index + 1)
        if not enough_words:
            continue
        page_words = set(_prose_words(text))
        overlap = len(words & page_words) / len(words)
        score = overlap * 10 + (4 if has_marker else 0)
        if score > best_score:
            best_page, best_score = index + 1, score
    if best_page and best_score >= 5:
        return _with_next_page(best_page, doc.page_count)
    nth = _nth_start_page(marker_pages, occurrence, same_number_count)
    return _with_next_page(nth, doc.page_count) if nth else []


def _page_map_pages(
    mapped: dict[str, Any], number: int, occurrence: int, same_number_count: int, page_count: int
) -> list[int]:
    starts = sorted(int(p) for p in (mapped.get("by_number") or {}).get(str(number), []))
    if not starts:
        return []
    first = _nth_start_page(starts, occurrence, same_number_count)
    if not first:
        if same_number_count > 1:
            return []
        first = starts[0]
    return _with_next_page(first, page_count)


def _page_map_sync(path: Path) -> dict[str, Any]:
    data = path.read_bytes()
    if len(data) > _MAX_INLINE_PDF_BYTES:
        raise ValueError("The original PDF is too large to map pages (over 18 MB).")
    response = _client().models.generate_content(
        model=COMPARE_MODEL,
        contents=[
            types.Part.from_bytes(data=data, mime_type="application/pdf"),
            (
                "This is an official exam question paper. For every page, list the printed "
                "question numbers that START on that page (ignore instructions, answer keys and "
                "headers). Also give total_questions = how many numbered questions the paper has. "
                "Pages are 1-based. Return JSON only."
            ),
        ],
        config=types.GenerateContentConfig(
            max_output_tokens=_MAX_OUTPUT_TOKENS,
            response_mime_type="application/json",
            response_schema=PageMap,
        ),
    )
    parsed = _parse_model_json(_response_text(response), PageMap)
    assert isinstance(parsed, PageMap)
    by_number: dict[str, list[int]] = {}
    for entry in parsed.pages:
        for num in entry.question_numbers:
            by_number.setdefault(str(int(num)), []).append(int(entry.page))
    return {"total_questions": int(parsed.total_questions or 0), "by_number": by_number}


async def page_map(paper_id: str) -> dict[str, Any]:
    path = _original_file(paper_id)
    if path is None:
        raise OriginalMissingError(ORIGINAL_MISSING_MESSAGE)
    meta = _read_meta(paper_id)
    cached = meta.get("page_map")
    if isinstance(cached, dict) and cached.get("by_number"):
        return cached
    if path.suffix != ".pdf":
        mapped = {"total_questions": 0, "by_number": {}}
    else:
        mapped = await asyncio.to_thread(_page_map_sync, path)
    meta["page_map"] = mapped
    _write_meta(paper_id, meta)
    return mapped


def _render_pages(path: Path, pages: list[int]) -> list[tuple[bytes, str]]:
    out: list[tuple[bytes, str]] = []
    with fitz.open(str(path)) as doc:
        scale = _RENDER_DPI / 72.0
        for page_no in pages:
            if 1 <= page_no <= doc.page_count:
                pix = doc[page_no - 1].get_pixmap(matrix=fitz.Matrix(scale, scale))
                out.append((pix.tobytes("png"), "image/png"))
    return out


async def _pages_for_question(
    path: Path, paper_id: str, number: int, card_text: str, occurrence: int = 0, same_number_count: int = 1
) -> list[int]:
    with fitz.open(str(path)) as doc:
        page_count = doc.page_count
        pages = _text_layer_pages(doc, number, card_text, occurrence, same_number_count)
    if pages:
        return pages
    mapped = await page_map(paper_id)
    return _page_map_pages(mapped, number, occurrence, same_number_count, page_count)


def locate_question_local(
    paper_id: str, number: int, card_text: str, occurrence: int = 0, same_number_count: int = 1
) -> dict[str, Any]:
    """Pages for "Show original page": PDF text layer, else a page map already saved. No Gemini."""
    path = _original_file(paper_id)
    if path is None:
        return {"available": False, "message": ORIGINAL_MISSING_MESSAGE, "pages": [], "page_count": 0}
    if path.suffix != ".pdf":
        return {"available": True, "kind": "image", "pages": [1], "page_count": 1, "found_by": "image"}
    with fitz.open(str(path)) as doc:
        page_count = doc.page_count
        pages = _text_layer_pages(doc, number, card_text, occurrence, same_number_count) if number > 0 else []
    found_by = "text_layer" if pages else ""
    if not pages:
        cached = _read_meta(paper_id).get("page_map") or {}
        pages = _page_map_pages(cached, number, occurrence, same_number_count, page_count)
        if pages:
            found_by = "saved_page_map"
    return {
        "available": True,
        "kind": "pdf",
        "pages": pages,
        "page_count": page_count,
        "found_by": found_by or "not_found",
    }


def render_original_page(paper_id: str, page: int) -> tuple[bytes, str]:
    """One original page as a picture, drawn locally with PyMuPDF (or the stored image)."""
    path = _original_file(paper_id)
    if path is None:
        raise OriginalMissingError(ORIGINAL_MISSING_MESSAGE)
    if path.suffix != ".pdf":
        return path.read_bytes(), _IMAGE_SUFFIXES[path.suffix]
    with fitz.open(str(path)) as doc:
        if not 1 <= page <= doc.page_count:
            raise ValueError(f"Page {page} is not in the original paper (1-{doc.page_count}).")
    images = _render_pages(path, [page])
    return images[0]


_OPTION_LABEL_RE = re.compile(r"^\s*(?:\(\s*[A-Za-z1-9]\s*\)|[A-Da-d][.)])\s*")


def _labelled_options(raw: Any) -> str:
    """The card hides a stored "(A) " prefix, so drop it before adding our own label."""
    options = [_OPTION_LABEL_RE.sub("", str(o or ""), count=1) for o in raw or []]
    return "\n".join(f"({chr(65 + i)}) {o}" for i, o in enumerate(options) if o.strip())


def _compare_prompt(body: dict[str, Any], pages: list[int]) -> str:
    opts = _labelled_options(body.get("options")) or "(no options)"
    answer = str(body.get("answer_key") or "").strip() or "(none on card)"
    figure = "yes" if body.get("has_figure") else "no"
    passage = str(body.get("passage_text") or "").strip()
    subject = str(body.get("subject") or "").strip()
    page_note = (
        f"The images are page(s) {', '.join(str(p) for p in pages)} of the original paper."
        if pages
        else "The image is the original page."
    )
    where = f" in the {subject} part" if subject else ""
    drawn_text = str(body.get("drawn_text") or "").strip()
    drawn_passage = str(body.get("drawn_passage") or "").strip()
    drawn_opts = _labelled_options(body.get("drawn_options"))
    drawn_block = (
        "--- the same card AS DRAWN for students (math flattened to plain text) ---\n"
        + (f"passage: {drawn_passage}\n" if drawn_passage else "")
        + f"question: {drawn_text}\n"
        + (f"options:\n{drawn_opts}\n" if drawn_opts else "")
        if drawn_text or drawn_passage
        else ""
    )
    drawn_rules = (
        "- The AS DRAWN text is what students see. Superscripts/subscripts appear inline there "
        "(Fe2+, 10−2, KMnO4) and no spaces around + − × = is normal — not a difference. But "
        "words, numbers, units or formulas glued together there that the page separates "
        "(e.g. drawn '0.03MKMnO4', page '0.03 M KMnO4') ARE a difference: report wrong_symbol "
        "and fix the LaTeX with ~ between the parts, e.g. $0.03~\\mathrm{M}~\\mathrm{KMnO}_{4}$.\n"
        if drawn_block
        else ""
    )
    passage_block = (
        f"--- shared passage / question stem (printed once above this question) ---\n{passage}\n"
        if passage
        else "--- shared passage --- (none on card)\n"
    )
    passage_rules = (
        "- Compare the WHOLE card: the shared passage (paragraph / 'Question Stem' printed before the "
        "question), the question text, the options and the figure. Report a passage problem as "
        "wrong_passage: text missing from it, text from another passage or another question inside it, "
        "or this question's own line repeated inside it.\n"
        "- suggested_passage: the WHOLE corrected passage (not only the changed part), in the card's "
        "LaTeX style, without the question lines. Leave empty if it matches or you are unsure.\n"
        if passage
        else "- If the page prints a passage / 'Question Stem' for this question and the card has none, "
        "report wrong_passage and put the passage in suggested_passage.\n"
    )
    return (
        f"{page_note} Find printed question number {body.get('printed_number')}{where}. "
        "If it continues onto the next image, include that part.\n\n"
        "Compare it with this EXTRACTED CARD (LaTeX allowed):\n"
        f"{passage_block}"
        f"--- question text ---\n{body.get('card_text') or ''}\n"
        f"--- options ---\n{opts}\n"
        f"--- answer key on card ---\n{answer}\n"
        f"--- card has a figure --- {figure}\n"
        f"{drawn_block}\n"
        "Rules:\n"
        f"{passage_rules}"
        f"{drawn_rules}"
        "- verdict 'matches' if the card says the same thing as the page. Ignore LaTeX vs plain "
        "formatting that renders the same, line breaks, and the question-number prefix.\n"
        "- verdict 'differs' with a short list of concrete differences: missing text, wrong "
        "number/unit/symbol, wrong option, wrong alignment of reactions/tables/lists, missing "
        "figure, or extra_card if this card is not a real question on the page.\n"
        "- verdict 'not_found' if the question is not on these images.\n"
        "- suggested_text / suggested_options: the WHOLE corrected question text / every option "
        "(not only the changed part), keeping the card's LaTeX where it was right. Only text you "
        "can read on the page. Never invent. Leave a field empty if that part matches or you are "
        "unsure. Use $...$ for math. Inside math put ~ between a number and its unit and between "
        "unit words, e.g. $105~\\mathrm{kcal}~\\mathrm{mol}^{-1}$. A table is one plain "
        "\\begin{tabular} with & and \\\\ rows.\n"
        "- Do not judge the answer key unless the page prints one.\n"
        "Return JSON only."
    )


def _compare_sync(parts: list[Any], prompt: str) -> CompareVerdict:
    response = _client().models.generate_content(
        model=COMPARE_MODEL,
        contents=[*parts, prompt],
        config=types.GenerateContentConfig(
            max_output_tokens=_MAX_OUTPUT_TOKENS,
            response_mime_type="application/json",
            response_schema=CompareVerdict,
            thinking_config=types.ThinkingConfig(thinking_budget=0, include_thoughts=False),
        ),
    )
    parsed = _parse_model_json(_response_text(response), CompareVerdict)
    assert isinstance(parsed, CompareVerdict)
    return parsed


async def compare_question(body: dict[str, Any]) -> dict[str, Any]:
    paper_id = str(body.get("paper_id") or "")
    path = _original_file(paper_id)
    if path is None:
        raise OriginalMissingError(ORIGINAL_MISSING_MESSAGE)
    if not gemini_key_present():
        raise GeminiKeyMissingError(GEMINI_KEY_MISSING_MESSAGE)
    number = int(body.get("printed_number") or body.get("go_to") or 0)
    if path.suffix == ".pdf":
        find_text = f"{body.get('passage_text') or ''}\n{body.get('card_text') or ''}"
        pages = await _pages_for_question(
            path,
            paper_id,
            number,
            find_text,
            int(body.get("occurrence") or 0),
            int(body.get("same_number_count") or 1),
        )
        if not pages:
            return {
                "verdict": "not_found",
                "differences": [
                    {"kind": "extra_card", "detail": f"Question {number} was not found in the original paper."}
                ],
                "suggested_text": "",
                "suggested_options": [],
                "pages": [],
                "model": COMPARE_MODEL,
            }
        images = await asyncio.to_thread(_render_pages, path, pages)
    else:
        pages = []
        images = [(path.read_bytes(), _IMAGE_SUFFIXES[path.suffix])]
    parts = [types.Part.from_bytes(data=data, mime_type=mime) for data, mime in images]
    verdict = await asyncio.to_thread(_compare_sync, parts, _compare_prompt(body, pages))
    kind = verdict.verdict.strip().lower()
    if kind not in ("matches", "differs", "not_found"):
        kind = "differs" if verdict.differences else "matches"
    if kind == "matches" and verdict.differences:
        kind = "differs"
    return {
        "verdict": kind,
        "differences": [d.model_dump() for d in verdict.differences][:8],
        "suggested_text": verdict.suggested_text.strip() if kind == "differs" else "",
        "suggested_options": [str(o) for o in verdict.suggested_options] if kind == "differs" else [],
        "suggested_passage": verdict.suggested_passage.strip() if kind == "differs" else "",
        "pages": pages,
        "model": COMPARE_MODEL,
    }


async def compare_count(paper_id: str, card_numbers: list[int]) -> dict[str, Any]:
    path = _original_file(paper_id)
    if path is None:
        raise OriginalMissingError(ORIGINAL_MISSING_MESSAGE)
    if path.suffix != ".pdf":
        return {"original_count": None, "message": "A single page image cannot give the full question count."}
    if not gemini_key_present():
        raise GeminiKeyMissingError(GEMINI_KEY_MISSING_MESSAGE)
    mapped = await page_map(paper_id)
    printed = sorted({int(n) for n in mapped.get("by_number", {}).keys() if str(n).isdigit()})
    total = int(mapped.get("total_questions") or len(printed))
    cards = sorted({int(n) for n in card_numbers if int(n) > 0})
    original_set = set(printed) if printed else set(range(1, total + 1))
    return {
        "original_count": total,
        "card_count": len(card_numbers),
        "missing": sorted(original_set - set(cards)),
        "extra": sorted(set(cards) - original_set),
        "model": COMPARE_MODEL,
    }
