"""Mathpix picture links cut again from the original PDF (Mathpix links expire). No Gemini; temp files only.

Run: python scripts/test_official_pyq_mathpix_crops.py
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import fitz  # noqa: E402

import official_pyq_compare as opc  # noqa: E402


def check(name: str, ok: bool) -> None:
    print(f"{'ok' if ok else 'FAIL'} - {name}")
    if not ok:
        raise SystemExit(1)


LINK = "https://cdn.mathpix.com/cropped/9deb824d-a4c6-4632-840e-f96d868d182d-02.jpg?height=250&width=500&top_left_y=500&top_left_x=250"

check("link names page, box", opc._mathpix_box(LINK) == ("9deb824d-a4c6-4632-840e-f96d868d182d", 2, 250, 500, 500, 250))
check("escaped & and any order give the same key",
      opc._mathpix_key(LINK.replace("&", "\\&")) == opc._mathpix_key(LINK)
      == opc._mathpix_key(LINK.split("?")[0] + "?top_left_x=250&top_left_y=500&width=500&height=250"))
check("other links have no key", opc._mathpix_key("https://example.com/a-02.jpg?height=1") is None
      and opc._mathpix_key(LINK.replace("&top_left_x=250", "")) is None)

with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    opc.ORIGINALS_DIR = root / "originals"
    opc.CROPS_DIR = root / "crops"
    opc.MATHPIX_LINKS_FILE = opc.CROPS_DIR / "mathpix-links.json"
    opc.ORIGINALS_DIR.mkdir()
    doc = fitz.open()
    doc.new_page(width=595, height=842)
    page = doc.new_page(width=595, height=842)
    # Mathpix pixels are 250 DPI: the link's box (250,500)-(750,750) is (72,144)-(216,216) in points.
    page.draw_rect(fitz.Rect(72, 144, 216, 216), color=(0, 0, 0), fill=(0, 0, 0))
    doc.save(str(opc.ORIGINALS_DIR / "opyq-test.pdf"))
    doc.close()

    other_page = LINK.replace("-02.jpg", "-01.jpg")
    off_end = LINK.replace("-02.jpg", "-09.jpg")
    result = opc.crops_for_mathpix_links("opyq-test", [LINK, other_page, off_end, "https://example.com/x.png"])
    check("links on pages 1 and 2 are cut; page 9 and foreign links skipped",
          set(result["crops"]) == {LINK, other_page} and set(result["skipped"]) == {off_end, "https://example.com/x.png"})

    name = result["crops"][LINK].split("?")[0][len(opc.CROP_URL_PREFIX):]
    pix = fitz.Pixmap(opc.read_crop(name))
    check("crop is the box at 220 DPI", abs(pix.width - 440) <= 2 and abs(pix.height - 220) <= 2)
    centre = pix.pixel(pix.width // 2, pix.height // 2)
    check("crop covers the drawing on page 2 (1-based)", centre[:3] == (0, 0, 0))
    blank = fitz.Pixmap(opc.read_crop(result["crops"][other_page].split("?")[0][len(opc.CROP_URL_PREFIX):]))
    check("same box on page 1 is blank", blank.pixel(blank.width // 2, blank.height // 2)[:3] == (255, 255, 255))

    check("local copy found for the link as displayed", opc.local_crop_for_mathpix(LINK.replace("&", "&amp;")) == result["crops"][LINK])
    check("unknown link has no local copy", opc.local_crop_for_mathpix(LINK.replace("500&top", "501&top")) is None)
    (opc.CROPS_DIR / name).unlink()
    check("deleted crop file is not served", opc.local_crop_for_mathpix(LINK) is None)

    try:
        opc.crops_for_mathpix_links("opyq-none", [LINK])
        check("paper without original is refused", False)
    except opc.OriginalMissingError:
        check("paper without original is refused", True)

print("\nAll Mathpix crop tests passed")
