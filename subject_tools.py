"""Gemini tool selection by exam subject (code execution for quant/science stems)."""

from __future__ import annotations

from google.genai import types

_CODE_EXEC_SUBJECTS = frozenset(
    {
        "mathematics",
        "physics",
        "physical chemistry",
    }
)

_SUBJECT_ALIASES: dict[str, str] = {
    "math": "mathematics",
    "maths": "mathematics",
    "mathematics": "mathematics",
    "mat": "mathematics",
    "phy": "physics",
    "physics": "physics",
    "physical chemistry": "physical chemistry",
    "physical chem": "physical chemistry",
    "physical chem.": "physical chemistry",
    "phy chem": "physical chemistry",
    "phy. chem": "physical chemistry",
    "phy. chem.": "physical chemistry",
    "phy chem.": "physical chemistry",
    "p chem": "physical chemistry",
    "p. chem": "physical chemistry",
}


def normalize_subject(subject: str | None) -> str | None:
    if subject is None:
        return None
    text = " ".join(str(subject).strip().lower().split())
    if not text:
        return None
    if text in _SUBJECT_ALIASES:
        return _SUBJECT_ALIASES[text]
    if "physical" in text and "chem" in text:
        return "physical chemistry"
    return text


def subject_allows_code_execution(subject: str | None) -> bool:
    key = normalize_subject(subject)
    return key is not None and key in _CODE_EXEC_SUBJECTS


def tools_for_subject(subject: str | None) -> list:
    if subject_allows_code_execution(subject):
        return [types.Tool(code_execution=types.ToolCodeExecution())]
    return []