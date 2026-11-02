"""LaTeX safety net for OCR question extraction.

Rules ported from ``src/utils/healTruncatedLatex.js`` and
``src/utils/sanitizeStemForDisplay.js``:

* Math is inspected, never rewritten. ``r^{2} / 2`` is never promoted to
  ``\\frac`` and a closed ``\\frac{5}{4}`` is never treated as damaged.
* ``$$`` is never dropped. An unclosed display block is closed at the end and
  the question is flagged incomplete so nothing is silently invented.
* Missing numerators / denominators / arguments are reported, never filled in.
"""

from __future__ import annotations

import re

# Issue codes emitted by this module.
INCOMPLETE_FRAC = "incomplete_frac"
UNCLOSED_DISPLAY_MATH = "unclosed_display_math"
UNCLOSED_INLINE_MATH = "unclosed_inline_math"
UNBALANCED_BRACES = "unbalanced_braces"
TRUNCATED_COMMAND = "truncated_latex_command"
STEM_CUT_OFF = "stem_cut_off"

MATH_ENVIRONMENTS = (
    "aligned",
    "array",
    "bmatrix",
    "cases",
    "matrix",
    "pmatrix",
    "tabular",
    "vmatrix",
)

_TRAILING_CUT_RE = re.compile(
    r"(?:\bThen\s*[:.]?|\bsuch that|\bwhere|\bgiven that|[-=\u2013])\s*$",
    re.IGNORECASE,
)
_ELLIPSIS_TAIL_RE = re.compile(r"/\s*(?:\u2026|\.{2,})\s*$")
_TRAILING_BACKSLASH_CMD_RE = re.compile(r"\\[A-Za-z]*\{[^{}]*$")


def read_brace_group(text: str, pos: int) -> int:
    """Index just past the ``{...}`` group that starts at ``pos`` (else ``-1``)."""
    if pos >= len(text) or text[pos] != "{":
        return -1
    depth = 1
    i = pos + 1
    while i < len(text) and depth > 0:
        ch = text[i]
        if ch == "\\":
            i += 2
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
        i += 1
    return i if depth == 0 else -1


def find_frac_expression(text: str, start: int):
    """Return ``(start, end)`` of a complete ``\\frac{..}{..}`` at ``start``."""
    if not text.startswith("\\frac", start):
        return None
    i = start + len("\\frac")
    while i < len(text) and text[i] in " \t":
        i += 1
    num_end = read_brace_group(text, i)
    if num_end < 0:
        return None
    i = num_end
    while i < len(text) and text[i] in " \t":
        i += 1
    den_end = read_brace_group(text, i)
    if den_end < 0:
        return None
    return (start, den_end)


def normalize_frac_latex(text: str) -> str:
    """Repair ``\\text{frac}`` / ``\\frac\\{..\\}`` damage without inventing math."""
    out = text or ""
    if not out:
        return out
    out = re.sub(r"\\backslash\\text\s*\{\s*frac\s*\}", r"\\frac", out, flags=re.IGNORECASE)
    out = re.sub(r"\\text\s*\{\s*frac\s*\}", r"\\frac", out, flags=re.IGNORECASE)
    out = re.sub(r"\\backslash\\frac\b", r"\\frac", out, flags=re.IGNORECASE)
    out = re.sub(r"\\frac\s*\\\{([^\\\n]*)\\\}\\\{([^\\\n]*)\\\}", r"\\frac{\1}{\2}", out)
    out = re.sub(r"\\frac\s*\\\{([^\\\n]*)\\\}\\\{", r"\\frac{\1}{", out)
    out = re.sub(r"\\frac\s*\\\{", r"\\frac{", out)
    return out


def has_incomplete_frac(text: str) -> bool:
    """True only for a ``\\frac`` that is missing a numerator or denominator."""
    t = normalize_frac_latex(text)
    if "\\frac" not in t:
        return False
    for match in re.finditer(r"\\frac", t):
        if find_frac_expression(t, match.start()) is None:
            return True
    return False


def _math_delimiter_state(text: str):
    """Walk ``$`` / ``$$`` runs and report which delimiter is still open."""
    i = 0
    n = len(text)
    in_display = False
    in_inline = False
    while i < n:
        if text[i] == "\\":
            i += 2
            continue
        if text.startswith("$$", i):
            if in_inline:
                in_inline = False
            in_display = not in_display
            i += 2
            continue
        if text[i] == "$":
            if not in_display:
                in_inline = not in_inline
            i += 1
            continue
        i += 1
    return in_display, in_inline


def has_unclosed_math(text: str) -> bool:
    display, inline = _math_delimiter_state(text or "")
    return display or inline


def brace_balance(text: str) -> int:
    """``open - close`` count for ``{}``, ignoring escaped braces."""
    depth = 0
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if ch == "\\":
            i += 2
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
        i += 1
    return depth


def unbalanced_environments(text: str):
    """Environment names opened more times than they are closed."""
    bad = []
    for env in MATH_ENVIRONMENTS:
        opened = len(re.findall(r"\\begin\{%s\}" % env, text))
        closed = len(re.findall(r"\\end\{%s\}" % env, text))
        if opened > closed:
            bad.append(env)
    return bad


def stem_looks_cut_off(text: str) -> bool:
    """Port of ``stemLooksCutOff`` - sentence or formula chopped by OCR."""
    t = (text or "").strip()
    if not t:
        return False
    if has_incomplete_frac(t):
        return True
    if _ELLIPSIS_TAIL_RE.search(t):
        return True
    if _TRAILING_BACKSLASH_CMD_RE.search(t):
        return True
    if len(t) < 2000 and _TRAILING_CUT_RE.search(t):
        return True
    return False


class LatexGuard:
    """Inspects (and minimally closes) LaTeX without inventing content."""

    def __init__(self, close_display_math: bool = True):
        self.close_display_math = close_display_math

    def inspect(self, text: str):
        """Return a list of issue codes for ``text``. Never mutates."""
        t = text or ""
        issues = []
        if has_incomplete_frac(t):
            issues.append(INCOMPLETE_FRAC)
        display, inline = _math_delimiter_state(t)
        if display:
            issues.append(UNCLOSED_DISPLAY_MATH)
        if inline:
            issues.append(UNCLOSED_INLINE_MATH)
        if brace_balance(t) != 0:
            issues.append(UNBALANCED_BRACES)
        for env in unbalanced_environments(t):
            issues.append("unbalanced_environment:%s" % env)
        if re.search(r"\\[A-Za-z]+\s*\{[^{}]*$", t):
            issues.append(TRUNCATED_COMMAND)
        if stem_looks_cut_off(t) and INCOMPLETE_FRAC not in issues:
            issues.append(STEM_CUT_OFF)
        # Stable, de-duplicated order.
        seen = []
        for code in issues:
            if code not in seen:
                seen.append(code)
        return seen

    def guard(self, text: str):
        """Return ``(text, issues)``.

        The only edit ever made is appending a missing ``$$`` closer so the
        stem cannot swallow the rest of the paper when rendered. The question
        still carries ``unclosed_display_math`` so nothing looks repaired.
        """
        t = text or ""
        issues = self.inspect(t)
        if self.close_display_math and UNCLOSED_DISPLAY_MATH in issues:
            t = t.rstrip() + "$$"
        return t, issues
