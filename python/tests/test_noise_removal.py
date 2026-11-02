"""Junk removal: headers, footers, page numbers, instructions, answer keys."""

import os
import sys
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
for _path in (_HERE, os.path.dirname(_HERE)):
    if _path not in sys.path:
        sys.path.insert(0, _path)

import fixtures  # noqa: E402
from localai import process_ocr_text  # noqa: E402
from localai.noise import (  # noqa: E402
    NoiseFilter,
    looks_like_answer_key_blob,
    looks_like_section_instruction,
)
from localai.profiles import get_profile  # noqa: E402


class JunkRemovalTest(unittest.TestCase):
    def setUp(self):
        self.result = process_ocr_text(fixtures.PYQ_PAPER, "previous_year_paper")
        self.markdown = self.result.to_markdown()

    def test_exam_metadata_and_publisher_are_gone(self):
        self.assertNotIn("JEE (Advanced) 2024 Paper 1", self.markdown)
        self.assertNotIn("ALLEN Career Institute", self.markdown)

    def test_page_furniture_is_gone(self):
        self.assertNotIn("Page 3", self.markdown)
        self.assertNotIn("Page 4", self.markdown)
        self.assertNotIn("Space for rough work", self.markdown)

    def test_section_instruction_block_is_gone(self):
        self.assertNotIn("SECTION 1", self.markdown)
        self.assertNotIn("This section contains", self.markdown)
        self.assertNotIn("ONLY ONE of these four options", self.markdown)

    def test_marking_scheme_bullets_are_gone(self):
        self.assertNotIn("Full Marks", self.markdown)
        self.assertNotIn("Zero Marks", self.markdown)
        self.assertNotIn("Negative Marks", self.markdown)

    def test_printed_answer_key_is_gone(self):
        self.assertNotIn("ANSWER KEY", self.markdown)
        self.assertNotIn("1. (A) 2. (B)", self.markdown)

    def test_real_questions_survive(self):
        self.assertEqual(len(self.result.questions), 4)
        self.assertIn("The value of $f(3)$ is", self.markdown)
        self.assertIn("The number of real roots", self.markdown)

    def test_removal_is_reported(self):
        reasons = {entry.split(":", 1)[0] for entry in self.result.removed_noise}
        for expected in (
            "exam_metadata",
            "publisher",
            "page_number",
            "section_header",
            "marking_scheme",
            "answer_key_section",
            "watermark",
        ):
            self.assertIn(expected, reasons)


class AnswerKeyRowTest(unittest.TestCase):
    def test_inline_key_row_is_a_blob(self):
        self.assertTrue(looks_like_answer_key_blob("1. (A) 2. (C) 3. (B) 4. (D)"))
        self.assertTrue(looks_like_answer_key_blob("P-4, Q-3, R-2, S-5"))

    def test_a_real_match_option_is_not_a_blob(self):
        self.assertFalse(looks_like_answer_key_blob("(A) P-4, Q-3, R-2, S-5"))

    def test_a_real_stem_is_not_a_blob(self):
        self.assertFalse(
            looks_like_answer_key_blob("1. Let $f(x)=x^{2}$. The value of $f(2)$ is")
        )

    def test_standalone_key_row_is_dropped_but_option_row_survives(self):
        text = (
            "Q.1 Match List-I with List-II and choose the correct option.\n"
            "P-4, Q-3, R-2, S-5\n"
            "(A) P-4, Q-3, R-2, S-5\n"
            "(B) P-1, Q-2, R-3, S-4\n"
        )
        report = NoiseFilter(get_profile("previous_year_paper")).apply(text)
        self.assertNotIn("\nP-4, Q-3, R-2, S-5\n", "\n" + report.text + "\n")
        self.assertIn("(A) P-4, Q-3, R-2, S-5", report.text)


class SectionInstructionTest(unittest.TestCase):
    def test_section_blurb_detected(self):
        self.assertTrue(
            looks_like_section_instruction("This section contains FOUR (04) questions.")
        )
        self.assertTrue(looks_like_section_instruction("SECTION 2 (Maximum Marks: 12)"))

    def test_question_is_not_an_instruction(self):
        self.assertFalse(
            looks_like_section_instruction("Let $f(x)=x^{2}+1$. The value of $f(2)$ is")
        )


class BookNoiseTest(unittest.TestCase):
    def setUp(self):
        self.result = process_ocr_text(fixtures.BOOK_PAGE, "book_pdf")
        self.markdown = self.result.to_markdown()

    def test_chapter_and_exercise_headings_are_gone(self):
        self.assertNotIn("Chapter 4", self.markdown)
        self.assertNotIn("EXERCISE 4.2", self.markdown)

    def test_running_publisher_header_is_gone(self):
        self.assertNotIn("Arihant Publications", self.markdown)

    def test_trailing_solutions_section_is_cut(self):
        self.assertNotIn("SOLUTIONS", self.markdown)
        self.assertNotIn("Using the power rule", self.markdown)

    def test_three_real_questions_survive(self):
        self.assertEqual(len(self.result.questions), 3)


if __name__ == "__main__":
    unittest.main()
