"""Stage 2: delete everything that is not a question.

The junk catalogue is ported from ``src/utils/bulkExtractClean.js``
(``looksLikePyqSectionInstructionStem``, ``looksLikeAnswerKeyMappingBlob``,
``stripPageBreakAndSectionGlue``, ``stripTrailingPyqSectionHeader``,
``stripAnswerKeySection``) and from ``isJunkOfficialPyqRow`` in
``src/utils/extendTruncatedStem.js``.

Safety rails, in priority order:

1. A line inside a ``$$ ... $$`` display block is never touched.
2. A line carrying a figure (``\\includegraphics`` / ``cdn.mathpix.com``) is
   never dropped - a drawing belongs to a question.
3. A line that starts a question or an option marker is never dropped.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List

from .profiles import DEFAULT_PROFILE

# ---------------------------------------------------------------- patterns

PAGE_NUMBER_RE = re.compile(
    r"^\s*(?:[-\u2013\u2014]\s*)?(?:Page\s*)?\d{1,3}(?:\s*(?:of|/)\s*\d{1,3})?"
    r"(?:\s*[-\u2013\u2014])?\s*(?:\|\s*P\s*a\s*g\s*e)?\s*$",
    re.IGNORECASE,
)
PAGE_BREAK_RE = re.compile(
    r"^\s*(?:-{2,}\s*page\s*-{2,}|\[?\s*page\s*break\s*\]?|<\s*page\s*\d*\s*>)\s*$",
    re.IGNORECASE,
)
SECTION_HEADER_RE = re.compile(
    r"^\s*(?:SECTION|PART|PAPER)\s*[-\u2013]?\s*[A-Z0-9IVX]+\b.*$",
    re.IGNORECASE,
)
SUBJECT_HEADER_RE = re.compile(
    r"^\s*(?:PHYSICS|CHEMISTRY|MATHEMATICS|MATHS|BIOLOGY|BOTANY|ZOOLOGY)"
    r"(?:\s*(?:SECTION|PART)\b.*)?\s*$",
    re.IGNORECASE,
)
SECTION_INSTRUCTION_RE = re.compile(
    r"\b(?:this section contains|maximum marks|marking scheme"
    r"|only one of these four options|one or more than one of these four"
    r"|matching list sets?|for each question,\s+(?:enter|choose)"
    r"|evaluated according to the following marking"
    r"|the answer to each question is a (?:numerical value|single digit integer)"
    r"|all questions are compulsory|use of calculator|do not write"
    r"|omr sheet|darken the bubble|read the instructions carefully)\b",
    re.IGNORECASE,
)
MARKING_SCHEME_RE = re.compile(
    r"^\s*(?:[-*\u2022]\s*)?(?:Full|Zero|Negative|Partial)\s+Marks?\s*[:\uff1a]",
    re.IGNORECASE,
)
MARKING_SCHEME_BODY_RE = re.compile(
    r"\b(?:will get\s*[+\-]?\d+\s*marks?|no negative marking"
    r"|marks will be awarded|choosing ONLY|unanswered)\b",
    re.IGNORECASE,
)
EXAM_METADATA_RE = re.compile(
    r"^\s*(?:"
    r"JEE\s*\(?\s*(?:Main|Advanced)\b.*"
    r"|NEET\s*(?:\(?\s*UG\s*\)?)?\s*[-\u2013]?\s*\d{4}.*"
    r"|Time\s*[:\-]\s*\d+.*"
    r"|Duration\s*[:\-].*"
    r"|Total\s+Marks\s*[:\-].*"
    r"|Test\s+Booklet\s+Code.*"
    r"|Roll\s+(?:No\.?|Number).*"
    r"|Candidate['\u2019]?s?\s+Name.*"
    r")\s*$",
    re.IGNORECASE,
)
WATERMARK_RE = re.compile(
    r"(?:space for rough work|rough work only|^\s*rough work\s*$"
    r"|downloaded from|all rights reserved|\u00a9\s*\d{4}|copyright"
    r"|do not open this (?:test )?booklet|scanned (?:with|by)"
    r"|t\.me/|telegram|join our channel"
    r"|www\.[a-z0-9-]+\.[a-z]{2,})",
    re.IGNORECASE,
)
PUBLISHER_RE = re.compile(
    r"\b(?:ALLEN|FIITJEE|Resonance|Aakash|Narayana|Bansal|Vibrant"
    r"|Arihant|Cengage|Pearson|Disha|MTG|S\.?\s*Chand|Wiley"
    r"|Publications?|Publishers?|Career\s+Point)\b"
)
ANSWER_KEY_HEADING_RE = re.compile(
    r"\b(?:answer\s*key|answers?\s*(?:&|and)\s*(?:hints?|solutions?)"
    r"|solution\s*key|hints?\s*(?:&|and)\s*answers?)\b",
    re.IGNORECASE,
)
ANSWER_KEY_ROW_RE = re.compile(
    r"^\s*(?:\d{1,3}\s*[.\):\-\u2013]\s*\(?\s*[A-Da-d]\s*\)?[\s,;.]*){3,}$"
)
ANSWER_KEY_SINGLE_RE = re.compile(
    r"^\s*\d{1,3}\s*[.\):\-\u2013]\s*\(?\s*[A-Da-d](?:\s*[,;/&]\s*[A-Da-d])*\s*\)?\s*$"
)
MATCH_KEY_ROW_RE = re.compile(
    r"^\s*(?:\(?\s*[PQRS]\s*\)?\s*[-\u2013\u2192>]+\s*\(?\s*[1-5]\s*\)?\s*[,;]?\s*){3,}$",
    re.IGNORECASE,
)
SOLUTION_SECTION_RE = re.compile(
    r"^\s*(?:ANSWERS?|SOLUTIONS?|ANSWER\s*KEY|Hints?\s*(?:&|and)\s*Solutions?"
    r"|Answers?\s*(?:&|and)\s*Explanations?)\s*:?\s*$",
    re.IGNORECASE,
)
CHAPTER_HEADING_RE = re.compile(
    r"^\s*(?:CHAPTER|Chapter|UNIT|Unit)\s+[\dIVX]+\b.*$"
)
EXERCISE_HEADING_RE = re.compile(
    r"^\s*(?:EXERCISE|Exercise|ASSIGNMENT|Assignment|PRACTICE\s+SHEET)"
    r"\s*[-\u2013]?\s*[\dIVX.]*\s*(?:\([^)]*\))?\s*$",
    re.IGNORECASE,
)
EXAMPLE_HEADING_RE = re.compile(
    r"^\s*(?:SOLVED\s+)?EXAMPLES?\s*[-\u2013:]?\s*\d*\s*$", re.IGNORECASE
)

QUESTION_MARKER_RE = re.compile(
    r"^\s*(?:Q(?:uestion)?\s*\.?\s*(?:No\.?\s*)?\d{1,3}\b|\d{1,3}\s*[.)]\s+\S)",
    re.IGNORECASE,
)
OPTION_MARKER_RE = re.compile(r"^\s*\(?\s*[A-Da-d1-9]\s*[\).]\s*\S")
LIST_ROW_RE = re.compile(r"^\s*\(\s*[PQRS1-5]\s*\)", re.IGNORECASE)
LIST_HEADER_RE = re.compile(r"^\s*(?:List|Column)\s*[-\u2013]?\s*I{1,2}\b", re.IGNORECASE)
MATH_HINT_RE = re.compile(r"[$\\]")
FIGURE_HINT_RE = re.compile(r"includegraphics|cdn\.mathpix|<smiles>", re.IGNORECASE)


@dataclass
class NoiseReport:
    """Filtered text plus a record of everything that was thrown away."""

    text: str = ""
    removed: List[str] = field(default_factory=list)

    def note(self, reason: str, line: str) -> None:
        snippet = line.strip()
        if len(snippet) > 120:
            snippet = snippet[:117] + "..."
        if snippet:
            self.removed.append("%s: %s" % (reason, snippet))


def looks_like_answer_key_blob(text: str) -> bool:
    """Port of ``looksLikeAnswerKeyMappingBlob`` - a printed key, not a stem."""
    t = (text or "").strip()
    if not t:
        return False
    if re.match(r"^the correct option is\b", t, re.IGNORECASE):
        return True
    arrows = len(
        re.findall(r"\(\s*[PQRS]\s*\)\s*(?:\u2192|->|-)+\s*\(?\s*\d\s*\)?", t, re.IGNORECASE)
    )
    if arrows >= 4 and not re.match(
        r"^\s*(?:\d{1,2}[.)]\s+)?(?:Let|If|Match|Which|Consider|Suppose|Given)\b", t, re.IGNORECASE
    ):
        return True
    return bool(ANSWER_KEY_ROW_RE.match(t) or MATCH_KEY_ROW_RE.match(t))


def looks_like_section_instruction(text: str) -> bool:
    """Port of ``looksLikePyqSectionInstructionStem`` (line / short-block form)."""
    t = (text or "").strip()
    if not t:
        return False
    if SECTION_INSTRUCTION_RE.search(t):
        return True
    if SECTION_HEADER_RE.match(t) and len(t) < 200:
        return True
    if re.search(
        r"\bcontains\s+(?:TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|\d+)\s*"
        r"(?:\(\d+\))?\s*(?:questions?|matching list)",
        t,
        re.IGNORECASE,
    ):
        return True
    return False


class NoiseFilter:
    """Strips junk lines and junk regions while protecting real content."""

    def __init__(self, profile=None):
        self.profile = profile or DEFAULT_PROFILE

    # -- public -----------------------------------------------------------
    def apply(self, text: str) -> NoiseReport:
        report = NoiseReport()
        if not (text or "").strip():
            return report
        body = text
        if self.profile.strip_answer_keys:
            body = self._cut_answer_key_section(body, report)
        if self.profile.strip_solution_sections:
            body = self._cut_solution_section(body, report)
        body = self._filter_lines(body, report)
        report.text = re.sub(r"\n{3,}", "\n\n", body).strip()
        return report

    # -- region cuts ------------------------------------------------------
    def _cut_answer_key_section(self, text: str, report: NoiseReport) -> str:
        heading = ANSWER_KEY_HEADING_RE.search(text)
        if heading and heading.start() > 80:
            report.note("answer_key_section", text[heading.start() : heading.start() + 90])
            return text[: heading.start()].rstrip()
        lines = text.split("\n")
        for index in range(len(lines)):
            window = lines[index : index + 12]
            hits = sum(
                1
                for line in window
                if ANSWER_KEY_SINGLE_RE.match(line.strip()) or ANSWER_KEY_ROW_RE.match(line.strip())
            )
            if hits >= 6 and index >= int(len(lines) * 0.35):
                report.note("answer_key_block", " / ".join(w.strip() for w in window[:3]))
                return "\n".join(lines[:index]).rstrip()
        return text

    def _cut_solution_section(self, text: str, report: NoiseReport) -> str:
        lines = text.split("\n")
        floor = int(len(lines) * 0.35)
        for index in range(floor, len(lines)):
            if SOLUTION_SECTION_RE.match(lines[index]):
                report.note("solutions_section", lines[index])
                return "\n".join(lines[:index]).rstrip()
        return text

    # -- line filter ------------------------------------------------------
    def _filter_lines(self, text: str, report: NoiseReport) -> str:
        lines = text.split("\n")
        repeats = self._repeated_header_lines(lines)
        kept = []
        in_display_math = False
        in_instruction_block = False
        for line in lines:
            stripped = line.strip()
            if in_display_math:
                kept.append(line)
                if stripped.count("$$") % 2 == 1:
                    in_display_math = False
                continue
            if stripped.count("$$") % 2 == 1:
                in_display_math = True
                kept.append(line)
                continue

            if not stripped:
                in_instruction_block = False
                kept.append(line)
                continue

            if self._is_protected(stripped):
                in_instruction_block = False
                kept.append(line)
                continue

            if in_instruction_block and self._continues_instruction(stripped):
                report.note("instruction_block", stripped)
                continue
            in_instruction_block = False

            reason = self._junk_reason(stripped, repeats)
            if reason:
                report.note(reason, stripped)
                if reason in ("section_instruction", "section_header"):
                    in_instruction_block = True
                continue
            kept.append(line)
        return "\n".join(kept)

    def _is_protected(self, line: str) -> bool:
        if FIGURE_HINT_RE.search(line):
            return True
        if LIST_ROW_RE.match(line) or LIST_HEADER_RE.match(line):
            return True
        if QUESTION_MARKER_RE.match(line) and not looks_like_answer_key_blob(line):
            return True
        if OPTION_MARKER_RE.match(line) and not looks_like_answer_key_blob(line):
            return True
        return False

    def _continues_instruction(self, line: str) -> bool:
        if MARKING_SCHEME_RE.match(line) or MARKING_SCHEME_BODY_RE.search(line):
            return True
        if SECTION_INSTRUCTION_RE.search(line):
            return True
        if line.startswith(("-", "\u2022", "*")) and len(line) < 200:
            return True
        return False

    def _junk_reason(self, line: str, repeats):
        profile = self.profile
        if PAGE_BREAK_RE.match(line):
            return "page_break"
        if PAGE_NUMBER_RE.match(line):
            return "page_number"
        if WATERMARK_RE.search(line):
            return "watermark"
        if EXAM_METADATA_RE.match(line):
            return "exam_metadata"
        if PUBLISHER_RE.search(line) and len(line) < 90 and not MATH_HINT_RE.search(line):
            return "publisher"
        if profile.strip_answer_keys and looks_like_answer_key_blob(line):
            return "answer_key"
        if MARKING_SCHEME_RE.match(line) or MARKING_SCHEME_BODY_RE.search(line):
            return "marking_scheme"
        if profile.strip_section_instructions:
            if SUBJECT_HEADER_RE.match(line):
                return "section_header"
            if SECTION_HEADER_RE.match(line) and len(line) < 200:
                return "section_header"
            if SECTION_INSTRUCTION_RE.search(line):
                return "section_instruction"
        if profile.strip_chapter_headings:
            if CHAPTER_HEADING_RE.match(line):
                return "chapter_heading"
            if EXERCISE_HEADING_RE.match(line):
                return "exercise_heading"
            if EXAMPLE_HEADING_RE.match(line):
                return "example_heading"
        if SOLUTION_SECTION_RE.match(line):
            return "solution_heading"
        if line in repeats:
            return "running_header"
        if profile.drop_garbage_lines and self._is_garbage(line):
            return "ocr_garbage"
        return None

    def _is_garbage(self, line: str) -> bool:
        """Low-signal OCR debris. Never fires on a line carrying math."""
        if MATH_HINT_RE.search(line) or FIGURE_HINT_RE.search(line):
            return False
        if len(line) <= 2:
            return True
        if re.fullmatch(r"[^\w\s]{2,}", line):
            return True
        if re.fullmatch(r"(.)\1{3,}", line):
            return True
        word_chars = sum(1 for ch in line if ch.isalnum())
        if len(line) >= 4 and word_chars / len(line) < self.profile.min_word_ratio:
            return True
        words = re.findall(r"[A-Za-z]+", line)
        if words and len(line) >= 6:
            voweless = [w for w in words if len(w) >= 3 and not re.search(r"[aeiouAEIOU]", w)]
            if len(voweless) == len(words):
                return True
        return False

    def _repeated_header_lines(self, lines):
        """Short, math-free lines printed on several pages are running headers."""
        counts = {}
        for raw in lines:
            line = raw.strip()
            if not line or len(line) > 70:
                continue
            if MATH_HINT_RE.search(line) or FIGURE_HINT_RE.search(line):
                continue
            if line.startswith("(") or QUESTION_MARKER_RE.match(line):
                continue
            if line.endswith(("?", ":")):
                continue
            if len(line.split()) > 10:
                continue
            counts[line] = counts.get(line, 0) + 1
        return {line for line, count in counts.items() if count >= 2}
