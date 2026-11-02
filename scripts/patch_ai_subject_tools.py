from pathlib import Path

root = Path(__file__).resolve().parent.parent
p = root / "ai_generator.py"
text = p.read_text(encoding="utf-8")

if "from subject_tools import" not in text:
    text = text.replace(
        "from models import BLOOM_LEVEL_VALUES, normalize_bloom_level\n",
        "from models import BLOOM_LEVEL_VALUES, normalize_bloom_level\n"
        "from subject_tools import subject_allows_code_execution, tools_for_subject\n",
    )

if "_BLOOM_INSTRUCTION_CORE" not in text:
    start = text.index("BLOOM_SYSTEM_INSTRUCTION = (")
    end = text.index("\n\n\nclass QuestionOutput", start)
    new_block = (
        "_BLOOM_INSTRUCTION_CORE = (\n"
        '    "You are TestVantages item writer for Indian competitive exams (JEE / NEET). "\n'
        '    "Every question MUST declare exactly one Bloom\'s taxonomy level in bloom_level using "\n'
        '    "one of these labels only: "\n'
        "    + \", \".join(BLOOM_LEVEL_VALUES)\n"
        '    + ". "\n'
        '    "Pick the level that matches the primary cognitive demand (not surface wording). "\n'
        ")\n\n"
        "_BLOOM_CODE_EXEC_SUFFIX = (\n"
        '    "Use Google\'s code execution tool for any numeric, symbolic, or verification step; "\n'
        '    "never guess final numbers without running code."\n'
        ")\n\n"
        "_BLOOM_NO_CODE_SUFFIX = (\n"
        '    "Answer from accurate domain knowledge; do not invent numeric or factual details."\n'
        ")\n\n\n"
        "def bloom_system_instruction(subject: str | None = None) -> str:\n"
        "    if subject_allows_code_execution(subject):\n"
        "        return _BLOOM_INSTRUCTION_CORE + _BLOOM_CODE_EXEC_SUFFIX\n"
        "    return _BLOOM_INSTRUCTION_CORE + _BLOOM_NO_CODE_SUFFIX\n\n\n"
        "BLOOM_SYSTEM_INSTRUCTION = bloom_system_instruction(None)\n\n\n"
    )
    text = text[:start] + new_block + text[end + 1 :]

text = text.replace(
    "def _generation_config(*, response_schema: type[BaseModel]) -> types.GenerateContentConfig:",
    "def _generation_config(\n    *,\n    response_schema: type[BaseModel],\n    subject: str | None = None,\n) -> types.GenerateContentConfig:",
)
text = text.replace(
    "tools=[types.Tool(code_execution=types.ToolCodeExecution())],",
    "tools=tools_for_subject(subject),",
)
text = text.replace(
    "system_instruction=BLOOM_SYSTEM_INSTRUCTION,",
    "system_instruction=bloom_system_instruction(subject),",
)

if 'subject = str(params.get("subject")' not in text:
    text = text.replace(
        "def _draft_question_sync(params: dict[str, Any], target_model: str) -> QuestionOutput:\n    client = _client()\n    response = client.models.generate_content(",
        'def _draft_question_sync(params: dict[str, Any], target_model: str) -> QuestionOutput:\n    client = _client()\n    subject = str(params.get("subject") or "").strip() or None\n    response = client.models.generate_content(',
    )
    text = text.replace(
        "config=_generation_config(response_schema=QuestionOutput),",
        "config=_generation_config(response_schema=QuestionOutput, subject=subject),",
        1,
    )

text = text.replace(
    "    response_schema: type[BaseModel],\n    cached_content: str | None = None,\n) -> types.GenerateContentConfig:\n    config = _generation_config(response_schema=response_schema)",
    "    response_schema: type[BaseModel],\n    subject: str | None = None,\n    cached_content: str | None = None,\n) -> types.GenerateContentConfig:\n    config = _generation_config(response_schema=response_schema, subject=subject)",
)

