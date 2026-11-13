"""Book PDFs on disk: page ranges from bookmarks / chapter headings, slices, saved progress. No AI.

Run: python scripts/test_book_ingest_store.py
"""

from __future__ import annotations

import io
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import fitz  # noqa: E402

import book_ingest_store as bis  # noqa: E402


def check(name: str, ok: bool) -> None:
    print(f"{'ok' if ok else 'FAIL'} - {name}")
    if not ok:
        raise SystemExit(1)


def make_pdf(pages: int, chapter_pages: dict[int, str], toc: list[list] | None = None) -> bytes:
    doc = fitz.open()
    for i in range(1, pages + 1):
        page = doc.new_page()
        lines = [chapter_pages[i]] if i in chapter_pages else []
        lines += [f"Body text for page {i}. " * 4 for _ in range(4)]
        page.insert_text((50, 60), "\n".join(lines), fontsize=10)
    if toc:
        doc.set_toc(toc)
    return doc.tobytes()


def raises(fn, text: str) -> bool:
    try:
        fn()
    except ValueError as exc:
        return text in str(exc)
    return False


tmp = Path(tempfile.mkdtemp(prefix="books-test-"))
bis.BOOKS_DIR = tmp

ranges = bis.propose_ranges(50, [], 20)
check("no outline: even slices of at most 20 pages", [(r["start"], r["end"]) for r in ranges] == [(1, 17), (18, 34), (35, 50)])

ranges = bis.propose_ranges(60, [{"title": "Kinematics", "page": 5}, {"title": "Laws of Motion", "page": 12}], 20)
check("chapters become ranges, front pages kept apart, long chapter cut in parts",
      [(r["start"], r["end"], r["title"]) for r in ranges] == [
          (1, 4, "Front pages"),
          (5, 11, "Kinematics"),
          (12, 28, "Laws of Motion (part 1 of 3)"),
          (29, 45, "Laws of Motion (part 2 of 3)"),
          (46, 60, "Laws of Motion (part 3 of 3)"),
      ])
check("each range remembers its chapter", ranges[2]["chapter"] == "Laws of Motion" and ranges[0]["status"] == "new")

toc_pdf = make_pdf(30, {}, [[1, "Part A", 1], [2, "Chapter 1 Units", 3], [2, "Chapter 2 Vectors", 14], [1, "Part B", 25]])
book = bis.save_book("Physics Book", "phys.pdf", io.BytesIO(toc_pdf), 20)
check("bookmarks read (top level with more than one entry)", book["chapterSource"] == "bookmarks"
      and [c["title"] for c in book["chapters"]] == ["Part A", "Part B"])
check("pages and text layer", book["pages"] == 30 and book["textLayer"] is True and book["existing"] is False)
again = bis.save_book("Physics Book (renamed)", "phys.pdf", io.BytesIO(toc_pdf), 20)
check("same file again keeps the same book and its progress", again["id"] == book["id"] and again["existing"] is True
      and again["name"] == "Physics Book (renamed)")

big_pdf = make_pdf(200, {}, [[1, "Unit 1", 1], [2, "Ch 1", 1], [2, "Ch 2", 40], [1, "Unit 2", 90], [2, "Ch 3", 90], [2, "Ch 4", 150]])
big = bis.save_book("Big", "big.pdf", io.BytesIO(big_pdf), 20)
check("huge units passed over for the chapters under them", [c["title"] for c in big["chapters"]] == ["Ch 1", "Ch 2", "Ch 3", "Ch 4"])
bis.delete_book(big["id"])

head_pdf = make_pdf(24, {1: "Chapter 1 Electrostatics", 9: "CHAPTER 2", 17: "Chapter 3: Current Electricity"})
hb = bis.save_book("", "electro.pdf", io.BytesIO(head_pdf), 20)
check("chapter headings read when there are no bookmarks", hb["chapterSource"] == "headings"
      and [c["page"] for c in hb["chapters"]] == [1, 9, 17] and hb["name"] == "electro")
check("heading line with no title takes the next line", hb["chapters"][1]["title"].startswith("CHAPTER 2 Body text"))

data = bis.slice_pdf(hb["id"], 9, 12)
with fitz.open(stream=data, filetype="pdf") as part:
    check("slice has exactly the asked pages", part.page_count == 4 and "page 9." in part[0].get_text())
check("slice outside the book refused", raises(lambda: bis.slice_pdf(hb["id"], 20, 30), "outside"))
bis.MAX_RANGE_PAGES = 10
check("slice too long refused", raises(lambda: bis.slice_pdf(book["id"], 1, 30), "at most"))
check("range too long refused", raises(lambda: bis.save_ranges(book["id"], [{"start": 1, "end": 30}]), "smaller ranges"))
bis.MAX_RANGE_PAGES = 40

saved = bis.save_ranges(hb["id"], [
    {"start": 9, "end": 16, "title": "Ch 2", "status": "done", "paperIds": ["opyq-1", "opyq-2"]},
    {"start": 1, "end": 8, "title": "Ch 1", "status": "weird"},
])
check("ranges saved sorted, unknown status reset", [(r["start"], r["status"]) for r in saved["ranges"]] == [(1, "new"), (9, "done")]
      and saved["ranges"][1]["paperIds"] == ["opyq-1", "opyq-2"])
check("overlapping ranges refused", raises(lambda: bis.save_ranges(hb["id"], [{"start": 1, "end": 9}, {"start": 9, "end": 12}]), "overlap"))
check("progress kept on disk", bis.get_book(hb["id"])["ranges"][1]["status"] == "done")
check("book list", {b["id"] for b in bis.list_books()} == {book["id"], hb["id"]})

check("not a PDF refused", raises(lambda: bis.save_book("x", "x.pdf", io.BytesIO(b"hello"), 20), "PDF"))
check("bad id refused", raises(lambda: bis.get_book("../etc"), "Invalid"))
bis.delete_book(hb["id"])
check("delete removes the book", {b["id"] for b in bis.list_books()} == {book["id"]})
check("no upload leftovers", not list(tmp.glob("*.part")))
print("all book store checks passed")
