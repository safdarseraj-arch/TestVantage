"""Markdown shape, JSON schema stability and the command line front end."""

import json
import os
import subprocess
import sys
import tempfile
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
for _path in (_HERE, os.path.dirname(_HERE)):
    if _path not in sys.path:
        sys.path.insert(0, _path)

import fixtures  # noqa: E402
from localai import process_ocr_text  # noqa: E402
from localai.extract import main as cli_main  # noqa: E402
from localai.models import QUESTION_TYPES, SCHEMA_VERSION  # noqa: E402
from localai.render import PASSAGE_HEADING  # noqa: E402

_PACKAGE_ROOT = os.path.dirname(_HERE)


class MarkdownShapeTest(unittest.TestCase):
    def setUp(self):
        self.markdown = process_ocr_text(
            fixtures.PASSAGE_PAPER, "previous_year_paper"
        ).to_markdown()
        self.lines = self.markdown.split("\n")

    def test_opens_with_the_fence_and_header(self):
        self.assertEqual(self.lines[0], "---")
        self.assertEqual(self.lines[1], "**Extracted Questions**")
        self.assertEqual(self.lines[2], "")

    def test_closes_with_the_fence(self):
        self.assertEqual(self.lines[-1], "---")

    def test_questions_use_the_q_number_prefix(self):
        prefixes = [line for line in self.lines if line.startswith("Q")]
        self.assertEqual(prefixes[0].split(".")[0], "Q5")
        for line in prefixes:
            self.assertRegex(line, r"^Q\d+\. \S")

    def test_passage_heading_is_the_documented_one(self):
        self.assertIn(PASSAGE_HEADING, self.lines)
        self.assertEqual(self.lines.count(PASSAGE_HEADING), 1)

    def test_options_follow_their_stem(self):
        markdown = process_ocr_text(fixtures.PYQ_PAPER, "previous_year_paper").to_markdown()
        stem_at = markdown.index("Q1. Let $f(x)")
        option_at = markdown.index("(A) $5$")
        next_question_at = markdown.index("Q2.")
        self.assertLess(stem_at, option_at)
        self.assertLess(option_at, next_question_at)

    def test_no_raw_latex_scaffolding_leaks_into_markdown(self):
        markdown = process_ocr_text(fixtures.PYQ_PAPER, "previous_year_paper").to_markdown()
        for artefact in (r"\begin{itemize}", r"\end{itemize}", r"\item[", r"\section*{"):
            self.assertNotIn(artefact, markdown)


class JsonSchemaTest(unittest.TestCase):
    def setUp(self):
        self.result = process_ocr_text(fixtures.PYQ_PAPER, "previous_year_paper")
        self.payload = json.loads(self.result.to_json())

    def test_round_trips_through_json_loads(self):
        self.assertIsInstance(self.payload, dict)
        self.assertEqual(self.payload["schema_version"], SCHEMA_VERSION)

    def test_top_level_keys_are_stable(self):
        self.assertEqual(
            sorted(self.payload.keys()),
            [
                "passages",
                "questions",
                "removed_noise",
                "schema_version",
                "source_type",
                "source_type_detected",
                "stats",
                "warnings",
            ],
        )

    def test_question_keys_are_stable(self):
        expected = [
            "confidence",
            "figures",
            "is_complete",
            "issues",
            "matching_lists",
            "number",
            "option_labels",
            "options",
            "passage_id",
            "printed_number",
            "question_type",
            "source_type",
            "stem",
        ]
        for question in self.payload["questions"]:
            self.assertEqual(sorted(question.keys()), expected)

    def test_question_types_are_from_the_known_set(self):
        for question in self.payload["questions"]:
            self.assertIn(question["question_type"], QUESTION_TYPES)

    def test_confidence_is_a_bounded_float(self):
        for question in self.payload["questions"]:
            self.assertGreaterEqual(question["confidence"], 0.0)
            self.assertLessEqual(question["confidence"], 1.0)

    def test_stats_match_the_payload(self):
        self.assertEqual(self.payload["stats"]["question_count"], len(self.payload["questions"]))
        self.assertEqual(self.payload["stats"]["passage_count"], len(self.payload["passages"]))

    def test_to_dict_and_to_json_agree(self):
        self.assertEqual(self.result.to_dict(), self.payload)


class CliTest(unittest.TestCase):
    def test_cli_writes_markdown_and_json(self):
        with tempfile.TemporaryDirectory() as folder:
            source = os.path.join(folder, "paper.txt")
            md_out = os.path.join(folder, "out.md")
            json_out = os.path.join(folder, "out.json")
            with open(source, "w", encoding="utf-8") as handle:
                handle.write(fixtures.PYQ_PAPER)

            code = cli_main(
                [source, "--md", md_out, "--json", json_out, "--source", "previous_year_paper"]
            )
            self.assertEqual(code, 0)

            with open(md_out, "r", encoding="utf-8") as handle:
                markdown = handle.read()
            with open(json_out, "r", encoding="utf-8") as handle:
                payload = json.load(handle)

            self.assertIn("**Extracted Questions**", markdown)
            self.assertEqual(len(payload["questions"]), 4)
            self.assertEqual(payload["source_type"], "previous_year_paper")

    def test_cli_runs_as_a_module_over_stdin(self):
        env = dict(os.environ)
        env["PYTHONPATH"] = _PACKAGE_ROOT + os.pathsep + env.get("PYTHONPATH", "")
        env["PYTHONIOENCODING"] = "utf-8"
        process = subprocess.run(
            [sys.executable, "-m", "localai.extract", "-", "--source", "previous_year_paper"],
            input=fixtures.FIGURE_BETWEEN_QUESTIONS,
            capture_output=True,
            text=True,
            encoding="utf-8",
            env=env,
        )
        self.assertEqual(process.returncode, 0, process.stderr)
        self.assertIn("**Extracted Questions**", process.stdout)
        self.assertIn("Q3.", process.stdout)


if __name__ == "__main__":
    unittest.main()
