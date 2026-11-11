"""Compare Official PYQ cards with the original paper page (Gemini vision).

Original files live in data/official_pyq_originals/ (not served publicly).
Admin crops of original pages live in data/official_pyq_crops/ and are served as question pictures.
Nothing here rewrites a question. Gemini only reports differences and may
suggest a correction copied from the page; the admin decides. Drawings in a
suggestion are boxes on the page that are cut out here, never redrawn.
"""

from __future__ import annotations

import env_loader  # noqa: F401 - loads .env before genai.Client()

import asyncio
import hashlib
import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Any

import fitz
import httpx
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
_GEMINI_TIMEOUT_MS = 90_000
_COMPARE_TIMEOUT_MS = 50_000
_PAGE_MAP_TIMEOUT_MS = 150_000
_PROJECT_ROOT = Path(__file__).resolve().parent
ORIGINALS_DIR = _PROJECT_ROOT / "data" / "official_pyq_originals"
CROPS_DIR = _PROJECT_ROOT / "data" / "official_pyq_crops"
CROP_URL_PREFIX = "/api/official-pyq/original/crops/"
_CROP_DPI = 220
_MIN_CROP_FRACTION = 0.01
_CROP_NAME_RE = re.compile(r"[A-Za-z0-9_.-]{1,160}\.png")
_LAYOUT_REVISION = 2
_LAYOUT_Y_TOLERANCE = 4.0
_LAYOUT_X_TOLERANCE = 6.0
_QUESTION_MARKER_RE = re.compile(r"^Q\.?(\d{1,3})$")
_OPTION_WORD_RE = re.compile(r"^\(([A-D])\)")

ORIGINAL_MISSING_MESSAGE = "Original paper not available for this paper"
GEMINI_KEY_MISSING_MESSAGE = "Gemini key missing"
GEMINI_TIMEOUT_MESSAGE = "Gemini did not answer in time. Click Compare this question again."
GEMINI_CONNECTION_MESSAGE = (
    "The internet connection to Gemini kept dropping (tried 3 times). Wait a minute, then click Compare this question again."
)

_IMAGE_SUFFIXES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}


class OriginalMissingError(LookupError):
    pass


class GeminiKeyMissingError(RuntimeError):
    pass


class GeminiTimeoutError(TimeoutError):
    pass


class GeminiConnectionError(ConnectionError):
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


