/**
 * A paper that is already published cannot be published again.
 * The older extra copy of the same paper is removed. One full set stays.
 */
import assert from 'node:assert/strict'
import { chooseKeptOfficialPyqPublish, removeOlderDuplicateOfficialPyqPublishes } from '../src/utils/officialPyqPublishOnce.js'
import { saveImportedPyqs, loadImportedPyqs } from '../src/utils/pyqStore.js'

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    get length() { return store.size },
    key: (i) => [...store.keys()][i] ?? null,
  }
}
if (typeof globalThis.sessionStorage === 'undefined') globalThis.sessionStorage = globalThis.localStorage
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis

function row(slot, stamp, text) {
  return {
    id: `uq-opyq-opyq-1791184792139-pl7yp03-${slot}-${stamp}`,
    text,
    officialPyq: true,
    examPatternId: 'jee-advanced',
    pyqYear: 2026,
    paperId: 'jee-advanced-2026-paper-1',
    paperLabel: 'JEE Advanced 2026',
    pyqSession: 'Paper 1',
    pyqSlot: slot,
    options: ['A', 'B', 'C', 'D'],
  }
}

const older = [1, 2, 3].map((slot) => row(slot, 1791200000000, `old ${slot}`))
const newer = [1, 2, 3].map((slot) => row(slot, 1791260000000, `new ${slot}`))
const other = {
  id: 'uq-other-1',
  text: '2024 paper question',
  officialPyq: true,
  examPatternId: 'jee-advanced',
  pyqYear: 2024,
  paperId: 'jee-advanced-2024-paper-1',
  pyqSlot: 1,
}
const kept = chooseKeptOfficialPyqPublish([...older, ...newer])
assert.deepEqual(kept.map((q) => q.text).sort(), ['new 1', 'new 2', 'new 3'])

localStorage.clear()
saveImportedPyqs([...older, ...newer, other])
const result = removeOlderDuplicateOfficialPyqPublishes()
assert.equal(result.removed, 3)
const left = loadImportedPyqs()
assert.deepEqual(left.filter((q) => q.pyqYear === 2026).map((q) => q.text).sort(), ['new 1', 'new 2', 'new 3'])
assert.equal(left.filter((q) => q.pyqYear === 2024).length, 1)
assert.equal(left.filter((q) => q.pyqYear === 2026).length, 3)

console.log('test-official-pyq-publish-once: ok')
