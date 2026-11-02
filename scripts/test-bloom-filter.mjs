import assert from 'node:assert/strict'
import { filterQuestionsByBloom, normalizeBloomLevel } from '../src/utils/bloomFilter.js'

assert.equal(normalizeBloomLevel('application'), 'Application')
assert.equal(normalizeBloomLevel('nope'), null)

const rows = [
  { id: 'a', bloom_level: 'Knowledge' },
  { id: 'b', bloom_level: 'Application' },
  { id: 'c' },
]

assert.deepEqual(
  filterQuestionsByBloom(rows, ['Application']).map((q) => q.id),
  ['b'],
)
assert.equal(filterQuestionsByBloom(rows, null).length, 3)

console.log('test-bloom-filter: ok')
