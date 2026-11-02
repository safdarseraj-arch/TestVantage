"""Regression tests for parent/child mutual exclusion (mirrors JS gate)."""

import os
import sys

_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from parent_child_exclusion import enforce_parent_child_exclusion, is_child_question


def test_parent_blocks_child_in_same_pick():
    parent = {"id": "MBS20002"}
    child = {"id": "MBS20002C1", "parent_id": "MBS20002", "is_child": True}
    other = {"id": "MBS90001"}
    out = enforce_parent_child_exclusion([parent, child, other])
    assert [q["id"] for q in out] == ["MBS20002", "MBS90001"]


def test_child_only_family_keeps_child():
    child = {"id": "MBS20002C1", "parent_id": "MBS20002", "is_child": True}
    other = {"id": "MBS90001"}
    out = enforce_parent_child_exclusion([child, other])
    assert [q["id"] for q in out] == ["MBS20002C1", "MBS90001"]
    assert is_child_question(child)


if __name__ == "__main__":
    test_parent_blocks_child_in_same_pick()
    test_child_only_family_keeps_child()
    print("test_parent_child_exclusion: ok")