"""Match-the-column (List-I / List-II) structure.

Ported from ``src/utils/parseMatchingListDisplay.js``. House law: a
match-the-column question needs BOTH lists. When only one survives OCR the
question is flagged incomplete - a half-question is never emitted and a
missing row is never invented.
"""

from __future__ import annotations

import re
from typing import List, Optional

from .media import extract_image_urls
from .models import MatchingLists, MatchListRow

LIST_I_RE = re.compile(r"(?:List|Column)\s*[-\u2013]?\s*I(?!I)", re.IGNORECASE)
LIST_II_RE = re.compile(r"(?:List|Column)\s*[-\u2013]?\s*II\b", re.IGNORECASE)
MATCH_HINT_RE = re.compile(
    r"match\s+each\s+entry|match\s+(?:the\s+)?(?:column|list)|match\s+the\s+following"
    r"|(?:List|Column)\s*[-\u2013]?\s*I(?!I)",
    re.IGNORECASE,
)

LIST_I_LETTERS = ["P", "Q", "R", "S"]
LIST_I_ALT_LETTERS = ["A", "B", "C", "D"]
LIST_II_LETTERS = ["1", "2", "3", "4", "5"]
LIST_II_ALT_LETTERS = ["P", "Q", "R", "S", "T"]

MISSING_LIST_I = "matching_list_missing_list_i"
MISSING_LIST_II = "matching_list_missing_list_ii"


def _count_markers(text: str, letters) -> int:
    return sum(1 for letter in letters if re.search(r"\(\s*%s\s*\)" % letter, text))


def _is_prose_mention(text: str, start: int, end: int) -> bool:
    """``... entries in List-I contains ...`` is prose, not a column header."""
    before = text[max(0, start - 20) : start]
    after = text[end : end + 80]
    if re.match(r"^\s*contains\b", after, re.IGNORECASE):
        return True
    if re.match(r"^\s*with\s+(?:the\s+)?appropriate", after, re.IGNORECASE):
        return True
    if re.search(r"\bin\s*$", before, re.IGNORECASE):
        return not re.match(
            r"^\s*[.:]?\s*(?:\(\s*[APQR1]\s*\)|\\includegraphics|Titrate\s*:)",
            after,
            re.IGNORECASE,
        )
    return False


def _standalone_header(text: str, pattern):
    hit = None
    for match in pattern.finditer(text):
        if _is_prose_mention(text, match.start(), match.end()):
            continue
        if hit is None:
            hit = match
    return hit


def looks_like_matching_list(text: str) -> bool:
    """Port of ``looksLikeMatchingListStem``."""
    t = text or ""
    if not t.strip():
        return False
    pqrs = _count_markers(t, LIST_I_LETTERS)
    abcd = _count_markers(t, LIST_I_ALT_LETTERS)
    nums = _count_markers(t, ["1", "2", "3", "4"])
    has_header = bool(_standalone_header(t, LIST_I_RE))
    has_figures = bool(re.search(r"\\includegraphics|\\begin\{figure\}", t, re.IGNORECASE))
    has_titrate = bool(re.search(r"Titrate\s*:", t, re.IGNORECASE))

    if has_header and (pqrs >= 3 or abcd >= 3):
        return True
    if _standalone_header(t, LIST_I_RE) and _standalone_header(t, LIST_II_RE):
        if pqrs >= 2 or abcd >= 2 or nums >= 2:
            return True
    if MATCH_HINT_RE.search(t) and (pqrs >= 3 or abcd >= 3):
        return True
    if MATCH_HINT_RE.search(t) and (has_titrate or has_figures) and has_header:
        return True
    return False


