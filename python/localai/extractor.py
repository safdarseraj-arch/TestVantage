"""Orchestrator: raw Mathpix OCR text in, clean structured questions out.

Pipeline::

    OcrCleaner -> NoiseFilter -> QuestionSegmenter -> PassageDetector
               -> OptionParser / matching lists / figures / LatexGuard
               -> MarkdownRenderer + JsonRenderer

Standing project laws enforced here:

* Never invent content. Anything cut off is flagged, never guessed.
* Never split one question into two; never merge two into one.
* LaTeX survives byte-for-byte; ``$$`` is closed but never dropped.
* A figure stays on the question it was printed with.
* A match-the-column question needs both lists or it is flagged incomplete.
* No duplicate question numbers leave this module.
"""

from __future__ import annotations

import re
from typing import List, Optional

from .cleaner import OcrCleaner
from .latexguard import LatexGuard
from .matching import looks_like_matching_list, matching_issues, parse_matching_lists
from .media import extract_image_urls
from .models import (
    COMPREHENSION_CHILD,
    INTEGER,
    MATCH_THE_COLUMN,
    MULTI_CORRECT,
    NUMERICAL,
    SINGLE_CORRECT,
    UNKNOWN,
    ExtractionResult,
    Question,
)
from .noise import NoiseFilter
from .options import OptionParser
from .passages import PassageDetector
from .profiles import detect_source_type, get_profile
from .segmenter import QuestionSegmenter

_MULTI_CORRECT_RE = re.compile(
    r"\b(?:one or more than one|one or more of (?:these|the following)"
    r"|multiple correct|may be correct|all correct options?)\b",
    re.IGNORECASE,
)
_INTEGER_RE = re.compile(
    r"\b(?:non-?negative integer|single digit integer|integer (?:value|answer)"
    r"|is an integer|0\s*to\s*9)\b",
    re.IGNORECASE,
)
_NUMERICAL_RE = re.compile(
    r"\b(?:numerical value|correct(?:ed)?\s+(?:up\s+)?to\s+(?:the\s+)?"
    r"(?:second|two|2)\s+decimal)\b",
    re.IGNORECASE,
)
EMPTY_INPUT = "empty_input"
NO_QUESTIONS = "no_questions_detected"


def _fingerprint(text: str) -> str:
    folded = re.sub(r"\$+", "", text or "")
    folded = re.sub(r"\\[A-Za-z]+", " ", folded)
    folded = re.sub(r"\s+", " ", folded).strip().lower()
    return folded[:96]


def _richness(question: Question) -> int:
    return (
        len(question.stem)
        + 200 * len(question.filled_options)
        + 100 * len(question.figures)
        + (0 if question.is_complete else -500)
    )


