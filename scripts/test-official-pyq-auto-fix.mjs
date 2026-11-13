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
  officialPyqAutoFixTodo,
} = await import('../src/utils/officialPyqAutoFix.js')
const { readFileSync } = await import('node:fs')

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

await test('a card changed by an earlier auto-fix is tried again when flagged, not listed as edited by the admin', async () => {
  const paper = freshPaper(2089, {
    flagged: [3],
    edit: { 2: { adminEdited: true, adminEditedAt: 1, editSource: OFFICIAL_PYQ_AUTO_FIX_SOURCE, text: BROKEN } },
  })
  const { asked, compare } = stubCompare({
    3: { verdict: 'differs', differences: [{ kind: 'math', detail: 'x' }], suggested_text: FIXED },
  })
  const out = await autoFixFlaggedOfficialPyqCards(paper.id, { compare })
  assert.deepEqual(asked, [3])
  assert.deepEqual(out.skippedAdminEdited, [])
  assert.equal(getOfficialPyqPendingPaper(paper.id).questions[2].text, FIXED)
})

await test('the to-do list skips cards a person edited and versions already tried', async () => {
  const paper = freshPaper(2090, { flagged: [1, 2, 3], edit: { 1: { adminEdited: true } } })
  assert.deepEqual(officialPyqAutoFixTodo(getOfficialPyqPendingPaper(paper.id)), [1, 3])
  await autoFixFlaggedOfficialPyqCards(paper.id, { compare: stubCompare({}).compare, max: 1 })
  updateOfficialPyqPendingPaper(paper.id, { localQuality: { ok: false, failedGoTo: [1, 2, 3], lines: [] } })
  assert.deepEqual(officialPyqAutoFixTodo(getOfficialPyqPendingPaper(paper.id)), [3])
})

