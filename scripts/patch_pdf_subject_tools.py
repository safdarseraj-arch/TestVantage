from pathlib import Path

p = Path(__file__).resolve().parent.parent / "pdf_ingestion.py"
text = p.read_text(encoding="utf-16-le")
text = text.replace(
    "from ai_generator import BLOOM_SYSTEM_INSTRUCTION, _parse_model_json, _response_text",
    "from ai_generator import bloom_system_instruction, _parse_model_json, _response_text\nfrom subject_tools import tools_for_subject",
)
old = (
    "def _generate_chunk_sync(*, cache_name: str, prompt: str) -> PdfChunkExtractionOutput:\n"
    "    response = client.models.generate_content(\n"
    "        model=_PDF_MODEL,\n"
    "        contents=prompt,\n"
    "        config=types.GenerateContentConfig(\n"
    "            max_output_tokens=_MAX_OUTPUT_TOKENS,\n"
    "            response_mime_type=\"application/json\",\n"
    "            response_schema=PdfChunkExtractionOutput,\n"
    "            system_instruction=BLOOM_SYSTEM_INSTRUCTION,\n"
    "            cached_content=cache_name,\n"
    "        ),\n"
    "    )"
)
new = (
    "def _generate_chunk_sync(\n"
    "    *,\n"
    "    cache_name: str,\n"
    "    prompt: str,\n"
    "    subject: str | None,\n"
    ") -> PdfChunkExtractionOutput:\n"
    "    response = client.models.generate_content(\n"
    "        model=_PDF_MODEL,\n"
    "        contents=prompt,\n"
    "        config=types.GenerateContentConfig(\n"
    "            max_output_tokens=_MAX_OUTPUT_TOKENS,\n"
    "            tools=tools_for_subject(subject),\n"
    "            response_mime_type=\"application/json\",\n"
    "            response_schema=PdfChunkExtractionOutput,\n"
    "            system_instruction=bloom_system_instruction(subject),\n"
    "            cached_content=cache_name,\n"
    "        ),\n"
    "    )"
)
if old not in text:
    raise SystemExit("chunk sync block missing")
text = text.replace(old, new)
old2 = (
    "async def _extract_chunk(cache_name: str, start_page: int, end_page: int) -> PdfChunkExtractionOutput:\n"
    "    prompt = _chunk_prompt(start_page, end_page)\n"
    "    return await asyncio.to_thread(\n"
    "        _generate_chunk_sync,\n"
    "        cache_name=cache_name,\n"
    "        prompt=prompt,\n"
    "    )"
)
new2 = (
    "async def _extract_chunk(\n"
    "    cache_name: str,\n"
    "    start_page: int,\n"
    "    end_page: int,\n"
    "    *,\n"
    "    subject: str,\n"
    ") -> PdfChunkExtractionOutput:\n"
    "    prompt = _chunk_prompt(start_page, end_page)\n"
    "    return await asyncio.to_thread(\n"
    "        _generate_chunk_sync,\n"
    "        cache_name=cache_name,\n"
    "        prompt=prompt,\n"
    "        subject=subject,\n"
    "    )"
)
text = text.replace(old2, new2)
text = text.replace(
    "                extraction = await _extract_chunk(cache.name, start, end)",
    "                extraction = await _extract_chunk(\n"
    "                    cache.name,\n"
    "                    start,\n"
    "                    end,\n"
    "                    subject=subject.strip(),\n"
    "                )",
)
p.write_text(text, encoding="utf-8", newline="\n")
print("pdf_ingestion ok")