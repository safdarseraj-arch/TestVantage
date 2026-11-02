import assert from 'node:assert/strict'
import {
  clearExamProgress,
  findExamProgress,
  migrateExamProgressOwner,
  saveExamProgress,
  secondsLeftFromDeadline,
} from '../src/utils/examProgressStore.js'

const testId = 'custom-test-1'
const guest = 'guest-111'
const user = 'user-222'
const deadlineAt = Date.now() + 120_000

saveExamProgress({
  testId,
  ownerKey: guest,
  guestOwnerKey: guest,
  deadlineAt,
  answers: { q1: 2 },
  marked: ['q2'],
  currentIndex: 3,
})

let found = findExamProgress(testId, { ownerKey: guest, guestId: guest })
assert.equal(found?.currentIndex, 3)
assert.ok(secondsLeftFromDeadline(found.deadlineAt) > 0)

migrateExamProgressOwner(guest, user)
found = findExamProgress(testId, { ownerKey: user, guestId: guest })
assert.equal(found?.ownerKey, user)

clearExamProgress(testId, user)
assert.equal(findExamProgress(testId, { ownerKey: user }), null)

console.log('test-exam-progress: ok')
