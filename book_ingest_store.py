"""Book / question-bank PDFs kept on disk and handed out in page ranges.

A whole book is too big for one Mathpix read and for the browser's storage, so the file stays
here and the admin works through it one page range at a time. Each range is read and reviewed
with the same pipeline as an uploaded paper. Local only: PyMuPDF, no Gemini, no Mathpix.
"""

from __future__ import annotations

import hashlib
import json
import re
import threading
import time
from pathlib import Path
from typing import Any, BinaryIO

import fitz

_PROJECT_ROOT = Path(__file__).resolve().parent
BOOKS_DIR = _PROJECT_ROOT / "data" / "books"
MAX_BOOK_BYTES = 600 * 1024 * 1024
DEFAULT_RANGE_PAGES = 20
MAX_RANGE_PAGES = 40
_ID_RE = re.compile(r"^bk-[0-9a-f]{16}$")
_lock = threading.Lock()

_CHAPTER_RE = re.compile(r"^\s*(?:chapter|unit|lesson)\s*[-:#.]?\s*(\d{1,3}|[ivxlc]{1,6})\b", re.I)
_HEADING_SCAN_LINES = 8
_RANGE_STATUSES = {"new", "reading", "done", "skipped", "failed"}
_SOLUTION_SOURCES = {"book", "solutions"}
MAX_SOLUTION_BLOCK_CHARS = 200_000
MAX_SOLUTION_STORE_BYTES = 40 * 1024 * 1024


class BookNotFoundError(LookupError):
    pass


def _book_dir(book_id: str) -> Path:
    if not _ID_RE.match(str(book_id or "")):
        raise ValueError("Invalid book id.")
    return BOOKS_DIR / book_id


def _meta_path(book_id: str) -> Path:
    return _book_dir(book_id) / "book.json"


def _pdf_path(book_id: str) -> Path:
    return _book_dir(book_id) / "book.pdf"


def _solutions_path(book_id: str) -> Path:
    return _book_dir(book_id) / "solutions.json"


def _read_meta(book_id: str) -> dict[str, Any]:
    path = _meta_path(book_id)
    if not path.is_file():
        raise BookNotFoundError("Book not found. Upload it again.")
    return json.loads(path.read_text(encoding="utf-8"))


def _write_meta(meta: dict[str, Any]) -> None:
    path = _meta_path(meta["id"])
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(path)