class OcrQuestionExtractor:
    """Runs the whole pipeline for one ``source_type`` profile."""

    def __init__(self, source_type: Optional[str] = None):
        self.requested_source_type = source_type
        self.profile = get_profile(source_type)

    # -- public -----------------------------------------------------------
    def extract(self, raw_text: str) -> ExtractionResult:
        result = ExtractionResult()

        if not (raw_text or "").strip():
            result.source_type = self.requested_source_type or UNKNOWN
            result.warnings.append(EMPTY_INPUT)
            return result

        cleaner = OcrCleaner(self.profile)
        cleaned = cleaner.clean(raw_text)

        if self.requested_source_type:
            source_type = str(self.requested_source_type).strip().lower()
            detected = False
        else:
            source_type = detect_source_type(cleaned)
            detected = True
        self.profile = get_profile(source_type)
        result.source_type = source_type
        result.source_type_detected = detected

        if not cleaned.strip():
            result.warnings.append(EMPTY_INPUT)
            return result

        report = NoiseFilter(self.profile).apply(cleaned)
        result.removed_noise = report.removed
        body = report.text
        if not body.strip():
            result.warnings.append(NO_QUESTIONS)
            return result

        preamble, blocks = QuestionSegmenter(self.profile).segment(body)
        detector = PassageDetector(self.profile)
        passages = detector.build(blocks, preamble)

        guard = LatexGuard(close_display_math=self.profile.close_display_math)
        parser = OptionParser(self.profile)
        questions: List[Question] = []
        for block in blocks:
            if block.kind != "question":
                continue
            question = self._build_question(block, parser, guard, source_type)
            if question is not None:
                questions.append(question)

        questions = self._dedupe(questions)
        self._assign_numbers(questions)

        result.questions = questions
        result.passages = self._finalise_passages(passages, questions)
        if not questions:
            result.warnings.append(NO_QUESTIONS)
        return result

    # -- per question ------------------------------------------------------
    def _build_question(self, block, parser, guard, source_type) -> Optional[Question]:
        body = (block.text or "").strip()
        if not body:
            return None

        figures = extract_image_urls(body)
        is_match = looks_like_matching_list(body)
        parsed = parser.parse(body, matching=is_match)
        stem = parsed.stem or body

        if not stem.strip() and not figures:
            return None
        if len(stem.strip()) < self.profile.min_stem_chars and not figures and not parsed.count:
            return None

        stem, latex_issues = guard.guard(stem)

        question = Question(
            printed_number=block.number,
            stem=stem.strip(),
            options=list(parsed.options),
            option_labels=list(parsed.labels),
            figures=figures,
            passage_id=getattr(block, "passage_id", None),
            source_type=source_type,
        )

        for code in parsed.issues:
            question.add_issue(code, incomplete=code.startswith(("missing_", "empty_")))
        for code in latex_issues:
            question.add_issue(code, incomplete=True)

        if is_match:
            question.matching_lists = parse_matching_lists(body)
            for code in matching_issues(question.matching_lists):
                question.add_issue(code, incomplete=True)

        question.question_type = self._infer_type(question, is_match)
        question.confidence = self._score(question)
        return question

    def _infer_type(self, question: Question, is_match: bool) -> str:
        if is_match:
            return MATCH_THE_COLUMN
        if question.passage_id:
            return COMPREHENSION_CHILD
        stem = question.stem
        if _MULTI_CORRECT_RE.search(stem):
            return MULTI_CORRECT
        if _INTEGER_RE.search(stem):
            return INTEGER
        if _NUMERICAL_RE.search(stem):
            return NUMERICAL
        if len(question.filled_options) >= 2:
            return SINGLE_CORRECT
        return UNKNOWN

    def _score(self, question: Question) -> float:
        score = self.profile.base_confidence
        if question.printed_number is None:
            score -= 0.05
        if not question.is_complete:
            score -= 0.25
        if not question.filled_options and question.question_type in (SINGLE_CORRECT, UNKNOWN):
            score -= 0.10
        if len(question.stem) < 40 and not question.figures:
            score -= 0.08
        score -= 0.02 * len(question.issues)
        return max(0.05, min(0.99, round(score, 3)))

    # -- document level ----------------------------------------------------
    def _dedupe(self, questions: List[Question]) -> List[Question]:
        """Same printed number AND same stem -> keep the richer card."""
        kept: List[Question] = []
        index_by_key = {}
        for question in questions:
            key = (question.printed_number, _fingerprint(question.stem))
            if question.printed_number is None or key[1] == "":
                kept.append(question)
                continue
            previous = index_by_key.get(key)
            if previous is None:
                index_by_key[key] = len(kept)
                kept.append(question)
                continue
            if _richness(question) > _richness(kept[previous]):
                kept[previous] = question
        return kept

    def _assign_numbers(self, questions: List[Question]) -> None:
        printed = [q.printed_number for q in questions]
        usable = all(p is not None for p in printed) and len(set(printed)) == len(printed)
        for index, question in enumerate(questions, start=1):
            question.number = question.printed_number if usable else index

    def _finalise_passages(self, passages, questions):
        by_id = {}
        for question in questions:
            if question.passage_id:
                by_id.setdefault(question.passage_id, []).append(question.number)
        alive = []
        for passage in passages:
            passage.question_numbers = by_id.get(passage.id, [])
            if not passage.question_numbers:
                passage.add_issue("passage_without_questions")
                continue
            alive.append(passage)
        return alive


def process_ocr_text(raw_text: str, source_type: Optional[str] = None) -> ExtractionResult:
    """Main entry point.

    ``raw_text``
        Raw Mathpix / OCR markdown for a paper, a book page or a photo.
    ``source_type``
        One of ``previous_year_paper``, ``book_pdf``, ``question_image``,
        ``handwritten_image``. Auto-detected when omitted.

    Returns an :class:`~localai.models.ExtractionResult` exposing
    ``to_markdown()``, ``to_json()`` and ``to_dict()``. Empty or unusable
    input returns an empty result instead of raising.
    """
    return OcrQuestionExtractor(source_type).extract(raw_text)
