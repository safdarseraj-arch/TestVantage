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
  keepAdminEditedOfficialPyqCards,
  updateOfficialPyqPendingPaper,
} = await import('../src/utils/officialPyqPendingStore.js')
const { saveOfficialPyqCardEdit, parseOfficialPyqAnswerKey, approveOfficialPyqCard, unapproveOfficialPyqCard } =
  await import('../src/utils/officialPyqCardEdit.js')
const { persistOfficialPyqQualityRun } = await import('../src/utils/officialPyqLocalQuality.js')
const { mergeOfficialPyqSnapshotIntoPapers } = await import('../src/utils/applyOfficialPyqPublicSnapshot.js')
const { saveOfficialPyqCompareResult, officialPyqFlaggedGoTo } = await import('../src/utils/officialPyqOriginalCompare.js')

clearOfficialPyqPendingPapers()

const cards = Array.from({ length: 10 }, (_, i) => ({
  text: `Question ${i + 1}: find the value of $x$ when $x + ${i} = ${i + 2}$.`,
  options: ['$1$', '$2$', '$3$', '$4$'],
  correctIndex: 1,
  pyqSlot: i + 1,
  questionNumber: i + 1,
}))

const paper = addOfficialPyqPendingPaper({
  exam: 'jee-advanced',
  year: 2099,
  session: 'Paper 1',
  sourceLabel: 'test',
  questions: cards,
})

// Edit Q3 (index 2) stem, option B and answer key.
const edited = saveOfficialPyqCardEdit(paper.id, 2, {
  text: 'Question 3 (admin fixed): find $x$ when $x + 2 = 5$.',
  options: ['$1$', '$3$', '$5$', '$7$'],
  answerKey: 'B',
})
assert.equal(edited.ok, true, edited.error)
let saved = getOfficialPyqPendingPaper(paper.id)
assert.equal(saved.questions[2].adminEdited, true)
assert.match(saved.questions[2].text, /admin fixed/)
assert.equal(saved.questions[2].correctIndex, 1)
assert.ok(saved.localQuality, 'quality re-run after save')

// A re-parse style write must not overwrite the edited card.
const reparsed = cards.map((q) => ({ ...q, text: `${q.text} (re-parsed)` }))
updateOfficialPyqPendingPaper(paper.id, { questions: reparsed })
saved = getOfficialPyqPendingPaper(paper.id)
assert.match(saved.questions[2].text, /admin fixed/, 're-parse kept the admin edit')
assert.match(saved.questions[3].text, /re-parsed/, 'other cards still update')

// A re-parse that drops slot 3 entirely puts the edited card back in place.
updateOfficialPyqPendingPaper(paper.id, { questions: reparsed.filter((q) => q.pyqSlot !== 3) })
saved = getOfficialPyqPendingPaper(paper.id)
assert.equal(saved.questions.length, 10)
assert.match(saved.questions[2].text, /admin fixed/)

// Gemini fill keeping the flag but changing text: content is forced back.
const filled = saved.questions.map((q) => ({ ...q, text: `${q.text} [filled]`, chapter: 'Algebra' }))
updateOfficialPyqPendingPaper(paper.id, { questions: filled })
saved = getOfficialPyqPendingPaper(paper.id)
assert.doesNotMatch(saved.questions[2].text, /\[filled\]/)
assert.equal(saved.questions[2].chapter, 'Algebra', 'non-content fields still saved')

// Quality fix must not rewrite it either.
persistOfficialPyqQualityRun(saved)
saved = getOfficialPyqPendingPaper(paper.id)
assert.match(saved.questions[2].text, /admin fixed/)

// A newer admin save wins.
const again = saveOfficialPyqCardEdit(paper.id, 2, {
  text: 'Question 3 (admin fixed twice): find $x$ when $x + 2 = 5$.',
  options: ['$1$', '$3$', '$5$', '$7$'],
  answerKey: 'C',
})
assert.equal(again.ok, true)
saved = getOfficialPyqPendingPaper(paper.id)
assert.match(saved.questions[2].text, /fixed twice/)
assert.equal(saved.questions[2].correctIndex, 2)

// Snapshot restore keeps the edit.
const merged = mergeOfficialPyqSnapshotIntoPapers([saved], [{ ...saved, questions: cards }])
assert.match(merged.papers[0].questions[2].text, /fixed twice/)

