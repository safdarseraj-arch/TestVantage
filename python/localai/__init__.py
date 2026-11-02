"""TestVantages local OCR question extraction.

Turns raw Mathpix / OCR text from Indian competitive exam material (JEE Main,
JEE Advanced, NEET papers, coaching books, photos of question sheets and
handwritten notes) into clean, structured questions.

Typical use::

    from localai import process_ocr_text

    result = process_ocr_text(raw_text, source_type="previous_year_paper")
    print(result.to_markdown())
    payload = result.to_dict()

Standard library only - no third-party dependency is required.
"""

from __future__ import annotations

from .cleaner import OcrCleaner
from .extractor import OcrQuestionExtractor, process_ocr_text
from .latexguard import LatexGuard
from .matching import looks_like_matching_list, parse_matching_lists
from .models import (
    ExtractionResult,
    MatchingLists,
    MatchListRow,
    Passage,
    Question,
    QUESTION_TYPES,
    SCHEMA_VERSION,
)
from .noise import NoiseFilter
from .options import OptionParser
from .passages import PassageDetector
from .profiles import (
    BOOK_PDF,
    HANDWRITTEN_IMAGE,
    PREVIOUS_YEAR_PAPER,
    QUESTION_IMAGE,
    SOURCE_TYPES,
    SourceProfile,
    detect_source_type,
    get_profile,
)
from .render import JsonRenderer, MarkdownRenderer
from .segmenter import QuestionSegmenter

__version__ = "1.0.0"

__all__ = [
    "BOOK_PDF",
    "ExtractionResult",
    "HANDWRITTEN_IMAGE",
    "JsonRenderer",
    "LatexGuard",
    "MarkdownRenderer",
    "MatchListRow",
    "MatchingLists",
    "NoiseFilter",
    "OcrCleaner",
    "OcrQuestionExtractor",
    "OptionParser",
    "PREVIOUS_YEAR_PAPER",
    "Passage",
    "PassageDetector",
    "QUESTION_IMAGE",
    "QUESTION_TYPES",
    "Question",
    "QuestionSegmenter",
    "SCHEMA_VERSION",
    "SOURCE_TYPES",
    "SourceProfile",
    "detect_source_type",
    "get_profile",
    "looks_like_matching_list",
    "parse_matching_lists",
    "process_ocr_text",
    "__version__",
]
