from pathlib import Path
p = Path("ai_generator.py")
text = p.read_text(encoding="utf-8")
old = """def _draft_question_sync(params: dict[str, Any], target_model: str) -> QuestionOutput:
    client = _client()
    response = client.models.generate_content(
        model=target_model,
        contents=_draft_prompt(params),
        config=_generation_config(response_schema=QuestionOutput),
    )"""
new = """def _draft_question_sync(params: dict[str, Any], target_model: str) -> QuestionOutput:
    client = _client()
    subject = str(params.get("subject") or "").strip() or None
    response = client.models.generate_content(
        model=target_model,
        contents=_draft_prompt(params),
        config=_generation_config(response_schema=QuestionOutput, subject=subject),
    )"""
if old not in text:
    raise SystemExit("not found")
p.write_text(text.replace(old, new), encoding="utf-8", newline="\n")
print("ok")