def split_match_items(block: str, letters) -> List[MatchListRow]:
    """Split ``(P) ... (Q) ...`` rows, skipping labels inside inline maths."""
    text = block or ""
    hits = []
    for letter in letters:
        for match in re.finditer(r"\(\s*%s\s*\)" % re.escape(letter), text):
            before = text[: match.start()]
            if before.count("$") % 2 == 1 and not re.search(r"(?:^|\n)\s*$", before):
                continue
            hits.append((match.start(), match.end(), letter))
    hits.sort()
    # First occurrence of each label wins; later echoes are option rows.
    seen = {}
    for start, end, letter in hits:
        if letter not in seen:
            seen[letter] = (start, end, letter)
    ordered = sorted(seen.values())
    rows = []
    for index, (start, end, letter) in enumerate(ordered):
        stop = ordered[index + 1][0] if index + 1 < len(ordered) else len(text)
        body = text[end:stop]
        body = re.sub(
            r"(?:^|\n)\s*(?:List|Column)\s*[-\u2013]?\s*I{1,2}\b[\s\S]*$",
            "",
            body,
            flags=re.IGNORECASE,
        )
        body = re.sub(r"^\s*[:.\-\u2013]\s*", "", body).strip()
        if body:
            rows.append(MatchListRow(label="(%s)" % letter, text=body))
    return rows


def _rows_from_figures(block: str, letters) -> List[MatchListRow]:
    urls = extract_image_urls(block)
    rows = []
    for index, url in enumerate(urls):
        if index >= len(letters):
            break
        rows.append(
            MatchListRow(label="(%s)" % letters[index], text="\\includegraphics{%s}" % url)
        )
    return rows


def parse_matching_lists(text: str) -> Optional[MatchingLists]:
    """Return both columns, or whichever single column survived OCR."""
    raw = text or ""
    if not MATCH_HINT_RE.search(raw) and not LIST_II_RE.search(raw):
        return None

    head_i = _standalone_header(raw, LIST_I_RE)
    head_ii = _standalone_header(raw, LIST_II_RE)
    if head_i is None and head_ii is None:
        return None

    if head_i is not None and head_ii is not None and head_i.start() < head_ii.start():
        block_i = raw[head_i.end() : head_ii.start()]
        block_ii = raw[head_ii.end() :]
        title_source = head_i.group(0)
    elif head_i is not None:
        block_i = raw[head_i.end() :]
        block_ii = ""
        title_source = head_i.group(0)
    else:
        block_i = ""
        block_ii = raw[head_ii.end() :]
        title_source = head_ii.group(0)

    column_style = "column" in title_source.lower()
    title_i = "Column I" if column_style else "List-I"
    title_ii = "Column II" if column_style else "List-II"

    # The A-D answer row is not part of List-II.
    answer_at = re.search(r"(?:^|\n)\s*\(\s*A\s*\)\s", block_ii)
    if answer_at and answer_at.start() > 4:
        block_ii = block_ii[: answer_at.start()]

    letters_i = (
        LIST_I_LETTERS
        if _count_markers(block_i, LIST_I_LETTERS) >= _count_markers(block_i, LIST_I_ALT_LETTERS)
        else LIST_I_ALT_LETTERS
    )
    rows_i = split_match_items(block_i, letters_i)
    if len(rows_i) < 2:
        rows_i = _rows_from_figures(block_i, LIST_I_LETTERS) or rows_i

    letters_ii = (
        LIST_II_LETTERS
        if _count_markers(block_ii, ["1", "2", "3", "4"])
        >= _count_markers(block_ii, ["P", "Q", "R", "S"])
        else LIST_II_ALT_LETTERS
    )
    rows_ii = split_match_items(block_ii, letters_ii)
    if len(rows_ii) < 2:
        rows_ii = _rows_from_figures(block_ii, LIST_II_LETTERS) or rows_ii

    if not rows_i and not rows_ii:
        return None
    return MatchingLists(
        list_i_title=title_i,
        list_ii_title=title_ii,
        list_i=rows_i,
        list_ii=rows_ii,
    )


def matching_issues(lists: Optional[MatchingLists]):
    """Issue codes for a match question that lost one of its columns."""
    if lists is None:
        return [MISSING_LIST_I, MISSING_LIST_II]
    issues = []
    if len(lists.list_i) < 2:
        issues.append(MISSING_LIST_I)
    if len(lists.list_ii) < 2:
        issues.append(MISSING_LIST_II)
    return issues