if "subject: str | None = None,\n    reference_prefix" not in text:
    text = text.replace(
        '    target_model: str,\n    *,\n    reference_prefix: str = "",',
        '    target_model: str,\n    *,\n    subject: str | None = None,\n    reference_prefix: str = "",',
    )

text = text.replace(
    "            response_schema=CloneBatchOutput,\n            cached_content=cached_content,",
    "            response_schema=CloneBatchOutput,\n            subject=subject,\n            cached_content=cached_content,",
)

if "subject: str | None = None,\n) -> list[SingleCloneItem]:\n    bundled" not in text:
    text = text.replace(
        "    reference_material_path: str | None,\n) -> list[SingleCloneItem]:\n    bundled, upload_path = _read_reference_bundle(reference_material_path)",
        "    reference_material_path: str | None,\n    *,\n    subject: str | None = None,\n) -> list[SingleCloneItem]:\n    bundled, upload_path = _read_reference_bundle(reference_material_path)",
    )

text = text.replace(
    "                difficulty_offset,\n                target_model,\n                cached_content=cache_name,\n                model_override=_CACHE_CLONE_MODEL,",
    "                difficulty_offset,\n                target_model,\n                subject=subject,\n                cached_content=cache_name,\n                model_override=_CACHE_CLONE_MODEL,",
)

text = text.replace(
    "        difficulty_offset,\n        target_model,\n        reference_prefix=prefix,\n    )\n\n\nasync def draft_question",
    "        difficulty_offset,\n        target_model,\n        subject=subject,\n        reference_prefix=prefix,\n    )\n\n\nasync def draft_question",
)

if "subject: str | None = None,\n    use_caching_optimizer" not in text:
    text = text.replace(
        "    target_model: str,\n    *,\n    use_caching_optimizer: bool = False,",
        "    target_model: str,\n    *,\n    subject: str | None = None,\n    use_caching_optimizer: bool = False,",
    )

text = text.replace(
    "            reference_material_path,\n        )\n    return await asyncio.to_thread(\n        _generate_clones_batch_sync,\n        source_text,\n        count,\n        difficulty_offset,\n        target_model,\n    )\n\nasync def generate_clones_up_to_count",
    "            reference_material_path,\n            subject=subject,\n        )\n    return await asyncio.to_thread(\n        _generate_clones_batch_sync,\n        source_text,\n        count,\n        difficulty_offset,\n        target_model,\n        subject=subject,\n    )\n\nasync def generate_clones_up_to_count",
)

if "subject: str | None = None,\n    chunk_size" not in text:
    text = text.replace(
        "    target_model: str,\n    *,\n    chunk_size: int = 5,",
        "    target_model: str,\n    *,\n    subject: str | None = None,\n    chunk_size: int = 5,",
    )

text = text.replace(
    "                        difficulty_offset,\n                        target_model,\n                        cached_content=cache_name,\n                        model_override=_CACHE_CLONE_MODEL,",
    "                        difficulty_offset,\n                        target_model,\n                        subject=subject,\n                        cached_content=cache_name,\n                        model_override=_CACHE_CLONE_MODEL,",
)

text = text.replace(
    "                difficulty_offset,\n                target_model,\n                reference_prefix=prefix,\n            )\n            clones.extend(batch)\n        return clones[:count]\n\n    while len(clones) < count:",
    "                difficulty_offset,\n                target_model,\n                subject=subject,\n                reference_prefix=prefix,\n            )\n            clones.extend(batch)\n        return clones[:count]\n\n    while len(clones) < count:",
)

text = text.replace(
    "            difficulty_offset,\n            target_model,\n        )\n        clones.extend(batch)\n    return clones[:count]\n",
    "            difficulty_offset,\n            target_model,\n            subject=subject,\n        )\n        clones.extend(batch)\n    return clones[:count]\n",
)

p.write_text(text, encoding="utf-8", newline="\n")
print("ai_generator ok")