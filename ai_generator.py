"""Gemini-backed question drafting and scaled clone generation (google-genai SDK)."""

from __future__ import annotations

import env_loader  # noqa: F401 - loads .env before genai.Client()

import asyncio
import json
import os
import re
from typing import Any

from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from models import BLOOM_LEVEL_VALUES, normalize_bloom_level

_MAX_OUTPUT_TOKENS = 1500

BLOOM_SYSTEM_INSTRUCTION = (
    "You are TestVantage item writer for Indian competitive exams (JEE / NEET). "
    "Every question MUST declare exactly one Bloom's taxonomy level in bloom_level using "
    "one of these labels only: "
    + ", ".join(BLOOM_LEVEL_VALUES)
    + ". "
    "Pick the level that matches the primary cognitive demand (not surface wording). "
    "Use Google's code execution tool for any numeric, symbolic, or verification step; "
    "never guess final numbers without running code."
)


class QuestionOutput(BaseModel):
    question_text: str = Field(..., min_length=1)
    options: list[str] = Field(default_factory=list)
    correct_answer: str = Field(..., min_length=1)
    step_by_step_solution: str = Field(..., min_length=1)
    bloom_level: str = Field(..., min_length=1)


class SingleCloneItem(BaseModel):
    question_text: str = Field(..., min_length=1)
    options: list[str] = Field(default_factory=list)
    correct_answer: str = Field(..., min_length=1)
    step_by_step_solution: str = Field(..., min_length=1)
    bloom_level: str | None = None


class CloneBatchOutput(BaseModel):
    clones: list[SingleCloneItem] = Field(default_factory=list)


class BlueprintSectionOutput(BaseModel):
    """Optional blueprint slice for multi-section papers."""

    section_title: str = Field(..., min_length=1)
    topic_focus: str = Field(..., min_length=1)
    question_count: int = Field(..., ge=1, le=50)
    target_bloom_level: str = Field(..., min_length=1)


