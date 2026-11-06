/**
 * Official PYQ "Auto-fix flagged questions (compare with original)": only flagged
 * cards are compared, a correction is saved with Undo history only when it draws
 * cleanly, admin-edited cards are listed instead of changed, each card version is
 * tried once, and published papers are never touched. The compare call is stubbed.
 */
import assert from 'node:assert/strict'

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
if (typeof globalThis.sessionStorage === 'undefined') {
  globalThis.sessionStorage = globalThis.localStorage
}

const {
  addOfficialPyqPendingPaper,
  clearOfficialPyqPendingPapers,
  getOfficialPyqPendingPaper,
  updateOfficialPyqPendingPaper,
} = await import('../src/utils/officialPyqPendingStore.js')
const { undoOfficialPyqCardEdit } = await import('../src/utils/officialPyqCardEdit.js')
const {
  OFFICIAL_PYQ_AUTO_FIX_SOURCE,
  autoFixFlaggedOfficialPyqCards,
  officialPyqAlertGoTo,
  officialPyqAutoFixRejectReason,
} = await import('../src/utils/officialPyqAutoFix.js')

let failed = 0
async function test(name, fn) {
  try {
    await fn()
    console.log(`ok - ${name}`)
  } catch (err) {
    failed += 1
    console.error(`FAIL - ${name}\n${err?.stack || err}`)
  }
}

const BROKEN = String.raw`Question 1: find $x$ when $\frac{1}{2$ holds.`
const FIXED = String.raw`Question 1: find $x$ when $\frac{1}{2}=x$ holds.`

function freshPaper(year, { flagged = [], edit = {} } = {}) {
  const cards = Array.from({ length: 8 }, (_, i) => ({
    id: `card-${year}-${i + 1}`,
    text: `Question ${i + 1}: find the value of $x$ when $x + ${i} = ${i + 2}$.`,
    options: ['$1$', '$2$', '$3$', '$4$'],
    questionType: 'single_correct',
    correctIndex: 1,
    pyqSlot: i + 1,
    questionNumber: i + 1,
    ...(edit[i] || {}),
  }))
  const paper = addOfficialPyqPendingPaper({
    exam: 'jee-advanced',
    year,
    session: 'Paper 1',
    sourceLabel: 'test',
    questions: cards,
  })
  if (flagged.length) {
    updateOfficialPyqPendingPaper(paper.id, {
      localQuality: { ok: false, failedGoTo: flagged, lines: flagged.map((n) => `Go to Q ${n}. Test flag.`) },
    })
  }
  return paper
}

/** Stub compare: answers by go-to number and records which cards were asked. */
function stubCompare(answers) {
  const asked = []
  const compare = async (_paperId, index) => {
    asked.push(index + 1)
    return answers[index + 1] ?? { verdict: 'matches', differences: [] }
  }
  return { asked, compare }
}

clearOfficialPyqPendingPapers()

await test('only flagged cards are compared; a clean correction is saved as an auto-fix with Undo', async () => {
  const paper = freshPaper(2081, { flagged: [4], edit: { 0: { text: BROKEN } } })
  assert.deepEqual(officialPyqAlertGoTo(getOfficialPyqPendingPaper(paper.id)), [1, 4])
  const { asked, compare } = stubCompare({
    1: { verdict: 'differs', differences: [{ kind: 'math', detail: 'cut fraction' }], suggested_text: FIXED },
  })
  const out = await autoFixFlaggedOfficialPyqCards(paper.id, { compare })
  assert.equal(out.ok, true)
  assert.deepEqual(asked, [1, 4])
  assert.ok(out.fixed.includes(1) || out.stillFlagged.includes(1), JSON.stringify(out))
  const card = getOfficialPyqPendingPaper(paper.id).questions[0]
  assert.equal(card.text, FIXED)
  assert.equal(card.editSource, OFFICIAL_PYQ_AUTO_FIX_SOURCE)
  assert.equal(card.adminEdited, true)
  assert.equal(card.editHistory.length, 1)
  assert.equal(card.autoFix.outcome, 'fixed')
  assert.equal(getOfficialPyqPendingPaper(paper.id).questions[1].autoFix, undefined)

  assert.equal(undoOfficialPyqCardEdit(paper.id, 0).ok, true)
  const undone = getOfficialPyqPendingPaper(paper.id).questions[0]
  assert.equal(undone.text, BROKEN)
  assert.equal(undone.editSource, undefined)
  assert.equal(undone.adminEdited, undefined)
})

await test('a correction that does not draw, or repeats an option, is not saved', async () => {
  const paper = freshPaper(2082, { flagged: [2, 3] })
  const before = getOfficialPyqPendingPaper(paper.id).questions.map((q) => q.text)
  const { asked, compare } = stubCompare({
    2: { verdict: 'differs', differences: [{ kind: 'math', detail: 'x' }], suggested_text: BROKEN },
    3: { verdict: 'differs', differences: [{ kind: 'options', detail: 'x' }], suggested_options: ['$1$', '$1$', '$3$', '$4$'] },
  })
  const out = await autoFixFlaggedOfficialPyqCards(paper.id, { compare })
  assert.deepEqual(asked, [2, 3])
  assert.deepEqual(out.fixed, [])
  assert.deepEqual(out.needsAdmin.map((n) => n.goTo), [2, 3])
  assert.match(out.needsAdmin[0].reason, /draw/i)
  assert.match(out.needsAdmin[1].reason, /same/i)
  const after = getOfficialPyqPendingPaper(paper.id).questions
  assert.deepEqual(after.map((q) => q.text), before)
  assert.ok(after.every((q) => !q.editHistory?.length && !q.adminEdited))
})

