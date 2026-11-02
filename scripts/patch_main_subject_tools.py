from pathlib import Path

p = Path(__file__).resolve().parent.parent / "main.py"
text = p.read_text(encoding="utf-8")

if "subject: str | None = Field(\n        default=None" not in text and "CloneScaledRequest" in text:
    text = text.replace(
        "    use_caching_optimizer: bool = Field(\n"
        "        default=False,\n"
        "        description=\"When true, use Gemini context caching for large reference material during cloning.\",\n"
        "    )\n",
        "    use_caching_optimizer: bool = Field(\n"
        "        default=False,\n"
        "        description=\"When true, use Gemini context caching for large reference material during cloning.\",\n"
        "    )\n\n"
        "    subject: str | None = Field(\n"
        "        default=None,\n"
        "        description=\"Subject for Gemini tool routing; inferred from parent in bank when omitted.\",\n"
        "    )\n",
    )

old_helper = (
    "async def _generate_clones_up_to_count(\n"
    "    source_text: str,\n"
    "    count: int,\n"
    "    difficulty_offset: int,\n"
    "    target_model: str,\n"
    "    *,\n"
    "    use_caching_optimizer: bool = False,\n"
    "    reference_material_path: str | None = None,\n"
    ") -> list[ai_generator.SingleCloneItem]:\n"
    "    return await ai_generator.generate_clones_up_to_count(\n"
    "        source_text,\n"
    "        count,\n"
    "        difficulty_offset,\n"
    "        target_model,\n"
    "        chunk_size=_CLONE_CHUNK_SIZE,\n"
    "        use_caching_optimizer=use_caching_optimizer,\n"
    "        reference_material_path=reference_material_path,\n"
    "    )\n"
)
new_helper = (
    "async def _generate_clones_up_to_count(\n"
    "    source_text: str,\n"
    "    count: int,\n"
    "    difficulty_offset: int,\n"
    "    target_model: str,\n"
    "    *,\n"
    "    subject: str | None = None,\n"
    "    use_caching_optimizer: bool = False,\n"
    "    reference_material_path: str | None = None,\n"
    ") -> list[ai_generator.SingleCloneItem]:\n"
    "    return await ai_generator.generate_clones_up_to_count(\n"
    "        source_text,\n"
    "        count,\n"
    "        difficulty_offset,\n"
    "        target_model,\n"
    "        subject=subject,\n"
    "        chunk_size=_CLONE_CHUNK_SIZE,\n"
    "        use_caching_optimizer=use_caching_optimizer,\n"
    "        reference_material_path=reference_material_path,\n"
    "    )\n"
)
if old_helper in text:
    text = text.replace(old_helper, new_helper)

old_job = (
    "    reference_material_path = str(params.get(\"reference_material_path\") or \"\").strip() or None\n\n"
    "    try:\n"
    "        raw_clones = await _generate_clones_up_to_count(\n"
    "            source_question_text,\n"
    "            requested_count,\n"
    "            difficulty_offset,\n"
    "            target_model,\n"
    "            use_caching_optimizer=use_caching_optimizer,\n"
    "            reference_material_path=reference_material_path,\n"
    "        )\n"
)
new_job = (
    "    reference_material_path = str(params.get(\"reference_material_path\") or \"\").strip() or None\n"
    "    subject = str(params.get(\"subject\") or \"\").strip() or None\n"
    "    if not subject:\n"
    "        async with AsyncSessionLocal() as session:\n"
    "            parent_for_subject = await session.get(AIQuestionBank, parent_question_id)\n"
    "            if parent_for_subject and parent_for_subject.subject:\n"
    "                subject = str(parent_for_subject.subject).strip() or None\n\n"
    "    try:\n"
    "        raw_clones = await _generate_clones_up_to_count(\n"
    "            source_question_text,\n"
    "            requested_count,\n"
    "            difficulty_offset,\n"
    "            target_model,\n"
    "            subject=subject,\n"
    "            use_caching_optimizer=use_caching_optimizer,\n"
    "            reference_material_path=reference_material_path,\n"
    "        )\n"
)
if old_job in text:
    text = text.replace(old_job, new_job)

old_run = (
    "async def _run_process_cached_book(file_path: str) -> None:\n"
    "    try:\n"
    "        await process_cached_book(\n"
    "            file_path,\n"
    "            display_name=Path(file_path).stem,\n"
    "        )\n"
)
new_run = (
    "async def _run_process_cached_book(file_path: str, subject: str = \"General\") -> None:\n"
    "    try:\n"
    "        await process_cached_book(\n"
    "            file_path,\n"
    "            subject=subject,\n"
    "            display_name=Path(file_path).stem,\n"
    "        )\n"
)
if old_run in text:
    text = text.replace(old_run, new_run)

old_ingest = (
    "@app.post(\"/api/ingest/book-cached\")\n"
    "async def ingest_book_cached(\n"
    "    background_tasks: BackgroundTasks,\n"
    "    file: UploadFile = File(...),\n"
    ") -> dict[str, str]:\n"
    "    suffix = Path(file.filename or \"upload.pdf\").suffix or \".pdf\"\n"
    "    tmp_path = _STATIC_ROOT / \"uploads\" / f\"book_cached_{uuid.uuid4().hex}{suffix}\"\n"
    "    tmp_path.parent.mkdir(parents=True, exist_ok=True)\n"
    "    data = await file.read()\n"
    "    tmp_path.write_bytes(data)\n"
    "    background_tasks.add_task(_run_process_cached_book, str(tmp_path))\n"
    "    return {\"status\": \"Ingestion started\", \"file_name\": file.filename or \"upload.pdf\"}\n"
)
new_ingest = (
    "@app.post(\"/api/ingest/book-cached\")\n"
    "async def ingest_book_cached(\n"
    "    background_tasks: BackgroundTasks,\n"
    "    file: UploadFile = File(...),\n"
    "    subject_form: str | None = Form(default=None),\n"
    "    subject: str | None = Query(default=None),\n"
    ") -> dict[str, str]:\n"
    "    resolved_subject = (subject or subject_form or \"General\").strip() or \"General\"\n"
    "    suffix = Path(file.filename or \"upload.pdf\").suffix or \".pdf\"\n"
    "    tmp_path = _STATIC_ROOT / \"uploads\" / f\"book_cached_{uuid.uuid4().hex}{suffix}\"\n"
    "    tmp_path.parent.mkdir(parents=True, exist_ok=True)\n"
    "    data = await file.read()\n"
    "    tmp_path.write_bytes(data)\n"
    "    background_tasks.add_task(_run_process_cached_book, str(tmp_path), resolved_subject)\n"
    "    return {\n"
    "        \"status\": \"Ingestion started\",\n"
    "        \"file_name\": file.filename or \"upload.pdf\",\n"
    "        \"subject\": resolved_subject,\n"
    "    }\n"
)
if old_ingest in text:
    text = text.replace(old_ingest, new_ingest)
else:
    raise SystemExit("ingest block not found")

if "Query" not in text.split("from fastapi")[1][:500]:
    pass

p.write_text(text, encoding="utf-8", newline="\n")
print("main.py ok")