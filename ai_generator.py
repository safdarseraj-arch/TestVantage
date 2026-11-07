"""Gemini-backed question drafting and scaled clone generation (google-genai SDK)."""

from __future__ import annotations

import env_loader  # noqa: F401 - loads .env before genai.Client()

import asyncio
import json
import logging
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from cache_manager import EphemeralContextCache, estimate_tokens
from models import BLOOM_LEVEL_VALUES, normalize_bloom_level
from subject_tools import subject_allows_code_execution, tools_for_subject

_MAX_OUTPUT_TOKENS = 1500
_CACHE_TOKEN_THRESHOLD = 32_768
_MODEL_FLASH_27 = "gemini-2.5-flash"
_MODEL_FLASH = "gemini-3.7-flash"
_MODEL_PRO = "gemini-3-pro"

# Shared by draft, clone/replica, and published-paper fill. Not a hint and not a story.
HYBRID_SOLUTION_INSTRUCTION = (
    "Write step_by_step_solution in plain exam-solution style. "
    "Be concise: short steps only. No story, no chatty lead-in, no hint wording, and no 'think about'. "
    "Be complete: give the actual method and the final result, enough for a student to follow. "
    "Do not tease or stop early."
)

# Official PYQ answer-key solutions: exact working, not a hint and not an essay.
OFFICIAL_PYQ_SOLUTION_INSTRUCTION = (
    "step_by_step_solution is the answer-key solution for this past exam question. "
    "Write 3 to 8 short lines, each one real working step, under about 150 words in total. "
    "First line: the principle, law, or formula used. "
    "Middle lines: the key working with the actual numbers; put maths in $...$. "
    "For multiple-correct or matching questions, give one short line per option or pair saying why it is right or wrong. "
    "Last line: 'Answer: (X)' for options, or 'Answer: value with unit' for numbers. It must agree with correct_answer. "
    "Do not restate the question. No hint, no 'think about', no 'let us', no 'we need to', "
    "no background theory, no essay. Put each line on its own line (newline between lines). "
    "Never hedge ('or', 'possibly', 'likely'): if a structure, graph, or value you need is not "
    "in the text or the attached pictures, return an empty step_by_step_solution and an empty correct_answer."
)
_CROP_URL_RE = re.compile(r"/api/official-pyq/original/crops/([A-Za-z0-9_.-]{1,160}\.png)")
_MAX_FILL_PICTURES = 4
_PUBLISHED_FILL_TIMEOUT_MS = 75_000
_CACHE_CLONE_MODEL = _MODEL_FLASH
_CLONE_CACHE_DISPLAY_NAME = "testvantage-clone-batch-reference"

_DEFAULT_STYLE_GUIDE = (
    "TestVantages clone batch style guide (JEE / NEET):\n"
    "- Stems must be exam-realistic; verify numerics with code execution.\n"
    "- MCQ: exactly four distinct options; NVQ / numerical: empty options array.\n"
    "- Each item must include bloom_level using the allowed taxonomy labels.\n"
    "- Clones must test the same concept as the source with new numbers/context.\n"
)


def batch_optimize_enabled() -> bool:
    """True when BATCH_OPTIMIZE env enables reference bundling for clone batches."""
    return (os.getenv("BATCH_OPTIMIZE") or "").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def _should_bundle_reference_material(reference_material_path: str | None) -> bool:
    return bool((reference_material_path or "").strip()) or batch_optimize_enabled()


def _read_reference_bundle(reference_material_path: str | None) -> tuple[str, Path | None]:
    """
    Build syllabus/style reference text and optional on-disk path for upload caching.

    When a readable file path is supplied and no extra style guide is prepended, the path
    is returned for file-upload caching (works below the 32,768-token minimum).
    """
    parts: list[str] = []
    style_prepended = batch_optimize_enabled()
    if style_prepended:
        parts.append(_DEFAULT_STYLE_GUIDE)

    upload_path: Path | None = None
    path_str = (reference_material_path or "").strip()
    if path_str:
        ref_path = Path(path_str)
        if ref_path.is_file():
            parts.append(ref_path.read_text(encoding="utf-8"))
            if not style_prepended:
                upload_path = ref_path.resolve()
        else:
            parts.append(path_str)

    return "\n\n".join(parts).strip(), upload_path


async def _should_use_ephemeral_cache(
    bundled_text: str,
    upload_path: Path | None,
) -> bool:
    """Cache when reference is a file path (upload) or bundled text exceeds 32,768 tokens."""
    if upload_path is not None:
        return True
    if not bundled_text:
        return False
    return (await estimate_tokens(bundled_text)) > _CACHE_TOKEN_THRESHOLD


def build_cached_question_context(
    reference_material_path: str | None = None,
) -> EphemeralContextCache:
    """
    Configure ``EphemeralContextCache`` for clone-batch reference material.

    Call only after :func:`_should_use_ephemeral_cache` is true (or when
    ``reference_material_path`` is a readable file). Gemini context caching is
    cost-effective when cached content exceeds **32,768 tokens**, or when the
    source is supplied as an **uploaded file path** (see ``EphemeralContextCache``).

    Bundling runs when ``reference_material_path`` is set or ``BATCH_OPTIMIZE`` is enabled.
    """
    bundled, upload_path = _read_reference_bundle(reference_material_path)
    if upload_path is not None:
        source = str(upload_path)
    elif bundled:
        source = bundled
    else:
        raise ValueError(
            "No reference material to cache; set reference_material_path or BATCH_OPTIMIZE."
        )
    return EphemeralContextCache(
        source=source,
        display_name=_CLONE_CACHE_DISPLAY_NAME,
        model_name=_CACHE_CLONE_MODEL,
    )


