import assert from 'node:assert/strict'
import {
  bulkUpsertQuestions,
  loadQuestions,
  upsertQuestion,
  setQuestionsBackend,
} from '../server/stores/questions.js'
import {
  saveExamSession,
  loadExamSession,
  clearExamSession,
  setExamSessionsBackend,
} from '../server/stores/examSessions.js'
import {
  saveAttemptRecord,
  setAttemptsBackend,
} from '../server/stores/attempts.js'

setQuestionsBackend('file')
setExamSessionsBackend('file')
setAttemptsBackend('file')

await upsertQuestion({
  id: 'MAQ90001',
  subject: 'physics',
  text: 'Facade test',
})
const bank = await loadQuestions()
assert.ok(bank.questions.some((q) => q.id === 'MAQ90001'))

const bulk = await bulkUpsertQuestions([
  { id: 'MAQ90002', subject: 'chemistry', text: 'B' },
])
assert.equal(bulk.synced, 1)

const sess = await saveExamSession({
  ownerKey: 'stu-facade',
  testId: 't-facade',
  deadlineAt: Date.now() + 120_000,
  answers: {},
})
assert.equal(sess.testId, 't-facade')
assert.ok(await loadExamSession('stu-facade', 't-facade'))
await clearExamSession('stu-facade', 't-facade')

await saveAttemptRecord({
  id: 'att-facade-1',
  ownerKey: 'stu-facade',
  testId: 't-facade',
  submittedAt: Date.now(),
})

console.log('test-stores-facade: ok')