// Compare result is stored on the card only; text and the local check untouched.
const q6Before = saved.questions[5].text
const qualityBefore = JSON.stringify(saved.localQuality)
saveOfficialPyqCompareResult(paper.id, 5, {
  verdict: 'differs',
  differences: [{ kind: 'wrong_number', detail: 'Page shows 7, card shows 5' }],
  suggested_text: 'x',
})
saved = getOfficialPyqPendingPaper(paper.id)
assert.equal(saved.questions[5].originalCompare.verdict, 'differs')
assert.equal(saved.questions[5].text, q6Before)
assert.equal(JSON.stringify(saved.localQuality), qualityBefore)

// Whole-paper compare sends only the flagged (red banner) questions.
updateOfficialPyqPendingPaper(paper.id, {
  localQuality: { ...saved.localQuality, passed: false, failedGoTo: [2, 5, 9, 40] },
})
assert.deepEqual(officialPyqFlaggedGoTo(getOfficialPyqPendingPaper(paper.id)), [2, 5, 9])
assert.deepEqual(officialPyqFlaggedGoTo({ questions: cards, localQuality: { passed: true, failedGoTo: [] } }), [])

// Per-question Approve: alarms off, card frozen as shown, Undo brings the check back.
const figText = 'Question 7: two loops lie in the plane as shown in the figure. Find the value of $x$ when $x + 6 = 8$.'
updateOfficialPyqPendingPaper(paper.id, {
  questions: getOfficialPyqPendingPaper(paper.id).questions.map((q, i) => (i === 6 ? { ...q, text: figText } : q)),
})
let run = persistOfficialPyqQualityRun(getOfficialPyqPendingPaper(paper.id))
assert.ok(run.localQuality.failedGoTo.includes(7), 'no-figure card is flagged before approval')
const flagsQ7 = (quality) => (quality?.lines || []).some((line) => /^Go to Q [\d, ]*\b7\b/.test(line))
assert.ok(flagsQ7(run.localQuality))
const approved = approveOfficialPyqCard(paper.id, 6)
assert.equal(approved.ok, true, approved.error)
saved = getOfficialPyqPendingPaper(paper.id)
assert.equal(saved.questions[6].adminApproved, true)
assert.equal(saved.questions[6].adminEdited, true)
assert.ok(!saved.localQuality.failedGoTo.includes(7), 'approved card left the Go-to list')
assert.ok(!flagsQ7(saved.localQuality), 'approved card left the banner lines')
const frozen = saved.questions[6].text
assert.match(frozen, /shown in the figure/)

updateOfficialPyqPendingPaper(paper.id, { questions: cards.map((q) => ({ ...q, text: `${q.text} (re-parsed)` })) })
saved = getOfficialPyqPendingPaper(paper.id)
assert.equal(saved.questions[6].text, frozen, 're-parse did not change the approved card')
assert.equal(saved.questions[6].adminApproved, true, 're-parse kept the approval')
run = persistOfficialPyqQualityRun(saved)
assert.ok(!run.localQuality.failedGoTo.includes(7), 'full quality run skips the approved card')
assert.equal(getOfficialPyqPendingPaper(paper.id).questions[6].text, frozen, 'quality fix did not change it')

const undone = unapproveOfficialPyqCard(paper.id, 6)
assert.equal(undone.ok, true, undone.error)
saved = getOfficialPyqPendingPaper(paper.id)
assert.equal(saved.questions[6].adminApproved, undefined)
assert.equal(saved.questions[6].text, frozen, 'undo keeps the saved text')
assert.ok(saved.localQuality.failedGoTo.includes(7), 'undo brings the alarm back')

assert.equal(approveOfficialPyqCard(paper.id, 6).ok, true)
const reEdit = saveOfficialPyqCardEdit(paper.id, 6, { text: `${frozen} Edited.`, options: saved.questions[6].options })
assert.equal(reEdit.ok, true, reEdit.error)
assert.equal(getOfficialPyqPendingPaper(paper.id).questions[6].adminApproved, undefined, 'an edit needs a new approval')

// Published papers: no stem edit.
updateOfficialPyqPendingPaper(paper.id, { status: 'approved' })
const blocked = saveOfficialPyqCardEdit(paper.id, 0, { text: 'nope', options: [] })
assert.equal(blocked.ok, false)

// Answer key parsing.
assert.deepEqual(parseOfficialPyqAnswerKey('A, C', {}).patch.correctIndices, [0, 2])
assert.equal(parseOfficialPyqAnswerKey('2.5', {}).patch.correctNumerical, 2.5)
assert.equal(parseOfficialPyqAnswerKey('zz', {}).ok, false)

// Pure helper: untouched when nothing was edited.
const plain = [{ text: 'a', pyqSlot: 1 }]
assert.equal(keepAdminEditedOfficialPyqCards(plain, plain), plain)

clearOfficialPyqPendingPapers()
console.log('test-official-pyq-admin-edit: ok')
