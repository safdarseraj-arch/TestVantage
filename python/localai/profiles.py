"""Per-source tuning profiles and auto-detection.

Each upload route feeds the pipeline very different noise:

``previous_year_paper``
    JEE / NEET sittings: SECTION headers, marking-scheme bullets, printed
    answer keys, page furniture. Numbering is reliable.
``book_pdf``
    Chapter and exercise headings, running publisher headers, a trailing
    "Solutions" / "Answers" section.
``question_image``
    A photograph of one or a few questions. Numbering may be absent.
``handwritten_image``
    Noisiest OCR: garbage character runs, single-character lines, loose or
    missing numbering, lower confidence overall.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

PREVIOUS_YEAR_PAPER = "previous_year_paper"
BOOK_PDF = "book_pdf"
QUESTION_IMAGE = "question_image"
HANDWRITTEN_IMAGE = "handwritten_image"

SOURCE_TYPES = (PREVIOUS_YEAR_PAPER, BOOK_PDF, QUESTION_IMAGE, HANDWRITTEN_IMAGE)


@dataclass(frozen=True)
class SourceProfile:
    """Knobs the cleaner / filter / segmenter read."""

    name: str
    base_confidence: float = 0.85
    #: Accept ``7 Something`` (no dot) and other sloppy question markers.
    loose_numbering: bool = False
    #: Drop low-signal character runs and single-character lines.
    drop_garbage_lines: bool = False
    #: Minimum fraction of word characters a plain-prose line must keep.
    min_word_ratio: float = 0.30
    #: Shortest stem we will emit as a question.
    min_stem_chars: int = 12
    strip_section_instructions: bool = True
    strip_answer_keys: bool = True
    #: Book PDFs: cut everything after a trailing Solutions / Answers heading.
    strip_solution_sections: bool = False
    strip_chapter_headings: bool = False
    #: Allow "long prose then several short questions" to become a passage.
    structural_passage: bool = True
    #: Segment on blank lines when no numbering marker is found at all.
    fallback_blank_line_split: bool = False
    close_display_math: bool = True


PROFILES = {
    PREVIOUS_YEAR_PAPER: SourceProfile(
        name=PREVIOUS_YEAR_PAPER,
        base_confidence=0.90,
        min_stem_chars=12,
        strip_section_instructions=True,
        strip_answer_keys=True,
    ),
    BOOK_PDF: SourceProfile(
        name=BOOK_PDF,
        base_confidence=0.85,
        min_stem_chars=12,
        strip_solution_sections=True,
        strip_chapter_headings=True,
    ),
    QUESTION_IMAGE: SourceProfile(
        name=QUESTION_IMAGE,
        base_confidence=0.72,
        loose_numbering=True,
        drop_garbage_lines=True,
        min_word_ratio=0.25,
        min_stem_chars=8,
        structural_passage=False,
        fallback_blank_line_split=True,
    ),
    HANDWRITTEN_IMAGE: SourceProfile(
        name=HANDWRITTEN_IMAGE,
        base_confidence=0.55,
        loose_numbering=True,
        drop_garbage_lines=True,
        min_word_ratio=0.35,
        min_stem_chars=6,
        structural_passage=False,
        fallback_blank_line_split=True,
    ),
}

DEFAULT_PROFILE = PROFILES[PREVIOUS_YEAR_PAPER]

_PYQ_CUES = (
    r"this section contains",
    r"maximum marks",
    r"marking scheme",
    r"full marks\s*:",
    r"zero marks\s*:",
    r"negative marks\s*:",
    r"\bJEE\s*\(?\s*(?:main|advanced)",
    r"\bNEET\b",
    r"\\item\s*\[\s*Q",
    r"^\s*SECTION\s+[A-Z0-9]",
    r"only one of these four options",
    r"\bANSWER\s*KEY\b",
)

_BOOK_CUES = (
    r"^\s*CHAPTER\s+\d+",
    r"^\s*Chapter\s+\d+\b",
    r"^\s*EXERCISE\s*[-\u2013]?\s*[\dIVX.]+",
    r"^\s*Exercise\s+[\dIVX.]+",
    r"\bSOLVED\s+EXAMPLES?\b",
    r"^\s*(?:Hints?\s*(?:&|and)\s*)?Solutions?\s*$",
    r"\bPublications?\b",
    r"\bPublishers?\b",
    r"\bAll rights reserved\b",
)

_HANDWRITTEN_CUES = (
    r"[^\w\s]{5,}",
    r"^\s*[a-z]\s*$",
)


def _count(patterns, text: str) -> int:
    total = 0
    for pattern in patterns:
        total += len(re.findall(pattern, text, re.IGNORECASE | re.MULTILINE))
    return total


def _garbage_ratio(text: str) -> float:
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
    if not lines:
        return 0.0
    bad = 0
    for line in lines:
        if "$" in line or "\\" in line:
            continue
        letters = sum(1 for ch in line if ch.isalnum())
        if len(line) <= 2 or (len(line) >= 4 and letters / len(line) < 0.45):
            bad += 1
    return bad / len(lines)


def detect_source_type(text: str) -> str:
    """Best-effort guess when the caller gives no ``source_type`` hint."""
    t = text or ""
    if not t.strip():
        return QUESTION_IMAGE

    pyq = _count(_PYQ_CUES, t)
    book = _count(_BOOK_CUES, t)
    garbage = _garbage_ratio(t)
    latex_bits = len(re.findall(r"\\(?:frac|int|lim|begin|mathrm|mathbf|sqrt)\b", t))
    line_count = len([ln for ln in t.split("\n") if ln.strip()])

    if garbage >= 0.28 and latex_bits < 6:
        return HANDWRITTEN_IMAGE
    if pyq >= 2 and pyq >= book:
        return PREVIOUS_YEAR_PAPER
    if book >= 2:
        return BOOK_PDF
    if pyq >= 1 and line_count >= 12:
        return PREVIOUS_YEAR_PAPER
    if book >= 1 and line_count >= 12:
        return BOOK_PDF
    if line_count <= 14 and _count(_HANDWRITTEN_CUES, t) >= 2 and latex_bits < 4:
        return HANDWRITTEN_IMAGE
    if line_count <= 24:
        return QUESTION_IMAGE
    return PREVIOUS_YEAR_PAPER


def get_profile(source_type) -> SourceProfile:
    """Profile for ``source_type``; unknown names fall back to the PYQ profile."""
    key = str(source_type or "").strip().lower()
    return PROFILES.get(key, DEFAULT_PROFILE)
