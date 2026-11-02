"""Stage 1: normalise raw Mathpix / OCR text.

Ported from ``src/utils/mathpixQuestionSplit.js`` (``sanitizeMathpixOcrText``,
``normalizeMathpixQuestionMarkers``), ``src/utils/parseMatchingListDisplay.js``
(``rewriteLatexItemLabels``, ``flattenTabularMatchLists``) and
``src/utils/sanitizeStemForDisplay.js``.

This stage only *normalises*. It never deletes a question, never invents math
and never rewrites ``r^{2} / 2`` into a fraction.
"""

from __future__ import annotations

import re

from .latexguard import normalize_frac_latex
from .media import normalize_broken_graphics, strip_figure_chrome

_TABULAR_BEGIN_RE = re.compile(
    r"\\(?:begin|text\s*\{\s*begin\s*\})\s*\{\s*tabular\s*\}(?:\s*\{[^}]*\})?",
    re.IGNORECASE,
)
_TABULAR_END_RE = re.compile(
    r"\\(?:end|text\s*\{\s*end\s*\})\s*\{\s*tabular\s*\}", re.IGNORECASE
)
_LIST_HEADER_CELL_RE = re.compile(
    r"^(?:\*{0,2}\s*)?(?:List|Column)\s*[-\u2013]?\s*(I{1,2})\s*(?:\*{0,2})?$", re.IGNORECASE
)


def _split_top_level(text: str, delimiter: str):
    """Split on ``&`` / ``\\\\`` / newline outside ``{}`` and nested environments."""
    parts = []
    cur = []
    i = 0
    brace = 0
    env = 0
    n = len(text)
    while i < n:
        if text.startswith("\\begin{", i):
            close = text.find("}", i + 7)
            name = text[i + 7 : close] if close > 0 else ""
            if name and name != "tabular":
                env += 1
            end = close + 1 if close > 0 else i + 7
            cur.append(text[i:end])
            i = end
            continue
        if text.startswith("\\end{", i):
            close = text.find("}", i + 5)
            env = max(0, env - 1)
            end = close + 1 if close > 0 else i + 5
            cur.append(text[i:end])
            i = end
            continue
        if text[i] == "\\" and i + 1 < n and text[i + 1] in "{}":
            cur.append(text[i : i + 2])
            i += 2
            continue
        if text[i] == "{":
            brace += 1
        elif text[i] == "}":
            brace = max(0, brace - 1)
        if brace == 0 and env == 0:
            if delimiter == "&" and text[i] == "&":
                parts.append("".join(cur))
                cur = []
                i += 1
                continue
            if delimiter == "\\\\" and text.startswith("\\\\", i):
                nxt = text[i + 2] if i + 2 < n else ""
                if not nxt.isalpha():
                    parts.append("".join(cur))
                    cur = []
                    i += 2
                    continue
            if delimiter == "\n" and text[i] == "\n":
                parts.append("".join(cur))
                cur = []
                i += 1
                continue
        cur.append(text[i])
        i += 1
    tail = "".join(cur)
    if tail.strip() or parts:
        parts.append(tail)
    return parts


