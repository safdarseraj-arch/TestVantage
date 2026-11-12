"""Compare figure boxes: place names, box checks, and snapping to the drawing. No Gemini, no files.

Run: python scripts/test_official_pyq_figure_boxes.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np  # noqa: E402

from official_pyq_compare import figure_box_fraction, figure_place, snap_box_to_ink  # noqa: E402


def check(name: str, ok: bool) -> None:
    print(f"{'ok' if ok else 'FAIL'} - {name}")
    if not ok:
        raise SystemExit(1)


check("place names", [figure_place(p) for p in ("text", "Question", "passage", "A", "(b)", "option C", "d.", "graph")]
      == ["text", "text", "passage", "A", "B", "C", "D", ""])

check("0-1000 box becomes page fractions", figure_box_fraction([100, 200, 300, 600]) == (0.2, 0.1, 0.6, 0.3))
check("swapped corners are sorted", figure_box_fraction([300, 600, 100, 200]) == (0.2, 0.1, 0.6, 0.3))
check("box off the page is clamped", figure_box_fraction([-50, 900, 200, 1200]) == (0.9, 0.0, 1.0, 0.2))
check("tiny box rejected", figure_box_fraction([100, 100, 105, 110]) is None)
check("whole-page box rejected", figure_box_fraction([0, 0, 1000, 1000]) is None)
check("bad values rejected", figure_box_fraction([1, 2, 3]) is None and figure_box_fraction(["x", 1, 2, 3]) is None)

ink = np.zeros((1000, 800), dtype=bool)
ink[300:400, 200:500] = True
ink[380:395, 130:150] = True
snapped = snap_box_to_ink(ink, (0.28, 0.32, 0.59, 0.38))
check("box cutting through a drawing grows to cover it", snapped is not None
      and snapped[0] <= 0.25 and snapped[2] >= 0.625 and snapped[1] <= 0.30 and snapped[3] >= 0.40)
loose = snap_box_to_ink(ink, (0.10, 0.20, 0.80, 0.50))
check("loose box is trimmed to the ink", loose is not None and loose[1] > 0.28 and loose[3] < 0.42)
label = (130 / 800, 0.38, 150 / 800, 0.395)
no_label = snap_box_to_ink(ink, (0.15, 0.29, 0.65, 0.41), [label])
check("option letter on the left is kept out", no_label is not None and no_label[0] > 150 / 800)
check("blank box rejected", snap_box_to_ink(ink, (0.7, 0.7, 0.9, 0.9)) is None)

print("\nAll figure box tests passed")
