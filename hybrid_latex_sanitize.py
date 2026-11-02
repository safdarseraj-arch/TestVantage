"""LaTeX cleanup for Hybrid AI drafts (matrices + MCQ option shape)."""

from __future__ import annotations

import re

_MATRIX_ENV = re.compile(
    r"\\begin\{(bmatrix|pmatrix|vmatrix|matrix)\}([\s\S]*?)\\end\{\1\}",
    re.IGNORECASE,
)
_ASKS_MATRIX_ANSWER = re.compile(
    r"A\s*\^|\^n\b|matrix.{0,40}equal|equal\s+to\s+\$?\\begin\{(?:bmatrix|pmatrix)\}",
    re.IGNORECASE,
)
_OPTION_MATRIX_PREFIX = re.compile(
    r"^\s*(?:\$+\s*)?([A-Za-z])\s*=\s*(\\begin\{(?:bmatrix|pmatrix|vmatrix|matrix)\})",
    re.IGNORECASE,
)
_PROSE_LET_A_BE = re.compile(r"\bLet\s+A\s+be\s+a\s+3\b", re.IGNORECASE)
_REAL_ASK = re.compile(
    r"\\det\b|\bdeterminant\b|\bfind\b|\bvalue\b|\bcompute\b|\bevaluate\b|\bcalculate\b|"
    r"\bwhich\b|\bprove\b|\binverse\b|\btrace\b|\brank\b|\badj(?:oint)?\b|\beigen|"
    r"\^\s*\{?\s*n\b",
    re.IGNORECASE,
)
_EQUAL_TO_VALUE = re.compile(
    r"\bequal(?:s| to)\s+(?:\$+\s*)?(?:\\(?:frac|sqrt|dfrac)|[-+]?\d)",
    re.IGNORECASE,
)
_TRAILING_IS_EQUAL_TO = re.compile(
    r"(?:^|\s+)(?:\\text\{\s*)?is\s+equal\s+to(?:\s*\})?\s*[:.]?\s*$",
    re.IGNORECASE,
)

INCOMPLETE_MATRIX_STEM_ERROR = (
    "Question stem is only a matrix plus 'is equal to' with no real ask "
    "(determinant, find, or value)."
)


def _normalize_matrix_row(row: str) -> str:
    row = " ".join(str(row or "").strip().split())
    if not row or "&" in row:
        return row
    parts = row.split()
    if len(parts) >= 2:
        return " & ".join(parts)
    return row


def _repair_flat_matrix_body(body: str, cols: int = 2) -> str:
    inner = " ".join(str(body or "").strip().split())
    if not inner or "\\\\" in inner:
        return inner
    if "&" in inner:
        cells = [c.strip() for c in inner.split("&") if c.strip()]
        if len(cells) >= cols and len(cells) % cols == 0:
            rows = []
            for i in range(0, len(cells), cols):
                rows.append(" & ".join(cells[i : i + cols]))
            return " \\\\ ".join(rows)
        return inner
    parts = inner.split()
    if len(parts) >= cols and len(parts) % cols == 0:
        rows = []
        for i in range(0, len(parts), cols):
            rows.append(" & ".join(parts[i : i + cols]))
        return " \\\\ ".join(rows)
    return inner


def _matrix_body_tokens(body: str) -> list[str]:
    text = str(body or "").replace("\\\\", " ").replace("&", " ")
    text = re.sub(r"\\[a-zA-Z]+", " ", text)
    text = re.sub(r"[{}$]", " ", text)
    return [tok for tok in text.split() if tok]


def matrix_body_is_letter_soup(body: str) -> bool:
    """True when cells are the words 'Let A be a 3…' smashed into single letters."""
    tokens = _matrix_body_tokens(body)
    if len(tokens) < 6:
        return False
    short = [tok for tok in tokens if re.fullmatch(r"[A-Za-z]|\d", tok)]
    if len(short) < max(6, int(len(tokens) * 0.75)):
        return False
    joined = "".join(tokens).lower()
    if joined.startswith("let") or "letabe" in joined:
        return True
    letters = [tok.lower() for tok in tokens if re.fullmatch(r"[A-Za-z]", tok)]
    if len(letters) >= 6 and "".join(letters[:3]) == "let" and "".join(letters[3:6]) in {"abe", "bea"}:
        return True
    return False


def prose_let_a_be_must_stay_prose(text: str | None) -> bool:
    """Ordinary English 'Let A be a 3…' is not a matrix. Do not wrap it in bmatrix."""
    raw = str(text or "")
    if "\\begin{" in raw:
        return False
    return bool(_PROSE_LET_A_BE.search(raw))


def _text_outside_matrices(stem: str) -> str:
    text = _MATRIX_ENV.sub(" ", str(stem or ""))
    text = re.sub(r"\$+", " ", text)
    text = re.sub(r"\\(?:text|mathrm|mathbf)\{([^{}]*)\}", r" \1 ", text)
    return " ".join(text.split())


def stem_has_real_ask(stem: str | None) -> bool:
    """det / find / value, or 'equal to' a number, outside the matrix cells."""
    outside = _text_outside_matrices(str(stem or ""))
    if _REAL_ASK.search(outside):
        return True
    return bool(_EQUAL_TO_VALUE.search(outside))