def _clean_title(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()[:120]


def _toc_chapters(doc: fitz.Document) -> list[dict[str, Any]]:
    """Bookmarks of the PDF: the first level that cuts the book into chapter-sized parts
    (a level of a few huge 'Units' is passed over for the chapters under it)."""
    toc = [row for row in doc.get_toc(simple=True) if len(row) >= 3 and int(row[2]) >= 1]
    picked: list[list] = []
    for level in sorted({int(row[0]) for row in toc}):
        rows = [row for row in toc if int(row[0]) == level]
        if len(rows) < 2:
            continue
        picked = rows
        if doc.page_count / len(rows) <= 3 * DEFAULT_RANGE_PAGES:
            break
    return [{"title": _clean_title(row[1]), "page": int(row[2])} for row in picked]


def _heading_chapters(doc: fitz.Document) -> list[dict[str, Any]]:
    """'Chapter 5 …' / 'Unit 3' printed near the top of a page (books without bookmarks, with a text layer)."""
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index in range(doc.page_count):
        lines = [ln.strip() for ln in doc[index].get_text("text").splitlines() if ln.strip()][:_HEADING_SCAN_LINES]
        for i, line in enumerate(lines):
            m = _CHAPTER_RE.match(line)
            if not m:
                continue
            key = m.group(1).lower()
            if key in seen:
                break
            seen.add(key)
            title = line if len(line) > len(m.group(0)) + 2 or i + 1 >= len(lines) else f"{line} {lines[i + 1]}"
            out.append({"title": _clean_title(title), "page": index + 1})
            break
    return out if len(out) >= 2 else []


def propose_ranges(pages: int, chapters: list[dict[str, Any]], max_pages: int = DEFAULT_RANGE_PAGES) -> list[dict[str, Any]]:
    """Page ranges to read one at a time: each chapter, cut into pieces of at most max_pages."""
    max_pages = max(1, min(int(max_pages or DEFAULT_RANGE_PAGES), MAX_RANGE_PAGES))
    starts = sorted({c["page"]: c for c in chapters if 1 <= int(c["page"]) <= pages}.values(), key=lambda c: c["page"])
    blocks: list[tuple[int, int, str]] = []
    if starts and starts[0]["page"] > 1:
        blocks.append((1, starts[0]["page"] - 1, "Front pages"))
    for i, ch in enumerate(starts):
        end = starts[i + 1]["page"] - 1 if i + 1 < len(starts) else pages
        if end >= ch["page"]:
            blocks.append((ch["page"], end, ch["title"]))
    if not blocks:
        blocks = [(1, pages, "")]
    ranges: list[dict[str, Any]] = []
    for start, end, title in blocks:
        count = end - start + 1
        pieces = max(1, -(-count // max_pages))
        size = -(-count // pieces)
        for k in range(pieces):
            a = start + k * size
            b = min(end, a + size - 1)
            if a > b:
                continue
            label = title or f"Pages {a}-{b}"
            if pieces > 1 and title:
                label = f"{title} (part {k + 1} of {pieces})"
            ranges.append({"start": a, "end": b, "title": label, "chapter": title, "status": "new", "paperIds": []})
    return ranges


def _summary(meta: dict[str, Any]) -> dict[str, Any]:
    keys = ("id", "name", "fileName", "pages", "textLayer", "chapterSource", "chapters", "ranges", "role", "forBook", "solutionsBookId", "createdAt", "updatedAt")
    return {k: meta[k] for k in keys if k in meta}


def _read_outline(path: Path) -> tuple[int, bool, list[dict[str, Any]], str]:
    try:
        doc = fitz.open(path)
    except Exception as exc:  # noqa: BLE001 - a broken file is a plain message
        raise ValueError("This PDF could not be opened. Is it damaged or password-protected?") from exc
    with doc:
        if doc.needs_pass:
            raise ValueError("This PDF is password-protected. Remove the password and upload it again.")
        pages = doc.page_count
        if pages < 1:
            raise ValueError("This PDF has no pages.")
        sample = min(pages, 6)
        text_layer = sum(len(doc[i].get_text("text").strip()) for i in range(sample)) > 100 * sample
        chapters = _toc_chapters(doc)
        source = "bookmarks" if chapters else ""
        if not chapters and text_layer:
            chapters = _heading_chapters(doc)
            source = "headings" if chapters else ""
    return pages, text_layer, chapters, source


def _link_solutions(questions_id: str, solutions_id: str) -> None:
    """Call with the lock held. A book has at most one solutions PDF; a new one replaces the link."""
    book = _read_meta(questions_id)
    sol = _read_meta(solutions_id)
    if sol.get("role") != "solutions" and (sol.get("solutionsBookId") or any(r.get("status") == "done" for r in sol.get("ranges") or [])):
        raise ValueError(f"“{sol.get('name')}” is stored as a question book with pages already read. Upload the solutions PDF itself.")
    old = book.get("solutionsBookId")
    if old and old != solutions_id and _meta_path(old).is_file():
        prev = _read_meta(old)
        prev.pop("forBook", None)
        _write_meta(prev)
    now = int(time.time() * 1000)
    book["solutionsBookId"] = solutions_id
    book["updatedAt"] = now
    _write_meta(book)
    sol["role"] = "solutions"
    sol["forBook"] = questions_id
    sol["updatedAt"] = now
    _write_meta(sol)


def save_book(
    name: str,
    file_name: str,
    stream: BinaryIO,
    max_pages: int = DEFAULT_RANGE_PAGES,
    for_book: str | None = None,
) -> dict[str, Any]:
    """Store the PDF (same file → same book, progress kept) and propose page ranges.
    With `for_book` the PDF is that book's separate solutions PDF."""
    if for_book:
        parent = _read_meta(for_book)
        if parent.get("role") == "solutions":
            raise ValueError("That PDF is itself a solutions PDF. Open the question book first.")
    BOOKS_DIR.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256()
    tmp = BOOKS_DIR / f"upload-{time.time_ns()}.part"
    size = 0
    try:
        with tmp.open("wb") as out:
            while True:
                chunk = stream.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_BOOK_BYTES:
                    raise ValueError("The book file is over 600 MB. Split it into two files.")
                digest.update(chunk)
                out.write(chunk)
        with tmp.open("rb") as fh:
            if fh.read(5) != b"%PDF-":
                raise ValueError("Upload a PDF file for a book.")
        book_id = f"bk-{digest.hexdigest()[:16]}"
        if for_book and book_id == for_book:
            raise ValueError("This is the book itself. Upload the separate solutions PDF.")
        with _lock:
            folder = _book_dir(book_id)
            if _meta_path(book_id).is_file():
                tmp.unlink(missing_ok=True)
                meta = _read_meta(book_id)
                if name and _clean_title(name) != meta.get("name"):
                    meta["name"] = _clean_title(name)
                    meta["updatedAt"] = int(time.time() * 1000)
                    _write_meta(meta)
                if for_book:
                    _link_solutions(for_book, book_id)
                    meta = _read_meta(book_id)
                return {**_summary(meta), "existing": True}
            folder.mkdir(parents=True, exist_ok=True)
            tmp.replace(_pdf_path(book_id))
            try:
                pages, text_layer, chapters, source = _read_outline(_pdf_path(book_id))
            except Exception:
                _pdf_path(book_id).unlink(missing_ok=True)
                folder.rmdir()
                raise
            now = int(time.time() * 1000)
            meta = {
                "id": book_id,
                "name": _clean_title(name) or _clean_title(Path(file_name or "book.pdf").stem),
                "fileName": Path(file_name or "book.pdf").name,
                "bytes": size,
                "pages": pages,
                "textLayer": text_layer,
                "chapterSource": source,
                "chapters": chapters,
                "ranges": propose_ranges(pages, chapters, max_pages),
                "createdAt": now,
                "updatedAt": now,
            }
            _write_meta(meta)
            if for_book:
                _link_solutions(for_book, book_id)
                meta = _read_meta(book_id)
            return {**_summary(meta), "existing": False}
    finally:
        tmp.unlink(missing_ok=True)


def list_books() -> list[dict[str, Any]]:
    if not BOOKS_DIR.is_dir():
        return []
    out = []
    for folder in BOOKS_DIR.iterdir():
        if folder.is_dir() and _ID_RE.match(folder.name) and (folder / "book.json").is_file():
            try:
                out.append(_summary(_read_meta(folder.name)))
            except (OSError, ValueError, BookNotFoundError):
                continue
    return sorted(out, key=lambda b: -int(b.get("updatedAt") or 0))


def get_book(book_id: str) -> dict[str, Any]:
    return _summary(_read_meta(book_id))


def _clean_range(raw: dict[str, Any], pages: int) -> dict[str, Any]:
    start = int(raw.get("start") or 0)
    end = int(raw.get("end") or 0)
    if not (1 <= start <= end <= pages):
        raise ValueError(f"Page range {start}-{end} is outside the book (1-{pages}).")
    if end - start + 1 > MAX_RANGE_PAGES:
        raise ValueError(f"Pages {start}-{end} is more than {MAX_RANGE_PAGES} pages; cut it into smaller ranges.")
    status = str(raw.get("status") or "new")
    ids = [str(x)[:120] for x in (raw.get("paperIds") or []) if str(x).strip()][:200]
    return {
        "start": start,
        "end": end,
        "title": _clean_title(raw.get("title") or f"Pages {start}-{end}"),
        "chapter": _clean_title(raw.get("chapter") or ""),
        "status": status if status in _RANGE_STATUSES else "new",
        "paperIds": ids,
        **({"note": _clean_title(raw.get("note"))} if raw.get("note") else {}),
        **({"lastExercise": _clean_title(raw.get("lastExercise"))} if raw.get("lastExercise") else {}),
        **({"lastChapter": _clean_title(raw.get("lastChapter"))} if raw.get("lastChapter") else {}),
        **({"found": max(0, int(raw.get("found") or 0))} if raw.get("found") else {}),
    }


def save_ranges(book_id: str, ranges: list[dict[str, Any]], name: str | None = None) -> dict[str, Any]:
    """The admin's page ranges and how far each got. Ranges may not overlap."""
    with _lock:
        meta = _read_meta(book_id)
        cleaned = sorted((_clean_range(r, int(meta["pages"])) for r in ranges), key=lambda r: (r["start"], r["end"]))
        for prev, cur in zip(cleaned, cleaned[1:]):
            if cur["start"] <= prev["end"]:
                raise ValueError(f"Pages {prev['start']}-{prev['end']} and {cur['start']}-{cur['end']} overlap.")
        meta["ranges"] = cleaned
        if name:
            meta["name"] = _clean_title(name)
        meta["updatedAt"] = int(time.time() * 1000)
        _write_meta(meta)
        return _summary(meta)


def slice_pdf(book_id: str, start: int, end: int) -> bytes:
    """Pages start..end (1-based, inclusive) as a PDF of their own, copied unchanged."""
    meta = _read_meta(book_id)
    pages = int(meta["pages"])
    if not (1 <= start <= end <= pages):
        raise ValueError(f"Page range {start}-{end} is outside the book (1-{pages}).")
    if end - start + 1 > MAX_RANGE_PAGES:
        raise ValueError(f"Read at most {MAX_RANGE_PAGES} pages at a time.")
    with fitz.open(_pdf_path(book_id)) as src, fitz.open() as out:
        out.insert_pdf(src, from_page=start - 1, to_page=end - 1)
        return out.tobytes(garbage=3, deflate=True)


def _clean_block(raw: dict[str, Any]) -> dict[str, Any] | None:
    text = str(raw.get("text") or "").strip()[:MAX_SOLUTION_BLOCK_CHARS]
    if not text:
        return None
    return {
        "title": _clean_title(raw.get("title")),
        "chapter": _clean_title(raw.get("chapter")),
        "key": re.sub(r"[^a-z0-9]", "", str(raw.get("key") or "").lower())[:80],
        **({"continued": True} if raw.get("continued") else {}),
        "text": text,
    }


def get_solution_blocks(book_id: str) -> list[dict[str, Any]]:
    """Answers / solutions read so far for a book: from its own later pages and from its solutions PDF."""
    _read_meta(book_id)
    path = _solutions_path(book_id)
    if not path.is_file():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    return [b for b in data.get("blocks") or [] if isinstance(b, dict)]


def save_solution_blocks(book_id: str, source: str, start: int, end: int, blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep the answer / solution blocks read from one page range (of the book or of its solutions
    PDF), replacing what that same range gave before, so they reach an exercise read later."""
    if source not in _SOLUTION_SOURCES:
        raise ValueError("Unknown solutions source.")
    start, end = int(start), int(end)
    if not (1 <= start <= end):
        raise ValueError(f"Page range {start}-{end} is not valid.")
    with _lock:
        meta = _read_meta(book_id)
        if meta.get("role") == "solutions":
            raise ValueError("Keep solutions on the question book, not on its solutions PDF.")
        kept = [
            b
            for b in get_solution_blocks(book_id)
            if not (b.get("source") == source and int(b.get("start") or 0) == start and int(b.get("end") or 0) == end)
        ]
        fresh = [{**c, "source": source, "start": start, "end": end} for c in (_clean_block(b) for b in blocks) if c]
        out = kept + fresh
        raw = json.dumps({"blocks": out}, ensure_ascii=False)
        if len(raw.encode("utf-8")) > MAX_SOLUTION_STORE_BYTES:
            raise ValueError("Too many solutions stored for this book. Remove the book and upload it again in two parts.")
        path = _solutions_path(book_id)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(raw, encoding="utf-8")
        tmp.replace(path)
        return out


def _remove_folder(book_id: str) -> None:
    folder = _book_dir(book_id)
    for child in folder.iterdir():
        child.unlink(missing_ok=True)
    folder.rmdir()


def delete_book(book_id: str) -> None:
    """Remove the stored PDF. A question book takes its solutions PDF with it; removing a
    solutions PDF keeps the solutions already read from it on the book."""
    folder = _book_dir(book_id)
    with _lock:
        if not folder.is_dir():
            raise BookNotFoundError("Book not found.")
        meta = _read_meta(book_id)
        parent = meta.get("forBook")
        if parent and _meta_path(parent).is_file():
            book = _read_meta(parent)
            if book.get("solutionsBookId") == book_id:
                book.pop("solutionsBookId", None)
                _write_meta(book)
        sol = meta.get("solutionsBookId")
        if sol and _meta_path(sol).is_file() and _read_meta(sol).get("forBook") == book_id:
            _remove_folder(sol)
        _remove_folder(book_id)
