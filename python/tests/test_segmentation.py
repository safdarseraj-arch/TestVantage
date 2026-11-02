"""Question separation: N in, N out. No merges, no splits, no duplicate numbers."""

import os
import sys
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
for _path in (_HERE, os.path.dirname(_HERE)):
    if _path not in sys.path:
        sys.path.insert(0, _path)

import fixtures  # noqa: E402
from localai import process_ocr_text  # noqa: E402


class SeparationTest(unittest.TestCase):
    def test_four_questions_in_four_out(self):
        result = process_ocr_text(fixtures.PYQ_PAPER, "previous_year_paper")
        self.assertEqual(len(result.questions), 4)
        self.assertEqual([q.number for q in result.questions], [1, 2, 3, 4])
        self.assertEqual([q.printed_number for q in result.questions], [1, 2, 3, 4])

    def test_printed_numbers_are_preserved(self):
        result = process_ocr_text(fixtures.PASSAGE_PAPER, "previous_year_paper")
        self.assertEqual([q.number for q in result.questions], [5, 6, 7])

    def test_no_duplicate_numbers_in_output(self):
        for name in ("PYQ_PAPER", "PASSAGE_PAPER", "BOOK_PAGE", "FIGURE_BETWEEN_QUESTIONS"):
            result = process_ocr_text(getattr(fixtures, name))
            numbers = [q.number for q in result.questions]
            self.assertEqual(len(numbers), len(set(numbers)), name)

    def test_questions_are_not_merged(self):
        result = process_ocr_text(fixtures.FIGURE_BETWEEN_QUESTIONS, "previous_year_paper")
        self.assertEqual(len(result.questions), 3)
        self.assertIn("block of mass", result.questions[0].stem)
        self.assertNotIn("circuit shown", result.questions[0].stem)
        self.assertIn("circuit shown", result.questions[1].stem)
        self.assertNotIn("light ray", result.questions[1].stem)
        self.assertIn("light ray", result.questions[2].stem)

    def test_questions_are_not_split_by_option_numbering(self):
        text = (
            "Q.1 The value of $2 + 2$ is\n"
            "1. two\n"
            "2. three\n"
            "3. four\n"
            "4. five\n"
            "\n"
            "Q.2 The value of $3 \\times 3$ is\n"
            "(A) $6$\n"
            "(B) $9$\n"
        )
        result = process_ocr_text(text, "previous_year_paper")
        self.assertEqual(len(result.questions), 2)
        self.assertEqual([q.printed_number for q in result.questions], [1, 2])

    def test_sequential_numbering_when_paper_printed_none(self):
        result = process_ocr_text(
            "Find the derivative of $x^{2}$ with respect to $x$.\n\n"
            "Find the integral of $x$ with respect to $x$ over $[0,1]$.\n",
            "question_image",
        )
        self.assertEqual([q.number for q in result.questions], [1, 2])
        self.assertTrue(all(q.printed_number is None for q in result.questions))

    def test_duplicate_ocr_numbering_keeps_the_richer_card(self):
        result = process_ocr_text(fixtures.DUPLICATE_NUMBERS, "previous_year_paper")
        self.assertEqual(len(result.questions), 1)
        question = result.questions[0]
        self.assertEqual(question.printed_number, 9)
        self.assertEqual(len(question.filled_options), 4)

    def test_glued_next_question_marker_is_separated(self):
        text = (
            "Q.1 The value of $1+1$ is (A) $1$ (B) $2$ Q.2 The value of $2+2$ is "
            "(A) $3$ (B) $4$\n"
        )
        result = process_ocr_text(text, "previous_year_paper")
        self.assertEqual(len(result.questions), 2)
        self.assertEqual([q.printed_number for q in result.questions], [1, 2])


if __name__ == "__main__":
    unittest.main()