def stem_is_incomplete_matrix_only(stem: str | None) -> bool:
    """
    Invalid Hybrid draft: the stem is only a matrix (often Let/Abe letter soup)
    plus 'is equal to', with no determinant / find / value ask.
    Do not invent the missing question — callers retry, then skip insert.
    """
    raw = str(stem or "").strip()
    if not raw:
        return False
    if _MATRIX_ENV.search(raw) and any(
        matrix_body_is_letter_soup(match.group(2)) for match in _MATRIX_ENV.finditer(raw)
    ):
        return True
    if stem_has_real_ask(raw):
        return False
    if _MATRIX_ENV.search(raw):
        outside = _text_outside_matrices(raw)
        core = re.sub(r"\b(?:is\s+equal\s+to|equals?)\s*[:.]?\s*$", "", outside, flags=re.IGNORECASE)
        core = re.sub(
            r"^(?:let\s+)?[A-Za-z]\s*=\s*$",
            "",
            core.strip(" .,:;$-"),
            flags=re.IGNORECASE,
        )
        return not core.strip()
    if not prose_let_a_be_must_stay_prose(raw):
        return False
    rest = _PROSE_LET_A_BE.sub(" ", raw)
    rest = re.sub(r"\bis\s+equal\s+to\s*[:.]?\s*$", " ", rest, flags=re.IGNORECASE)
    rest = re.sub(r"[×x]\s*3|\b3\b", " ", rest)
    rest = re.sub(
        r"\b(?:matrix|matrices|square|real|entries|entry|with|order|times|positive|integer|numbers?)\b",
        " ",
        rest,
        flags=re.IGNORECASE,
    )
    words = re.findall(r"[A-Za-z]{4,}", rest)
    return len(words) == 0


def strip_trailing_is_equal_to(option: str | None) -> str:
    """Drop a leaked trailing 'is equal to'. Keep 'is equal to 12' or 'is equal to $\\sqrt{2}$'."""
    opt = str(option or "").strip()
    if not opt:
        return ""
    if re.search(r"is\s+equal\s+to\s+\S", opt, re.IGNORECASE):
        return opt
    cleaned = _TRAILING_IS_EQUAL_TO.sub("", opt).strip()
    if re.fullmatch(r"is\s+equal\s+to\s*[:.]?", cleaned, re.IGNORECASE):
        return ""
    return cleaned


def normalize_matrix_environments(text: str | None) -> str:
    """Insert & column separators and row breaks inside matrix environments."""
    raw = str(text or "")
    if not raw or "\\begin{" not in raw:
        return raw

    def repl(match: re.Match[str]) -> str:
        env = match.group(1)
        body = match.group(2)
        # Nearby words such as "L e t / A b e / a 3 t" are smashed prose, not cells.
        if matrix_body_is_letter_soup(body):
            return match.group(0)
        rows = re.split(r"\\\\", body)
        fixed_rows = [_normalize_matrix_row(r) for r in rows]
        joined = " \\\\ ".join(r for r in fixed_rows if r.strip())
        joined = _repair_flat_matrix_body(joined, cols=2)
        return f"\\begin{{{env}}}{joined}\\end{{{env}}}"

    return _MATRIX_ENV.sub(repl, raw)


def stem_asks_for_matrix_value(stem: str | None) -> bool:
    return bool(_ASKS_MATRIX_ANSWER.search(str(stem or "")))


def strip_misleading_matrix_option_prefix(stem: str | None, option: str | None) -> str:
    """Drop 'A = …' from options when the stem asks for A^n or 'matrix equal to'."""
    opt = str(option or "").strip()
    if not opt or not stem_asks_for_matrix_value(stem):
        return opt
    return _OPTION_MATRIX_PREFIX.sub(r"\2", opt, count=1).strip()


def sanitize_hybrid_latex_text(text: str | None) -> str:
    raw = str(text or "")
    if prose_let_a_be_must_stay_prose(raw):
        return raw
    return normalize_matrix_environments(raw)


def sanitize_hybrid_option(stem: str | None, option: str | None) -> str:
    cleaned = sanitize_hybrid_latex_text(option)
    cleaned = strip_misleading_matrix_option_prefix(stem, cleaned)
    return strip_trailing_is_equal_to(cleaned)


HYBRID_AI_SOURCE_LABEL = "Hybrid AI (Postgres)"
_LEGACY_HYBRID_SOURCES = frozenset(
    {
        "gemini scq trial",
        "gemini trial",
        "gemini scq",
        "scq trial",
    }
)


def normalize_hybrid_source_label(source: str | None) -> str:
    raw = str(source or "").strip()
    if re.search(r"gemini\s+scq\s+trial", raw, re.I):
        return HYBRID_AI_SOURCE_LABEL
    key = " ".join(raw.split()).casefold()
    if not key or key in _LEGACY_HYBRID_SOURCES or key.startswith("gemini"):
        return HYBRID_AI_SOURCE_LABEL
    if key.startswith("hybrid ai"):
        return str(source or "").strip() or HYBRID_AI_SOURCE_LABEL
    return str(source or "").strip()