_BLOOM_INSTRUCTION_CORE = (
    "You are TestVantages item writer for Indian competitive exams (JEE / NEET). "
    "Every question MUST declare exactly one Bloom's taxonomy level in bloom_level using "
    "one of these labels only: "
    + ", ".join(BLOOM_LEVEL_VALUES)
    + ". "
    "Pick the level that matches the primary cognitive demand (not surface wording). "
)

_BLOOM_CODE_EXEC_SUFFIX = (
    "Use Google's code execution tool for any numeric, symbolic, or verification step; "
    "never guess final numbers without running code."
)

_BLOOM_NO_CODE_SUFFIX = (
    "Answer from accurate domain knowledge; do not invent numeric or factual details."
)


def bloom_system_instruction(subject: str | None = None) -> str:
    if subject_allows_code_execution(subject):
        return _BLOOM_INSTRUCTION_CORE + _BLOOM_CODE_EXEC_SUFFIX
    return _BLOOM_INSTRUCTION_CORE + _BLOOM_NO_CODE_SUFFIX


BLOOM_SYSTEM_INSTRUCTION = bloom_system_instruction(None)




class QuestionOutput(BaseModel):
    question_text: str = Field(..., min_length=1)
    options: list[str] = Field(default_factory=list)
    correct_answer: str = Field(..., min_length=1)
    step_by_step_solution: str = Field(default="")
    bloom_level: str = Field(..., min_length=1)


class HybridDraftCheck(BaseModel):
    """Gemini completeness check. One question, code execution on for the maths."""

    complete: bool
    answer_matches: bool
    solution_correct: bool
    reasons: list[str] = Field(default_factory=list)


class HybridMetaTagFill(BaseModel):
    """Curriculum tags. Filled only after the draft passes both checks.

    Gemini may only return values from the lists in the prompt. Subject, source,
    marks, and sub-bank are fixed by the generation request and the bank type.
    """

    unit: str = ""
    chapter: str = ""
    topic: str = ""
    question_type: str = ""
    exam: str = ""
    toughness_level: str = ""


class PublishedPyqFillOutput(BaseModel):
    """Tags, answer, and solution for one published Official PYQ. No new stem."""

    subject: str = ""
    unit: str = ""
    chapter: str = ""
    topic: str = ""
    question_type: str = ""
    exam: str = ""
    toughness_level: str = ""
    source: str = ""
    correct_answer: str = ""
    step_by_step_solution: str = ""


@dataclass
class DraftPipelineResult:
    draft: QuestionOutput
    tray: str
    errors: list[str]
    unit: str
    chapter: str
    topic: str
    model_used: str
    toughness_level: int
    tags: dict[str, Any] | None = None


class SingleCloneItem(BaseModel):
    question_text: str = Field(..., min_length=1)
    options: list[str] = Field(default_factory=list)
    correct_answer: str = Field(..., min_length=1)
    step_by_step_solution: str = Field(..., min_length=1)
    bloom_level: str | None = None


class CloneBatchOutput(BaseModel):
    clones: list[SingleCloneItem] = Field(default_factory=list)


class OfficialReplicaVersion(BaseModel):
    difficulty_offset: int = Field(..., ge=-1, le=2)
    question_text: str = Field(..., min_length=1)
    options: list[str] = Field(default_factory=list)
    correct_answer: str = Field(..., min_length=1)
    step_by_step_solution: str = Field(..., min_length=1)
    bloom_level: str | None = None


class OfficialReplicaSetOutput(BaseModel):
    versions: list[OfficialReplicaVersion] = Field(default_factory=list)


class BlueprintSectionOutput(BaseModel):
    """Optional blueprint slice for multi-section papers."""

    section_title: str = Field(..., min_length=1)
    topic_focus: str = Field(..., min_length=1)
    question_count: int = Field(..., ge=1, le=50)
    target_bloom_level: str = Field(..., min_length=1)


