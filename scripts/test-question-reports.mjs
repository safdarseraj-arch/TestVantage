/**
 * Question report payload + validation.
 * Run: node scripts/test-question-reports.mjs
 */
import assert from 'node:assert/strict'
import {
  QUESTION_REPORT_CATEGORIES,
  QUESTION_REPORT_STORAGE_KEY,
  addQuestionReport,
  buildQuestionReport,
  markQuestionReportReviewed,
  mergeQuestionReports,
  validateQuestionReportInput,
} from '../src/utils/questionReports.js'

assert.notEqual(
  QUESTION_REPORT_STORAGE_KEY,
  'testvantage-uploaded-questions',
  'reports must not share the question bank storage key',
)

const labels = QUESTION_REPORT_CATEGORIES.map((c) => c.label)
assert.deepEqual(labels, [
  'Question related issue',
  'Solution',
  'Option related',
  'Answer',
  'Meta tag error',
])

const qReasons = QUESTION_REPORT_CATEGORIES.find((c) => c.id === 'question_related').reasons.map(
  (r) => r.label,
)
assert.deepEqual(qReasons, ['Wrong question', 'Data error', 'Spelling error'])

const sReasons = QUESTION_REPORT_CATEGORIES.find((c) => c.id === 'solution').reasons.map((r) => r.label)
assert.deepEqual(sReasons, ['Wrong solution', 'Incomplete solution', 'Lengthy solution'])

assert.deepEqual(
  QUESTION_REPORT_CATEGORIES.find((c) => c.id === 'option_related').reasons.map((r) => r.label),
  ['No option is correct'],
)
assert.deepEqual(
  QUESTION_REPORT_CATEGORIES.find((c) => c.id === 'answer').reasons.map((r) => r.label),
  ['Answer is wrong'],
)
assert.equal(QUESTION_REPORT_CATEGORIES.find((c) => c.id === 'meta_tag_error').reasons.length, 0)

assert.equal(validateQuestionReportInput({}).ok, false)
assert.equal(validateQuestionReportInput({ questionId: 'MAQ1' }).ok, false)
assert.equal(
  validateQuestionReportInput({ questionId: 'MAQ1', category: 'question_related' }).ok,
  false,
  'sub-reason required when listed',
)
assert.equal(
  validateQuestionReportInput({
    questionId: 'MAQ1',
    category: 'question_related',
    subReason: 'data_error',
  }).ok,
  true,
)

const meta = validateQuestionReportInput({
  questionId: 'MAQ9',
  category: 'meta_tag_error',
})
assert.equal(meta.ok, true, 'Meta tag error needs no sub-reason')
assert.equal(meta.value.subReason, '')

const tooLong = validateQuestionReportInput({
  questionId: 'MAQ1',
  category: 'meta_tag_error',
  comment: 'x'.repeat(501),
})
assert.equal(tooLong.ok, false)

const built = buildQuestionReport({
  questionId: 'MAQ12345',
  category: 'answer',
  subReason: 'answer_is_wrong',
  comment: '  option B should be right  ',
  reporter: { userId: 'u1', name: 'Asha', role: 'user' },
})
assert.equal(built.questionId, 'MAQ12345')
assert.equal(built.category, 'answer')
assert.equal(built.categoryLabel, 'Answer')
assert.equal(built.subReason, 'answer_is_wrong')
assert.equal(built.subReasonLabel, 'Answer is wrong')
assert.equal(built.comment, 'option B should be right')
assert.equal(built.status, 'open')
assert.ok(built.createdAt > 0)
assert.equal(built.reporter.name, 'Asha')
assert.ok(built.id.startsWith('qr-'))

assert.throws(
  () =>
    buildQuestionReport({
      questionId: 'MAQ1',
      category: 'meta_tag_error',
      subReason: 'wrong_question',
    }),
  /no extra reason/,
)

const added = addQuestionReport({
  questionId: 'MAQ-NODE',
  category: 'option_related',
  subReason: 'no_option_correct',
})
assert.equal(added.status, 'open')
const marked = markQuestionReportReviewed(added.id)
assert.equal(marked, null, 'no localStorage in node — mark is a no-op')

const mem = new Map()
globalThis.window = {
  localStorage: {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => {
      mem.set(k, String(v))
    },
    removeItem: (k) => {
      mem.delete(k)
    },
  },
}

const stored = addQuestionReport({
  questionId: 'MAQ-STORE',
  category: 'solution',
  subReason: 'wrong_solution',
  comment: 'steps skip the last line',
})
assert.equal(stored.status, 'open')
assert.ok(mem.has(QUESTION_REPORT_STORAGE_KEY), 'saves to its own key')
assert.equal(mem.has('testvantage-uploaded-questions'), false, 'must not write the question bank key')

const reviewed = markQuestionReportReviewed(stored.id)
assert.equal(reviewed?.status, 'reviewed')
assert.ok(reviewed.reviewedAt > 0)

const merged = mergeQuestionReports([
  built,
  { ...built, id: built.id, status: 'reviewed', reviewedAt: built.createdAt + 10 },
])
assert.ok(merged.some((r) => r.id === stored.id && r.status === 'reviewed'))
assert.ok(merged.some((r) => r.id === built.id && r.status === 'reviewed'))

console.log('test-question-reports: ok')
