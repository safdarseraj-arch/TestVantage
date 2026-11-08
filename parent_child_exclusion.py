"""Mirror of src/utils/questionFamily.js parent/child exclusion."""

from __future__ import annotations

import re

_CHILD_SUFFIX_RE = re.compile(r"C(\d+)$")


def is_child_question(q) -> bool:
    if q is None:
        return False
    if isinstance(q, str):
        return _CHILD_SUFFIX_RE.search(q.strip()) is not None
    if q.get("is_child") is True or q.get("isChild") is True:
        return True
    parent_ref = str(q.get("parent_id") or q.get("parentId") or q.get("parentQuestionId") or "").strip()
    if parent_ref:
        return True
    qid = str(q.get("id") or "").strip()
    return _CHILD_SUFFIX_RE.search(qid) is not None


def _parent_key(q) -> str:
    if q is None:
        return ""
    if isinstance(q, str):
        qid = q.strip()
        return _CHILD_SUFFIX_RE.sub("", qid) if _CHILD_SUFFIX_RE.search(qid) else qid
    parent_ref = str(q.get("parent_id") or q.get("parentId") or q.get("parentQuestionId") or "").strip()
    if parent_ref:
        return _CHILD_SUFFIX_RE.sub("", parent_ref)
    qid = str(q.get("id") or "").strip()
    return _CHILD_SUFFIX_RE.sub("", qid) if _CHILD_SUFFIX_RE.search(qid) else qid


def enforce_parent_child_exclusion(selected_questions: list) -> list:
    if not selected_questions:
        return []
    families_with_parent = set()
    families_with_child = set()
    for q in selected_questions:
        pid = _parent_key(q)
        if not pid:
            continue
        if is_child_question(q):
            families_with_child.add(pid)
        else:
            families_with_parent.add(pid)
    out = []
    for q in selected_questions:
        pid = _parent_key(q)
        if not pid:
            out.append(q)
            continue
        if is_child_question(q):
            if pid in families_with_parent:
                continue
        elif pid in families_with_child and pid not in families_with_parent:
            continue
        out.append(q)
    return out
