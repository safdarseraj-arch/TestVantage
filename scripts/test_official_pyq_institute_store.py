"""Institute solutions PDF kept beside the original paper; its Mathpix pictures are cut from it, never from the original.

No Gemini; temp files only.
Run: python scripts/test_official_pyq_institute_store.py
"""

from __future__ import annotations

import sys
import tempfile
import warnings
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import fitz  # noqa: E402

import official_pyq_compare as opc  # noqa: E402


def check(name: str, ok: bool) -> None:
    print(f"{'ok' if ok else 'FAIL'} - {name}")
    if not ok:
        raise SystemExit(1)


def raises(fn, text: str) -> bool:
    try:
        fn()
    except ValueError as exc:
        return text.lower() in str(exc).lower()
    return False


def pdf_with_box(pages: int, page_with_box: int) -> bytes:
    doc = fitz.open()
    for i in range(pages):
        page = doc.new_page(width=595, height=842)
        if i + 1 == page_with_box:
            page.draw_rect(fitz.Rect(72, 144, 216, 216), color=(0, 0, 0), fill=(0, 0, 0))
    data = doc.tobytes()
    doc.close()
    return data


INSTITUTE_LINK = "https://cdn.mathpix.com/cropped/1111aaaa-2222-3333-4444-555566667777-02.jpg?height=250&width=500&top_left_y=500&top_left_x=250"
ORIGINAL_LINK = "https://cdn.mathpix.com/cropped/9deb824d-a4c6-4632-840e-f96d868d182d-02.jpg?height=250&width=500&top_left_y=500&top_left_x=250"

with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    opc.ORIGINALS_DIR = root / "originals"
    opc.CROPS_DIR = root / "crops"
    opc.MATHPIX_LINKS_FILE = opc.CROPS_DIR / "mathpix-links.json"
    institute_pdf = pdf_with_box(3, 2)
    original_pdf = pdf_with_box(2, 1)

    check("no institute PDF yet", opc.institute_status("opyq-inst")["available"] is False)
    check("institute name is required", raises(lambda: opc.save_institute("opyq-inst", "a.pdf", "  ", institute_pdf), "institute name"))
    check("only a PDF is taken", raises(lambda: opc.save_institute("opyq-inst", "a.png", "Allen", b"\x89PNG...."), "PDF"))
    check("a broken PDF is refused", raises(lambda: opc.save_institute("opyq-inst", "a.pdf", "Allen", b"%PDF-1.4 broken"), "could not be opened"))

    status = opc.save_institute("opyq-inst", "allen-2024-p1.pdf", "  Allen   Kota ", institute_pdf)
    check("institute PDF stored with its name and pages",
          status == {"available": True, "institute": "Allen Kota", "file_name": "allen-2024-p1.pdf", "pages": 3})
    check("stored in its own slot, not as the original", opc._original_file("opyq-inst") is None
          and (opc.ORIGINALS_DIR / "institute" / "opyq-inst.pdf").is_file())

    try:
        opc.crops_for_mathpix_links("opyq-none", [INSTITUTE_LINK], institute=True)
        check("paper without an institute PDF is refused", False)
    except opc.OriginalMissingError as exc:
        check("paper without an institute PDF is refused", str(exc) == opc.INSTITUTE_MISSING_MESSAGE)

    cut = opc.crops_for_mathpix_links("opyq-inst", [INSTITUTE_LINK], institute=True)
    check("institute picture cut from the institute PDF", set(cut["crops"]) == {INSTITUTE_LINK} and not cut["skipped"])
    name = cut["crops"][INSTITUTE_LINK].split("?")[0][len(opc.CROP_URL_PREFIX):]
    check("crop file named apart from the original's crops", name.startswith("opyq-inst-institute-p2-"))
    pix = fitz.Pixmap(opc.read_crop(name))
    check("crop covers the drawing on institute page 2", pix.pixel(pix.width // 2, pix.height // 2)[:3] == (0, 0, 0))
    check("local copy found for the institute link", opc.local_crop_for_mathpix(INSTITUTE_LINK) == cut["crops"][INSTITUTE_LINK])

    opc.save_original("opyq-inst", "paper.pdf", original_pdf)
    again = opc.crops_for_mathpix_links("opyq-inst", [ORIGINAL_LINK, INSTITUTE_LINK])
    check("a cut from the original skips the institute's links",
          set(again["crops"]) == {ORIGINAL_LINK} and again["skipped"] == [INSTITUTE_LINK])
    check("the institute link keeps its institute crop", opc.local_crop_for_mathpix(INSTITUTE_LINK) == cut["crops"][INSTITUTE_LINK])

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        from fastapi.testclient import TestClient

        import main

    client = TestClient(main.app)
    res = client.get("/api/official-pyq/original/opyq-route/institute")
    check("GET status route: nothing stored", res.status_code == 200 and res.json()["available"] is False)
    res = client.post(
        "/api/official-pyq/original/opyq-route/institute",
        files={"file": ("resonance.pdf", institute_pdf, "application/pdf")},
        data={"institute": "Resonance"},
    )
    check("POST upload route stores the PDF", res.status_code == 200 and res.json()["institute"] == "Resonance")
    res = client.post(
        "/api/official-pyq/original/opyq-route/institute",
        files={"file": ("resonance.pdf", institute_pdf, "application/pdf")},
        data={"institute": " "},
    )
    check("upload without a name is a 400", res.status_code == 400)
    res = client.get("/api/official-pyq/original/opyq-route/institute")
    check("GET status route: stored", res.json()["available"] is True and res.json()["pages"] == 3)
    other = INSTITUTE_LINK.replace("1111aaaa", "3333cccc")
    res = client.post("/api/official-pyq/original/opyq-route/institute/mathpix-crops", json={"urls": [other]})
    check("crop route cuts from the institute PDF", res.status_code == 200 and set(res.json()["crops"]) == {other})
    res = client.post("/api/official-pyq/original/opyq-nothing/institute/mathpix-crops", json={"urls": [other]})
    check("crop route without an institute PDF says so",
          res.status_code == 404 and res.json()["detail"]["code"] == "institute_missing")

print("\nAll institute PDF store tests passed")