def _client() -> genai.Client:
    api_key = (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip()
    if not api_key:
        raise ValueError(
            "GEMINI_API_KEY is missing. Add it to onlinetest/.env, then press F5."
        )
    return genai.Client(api_key=api_key)


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
        note = "Easier than the source — fewer steps, clearer numbers."
    else:
        tier = base
        note = "Match the requested difficulty band."

    exam_bit = f" Exam style: {exam_label}." if exam_label else ""
    return (
        f"Target difficulty band: {tier}.{exam_bit} {note} "
        "Numerical values must be exam-realistic; verify with code execution."
    )


def resolve_target_model(params: dict[str, Any]) -> str:
    """Exam, subject, chemistry branch, and toughness pick Flash 2.7, Flash 3.7, or Pro."""
    from hybrid_metadata import MODEL_FLASH, MODEL_FLASH_27, MODEL_PRO, resolve_generation_model

    model = resolve_generation_model(params)
    if model == MODEL_PRO:
        return _MODEL_PRO
    if model == MODEL_FLASH_27:
        return _MODEL_FLASH_27
    if model == MODEL_FLASH:
        return _MODEL_FLASH
    return model


def _generation_config(
    *,
    response_schema: type[BaseModel],
    subject: str | None = None,
    use_code_tools: bool = True,
    max_output_tokens: int | None = None,
) -> types.GenerateContentConfig:
    tools = tools_for_subject(subject) if use_code_tools else []
    # Thinking shares the output cap and was cutting JSON off before insert.
    config_kwargs: dict[str, Any] = {
        "max_output_tokens": _MAX_OUTPUT_TOKENS if max_output_tokens is None else int(max_output_tokens),
        "response_mime_type": "application/json",
        "response_schema": response_schema,
        "system_instruction": bloom_system_instruction(subject),
        "thinking_config": types.ThinkingConfig(thinking_budget=0, include_thoughts=False),
    }
    if tools:
        config_kwargs["tools"] = tools
    return types.GenerateContentConfig(**config_kwargs)


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


def _structured_output_from_response(response: Any, model: type[BaseModel]) -> BaseModel:
    """Prefer SDK-parsed schema; fall back to JSON text (code-tool replies can truncate text parts)."""
    parsed = getattr(response, "parsed", None)
    if parsed is not None:
        if isinstance(parsed, model):
            return parsed
        if isinstance(parsed, BaseModel):
            return model.model_validate(parsed.model_dump())
        if isinstance(parsed, dict):
            return model.model_validate(parsed)

    raw = _response_text(response)
    return _parse_model_json(raw, model)


def _parse_model_json(raw: str, model: type[BaseModel]) -> BaseModel:
    try:
        return model.model_validate_json(raw)
    except Exception:
        match = re.search(r"\{[\s\S]*\}", raw)
        if not match:
            raise ValueError("Gemini returned invalid or truncated JSON.")
        try:
            return model.model_validate(json.loads(match.group(0)))
        except json.JSONDecodeError as exc:
            raise ValueError(f"Gemini returned invalid or truncated JSON: {exc}") from exc


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
    unit = str(params.get("unit") or params.get("section") or "").strip()
    difficulty = str(params.get("difficulty") or "Medium")
    qtype = str(params.get("question_type") or "SCQ")
    diff_line = get_difficulty_instructions(difficulty, exam=exam)
    code = qtype.upper()
    if code in ("MSQ", "MCQ"):
        options_rule = (
            "Multiple correct (MCQ): exactly 4 options. "
            "correct_answer lists every correct letter, for example A,C."
        )
    elif code == "MTC":
        options_rule = (
            "Match the columns (MTC): the stem has List I and List II. "
            "correct_answer is the matching code."
        )
    elif code == "TF":
        options_rule = "True/False: options are exactly TRUE and FALSE. correct_answer is TRUE or FALSE."
    elif code == "PSC":
        options_rule = (
            "Passage single correct (PSC): include a short passage and one ask with exactly 4 options. "
            "correct_answer is one letter A-D."
        )
    elif code == "PNVQ":
        options_rule = (
            "Passage numerical (PNVQ): include a short passage and ask for one number. "
            "options is an empty array."
        )
    elif code == "IVQ":
        options_rule = "Integer (IVQ): options is an empty array. correct_answer is a whole number."
    elif code == "NVQ":
        options_rule = "Numerical (NVQ): options is an empty array. correct_answer is the number."
    else:
        options_rule = "Single correct (SCQ): exactly 4 distinct options. correct_answer is one letter A, B, C, or D."
    math_latex_rule = ""
    if str(subject).casefold() in ("mathematics", "math", "maths"):
        math_latex_rule = (
            "For matrices use valid LaTeX: \\begin{bmatrix} with & between columns and "
            "\\\\ between rows (e.g. 1 & 1 \\\\ 0 & 1). "
            "The stem must be a complete question: say what to find (determinant, value, "
            "A^n, or equal to a number written in the stem). "
            "Never put English words such as Let, A, or be into matrix cells. "
            "Keep prose like 'Let A be a 3 by 3 matrix' as words, not a bmatrix. "
            "A stem that is only a matrix followed by 'is equal to' is invalid. "
            "MCQ options are the answer values only — not prefixed with A= or B=, "
            "and do not end with 'is equal to'.\n"
        )
    hint = str(params.get("_validation_hint") or "").strip()
    hint_line = ""
    if hint:
        hint_line = (
            "The previous draft was rejected and must not be saved: "
            f"{hint} Write a new complete question.\n"
        )
    unit_line = f"Unit: {unit}\n" if unit else ""
    return (
        f"Write one original {qtype} question.\n"
        f"Exam: {exam}\nSubject: {subject}\n{unit_line}Chapter: {chapter}\nTopic: {topic}\n"
        "The unit is the curriculum unit. Never use the chapter name as the unit.\n"
        f"{diff_line}\n{options_rule}\n{math_latex_rule}{hint_line}"
        f"{HYBRID_SOLUTION_INSTRUCTION}\n"
        "Keep step_by_step_solution under 500 characters so the full JSON fits. "
        "Return JSON matching the schema (question_text, options, correct_answer, "
        "step_by_step_solution, bloom_level)."
    )


def _clone_prompt(source_text: str, count: int, difficulty_offset: int) -> str:
    diff_line = get_difficulty_instructions("Medium", difficulty_offset=difficulty_offset)
    return (
        f"Create {count} NEW questions that are structurally similar but not copies of this stem:\n\n"
        f"{source_text.strip()}\n\n"
        f"{diff_line}\n"
        "Each clone must change numbers and context while testing the same concept. "
        "Do not copy the original wording. Do not paste the source stem unchanged.\n"
        f"{HYBRID_SOLUTION_INSTRUCTION}\n"
        "If a stored solution was only a hint or a story, replace it with this concise complete solution. "
        "Include bloom_level per clone. Return JSON: {\"clones\": [ ... ]}."
    )


def official_replica_prompt(
    source_text: str,
    difficulty_offset: int,
    avoid_texts: list[str] | None = None,
) -> str:
    """One similar question. Later difficulties must see the parent and earlier versions."""
    diff_line = get_difficulty_instructions("Medium", difficulty_offset=difficulty_offset)
    offset = int(difficulty_offset)
    if offset == 0:
        closeness = (
            "Stay close to the parent concept and difficulty. "
            "Change the numbers and the opening setup. Do not copy any question word for word.\n"
        )
    else:
        closeness = (
            "Use a different stem setup and different numbers from the parent and from every version already written. "
            "Do not make a copy of an earlier difficulty.\n"
        )
    blocks: list[str] = []
    for index, raw in enumerate(avoid_texts or []):
        snippet = str(raw or "").strip()
        if not snippet:
            continue
        blocks.append(f"Already written {index + 1}:\n{snippet[:1200]}")
    avoid = ""
    if blocks:
        avoid = (
            "These versions already exist. Do not copy their wording or their numbers.\n\n"
            + "\n\n".join(blocks[:8])
            + "\n\n"
        )
    return (
        "Create 1 NEW question that tests the same concept as this parent. "
        "Do not paste the parent stem unchanged.\n\n"
        f"{source_text.strip()}\n\n"
        f"{avoid}"
        f"{diff_line}\n"
        f"{closeness}"
        f"{HYBRID_SOLUTION_INSTRUCTION}\n"
        "If a stored solution was only a hint or a story, replace it with this concise complete solution. "
        "Return JSON: {\"clones\": [ ... ]} with exactly one clone."
    )


def generate_official_replica_sync(
    source_text: str,
    difficulty_offset: int,
    target_model: str,
    *,
    subject: str | None = None,
    avoid_texts: list[str] | None = None,
) -> SingleCloneItem:
    """One replica question. Raises before any Gemini call when the key is missing."""
    client = _client()
    response = client.models.generate_content(
        model=target_model,
        contents=official_replica_prompt(source_text, difficulty_offset, avoid_texts),
        config=_clone_generation_config(
            response_schema=CloneBatchOutput,
            subject=subject,
        ),
    )
    parsed = _structured_output_from_response(response, CloneBatchOutput)
    clones = [_normalize_clone(item) for item in (parsed.clones or [])]
    if not clones:
        raise ValueError("Hybrid AI returned no replica question.")
    return clones[0]


async def generate_official_replica(
    source_text: str,
    difficulty_offset: int,
    target_model: str,
    *,
    subject: str | None = None,
    avoid_texts: list[str] | None = None,
) -> SingleCloneItem:
    return await asyncio.to_thread(
        generate_official_replica_sync,
        source_text,
        difficulty_offset,
        target_model,
        subject=subject,
        avoid_texts=avoid_texts,
    )


# Four versions of one question in one reply. Other math checks stay at 1500.
_REPLICA_SET_MAX_OUTPUT_TOKENS = 8000
_REPLICA_SET_OFFSETS = (-1, 0, 1, 2)


def official_replica_set_prompt(
    source_text: str,
    avoid_texts: list[str] | None = None,
) -> str:
    """Four difficulties of one parent question. Same stays closest. None is a copy."""
    blocks: list[str] = []
    for index, raw in enumerate(avoid_texts or []):
        snippet = str(raw or "").strip()
        if not snippet:
            continue
        blocks.append(f"Already written {index + 1}:\n{snippet[:800]}")
    avoid = ""
    if blocks:
        avoid = (
            "Do not copy these earlier versions or their numbers.\n\n"
            + "\n\n".join(blocks[:6])
            + "\n\n"
        )
    return (
        "Create exactly 4 NEW versions of this ONE parent question. "
        "Do not paste the parent stem unchanged. "
        "The four versions must use different numbers and must not copy each other.\n"
        "Return difficulty_offset -1, then 0, then 1, then 2.\n"
        "- -1: easier. Different numbers and a different opening setup.\n"
        "- 0: same difficulty. Stay closest to the parent, but not word for word.\n"
        "- 1: harder. Different numbers and a different setup.\n"
        "- 2: harder still. Different numbers and a different setup from the +1 version.\n\n"
        f"{source_text.strip()}\n\n"
        f"{avoid}"
        f"{HYBRID_SOLUTION_INSTRUCTION}\n"
        "If a stored solution was only a hint or a story, replace it with this concise complete solution. "
        'Return JSON: {"versions": [ ... ]} with exactly four versions.'
    )


def generate_official_replica_set_sync(
    source_text: str,
    *,
    subject: str | None = None,
    avoid_texts: list[str] | None = None,
) -> list[OfficialReplicaVersion]:
    """Four versions in one Gemini call. Raises before the call when the key is missing."""
    client = _client()
    response = client.models.generate_content(
        model=_MODEL_PRO,
        contents=official_replica_set_prompt(source_text, avoid_texts),
        config=_generation_config(
            response_schema=OfficialReplicaSetOutput,
            subject=subject,
            max_output_tokens=_REPLICA_SET_MAX_OUTPUT_TOKENS,
        ),
    )
    parsed = _structured_output_from_response(response, OfficialReplicaSetOutput)
    by_offset: dict[int, OfficialReplicaVersion] = {}
    for item in parsed.versions or []:
        offset = int(item.difficulty_offset)
        if offset not in _REPLICA_SET_OFFSETS or offset in by_offset:
            continue
        by_offset[offset] = item
    return [by_offset[offset] for offset in _REPLICA_SET_OFFSETS if offset in by_offset]


async def generate_official_replica_set(
    source_text: str,
    *,
    subject: str | None = None,
    avoid_texts: list[str] | None = None,
) -> list[OfficialReplicaVersion]:
    return await asyncio.to_thread(
        generate_official_replica_set_sync,
        source_text,
        subject=subject,
        avoid_texts=avoid_texts,
    )


def _draft_question_sync(params: dict[str, Any], target_model: str) -> QuestionOutput:
    from hybrid_metadata import hybrid_code_execution_subject

    client = _client()
    subject = str(params.get("subject") or "").strip() or None
    code_subject = hybrid_code_execution_subject(params)
    last_err: Exception | None = None
    for attempt in range(3):
        use_tools = attempt < 2
        try:
            response = client.models.generate_content(
                model=target_model,
                contents=_draft_prompt(params),
                config=_generation_config(
                    response_schema=QuestionOutput,
                    subject=code_subject,
                    use_code_tools=use_tools,
                ),
            )
            parsed = _structured_output_from_response(response, QuestionOutput)
            return _normalize_question_output(parsed)
        except (ValueError, json.JSONDecodeError) as exc:
            last_err = exc
            logger.warning(
                "Gemini draft parse failed (attempt %s/3, tools=%s) subject=%s chapter=%s: %s",
                attempt + 1,
                use_tools,
                params.get("subject"),
                params.get("chapter"),
                exc,
            )
            continue
        except Exception as exc:
            last_err = exc
            msg = str(exc).lower()
            if "empty text" in msg or "no candidates" in msg or "json" in msg or "validation" in msg:
                logger.warning(
                    "Gemini draft failed (attempt %s/3, tools=%s) subject=%s chapter=%s: %s",
                    attempt + 1,
                    use_tools,
                    params.get("subject"),
                    params.get("chapter"),
                    exc,
                )
                continue
            raise
    raise last_err or ValueError("Gemini returned empty text.")


def _clone_generation_config(
    *,
    response_schema: type[BaseModel],
    subject: str | None = None,
    cached_content: str | None = None,
) -> types.GenerateContentConfig:
    config = _generation_config(response_schema=response_schema, subject=subject)
    if cached_content:
        return config.model_copy(update={"cached_content": cached_content})
    return config


def _generate_clones_batch_sync(
    source_text: str,
    count: int,
    difficulty_offset: int,
    target_model: str,
    *,
    subject: str | None = None,
    reference_prefix: str = "",
    cached_content: str | None = None,
    model_override: str | None = None,
) -> list[SingleCloneItem]:
    client = _client()
    prompt = _clone_prompt(source_text, count, difficulty_offset)
    if reference_prefix and not cached_content:
        prompt = f"{reference_prefix.strip()}\n\n{prompt}"
    model = model_override or target_model
    response = client.models.generate_content(
        model=model,
        contents=prompt,
        config=_clone_generation_config(
            response_schema=CloneBatchOutput,
            subject=subject,
            cached_content=cached_content,
        ),
    )
    parsed = _structured_output_from_response(response, CloneBatchOutput)
    clones = [_normalize_clone(c) for c in (parsed.clones or [])]
    if len(clones) < count:
        raise ValueError(f"Expected {count} clones, got {len(clones)}.")
    return clones[:count]


async def _generate_clones_batch_with_optimizer(
    source_text: str,
    count: int,
    difficulty_offset: int,
    target_model: str,
    reference_material_path: str | None,
    *,
    subject: str | None = None,
) -> list[SingleCloneItem]:
    bundled, upload_path = _read_reference_bundle(reference_material_path)
    use_cache = await _should_use_ephemeral_cache(bundled, upload_path)
    if use_cache:
        async with build_cached_question_context(reference_material_path) as cache:
            cache_name = cache.name
            if not cache_name:
                raise ValueError("Ephemeral context cache missing name.")
            return await asyncio.to_thread(
                _generate_clones_batch_sync,
                source_text,
                count,
                difficulty_offset,
                target_model,
                subject=subject,
                cached_content=cache_name,
                model_override=_CACHE_CLONE_MODEL,
            )
    prefix = bundled if _should_bundle_reference_material(reference_material_path) else ""
    return await asyncio.to_thread(
        _generate_clones_batch_sync,
        source_text,
        count,
        difficulty_offset,
        target_model,
        subject=subject,
        reference_prefix=prefix,
    )


def _check_prompt(draft: QuestionOutput, qtype: str, *, use_code: bool) -> str:
    payload = {
        "question_type": qtype,
        "question_text": draft.question_text,
        "options": draft.options,
        "correct_answer": draft.correct_answer,
        "step_by_step_solution": draft.step_by_step_solution,
    }
    if use_code:
        check_line = (
            "Use the Python code execution tool for any maths or logic check. Do not guess a number.\n"
        )
    else:
        check_line = (
            "Judge completeness and whether the marked answer is present and consistent "
            "with the solution. Do not use code execution for this subject.\n"
        )
    return (
        "Check this ONE draft. Types you must understand: "
        "SCQ, MCQ (multi-correct), MTC (match), PSC, PNVQ, IVQ, NVQ, TF.\n"
        "Decide whether the question is correct and complete in all respects, "
        "whether the marked answer matches, and whether the solution is correct.\n"
        f"{check_line}"
        "Return JSON: complete, answer_matches, solution_correct, reasons (short strings).\n"
        f"{json.dumps(payload, ensure_ascii=False)}"
    )


def _metatag_prompt(draft: QuestionOutput, params: dict[str, Any], units: list[str]) -> str:
    from hybrid_metadata import CANONICAL_EXAMS, HYBRID_CHECK_TYPES, curriculum_chapters, curriculum_topics

    subject = str(params.get("subject") or "")
    unit_hint = str(params.get("unit") or params.get("section") or "")
    chapter_hint = str(params.get("chapter") or "")
    unit_list = ", ".join(units) if units else "(use the Main bank curriculum)"
    chapters = curriculum_chapters(subject, unit_hint) or curriculum_chapters(subject)
    topics = curriculum_topics(subject, chapter_hint)
    chapter_list = ", ".join(chapters) if chapters else "(a chapter under the chosen unit)"
    topic_list = ", ".join(topics) if topics else "(leave topic blank only if this chapter has no topics)"
    exams = ", ".join(CANONICAL_EXAMS)
    types = ", ".join(HYBRID_CHECK_TYPES)
    return (
        "Fill every curriculum metatag for this question that already passed the completeness check.\n"
        f"Subject is already {subject}. Do not change subject, source, marks, or sub-bank.\n"
        f"Allowed units: {unit_list}\n"
        f"Allowed chapters for that unit: {chapter_list}\n"
        f"Allowed topics for the chapter: {topic_list}\n"
        f"Allowed exams: {exams}\n"
        f"Allowed question types: {types}\n"
        "Toughness is an integer from 1 to 10.\n"
        "The unit must be one of those units. Never copy the chapter name into the unit field.\n"
        "Chapter and topic must be copied from the allowed lists. "
        "If you are unsure, keep the requested values below.\n"
        f"Requested unit: {unit_hint}\n"
        f"Requested chapter: {chapter_hint}\n"
        f"Requested topic: {params.get('topic') or ''}\n"
        f"Requested exam: {params.get('exam') or ''}\n"
        f"Requested question type: {params.get('question_type') or ''}\n"
        f"Requested toughness: {params.get('toughness_level') or ''}\n"
        "Return JSON: unit, chapter, topic, question_type, exam, toughness_level.\n"
        f"Question: {draft.question_text}"
    )


def _gemini_check_sync(
    draft: QuestionOutput,
    qtype: str,
    model: str,
    code_subject: str | None = None,
) -> list[str]:
    """Gemini completeness check. Code execution only for Maths, Physics, and Physical Chemistry."""
    client = _client()
    use_code = subject_allows_code_execution(code_subject)
    config_kwargs: dict[str, Any] = {
        "max_output_tokens": _MAX_OUTPUT_TOKENS,
        "response_mime_type": "application/json",
        "response_schema": HybridDraftCheck,
        "thinking_config": types.ThinkingConfig(thinking_budget=0, include_thoughts=False),
    }
    if use_code:
        config_kwargs["tools"] = [types.Tool(code_execution=types.ToolCodeExecution())]
    response = client.models.generate_content(
        model=model,
        contents=_check_prompt(draft, qtype, use_code=use_code),
        config=types.GenerateContentConfig(**config_kwargs),
    )
    parsed = _structured_output_from_response(response, HybridDraftCheck)
    if not isinstance(parsed, HybridDraftCheck):
        parsed = HybridDraftCheck.model_validate(parsed)
    errors: list[str] = []
    if not parsed.complete:
        errors.append("Gemini check: question is not complete.")
    if not parsed.answer_matches:
        errors.append("Gemini check: marked answer does not match.")
    if not parsed.solution_correct:
        errors.append("Gemini check: solution is not correct.")
    for reason in parsed.reasons or []:
        text = str(reason or "").strip()
        if text and text not in errors:
            errors.append(text)
    if (not parsed.complete or not parsed.answer_matches or not parsed.solution_correct) and not errors:
        errors.append("Gemini completeness check failed.")
    return errors


def _fill_metatags_sync(draft: QuestionOutput, params: dict[str, Any], units: list[str], model: str) -> dict[str, str]:
    client = _client()
    response = client.models.generate_content(
        model=model,
        contents=_metatag_prompt(draft, params, units),
        config=types.GenerateContentConfig(
            max_output_tokens=_MAX_OUTPUT_TOKENS,
            response_mime_type="application/json",
            response_schema=HybridMetaTagFill,
            thinking_config=types.ThinkingConfig(thinking_budget=0, include_thoughts=False),
        ),
    )
    parsed = _structured_output_from_response(response, HybridMetaTagFill)
    if not isinstance(parsed, HybridMetaTagFill):
        parsed = HybridMetaTagFill.model_validate(parsed)
    return {
        "unit": parsed.unit,
        "chapter": parsed.chapter,
        "topic": parsed.topic,
        "question_type": parsed.question_type,
        "exam": parsed.exam,
        "toughness_level": parsed.toughness_level,
    }


def _published_fill_prompt(params: dict[str, Any]) -> str:
    """Fill bank metatags, answer, and solution. The stem stays as given."""
    return (
        "Fill the Question Bank metatags, the answer, and the solution for this published question.\n"
        "Do not rewrite the question stem. Do not rewrite the options.\n"
        "Fields: subject, unit, chapter, topic, question_type, exam, toughness_level (1-10), source, "
        "correct_answer, step_by_step_solution.\n"
        "Use the Main-bank unit and chapter names already used for this subject "
        "(Mathematics units include Algebra, Calculus, Coordinate Geometry, Trigonometry, "
        "Vectors & 3D, Probability & Statistics).\n"
        "If you are not sure of a tag, return an empty string for that field.\n"
        "correct_answer is a letter (A-D), letters joined by commas, or the number. "
        "Empty if you cannot mark it.\n"
        f"{OFFICIAL_PYQ_SOLUTION_INSTRUCTION}\n"
        "If the stored solution is a hint, a story, or longer than this, replace it with this concise complete solution. "
        "If you cannot solve it, return an empty step_by_step_solution.\n"
        "If the stored question type is matrix_match_grid (Column I rows A-D, Column II entries P-T, "
        "each row matches one or more entries), correct_answer lists every row like "
        "\"A-P,R; B-Q; C-Q,S,T; D-R\" and question_type stays matrix_match_grid.\n"
        f"Stored subject: {params.get('subject') or ''}\n"
        f"Stored unit: {params.get('unit') or params.get('section') or ''}\n"
        f"Stored chapter: {params.get('chapter') or ''}\n"
        f"Stored topic: {params.get('topic') or ''}\n"
        f"Stored question type: {params.get('question_type') or ''}\n"
        f"Stored exam: {params.get('exam') or ''}\n"
        f"Stored toughness: {params.get('toughness_level') or ''}\n"
        f"Stored source: {params.get('source') or ''}\n"
        f"Stored answer: {params.get('answer') or ''}\n"
        f"Stored solution: {params.get('solution') or ''}\n"
        f"Stem:\n{params.get('question_text') or ''}\n"
        f"Options:\n{params.get('options_text') or ''}\n"
        "Pictures named in \\includegraphics lines above are attached in the same order; read structures, "
        "graphs, and tables from them.\n"
    )


def _published_fill_pictures(params: dict[str, Any]) -> list[types.Part]:
    """Crops the stem or options point at, so the model sees molecule P and graphs, not just their URLs."""
    from official_pyq_compare import read_crop

    text = f"{params.get('question_text') or ''}\n{params.get('options_text') or ''}"
    parts: list[types.Part] = []
    seen: set[str] = set()
    for name in _CROP_URL_RE.findall(text):
        if name in seen or len(parts) >= _MAX_FILL_PICTURES:
            continue
        seen.add(name)
        try:
            parts.append(types.Part.from_bytes(data=read_crop(name), mime_type="image/png"))
        except Exception:
            logger.warning("Fill picture %s is not on this computer", name)
    return parts


def solution_as_lines(text: str) -> str:
    """One working step per line. Splits a single paragraph at sentence ends outside $...$."""
    raw = str(text or "").strip()
    if not raw or "\n" in raw:
        return raw
    lines: list[str] = []
    start = 0
    in_math = False
    i = 0
    while i < len(raw):
        ch = raw[i]
        if ch == "\\" and i + 1 < len(raw):
            i += 2
            continue
        if ch == "$":
            in_math = not in_math
        elif (
            not in_math
            and ch in ".;"
            and i + 2 < len(raw)
            and raw[i + 1] == " "
            and (raw[i + 2].isupper() or raw[i + 2] in "($")
        ):
            lines.append(raw[start : i + 1].strip())
            start = i + 2
        i += 1
    lines.append(raw[start:].strip())
    out: list[str] = []
    for line in lines:
        head, sep, tail = line.partition(" Answer:")
        out.append(head.strip())
        if sep:
            out.append(f"Answer:{tail}".strip())
    return "\n".join(line for line in out if line)


def published_fill_model(params: dict[str, Any] | None) -> str:
    """Flash, except JEE Advanced and Hard, which uses Pro. Not the 8000 similar-paper cap."""
    data = params or {}
    exam = str(data.get("exam") or "").strip().casefold().replace("_", " ").replace("-", " ")
    advanced = exam == "jee advanced" or exam == "advanced"
    raw = str(data.get("difficulty") or data.get("toughness_level") or "").strip()
    hard = raw.casefold() == "hard"
    if not hard and raw:
        try:
            hard = int(float(raw)) >= 8
        except ValueError:
            hard = False
    if advanced and hard:
        return _MODEL_PRO
    return _MODEL_FLASH


def fill_published_pyq_sync(params: dict[str, Any]) -> dict[str, str]:
    """One published question. Code execution only for maths, physics, physical chemistry."""
    from hybrid_metadata import hybrid_code_execution_subject

    client = _client()
    code_subject = hybrid_code_execution_subject(params)
    model = published_fill_model(params)
    config = _generation_config(
        response_schema=PublishedPyqFillOutput,
        subject=code_subject,
        use_code_tools=code_subject is not None,
        max_output_tokens=_MAX_OUTPUT_TOKENS,
    )
    config.http_options = types.HttpOptions(timeout=_PUBLISHED_FILL_TIMEOUT_MS)
    response = client.models.generate_content(
        model=model,
        contents=[_published_fill_prompt(params), *_published_fill_pictures(params)],
        config=config,
    )
    parsed = _structured_output_from_response(response, PublishedPyqFillOutput)
    if not isinstance(parsed, PublishedPyqFillOutput):
        parsed = PublishedPyqFillOutput.model_validate(parsed)
    return {
        "subject": parsed.subject,
        "unit": parsed.unit,
        "chapter": parsed.chapter,
        "topic": parsed.topic,
        "question_type": parsed.question_type,
        "exam": parsed.exam,
        "toughness_level": parsed.toughness_level,
        "source": parsed.source,
        "correct_answer": parsed.correct_answer,
        "step_by_step_solution": solution_as_lines(parsed.step_by_step_solution),
        "model": model,
    }


async def fill_published_pyq(params: dict[str, Any]) -> dict[str, str]:
    return await asyncio.to_thread(fill_published_pyq_sync, params)


async def draft_question(params: dict[str, Any], target_model: str) -> DraftPipelineResult:
    """
    One question per call. Gemini checks it, the platform rechecks it,
    then either curriculum tags are filled or the draft is Needs action.
    """
    from hybrid_metadata import (
        curriculum_units,
        decide_hybrid_draft_fate,
        empty_hybrid_metatags,
        generation_model_sequence,
        hybrid_code_execution_subject,
        hybrid_question_warnings,
        repair_hybrid_question,
        resolve_toughness_level,
        snap_passed_metatags,
    )

    qtype = str(params.get("question_type") or "SCQ")
    subject = str(params.get("subject") or "").strip()
    toughness = resolve_toughness_level(params)
    code_subject = hybrid_code_execution_subject(params)
    sequence = generation_model_sequence(params)
    if target_model:
        sequence = [target_model, *sequence[1:]]
    last_draft: QuestionOutput | None = None
    last_errors: list[str] = []
    model_used = sequence[0] if sequence else target_model

    for index, model in enumerate(sequence):
        model_used = model
        attempt_params = dict(params)
        if last_errors:
            attempt_params["_validation_hint"] = "; ".join(last_errors)
        draft = await asyncio.to_thread(_draft_question_sync, attempt_params, model)
        draft = repair_hybrid_question(draft, qtype)
        warnings = hybrid_question_warnings(draft, qtype)
        if warnings:
            logger.warning("Hybrid draft warnings (kept): %s", warnings)
        try:
            gemini_errors = await asyncio.to_thread(_gemini_check_sync, draft, qtype, model, code_subject)
        except Exception as exc:
            logger.warning("Gemini completeness check failed: %s", exc)
            gemini_errors = ["Gemini completeness check failed."]
        fate = decide_hybrid_draft_fate(
            {
                "subject": subject,
                "unit": params.get("unit"),
                "chapter": params.get("chapter"),
                "topic": params.get("topic"),
                "question_text": draft.question_text,
                "options": draft.options,
                "correct_answer": draft.correct_answer,
                "step_by_step_solution": draft.step_by_step_solution,
                "question_type": qtype,
                "bloom_level": draft.bloom_level,
                "gemini_errors": gemini_errors,
            }
        )
        last_draft = draft
        last_errors = list(fate["errors"])
        if fate["tray"] == "ready":
            units = curriculum_units(subject)
            proposed: dict[str, str] = {}
            try:
                proposed = await asyncio.to_thread(_fill_metatags_sync, draft, params, units, model)
            except Exception as exc:
                logger.warning("Gemini metatag fill failed; using the Main bank curriculum: %s", exc)
            tags = snap_passed_metatags(subject, proposed, params)
            level = tags.get("toughness_level")
            return DraftPipelineResult(
                draft=draft,
                tray="ready",
                errors=[],
                unit=str(tags.get("unit") or ""),
                chapter=str(tags.get("chapter") or ""),
                topic=str(tags.get("topic") or ""),
                model_used=model,
                toughness_level=int(level) if level is not None else toughness,
                tags=tags,
            )
        logger.warning(
            "Hybrid draft validation failed (attempt %s/%s, model=%s): %s",
            index + 1,
            len(sequence),
            model,
            last_errors,
        )

    if last_draft is None:
        raise ValueError("Hybrid draft validation failed")
    return DraftPipelineResult(
        draft=last_draft,
        tray="needs_action",
        errors=last_errors,
        unit="",
        chapter="",
        topic="",
        model_used=model_used,
        toughness_level=toughness,
        tags=empty_hybrid_metatags(),
    )


async def generate_clones_batch(
    source_text: str,
    count: int,
    difficulty_offset: int,
    target_model: str,
    *,
    subject: str | None = None,
    use_caching_optimizer: bool = False,
    reference_material_path: str | None = None,
) -> list[SingleCloneItem]:
    if use_caching_optimizer:
        return await _generate_clones_batch_with_optimizer(
            source_text,
            count,
            difficulty_offset,
            target_model,
            reference_material_path,
            subject=subject,
        )
    return await asyncio.to_thread(
        _generate_clones_batch_sync,
        source_text,
        count,
        difficulty_offset,
        target_model,
        subject=subject,
    )

async def generate_clones_up_to_count(
    source_text: str,
    count: int,
    difficulty_offset: int,
    target_model: str,
    *,
    subject: str | None = None,
    chunk_size: int = 5,
    use_caching_optimizer: bool = False,
    reference_material_path: str | None = None,
) -> list[SingleCloneItem]:
    """Generate ``count`` clones in chunks; one ephemeral cache for the whole run when optimizing."""
    clones: list[SingleCloneItem] = []
    if use_caching_optimizer:
        bundled, upload_path = _read_reference_bundle(reference_material_path)
        use_cache = await _should_use_ephemeral_cache(bundled, upload_path)
        if use_cache:
            async with build_cached_question_context(reference_material_path) as cache:
                cache_name = cache.name
                if not cache_name:
                    raise ValueError("Ephemeral context cache missing name.")
                while len(clones) < count:
                    chunk = min(chunk_size, count - len(clones))
                    batch = await asyncio.to_thread(
                        _generate_clones_batch_sync,
                        source_text,
                        chunk,
                        difficulty_offset,
                        target_model,
                        subject=subject,
                        cached_content=cache_name,
                        model_override=_CACHE_CLONE_MODEL,
                    )
                    clones.extend(batch)
                return clones[:count]
        prefix = bundled if _should_bundle_reference_material(reference_material_path) else ""
        while len(clones) < count:
            chunk = min(chunk_size, count - len(clones))
            batch = await asyncio.to_thread(
                _generate_clones_batch_sync,
                source_text,
                chunk,
                difficulty_offset,
                target_model,
                subject=subject,
                reference_prefix=prefix,
            )
            clones.extend(batch)
        return clones[:count]

    while len(clones) < count:
        chunk = min(chunk_size, count - len(clones))
        batch = await generate_clones_batch(
            source_text,
            chunk,
            difficulty_offset,
            target_model,
            subject=subject,
        )
        clones.extend(batch)
    return clones[:count]

