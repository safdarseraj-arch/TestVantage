import assert from 'node:assert/strict'
import {
  findDuplicateQuestions,
  formatDuplicateAlarmMessage,
  normalizeStemForDuplicate,
  duplicateMatchPercent,
  attachDuplicateReviewFields,
  placeDuplicateReviewsBesideOriginals,
  isDuplicateReviewItem } from '../src/utils/detectDuplicateQuestion.js'

const stem =
  'Consider the graph of real valued function f(x) defined for all x as shown above. The number of real solutions of equation f(f(x)) = 2 is equal to'

const bank = [
  {
    id: 'q1',
    subject: 'mathematics',
    questionType: 'integer',
    text: stem,
    correctInteger: 4 },
]

const dup = findDuplicateQuestions(
  { text: stem + ' ', questionType: 'integer' },
  bank,
)
assert.equal(dup.length, 1)
assert.equal(dup[0].match, 'exact')
assert.equal(dup[0].similarity, 1)
assert.equal(duplicateMatchPercent(dup[0]), 100)

const dollarOnly = findDuplicateQuestions(
  { text: `$${stem}$`, questionType: 'integer' },
  bank,
)
assert.equal(dollarOnly.length, 1, 'same stem with $ wrappers is a duplicate')
assert.equal(dollarOnly[0].match, 'exact')

const near = findDuplicateQuestions(
  {
    text:
      'Consider the graph of real valued function f(x) defined for all real x as shown above. The number of real solutions of equation f(f(x)) = 2 is equal to' },
  bank,
)
assert.ok(near.length >= 1)
assert.notEqual(near[0].match, 'exact')
assert.ok(duplicateMatchPercent(near[0]) < 100, 'fuzzy similar must not show 100%')

{
  const integralA =
    'Evaluate $\\int_0^1 x^2 \\, dx$. Then the value of the integral is'
  const integralB =
    'Evaluate $\\int_0^1 \\sin x \\, dx$. Then the value of the integral is'
  const hits = findDuplicateQuestions(
    { text: integralB, questionType: 'integer' },
    [{ id: 'int-a', text: integralA, questionType: 'integer' }],
  )
  const exact = hits.filter((h) => h.match === 'exact' || h.similarity >= 1)
  assert.equal(exact.length, 0, 'two different integrals must not be 100% duplicate')
  assert.ok(
    hits.every((h) => duplicateMatchPercent(h) < 100),
    'different integrals must not display 100%',
  )
}

{
  const generic = 'Then:'
  const hits = findDuplicateQuestions(
    { text: generic, questionType: 'integer' },
    [
      { id: 'g1', text: 'Then: evaluate the first integral', questionType: 'integer' },
      { id: 'g2', text: 'Then: evaluate the second integral', questionType: 'integer' },
      { id: 'g3', text: 'Then the value of', questionType: 'integer' },
    ],
  )
  assert.equal(hits.length, 0, 'very short generic stem must not match everything')
}

{
  const boilerplate = 'Then the value of'
  const hits = findDuplicateQuestions(
    { text: boilerplate, questionType: 'integer' },
    [
      {
        id: 'b1',
        text: 'Then the value of $\\int \\sin x dx$ is',
        questionType: 'integer',
      },
      {
        id: 'b2',
        text: 'Then the value of $\\int \\cos x dx$ is',
        questionType: 'integer',
      },
    ],
  )
  assert.equal(hits.length, 0, 'generic "the value of" must not unique-match the bank')
}

{
  const a = normalizeStemForDuplicate('Q.12  Evaluate  $\\sin x$')
  const b = normalizeStemForDuplicate('Evaluate $\\sin x$')
  assert.equal(a, b, 'Q.12 prefix and extra spaces should not change the stem key')
}

{
  const marked = attachDuplicateReviewFields(
    { text: stem, questionType: 'integer' },
    dup,
  )
  assert.equal(marked.duplicateOfId, 'q1')
  assert.equal(marked.bankStatus, 'draft')
  assert.equal(isDuplicateReviewItem(marked), true)
}

{
  const clustered = placeDuplicateReviewsBesideOriginals([
    { id: 'new', text: 'copy', duplicateOfId: 'orig' },
    { id: 'orig', text: 'original' },
    { id: 'other', text: 'unrelated' },
  ])
  const origAt = clustered.findIndex((q) => q.id === 'orig')
  const newAt = clustered.findIndex((q) => q.id === 'new')
  assert.equal(newAt, origAt + 1, 'possible-duplicate draft sits next to original')
}

assert.ok(formatDuplicateAlarmMessage(dup).includes('duplicate') || formatDuplicateAlarmMessage(dup).includes('Duplicate'))
assert.ok(/compare/i.test(formatDuplicateAlarmMessage(dup)))
assert.ok(!/blocked/i.test(formatDuplicateAlarmMessage(dup)))

console.log('test-duplicate-detect: ok')
