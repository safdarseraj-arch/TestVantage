"""Canonical exam/subject/question-type tags for Hybrid AI batch + pool rows."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from models import (
    APPROVAL_STATUS_NEEDS_ACTION,
    SUB_BANK_TYPE_AI,
    SUB_BANK_TYPES,
    SubBankType,
)

# Flash 3.7 and Pro use the project model ids.
MODEL_FLASH = "gemini-3.7-flash"
MODEL_PRO = "gemini-3-pro"
# Flash 2.7 tier. This repo has no gemini-2.7 model id.
# The cheaper Flash model already referenced in the app is gemini-2.5-flash.
MODEL_FLASH_27 = "gemini-2.5-flash"

# Bank types the completeness check must cover. MSQ is the stored alias of multi-correct MCQ.
HYBRID_CHECK_TYPES: tuple[str, ...] = (
    "SCQ",
    "MCQ",
    "MTC",
    "PSC",
    "PNVQ",
    "IVQ",
    "NVQ",
    "TF",
)

CANONICAL_EXAMS: tuple[str, ...] = ("JEE Main", "JEE Advanced", "NEET")

CANONICAL_SUBJECT_LABELS: tuple[str, ...] = (
    "Physics",
    "Chemistry",
    "Mathematics",
    "Botany",
    "Zoology",
)

CANONICAL_DIFFICULTIES: tuple[str, ...] = ("Easy", "Medium", "Hard")

# Stored on question_bank.question_type — aligned with examPatterns TYPE_SHORT_LABEL (SCQ/MSQ/NVQ).
CANONICAL_QUESTION_TYPE_CODES: tuple[str, ...] = ("SCQ", "MSQ", "NVQ")

_EXAM_ALIASES: dict[str, str] = {
    "jee main": "JEE Main",
    "jee-main": "JEE Main",
    "jeemain": "JEE Main",
    "main": "JEE Main",
    "jee advanced": "JEE Advanced",
    "jee-advanced": "JEE Advanced",
    "jeeadvanced": "JEE Advanced",
    "advanced": "JEE Advanced",
    "neet": "NEET",
    "neet ug": "NEET",
}

_SUBJECT_SLUG_TO_LABEL: dict[str, str] = {
    "physics": "Physics",
    "phy": "Physics",
    "chemistry": "Chemistry",
    "chem": "Chemistry",
    "mathematics": "Mathematics",
    "math": "Mathematics",
    "maths": "Mathematics",
    "mat": "Mathematics",
    "biology": "Botany",
    "bio": "Botany",
    "botany": "Botany",
    "zoology": "Zoology",
    "zoo": "Zoology",
}

_SUBJECT_LABEL_FOLD: dict[str, str] = {label.casefold(): label for label in CANONICAL_SUBJECT_LABELS}


def normalize_exam_label(exam: str | None) -> str:
    raw = " ".join(str(exam or "").strip().split())
    if not raw:
        raise ValueError("exam is required")
    key = raw.casefold()
    if key in _EXAM_ALIASES:
        return _EXAM_ALIASES[key]
    for canonical in CANONICAL_EXAMS:
        if key == canonical.casefold():
            return canonical
    raise ValueError(f"exam must be one of {', '.join(CANONICAL_EXAMS)}; got {raw!r}")


def normalize_hybrid_subject_label(subject: str | None, *, chapter: str | None = None) -> str:
    """Map UI slugs or labels to bank subject tags (never cross-map PCMB)."""
    raw = str(subject or "").strip()
    if not raw:
        raise ValueError("subject is required")
    key = raw.casefold().replace("-", "_")
    if key in _SUBJECT_SLUG_TO_LABEL:
        label = _SUBJECT_SLUG_TO_LABEL[key]
        if label == "Botany" and chapter:
            chap = str(chapter)
            if re.search(r"zoology|human|animal|reproduction|health|biotechnology", chap, re.I):
                return "Zoology"
        return label
    if key in _SUBJECT_LABEL_FOLD:
        return _SUBJECT_LABEL_FOLD[key]
    titled = raw[0].upper() + raw[1:] if raw else raw
    if titled.casefold() in _SUBJECT_LABEL_FOLD:
        return _SUBJECT_LABEL_FOLD[titled.casefold()]
    raise ValueError(
        f"subject must be one of {', '.join(CANONICAL_SUBJECT_LABELS)} "
        f"(or slugs physics/chemistry/mathematics/biology); got {raw!r}"
    )


def normalize_difficulty_label(difficulty: str | None) -> str:
    raw = str(difficulty or "").strip()
    if not raw:
        return "Medium"
    key = raw.casefold()
    for label in CANONICAL_DIFFICULTIES:
        if key == label.casefold():
            return label
    raise ValueError(f"difficulty must be one of {', '.join(CANONICAL_DIFFICULTIES)}; got {raw!r}")


def normalize_question_type_code(
    explicit: str | None,
    *,
    has_options: bool,
) -> str:
    """
    Normalize generator / UI labels to SCQ, MSQ, or NVQ for Postgres + pool API.
    """
    raw = str(explicit or "").strip()
    upper = raw.upper()
    folded = raw.casefold()

    if upper in ("MSQ", "MCQ_MULTI") or "multiple" in folded:
        return "MSQ"
    if upper in ("NVQ", "IVQ", "INTEGER", "NUMERICAL") or "numer" in folded or upper == "INTEGER":
        return "NVQ"
    if upper in ("SCQ", "MCQ", "SINGLE") or "single" in folded or folded in ("true_false", "true false"):
        return "SCQ"

    if has_options:
        return "SCQ"
    return "NVQ"


def normalize_sub_bank_type_value(raw: str | None) -> SubBankType | None:
    text = str(raw or "").strip().lower().replace("-", "_")
    if not text:
        return None
    if text == "similarpyq":
        text = "similar_pyq"
    if text in SUB_BANK_TYPES:
        return text  # type: ignore[return-value]
    return None


def resolve_batch_question_type(explicit: str | None) -> str:
    """Intent from the generator UI before the model returns options."""
    raw = str(explicit or "").strip()
    upper = raw.upper().replace(" ", "_").replace("-", "_").replace("/", "_")
    direct = {
        "SCQ": "SCQ",
        "MSQ": "MSQ",
        "MCQ": "MSQ",
        "MTC": "MTC",
        "MATCH": "MTC",
        "MATRIX_MATCH": "MTC",
        "PSC": "PSC",
        "PSCQ": "PSC",
        "PNVQ": "PNVQ",
        "PIVQ": "PNVQ",
        "IVQ": "IVQ",
        "INTEGER": "IVQ",
        "NVQ": "NVQ",
        "TF": "TF",
        "TRUE_FALSE": "TF",
        "T_F": "TF",
    }
    if upper in direct:
        return direct[upper]
    folded = raw.casefold()
    if "multiple" in folded or "multi-correct" in folded or "multi correct" in folded:
        return "MSQ"
    if "match" in folded:
        return "MTC"
    if "true" in folded and "false" in folded:
        return "TF"
    if "passage" in folded and ("num" in folded or "integer" in folded):
        return "PNVQ"
    if "passage" in folded:
        return "PSC"
    if folded in ("integer",):
        return "IVQ"
    if "numer" in folded or folded == "nvq":
        return "NVQ"
    if explicit:
        return normalize_question_type_code(explicit, has_options=True)
    return "SCQ"


def canonical_check_type(qtype: str | None) -> str:
    """Map stored codes onto the eight bank check types. MSQ is multi-correct MCQ."""
    code = resolve_batch_question_type(qtype) if qtype else "SCQ"
    if code == "MSQ":
        return "MCQ"
    if code in HYBRID_CHECK_TYPES:
        return code
    return "SCQ"


def resolve_toughness_level(data: dict[str, Any] | None) -> int:
    """T1–T10. An explicit toughness wins over the Easy/Medium/Hard label."""
    payload = data or {}
    for key in ("toughness_level", "toughness", "toughnessLevel"):
        raw = payload.get(key)
        if raw is None or str(raw).strip() == "":
            continue
        text = str(raw).strip().upper()
        if text.startswith("T") and text[1:].isdigit():
            text = text[1:]
        try:
            level = int(float(text))
        except ValueError:
            continue
        return max(1, min(10, level))
    difficulty = str(payload.get("difficulty") or "Medium").strip().casefold()
    if difficulty == "easy":
        return 2
    if difficulty == "hard":
        return 9
    return 5


def _routing_exam(exam: str | None) -> str:
    try:
        return normalize_exam_label(exam)
    except ValueError:
        return str(exam or "").strip()


def _routing_subject_family(subject: str | None) -> str:
    """mathematics, physics, chemistry, or biology (Botany and Zoology count as biology)."""
    raw = str(subject or "").strip().casefold().replace("-", " ").replace("_", " ")
    raw = " ".join(raw.split())
    if raw in {"biology", "bio", "botany", "zoology", "zoo"}:
        return "biology"
    try:
        label = normalize_hybrid_subject_label(subject)
    except ValueError:
        return raw
    if label in ("Botany", "Zoology"):
        return "biology"
    return label.casefold()


def hybrid_code_execution_subject(params: dict[str, Any] | None) -> str | None:
    """
    Subject key for Google code execution during generation and the Gemini check.

    Mathematics, Physics, and Physical Chemistry only. Biology, Botany, Zoology,
    Inorganic Chemistry, and Organic Chemistry stay off — code execution cannot
    verify that prose. Completeness and answer-shape checks still run for every type.
    """
    payload = params or {}
    family = _routing_subject_family(payload.get("subject"))
    if family == "mathematics":
        return "mathematics"
    if family == "physics":
        return "physics"
    if family == "chemistry":
        branch = chemistry_branch_name(
            payload.get("subject"),
            unit=payload.get("unit") or payload.get("section"),
            chapter=payload.get("chapter"),
            topic=payload.get("topic"),
        )
        if branch == "physical":
            return "physical chemistry"
    return None


def chemistry_branch_name(
    subject: str | None,
    *,
    unit: str | None = None,
    chapter: str | None = None,
    topic: str | None = None,
) -> str:
    """
    Inorganic, physical, or organic from Main-bank unit names.
    A chapter such as p-Block maps to Inorganic Chemistry. Empty when it is not chemistry.
    """

    def _from_label(raw: str | None) -> str:
        folded = _fold_curriculum_name(raw)
        if not folded:
            return ""
        if "inorganic" in folded:
            return "inorganic"
        if "physical" in folded:
            return "physical"
        if "organic" in folded:
            return "organic"
        return ""

    for raw in (unit, chapter):
        hit = _from_label(raw)
        if hit:
            return hit
    if _routing_subject_family(subject) != "chemistry" and not chapter and not unit:
        return ""
    try:
        tags = resolve_hybrid_curriculum_tags(
            subject or "Chemistry",
            unit=unit,
            chapter=chapter,
            topic=topic,
        )
    except Exception:
        return ""
    if not tags.get("mapped"):
        return ""
    return _from_label(str(tags.get("unit") or ""))


def resolve_generation_model(params: dict[str, Any] | None) -> str:
    """
    Flash 2.7 (gemini-2.5-flash), Pro (gemini-3-pro), or Flash 3.7 (gemini-3.7-flash).

    Flash 2.7:
    - NEET Biology, Physics, or Chemistry at any toughness
    - JEE Main or JEE Advanced Inorganic Chemistry at T1–T7
    - JEE Main or JEE Advanced Easy (T1–T3) Mathematics, Physical Chemistry,
      Organic Chemistry, or Physics

    Pro only for JEE Advanced Mathematics or Physics at T8–T10.
    Flash 3.7 for everything else.
    """
    payload = params or {}
    exam = _routing_exam(payload.get("exam"))
    family = _routing_subject_family(payload.get("subject"))
    level = resolve_toughness_level(payload)
    branch = ""
    if family == "chemistry":
        branch = chemistry_branch_name(
            payload.get("subject"),
            unit=payload.get("unit") or payload.get("section"),
            chapter=payload.get("chapter"),
            topic=payload.get("topic"),
        )
    jee = exam in ("JEE Main", "JEE Advanced")
    easy = level <= 3
    through_moderate = level <= 7
    tough = level >= 8

    if exam == "NEET" and family in ("biology", "physics", "chemistry"):
        return MODEL_FLASH_27
    if jee and branch == "inorganic" and through_moderate:
        return MODEL_FLASH_27
    if jee and easy and (family in ("mathematics", "physics") or branch in ("physical", "organic")):
        return MODEL_FLASH_27
    if exam == "JEE Advanced" and tough and family in ("mathematics", "physics"):
        return MODEL_PRO
    return MODEL_FLASH


def generation_model_sequence(params: dict[str, Any] | None) -> list[str]:
    """
    Stay on the routed model. Pro is not a fallback for Flash drafts.
    Flash gets a second try on the same model. Pro is a single first draft.
    """
    model = resolve_generation_model(params)
    if model == MODEL_PRO:
        return [MODEL_PRO]
    return [model, model]


def difficulty_for_toughness(level: int) -> str:
    if level <= 3:
        return "Easy"
    if level >= 8:
        return "Hard"
    return "Medium"


def _toughness_was_explicit(data: dict[str, Any]) -> bool:
    for key in ("toughness_level", "toughness", "toughnessLevel"):
        raw = data.get(key)
        if raw is not None and str(raw).strip() != "":
            return True
    return False


# Same names as src/data/curriculum.js (Main question bank). Do not invent a second list.
_CURRICULUM_JS = Path(__file__).resolve().parent / "src" / "data" / "curriculum.js"
_CURRICULUM_TREE: dict[str, Any] | None = None

# Folded aliases that still store the Main-bank spelling (Vectors & 3D, not a new unit).
_FOLD_ALIASES = {
    "vector and 3d": "vectors and 3d",
    "vector 3d": "vectors and 3d",
    "vectors 3d": "vectors and 3d",
}


def _skip_js_ws(text: str, i: int) -> int:
    n = len(text)
    while i < n:
        if text[i] in " \t\r\n":
            i += 1
            continue
        if text.startswith("//", i):
            nxt = text.find("\n", i)
            i = n if nxt < 0 else nxt + 1
            continue
        if text.startswith("/*", i):
            nxt = text.find("*/", i + 2)
            i = n if nxt < 0 else nxt + 2
            continue
        break
    return i


def _parse_js_string(text: str, i: int) -> tuple[str, int]:
    quote = text[i]
    i += 1
    chars: list[str] = []
    while i < len(text):
        ch = text[i]
        if ch == "\\":
            if i + 1 >= len(text):
                break
            chars.append(text[i + 1])
            i += 2
            continue
        if ch == quote:
            return "".join(chars), i + 1
        chars.append(ch)
        i += 1
    raise ValueError("Unclosed string in curriculum.js")


def _parse_js_key(text: str, i: int) -> tuple[str, int]:
    i = _skip_js_ws(text, i)
    if i < len(text) and text[i] in "'\"":
        return _parse_js_string(text, i)
    start = i
    while i < len(text) and (text[i].isalnum() or text[i] in "_$"):
        i += 1
    if start == i:
        raise ValueError(f"Expected curriculum key near {text[i:i+24]!r}")
    return text[start:i], i


def _parse_js_value(text: str, i: int) -> tuple[Any, int]:
    i = _skip_js_ws(text, i)
    if i >= len(text):
        raise ValueError("Unexpected end of curriculum.js")
    ch = text[i]
    if ch in "'\"":
        return _parse_js_string(text, i)
    if ch == "{":
        return _parse_js_object(text, i)
    if ch == "[":
        return _parse_js_array(text, i)
    raise ValueError(f"Unexpected curriculum value near {text[i:i+24]!r}")


def _parse_js_object(text: str, i: int) -> tuple[dict[str, Any], int]:
    i += 1
    out: dict[str, Any] = {}
    while True:
        i = _skip_js_ws(text, i)
        if i < len(text) and text[i] == "}":
            return out, i + 1
        key, i = _parse_js_key(text, i)
        i = _skip_js_ws(text, i)
        if i >= len(text) or text[i] != ":":
            raise ValueError(f"Expected ':' after curriculum key {key!r}")
        value, i = _parse_js_value(text, i + 1)
        out[key] = value
        i = _skip_js_ws(text, i)
        if i < len(text) and text[i] == ",":
            i += 1
            continue
        if i < len(text) and text[i] == "}":
            return out, i + 1
        raise ValueError(f"Expected ',' or '}}' after curriculum key {key!r}")


def _parse_js_array(text: str, i: int) -> tuple[list[Any], int]:
    i += 1
    out: list[Any] = []
    while True:
        i = _skip_js_ws(text, i)
        if i < len(text) and text[i] == "]":
            return out, i + 1
        value, i = _parse_js_value(text, i)
        out.append(value)
        i = _skip_js_ws(text, i)
        if i < len(text) and text[i] == ",":
            i += 1
            continue
        if i < len(text) and text[i] == "]":
            return out, i + 1
        raise ValueError("Expected ',' or ']' in curriculum.js")


def load_main_bank_curriculum() -> dict[str, Any]:
    """Subject → unit → chapter → topics, parsed from the Main bank curriculum file."""
    global _CURRICULUM_TREE
    if _CURRICULUM_TREE is not None:
        return _CURRICULUM_TREE
    text = _CURRICULUM_JS.read_text(encoding="utf-8")
    marker = text.find("CURRICULUM_TREE")
    if marker < 0:
        raise ValueError("CURRICULUM_TREE is missing from src/data/curriculum.js")
    brace = text.find("{", marker)
    tree, _end = _parse_js_value(text, brace)
    if not isinstance(tree, dict) or "mathematics" not in tree:
        raise ValueError("Main bank curriculum did not include mathematics")
    _CURRICULUM_TREE = tree
    return tree


def _fold_curriculum_name(name: str | None) -> str:
    text = str(name or "").casefold().replace("&", " and ")
    text = text.replace("'", "").replace("'", "")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    folded = " ".join(text.split())
    return _FOLD_ALIASES.get(folded, folded)


def _curriculum_tree_keys(subject: str | None) -> list[str]:
    raw = str(subject or "").strip().casefold().replace("-", " ").replace("_", " ")
    raw = " ".join(raw.split())
    if raw in {"mathematics", "math", "maths"}:
        return ["mathematics"]
    if raw in {"physics", "phy"}:
        return ["physics"]
    if raw in {"chemistry", "chem"}:
        return ["chemistry"]
    if raw == "botany":
        return ["botany", "biology"]
    if raw == "zoology":
        return ["zoology", "biology"]
    if raw == "biology":
        return ["biology", "botany", "zoology"]
    if raw in load_main_bank_curriculum():
        return [raw]
    return []


def _trees_for_subject(subject: str | None) -> list[dict[str, Any]]:
    tree = load_main_bank_curriculum()
    found: list[dict[str, Any]] = []
    for key in _curriculum_tree_keys(subject):
        node = tree.get(key)
        if isinstance(node, dict):
            found.append(node)
    return found


def curriculum_units(subject: str | None) -> list[str]:
    """Unit names in Main-bank order for one subject."""
    units: list[str] = []
    for node in _trees_for_subject(subject):
        for unit in node:
            if unit not in units:
                units.append(unit)
    return units


def curriculum_chapters(subject: str | None, unit: str | None = None) -> list[str]:
    """Chapter names under one Main-bank unit (or every unit when unit is omitted)."""
    names: list[str] = []
    want = _fold_curriculum_name(unit)
    for node in _trees_for_subject(subject):
        for unit_name, chapters in node.items():
            if want and _fold_curriculum_name(unit_name) != want:
                continue
            if not isinstance(chapters, dict):
                continue
            for chapter in chapters:
                if chapter not in names:
                    names.append(chapter)
    return names


def curriculum_topics(subject: str | None, chapter: str | None) -> list[str]:
    """Topic names under one Main-bank chapter. Empty when that chapter has none."""
    trees = _trees_for_subject(subject)
    hit = _pick_chapter_hit(trees, chapter, "") or _unique_chapter_prefix(trees, chapter)
    if not hit:
        return []
    return [str(topic) for topic in (hit.get("topics") or [])]


def _chapter_hits(trees: list[dict[str, Any]], name: str | None) -> list[dict[str, Any]]:
    folded = _fold_curriculum_name(name)
    if not folded:
        return []
    hits: list[dict[str, Any]] = []
    for node in trees:
        for unit, chapters in node.items():
            if not isinstance(chapters, dict):
                continue
            for chapter, topics in chapters.items():
                if _fold_curriculum_name(chapter) == folded:
                    hits.append(
                        {
                            "unit": unit,
                            "chapter": chapter,
                            "topics": list(topics) if isinstance(topics, list) else [],
                        }
                    )
    return hits


def _unique_chapter_prefix(
    trees: list[dict[str, Any]],
    name: str | None,
) -> dict[str, Any] | None:
    """Map a short label like 'Matrices' onto the one chapter it starts, e.g. Matrices & Determinants."""
    folded = _fold_curriculum_name(name)
    if len(folded) < 6:
        return None
    hits: list[dict[str, Any]] = []
    for node in trees:
        for unit, chapters in node.items():
            if not isinstance(chapters, dict):
                continue
            for chapter, topics in chapters.items():
                ch_fold = _fold_curriculum_name(chapter)
                if ch_fold.startswith(folded + " "):
                    hits.append(
                        {
                            "unit": unit,
                            "chapter": chapter,
                            "topics": list(topics) if isinstance(topics, list) else [],
                        }
                    )
    if len({(hit["unit"], hit["chapter"]) for hit in hits}) == 1 and hits:
        return hits[0]
    return None


def _pick_chapter_hit(
    trees: list[dict[str, Any]],
    name: str | None,
    prefer_unit: str | None = None,
) -> dict[str, Any] | None:
    hits = _chapter_hits(trees, name)
    if not hits:
        return None
    pref = _fold_curriculum_name(prefer_unit)
    if pref:
        for hit in hits:
            if _fold_curriculum_name(hit["unit"]) == pref:
                return hit
    return hits[0]


def _topic_hits(trees: list[dict[str, Any]], name: str | None) -> list[dict[str, Any]]:
    folded = _fold_curriculum_name(name)
    if not folded:
        return []
    hits: list[dict[str, Any]] = []
    for node in trees:
        for unit, chapters in node.items():
            if not isinstance(chapters, dict):
                continue
            for chapter, topics in chapters.items():
                for topic in topics or []:
                    if _fold_curriculum_name(str(topic)) == folded:
                        hits.append(
                            {
                                "unit": unit,
                                "chapter": chapter,
                                "topics": list(topics),
                                "topic": str(topic),
                            }
                        )
    return hits


def _pick_topic_hit(
    trees: list[dict[str, Any]],
    name: str | None,
    prefer_unit: str | None = None,
) -> dict[str, Any] | None:
    hits = _topic_hits(trees, name)
    if not hits:
        return None
    pref = _fold_curriculum_name(prefer_unit)
    if pref:
        narrowed = [hit for hit in hits if _fold_curriculum_name(hit["unit"]) == pref]
        if len(narrowed) == 1:
            return narrowed[0]
        if len({(h["unit"], h["chapter"]) for h in narrowed}) == 1 and narrowed:
            return narrowed[0]
    keys = {(hit["unit"], hit["chapter"]) for hit in hits}
    if len(keys) == 1:
        return hits[0]
    return None


def _canonical_unit(trees: list[dict[str, Any]], name: str | None) -> str | None:
    folded = _fold_curriculum_name(name)
    if not folded:
        return None
    for node in trees:
        for unit in node:
            if _fold_curriculum_name(unit) == folded:
                return str(unit)
    return None


def _topic_under(hit: dict[str, Any], name: str | None) -> str:
    folded = _fold_curriculum_name(name)
    if not folded:
        return ""
    for topic in hit.get("topics") or []:
        if _fold_curriculum_name(str(topic)) == folded:
            return str(topic)
    return ""


def resolve_hybrid_curriculum_tags(
    subject: str | None,
    *,
    unit: str | None = None,
    section: str | None = None,
    chapter: str | None = None,
    topic: str | None = None,
) -> dict[str, Any]:
    """
    Map Hybrid tags onto the Main bank curriculum.

    ``unit`` / ``section`` is the curriculum unit. ``chapter`` stays the chapter.
    A chapter name in the unit field is replaced with its parent unit.
    An unknown chapter is left unset and is never copied into the unit.
    """
    raw_unit = str(unit if unit is not None and str(unit).strip() else section or "").strip()
    raw_chapter = str(chapter or "").strip()
    raw_topic = str(topic or "").strip()
    if raw_topic and raw_chapter and _fold_curriculum_name(raw_topic) == _fold_curriculum_name(raw_chapter):
        raw_topic = ""

    trees = _trees_for_subject(subject)
    hit = _pick_chapter_hit(trees, raw_chapter, raw_unit)
    if hit is None and raw_topic:
        hit = _pick_chapter_hit(trees, raw_topic, raw_unit or raw_chapter)
    if hit is None and raw_unit:
        hit = _pick_chapter_hit(trees, raw_unit, "")
    if hit is None:
        hit = (
            _unique_chapter_prefix(trees, raw_chapter)
            or _unique_chapter_prefix(trees, raw_topic)
            or _unique_chapter_prefix(trees, raw_unit)
        )
    if hit is None:
        topic_hit = (
            _pick_topic_hit(trees, raw_chapter, raw_unit)
            or _pick_topic_hit(trees, raw_topic, raw_unit or raw_chapter)
            or _pick_topic_hit(trees, raw_unit, "")
        )
        if topic_hit is not None:
            hit = topic_hit
            if not raw_topic:
                raw_topic = str(topic_hit.get("topic") or "")

    if hit is not None:
        topic_out = _topic_under(hit, raw_topic) or _topic_under(hit, raw_chapter)
        if (
            not topic_out
            and raw_topic
            and not _chapter_hits(trees, raw_topic)
            and _canonical_unit(trees, raw_topic) is None
            and _fold_curriculum_name(raw_topic)
            not in {_fold_curriculum_name(hit["chapter"]), _fold_curriculum_name(hit["unit"])}
        ):
            topic_out = raw_topic
        return {
            "mapped": True,
            "unit": hit["unit"],
            "chapter": hit["chapter"],
            "topic": topic_out or "",
        }

    return {
        "mapped": False,
        "unit": _canonical_unit(trees, raw_unit) or "",
        "chapter": "",
        "topic": "",
    }


def batch_params_from_request(data: dict[str, Any]) -> dict[str, Any]:
    """Validate and canonicalize a batch job dict before generation."""
    chapter = str(data.get("chapter") or data.get("topic") or "").strip()
    if not chapter:
        raise ValueError("chapter or topic is required")
    subject = normalize_hybrid_subject_label(data.get("subject"), chapter=chapter)
    exam = normalize_exam_label(data.get("exam"))
    difficulty = normalize_difficulty_label(data.get("difficulty"))
    qtype = resolve_batch_question_type(data.get("question_type"))
    topic_in = str(data.get("topic") or "").strip()
    if _fold_curriculum_name(topic_in) == _fold_curriculum_name(chapter):
        topic_in = ""
    tags = resolve_hybrid_curriculum_tags(
        subject,
        unit=data.get("unit") or data.get("section"),
        chapter=chapter,
        topic=topic_in,
    )
    if not tags["mapped"]:
        raise ValueError(
            f"chapter {chapter!r} is not a Main question bank chapter for {subject}. "
            "Pick a curriculum chapter (for example Matrices & Determinants under Algebra). "
            "Do not store a chapter name as the unit."
        )

    out = dict(data)
    out["subject"] = subject
    out["exam"] = exam
    out["difficulty"] = difficulty
    out["unit"] = tags["unit"]
    out["section"] = tags["unit"]
    out["chapter"] = tags["chapter"]
    out["topic"] = tags["topic"] or tags["chapter"]
    out["question_type"] = qtype
    out["sub_bank_type"] = SUB_BANK_TYPE_AI
    level = resolve_toughness_level(data)
    out["toughness_level"] = level
    if _toughness_was_explicit(data):
        out["difficulty"] = difficulty_for_toughness(level)
    return out


def clone_parent_metadata(
    params: dict[str, Any],
    parent_row: Any | None,
) -> tuple[str, str, str, str | None]:
    """Exam, subject, chapter, topic for clone inserts when parent may be client-only."""
    chapter = str(params.get("chapter") or "").strip()
    if parent_row is not None:
        exam = str(parent_row.exam)
        subject = str(parent_row.subject)
        chapter = chapter or str(parent_row.chapter)
        topic = parent_row.topic
        return exam, subject, chapter, topic

    exam = normalize_exam_label(params.get("exam") or "JEE Main")
    sub_chapter = chapter or str(params.get("topic") or "General")
    subject = normalize_hybrid_subject_label(params.get("subject") or "General", chapter=sub_chapter)
    topic = str(params.get("topic") or "").strip() or None
    if not chapter:
        chapter = sub_chapter
    return exam, subject, chapter, topic


_OPTION_LABEL = re.compile(r"^\(\s*([A-D])\s*\)\s*|^[A-D][\)\.\:]\s+", re.I)
_ANSWER_LETTER = re.compile(r"^[A-D]$", re.I)


def _strip_option_label(text: str) -> str:
    return _OPTION_LABEL.sub("", str(text or "").strip()).strip()


def _question_type_needs_options(qtype: str) -> bool:
    return canonical_check_type(qtype) in ("SCQ", "MCQ", "TF", "MTC", "PSC")


_RESULT_NUMBER = re.compile(
    r"(?:=|equals|answer\s+is)\s*\$*\s*([-+]?\d+(?:\.\d+)?)\b",
    re.IGNORECASE,
)
_PURE_NUMBER = re.compile(r"^\s*([-+]?\d+(?:\.\d+)?)\s*$")
_MULTI_LETTERS = re.compile(r"[A-D]", re.IGNORECASE)
_GENERIC_ASK = re.compile(
    r"\?|\b(?:find|which|what|calculate|compute|evaluate|determine|choose|select|"
    r"match|prove|show\s+that|how\s+many|identify|true\s+or\s+false|state\s+whether|"
    r"the\s+value|column)\b",
    re.IGNORECASE,
)


def _stem_has_any_ask(stem: str) -> bool:
    from hybrid_latex_sanitize import stem_has_real_ask

    text = str(stem or "")
    if stem_has_real_ask(text):
        return True
    return bool(_GENERIC_ASK.search(text))


def _final_numeric_result(*parts: str) -> str | None:
    found: list[str] = []
    for part in parts:
        found.extend(_RESULT_NUMBER.findall(str(part or "")))
    return found[-1] if found else None


def _pure_number(text: str) -> str | None:
    match = _PURE_NUMBER.match(str(text or ""))
    return match.group(1) if match else None


def _numbers_equal(left: str, right: str) -> bool:
    try:
        return abs(float(left) - float(right)) < 1e-6
    except ValueError:
        return False


def _marked_answer_text(draft: Any, qtype: str) -> str:
    answer = str(getattr(draft, "correct_answer", "") or "").strip()
    options = [str(o).strip() for o in (getattr(draft, "options", None) or [])]
    code = canonical_check_type(qtype)
    if code in ("NVQ", "IVQ", "PNVQ", "TF"):
        return answer
    if _ANSWER_LETTER.match(answer):
        idx = ord(answer.upper()) - ord("A")
        if 0 <= idx < len(options):
            return options[idx]
    return answer


def _answer_consistency_errors(draft: Any, qtype: str) -> list[str]:
    """When the solution states a number or a matrix, the marked answer must agree."""
    from hybrid_latex_sanitize import _MATRIX_ENV

    errors: list[str] = []
    solution = str(getattr(draft, "step_by_step_solution", "") or "")
    stem = str(getattr(draft, "question_text", "") or "")
    marked = _marked_answer_text(draft, qtype)
    result = _final_numeric_result(solution)
    marked_number = _pure_number(marked)
    if result and marked_number and not _numbers_equal(result, marked_number):
        errors.append("Marked answer does not match the result in the solution.")

    solution_matrices = [re.sub(r"\s+", "", m.group(2)) for m in _MATRIX_ENV.finditer(solution)]
    marked_matrices = [re.sub(r"\s+", "", m.group(2)) for m in _MATRIX_ENV.finditer(marked)]
    if solution_matrices and marked_matrices and solution_matrices[-1] != marked_matrices[-1]:
        errors.append("Marked answer does not match the matrix result in the solution.")
    del stem
    return errors


def _type_shape_errors(draft: Any, qtype: str) -> list[str]:
    """Options and marked answer must match the bank type."""
    errors: list[str] = []
    code = canonical_check_type(qtype)
    stem = str(getattr(draft, "question_text", "") or "").strip()
    options = [str(o).strip() for o in (getattr(draft, "options", None) or [])]
    filled = [o for o in options if o]
    answer = str(getattr(draft, "correct_answer", "") or "").strip()

    if code == "SCQ":
        if len(filled) < 4:
            errors.append(f"SCQ needs 4 options (found {len(filled)}).")
        if not answer:
            errors.append("Correct answer is missing.")
        elif _ANSWER_LETTER.match(answer):
            idx = ord(answer.upper()) - ord("A")
            if idx < 0 or idx > 3 or not (options[idx] if idx < len(options) else "").strip():
                errors.append("Correct answer letter does not match a filled option.")
        elif answer not in filled:
            errors.append("Correct answer must match an option or A-D letter.")
    elif code == "MCQ":
        if len(filled) < 4:
            errors.append(f"MCQ needs 4 options (found {len(filled)}).")
        letters = _MULTI_LETTERS.findall(answer.upper()) if answer else []
        if not letters:
            errors.append("MCQ correct answer must list the correct option letters.")
        else:
            for letter in letters:
                idx = ord(letter) - ord("A")
                if idx < 0 or idx >= len(options) or not options[idx].strip():
                    errors.append("MCQ correct answer letter does not match a filled option.")
                    break
    elif code == "TF":
        if len(filled) != 2:
            errors.append("TF needs exactly two options (TRUE and FALSE).")
        folded = answer.casefold()
        if folded not in ("true", "false", "t", "f", "a", "b"):
            errors.append("TF correct answer must be TRUE or FALSE.")
    elif code == "MTC":
        if not re.search(r"column|match|list\s*-?\s*i", stem, re.IGNORECASE):
            errors.append("Match question needs two columns (List I and List II).")
        if not answer:
            errors.append("Correct answer is missing.")
    elif code == "PSC":
        if len(stem) < 40:
            errors.append("Passage question needs a passage and an ask.")
        if len(filled) < 4:
            errors.append(f"PSC needs 4 options (found {len(filled)}).")
        if not answer:
            errors.append("Correct answer is missing.")
        elif _ANSWER_LETTER.match(answer):
            idx = ord(answer.upper()) - ord("A")
            if idx < 0 or idx > 3 or not (options[idx] if idx < len(options) else "").strip():
                errors.append("Correct answer letter does not match a filled option.")
    elif code == "IVQ":
        if filled:
            errors.append("IVQ must not have A–D options.")
        if not re.fullmatch(r"-?\d+", answer):
            errors.append("Integer answer must be a whole number.")
    elif code in ("NVQ", "PNVQ"):
        if code == "PNVQ" and len(stem) < 40:
            errors.append("Passage numerical question needs a passage and an ask.")
        if filled:
            errors.append(f"{code} must not have A–D options.")
        if not answer:
            errors.append("Numerical answer is missing.")
        elif _pure_number(answer) is None:
            errors.append("Numerical answer must be a number.")
    return errors


def repair_hybrid_question(draft: Any, qtype: str) -> Any:
    """Normalize options and correct_answer before Postgres insert."""
    from ai_generator import QuestionOutput
    from hybrid_latex_sanitize import sanitize_hybrid_latex_text, sanitize_hybrid_option

    stem = sanitize_hybrid_latex_text(str(draft.question_text or "").strip())
    options = [
        sanitize_hybrid_option(stem, _strip_option_label(o))
        for o in (draft.options or [])
        if _strip_option_label(o)
    ]
    answer_raw = str(draft.correct_answer or "").strip()
    answer_letter = answer_raw.upper() if _ANSWER_LETTER.match(answer_raw) else ""

    if _question_type_needs_options(qtype):
        options = options[:4]
        if answer_letter:
            idx = ord(answer_letter) - ord("A")
            if 0 <= idx < len(options) and options[idx]:
                answer_raw = answer_letter
        elif answer_raw:
            idx = next((i for i, o in enumerate(options) if o and o == answer_raw), -1)
            if idx >= 0:
                answer_raw = chr(ord("A") + idx)
    else:
        options = []

    from models import normalize_bloom_level

    try:
        bloom = normalize_bloom_level(draft.bloom_level)
    except ValueError:
        bloom = None
    if bloom is None:
        bloom = "Application"

    return QuestionOutput(
        question_text=stem,
        options=options,
        correct_answer=answer_raw or str(draft.correct_answer or "").strip(),
        step_by_step_solution=sanitize_hybrid_latex_text(str(draft.step_by_step_solution or "").strip()),
        bloom_level=bloom,
    )


def validate_hybrid_question(draft: Any, qtype: str) -> list[str]:
    """Return human-readable errors; empty list means ready to insert."""
    from models import normalize_bloom_level

    errors: list[str] = []
    stem = str(draft.question_text or "").strip()
    if len(stem) < 12:
        errors.append("Question stem is too short.")
    # Empty solution is a warning (see hybrid_question_warnings), not a reason to drop the row.
    solution = str(draft.step_by_step_solution or "").strip()

    if normalize_bloom_level(draft.bloom_level) is None:
        errors.append("Bloom level is missing or invalid.")

    if "$$" in stem or "$$" in solution:
        errors.append("Fix unbalanced LaTeX delimiters before save.")

    from hybrid_latex_sanitize import (
        INCOMPLETE_MATRIX_STEM_ERROR,
        stem_is_incomplete_matrix_only,
    )

    incomplete_stem = stem_is_incomplete_matrix_only(stem)
    if incomplete_stem:
        errors.append(INCOMPLETE_MATRIX_STEM_ERROR)
    elif stem and not _stem_has_any_ask(stem):
        errors.append("Stem has no real ask.")

    errors.extend(_type_shape_errors(draft, qtype))
    if not incomplete_stem:
        errors.extend(_answer_consistency_errors(draft, qtype))

    return errors


def hybrid_question_warnings(draft: Any, qtype: str) -> list[str]:
    """Notes that do not block insert. An empty solution is a warning; a missing ask is an error."""
    del qtype
    warnings: list[str] = []
    solution = str(getattr(draft, "step_by_step_solution", "") or "").strip()
    if not solution:
        warnings.append("Step-by-step solution is empty.")
    elif len(solution) < 20:
        warnings.append("Step-by-step solution is very short.")
    return warnings


# Main bank tag editor (QuestionMetadataForm / QuickTagPanel), in editor order.
# Browser names: section←unit, questionType←question_type, examIds←exam,
# toughnessLevel←toughness_level. Source is field 8. Language is not an editor field.
EDITOR_METATAG_FIELDS: tuple[str, ...] = (
    "subject",
    "unit",
    "chapter",
    "topic",
    "question_type",
    "exam",
    "toughness_level",
    "source",
)

# Same numbers as src/data/questionTypes.js QUESTION_TYPES[].defaultMarking.
_TYPE_DEFAULT_MARKING: dict[str, dict[str, int]] = {
    "SCQ": {"correct": 4, "wrong": -1, "unattempted": 0},
    "TF": {"correct": 4, "wrong": -1, "unattempted": 0},
    "PSC": {"correct": 4, "wrong": -1, "unattempted": 0},
    "MCQ": {"correct": 4, "wrong": -2, "unattempted": 0, "partial": 1},
    "MTC": {"correct": 4, "wrong": -2, "unattempted": 0},
    "IVQ": {"correct": 4, "wrong": 0, "unattempted": 0},
    "NVQ": {"correct": 4, "wrong": 0, "unattempted": 0},
    "PNVQ": {"correct": 4, "wrong": 0, "unattempted": 0},
}

_GEMINI_QUESTION_TYPE_TOKENS = frozenset(
    {
        "SCQ",
        "MSQ",
        "MCQ",
        "MTC",
        "PSC",
        "PSCQ",
        "PNVQ",
        "PIVQ",
        "IVQ",
        "NVQ",
        "TF",
        "INTEGER",
        "TRUE_FALSE",
        "T_F",
        "MATCH",
        "MATRIX_MATCH",
        "SINGLE",
        "SINGLE_CHOICE",
        "MULTIPLE",
        "MULTIPLE_CHOICE",
        "NUMERICAL",
    }
)


def default_marking_for_question_type(qtype: str | None) -> dict[str, int]:
    """Marks the tag editor does not type in. They follow the bank type default."""
    code = canonical_check_type(qtype)
    marking = _TYPE_DEFAULT_MARKING.get(code) or _TYPE_DEFAULT_MARKING["SCQ"]
    return dict(marking)


def empty_hybrid_metatags() -> dict[str, Any]:
    """Needs action. Every editor tag is blank. Sub-bank is not a curriculum tag."""
    return {
        "mapped": False,
        "subject": "",
        "unit": "",
        "section": "",
        "chapter": "",
        "topic": "",
        "question_type": "",
        "exam": "",
        "toughness_level": None,
        "difficulty": "",
        "source": "",
        "marking": None,
        "sub_bank_type": "",
    }


def _question_type_from_value(raw: str | None, *, from_model: bool) -> str:
    text = str(raw or "").strip()
    if not text:
        return ""
    upper = text.upper().replace(" ", "_").replace("-", "_").replace("/", "_")
    if from_model:
        folded = text.casefold()
        keyword = any(
            bit in folded
            for bit in ("multiple", "match", "passage", "numer", "integer", "true", "single")
        )
        if upper not in _GEMINI_QUESTION_TYPE_TOKENS and not keyword:
            return ""
    return resolve_batch_question_type(text)


def _exam_from_value(raw: str | None) -> str:
    text = str(raw or "").strip()
    if not text:
        return ""
    try:
        return normalize_exam_label(text)
    except ValueError:
        return ""


def _topic_on_chapter(subject: str | None, chapter: str, raw_topic: str | None) -> str:
    allowed = curriculum_topics(subject, chapter)
    folded = _fold_curriculum_name(raw_topic)
    if folded:
        for topic in allowed:
            if _fold_curriculum_name(topic) == folded:
                return topic
    return ""


def snap_passed_metatags(
    subject: str | None,
    proposed: dict[str, Any] | None,
    job: dict[str, Any] | None,
) -> dict[str, Any]:
    """
    Full Main-bank tag set after a passed check.

    Unit stays the curriculum unit. Chapter and topic must be names in that
    tree. Question type, exam, and toughness come from the generation request;
    Gemini may fill a gap only with a value on the allowed list. A chapter
    name is never stored as the unit.
    """
    from hybrid_latex_sanitize import HYBRID_AI_SOURCE_LABEL

    proposed = proposed or {}
    job = job or {}
    subject_in = job.get("subject") or subject
    tags = resolve_hybrid_curriculum_tags(
        subject_in,
        unit=proposed.get("unit") or job.get("unit") or job.get("section"),
        chapter=proposed.get("chapter") or job.get("chapter"),
        topic=proposed.get("topic") if proposed.get("topic") not in (None, "") else job.get("topic"),
    )
    if not tags["mapped"]:
        tags = resolve_hybrid_curriculum_tags(
            subject_in,
            unit=job.get("unit") or job.get("section"),
            chapter=job.get("chapter"),
            topic=job.get("topic"),
        )
    if not tags["mapped"]:
        return empty_hybrid_metatags()

    chapter = str(tags["chapter"] or "")
    topic = str(tags["topic"] or "")
    if not topic:
        topic = _topic_on_chapter(subject_in, chapter, proposed.get("topic"))
    if not topic:
        topic = _topic_on_chapter(subject_in, chapter, job.get("topic"))
    if not topic:
        allowed_topics = curriculum_topics(subject_in, chapter)
        if allowed_topics:
            topic = allowed_topics[0]

    try:
        subject_label = normalize_hybrid_subject_label(subject_in, chapter=chapter)
    except ValueError:
        subject_label = str(subject_in or "").strip()

    question_type = _question_type_from_value(job.get("question_type"), from_model=False)
    if not question_type:
        question_type = _question_type_from_value(proposed.get("question_type"), from_model=True)
    if not question_type:
        question_type = "SCQ"

    exam = _exam_from_value(job.get("exam")) or _exam_from_value(proposed.get("exam"))

    if _toughness_was_explicit(job) or str(job.get("difficulty") or "").strip():
        level = resolve_toughness_level(job)
    elif str(proposed.get("toughness_level") or proposed.get("toughness") or "").strip():
        level = resolve_toughness_level(
            {"toughness_level": proposed.get("toughness_level") or proposed.get("toughness")}
        )
    else:
        level = resolve_toughness_level(job)

    if _toughness_was_explicit(job):
        difficulty = difficulty_for_toughness(level)
    else:
        try:
            difficulty = (
                normalize_difficulty_label(job.get("difficulty"))
                if str(job.get("difficulty") or "").strip()
                else ""
            )
        except ValueError:
            difficulty = ""
        if not difficulty:
            proposed_difficulty = str(proposed.get("difficulty") or "").strip()
            if proposed_difficulty:
                try:
                    difficulty = normalize_difficulty_label(proposed_difficulty)
                except ValueError:
                    difficulty = ""
        if not difficulty:
            difficulty = difficulty_for_toughness(level)

    return {
        "mapped": True,
        "subject": subject_label,
        "unit": tags["unit"],
        "section": tags["unit"],
        "chapter": chapter,
        "topic": topic,
        "question_type": question_type,
        "exam": exam,
        "toughness_level": level,
        "difficulty": difficulty,
        "source": HYBRID_AI_SOURCE_LABEL,
        "marking": default_marking_for_question_type(question_type),
        "sub_bank_type": SUB_BANK_TYPE_AI,
    }


def _metatag_updates(tags: dict[str, Any]) -> dict[str, Any]:
    """Editor tags to write. Skips blanks so a failed check never stores them."""
    updates: dict[str, Any] = {}
    if not tags.get("mapped"):
        return updates
    updates["subject"] = tags["subject"]
    updates["unit"] = tags["unit"]
    updates["section"] = tags["unit"]
    updates["chapter"] = tags["chapter"]
    if tags.get("topic"):
        updates["topic"] = tags["topic"]
    if tags.get("question_type"):
        updates["question_type"] = tags["question_type"]
    if tags.get("exam"):
        updates["exam"] = tags["exam"]
    if tags.get("toughness_level") is not None:
        updates["toughness_level"] = tags["toughness_level"]
    if tags.get("difficulty"):
        updates["difficulty"] = tags["difficulty"]
    if tags.get("source"):
        updates["source"] = tags["source"]
    if tags.get("marking"):
        updates["marking"] = tags["marking"]
    if tags.get("sub_bank_type"):
        updates["sub_bank_type"] = tags["sub_bank_type"]
    return updates


def decide_hybrid_draft_fate(row: dict[str, Any]) -> dict[str, Any]:
    """
    Platform recheck. Fail → Needs action and no metatags.
    Pass → the full Main-bank tag set may be applied (Gemini fills gaps only
    after this returns ready, and only from the allowed lists).
    """
    subject = row.get("subject")
    chapter = row.get("chapter")
    topic = row.get("topic")
    unit = row.get("unit") if row.get("unit") not in (None, "") else row.get("section")

    class _Draft:
        question_text = str(row.get("question_text") or row.get("text") or "")
        options = list(row.get("options") or [])
        correct_answer = str(row.get("correct_answer") or row.get("correctAnswer") or "")
        step_by_step_solution = str(row.get("step_by_step_solution") or row.get("solution") or "")
        bloom_level = row.get("bloom_level") or "Application"

    qtype = str(row.get("question_type") or "SCQ")
    try:
        checked = repair_hybrid_question(_Draft(), qtype)
    except Exception:
        checked = _Draft()
    errors = list(validate_hybrid_question(checked, qtype))
    for reason in row.get("gemini_errors") or []:
        text = str(reason or "").strip()
        if text and text not in errors:
            errors.append(text)

    if errors:
        blank = empty_hybrid_metatags()
        return {
            "tray": "needs_action",
            "apply_metatags": False,
            "needs_action": True,
            "errors": errors,
            "unit": "",
            "chapter": "",
            "topic": "",
            "tags": blank,
            "updates": {
                "approval_status": APPROVAL_STATUS_NEEDS_ACTION,
                "needs_action": True,
            },
        }

    tags = snap_passed_metatags(
        subject,
        {"unit": unit, "chapter": chapter, "topic": topic},
        row,
    )
    return {
        "tray": "ready",
        "apply_metatags": bool(tags["mapped"]),
        "needs_action": False,
        "errors": [],
        "unit": tags["unit"] if tags["mapped"] else "",
        "chapter": tags["chapter"] if tags["mapped"] else "",
        "topic": tags["topic"] if tags["mapped"] else "",
        "tags": tags,
        "updates": _metatag_updates(tags),
    }


def plan_hybrid_ai_recheck(row: dict[str, Any]) -> dict[str, Any]:
    """
    Tag fix + completeness flag for one AI pool row.

    A failed check writes no metatags (Needs action).
    A passed check fills the Main-bank tag set. Question text, options, and the
    solution are never rewritten.
    """
    subject = row.get("subject")
    unit = row.get("unit") if row.get("unit") not in (None, "") else row.get("section")
    chapter = row.get("chapter")
    topic = row.get("topic")
    tags = resolve_hybrid_curriculum_tags(subject, unit=unit, chapter=chapter, topic=topic)

    class _Draft:
        question_text = str(row.get("question_text") or row.get("text") or "")
        options = list(row.get("options") or [])
        correct_answer = str(row.get("correct_answer") or row.get("correctAnswer") or "")
        step_by_step_solution = str(row.get("step_by_step_solution") or row.get("solution") or "")
        bloom_level = row.get("bloom_level") or "Application"

    qtype = str(row.get("question_type") or "SCQ")
    try:
        checked = repair_hybrid_question(_Draft(), qtype)
    except Exception:
        checked = _Draft()
    errors = validate_hybrid_question(checked, qtype)
    warnings = hybrid_question_warnings(checked, qtype)

    updates: dict[str, Any] = {}
    wrong_unit = False
    if tags["mapped"]:
        if str(unit or "").strip() != tags["unit"]:
            wrong_unit = True
            updates["unit"] = tags["unit"]
        if str(chapter or "").strip() != tags["chapter"]:
            wrong_unit = True
            updates["chapter"] = tags["chapter"]
        new_topic = tags["topic"] or None
        old_topic = str(topic or "").strip() or None
        chapter_names = {
            str(chapter or "").strip(),
            str(unit or "").strip(),
            tags["chapter"],
            tags["unit"],
        }
        if old_topic != new_topic and (new_topic or old_topic in chapter_names):
            updates["topic"] = new_topic
    elif str(unit or "").strip() and str(unit or "").strip() == str(chapter or "").strip():
        wrong_unit = True

    approval = str(row.get("approval_status") or "")
    if errors:
        for key in (
            "unit",
            "section",
            "chapter",
            "topic",
            "subject",
            "question_type",
            "exam",
            "toughness_level",
            "difficulty",
            "source",
            "marking",
            "sub_bank_type",
        ):
            updates.pop(key, None)
        updates["needs_action"] = True
        if approval != APPROVAL_STATUS_NEEDS_ACTION:
            updates["approval_status"] = APPROVAL_STATUS_NEEDS_ACTION
        reported_unit = ""
        reported_chapter = ""
        reported_tags = empty_hybrid_metatags()
        tray = "needs_action"
    else:
        reported_tags = snap_passed_metatags(subject, None, row)
        reported_unit = reported_tags["unit"] if reported_tags["mapped"] else ""
        reported_chapter = reported_tags["chapter"] if reported_tags["mapped"] else ""
        updates.update(_metatag_updates(reported_tags))
        tray = "ready"

    for banned in ("question_text", "text", "options", "step_by_step_solution", "solution", "correct_answer"):
        updates.pop(banned, None)

    return {
        "mapped": bool(tags["mapped"]) if errors else bool(reported_tags["mapped"]),
        "wrong_unit": wrong_unit,
        "incomplete": bool(errors),
        "needs_action": tray == "needs_action",
        "tray": tray,
        "apply_metatags": tray == "ready" and bool(reported_tags["mapped"]),
        "errors": errors,
        "warnings": warnings,
        "updates": updates,
        "unit": reported_unit,
        "chapter": reported_chapter,
        "tags": reported_tags,
    }


def prepare_clone_for_insert(clone: Any, qtype: str) -> tuple[Any, list[str]]:
    """
    Same repair + validation path as batch ``draft_question`` before Postgres insert.
    Returns (repaired QuestionOutput, errors); non-empty errors means skip the row.
    """
    from ai_generator import QuestionOutput

    draft = QuestionOutput(
        question_text=str(getattr(clone, "question_text", "") or ""),
        options=list(getattr(clone, "options", None) or []),
        correct_answer=str(getattr(clone, "correct_answer", "") or ""),
        step_by_step_solution=str(getattr(clone, "step_by_step_solution", "") or ""),
        bloom_level=str(getattr(clone, "bloom_level", None) or "Application"),
    )
    repaired = repair_hybrid_question(draft, qtype)
    return repaired, validate_hybrid_question(repaired, qtype)
