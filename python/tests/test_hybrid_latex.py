"""Hybrid AI LaTeX + option sanitizers."""

import os
import sys
import unittest

_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

import hybrid_latex_sanitize as hls  # noqa: E402
import hybrid_metadata as hm  # noqa: E402
from ai_generator import QuestionOutput  # noqa: E402


class HybridLatexSanitizeTest(unittest.TestCase):
    def test_bmatrix_inserts_ampersands(self):
        raw = r"If $A=\begin{bmatrix} 1 1 \\ 0 & 1\end{bmatrix}$ find $A^2$"
        fixed = hls.normalize_matrix_environments(raw)
        self.assertIn("1 & 1", fixed)
        self.assertIn(r"0 & 1", fixed)

    def test_strip_option_a_prefix_when_stem_asks_an(self):
        stem = r"Let $A=\begin{bmatrix}1&0\\0&1\end{bmatrix}$. Find $A^n$ when n=3."
        opt = r"A = \begin{bmatrix} 1 & 3 \\ 0 & 1 \end{bmatrix}"
        self.assertEqual(
            hls.strip_misleading_matrix_option_prefix(stem, opt),
            r"\begin{bmatrix} 1 & 3 \\ 0 & 1 \end{bmatrix}",
        )

    def test_repair_hybrid_question_applies_latex(self):
        draft = QuestionOutput(
            question_text=r"Compute $A^3$ for $A=\begin{bmatrix} 2 1 \\ 0 2\end{bmatrix}$.",
            options=[
                r"A = \begin{bmatrix} 8 4 \\ 0 8 \end{bmatrix}",
                r"\begin{bmatrix} 4 2 \\ 0 4 \end{bmatrix}",
                "8",
                "4",
            ],
            correct_answer="B",
            step_by_step_solution="Expand powers using binomial on upper-triangular A.",
            bloom_level="Application",
        )
        repaired = hm.repair_hybrid_question(draft, "SCQ")
        self.assertIn("2 & 1", repaired.question_text)
        self.assertFalse(repaired.options[0].strip().startswith("A ="))

    def test_do_not_build_bmatrix_from_let_prose(self):
        prose = "Let A be a 3 by 3 matrix with positive entries."
        self.assertEqual(hls.sanitize_hybrid_latex_text(prose), prose)
        self.assertNotIn("bmatrix", hls.sanitize_hybrid_latex_text(prose))

        smashed = r"\begin{bmatrix} L e t \\ A b e \\ a 3 t \end{bmatrix} is equal to"
        fixed = hls.sanitize_hybrid_latex_text(smashed)
        self.assertNotIn("L & e & t", fixed)
        self.assertTrue(hls.stem_is_incomplete_matrix_only(smashed))
        self.assertTrue(hls.stem_is_incomplete_matrix_only(fixed))

        self.assertEqual(hls.strip_trailing_is_equal_to("64 is equal to"), "64")
        self.assertEqual(hls.strip_trailing_is_equal_to("is equal to"), "")
        self.assertEqual(
            hls.strip_trailing_is_equal_to(r"is equal to $2\sqrt{5}$"),
            r"is equal to $2\sqrt{5}$",
        )

        from ai_generator import _draft_prompt

        prompt = _draft_prompt(
            {
                "subject": "Mathematics",
                "chapter": "Matrices & Determinants",
                "exam": "JEE Advanced",
                "question_type": "SCQ",
                "_validation_hint": "Question stem is only a matrix plus 'is equal to'",
            }
        )
        self.assertIn("Let A be a 3", prompt)
        self.assertIn("only a matrix", prompt.lower())
        self.assertIn("previous draft was rejected", prompt.lower())

    def test_legacy_source_label(self):
        self.assertEqual(
            hls.normalize_hybrid_source_label("Gemini SCQ trial"),
            hls.HYBRID_AI_SOURCE_LABEL,
        )
        self.assertEqual(
            hls.normalize_hybrid_source_label("Gemini SCQ trial, not scored"),
            hls.HYBRID_AI_SOURCE_LABEL,
        )


if __name__ == "__main__":
    unittest.main()