def _client() -> genai.Client:
    api_key = (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip()
    if api_key:
        return genai.Client(api_key=api_key)
    return genai.Client()


def get_difficulty_instructions(
    difficulty: str,
    *,
    exam: str | None = None,
    difficulty_offset: int = 0,
) -> str:
    """Human-facing difficulty guidance for prompts."""
    base = (difficulty or "Medium").strip() or "Medium"
    exam_label = (exam or "").strip()
    offset = int(difficulty_offset)
    if offset >= 2:
        tier = "Hard"
        note = "Make noticeably harder than the source (multi-step, less scaffolding)."
    elif offset == 1:
        tier = "Hard"
        note = "Slightly harder than the source stem."
    elif offset <= -1:
        tier = "Easy"
        note = "Easier than the source   fewer steps, clearer numbers."
    else:
        tier = base
        note = "Match the requested difficulty band."

    exam_bit = f" Exam style: {exam_label}." if exam_label else ""
    return (
        f"Target difficulty band: {tier}.{exam_bit} {note} "
        "Numerical values must be exam-realistic; verify with code execution."
    )


def resolve_target_model(params: dict[str, Any]) -> str:
    exam = str(params.get("exam") or "").strip()
    difficulty = str(params.get("difficulty") or "").strip()
    if exam == "JEE Advanced" and difficulty == "Hard":
        return "gemini-1.5-pro"
    return "gemini-2.5-flash"


def _generation_config(*, response_schema: type[BaseModel]) -> types.GenerateContentConfig:
    return types.GenerateContentConfig(
        max_output_tokens=_MAX_OUTPUT_TOKENS,
        tools=[types.Tool(code_execution=types.ToolCodeExecution())],
        response_mime_type="application/json",
        response_schema=response_schema,
        system_instruction=BLOOM_SYSTEM_INSTRUCTION,
    )


def _response_text(response: Any) -> str:
    text = getattr(response, "text", None)
    if text:
        return str(text).strip()
    candidates = getattr(response, "candidates", None) or []
    if not candidates:
        raise ValueError("Gemini returned no candidates.")
    parts = getattr(candidates[0].content, "parts", None) or []
    chunks: list[str] = []
    for part in parts:
        if getattr(part, "text", None):
            chunks.append(str(part.text))
    joined = "\n".join(chunks).strip()
    if not joined:
        raise ValueError("Gemini returned empty text.")
    return joined


def _parse_model_json(raw: str, model: type[BaseModel]) -> BaseModel:
    try:
        return model.model_validate_json(raw)
    except Exception:
        match = re.search(r"\{[\s\S]*\}", raw)
        if not match:
            raise
        return model.model_validate(json.loads(match.group(0)))


def _normalize_question_output(draft: QuestionOutput) -> QuestionOutput:
    bloom = normalize_bloom_level(draft.bloom_level)
    if bloom is None:
        raise ValueError(f"Invalid bloom_level on draft: {draft.bloom_level!r}")
    options = [str(o).strip() for o in (draft.options or []) if str(o).strip()]
    return QuestionOutput(
        question_text=draft.question_text.strip(),
        options=options,
        correct_answer=draft.correct_answer.strip(),
        step_by_step_solution=draft.step_by_step_solution.strip(),
        bloom_level=bloom,
    )


def _normalize_clone(item: SingleCloneItem) -> SingleCloneItem:
    bloom = normalize_bloom_level(item.bloom_level) if item.bloom_level else None
    options = [str(o).strip() for o in (item.options or []) if str(o).strip()]
    return SingleCloneItem(
        question_text=item.question_text.strip(),
        options=options,
        correct_answer=item.correct_answer.strip(),
        step_by_step_solution=item.step_by_step_solution.strip(),
        bloom_level=bloom,
    )


def _draft_prompt(params: dict[str, Any]) -> str:
    subject = str(params.get("subject") or "General")
    exam = str(params.get("exam") or "JEE Main")
    chapter = str(params.get("chapter") or params.get("topic") or "General")
    topic = str(params.get("topic") or chapter)
    difficulty = str(params.get("difficulty") or "Medium")
    qtype = str(params.get("question_type") or "MCQ")
    diff_line = get_difficulty_instructions(difficulty, exam=exam)
    options_rule = (
        "Provide exactly 4 distinct options for MCQ / Single Choice."
        if "choice" in qtype.lower() or qtype.upper() == "MCQ"
        else "Use an empty options array for numerical / NVQ items."
    )
    return (
        f"Write one original {qtype} question.\n"
        f"Exam: {exam}\nSubject: {subject}\nChapter: {chapter}\nTopic: {topic}\n"
        f"{diff_line}\n{options_rule}\n"
        "Return JSON matching the schema (question_text, options, correct_answer, "
        "step_by_step_solution, bloom_level)."
    )


def _clone_prompt(source_text: str, count: int, difficulty_offset: int) -> str:
    diff_line = get_difficulty_instructions("Medium", difficulty_offset=difficulty_offset)
    return (
        f"Create {count} NEW questions that are structurally similar but not copies of this stem:\n\n"
        f"{source_text.strip()}\n\n"
        f"{diff_line}\n"
        "Each clone must change numbers/context while testing the same concept. "
        "Include bloom_level per clone. Return JSON: {\"clones\": [ ... ]}."
    )


def _draft_question_sync(params: dict[str, Any], target_model: str) -> QuestionOutput:
    client = _client()
    response = client.models.generate_content(
        model=target_model,
        contents=_draft_prompt(params),
        config=_generation_config(response_schema=QuestionOutput),
    )
    parsed = _parse_model_json(_response_text(response), QuestionOutput)
    return _normalize_question_output(parsed)


def _generate_clones_batch_sync(
    source_text: str,
    count: int,
    difficulty_offset: int,
    target_model: str,
) -> list[SingleCloneItem]:
    client = _client()
    response = client.models.generate_content(
        model=target_model,
        contents=_clone_prompt(source_text, count, difficulty_offset),
        config=_generation_config(response_schema=CloneBatchOutput),
    )
    parsed = _parse_model_json(_response_text(response), CloneBatchOutput)
    clones = [_normalize_clone(c) for c in (parsed.clones or [])]
    if len(clones) < count:
        raise ValueError(f"Expected {count} clones, got {len(clones)}.")
    return clones[:count]


async def draft_question(params: dict[str, Any], target_model: str) -> QuestionOutput:
    return await asyncio.to_thread(_draft_question_sync, params, target_model)


async def generate_clones_batch(
    source_text: str,
    count: int,
    difficulty_offset: int,
    target_model: str,
) -> list[SingleCloneItem]:
    return await asyncio.to_thread(
        _generate_clones_batch_sync,
        source_text,
        count,
        difficulty_offset,
        target_model,
    )
