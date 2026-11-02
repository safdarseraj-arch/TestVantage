"""Passage grouping: one passage, its children beneath it, linked in JSON."""

import json
import os
import sys
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
for _path in (_HERE, os.path.dirname(_HERE)):
    if _path not in sys.path:
        sys.path.insert(0, _path)

import fixtures  # noqa: E402
from localai import process_ocr_text  # noqa: E402
from localai.render import PASSAGE_HEADING  # noqa: E402


class PassageGroupingTest(unittest.TestCase):
    def setUp(self):
        self.result = process_ocr_text(fixtures.PASSAGE_PAPER, "previous_year_paper")
        self.markdown = self.result.to_markdown()

    def test_one_passage_with_three_children(self):
        self.assertEqual(len(self.result.passages), 1)
        self.assertEqual(len(self.result.questions), 3)
        passage = self.result.passages[0]
        self.assertEqual(passage.question_numbers, [5, 6, 7])

    def test_passage_is_not_emitted_as_a_question(self):
        for question in self.result.questions:
            self.assertNotIn("A thin uniform rod of mass", question.stem)

    def test_passage_rendered_once_with_all_children_beneath_it(self):
        self.assertEqual(self.markdown.count(PASSAGE_HEADING), 1)
        heading_at = self.markdown.index(PASSAGE_HEADING)
        for label in ("Q5.", "Q6.", "Q7."):
            self.assertGreater(self.markdown.index(label), heading_at)
        self.assertLess(self.markdown.index("Q5."), self.markdown.index("Q6."))
        self.assertLess(self.markdown.index("Q6."), self.markdown.index("Q7."))

    def test_passage_text_is_kept_whole(self):
        passage = self.result.passages[0]
        self.assertIn("A thin uniform rod of mass $M$", passage.text)
        self.assertIn("acceleration due to gravity", passage.text)

    def test_children_are_typed_as_comprehension(self):
        for question in self.result.questions:
            self.assertEqual(question.question_type, "comprehension_child")

    def test_json_links_children_to_the_passage_id(self):
        payload = json.loads(self.result.to_json())
        passage_id = payload["passages"][0]["id"]
        self.assertEqual(payload["passages"][0]["question_numbers"], [5, 6, 7])
        for question in payload["questions"]:
            self.assertEqual(question["passage_id"], passage_id)


class DirectionsRangeTest(unittest.TestCase):
    def setUp(self):
        self.result = process_ocr_text(fixtures.DIRECTIONS_PASSAGE, "previous_year_paper")

    def test_explicit_range_limits_the_children(self):
        self.assertEqual(len(self.result.passages), 1)
        self.assertEqual(self.result.passages[0].question_numbers, [5, 6])

    def test_question_outside_the_range_is_standalone(self):
        by_number = {q.number: q for q in self.result.questions}
        self.assertIsNone(by_number[7].passage_id)
        self.assertEqual(by_number[7].question_type, "single_correct")

    def test_directions_line_survives_in_the_passage(self):
        self.assertIn("Directions (Q. 5 to 6)", self.result.passages[0].text)


if __name__ == "__main__":
    unittest.main()