class OcrCleaner:
    """Normalises whitespace, Mathpix artefacts and LaTeX list scaffolding."""

    def __init__(self, profile=None):
        self.profile = profile

    # -- public -----------------------------------------------------------
    def clean(self, raw: str) -> str:
        text = self.normalize_unicode(raw)
        if not text.strip():
            return ""
        text = normalize_broken_graphics(text)
        text = strip_figure_chrome(text)
        text = self.flatten_tabular_match_lists(text)
        text = self.rewrite_latex_scaffolding(text)
        text = normalize_frac_latex(text)
        text = self.normalize_dollars(text)
        text = self.normalize_question_markers(text)
        return self.collapse_whitespace(text)

    # -- steps ------------------------------------------------------------
    def normalize_unicode(self, raw) -> str:
        text = "" if raw is None else str(raw)
        text = text.lstrip("\ufeff")
        text = text.replace("\r\n", "\n").replace("\r", "\n")
        text = text.replace("\u0000", "").replace("\ufffd", "")
        text = text.replace("\f", "\n--- page ---\n")
        text = text.replace("\u00a0", " ")
        # `\mathbf{R}is` -> `\mathbf{R} is`
        text = re.sub(r"(\\[A-Za-z]+(?:\s*\{[^{}]*\})+)([A-Za-z])", r"\1 \2", text)
        return text

    def rewrite_latex_scaffolding(self, text: str) -> str:
        """``\\section*{..}``, ``itemize`` and ``\\item[..]`` become plain lines."""
        s = text
        s = re.sub(r"\\captionsetup\{[^}]*\}", " ", s, flags=re.IGNORECASE)
        s = re.sub(r"\\section\*?\s*\{\s*(List\s*-?\s*I{1,2})\s*\}", r"\n\1\n", s, flags=re.IGNORECASE)
        s = re.sub(r"\\(?:sub){0,2}section\*?\s*\{([^{}]*)\}", r"\n\1\n", s)
        s = re.sub(r"\\begin\{(?:itemize|enumerate)\}", "\n", s, flags=re.IGNORECASE)
        s = re.sub(r"\\end\{(?:itemize|enumerate)\}", "\n", s, flags=re.IGNORECASE)
        # `\item[Q.] 17` and `\item[Q.17]` -> `Q. 17`
        s = re.sub(r"\\item\s*\[\s*Q\s*\.?\s*\]\s*(\d{1,3})\b", r"\n\nQ. \1 ", s, flags=re.IGNORECASE)
        s = re.sub(r"\\item\s*\[\s*Q\s*\.?\s*(\d{1,3})\s*\]", r"\n\nQ. \1 ", s, flags=re.IGNORECASE)
        # `\item[(P)]` / `\item[A.]` keep their list label.
        s = re.sub(
            r"\\item\s*\[\s*\(?\s*([PQRSTA-D1-9])\s*\)?\s*[.:]?\s*\]",
            lambda m: "\n(%s) " % m.group(1).upper(),
            s,
        )
        s = re.sub(r"\\item\s*\[\s*-\s*\]", "\n- ", s)
        s = re.sub(r"\\item\s*\[[^\]]*\]", "\n", s)
        s = re.sub(r"\\item\b", "\n", s)
        s = re.sub(r"\\(?:hline|centering|raggedright|raggedleft|textwidth)\b", " ", s)
        s = re.sub(r"\\textbf\s*\{([^{}]*)\}", r"\1", s)
        return s

    def normalize_dollars(self, text: str) -> str:
        """Un-smash OCR ``$`` damage without ever removing a needed delimiter."""
        s = text
        if "$" not in s:
            return s
        # A lone `$` on its own line is OCR debris, not a delimiter.
        s = re.sub(r"^[ \t]*\$[ \t]*$", "", s, flags=re.MULTILINE)
        # `$$\mathrm{H}_{2}O$` -- double-open, single-close chemistry caption.
        s = re.sub(r"\$\$(\s*\\(?:mathrm|ce|text)\b[^$]{0,160})\$(?!\$)", r"$\1$", s)
        # `$\mathrm{Ca}=40$$ ]` -- single-open, double-close.
        s = re.sub(r"(?<!\$)\$([^$\n]{2,160})\$\$(?=\s*[\];,]|\s*$)", r"$\1$", s)
        s = re.sub(r"\$\s+\$", " ", s)
        return s

    def normalize_question_markers(self, text: str) -> str:
        """Put every printed question marker at the start of its own line."""
        s = text
        # A `Q. 17` glued mid-line starts a new question -- give it its own line.
        # `Directions (Q. 5 to 8)` is a cross-reference, so never break after `(`.
        s = re.sub(r"(?<![A-Za-z0-9\n(])(Q\s*\.\s*\d{1,3})(?=[\s.):])", r"\n\1", s)
        # `Q . 17` / `Q 17` / `Q17` at line start all normalise to `Q.17`.
        s = re.sub(r"(?m)^[ \t]*Q\s*\.\s*(\d{1,3})", r"Q.\1", s)
        s = re.sub(r"(?m)^[ \t]*Q\s*(\d{1,3})(?=[\s.):])", r"Q.\1", s)
        return s

    def collapse_whitespace(self, text: str) -> str:
        s = re.sub(r"[ \t]+", " ", text)
        s = re.sub(r"[ \t]+\n", "\n", s)
        s = re.sub(r"\n[ \t]+", "\n", s)
        # `\item[(P)]` rewriting leaves a blank line before every list row.
        s = re.sub(r"\n{2,}(?=\(\s*[A-D1-9PQRST]\s*\)[ \t])", "\n", s)
        s = re.sub(r"\n{3,}", "\n\n", s)
        return s.strip()

    # -- tabular ----------------------------------------------------------
    def flatten_tabular_match_lists(self, text: str) -> str:
        """Turn a List-I / List-II ``\\begin{tabular}`` dump into two labelled lists."""
        s = (text or "").replace("\r\n", "\n")
        if not s.strip():
            return s
        s = re.sub(r"\\text\s*\{\s*begin\s*\}\s*\{\s*tabular\s*\}", r"\\begin{tabular}", s, flags=re.IGNORECASE)
        s = re.sub(r"\\text\s*\{\s*end\s*\}\s*\{\s*tabular\s*\}", r"\\end{tabular}", s, flags=re.IGNORECASE)
        begin = _TABULAR_BEGIN_RE.search(s)
        if not begin:
            return s
        rest = s[begin.end() :]
        end = _TABULAR_END_RE.search(rest)
        if end:
            body = rest[: end.start()]
            after = rest[end.end() :]
        else:
            body = rest
            after = ""
        intro = s[: begin.start()].strip()

        rows = _split_top_level(body, "\\\\")
        if len(rows) < 3:
            by_line = [r for r in _split_top_level(body, "\n") if r.strip()]
            if len(by_line) > len(rows):
                rows = by_line

        list_i, list_ii = [], []
        column_titles = False
        for row in rows:
            cols = [self._clean_cell(c) for c in _split_top_level(row, "&")]
            if not cols:
                continue
            left = cols[0] if cols else ""
            right = " ".join(c for c in cols[1:] if c).strip()
            if _LIST_HEADER_CELL_RE.match(left) and "column" in left.lower():
                column_titles = True
            if _LIST_HEADER_CELL_RE.match(right) and "column" in right.lower():
                column_titles = True
            if left and not _LIST_HEADER_CELL_RE.match(left):
                (list_ii if self._cell_side(left, "left", left) == "II" else list_i).append(left)
            if right and not _LIST_HEADER_CELL_RE.match(right):
                (list_i if self._cell_side(right, "right", left) == "I" else list_ii).append(right)

        labelled = any(re.search(r"\(\s*[PQRSABCD]\s*\)", p) for p in list_i) or any(
            re.search(r"\(\s*[1-5PQRS]\s*\)", p) for p in list_ii
        )
        headers = any(
            _LIST_HEADER_CELL_RE.match(self._clean_cell(c))
            for row in rows
            for c in _split_top_level(row, "&")
        )
        if not labelled and not headers:
            return s

        title_i = "Column I" if column_titles else "List-I"
        title_ii = "Column II" if column_titles else "List-II"
        chunks = [intro]
        if list_i:
            chunks.append("%s\n%s" % (title_i, "\n".join(list_i)))
        if list_ii:
            chunks.append("%s\n%s" % (title_ii, "\n".join(list_ii)))
        tail = (after or "").strip()
        if tail:
            chunks.append(tail)
        return "\n\n".join(c for c in chunks if c).strip()

    def _clean_cell(self, cell: str) -> str:
        s = self.rewrite_latex_scaffolding(str(cell or ""))
        s = re.sub(r"\s+", " ", s)
        return s.strip()

    def _cell_side(self, cell: str, side: str, left_cell: str) -> str:
        t = str(cell or "").strip()
        if not t:
            return "I" if side == "left" else "II"
        if re.match(r"^\(\s*[1-5]\s*\)", t) and not re.match(r"^\(\s*[PQRSABCD]\s*\)", t, re.IGNORECASE):
            return "II"
        if re.match(r"^\(\s*[ABCD]\s*\)", t, re.IGNORECASE):
            return "I"
        if re.match(r"^\(\s*[PQRS]\s*\)", t, re.IGNORECASE):
            return "I" if side == "left" else "II"
        return "I" if side == "left" else "II"
