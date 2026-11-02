"""Dataclasses returned by the extractor.

``ExtractionResult`` is the public payload: Markdown first (``to_markdown``),
then the same data as JSON (``to_json`` / ``to_dict``).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

SCHEMA_VERSION = "1.0"

# Question types.
SINGLE_CORRECT = "single_correct"
MULTI_CORRECT = "multi_correct"
INTEGER = "integer"
NUMERICAL = "numerical"
MATCH_THE_COLUMN = "match_the_column"
COMPREHENSION_CHILD = "comprehension_child"
UNKNOWN = "unknown"

QUESTION_TYPES = (
    SINGLE_CORRECT,
    MULTI_CORRECT,
    INTEGER,
    NUMERICAL,
    MATCH_THE_COLUMN,
    COMPREHENSION_CHILD,
    UNKNOWN,
)


@dataclass
class MatchListRow:
    """One ``(P) ...`` / ``(1) ...`` row of a match-the-column question."""

    label: str
    text: str

    def to_dict(self) -> Dict[str, Any]:
        return {"label": self.label, "text": self.text}


@dataclass
class MatchingLists:
    """Both columns of a match-the-column question."""

    list_i_title: str = "List-I"
    list_ii_title: str = "List-II"
    list_i: List[MatchListRow] = field(default_factory=list)
    list_ii: List[MatchListRow] = field(default_factory=list)

    @property
    def is_complete(self) -> bool:
        """Hard rule: a match question needs BOTH lists or it is a half-question."""
        return len(self.list_i) >= 2 and len(self.list_ii) >= 2

    def to_dict(self) -> Dict[str, Any]:
        return {
            "list_i_title": self.list_i_title,
            "list_ii_title": self.list_ii_title,
            "list_i": [row.to_dict() for row in self.list_i],
            "list_ii": [row.to_dict() for row in self.list_ii],
            "is_complete": self.is_complete,
        }


@dataclass
class Question:
    """One real exam question. Never a passage, never two questions merged."""

    number: int = 0
    printed_number: Optional[int] = None
    stem: str = ""
    options: List[str] = field(default_factory=list)
    option_labels: List[str] = field(default_factory=list)
    figures: List[str] = field(default_factory=list)
    question_type: str = UNKNOWN
    passage_id: Optional[str] = None
    is_complete: bool = True
    issues: List[str] = field(default_factory=list)
    confidence: float = 0.0
    matching_lists: Optional[MatchingLists] = None
    source_type: str = UNKNOWN

    def add_issue(self, code: str, incomplete: bool = True) -> None:
        """Record a defect. Defects never trigger a guess, only a flag."""
        if code not in self.issues:
            self.issues.append(code)
        if incomplete:
            self.is_complete = False

    @property
    def filled_options(self) -> List[str]:
        return [opt for opt in self.options if str(opt).strip()]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "number": self.number,
            "printed_number": self.printed_number,
            "stem": self.stem,
            "options": list(self.options),
            "option_labels": list(self.option_labels),
            "figures": list(self.figures),
            "question_type": self.question_type,
            "passage_id": self.passage_id,
            "is_complete": self.is_complete,
            "issues": list(self.issues),
            "confidence": round(float(self.confidence), 3),
            "matching_lists": self.matching_lists.to_dict() if self.matching_lists else None,
            "source_type": self.source_type,
        }


@dataclass
class Passage:
    """A comprehension / paragraph block plus the questions that hang off it."""

    id: str
    text: str
    title: str = "Passage / Comprehension"
    question_numbers: List[int] = field(default_factory=list)
    figures: List[str] = field(default_factory=list)
    is_complete: bool = True
    issues: List[str] = field(default_factory=list)

    def add_issue(self, code: str, incomplete: bool = True) -> None:
        if code not in self.issues:
            self.issues.append(code)
        if incomplete:
            self.is_complete = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "text": self.text,
            "question_numbers": list(self.question_numbers),
            "figures": list(self.figures),
            "is_complete": self.is_complete,
            "issues": list(self.issues),
        }


@dataclass
class ExtractionResult:
    """Everything ``process_ocr_text`` produces."""

    questions: List[Question] = field(default_factory=list)
    passages: List[Passage] = field(default_factory=list)
    source_type: str = UNKNOWN
    source_type_detected: bool = False
    removed_noise: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    @property
    def is_empty(self) -> bool:
        return not self.questions

    def passage_by_id(self, passage_id) -> Optional[Passage]:
        for passage in self.passages:
            if passage.id == passage_id:
                return passage
        return None

    def stats(self) -> Dict[str, Any]:
        return {
            "question_count": len(self.questions),
            "passage_count": len(self.passages),
            "incomplete_count": sum(1 for q in self.questions if not q.is_complete),
            "with_figures": sum(1 for q in self.questions if q.figures),
            "removed_noise_lines": len(self.removed_noise),
            "mean_confidence": (
                round(sum(q.confidence for q in self.questions) / len(self.questions), 3)
                if self.questions
                else 0.0
            ),
        }

    def to_dict(self) -> Dict[str, Any]:
        return {
            "schema_version": SCHEMA_VERSION,
            "source_type": self.source_type,
            "source_type_detected": self.source_type_detected,
            "stats": self.stats(),
            "passages": [p.to_dict() for p in self.passages],
            "questions": [q.to_dict() for q in self.questions],
            "removed_noise": list(self.removed_noise),
            "warnings": list(self.warnings),
        }

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent, ensure_ascii=False)

    def to_markdown(self) -> str:
        from .render import MarkdownRenderer

        return MarkdownRenderer().render(self)
