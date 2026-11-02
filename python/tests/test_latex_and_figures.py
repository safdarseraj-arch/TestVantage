"""LaTeX preservation, figure attachment and match-the-column structure."""

import os
import sys
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
for _path in (_HERE, os.path.dirname(_HERE)):
    if _path not in sys.path:
        sys.path.insert(0, _path)

import fixtures  # noqa: E402
from localai import process_ocr_text  # noqa: E402
from localai.latexguard import (  # noqa: E402
    LatexGuard,
    has_incomplete_frac,
    normalize_frac_latex,
)
from localai.matching import parse_matching_lists  # noqa: E402


class LatexPreservationTest(unittest.TestCase):
    def setUp(self):
        self.result = process_ocr_text(fixtures.PYQ_PAPER, "previous_year_paper")
        self.by_number = {q.number: q for q in self.result.questions}

    def test_inline_frac_survives_byte_for_byte(self):
        self.assertIn(r"$f(x)=\frac{x^{2}+1}{x-1}$", self.by_number[1].stem)
        self.assertIn(r"$\frac{7}{2}$", self.by_number[1].options)

    def test_display_math_survives_and_keeps_both_delimiters(self):
        stem = self.by_number[4].stem
        self.assertIn(r"$$x^{4}-4 x^{2}+3=0$$", stem)
        self.assertEqual(stem.count("$$"), 2)

    def test_slash_division_is_never_turned_into_a_fraction(self):
        stem = self.by_number[2].stem
        self.assertIn(r"$m r^{2} / 2$", stem)
        self.assertNotIn(r"\frac{m r^{2}}{2}", stem)

    def test_markdown_carries_the_same_latex(self):
        markdown = self.result.to_markdown()
        self.assertIn(r"$$x^{4}-4 x^{2}+3=0$$", markdown)
        self.assertIn(r"$m r^{2} / 2$", markdown)
        self.assertIn(r"$\frac{7}{2}$", markdown)


class LatexGuardTest(unittest.TestCase):
    def test_closed_frac_is_not_incomplete(self):
        self.assertFalse(has_incomplete_frac(r"$\frac{5}{4}$"))
        self.assertFalse(has_incomplete_frac(r"$r^{2} / 2$"))

    def test_open_frac_is_incomplete(self):
        self.assertTrue(has_incomplete_frac(r"$\frac{2x+1}{"))
        self.assertTrue(has_incomplete_frac(r"$\frac{2x+1}"))

    def test_text_frac_damage_is_normalised(self):
        self.assertEqual(normalize_frac_latex(r"\text{frac}{a}{b}"), r"\frac{a}{b}")

    def test_unclosed_display_math_is_closed_and_flagged(self):
        guard = LatexGuard()
        text, issues = guard.guard(r"The value of $$\int_0^1 x\,dx")
        self.assertTrue(text.endswith("$$"))
        self.assertIn("unclosed_display_math", issues)

    def test_balanced_math_is_untouched(self):
        guard = LatexGuard()
        source = r"The value of $$\int_0^1 x\,dx$$ is $\frac{1}{2}$."
        text, issues = guard.guard(source)
        self.assertEqual(text, source)
        self.assertEqual(issues, [])


