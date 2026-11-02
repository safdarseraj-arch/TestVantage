"""Markdown and JSON renderers.

Markdown is the primary output and follows the house shape:

    ---
    **Extracted Questions**

    Q1. [Question text]
    (A) ...

    ### Passage / Comprehension
    [Full passage text]

    Q3. [Question based on passage]
    ---

LaTeX is copied through untouched, figures stay inline in the stem they belong
to, and completeness / confidence metadata lives in the JSON payload so the
Markdown stays clean enough to paste straight into the question bank.
"""

from __future__ import annotations

import json

HEADER = "**Extracted Questions**"
FENCE = "---"
PASSAGE_HEADING = "### Passage / Comprehension"
EMPTY_NOTE = "_No questions detected._"


class MarkdownRenderer:
    """Renders an ``ExtractionResult`` into the required Markdown shape."""

    def __init__(self, passage_heading: str = PASSAGE_HEADING):
        self.passage_heading = passage_heading

    def render_question(self, question) -> str:
        lines = ["Q%d. %s" % (question.number, question.stem.strip())]
        labels = list(question.option_labels)
        for index, option in enumerate(question.options):
            text = str(option).strip()
            if not text:
                continue
            label = labels[index] if index < len(labels) else chr(ord("A") + index)
            lines.append("(%s) %s" % (label, text))
        return "\n".join(lines).rstrip()

    def render_passage(self, passage) -> str:
        return "%s\n%s" % (self.passage_heading, passage.text.strip())

    def render(self, result) -> str:
        blocks = []
        shown = set()
        for question in result.questions:
            passage_id = question.passage_id
            if passage_id and passage_id not in shown:
                passage = result.passage_by_id(passage_id)
                if passage is not None:
                    blocks.append(self.render_passage(passage))
                shown.add(passage_id)
            blocks.append(self.render_question(question))
        if not blocks:
            blocks.append(EMPTY_NOTE)
        body = "\n\n".join(blocks)
        return "%s\n%s\n\n%s\n%s" % (FENCE, HEADER, body, FENCE)


class JsonRenderer:
    """Renders the same data as a stable JSON document."""

    def __init__(self, indent: int = 2):
        self.indent = indent

    def render(self, result) -> str:
        return json.dumps(result.to_dict(), indent=self.indent, ensure_ascii=False)