await test('new pending papers: the panel runs auto-fix on its own and upload stores the original first', () => {
  const panel = readFileSync(new URL('../src/components/OfficialPyqOriginalComparePanel.jsx', import.meta.url), 'utf8')
  assert.match(panel, /officialPyqAutoFixTodo\(paper\)/)
  assert.match(panel, /void runAutoFix\(true\)/)
  assert.match(panel, /!auto &&\s*typeof window/)
  const page = readFileSync(new URL('../src/pages/OfficialPyqPending.jsx', import.meta.url), 'utf8')
  const upload = page.indexOf('uploadOfficialPyqOriginal(paper.id, file)')
  assert.ok(upload > 0)
  assert.match(page.slice(upload - 200, upload), /await import\('\.\.\/utils\/officialPyqOriginalCompare\.js'\)/)
  assert.ok(page.indexOf('openOfficialPaper(paper)', upload) > upload)
})
await test('a Gemini timeout does not use up the try: the next run asks again, the second failure goes to the admin', async () => {
  const paper = freshPaper(2091, { flagged: [2] })
  const failing = { 2: { verdict: 'error', error: 'Gemini did not answer in time.' } }
  const first = stubCompare(failing)
  const out1 = await autoFixFlaggedOfficialPyqCards(paper.id, { compare: first.compare })
  assert.deepEqual(first.asked, [2])
  assert.match(out1.needsAdmin[0].reason, /tried again/)
  assert.deepEqual(officialPyqAutoFixTodo(getOfficialPyqPendingPaper(paper.id)), [2])
  const second = stubCompare(failing)
  const out2 = await autoFixFlaggedOfficialPyqCards(paper.id, { compare: second.compare })
  assert.deepEqual(second.asked, [2])
  assert.match(out2.needsAdmin[0].reason, /failed 2 times/)
  assert.deepEqual(officialPyqAutoFixTodo(getOfficialPyqPendingPaper(paper.id)), [])

  // 2012 P2 Q26: "Compare with original paper" answered later; its correction is applied without asking Gemini again.
  await new Promise((resolve) => setTimeout(resolve, 5))
  const { saveOfficialPyqCompareResult } = await import('../src/utils/officialPyqOriginalCompare.js')
  const card = getOfficialPyqPendingPaper(paper.id).questions[1]
  saveOfficialPyqCompareResult(paper.id, 1, { verdict: 'differs', differences: [{ kind: 'math', detail: 'x' }], suggested_text: FIXED }, card)
  assert.deepEqual(officialPyqAutoFixTodo(getOfficialPyqPendingPaper(paper.id)), [2])
  const third = stubCompare({})
  const out3 = await autoFixFlaggedOfficialPyqCards(paper.id, { compare: third.compare })
  assert.deepEqual(third.asked, [], 'the saved Compare answer is used, Gemini is not asked again')
  assert.equal(getOfficialPyqPendingPaper(paper.id).questions[1].text, FIXED)
  assert.ok(out3.fixed.includes(2) || out3.stillFlagged.includes(2), JSON.stringify(out3))
  assert.deepEqual(officialPyqAutoFixTodo(getOfficialPyqPendingPaper(paper.id)), [], 'a used Compare answer is not applied twice')
})
await test('a re-split that shifts card numbers keeps each fixed card on its own question, once, still labelled auto-fixed', async () => {
  const { keepAdminEditedCards, copyAnswersOntoCanonical } = await import('../src/utils/officialPyqLocalReparse.js')
  const { keepAdminEditedOfficialPyqCards } = await import('../src/utils/officialPyqPendingStore.js')
  const card = (n, text, options = [], extra = {}) => ({
    id: `new-${n}`, printedNumber: n, pyqSlot: n, questionNumber: n, subject: 'mathematics', text, options, ...extra,
  })
  const matchStem = 'Which of the following is the only CORRECT combination?'
  const scanned45 = 'Suppose det of the matrix with sum k and sum binomial n k holds for some positive integer n then find'
  const fixed = (id, n, text, options, at) => ({
    ...card(n, text, options),
    id,
    adminEdited: true,
    adminEditedAt: at,
    editSource: OFFICIAL_PYQ_AUTO_FIX_SOURCE,
    autoFix: { tried: ['x'] },
    editHistory: [{ savedAt: at, card: { text: text.replace('fixed ', ''), options } }],
  })
  // Old split was one card behind: the "Suppose det" question sat on card 45.
  const fix45 = fixed('old-45', 45, `fixed ${scanned45}`, [], 1000)
  const fix53 = fixed('old-53', 53, matchStem, ['(I), (S)', '(I), (U)', '(II), (Q)', '(II), (T)'], 2000)
  const prev = [
    card(44, 'Let f be given by f of x equals x minus 1 times x minus 2'),
    fix45,
    { ...fix45, id: 'old-45-copy', editSource: undefined, autoFix: undefined },
    card(52, matchStem, ['(I), (P), (R)', '(II), (Q), (T)', '(I), (Q), (U)', '(II), (R), (S)']),
    fix53,
  ]
  const next = [
    card(44, 'Let f be given by f of x equals x minus 1 times x minus 2'),
    card(45, 'Five persons A B C D and E are seated in a circular arrangement'),
    card(46, scanned45),
    card(52, matchStem, ['(I), (P), (R)', '(II), (Q), (T)', '(I), (Q), (U)', '(II), (R), (S)']),
    card(53, matchStem, ['(I), (S)', '(I), (U)', '(II), (Q)', '(II), (T)']),
  ]
  for (const merge of [keepAdminEditedCards, copyAnswersOntoCanonical]) {
    const merged = merge(next, prev)
    const kept = keepAdminEditedOfficialPyqCards(prev, merged)
    assert.equal(kept.length, 5, merge.name)
    assert.match(kept[1].text, /^Five persons/)
    assert.equal(kept[1].adminEdited, undefined)
    assert.equal(kept[2].text, fix45.text)
    assert.equal(kept[2].id, 'old-45')
    assert.equal(kept[2].editSource, OFFICIAL_PYQ_AUTO_FIX_SOURCE)
    assert.deepEqual(kept[2].autoFix, { tried: ['x'] })
    assert.equal(kept[3].adminEdited, undefined)
    assert.equal(kept[4].id, 'old-53')
    assert.equal(kept[4].editSource, OFFICIAL_PYQ_AUTO_FIX_SOURCE)
    assert.equal(kept.filter((q) => q.text === fix45.text).length, 1)
  }
})
if (failed) {
  console.error(`\n${failed} auto-fix test(s) failed`)
  process.exit(1)
}
console.log('\nOfficial PYQ auto-fix tests passed')
process.exit(0)
