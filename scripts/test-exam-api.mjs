import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempRoot = mkdtempSync(join(tmpdir(), 'tv-exam-'))
process.env.TESTVANTAGE_BANK_DATA_DIR = join(tempRoot, 'bank')

const { saveExamSession, loadExamSession, clearExamSession } = await import('../server/examStore.js')
const { SCALE } = await import('../server/config.js')

assert.equal(SCALE.targetConcurrentStudents, 1_000_000)

const snap = saveExamSession({
  testId: 'test-jee-1',
  ownerKey: 'student-abc',
  deadlineAt: Date.now() + 3600_000,
  answers: { q1: { type: 'single', value: 0 } },
  marked: [],
})
assert.equal(snap.testId, 'test-jee-1')
assert.ok(loadExamSession('student-abc', 'test-jee-1'))

clearExamSession('student-abc', 'test-jee-1')
assert.equal(loadExamSession('student-abc', 'test-jee-1'), null)

rmSync(tempRoot, { recursive: true, force: true })
console.log('test-exam-api: ok')