class CompareFigure(BaseModel):
    place: str = Field(..., description="Where the drawing belongs on the card: text | passage | A | B | C | D")
    page: int = Field(..., description="Page number of the image the drawing is printed on")
    box_2d: list[float] = Field(..., description="[ymin, xmin, ymax, xmax] of the drawing on that page, scaled 0-1000")


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
    figures: list[CompareFigure] = Field(
        default_factory=list,
        description="Boxes around drawings the card is missing or draws wrong. Empty if every picture is right.",
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


_CONNECTION_TRIES = 3
_RETRY_PAUSE_S = (1.5, 3.0)


def _api_key() -> str:
    key = (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip()
    if not key:
        raise GeminiKeyMissingError(GEMINI_KEY_MISSING_MESSAGE)
    return key


def _connection_dropped(exc: Exception) -> bool:
    if isinstance(exc, (httpx.TransportError, ConnectionError)):
        return True
    text = str(exc).lower()
    return any(s in text for s in ("10054", "10053", "10038", "forcibly closed", "connection reset", "connection aborted"))


def _generate(*, retry_timeout: bool = False, **kwargs: Any) -> Any:
    """Each call owns its client: a shared pool lets one dropped connection break other calls
    running at the same time ("not a socket"), and a stale pooled connection hangs later calls.
    retry_timeout: a short call that hangs is usually one slow Gemini moment; try once more."""
    key = _api_key()
    timed_out = False
    for attempt in range(_CONNECTION_TRIES):
        client = genai.Client(api_key=key, http_options=types.HttpOptions(timeout=_GEMINI_TIMEOUT_MS))
        try:
            return client.models.generate_content(**kwargs)
        except Exception as exc:
            if isinstance(exc, httpx.TimeoutException) or "timed out" in str(exc).lower():
                if retry_timeout and not timed_out and attempt < _CONNECTION_TRIES - 1:
                    timed_out = True
                    logger.warning("Gemini did not answer in time; one retry on a fresh connection")
                    continue
                raise GeminiTimeoutError(GEMINI_TIMEOUT_MESSAGE) from exc
            if attempt < _CONNECTION_TRIES - 1 and _connection_dropped(exc):
                logger.warning("Gemini connection dropped (%s); retry %d on a fresh connection", exc, attempt + 1)
                time.sleep(_RETRY_PAUSE_S[min(attempt, len(_RETRY_PAUSE_S) - 1)])
                continue
            if _connection_dropped(exc):
                raise GeminiConnectionError(GEMINI_CONNECTION_MESSAGE) from exc
            raise
        finally:
            try:
                client.close()
            except Exception:
                pass
    raise RuntimeError("unreachable")


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
    plain = re.sub(r"\\includegraphics(?:\[[^\]]*\])?\{[^}]*\}|!\[[^\]]*\]\([^)]*\)|<smiles>.*?</smiles>|https?://\S+", " ", str(text or ""), flags=re.S)
    plain = re.sub(r"\$[^$]*\$", " ", plain)
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
    doc: fitz.Document,
    number: int,
    card_text: str,
    occurrence: int = 0,
    same_number_count: int = 1,
    loose: bool = False,
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
    if best_page and best_score >= (3 if loose else 5):
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
    response = _generate(
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
            thinking_config=types.ThinkingConfig(thinking_budget=0, include_thoughts=False),
            http_options=types.HttpOptions(timeout=_PAGE_MAP_TIMEOUT_MS),
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
                out.append((pix.tobytes("jpeg", jpg_quality=88), "image/jpeg"))
    return out


async def _pages_for_question(
    path: Path, paper_id: str, number: int, card_text: str, occurrence: int = 0, same_number_count: int = 1
) -> list[int]:
    with fitz.open(str(path)) as doc:
        page_count = doc.page_count
        pages = _text_layer_pages(doc, number, card_text, occurrence, same_number_count)
    if pages:
        return pages
    try:
        mapped = await page_map(paper_id)
    except ValueError as exc:
        logger.warning("Page map failed (%s); using the closest text-layer page", exc)
        with fitz.open(str(path)) as doc:
            return _text_layer_pages(doc, number, card_text, occurrence, same_number_count, loose=True)
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


def _reading_order_words(doc: fitz.Document) -> list[tuple[int, float, float, str]]:
    """(page, x0, y0, word) for every word, in reading order (two-column pages: left column first)."""
    out: list[tuple[int, float, float, str]] = []
    for index in range(doc.page_count):
        page = doc[index]
        width = page.rect.width or 1.0
        words = page.get_text("words") or []
        two_column = any(
            _QUESTION_MARKER_RE.match(w[4]) and 0.5 * width <= w[0] < 0.8 * width for w in words
        )
        keyed = []
        for w in words:
            column = 1 if two_column and w[0] >= 0.5 * width else 0
            keyed.append(((column, round(w[1], 1), w[0]), (index + 1, float(w[0]), float(w[1]), str(w[4]))))
        keyed.sort(key=lambda item: item[0])
        out.extend(word for _, word in keyed)
    return out


def _is_question_marker(word: tuple[int, float, float, str], page_width: float) -> int:
    match = _QUESTION_MARKER_RE.match(word[3])
    if not match:
        return 0
    x = word[1] / (page_width or 1.0)
    return int(match.group(1)) if x < 0.3 or 0.5 <= x < 0.8 else 0


def _labels_layout(labels: list[tuple[int, float, float]]) -> str:
    """'row' (A B C D across), 'grid' (A B / C D), or 'list' (one under another), from label positions."""
    a, b, c, d = labels

    def same_line(u: tuple[int, float, float], v: tuple[int, float, float]) -> bool:
        return u[0] == v[0] and abs(u[2] - v[2]) <= _LAYOUT_Y_TOLERANCE

    def same_column(u: tuple[int, float, float], v: tuple[int, float, float]) -> bool:
        return abs(u[1] - v[1]) <= _LAYOUT_X_TOLERANCE

    if same_line(a, b) and same_line(b, c) and same_line(c, d):
        return "row"
    if same_line(a, b) and same_line(c, d) and same_column(a, c) and same_column(b, d) and not same_column(a, b):
        return "grid"
    return "list"


def option_layouts(paper_id: str) -> dict[str, Any]:
    """How the original paper lays out each question's options (A)-(D). Local PDF text layer only; no Gemini.
    Questions are keyed by printed number and its n-th appearance (numbering restarts per subject)."""
    path = _original_file(paper_id)
    if path is None or path.suffix != ".pdf":
        return {"available": False, "questions": [], "counts": {}}
    meta = _read_meta(paper_id)
    cached = meta.get("option_layout") or {}
    if cached.get("revision") == _LAYOUT_REVISION:
        return {"available": True, **{k: cached[k] for k in ("questions", "counts")}}
    with fitz.open(str(path)) as doc:
        widths = [doc[i].rect.width for i in range(doc.page_count)]
        words = _reading_order_words(doc)
    pages_at_spot: dict[tuple[str, int, int], set[int]] = {}
    for page, x, y, text in words:
        pages_at_spot.setdefault((text, round(x), round(y)), set()).add(page)
    page_chrome = {spot for spot, pages in pages_at_spot.items() if len(pages) >= 3}
    starts = [(i, n) for i, w in enumerate(words) if (n := _is_question_marker(w, widths[w[0] - 1]))]
    questions: list[dict[str, Any]] = []
    counts: dict[str, int] = {}
    for k, (start, number) in enumerate(starts):
        end = starts[k + 1][0] if k + 1 < len(starts) else len(words)
        first: dict[str, tuple[int, float, float]] = {}
        for page, x, y, text in words[start + 1 : end]:
            label = _OPTION_WORD_RE.match(text)
            if label and label.group(1) not in first and (text, round(x), round(y)) not in page_chrome:
                first[label.group(1)] = (page, x, y)
        found = [first[letter] for letter in "ABCD" if letter in first]
        occurrence = counts.get(str(number), 0)
        counts[str(number)] = occurrence + 1
        questions.append(
            {
                "number": number,
                "occurrence": occurrence,
                "page": words[start][0],
                "layout": _labels_layout(found) if len(found) == 4 else "",
            }
        )
    meta["option_layout"] = {"revision": _LAYOUT_REVISION, "questions": questions, "counts": counts}
    _write_meta(paper_id, meta)
    return {"available": True, "questions": questions, "counts": counts}


def _crop_box(box: dict[str, Any]) -> tuple[float, float, float, float]:
    try:
        x0, y0, x1, y1 = (float(box[k]) for k in ("x0", "y0", "x1", "y1"))
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError("Crop box needs x0, y0, x1, y1 between 0 and 1.") from exc
    x0, x1 = sorted((max(0.0, min(1.0, x0)), max(0.0, min(1.0, x1))))
    y0, y1 = sorted((max(0.0, min(1.0, y0)), max(0.0, min(1.0, y1))))
    if x1 - x0 < _MIN_CROP_FRACTION or y1 - y0 < _MIN_CROP_FRACTION:
        raise ValueError("The box is too small. Drag a bigger box around the drawing.")
    return x0, y0, x1, y1


def crop_original_page(paper_id: str, page: int, box: dict[str, Any]) -> dict[str, Any]:
    """Cut one box (page fractions) out of the original page as a PNG. Copies pixels only; nothing is redrawn."""
    path = _original_file(paper_id)
    if path is None:
        raise OriginalMissingError(ORIGINAL_MISSING_MESSAGE)
    x0, y0, x1, y1 = _crop_box(box)
    with fitz.open(str(path)) as doc:
        if not 1 <= page <= doc.page_count:
            raise ValueError(f"Page {page} is not in the original paper (1-{doc.page_count}).")
        pdf_page = doc[page - 1]
        rect = pdf_page.rect
        clip = fitz.Rect(
            rect.x0 + x0 * rect.width,
            rect.y0 + y0 * rect.height,
            rect.x0 + x1 * rect.width,
            rect.y0 + y1 * rect.height,
        )
        scale = (_CROP_DPI / 72.0) if path.suffix == ".pdf" else 1.0
        pix = pdf_page.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=clip, alpha=False)
        data = pix.tobytes("png")
    digest = hashlib.sha1(data).hexdigest()[:16]
    name = f"{_safe_id(paper_id)}-p{page}-{digest}.png"
    CROPS_DIR.mkdir(parents=True, exist_ok=True)
    dest = CROPS_DIR / name
    if not dest.exists():
        dest.write_bytes(data)
    place = f"page={page}&x0={x0:.4f}&y0={y0:.4f}&x1={x1:.4f}&y1={y1:.4f}"
    return {"name": name, "url": f"{CROP_URL_PREFIX}{name}?{place}", "width": pix.width, "height": pix.height}


def read_crop(name: str) -> bytes:
    if not _CROP_NAME_RE.fullmatch(str(name or "")):
        raise ValueError("Invalid picture name.")
    path = CROPS_DIR / name
    if not path.is_file():
        raise OriginalMissingError("That cropped picture is not on this computer.")
    return path.read_bytes()


_MAX_FIGURE_BOXES = 12
_MIN_FIGURE_W = 0.02
_MIN_FIGURE_H = 0.015
_MAX_FIGURE_AREA = 0.6
_INK_DPI = 100
_INK_LEVEL = 200
_INK_STEP = 0.004
_INK_REACH = 0.05
_INK_MARGIN = 0.008
_LABEL_WORD_RE = re.compile(r"^(?:\([A-Ha-h1-4]\)|Q\.?\d{1,3})$")

Box = tuple[float, float, float, float]


def figure_place(raw: Any) -> str:
    """'text', 'passage', or an option letter 'A'-'H'; '' if Gemini named something else."""
    s = re.sub(r"[\s()\[\]._:-]+", " ", str(raw or "")).strip().lower()
    s = re.sub(r"^option\s+", "", s)
    if s in ("text", "question", "question text", "stem"):
        return "text"
    if s in ("passage", "paragraph", "question stem"):
        return "passage"
    if re.fullmatch(r"[a-h]", s):
        return s.upper()
    return ""


def figure_box_fraction(box_2d: Any) -> Box | None:
    """Gemini's [ymin, xmin, ymax, xmax] (0-1000) as page fractions (x0, y0, x1, y1), or None if unusable."""
    try:
        values = [float(v) for v in box_2d]
    except (TypeError, ValueError):
        return None
    if len(values) != 4 or not all(v == v and abs(v) != float("inf") for v in values):
        return None
    scale = 1000.0 if max(values) > 1.5 else 1.0
    y0, x0, y1, x1 = (min(1.0, max(0.0, v / scale)) for v in values)
    x0, x1 = sorted((x0, x1))
    y0, y1 = sorted((y0, y1))
    if x1 - x0 < _MIN_FIGURE_W or y1 - y0 < _MIN_FIGURE_H or (x1 - x0) * (y1 - y0) > _MAX_FIGURE_AREA:
        return None
    return x0, y0, x1, y1


def snap_box_to_ink(ink: Any, box: Box, labels: list[Box] | None = None) -> Box | None:
    """Grow edges that cut through a drawing (a little), keep option letters / question numbers out,
    then trim white space. ink: 2-D bool array of the page. None if the box holds no drawing."""
    rows, cols = ink.shape
    x0, y0, x1, y1 = box

    def px(v: float, n: int) -> int:
        return int(round(min(1.0, max(0.0, v)) * n))

    def edge_has_ink(side: str) -> bool:
        c0, c1, r0, r1 = px(x0, cols), max(px(x1, cols), px(x0, cols) + 1), px(y0, rows), max(px(y1, rows), px(y0, rows) + 1)
        if side == "left":
            return bool(ink[r0:r1, min(c0, cols - 1)].any())
        if side == "right":
            return bool(ink[r0:r1, min(c1 - 1, cols - 1)].any())
        if side == "top":
            return bool(ink[min(r0, rows - 1), c0:c1].any())
        return bool(ink[min(r1 - 1, rows - 1), c0:c1].any())

    start = box
    for _ in range(int(_INK_REACH / _INK_STEP)):
        grew = False
        if edge_has_ink("left") and x0 > 0 and start[0] - x0 < _INK_REACH:
            x0, grew = max(0.0, x0 - _INK_STEP), True
        if edge_has_ink("right") and x1 < 1 and x1 - start[2] < _INK_REACH:
            x1, grew = min(1.0, x1 + _INK_STEP), True
        if edge_has_ink("top") and y0 > 0 and start[1] - y0 < _INK_REACH:
            y0, grew = max(0.0, y0 - _INK_STEP), True
        if edge_has_ink("bottom") and y1 < 1 and y1 - start[3] < _INK_REACH:
            y1, grew = min(1.0, y1 + _INK_STEP), True
        if not grew:
            break
    for lx0, ly0, lx1, ly1 in labels or []:
        overlaps = lx1 > x0 and lx0 < x1 and ly1 > y0 and ly0 < y1
        if overlaps and (lx0 + lx1) / 2 < x0 + 0.35 * (x1 - x0):
            x0 = max(x0, lx1 + 0.002)
    if x1 - x0 < _MIN_FIGURE_W:
        return None
    c0, c1, r0, r1 = px(x0, cols), px(x1, cols), px(y0, rows), px(y1, rows)
    region = ink[r0:r1, c0:c1]
    if region.size == 0 or not region.any():
        return None
    used_rows = region.any(axis=1).nonzero()[0]
    used_cols = region.any(axis=0).nonzero()[0]
    snapped = (
        max(0.0, (c0 + used_cols[0]) / cols - _INK_MARGIN),
        max(0.0, (r0 + used_rows[0]) / rows - _INK_MARGIN),
        min(1.0, (c0 + used_cols[-1] + 1) / cols + _INK_MARGIN),
        min(1.0, (r0 + used_rows[-1] + 1) / rows + _INK_MARGIN),
    )
    for lx0, ly0, lx1, ly1 in labels or []:
        if lx1 > snapped[0] and lx0 < snapped[2] and ly1 > snapped[1] and ly0 < snapped[3]:
            if (lx0 + lx1) / 2 < snapped[0] + 0.35 * (snapped[2] - snapped[0]):
                snapped = (max(snapped[0], lx1 + 0.002), *snapped[1:])
    if snapped[2] - snapped[0] < _MIN_CROP_FRACTION or snapped[3] - snapped[1] < _MIN_CROP_FRACTION:
        return None
    return tuple(float(v) for v in snapped)


def _page_ink_and_labels(path: Path, page: int) -> tuple[Any, list[Box]]:
    import numpy as np

    with fitz.open(str(path)) as doc:
        pdf_page = doc[page - 1]
        rect = pdf_page.rect
        scale = (_INK_DPI / 72.0) if path.suffix == ".pdf" else min(1.0, 1000.0 / max(rect.width, 1.0))
        pix = pdf_page.get_pixmap(matrix=fitz.Matrix(scale, scale), colorspace=fitz.csGRAY, alpha=False)
        gray = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.stride)[:, : pix.width]
        labels: list[Box] = []
        if path.suffix == ".pdf":
            w, h = rect.width or 1.0, rect.height or 1.0
            for word in pdf_page.get_text("words") or []:
                if _LABEL_WORD_RE.match(str(word[4])):
                    labels.append((word[0] / w, word[1] / h, word[2] / w, word[3] / h))
    return gray < _INK_LEVEL, labels


def crop_suggested_figures(paper_id: str, pages: list[int], figures: list[Any]) -> dict[str, Any]:
    """Cut Gemini's figure boxes out of the original page (pixels only), grouped by place.
    Boxes off the page, too small, too big, blank, or for an unknown place are skipped."""
    path = _original_file(paper_id)
    out: dict[str, Any] = {"text": [], "passage": [], "options": []}
    if path is None:
        return out
    with fitz.open(str(path)) as doc:
        page_count = doc.page_count
    allowed = [p for p in pages if 1 <= p <= page_count] or ([1] if path.suffix != ".pdf" else [])
    ink_cache: dict[int, tuple[Any, list[Box]]] = {}
    options: dict[int, list[str]] = {}
    for fig in figures[:_MAX_FIGURE_BOXES]:
        data = fig.model_dump() if hasattr(fig, "model_dump") else dict(fig or {})
        place = figure_place(data.get("place"))
        box = figure_box_fraction(data.get("box_2d"))
        try:
            page = int(data.get("page") or 0)
        except (TypeError, ValueError):
            page = 0
        if page not in allowed and 1 <= page <= len(allowed):
            page = allowed[page - 1]
        if not place or box is None or page not in allowed:
            logger.info("Compare figure box skipped: %s", data)
            continue
        if page not in ink_cache:
            ink_cache[page] = _page_ink_and_labels(path, page)
        ink, labels = ink_cache[page]
        snapped = snap_box_to_ink(ink, box, labels)
        if snapped is None:
            logger.info("Compare figure box holds no drawing: %s", data)
            continue
        try:
            crop = crop_original_page(paper_id, page, dict(zip(("x0", "y0", "x1", "y1"), snapped)))
        except (ValueError, OriginalMissingError) as exc:
            logger.warning("Compare figure crop failed (%s): %s", exc, data)
            continue
        if place in ("text", "passage"):
            out[place].append(crop["url"])
        else:
            options.setdefault(ord(place) - 65, []).append(crop["url"])
    if options:
        out["options"] = [options.get(i, []) for i in range(max(options) + 1)]
    return out


_OPTION_LABEL_RE = re.compile(r"^\s*(?:\(\s*[A-Za-z1-9]\s*\)|[A-Da-d][.)])\s*")


def _labelled_options(raw: Any) -> str:
    """The card hides a stored "(A) " prefix, so drop it before adding our own label."""
    options = [_OPTION_LABEL_RE.sub("", str(o or ""), count=1) for o in raw or []]
    return "\n".join(f"({chr(65 + i)}) {o}" for i, o in enumerate(options) if o.strip())


def _real_suggested_options(raw: list[Any]) -> list[str]:
    """A bare "(A)" is a drawing Gemini could not write; it must not blank the card's option."""
    options = [str(o or "") for o in raw or []]
    cleaned = [o if _OPTION_LABEL_RE.sub("", o, count=1).strip() else "" for o in options]
    return cleaned if any(cleaned) else []


_SMILES_RE = re.compile(r"<smiles>.*?</smiles>", re.IGNORECASE | re.DOTALL)
_RAW_PICTURE_RE = re.compile(r"\\includegraphics|!\[[^\]]*\]\(|/api/official-pyq/original/crops/", re.IGNORECASE)
_RAW_TEX_RE = re.compile(r"\$|\\[A-Za-z]{2,}")
# Same rule as officialPyqDrawnCheck.js. Lower case only: "OR" / "AND" / "NOR" alone are logic-gate options.
_CUT_WORD_RE = re.compile(r"(?<![A-Za-z])(and|or|nor)$")
_CODE_PAIR_COMMA_RE = re.compile(r"(?:\u2192|->)\s*[A-Z0-9]{1,4}\s*,$")


def _cut_off_tail(drawn: Any, comma: bool) -> str:
    t = re.sub(r"\s+", " ", str(drawn or "")).strip()
    word = _CUT_WORD_RE.search(t)
    if word and t[: word.start()].strip():
        return word.group(1)
    if re.search(r"\S\s*&$", t):
        return "&"
    if comma and re.search(r"\S\s*,$", t) and not _CODE_PAIR_COMMA_RE.search(t):
        return ","
    return ""


def _cut_off_problems(body: dict[str, Any]) -> list[str]:
    """Drawn options / question that stop on "and", "or", "," or "&": the rest is missing (2013 P2 Q31 A, D)."""
    out = []
    for i, opt in enumerate(body.get("drawn_options") or []):
        tail = _cut_off_tail(opt, True)
        if tail:
            out.append(f"option {chr(65 + i)} stops at \u201c{tail}\u201d \u2014 the rest of the option is missing")
    tail = _cut_off_tail(body.get("drawn_text"), False)
    if tail:
        out.append(f"the question stops at \u201c{tail}\u201d \u2014 the rest of the question is missing")
    return out


def _screen_problems(body: dict[str, Any]) -> list[str]:
    """What a student would see wrong on the card: problems the app already found,
    raw code left in the drawn text (complete pictures are drawn as [picture]),
    and options cut off after "and"."""
    found = [str(p).strip() for p in body.get("screen_problems") or [] if str(p or "").strip()][:4]
    drawn = "\n".join(
        [str(body.get("drawn_passage") or ""), str(body.get("drawn_text") or "")]
        + [str(o or "") for o in body.get("drawn_options") or []]
    )
    drawn = _SMILES_RE.sub(" ", drawn)
    if not found and _RAW_PICTURE_RE.search(drawn):
        found.append("a picture line is broken, so the card shows \\includegraphics code instead of the picture")
    elif not found and _RAW_TEX_RE.search(drawn):
        found.append("raw code or a formula that does not draw shows on the card")
    found.extend(p for p in _cut_off_problems(body) if p not in found)
    return found[:6]


def _compare_prompt(body: dict[str, Any], pages: list[int]) -> str:
    opts = _labelled_options(body.get("options")) or "(no options)"
    answer = str(body.get("answer_key") or "").strip() or "(none on card)"
    figure = "yes" if body.get("has_figure") else "no"
    passage = str(body.get("passage_text") or "").strip()
    subject = str(body.get("subject") or "").strip()
    page_note = (
        f"The images are page(s) {', '.join(str(p) for p in pages)} of the original paper, in that order."
        if pages
        else "The image is the original page (page 1)."
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
    problems = _screen_problems(body)
    problem_block = (
        "--- problems the app already found on the card as drawn ---\n"
        + "".join(f"- {p}\n" for p in problems)
        if problems
        else ""
    )
    drawn_rules = (
        "- Judge the card by what students SEE (the AS DRAWN text), not only the stored LaTeX. "
        "There a complete picture shows as [picture]. Raw code left in the drawn text "
        "(\\includegraphics, a picture address, $ signs, \\frac or other backslash commands, "
        "unmatched { }), text or a formula that stops mid-way, or a figure printed on the page "
        "that the card does not draw are all differences: verdict 'differs' even if the words "
        "match (kind other, missing_text or missing_figure).\n"
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
        "If no question with that number is printed there, find the question whose text matches "
        "the card. If it continues onto the next image, include that part.\n\n"
        "Compare it with this EXTRACTED CARD (LaTeX allowed):\n"
        f"{passage_block}"
        f"--- question text ---\n{body.get('card_text') or ''}\n"
        f"--- options ---\n{opts}\n"
        f"--- answer key on card ---\n{answer}\n"
        f"--- card has a figure --- {figure}\n"
        f"{drawn_block}"
        f"{problem_block}\n"
        "Rules:\n"
        f"{passage_rules}"
        f"{drawn_rules}"
        "- verdict 'matches' only if the card says the same thing as the page AND draws cleanly "
        "for students. Ignore LaTeX vs plain formatting that renders the same, line breaks, and "
        "the question-number prefix. If problems are listed above, the verdict is 'differs'.\n"
        "- Check that the question text and EVERY option are complete, word for word and formula "
        "for formula, against the page. An option that stops early - e.g. ends in 'and', 'or', ',' "
        "or '&' where the page prints a second formula or more words after it (page '[Cr(NH3)5Cl]Cl2 "
        "and [Cr(NH3)4Cl2]Cl', card '[Cr(NH3)5Cl]Cl2 and') - is missing_text: verdict 'differs', and "
        "give every option, complete and copied from the page, in suggested_options.\n"
        "- verdict 'differs' with a short list of concrete differences: missing text, wrong "
        "number/unit/symbol, wrong option, wrong alignment of reactions/tables/lists, missing "
        "figure, or extra_card if this card is not a real question on the page.\n"
        "- verdict 'not_found' if the question is not on these images.\n"
        "- suggested_text / suggested_options: the WHOLE corrected question text / every option "
        "(not only the changed part), keeping the card's LaTeX where it was right. Only text you "
        "can read on the page. Never invent. Leave a field empty if that part matches or you are "
        "unsure. Use $...$ for math. Inside math put ~ between a number and its unit and between "
        "unit words, e.g. $105~\\mathrm{kcal}~\\mathrm{mol}^{-1}$. A table is one plain "
        "\\begin{tabular} with & and \\\\ rows. Copy every \\includegraphics{...} and ![](...) line "
        "from the card into the suggested text or passage unchanged; never drop a picture "
        "(unless you give figure boxes for that part, see below).\n"
        "- If an option is a drawing (structure, graph, diagram) you cannot write as text, leave "
        "suggested_options empty and give figure boxes instead. Never return only the letters (A), (B), (C), (D).\n"
        "- figures: only when a difference is about drawings (a figure, chemical structure, graph, "
        "circuit or reaction scheme that the card is missing, draws broken or as wrong/incomplete "
        "SMILES, or splits into broken text). For each part that needs it - place 'text' (question), "
        "'passage', or option letter 'A'-'D' - box EVERY drawing of that part; the app cuts the boxes "
        "out of the page and they replace that part's old pictures and SMILES. page = the page number "
        "of the image it is on. box_2d = [ymin, xmin, ymax, xmax] scaled 0-1000, around the whole "
        "drawing with its printed labels (e.g. Q, R, S under structures) but never the option letter "
        "(A) or the question number. A reaction scheme (arrows, reagents, structures) is ONE box. "
        "Drawings side by side in one option may be one box. Order boxes as read. Leave figures empty "
        "if the card already draws every picture right.\n"
        "- With figure boxes for the question text or passage, write [figure] in suggested_text / "
        "suggested_passage where each boxed drawing goes (in box order) and leave out the words that "
        "are inside the drawing (reagents, labels).\n"
        "- Do not judge the answer key unless the page prints one.\n"
        "Return JSON only."
    )


_SHORT_ANSWER_NOTE = (
    "\n\nYour last answer was cut off. Answer again in under 300 words: verdict and at most 4 "
    "short differences. Leave suggested_text, suggested_options and suggested_passage empty; "
    "figures may stay."
)


def _compare_sync(parts: list[Any], prompt: str) -> CompareVerdict:
    """Long suggestions (SMILES, tables) can run past max_output_tokens; then ask once for a short answer."""
    for attempt in range(2):
        response = _generate(
            retry_timeout=True,
            model=COMPARE_MODEL,
            contents=[*parts, prompt if attempt == 0 else prompt + _SHORT_ANSWER_NOTE],
            config=types.GenerateContentConfig(
                max_output_tokens=_MAX_OUTPUT_TOKENS,
                response_mime_type="application/json",
                response_schema=CompareVerdict,
                thinking_config=types.ThinkingConfig(thinking_budget=0, include_thoughts=False),
                http_options=types.HttpOptions(timeout=_COMPARE_TIMEOUT_MS),
            ),
        )
        try:
            parsed = _parse_model_json(_response_text(response), CompareVerdict)
        except ValueError:
            if attempt == 0:
                logger.warning("Compare answer was cut off; asking again for a short answer")
                continue
            raise
        assert isinstance(parsed, CompareVerdict)
        return parsed
    raise RuntimeError("unreachable")


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
    differences = [d.model_dump() for d in verdict.differences][:8]
    problems = _screen_problems(body)
    if kind == "matches" and problems:
        kind = "differs"
        differences = [
            {"kind": "card_problem", "detail": f"The words match the original, but {p}."} for p in problems
        ]
    figures: dict[str, Any] = {"text": [], "passage": [], "options": []}
    if kind == "differs" and verdict.figures:
        figures = await asyncio.to_thread(crop_suggested_figures, paper_id, pages, verdict.figures)
    return {
        "verdict": kind,
        "text_matches": bool(problems) and all(d.get("kind") == "card_problem" for d in differences),
        "differences": differences,
        "suggested_text": verdict.suggested_text.strip() if kind == "differs" else "",
        "suggested_options": _real_suggested_options(verdict.suggested_options) if kind == "differs" else [],
        "suggested_passage": verdict.suggested_passage.strip() if kind == "differs" else "",
        "suggested_figures": figures,
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
