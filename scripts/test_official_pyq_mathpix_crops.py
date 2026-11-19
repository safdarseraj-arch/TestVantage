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

    # Question Bank uploads have no original PDF: the picture is downloaded while its link still loads.
    jpg = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 40, 20), False)
    jpg.set_rect(jpg.irect, (10, 20, 30))
    jpg_bytes = jpg.tobytes("jpg")
    asked: list[str] = []

    def fake_fetch(link: str) -> tuple[int, bytes]:
        asked.append(link)
        if "dead" in link:
            return 404, b""
        if "junk" in link:
            return 200, b"not a picture"
        return 200, jpg_bytes

    bank = LINK.replace("9deb824d", "aaaa1111").replace("http://", "https://")
    dead = LINK.replace("9deb824d", "dead2222")
    junk = LINK.replace("9deb824d", "junk3333")
    insecure = bank.replace("https://", "http://").replace("aaaa1111", "bbbb4444")
    kept = opc.keep_mathpix_pictures([bank, bank, dead, junk, insecure, "https://example.com/x.jpg"], fetch=fake_fetch)
    check("bank picture downloaded and kept; dead, junk and foreign links fail",
          set(kept["saved"]) == {bank, insecure} and set(kept["failed"]) == {dead, junk, "https://example.com/x.jpg"})
    check("only Mathpix links are fetched, over https, once each",
          all(a.startswith("https://cdn.mathpix.com/cropped/") for a in asked) and len(asked) == 4)
    local = opc.local_crop_for_mathpix(bank)
    check("the download is found as the link's local copy", local == kept["saved"][bank])
    stored = fitz.Pixmap(opc.read_crop(local[len(opc.CROP_URL_PREFIX):]))
    check("the kept copy is the same picture, as PNG", (stored.width, stored.height) == (40, 20)
          and stored.pixel(5, 5)[:3] == jpg.pixel(5, 5)[:3])
    asked.clear()
    again = opc.keep_mathpix_pictures([bank], fetch=fake_fetch)
    check("a link with a local copy is not downloaded again", again["kept"] == [bank] and not asked)

    # Pale hatch / stipple washes away; connected mid-gray bond strokes stay.
    hatch = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 32, 32), False)
    hatch.set_rect(hatch.irect, (230, 230, 230))
    hatch.set_rect(fitz.IRect(8, 8, 24, 24), (20, 20, 20))  # solid ink block
    hatch.set_rect(fitz.IRect(0, 28, 32, 30), (170, 170, 170))  # long pale bond stroke
    # Stipple hatch dots (FIITJEE stamp) — tiny components must vanish.
    for x, y in ((1, 1), (3, 2), (5, 1), (28, 3), (30, 5), (2, 14), (29, 14)):
        hatch.set_rect(fitz.IRect(x, y, x + 1, y + 1), (150, 150, 150))
    hatch.set_rect(fitz.IRect(26, 0, 28, 2), (208, 208, 208))
    washed = fitz.Pixmap(opc._picture_png(hatch.tobytes("png")))
    check(
        "watermark wash clears pale hatch before split",
        washed.pixel(0, 0)[:3] == (255, 255, 255) and washed.pixel(12, 12)[:3] == (20, 20, 20),
    )
    check(
        "watermark wash keeps pale bond / structure strokes",
        washed.pixel(10, 29)[:3] == (170, 170, 170),
    )
    check(
        "watermark wash clears mid-pale hatch away from ink",
        washed.pixel(27, 0)[:3] == (255, 255, 255),
    )
    check(
        "watermark wash clears stipple hatch dots",
        washed.pixel(1, 1)[:3] == (255, 255, 255) and washed.pixel(30, 5)[:3] == (255, 255, 255),
    )

    # Attach original: wash on save so See original / future crops never reintroduce hatch.
    stamped = fitz.open()
    stamped_page = stamped.new_page(width=200, height=200)
    # ~0.90 ≈ RGB 230 — pale hatch only; mid-gray fills are treated as ink and kept.
    stamped_page.draw_rect(fitz.Rect(0, 0, 200, 200), color=(0.90, 0.90, 0.90), fill=(0.90, 0.90, 0.90))
    stamped_page.insert_text((40, 100), "Q.1", fontsize=24, color=(0, 0, 0))
    stamped_bytes = stamped.tobytes()
    stamped.close()
    status = opc.save_original("opyq-wash-save", "hatch.pdf", stamped_bytes)
    check("save_original reports watermark_washed", status.get("watermark_washed") is True)
    raw_path = opc._raw_original_file("opyq-wash-save")
    view_path = opc._original_file("opyq-wash-save")
    check("raw upload kept beside washed view file", raw_path is not None and view_path is not None and raw_path != view_path)
    check("raw file still has the upload bytes", raw_path.read_bytes() == stamped_bytes)
    crop = opc.crop_original_page("opyq-wash-save", 1, {"x0": 0.1, "y0": 0.1, "x1": 0.9, "y1": 0.9})
    crop_pix = fitz.Pixmap(opc.read_crop(crop["name"]))
    # Light hatch fill should be gone on the washed source (and crop wash).
    corner = crop_pix.pixel(2, 2)[:3]
    check(
        "crop from saved original no longer shows light hatch",
        corner[0] >= 250 and corner[1] >= 250 and corner[2] >= 250,
    )

print("\nAll Mathpix crop tests passed")
