"""Stage 3: cut the paper into blocks - one block per printed question.

Marker collection follows ``collectMarkerStarts`` in
``src/utils/mathpixQuestionSplit.js`` and the boundary rules in
``OCR_STEM_BOUNDARY_RE`` / ``sliceUntilStemEnd`` from
``src/utils/extendTruncatedStem.js``.

House law: never split one question into two and never merge two questions
into one. Every cut point must be a printed marker or an explicit passage
header - prose alone is never a cut point.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List, Optional

from .noise import looks_like_answer_key_blob, looks_like_section_instruction
from .passages import find_passage_starts
from .profiles import DEFAULT_PROFILE

_Q_PREFIX_RE = re.compile(
    r"(?m)^[ \t]{0,6}Q(?:uestion)?\s*\.?\s*(?:No\.?\s*)?(\d{1,3})\s*[.):\-]?[ \t]*"
)
_N_PREFIX_RE = re.compile(r"(?m)^[ \t]{0,6}(\d{1,3})\s*[.)][ \t]+(?=\S)")
_N_LOOSE_RE = re.compile(r"(?m)^[ \t]{0,6}(\d{1,3})\s*[.):\-]?[ \t]+(?=[A-Za-z$\\(])")

_MARKER_STRIP_RE = re.compile(
    r"^\s*(?:Q(?:uestion)?\s*\.?\s*(?:No\.?\s*)?\d{1,3}|\d{1,3})\s*[.):\-]?[ \t]*"
)

_QUESTION_HINT_RE = re.compile(
    r"\b(?:which of the following|which one of the following|let \$|if \$|suppose"
    r"|consider the|probability that|is equal to|then find|then which|match each"
    r"|match the (?:column|list|following)|choose the correct|the value of)\b",
    re.IGNORECASE,
)
_IMPERATIVE_RE = re.compile(
    r"\b(?:find|calculate|evaluate|determine|prove|show that|compute|derive|state)\b",
    re.IGNORECASE,
)
_FIGURE_ONLY_RE = re.compile(
    r"^(?:\s|\\includegraphics\{[^}]*\}|<smiles>[\s\S]*?</smiles>)+$", re.IGNORECASE
)


@dataclass
class Block:
    """One segmented region of the paper."""

    kind: str  # "question" | "passage"
    text: str
    number: Optional[int] = None
    start: int = 0
    passage_id: Optional[str] = None
    issues: List[str] = field(default_factory=list)


def looks_like_question_block(text: str) -> bool:
    """Port of ``looksLikeQuestionBlock`` in ``bulkExtractClean.js``."""
    t = (text or "").strip()
    if len(t) < 16:
        return False
    if looks_like_answer_key_blob(t):
        return False
    if _FIGURE_ONLY_RE.match(t):
        return True
    if re.match(r"^\d{1,3}\s*[.)]\s+", t):
        return True
    if re.match(r"^Q(?:uestion)?\s*\.?\s*(?:No\.?\s*)?\d{1,3}\b", t, re.IGNORECASE):
        return True
    if len(re.findall(r"\(\s*[A-D]\s*\)", t)) >= 2:
        return True
    if _QUESTION_HINT_RE.search(t):
        return True
    if "?" in t and len(t) >= 24:
        return True
    if _IMPERATIVE_RE.search(t) and len(t) >= 40:
        return True
    return False


def strip_question_marker(text: str) -> str:
    return _MARKER_STRIP_RE.sub("", text or "", count=1).strip()


@dataclass
class _Candidate:
    start: int
    end: int
    number: int
    kind: str


class QuestionSegmenter:
    """Splits cleaned OCR into passage blocks and question blocks."""

    def __init__(self, profile=None):
        self.profile = profile or DEFAULT_PROFILE

    # -- public -----------------------------------------------------------
    def segment(self, text: str):
        """Return ``(preamble, blocks)``."""
        body = text or ""
        if not body.strip():
            return "", []

        markers = self._question_markers(body)
        passage_starts = [s for s in find_passage_starts(body)]

        if not markers:
            return self._fallback(body)

        cuts = [(m.start, "question", m) for m in markers]
        cuts += [(s, "passage", None) for s in passage_starts if not self._inside(s, markers)]
        cuts.sort(key=lambda item: item[0])

        preamble = body[: cuts[0][0]].strip() if cuts else body.strip()
        blocks: List[Block] = []
        for index, (start, kind, marker) in enumerate(cuts):
            stop = cuts[index + 1][0] if index + 1 < len(cuts) else len(body)
            chunk = body[start:stop].strip()
            if not chunk:
                continue
            if kind == "passage":
                blocks.append(Block(kind="passage", text=chunk, start=start))
                continue
            blocks.append(
                Block(
                    kind="question",
                    text=strip_question_marker(chunk),
                    number=marker.number,
                    start=start,
                )
            )
        return preamble, self._drop_junk_blocks(blocks)

    # -- markers ----------------------------------------------------------
    def _question_markers(self, text: str) -> List[_Candidate]:
        candidates = []
        seen = set()
        for match in _Q_PREFIX_RE.finditer(text):
            candidates.append(_Candidate(match.start(), match.end(), int(match.group(1)), "q"))
            seen.add(match.start())
        for match in _N_PREFIX_RE.finditer(text):
            if match.start() in seen:
                continue
            candidates.append(_Candidate(match.start(), match.end(), int(match.group(1)), "n"))
            seen.add(match.start())
        if self.profile.loose_numbering:
            for match in _N_LOOSE_RE.finditer(text):
                if match.start() in seen:
                    continue
                candidates.append(
                    _Candidate(match.start(), match.end(), int(match.group(1)), "loose")
                )
                seen.add(match.start())
        candidates.sort(key=lambda c: c.start)
        blocked = self._numeric_option_runs(text, candidates)
        return self._validate(candidates, blocked)

    def _validate(self, candidates, blocked):
        accepted: List[_Candidate] = []
        previous = None
        for candidate in candidates:
            if candidate.start in blocked:
                continue
            if previous is None:
                accepted.append(candidate)
                previous = candidate.number
                continue
            restart = candidate.number <= 2 and previous >= 3
            if candidate.number >= previous or restart:
                accepted.append(candidate)
                previous = candidate.number
        return accepted

    def _numeric_option_runs(self, text: str, candidates):
        """``1.``/``2.``/``3.``/``4.`` stacked under a question are options."""
        blocked = set()
        numeric = [c for c in candidates if c.kind != "q"]
        index = 0
        while index < len(numeric):
            if numeric[index].number != 1:
                index += 1
                continue
            run = [numeric[index]]
            expected = 2
            cursor = index + 1
            while cursor < len(numeric) and numeric[cursor].number == expected:
                run.append(numeric[cursor])
                expected += 1
                cursor += 1
            if len(run) >= 3 and self._run_is_optionish(text, run, candidates):
                for item in run:
                    blocked.add(item.start)
                index = cursor
                continue
            index += 1
        return blocked

    def _run_is_optionish(self, text: str, run, candidates) -> bool:
        span = text[run[0].start : run[-1].end + 160]
        if len(span) > 700:
            return False
        if "\n\n" in text[run[0].start : run[-1].start]:
            return False
        earlier = [c for c in candidates if c.start < run[0].start]
        return bool(earlier)

    def _inside(self, position: int, markers) -> bool:
        return any(marker.start <= position < marker.end for marker in markers)

    # -- fallback ---------------------------------------------------------
    def _fallback(self, text: str):
        chunks = [c.strip() for c in re.split(r"\n\s*\n", text) if c.strip()]
        blocks = []
        preamble_parts = []
        for chunk in chunks:
            if looks_like_question_block(chunk) and not looks_like_section_instruction(chunk):
                blocks.append(Block(kind="question", text=chunk, number=None, start=0))
            elif blocks:
                # Trailing prose belongs to the question it follows.
                blocks[-1].text = "%s\n%s" % (blocks[-1].text, chunk)
            else:
                preamble_parts.append(chunk)
        if not blocks:
            whole = text.strip()
            if looks_like_question_block(whole) and not looks_like_section_instruction(whole):
                blocks.append(Block(kind="question", text=whole, number=None, start=0))
                preamble_parts = []
        return "\n\n".join(preamble_parts).strip(), blocks

    # -- cleanup ----------------------------------------------------------
    def _drop_junk_blocks(self, blocks):
        kept = []
        for block in blocks:
            if block.kind == "passage":
                kept.append(block)
                continue
            body = block.text.strip()
            if not body:
                continue
            if looks_like_answer_key_blob(body):
                continue
            if looks_like_section_instruction(body) and not looks_like_question_block(body):
                continue
            kept.append(block)
        return kept