class FigureAttachmentTest(unittest.TestCase):
    def test_figure_between_q2_and_q3_lands_on_q2(self):
        result = process_ocr_text(fixtures.FIGURE_BETWEEN_QUESTIONS, "previous_year_paper")
        by_number = {q.number: q for q in result.questions}
        self.assertEqual(by_number[1].figures, [])
        self.assertEqual(len(by_number[2].figures), 1)
        self.assertIn("2024_circuit.jpg", by_number[2].figures[0])
        self.assertEqual(by_number[3].figures, [])
        self.assertIn(r"\includegraphics{", by_number[2].stem)

    def test_markdown_image_is_normalised_to_includegraphics(self):
        result = process_ocr_text(fixtures.FIGURE_BETWEEN_QUESTIONS, "previous_year_paper")
        markdown = result.to_markdown()
        self.assertNotIn("![](https://cdn.mathpix.com", markdown)
        self.assertIn(r"\includegraphics{https://cdn.mathpix.com", markdown)

    def test_figure_only_question_is_kept(self):
        result = process_ocr_text(fixtures.FIGURE_ONLY_QUESTION, "previous_year_paper")
        self.assertEqual(len(result.questions), 2)
        figure_question = result.questions[0]
        self.assertEqual(figure_question.number, 20)
        self.assertEqual(len(figure_question.figures), 1)

    def test_pyq_figure_stays_on_its_own_question(self):
        result = process_ocr_text(fixtures.PYQ_PAPER, "previous_year_paper")
        by_number = {q.number: q for q in result.questions}
        self.assertEqual(len(by_number[2].figures), 1)
        for number in (1, 3, 4):
            self.assertEqual(by_number[number].figures, [], "Q%d stole a figure" % number)


class MatchTheColumnTest(unittest.TestCase):
    def test_both_lists_are_extracted(self):
        result = process_ocr_text(fixtures.PYQ_PAPER, "previous_year_paper")
        question = {q.number: q for q in result.questions}[3]
        self.assertEqual(question.question_type, "match_the_column")
        self.assertIsNotNone(question.matching_lists)
        self.assertEqual(len(question.matching_lists.list_i), 4)
        self.assertEqual(len(question.matching_lists.list_ii), 4)
        self.assertTrue(question.matching_lists.is_complete)
        self.assertTrue(question.is_complete)
        self.assertEqual(
            [row.label for row in question.matching_lists.list_i], ["(P)", "(Q)", "(R)", "(S)"]
        )
        self.assertIn("Strong electrolyte", question.matching_lists.list_ii[0].text)

    def test_answer_row_is_parsed_as_options_not_list_rows(self):
        result = process_ocr_text(fixtures.PYQ_PAPER, "previous_year_paper")
        question = {q.number: q for q in result.questions}[3]
        self.assertEqual(question.option_labels, ["A", "B", "C", "D"])
        self.assertIn("P-1, Q-2, R-3, S-4", question.options[0])

    def test_one_list_only_is_flagged_incomplete(self):
        result = process_ocr_text(fixtures.MATCH_ONE_LIST_ONLY, "previous_year_paper")
        self.assertEqual(len(result.questions), 1)
        question = result.questions[0]
        self.assertEqual(question.question_type, "match_the_column")
        self.assertFalse(question.is_complete)
        self.assertIn("matching_list_missing_list_ii", question.issues)

    def test_tabular_match_table_is_flattened_into_two_lists(self):
        text = (
            "Q.15 Match the following.\n"
            "\\begin{tabular}{|l|l|}\n"
            "\\hline List-I & List-II \\\\\n"
            "\\hline (P) Iron & (1) $\\mathrm{Fe}$ \\\\\n"
            "\\hline (Q) Copper & (2) $\\mathrm{Cu}$ \\\\\n"
            "\\hline (R) Zinc & (3) $\\mathrm{Zn}$ \\\\\n"
            "\\hline (S) Silver & (4) $\\mathrm{Ag}$ \\\\\n"
            "\\hline\n"
            "\\end{tabular}\n"
            "(A) P-1, Q-2, R-3, S-4\n"
            "(B) P-2, Q-1, R-4, S-3\n"
        )
        result = process_ocr_text(text, "previous_year_paper")
        question = result.questions[0]
        self.assertIsNotNone(question.matching_lists)
        self.assertEqual(len(question.matching_lists.list_i), 4)
        self.assertEqual(len(question.matching_lists.list_ii), 4)
        self.assertNotIn(r"\begin{tabular}", question.stem)

    def test_parse_matching_lists_returns_none_for_a_plain_question(self):
        self.assertIsNone(parse_matching_lists("The value of $2+2$ is four."))


if __name__ == "__main__":
    unittest.main()