await test('admin-edited cards are listed for the admin and never compared or changed', async () => {
  const paper = freshPaper(2083, { flagged: [5], edit: { 4: { adminEdited: true, text: BROKEN } } })
  const { asked, compare } = stubCompare({
    5: { verdict: 'differs', differences: [{ kind: 'math', detail: 'x' }], suggested_text: FIXED },
  })
  const out = await autoFixFlaggedOfficialPyqCards(paper.id, { compare })
  assert.deepEqual(asked, [])
  assert.deepEqual(out.skippedAdminEdited, [5])
  assert.equal(getOfficialPyqPendingPaper(paper.id).questions[4].text, BROKEN)
})

await test('"matches" with the alert still there goes to the admin, and a card is not retried', async () => {
  const paper = freshPaper(2084, { flagged: [6] })
  const first = stubCompare({})
  const out = await autoFixFlaggedOfficialPyqCards(paper.id, { compare: first.compare })
  assert.deepEqual(first.asked, [6])
  assert.deepEqual(out.needsAdmin.map((n) => n.goTo), [6])
  assert.match(out.needsAdmin[0].reason, /no correction/i)
  updateOfficialPyqPendingPaper(paper.id, { localQuality: { ok: false, failedGoTo: [6], lines: [] } })
  const second = stubCompare({})
  const again = await autoFixFlaggedOfficialPyqCards(paper.id, { compare: second.compare })
  assert.deepEqual(second.asked, [])
  assert.deepEqual(again.skippedTried, [6])
})

await test('after Undo of an auto-fix the next run does not fix the same card again', async () => {
  const paper = freshPaper(2085, { edit: { 0: { text: BROKEN } } })
  const fix = { 1: { verdict: 'differs', differences: [{ kind: 'math', detail: 'x' }], suggested_text: FIXED } }
  await autoFixFlaggedOfficialPyqCards(paper.id, { compare: stubCompare(fix).compare })
  assert.equal(undoOfficialPyqCardEdit(paper.id, 0).ok, true)
  const second = stubCompare(fix)
  const again = await autoFixFlaggedOfficialPyqCards(paper.id, { compare: second.compare })
  assert.deepEqual(second.asked, [])
  assert.deepEqual(again.skippedTried, [1])
  assert.equal(getOfficialPyqPendingPaper(paper.id).questions[0].text, BROKEN)
})

await test('the per-paper cap leaves the rest for the next run', async () => {
  const paper = freshPaper(2086, { flagged: [1, 2, 3, 4] })
  const { asked, compare } = stubCompare({})
  const out = await autoFixFlaggedOfficialPyqCards(paper.id, { compare, max: 2 })
  assert.deepEqual(asked, [1, 2])
  assert.deepEqual(out.notTried, [3, 4])
})

await test('Stop ends the run before the next Gemini request', async () => {
  const paper = freshPaper(2087, { flagged: [1, 2, 3] })
  const ctl = new AbortController()
  const asked = []
  const compare = async (_id, index) => {
    asked.push(index + 1)
    ctl.abort()
    return { verdict: 'matches', differences: [] }
  }
  const out = await autoFixFlaggedOfficialPyqCards(paper.id, { compare, signal: ctl.signal })
  assert.equal(out.aborted, true)
  assert.deepEqual(asked, [1])
})

await test('published papers are refused without any compare', async () => {
  const paper = freshPaper(2088, { flagged: [1] })
  updateOfficialPyqPendingPaper(paper.id, { status: 'approved' })
  const { asked, compare } = stubCompare({})
  const out = await autoFixFlaggedOfficialPyqCards(paper.id, { compare })
  assert.equal(out.ok, false)
  assert.match(out.error, /pending/i)
  assert.deepEqual(asked, [])
})

await test('reject reason: number-answer correction with options, and wrong printed number', async () => {
  const card = { text: 'Q.7 Find $n$.', options: [], questionType: 'integer' }
  assert.match(
    officialPyqAutoFixRejectReason(card, { text: 'Q.7 Find $n$.', passageText: '', options: ['$1$', '$2$'] }),
    /number-answer/,
  )
  assert.match(
    officialPyqAutoFixRejectReason(card, { text: 'Q.8 Find $n$.', passageText: '', options: [] }, { printedNumber: 7 }),
    /Q8, not Q7/,
  )
  assert.equal(officialPyqAutoFixRejectReason(card, { text: 'Q.7 Find $n^2$.', passageText: '', options: [] }, { printedNumber: 7 }), '')
})

if (failed) {
  console.error(`\n${failed} auto-fix test(s) failed`)
  process.exit(1)
}
console.log('\nOfficial PYQ auto-fix tests passed')
process.exit(0)
