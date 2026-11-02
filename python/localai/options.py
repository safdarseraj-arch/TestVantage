"""Stage 4: split an MCQ option block off the stem.

Marker detection is ported from ``src/utils/mcqOptionMarkers.js``
(``isFunctionStyleParen``, ``isMcqOptionBlockStart``, ``findOptionsBlockStart``)
and the junk-option rules from ``isGarbageInstructionOption`` /
``looksLikeMarkingSchemeOption`` in ``src/utils/bulkExtractClean.js``.

Nothing is ever invented: a missing ``(C)`` is reported as a gap, not filled.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List, Optional

UPPER_LABELS = ["A", "B", "C", "D"]
LOWER_LABELS = ["a", "b", "c", "d"]
DIGIT_LABELS = ["1", "2", "3", "4"]

_PAREN_LABEL_RE = re.compile(r"\(\s*([A-Da-d1-4])\s*\)")
_LINE_LABEL_RE = re.compile(r"(?m)^[ \t]{0,4}([A-Da-d1-4])\s*[.)][ \t]+(?=\S)")

_MARKING_SCHEME_OPTION_RE = re.compile(
    r"\bwill get\s*[+\-]?\d+\s*marks?\b"
    r"|\b(?:full|zero|negative|partial)\s+marks?\b"
    r"|\bchoosing ONLY\b",
    re.IGNORECASE,
)
_INSTRUCTION_OPTION_RE = re.compile(
    r"^(?:only one|one or more(?: than one)?|more than one|correct option|incorrect option)\b",
    re.IGNORECASE,
)
_FILLER_OPTION_RE = re.compile(
    r"^(?:and|or|the|a|an|is|are|to|of|in|for|on|at|by|with|from|as|if|not)$",
    re.IGNORECASE,
)


@dataclass
class ParsedOptions:
    """Stem with its option block removed, plus the options themselves."""

    stem: str = ""
    labels: List[str] = field(default_factory=list)
    options: List[str] = field(default_factory=list)
    issues: List[str] = field(default_factory=list)

    @property
    def count(self) -> int:
        return len([o for o in self.options if o.strip()])


def is_function_style_paren(text: str, index: int) -> bool:
    """``P(A)``, ``f(A)``, ``$(A)`` are maths, not an option marker."""
    if index <= 0:
        return False
    prev = text[index - 1]
    if prev.isspace():
        return False
    return bool(re.match(r"[A-Za-z0-9$\\]", prev))


def is_junk_option(text: str) -> bool:
    """Marking-scheme rows and instruction fragments are never answers."""
    t = (text or "").strip()
    if not t:
        return False
    if _MARKING_SCHEME_OPTION_RE.search(t) and len(t) < 200:
        return True
    if _INSTRUCTION_OPTION_RE.match(t):
        return True
    if _FILLER_OPTION_RE.match(t):
        return True
    if re.fullmatch(r"[,.\-\u2013\u2014&:;]+", t):
        return True
    return False


class OptionParser:
    """Finds the last genuine ``(A)..(D)`` / ``(1)..(4)`` / ``(a)..(d)`` run."""

    def __init__(self, profile=None):
        self.profile = profile

    # -- public -----------------------------------------------------------
    def parse(self, body: str, matching: bool = False) -> ParsedOptions:
        text = body or ""
        if not text.strip():
            return ParsedOptions(stem="")

        label_sets = [UPPER_LABELS, LOWER_LABELS]
        if not matching:
            label_sets.append(DIGIT_LABELS)

        run = self._best_paren_run(text, label_sets, matching)
        if run:
            return self._build(text, run)

        run = self._best_line_run(text, label_sets)
        if run:
            return self._build(text, run)
        return ParsedOptions(stem=text.strip())

    # -- internals --------------------------------------------------------
    def _paren_markers(self, text: str):
        markers = []
        for match in _PAREN_LABEL_RE.finditer(text):
            if is_function_style_paren(text, match.start()):
                continue
            markers.append((match.start(), match.end(), match.group(1)))
        return markers

    def _best_paren_run(self, text: str, label_sets, matching: bool):
        floor = 0
        if matching:
            # For a match question the answer row sits after both lists.
            for header in re.finditer(r"(?:List|Column)\s*[-\u2013]?\s*II\b", text, re.IGNORECASE):
                floor = header.end()
        markers = [m for m in self._paren_markers(text) if m[0] >= floor]
        return self._pick_run(markers, label_sets)

    def _best_line_run(self, text: str, label_sets):
        markers = [(m.start(), m.end(), m.group(1)) for m in _LINE_LABEL_RE.finditer(text)]
        return self._pick_run(markers, label_sets)

    def _pick_run(self, markers, label_sets):
        best = None
        for labels in label_sets:
            run = self._ascending_run(markers, labels)
            if not run:
                continue
            if best is None or len(run) > len(best) or (
                len(run) == len(best) and run[0][0] > best[0][0]
            ):
                best = run
        return best

    def _ascending_run(self, markers, labels):
        """Last run of markers whose labels ascend through ``labels``."""
        best = None
        for start_index, marker in enumerate(markers):
            if marker[2] != labels[0]:
                continue
            run = [marker]
            last = 0
            for candidate in markers[start_index + 1 :]:
                if candidate[2] not in labels:
                    continue
                position = labels.index(candidate[2])
                if position > last:
                    run.append(candidate)
                    last = position
            if len(run) >= 2:
                best = run
        return best

    def _build(self, text: str, run) -> ParsedOptions:
        stem = text[: run[0][0]].strip()
        labels = []
        options = []
        for index, marker in enumerate(run):
            end = run[index + 1][0] if index + 1 < len(run) else len(text)
            value = text[marker[1] : end].strip()
            value = re.sub(r"^[\s,;:.]+", "", value).strip()
            labels.append(marker[2].upper() if marker[2].isalpha() else marker[2])
            options.append(value)

        issues = []
        if all(is_junk_option(opt) for opt in options if opt):
            # The whole "option block" was a marking-scheme dump - keep the stem.
            return ParsedOptions(stem=text.strip(), issues=["marking_scheme_options_dropped"])

        expected = self._expected_labels(labels)
        for label in expected:
            if label not in labels:
                issues.append("missing_option_%s" % label)
        for index, value in enumerate(options):
            if not value:
                issues.append("empty_option_%s" % labels[index])
        if not stem and not any(options):
            return ParsedOptions(stem=text.strip())
        return ParsedOptions(stem=stem, labels=labels, options=options, issues=issues)

    def _expected_labels(self, labels):
        if not labels:
            return []
        for candidate in (UPPER_LABELS, LOWER_LABELS, DIGIT_LABELS):
            upper = [c.upper() if c.isalpha() else c for c in candidate]
            if labels[0] in upper:
                last = max(upper.index(label) for label in labels if label in upper)
                return upper[: last + 1]
        return []
