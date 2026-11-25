"""FIITJEE *N. / N. markers must locate the right original page (not instructions page 1)."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import fitz

import official_pyq_compare as opc


def check(name: str, ok: bool) -> None:
    print(f"{'ok' if ok else 'FAIL'} - {name}")
    if not ok:
        raise SystemExit(1)


# Synthetic FIITJEE-style booklet: instructions on p1, *1. on p2, *87. on p3.
doc = fitz.open()
p1 = doc.new_page()
p1.insert_text((72, 72), "1. The test is of 3 hours duration.\n2. This test paper consists of 90 questions.")
p2 = doc.new_page()
p2.insert_text((72, 72), "*1. Let e1 be the eccentricity of the hyperbola ellipse cord.")
p3 = doc.new_page()
p3.insert_text((72, 72), "*87. 1 mole of PbS is oxidized by X moles of O3.\n*90. The number of non-polar molecules.")
data = doc.tobytes()
doc.close()

opened = fitz.open(stream=data, filetype="pdf")
q1 = opc._text_layer_pages(opened, 1, "eccentricity of the hyperbola ellipse cord", 0, 1)
q87 = opc._text_layer_pages(opened, 87, "mole of PbS is oxidized by moles of O3", 0, 1)
q90 = opc._text_layer_pages(opened, 90, "number of non-polar molecules", 0, 1)
bare = opc._marker_pages_for_number(opened, 1)
opened.close()

check("Q1 skips instruction line and finds *1. on page 2", q1[:1] == [2])
check("Q87 finds *87. page", q87[:1] == [3])
check("Q90 finds *90. page", q90[:1] == [3])
check("marker list prefers starred starts", bare == [2])

print("\nAll FIITJEE locate tests passed")
