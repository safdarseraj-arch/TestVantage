/**
 * JEE Advanced 2012 P2: "Zero Marks to all" (Q23, Q60) is a dropped question, and an "ANSWER : C"
 * line the scan lost (Q9) gets a second key read from the page. The pending paper then passes.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
  get length() {
    return store.size
  },
  key: (i) => [...store.keys()][i] ?? null,
}
globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} }
globalThis.window = globalThis

const { detectAnswerFromPaper, stripAnswerMetaLines } = await import('../src/utils/answerProvenance.js')
const {
  formatOfficialPyqAnswerKey,
  officialPyqCardHasAnswerKey,
  officialPyqPrintedAnswerPatch,
  parseOfficialPyqAnswerKey,
} = await import('../src/utils/officialPyqCardEdit.js')
const { applyHybridPatchToCard, currentAnswerText } = await import('../src/utils/officialPyqPendingFill.js')
const { formatCorrectAnswer } = await import('../src/utils/formatAnswer.js')
const { evaluateTest } = await import('../src/utils/scoring.js')

// --- "Zero Marks to all" is read, shown, kept from AI fill and scored 0 ---
for (const block of ['Pick one.\n\nZero Marks to all', 'Pick one.\n\\section*{Zero Marks to all}', 'x\nANSWER : Zero marks to all']) {
  const read = detectAnswerFromPaper(block)
  assert.equal(read.zeroMarksToAll, true, block)
  assert.equal(read.bonusMarksToAll, undefined, block)
  assert.equal(read.answerSource, 'from_paper', block)
}
assert.equal(detectAnswerFromPaper('x\nMARKS TO ALL').bonusMarksToAll, true, '"MARKS TO ALL" stays a bonus')
assert.equal(detectAnswerFromPaper('x\nMARKS TO ALL').zeroMarksToAll, undefined)
assert.equal(stripAnswerMetaLines('Pick one.\nZero Marks to all'), 'Pick one.')

const card = { id: 'z1', subject: 'chemistry', questionType: 'single_correct', options: ['a', 'b', 'c', 'd'], answerSource: 'unknown' }
assert.deepEqual(officialPyqPrintedAnswerPatch(card, { printedAnswer: 'Zero Marks to all' }), { zeroMarksToAll: true })
const dropped = { ...card, zeroMarksToAll: true, answerSource: 'from_paper' }
assert.equal(officialPyqPrintedAnswerPatch(dropped, { printedAnswer: 'Zero Marks to all' }), null, 'already saved')
assert.equal(formatOfficialPyqAnswerKey(dropped), 'Zero marks to all')
assert.equal(officialPyqCardHasAnswerKey(dropped), true)
assert.equal(parseOfficialPyqAnswerKey('Zero marks to all', card).patch.zeroMarksToAll, true)
assert.equal(parseOfficialPyqAnswerKey('A', dropped).patch.zeroMarksToAll, undefined, 'typing a letter clears it')
assert.equal(formatCorrectAnswer(dropped), 'Dropped — zero marks to all')
assert.equal(currentAnswerText(dropped), 'Zero marks to all')
assert.equal(applyHybridPatchToCard(dropped, { correctIndex: 2 }).correctIndex, undefined, 'AI fill never answers a dropped question')
for (const answers of [{}, { z1: 0 }, { z1: 3 }]) {
  const graded = evaluateTest({ examPatternId: 'jee-advanced', questions: [dropped] }, answers).perQuestion[0]
  assert.equal(graded.marks, 0, JSON.stringify(answers))
  assert.equal(graded.grade, 'unattempted')
}

// --- The saved 2012 P2 pending paper: Auto-fix reads Q9's key again; the quality run clears Q23/Q60 ---
const paper = JSON.parse(readFileSync(new URL('./fixtures/jee-advanced-2012-p2-pending.json', import.meta.url), 'utf8'))
assert.equal(paper.questions[8].autoFix?.keyTries, 1, 'fixture: Q9 had one key read that saw no key')
/** Their structure-code alerts are test-official-pyq-2012-p2-cards.mjs's subject, not this one's. */
for (const n of [26, 28, 33, 34, 40]) paper.questions[n - 1] = { ...paper.questions[n - 1], adminApproved: true }
localStorage.setItem('testvantage-official-pyq-pending', JSON.stringify({ papers: [paper], updatedAt: Date.now() }))
const { getOfficialPyqPendingPaper } = await import('../src/utils/officialPyqPendingStore.js')
const { autoFixFlaggedOfficialPyqCards, officialPyqAutoFixTodo } = await import('../src/utils/officialPyqAutoFix.js')
const { localOfficialPyqQualityCheck, persistOfficialPyqQualityRun } = await import('../src/utils/officialPyqLocalQuality.js')

assert.ok(officialPyqAutoFixTodo(getOfficialPyqPendingPaper(paper.id)).includes(9), 'Q9 gets a second key read')
const asked = []
const res = await autoFixFlaggedOfficialPyqCards(paper.id, {
  compare: async (_id, index) => {
    asked.push(index + 1)
    return index === 8
      ? { verdict: 'differs', differences: [{ kind: 'wrong_option', detail: 'key missing' }], printed_answer: 'ANSWER : C', pages: [5] }
      : { verdict: 'matches', printed_answer: '', pages: [] }
  },
})
assert.deepEqual(asked, [9], 'only Q9 needs Gemini; Q23/Q60 are read from the scan')
assert.deepEqual(res.fixed, [9])
const q9 = getOfficialPyqPendingPaper(paper.id).questions[8]
assert.equal(q9.correctIndex, 2)
assert.equal(q9.answerSource, 'from_paper')

/** The panel's quality run comes first: it puts back what the scan settles (Q4's circuit, Q22's option D). */
persistOfficialPyqQualityRun(getOfficialPyqPendingPaper(paper.id))
const again = await autoFixFlaggedOfficialPyqCards(paper.id, {
  compare: async (_id, index) => assert.fail(`Q${index + 1}: a card whose key was read, or the scan fixes, is not sent again`),
})
assert.equal(again.ok, true, again.error)

persistOfficialPyqQualityRun(getOfficialPyqPendingPaper(paper.id))
const after = getOfficialPyqPendingPaper(paper.id)
for (const n of [23, 60]) {
  assert.equal(after.questions[n - 1].zeroMarksToAll, true, `Q${n}`)
  assert.equal(after.questions[n - 1].answerSource, 'from_paper', `Q${n}`)
}
const quality = localOfficialPyqQualityCheck(after)
assert.deepEqual(quality.failedGoTo, [], `still flagged: ${quality.failedGoTo}`)
assert.equal(quality.passed, true)

console.log('test-official-pyq-zero-marks: ok')
