"""Hybrid AI tag normalization (batch jobs, pool rows, sub-banks)."""

import os
import sys
import unittest

_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

import hybrid_metadata as hm  # noqa: E402
from ai_generator import QuestionOutput  # noqa: E402
from models import SUB_BANK_TYPES  # noqa: E402


class HybridMetadataTest(unittest.TestCase):
    def test_exam_labels_canonical(self):
        self.assertEqual(hm.normalize_exam_label("jee-advanced"), "JEE Advanced")
        self.assertEqual(hm.normalize_exam_label("NEET"), "NEET")
        with self.assertRaises(ValueError):
            hm.normalize_exam_label("BITSAT")

    def test_subject_slugs_never_cross_pcmb(self):
        self.assertEqual(hm.normalize_hybrid_subject_label("physics"), "Physics")
        self.assertEqual(hm.normalize_hybrid_subject_label("chemistry"), "Chemistry")
        self.assertEqual(
            hm.normalize_hybrid_subject_label("biology", chapter="Human Reproduction"),
            "Zoology",
        )
        self.assertEqual(
            hm.normalize_hybrid_subject_label("biology", chapter="Plant Morphology"),
            "Botany",
        )

    def test_question_type_codes(self):
        self.assertEqual(hm.resolve_batch_question_type("Single Choice"), "SCQ")
        self.assertEqual(hm.resolve_batch_question_type("Multiple Choice"), "MSQ")
        self.assertEqual(hm.resolve_batch_question_type("Numerical"), "NVQ")
        self.assertEqual(hm.normalize_question_type_code("MCQ", has_options=True), "SCQ")
        self.assertEqual(hm.normalize_question_type_code("MSQ", has_options=True), "MSQ")
        self.assertEqual(hm.normalize_question_type_code(None, has_options=False), "NVQ")

    def test_batch_params_canonicalizes(self):
        job = hm.batch_params_from_request(
            {
                "subject": "physics",
                "exam": "JEE Advanced",
                "chapter": "Rotation",
                "difficulty": "hard",
                "question_type": "Multiple Choice",
                "count": 2,
            }
        )
        self.assertEqual(job["subject"], "Physics")
        self.assertEqual(job["exam"], "JEE Advanced")
        self.assertEqual(job["difficulty"], "Hard")
        self.assertEqual(job["question_type"], "MSQ")
        self.assertEqual(job["sub_bank_type"], "ai")
        self.assertEqual(job["unit"], "Mechanics")
        self.assertEqual(job["chapter"], "Rotation")
        self.assertNotEqual(job["unit"], "Rotation")

    def test_matrices_chapter_maps_to_algebra_not_itself(self):
        units = hm.curriculum_units("Mathematics")
        self.assertEqual(
            units,
            [
                "Algebra",
                "Trigonometry",
                "Coordinate Geometry",
                "Calculus",
                "Vectors & 3D",
                "Probability & Statistics",
            ],
        )
        tags = hm.resolve_hybrid_curriculum_tags(
            "Mathematics",
            unit="Matrices & Determinants",
            chapter="Matrices & Determinants",
            topic="Determinants",
        )
        self.assertTrue(tags["mapped"])
        self.assertEqual(tags["unit"], "Algebra")
        self.assertEqual(tags["chapter"], "Matrices & Determinants")
        self.assertNotEqual(tags["unit"], tags["chapter"])
        self.assertEqual(tags["topic"], "Determinants")

        job = hm.batch_params_from_request(
            {
                "subject": "mathematics",
                "exam": "JEE Main",
                "chapter": "Matrices & Determinants",
                "unit": "Matrices & Determinants",
                "difficulty": "Medium",
                "question_type": "Single Choice",
            }
        )
        self.assertEqual(job["unit"], "Algebra")
        self.assertEqual(job["chapter"], "Matrices & Determinants")

        short = hm.resolve_hybrid_curriculum_tags("Mathematics", chapter="Matrices")
        self.assertTrue(short["mapped"])
        self.assertEqual(short["unit"], "Algebra")
        self.assertEqual(short["chapter"], "Matrices & Determinants")

        unknown = hm.resolve_hybrid_curriculum_tags("Mathematics", chapter="Not A Real Chapter")
        self.assertFalse(unknown["mapped"])
        self.assertEqual(unknown["unit"], "")
        self.assertEqual(unknown["chapter"], "")
        self.assertNotEqual(unknown["unit"], "Not A Real Chapter")
        with self.assertRaises(ValueError):
            hm.batch_params_from_request(
                {
                    "subject": "mathematics",
                    "exam": "JEE Main",
                    "chapter": "Not A Real Chapter",
                    "difficulty": "Medium",
                }
            )

    def test_recheck_retags_unit_and_flags_incomplete_without_rewriting_stem(self):
        smashed = (
            r"$\begin{bmatrix} L & e & t \\ A & b & e \\ a & 3 & t \end{bmatrix}$ is equal to"
        )
        plan = hm.plan_hybrid_ai_recheck(
            {
                "subject": "Mathematics",
                "unit": "Matrices & Determinants",
                "chapter": "Matrices & Determinants",
                "topic": "Determinants",
                "question_text": smashed,
                "options": ["64", "96", "128", "192"],
                "correct_answer": "A",
                "step_by_step_solution": "",
                "question_type": "SCQ",
                "approval_status": "PENDING_REVIEW",
                "bloom_level": "Application",
            }
        )
        self.assertTrue(plan["wrong_unit"])
        self.assertTrue(plan["incomplete"])
        self.assertTrue(plan["needs_action"])
        self.assertEqual(plan["tray"], "needs_action")
        self.assertFalse(plan["apply_metatags"])
        self.assertEqual(plan["unit"], "")
        self.assertEqual(plan["chapter"], "")
        self.assertNotIn("unit", plan["updates"])
        self.assertNotIn("chapter", plan["updates"])
        self.assertNotIn("topic", plan["updates"])
        self.assertEqual(plan["updates"].get("approval_status"), "NEEDS_ACTION")
        self.assertNotIn("question_text", plan["updates"])
        for key in plan["updates"]:
            self.assertNotIn("question", key)
            self.assertNotIn("solution", key)
            self.assertNotIn("option", key)

        complete = hm.plan_hybrid_ai_recheck(
            {
                "subject": "Mathematics",
                "chapter": "Matrices & Determinants",
                "question_text": r"Let $A=\begin{bmatrix}1 & 2 \\ 3 & 4\end{bmatrix}$. Find $\det(A)$.",
                "options": ["-2", "-1", "2", "10"],
                "correct_answer": "A",
                "step_by_step_solution": "",
                "question_type": "SCQ",
                "bloom_level": "Application",
            }
        )
        self.assertFalse(complete["incomplete"])
        self.assertEqual(complete["updates"].get("unit"), "Algebra")
        self.assertNotIn("approval_status", complete["updates"])
        self.assertTrue(any("solution" in w.lower() for w in complete["warnings"]))

    def test_validate_hybrid_question_scq(self):
        good = QuestionOutput(
            question_text="Find the determinant of a 2x2 matrix with entries 1,2,3,4.",
            options=["-2", "0", "2", "10"],
            correct_answer="A",
            step_by_step_solution="Expand along row one: (1)(4) - (2)(3) = -2.",
            bloom_level="Application",
        )
        self.assertEqual(hm.validate_hybrid_question(good, "SCQ"), [])
        bad = hm.repair_hybrid_question(
            QuestionOutput(
                question_text="Short",
                options=["(A) 1", "2"],
                correct_answer="A",
                step_by_step_solution="Because.",
                bloom_level="Apply",
            ),
            "SCQ",
        )
        self.assertEqual(bad.options[0], "1")
        self.assertTrue(hm.validate_hybrid_question(bad, "SCQ"))

    def test_sub_bank_types_match_models(self):
        for label in ("normal", "pyq", "ai", "similar_pyq", "similar-pyq"):
            self.assertIn(hm.normalize_sub_bank_type_value(label), SUB_BANK_TYPES)

    def test_repair_hybrid_matrix_stem(self):
        draft = hm.repair_hybrid_question(
            QuestionOutput(
                question_text=r"$A=\begin{bmatrix} 1 1 \\ 0 & 1\end{bmatrix}$, find $A^n$.",
                options=[r"A = \begin{bmatrix} 1 & n \\ 0 & 1 \end{bmatrix}", "1", "2", "3"],
                correct_answer="A",
                step_by_step_solution="Use induction on the upper-triangular pattern.",
                bloom_level="Application",
            ),
            "SCQ",
        )
        self.assertIn("1 & 1", draft.question_text)
        self.assertNotRegex(draft.options[0], r"^\s*A\s*=")

    def test_prepare_clone_for_insert_matches_batch_path(self):
        class _Clone:
            question_text = "Find the value of x if 2x + 4 equals ten units."
            options = ["(A) 2", "3", "4", "5"]
            correct_answer = "A"
            step_by_step_solution = "Subtract four from both sides then divide by two."
            bloom_level = "Application"

        repaired, errors = hm.prepare_clone_for_insert(_Clone(), "SCQ")
        self.assertEqual(errors, [])
        self.assertEqual(repaired.options[0], "2")

        bad = hm.prepare_clone_for_insert(
            QuestionOutput(
                question_text="Too short",
                options=["1"],
                correct_answer="A",
                step_by_step_solution="Nope.",
                bloom_level="Application",
            ),
            "SCQ",
        )
        self.assertTrue(bad[1])

    def test_reject_smashed_let_matrix_stem(self):
        """Letter-soup 'Let A be a 3…' must not be stored. Retry, do not invent a question."""
        smashed = (
            r"$\begin{bmatrix} L & e & t \\ A & b & e \\ a & 3 & t \end{bmatrix}$ is equal to"
        )
        draft = QuestionOutput(
            question_text=smashed,
            options=["64 is equal to", "96", "128", "192"],
            correct_answer="A",
            step_by_step_solution="Expansion was not finished, so this draft must be rejected.",
            bloom_level="Application",
        )
        repaired = hm.repair_hybrid_question(draft, "SCQ")
        errors = hm.validate_hybrid_question(repaired, "SCQ")
        self.assertTrue(any("no real ask" in err for err in errors))
        self.assertNotIn("determinant", repaired.question_text.lower())
        self.assertNotIn(r"\det", repaired.question_text)
        self.assertEqual(repaired.options[0], "64")
        self.assertNotIn("is equal to", repaired.options[0].lower())

        spaced = hm.repair_hybrid_question(
            QuestionOutput(
                question_text=r"\begin{bmatrix} L e t \\ A b e \\ a 3 t \end{bmatrix} is equal to",
                options=["64", "96", "128", "192"],
                correct_answer="A",
                step_by_step_solution="This smashed opening is not a complete matrix question.",
                bloom_level="Application",
            ),
            "SCQ",
        )
        self.assertNotIn("L & e & t", spaced.question_text)
        self.assertTrue(hm.validate_hybrid_question(spaced, "SCQ"))

        prose = hm.repair_hybrid_question(
            QuestionOutput(
                question_text="Let A be a 3 by 3 matrix is equal to",
                options=["64", "96", "128", "192"],
                correct_answer="A",
                step_by_step_solution="Prose was cut off before any determinant or value ask.",
                bloom_level="Application",
            ),
            "SCQ",
        )
        self.assertNotIn("bmatrix", prose.question_text)
        self.assertIn("Let A be a 3", prose.question_text)
        self.assertTrue(any("no real ask" in err for err in hm.validate_hybrid_question(prose, "SCQ")))

        complete = QuestionOutput(
            question_text=(
                r"Let $A=\begin{bmatrix}1 & 2 \\ 3 & 4\end{bmatrix}$. "
                r"Find $\det(A)$."
            ),
            options=["-2", "-1", "2", "10"],
            correct_answer="A",
            step_by_step_solution="det = (1)(4) - (2)(3) = -2, so the answer is option A.",
            bloom_level="Application",
        )
        self.assertEqual(hm.validate_hybrid_question(complete, "SCQ"), [])

        only_matrix = QuestionOutput(
            question_text=r"$\begin{bmatrix}1 & 2 \\ 3 & 4\end{bmatrix}$ is equal to",
            options=["-2", "0", "2", "10"],
            correct_answer="A",
            step_by_step_solution="There is no ask in the stem, so this must not be inserted.",
            bloom_level="Application",
        )
        self.assertTrue(
            any("no real ask" in err for err in hm.validate_hybrid_question(only_matrix, "SCQ"))
        )

    def test_incomplete_stem_rejected_to_needs_action(self):
        smashed = (
            r"$\begin{bmatrix} L & e & t \\ A & b & e \\ a & 3 & t \end{bmatrix}$ is equal to"
        )
        fate = hm.decide_hybrid_draft_fate(
            {
                "subject": "Mathematics",
                "unit": "Matrices & Determinants",
                "chapter": "Matrices & Determinants",
                "topic": "Determinants",
                "question_text": smashed,
                "options": ["64", "96", "128", "192"],
                "correct_answer": "A",
                "step_by_step_solution": "No finished expansion.",
                "question_type": "SCQ",
                "bloom_level": "Application",
            }
        )
        self.assertEqual(fate["tray"], "needs_action")
        self.assertFalse(fate["apply_metatags"])
        self.assertEqual(fate["unit"], "")
        self.assertEqual(fate["chapter"], "")
        self.assertNotIn("unit", fate["updates"])
        self.assertNotIn("subject", fate["updates"])
        self.assertNotIn("question_type", fate["updates"])
        self.assertNotIn("exam", fate["updates"])
        self.assertEqual(fate["updates"].get("approval_status"), "NEEDS_ACTION")
        blank = fate["tags"]
        for key in (
            "subject",
            "unit",
            "chapter",
            "topic",
            "question_type",
            "exam",
            "difficulty",
            "source",
        ):
            self.assertFalse(blank[key], key)
        self.assertIsNone(blank["toughness_level"])
        self.assertIsNone(blank["marking"])

    def test_passed_matrices_chapter_maps_to_algebra_unit(self):
        tags = hm.snap_passed_metatags(
            "Mathematics",
            {"unit": "Matrices & Determinants", "chapter": "Matrices", "topic": "Determinants"},
            {"chapter": "Matrices & Determinants", "topic": "Determinants"},
        )
        self.assertEqual(tags["unit"], "Algebra")
        self.assertEqual(tags["chapter"], "Matrices & Determinants")
        self.assertNotEqual(tags["unit"], tags["chapter"])

        fate = hm.decide_hybrid_draft_fate(
            {
                "subject": "Mathematics",
                "exam": "JEE Main",
                "chapter": "Matrices & Determinants",
                "topic": "Determinants",
                "question_text": r"Let $A=\begin{bmatrix}1 & 2 \\ 3 & 4\end{bmatrix}$. Find $\det(A)$.",
                "options": ["-2", "-1", "2", "10"],
                "correct_answer": "A",
                "step_by_step_solution": "det = (1)(4) - (2)(3) = -2, so the answer is option A.",
                "question_type": "SCQ",
                "toughness_level": 5,
                "difficulty": "Medium",
                "bloom_level": "Application",
            }
        )
        self.assertEqual(fate["tray"], "ready")
        self.assertTrue(fate["apply_metatags"])
        tags = fate["tags"]
        self.assertEqual(tags["subject"], "Mathematics")
        self.assertEqual(tags["unit"], "Algebra")
        self.assertEqual(tags["section"], "Algebra")
        self.assertEqual(tags["chapter"], "Matrices & Determinants")
        self.assertEqual(tags["topic"], "Determinants")
        self.assertNotEqual(tags["unit"], tags["chapter"])
        self.assertEqual(tags["question_type"], "SCQ")
        self.assertEqual(tags["exam"], "JEE Main")
        self.assertEqual(tags["toughness_level"], 5)
        self.assertEqual(tags["difficulty"], "Medium")
        self.assertEqual(tags["source"], "Hybrid AI (Postgres)")
        self.assertEqual(tags["sub_bank_type"], "ai")
        self.assertEqual(tags["marking"], {"correct": 4, "wrong": -1, "unattempted": 0})
        self.assertEqual(fate["unit"], "Algebra")
        self.assertEqual(fate["chapter"], "Matrices & Determinants")

    def test_answer_mismatch_goes_to_needs_action(self):
        fate = hm.decide_hybrid_draft_fate(
            {
                "subject": "Mathematics",
                "chapter": "Matrices & Determinants",
                "question_text": "Find the value of 2 + 2.",
                "options": ["3", "4", "5", "6"],
                "correct_answer": "A",
                "step_by_step_solution": "2 + 2 = 4, so the answer is 4.",
                "question_type": "SCQ",
                "bloom_level": "Application",
            }
        )
        self.assertEqual(fate["tray"], "needs_action")
        self.assertTrue(any("match" in err.lower() for err in fate["errors"]))
        self.assertEqual(fate["unit"], "")
        self.assertFalse(fate["tags"]["subject"])
        self.assertFalse(fate["tags"]["exam"])
        self.assertFalse(fate["tags"]["question_type"])
        self.assertIsNone(fate["tags"]["toughness_level"])

    def test_model_routing_by_exam_subject_and_toughness(self):
        self.assertEqual(hm.MODEL_FLASH_27, "gemini-2.5-flash")
        self.assertEqual(hm.MODEL_FLASH, "gemini-3.7-flash")
        self.assertEqual(hm.MODEL_PRO, "gemini-3-pro")
        self.assertEqual(
            hm.chemistry_branch_name("Chemistry", chapter="p-Block"),
            "inorganic",
        )
        self.assertEqual(
            hm.chemistry_branch_name("Chemistry", chapter="Electrochemistry"),
            "physical",
        )
        self.assertEqual(
            hm.chemistry_branch_name("Chemistry", chapter="Hydrocarbons"),
            "organic",
        )

        self.assertEqual(
            hm.resolve_generation_model(
                {
                    "exam": "NEET",
                    "subject": "Biology",
                    "chapter": "Human Reproduction",
                    "toughness_level": 9,
                }
            ),
            hm.MODEL_FLASH_27,
        )
        self.assertEqual(
            hm.resolve_generation_model(
                {
                    "exam": "JEE Advanced",
                    "subject": "Mathematics",
                    "chapter": "Matrices & Determinants",
                    "toughness_level": 9,
                }
            ),
            hm.MODEL_PRO,
        )
        self.assertEqual(
            hm.resolve_generation_model(
                {
                    "exam": "JEE Advanced",
                    "subject": "Mathematics",
                    "chapter": "Matrices & Determinants",
                    "toughness_level": 5,
                }
            ),
            hm.MODEL_FLASH,
        )
        self.assertEqual(
            hm.resolve_generation_model(
                {
                    "exam": "JEE Main",
                    "subject": "Chemistry",
                    "chapter": "p-Block",
                    "toughness_level": 5,
                }
            ),
            hm.MODEL_FLASH_27,
        )
        self.assertEqual(
            hm.resolve_generation_model(
                {
                    "exam": "JEE Advanced",
                    "subject": "Chemistry",
                    "chapter": "Electrochemistry",
                    "toughness_level": 9,
                }
            ),
            hm.MODEL_FLASH,
        )
        self.assertEqual(
            hm.generation_model_sequence(
                {
                    "exam": "JEE Advanced",
                    "subject": "Mathematics",
                    "chapter": "Matrices & Determinants",
                    "toughness_level": 5,
                }
            ),
            [hm.MODEL_FLASH, hm.MODEL_FLASH],
        )
        self.assertEqual(
            hm.generation_model_sequence(
                {
                    "exam": "JEE Advanced",
                    "subject": "Mathematics",
                    "toughness_level": 9,
                }
            ),
            [hm.MODEL_PRO],
        )

    def test_omitted_topic_uses_first_curriculum_topic(self):
        tags = hm.snap_passed_metatags(
            "Mathematics",
            {},
            {
                "subject": "Mathematics",
                "exam": "JEE Main",
                "chapter": "Matrices & Determinants",
                "question_type": "SCQ",
                "toughness_level": 6,
            },
        )
        self.assertEqual(tags["unit"], "Algebra")
        self.assertEqual(tags["chapter"], "Matrices & Determinants")
        self.assertEqual(tags["topic"], "Operations")
        self.assertEqual(hm.curriculum_topics("Mathematics", "Matrices & Determinants")[0], "Operations")

    def test_gemini_values_outside_allowed_lists_are_ignored(self):
        tags = hm.snap_passed_metatags(
            "Mathematics",
            {
                "unit": "Calculus",
                "chapter": "Not A Chapter",
                "topic": "Nope",
                "exam": "BITSAT",
                "question_type": "ESSAY",
                "toughness_level": "99",
            },
            {
                "subject": "Mathematics",
                "exam": "JEE Main",
                "chapter": "Matrices & Determinants",
                "topic": "Determinants",
                "question_type": "SCQ",
                "toughness_level": 5,
                "difficulty": "Medium",
            },
        )
        self.assertEqual(tags["unit"], "Algebra")
        self.assertEqual(tags["chapter"], "Matrices & Determinants")
        self.assertEqual(tags["topic"], "Determinants")
        self.assertEqual(tags["exam"], "JEE Main")
        self.assertEqual(tags["question_type"], "SCQ")
        self.assertEqual(tags["toughness_level"], 5)

    def test_code_execution_only_for_math_physics_and_physical_chemistry(self):
        self.assertEqual(
            hm.hybrid_code_execution_subject(
                {"subject": "Mathematics", "chapter": "Matrices & Determinants"}
            ),
            "mathematics",
        )
        self.assertEqual(
            hm.hybrid_code_execution_subject({"subject": "Physics", "chapter": "Rotation"}),
            "physics",
        )
        self.assertEqual(
            hm.hybrid_code_execution_subject(
                {"subject": "Chemistry", "chapter": "Electrochemistry"}
            ),
            "physical chemistry",
        )
        self.assertIsNone(
            hm.hybrid_code_execution_subject({"subject": "Chemistry", "chapter": "p-Block"})
        )
        self.assertIsNone(
            hm.hybrid_code_execution_subject({"subject": "Chemistry", "chapter": "Hydrocarbons"})
        )
        self.assertIsNone(
            hm.hybrid_code_execution_subject(
                {"subject": "Zoology", "chapter": "Human Reproduction"}
            )
        )
        self.assertIsNone(
            hm.hybrid_code_execution_subject({"subject": "Botany", "chapter": "Plant Morphology"})
        )

    def test_every_check_type_needs_a_complete_consistent_answer(self):
        stem = "Find the value asked in this complete question stem."
        passage = (
            "Passage about a class measurement of two lengths. "
            "Find the value asked in this complete question stem."
        )
        cases = (
            ("SCQ", stem, ["1", "2", "3", "4"], "A", "SCQ"),
            ("MSQ", stem, ["1", "2", "3", "4"], "A,C", "MSQ"),
            ("MTC", "Match List I with List II and choose the correct column pairing.", ["A-P", "A-Q", "A-R", "A-S"], "A", "MTC"),
            ("PSC", passage, ["1", "2", "3", "4"], "A", "PSC"),
            ("PNVQ", passage, [], "6", "PNVQ"),
            ("IVQ", stem, [], "4", "IVQ"),
            ("NVQ", stem, [], "5.5", "NVQ"),
            ("TF", "State whether this statement is true or false: two even numbers add to an even number.", ["TRUE", "FALSE"], "TRUE", "TF"),
        )
        for qtype, text, options, answer, stored in cases:
            draft = QuestionOutput(
                question_text=text,
                options=list(options),
                correct_answer=answer,
                step_by_step_solution="The marked answer agrees with the worked result.",
                bloom_level="Application",
            )
            self.assertEqual(hm.validate_hybrid_question(draft, qtype), [], qtype)
            fate = hm.decide_hybrid_draft_fate(
                {
                    "subject": "Mathematics",
                    "exam": "JEE Main",
                    "chapter": "Matrices & Determinants",
                    "topic": "Determinants",
                    "question_type": qtype,
                    "toughness_level": 5,
                    "question_text": text,
                    "options": list(options),
                    "correct_answer": answer,
                    "step_by_step_solution": "The marked answer agrees with the worked result.",
                    "bloom_level": "Application",
                }
            )
            self.assertEqual(fate["tray"], "ready", qtype)
            self.assertEqual(fate["tags"]["question_type"], stored, qtype)
            self.assertEqual(fate["tags"]["unit"], "Algebra", qtype)
            self.assertTrue(fate["tags"]["marking"], qtype)

            broken = hm.decide_hybrid_draft_fate(
                {
                    "subject": "Mathematics",
                    "exam": "JEE Main",
                    "chapter": "Matrices & Determinants",
                    "question_type": qtype,
                    "question_text": "Too short.",
                    "options": list(options),
                    "correct_answer": answer,
                    "step_by_step_solution": "The marked answer agrees with the worked result.",
                    "bloom_level": "Application",
                }
            )
            self.assertEqual(broken["tray"], "needs_action", qtype)
            self.assertFalse(broken["apply_metatags"], qtype)
            self.assertFalse(broken["tags"]["chapter"], qtype)
            self.assertFalse(broken["tags"]["question_type"], qtype)
            self.assertIsNone(broken["tags"]["toughness_level"], qtype)


if __name__ == "__main__":
    unittest.main()
