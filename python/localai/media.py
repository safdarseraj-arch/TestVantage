"""Mathpix figure handling.

Ported from ``src/utils/mathpixMedia.js``. Mathpix ships figures either as
``\\includegraphics{https://cdn.mathpix.com/cropped/...}`` or as markdown
``![](url)``. A figure is part of its question and must never drift to a
neighbouring question, so this module only normalises markup and reports URLs -
it never moves or invents a drawing.
"""

from __future__ import annotations

import re

MATHPIX_HOST_RE = re.compile(r"cdn\.mathpix\.com", re.IGNORECASE)

_MD_IMAGE_RE = re.compile(
    r"!\[\s*[^\]]*\]\s*\(\s*\$?\s*(https?://[^\s)]+)\s*\)?",
    re.IGNORECASE,
)
_LEAKED_QUERY_RE = re.compile(
    r"(^|[\s>])height=\d+&width=\d+&top_left_[^\s}]*",
    re.IGNORECASE | re.MULTILINE,
)
_INCLUDEGRAPHICS = "\\includegraphics"


def clean_image_url(url: str) -> str:
    """Repair the usual Mathpix URL damage (``to p_left_``, ``&amp;``, spaces)."""
    out = str(url or "")
    out = out.replace("&amp;", "&")
    out = re.sub(r"to\s*p_?\s*l\s*eft_", "top_left_", out, flags=re.IGNORECASE)
    out = re.sub(r"\s+", "", out)
    return out.strip().rstrip(")")


def consume_includegraphics(text: str, start: int = 0):
    """Parse one ``\\includegraphics[...]{url}``; returns ``(end, url)`` or ``None``."""
    if not text.startswith(_INCLUDEGRAPHICS, start):
        return None
    i = start + len(_INCLUDEGRAPHICS)
    if i < len(text) and text[i] == "*":
        i += 1
    while i < len(text) and text[i].isspace():
        i += 1
    if i < len(text) and text[i] == "[":
        depth = 1
        i += 1
        while i < len(text) and depth > 0:
            if text[i] == "[":
                depth += 1
            elif text[i] == "]":
                depth -= 1
            i += 1
    while i < len(text) and text[i].isspace():
        i += 1
    if i < len(text) and text[i] == "{":
        rest = text[i + 1 :]
        url_match = re.match(r"(https?://[^}\s]+)", rest, re.IGNORECASE)
        if url_match:
            end = i + 1 + len(url_match.group(1))
            if end < len(text) and text[end] == "}":
                end += 1
            return end, clean_image_url(url_match.group(1))
        depth = 1
        j = i + 1
        while j < len(text) and depth > 0:
            if text[j] == "{":
                depth += 1
            elif text[j] == "}":
                depth -= 1
            j += 1
        if depth != 0:
            return None
        return j, clean_image_url(text[i + 1 : j - 1])
    bare = re.match(r"(https?://\S+)", text[i:], re.IGNORECASE)
    if bare:
        return i + len(bare.group(1)), clean_image_url(bare.group(1))
    return None


def has_media(text: str) -> bool:
    t = text or ""
    return bool(
        MATHPIX_HOST_RE.search(t)
        or _INCLUDEGRAPHICS in t
        or re.search(r"\\begin\{figure\}", t, re.IGNORECASE)
        or _MD_IMAGE_RE.search(t)
    )


def normalize_broken_graphics(text: str) -> str:
    """Turn broken OCR image markup into one canonical ``\\includegraphics{url}``.

    Handles ``![]($ url`` (missing closer), markdown images, ``$`` smashed onto
    the command, and query fragments that leaked out of the URL as plain text.
    """
    s = text or ""
    if not s:
        return s
    # `![]($ https://...` / `![](https://...` (closing paren optional).
    s = _MD_IMAGE_RE.sub(lambda m: "\\includegraphics{%s}" % clean_image_url(m.group(1)), s)
    s = s.replace("![]($ ", " ")
    s = re.sub(r"\$+\s*(?=\\includegraphics\b)", "", s)
    # Re-emit every \includegraphics in canonical form, collapsing repeats.
    out = []
    i = 0
    last_url = ""
    while i < len(s):
        if s.startswith(_INCLUDEGRAPHICS, i):
            parsed = consume_includegraphics(s, i)
            if parsed and parsed[1]:
                end, url = parsed
                if url != last_url:
                    out.append("\\includegraphics{%s}" % url)
                    last_url = url
                i = end
                continue
        ch = s[i]
        if not ch.isspace():
            last_url = ""
        out.append(ch)
        i += 1
    s = "".join(out)
    s = _LEAKED_QUERY_RE.sub(r"\1", s)
    s = re.sub(r"[ \t]{2,}", " ", s)
    return s


def extract_image_urls(text: str):
    """All figure URLs in document order, de-duplicated."""
    t = text or ""
    urls = []

    def push(url: str) -> None:
        clean = clean_image_url(url)
        if clean.lower().startswith(("http://", "https://")) and clean not in urls:
            urls.append(clean)

    for match in _MD_IMAGE_RE.finditer(t):
        push(match.group(1))
    i = 0
    while True:
        at = t.find(_INCLUDEGRAPHICS, i)
        if at < 0:
            break
        parsed = consume_includegraphics(t, at)
        if parsed and parsed[1]:
            push(parsed[1])
            i = parsed[0]
        else:
            i = at + 1
    return urls


def strip_figure_chrome(text: str) -> str:
    """Drop LaTeX float scaffolding but keep the drawing and its list captions."""
    s = text or ""
    s = re.sub(r"\\begin\{figure\*?\}(?:\[[^\]]*\])?", " ", s, flags=re.IGNORECASE)
    s = re.sub(r"\\end\{figure\*?\}", " ", s, flags=re.IGNORECASE)
    s = re.sub(r"\\captionsetup\{[^}]*\}", " ", s, flags=re.IGNORECASE)
    s = re.sub(r"\\centering\b", " ", s, flags=re.IGNORECASE)
    s = re.sub(r"\\caption\{\s*(List\s*-?\s*I{1,2})\s*\}", r"\n\1\n", s, flags=re.IGNORECASE)
    s = re.sub(r"\\caption\{\s*(\([^)]{1,4}\))\s*\}", r"\n\1\n", s)
    s = re.sub(r"\\caption\{([^{}]*)\}", r"\n\1\n", s)
    s = re.sub(r"\\textwidth\b", " ", s, flags=re.IGNORECASE)
    s = re.sub(r"[ \t]{2,}", " ", s)
    return s.strip()


def strip_image_markup(text: str) -> str:
    """Remove figures entirely (used only when a drawing is provably foreign)."""
    t = text or ""
    out = []
    i = 0
    while i < len(t):
        if t.startswith(_INCLUDEGRAPHICS, i):
            parsed = consume_includegraphics(t, i)
            if parsed:
                out.append(" ")
                i = parsed[0]
                continue
        match = _MD_IMAGE_RE.match(t, i)
        if match:
            out.append(" ")
            i = match.end()
            continue
        out.append(t[i])
        i += 1
    return re.sub(r"[ \t]{2,}", " ", "".join(out)).strip()
