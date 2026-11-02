"""Truncated stems, noisy profiles, empty input and source-type detection."""

import os
import sys
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
for _path in (_HERE, os.path.dirname(_HERE)):
    if _path not in sys.path:
        sys.path.insert(0, _path)

import fixtures  # noqa: E402
from localai import detect_source_type, process_ocr_text  # noqa: E402


class TruncatedStemTest(unittest.TestCase):
    def setUp(self):
        self.result = process_ocr_text(fixtures.TRUNCATED_STEM, "previous_year_paper")

    def test_question_is_kept_not_dropped(self):
        self.assertEqual(len(self.result.questions), 1)

    def test_flagged_incomplete_with_a_reason(self):
        question = self.result.questions[0]
        self.assertFalse(question.is_complete)
        self.assertIn("incomplete_frac", question.issues)

    def test_nothing_is_invented(self):
        question = self.result.questions[0]
        self.assertIn(r"\frac{2 x+1}{", question.stem)
        self.assertNotIn(r"\frac{2 x+1}{1}", question.stem)
        self.assertNotIn(r"\frac{2 x+1}{x}", question.stem)

    def test_confidence_drops_for_an_incomplete_card(self):
        self.assertLess(self.result.questions[0].confidence, 0.7)

    def test_missing_option_is_reported_not_filled(self):
        text = "Q.3 The value of $2+2$ is\n(A) $3$\n(B) $4$\n(D) $6$\n"
        result = process_ocr_text(text, "previous_year_paper")
        question = result.questions[0]
        self.assertEqual(question.option_labels, ["A", "B", "D"])
        self.assertIn("missing_option_C", question.issues)
        self.assertFalse(question.is_complete)
        self.assertEqual(len(question.options), 3)


class NoisyProfileTest(unittest.TestCase):
    def setUp(self):
        self.result = process_ocr_text(fixtures.HANDWRITTEN_NOTES, "handwritten_image")
        self.markdown = self.result.to_markdown()

    def test_real_questions_are_kept(self):
        self.assertEqual(len(self.result.questions), 3)
        self.assertIn("derivative of $x^{3}$", self.markdown)
        self.assertIn(r"$\sin 30^{\circ}$", self.markdown)
        self.assertIn("Solve for $x$", self.markdown)

    def test_garbage_lines_are_dropped(self):
        for junk in ("~~~~", "|||", "zzzz", "^^^^", "====", "\nq\n", "\nw\n"):
            self.assertNotIn(junk, self.markdown)

    def test_handwritten_confidence_is_lower_than_a_clean_paper(self):
        clean = process_ocr_text(fixtures.PYQ_PAPER, "previous_year_paper")
        self.assertLess(
            self.result.stats()["mean_confidence"], clean.stats()["mean_confidence"]
        )

    def test_math_lines_are_never_treated_as_garbage(self):
        text = "1. Evaluate $$\\int_0^1 x^2\\,dx$$ and give the value.\n||||\n"
        result = process_ocr_text(text, "handwritten_image")
        self.assertEqual(len(result.questions), 1)
        self.assertIn(r"$$\int_0^1 x^2\,dx$$", result.questions[0].stem)


class EmptyInputTest(unittest.TestCase):
    def test_empty_string(self):
        result = process_ocr_text("")
        self.assertTrue(result.is_empty)
        self.assertEqual(result.questions, [])
        self.assertIn("empty_input", result.warnings)

    def test_whitespace_only(self):
        result = process_ocr_text("   \n\t\n  ")
        self.assertTrue(result.is_empty)
        self.assertEqual(result.to_dict()["stats"]["question_count"], 0)

    def test_none_input(self):
        result = process_ocr_text(None)
        self.assertTrue(result.is_empty)

    def test_garbage_only_input(self):
        result = process_ocr_text(fixtures.GARBAGE_ONLY, "handwritten_image")
        self.assertTrue(result.is_empty)
        self.assertIn("no_questions_detected", result.warnings)

    def test_empty_result_still_renders(self):
        markdown = process_ocr_text("").to_markdown()
        self.assertTrue(markdown.startswith("---"))
        self.assertIn("**Extracted Questions**", markdown)
        self.assertTrue(markdown.rstrip().endswith("---"))


class SourceDetectionTest(unittest.TestCase):
    def test_pyq_is_detected(self):
        self.assertEqual(detect_source_type(fixtures.PYQ_PAPER), "previous_year_paper")

    def test_book_is_detected(self):
        self.assertEqual(detect_source_type(fixtures.BOOK_PAGE), "book_pdf")

    def test_handwritten_is_detected(self):
        self.assertEqual(detect_source_type(fixtures.HANDWRITTEN_NOTES), "handwritten_image")

    def test_detection_flag_is_reported(self):
        auto = process_ocr_text(fixtures.PYQ_PAPER)
        self.assertTrue(auto.source_type_detected)
        hinted = process_ocr_text(fixtures.PYQ_PAPER, "previous_year_paper")
        self.assertFalse(hinted.source_type_detected)

    def test_unknown_hint_falls_back_without_raising(self):
        result = process_ocr_text(fixtures.PYQ_PAPER, "something_else")
        self.assertEqual(len(result.questions), 4)


if __name__ == "__main__":
    unittest.main()
