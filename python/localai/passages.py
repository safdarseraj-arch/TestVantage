"""Comprehension / passage detection.

Two signals are used:

*Explicit cues* - "Read the following passage and answer the questions",
"Paragraph", "Comprehension", "Directions (Q. 5 to 8)", "based on the above
passage".

*Structural* - one long prose block followed by several short numbered
questions, which is how most book PDFs print a comprehension set.

A passage is kept whole and its children are attached to it. A passage is
never emitted as a question.
"""

from __future__ import annotations

import re
from typing import List, Optional

from .models import Passage

PASSAGE_HEADER_RE = re.compile(
    r"(?m)^[ \t]{0,6}(?:\*{0,2})\s*"
    r"(?:PARAGRAPH|Paragraph|COMPREHENSION|Comprehension|PASSAGE|Passage)"
    r"\b[^\n]{0,80}$"
)
PASSAGE_CUE_RE = re.compile(
    r"(?m)^[ \t]{0,6}[^\n]{0,80}?\b(?:"
    r"read\s+the\s+(?:following\s+)?passage"
    r"|read\s+the\s+passage\s+given\s+below"
    r"|study\s+the\s+following\s+paragraph"
    r"|the\s+following\s+questions?\s+(?:are\s+)?based\s+on"
    r")\b[^\n]*$",
    re.IGNORECASE,
)
DIRECTIONS_RE = re.compile(
    r"(?m)^[ \t]{0,6}Directions?\s*\(?\s*(?:Q(?:uestions?)?\s*\.?\s*(?:Nos?\.?\s*)?)?"
    r"(\d{1,3})\s*(?:to|[-\u2013])\s*(\d{1,3})\s*\)?",
    re.IGNORECASE,
)
BASED_ON_PASSAGE_RE = re.compile(
    r"\b(?:based\s+on\s+the\s+above\s+passage|answer\s+the\s+questions?\s+"
    r"(?:that\s+follow|given\s+below|below))\b",
    re.IGNORECASE,
)
_COUNT_WORDS = {
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
}
_COUNT_RE = re.compile(
    r"\b(?:following|next|these)\s+(one|two|three|four|five|six|\d{1,2})\s+questions?\b",
    re.IGNORECASE,
)
_INSTRUCTION_NOISE_RE = re.compile(
    r"\b(?:maximum marks|marking scheme|full marks|negative marks|this section contains)\b",
    re.IGNORECASE,
)


def find_passage_starts(text: str) -> List[int]:
    """Character offsets where a passage block begins."""
    starts = set()
    for pattern in (PASSAGE_HEADER_RE, PASSAGE_CUE_RE, DIRECTIONS_RE):
        for match in pattern.finditer(text or ""):
            starts.add(match.start())
    return sorted(starts)


def explicit_child_range(text: str):
    """``Directions (Q. 5 to 8)`` -> ``(5, 8)``; otherwise ``None``."""
    match = DIRECTIONS_RE.search(text or "")
    if not match:
        return None
    first, last = int(match.group(1)), int(match.group(2))
    if 0 < first <= last:
        return first, last
    return None


def explicit_child_count(text: str) -> Optional[int]:
    """``... answer the following two questions`` -> ``2``."""
    match = _COUNT_RE.search(text or "")
    if not match:
        return None
    token = match.group(1).lower()
    if token.isdigit():
        value = int(token)
    else:
        value = _COUNT_WORDS.get(token, 0)
    return value if value > 0 else None


def looks_like_passage_prose(text: str, min_chars: int = 180) -> bool:
    """Structural test: a long, sentence-shaped block that is not instructions."""
    t = (text or "").strip()
    if len(t) < min_chars:
        return False
    if _INSTRUCTION_NOISE_RE.search(t):
        return False
    sentences = [s for s in re.split(r"(?<=[.!?])\s+", t) if len(s.strip()) > 20]
    if len(sentences) < 2:
        return False
    words = re.findall(r"[A-Za-z]{2,}", t)
    return len(words) >= 40


class PassageDetector:
    """Builds ``Passage`` records and links their child questions."""

    def __init__(self, profile=None):
        self.profile = profile

    def _new_passage(self, index: int, text: str) -> Passage:
        return Passage(id="p%d" % index, text=(text or "").strip())

    def build(self, blocks, preamble: str = ""):
        """Attach passage ids onto ``blocks`` (a list of ``Block``).

        Returns the list of ``Passage`` objects. ``blocks`` is mutated in
        place: each question block that belongs to a passage gets
        ``block.passage_id`` set.
        """
        passages: List[Passage] = []
        counter = 0
        current: Optional[Passage] = None
        remaining = 0
        wanted_range = None

        preamble_passage = self._preamble_passage(preamble, blocks)
        if preamble_passage is not None:
            counter += 1
            preamble_passage.id = "p%d" % counter
            passages.append(preamble_passage)
            current = preamble_passage
            remaining = self._remaining_for(preamble_passage.text)
            wanted_range = explicit_child_range(preamble_passage.text)

        for block in blocks:
            if block.kind == "passage":
                counter += 1
                passage = self._new_passage(counter, block.text)
                if not passage.text:
                    continue
                passages.append(passage)
                current = passage
                remaining = self._remaining_for(passage.text)
                wanted_range = explicit_child_range(passage.text)
                continue
            if block.kind != "question" or current is None:
                continue
            if wanted_range is not None and block.number is not None:
                if wanted_range[0] <= block.number <= wanted_range[1]:
                    block.passage_id = current.id
                    current.question_numbers.append(block.number)
                else:
                    current = None
                    wanted_range = None
                continue
            if remaining == 0:
                current = None
                continue
            block.passage_id = current.id
            if remaining > 0:
                remaining -= 1

        for passage in passages:
            if not passage.question_numbers:
                owned = [b for b in blocks if getattr(b, "passage_id", None) == passage.id]
                passage.question_numbers = [b.number for b in owned if b.number is not None]
            if not any(getattr(b, "passage_id", None) == passage.id for b in blocks):
                passage.add_issue("passage_without_questions")
        return passages

    def _remaining_for(self, text: str) -> int:
        """How many questions this passage owns; ``-1`` means "until the next"."""
        count = explicit_child_count(text)
        if count:
            return count
        return -1

    def _preamble_passage(self, preamble: str, blocks) -> Optional[Passage]:
        text = (preamble or "").strip()
        if not text:
            return None
        questions = [b for b in blocks if b.kind == "question"]
        if len(questions) < 2:
            return None
        explicit = bool(
            PASSAGE_HEADER_RE.search(text)
            or PASSAGE_CUE_RE.search(text)
            or DIRECTIONS_RE.search(text)
            or BASED_ON_PASSAGE_RE.search(text)
        )
        if explicit:
            return self._new_passage(0, text)
        if self.profile is not None and not getattr(self.profile, "structural_passage", True):
            return None
        if not looks_like_passage_prose(text):
            return None
        mean_child = sum(len(b.text) for b in questions) / len(questions)
        if mean_child >= len(text):
            return None
        return self._new_passage(0, text)
