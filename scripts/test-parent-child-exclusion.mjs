import assert from 'node:assert/strict'
import {
  enforce_parent_child_exclusion,
  isChildQuestion,
  parentKeyForQuestion,
} from '../src/utils/parentChildExclusion.js'

assert.equal(parentKeyForQuestion({ id: 'MBS20002' }), 'MBS20002')
assert.equal(parentKeyForQuestion({ id: 'MBS20002C1', parent_id: 'MBS20002' }), 'MBS20002')
assert.equal(isChildQuestion({ id: 'MBS20002C2', is_child: true }), true)

const parent = { id: 'MBS20002' }
const child1 = { id: 'MBS20002C1', parent_id: 'MBS20002', is_child: true }
const other = { id: 'MBS90001' }

assert.deepEqual(
  enforce_parent_child_exclusion([parent, child1, other]).map((q) => q.id),
  ['MBS20002', 'MBS90001'],
)
assert.deepEqual(
  enforce_parent_child_exclusion([child1, other]).map((q) => q.id),
  ['MBS20002C1', 'MBS90001'],
)

console.log('test-parent-child-exclusion: ok')
