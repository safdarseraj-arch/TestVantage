/**
 * Any paper: same pipeline as Official PYQ (upload → review & approve → Hybrid fill → publish),
 * plus the publish question: another institute's paper (questions only) or our own (also a test).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

if (typeof globalThis.localStorage === 'undefined') {
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
}
if (typeof globalThis.sessionStorage === 'undefined') {
  const store = new Map()
  globalThis.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  }
}
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis
}

localStorage.clear()
sessionStorage.clear()

const {
  clearOfficialPyqPendingPapers,
  getOfficialPyqPendingPaper,
  updateOfficialPyqPendingPaper,
  listOfficialPyqPendingSummaries,
  countOfficialPyqPendingByStatus,
  officialPyqSittingKey,
  isOtherPaper,
  addOfficialPyqPendingPaper,
} = await import('../src/utils/officialPyqPendingStore.js')
const {
  importQuestionsToOfficialPyqPending,
  validateOfficialPyqForApprove,
  approveOfficialPyqPaper,
  publishOfficialPyqPaper,
  unpublishOfficialPyqPaper,
} = await import('../src/utils/officialPyqApproval.js')
const { otherPaperUnansweredNumbers } = await import('../src/utils/officialPyqPublishFlow.js')
const { officialPyqPaperSourceName } = await import('../src/data/officialPyqSources.js')
const { loadImportedPyqs, clearImportedPyqs } = await import('../src/utils/pyqStore.js')
const { loadQuestionBank, clearQuestionBank } = await import('../src/utils/questionBank.js')
const { loadCustomTests } = await import('../src/utils/customTests.js')

clearOfficialPyqPendingPapers()
clearImportedPyqs()
clearQuestionBank()

function withFacts(id) {
  const paper = getOfficialPyqPendingPaper(id)
  if (paper && paper.status === 'pending_review' && !paper.adminFacts?.confirmedAt) {
    updateOfficialPyqPendingPaper(id, { adminFacts: { confirmedAt: Date.now(), confirmedBy: 'test' } })
  }
  return id
}

function card(text, correctIndex, extra = {}) {
  return {
    text,
    options: ['$1$', '$2$', '$3$', '$4$'],
    correctIndex,
    subject: 'mathematics',
    section: 'Algebra',
    chapter: 'Quadratic Equations',
    answerSource: correctIndex == null ? 'unknown' : 'from_paper',
    solution: correctIndex == null ? '' : 'Add one.',
    solutionSource: correctIndex == null ? undefined : 'from_paper',
    ...extra,
  }
}

function otherPaper(name, questions) {
  return importQuestionsToOfficialPyqPending({
    paperKind: 'other',
    paperName: name,
    exam: 'jee-main',
    year: 2026,
    questions,
  })
}

// --- 1. Upload: same store as Official PYQ, kept apart by kind ---
assert.throws(() => addOfficialPyqPendingPaper({ paperKind: 'other', paperName: '  ', exam: 'jee-main', year: 2026 }), /name/i)

const official = importQuestionsToOfficialPyqPending({
  exam: 'jee-main',
  year: 2024,
  session: 'January Session · Shift 1',
  pyqDate: '2024-01-24',
  pyqShift: 1,
  sourceLabel: 'Official NTA (test fixture)',
  sourceUrl: 'https://nta.ac.in/Examination',
  questions: [card('Official fixture: $1+1=$?', 1)],
})

const outside = otherPaper('  Allen   Major Test 3 ', [
  card('Let $x=1$. Then $x+1$ is', 1),
  card('Let $y=2$. Then $y+1$ is', 2),
])
assert.equal(outside.status, 'pending_review')
assert.equal(isOtherPaper(outside), true)
assert.equal(outside.paperName, 'Allen Major Test 3')
assert.equal(outside.paperLabel, 'Allen Major Test 3')
assert.equal(outside.pyqDate, undefined)
assert.equal(outside.pyqShift, undefined)
assert.match(String(outside.paperId), /^other-/)
assert.equal(officialPyqSittingKey(outside), 'other|allen major test 3')
assert.equal(officialPyqPaperSourceName(outside), 'Allen Major Test 3', 'Hybrid fill sets Source to the paper name')

const again = otherPaper('Allen Major  Test 3', [card('Let $x=1$. Then $x+1$ is', 1), card('Let $y=2$. Then $y+1$ is', 2)])
assert.equal(again.id, outside.id, 'uploading the same paper name again replaces it, like an official sitting')

assert.deepEqual(
  listOfficialPyqPendingSummaries('all', 'other').map((p) => p.id),
  [outside.id],
  'Upload any paper lists only uploaded papers',
)
assert.equal(
  listOfficialPyqPendingSummaries('all', 'official').some((p) => p.id === outside.id),
  false,
  'Approve official papers never lists an uploaded paper',
)
assert.ok(listOfficialPyqPendingSummaries('all', 'official').some((p) => p.id === official.id))
assert.equal(countOfficialPyqPendingByStatus('other').pending_review, 1)
const otherSummary = listOfficialPyqPendingSummaries('pending_review', 'other')[0]
assert.equal(otherSummary.paperKind, 'other')
assert.equal(otherSummary.paperName, 'Allen Major Test 3')

// --- 2. Review & approve: same checks as Official PYQ ---
const noFacts = validateOfficialPyqForApprove(getOfficialPyqPendingPaper(outside.id))
assert.equal(noFacts.ok, false)
assert.match(noFacts.errors.join(' '), /Paper facts are not confirmed/)

const beforeBank = (loadQuestionBank().questions ?? []).length
const approved = approveOfficialPyqPaper(withFacts(outside.id))
assert.equal(approved.ok, true, approved.errors?.join(' '))
assert.equal(getOfficialPyqPendingPaper(outside.id).status, 'approved')
assert.equal((loadQuestionBank().questions ?? []).length, beforeBank, 'approve alone reaches no student')

// --- 4. Publish asks whose paper it is ---
const noAudience = publishOfficialPyqPaper(outside.id)
assert.equal(noAudience.ok, false)
assert.match(noAudience.errors.join(' '), /another institute or your own/i)

const holes = otherPaper('Class test 12 April', [card('Let $z=3$. Then $z+1$ is', null), card('Let $w=1$. Then $w+2$ is', 2)])
approveOfficialPyqPaper(withFacts(holes.id))
assert.equal(getOfficialPyqPendingPaper(holes.id).status, 'approved')
assert.deepEqual(otherPaperUnansweredNumbers(getOfficialPyqPendingPaper(holes.id)), [1])
const blocked = publishOfficialPyqPaper(holes.id, { audience: 'own' })
assert.equal(blocked.ok, false, 'a question with no answer blocks Publish')
assert.match(blocked.errors.join(' '), /no answer/i)
assert.match(blocked.errors.join(' '), /Go to Q 1/)

// a. another institute's paper: questions in the bank, no test, nothing in PYQ
const pyqBefore = loadImportedPyqs().length
const testsBefore = loadCustomTests().length
const pubOther = publishOfficialPyqPaper(outside.id, { audience: 'other_institute' })
assert.equal(pubOther.ok, true, pubOther.errors?.join(' '))
assert.equal(pubOther.pyqCount, 0)
assert.equal(pubOther.bankCount, 2)
assert.equal(pubOther.testId, '')
assert.equal(loadImportedPyqs().length, pyqBefore, 'an uploaded paper is never a PYQ')
assert.equal(loadCustomTests().length, testsBefore, "another institute's paper is not shown to students as a paper")
const outsideRows = (loadQuestionBank().questions ?? []).filter((q) => q.paperId === outside.paperId)
assert.equal(outsideRows.length, 2)
for (const row of outsideRows) {
  assert.equal(row.bankSource, 'any_paper')
  assert.equal(row.officialPyq, false)
  assert.equal(row.imported, false)
  assert.equal(row.paperAudience, 'other_institute')
  assert.equal(row.pyqYear, undefined)
  assert.equal(row.source, 'Allen Major Test 3')
  assert.match(String(row.id), /^[A-Z]{3}\d{5}$/, `plain classified id, got ${row.id}`)
}
const savedOther = getOfficialPyqPendingPaper(outside.id)
assert.equal(savedOther.status, 'published')
assert.equal(savedOther.publishAudience, 'other_institute')

// b. our own paper: questions in the bank and the whole paper under Tests
updateOfficialPyqPendingPaper(holes.id, {
  questions: getOfficialPyqPendingPaper(holes.id).questions.map((q, i) =>
    i === 0 ? { ...q, correctIndex: 3, answerSource: 'admin_edit' } : q,
  ),
  allowPublishedQuestionWrite: true,
})
const pubOwn = publishOfficialPyqPaper(holes.id, { audience: 'own' })
assert.equal(pubOwn.ok, true, pubOwn.errors?.join(' '))
assert.equal(pubOwn.bankCount, 2)
assert.ok(pubOwn.testId, 'own paper becomes a student test')
const test = loadCustomTests().find((t) => t.id === pubOwn.testId)
assert.ok(test)
assert.equal(test.title, 'Class test 12 April')
assert.equal(test.status, 'published')
assert.equal(test.uploadedPaperId, holes.id)
assert.equal(test.questions.length, 2)
assert.equal(getOfficialPyqPendingPaper(holes.id).publishedTestId, pubOwn.testId)
assert.equal(getOfficialPyqPendingPaper(holes.id).publishAudience, 'own')

const takenIds = new Set((loadQuestionBank().questions ?? []).map((q) => String(q.id)))
assert.equal(takenIds.size, (loadQuestionBank().questions ?? []).length, 'no two bank rows share an id')

// Unpublish: bank rows and the test both go; the paper is Approved again
sessionStorage.setItem(
  'testvantage-session',
  JSON.stringify({ role: 'admin', email: 'admin@test', name: 'Admin', loggedInAt: 1 }),
)
const unpub = unpublishOfficialPyqPaper(holes.id)
assert.equal(unpub.ok, true, unpub.error)
assert.equal(unpub.paper.status, 'approved')
assert.equal(unpub.paper.publishedTestId, undefined)
assert.equal(unpub.paper.publishAudience, undefined)
assert.equal(loadCustomTests().some((t) => t.id === pubOwn.testId), false)
assert.equal((loadQuestionBank().questions ?? []).filter((q) => q.paperId === holes.paperId).length, 0)

const republish = publishOfficialPyqPaper(holes.id, { audience: 'other_institute' })
assert.equal(republish.ok, true, republish.errors?.join(' '))
assert.deepEqual(republish.questionIds, pubOwn.questionIds, 'publishing again keeps the same ids')
assert.equal(loadCustomTests().some((t) => t.uploadedPaperId === holes.id), false)

// --- Where the answers and solutions are printed ---
const { readAnswerFileSection } = await import('../src/utils/printedEndSolutions.js')
const { applyAnswerFileToOfficialPyqPaper } = await import('../src/utils/officialPyqAnswerFile.js')
const { paperItemsFromMathpixOcr } = await import('../src/utils/mathpixQuestionSplit.js')
const { officialPyqCardTagsOnly } = await import('../src/utils/officialPyqPendingFill.js')
const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')

function printedCardsPaper(name, items) {
  return otherPaper(
    name,
    items.map((q) => ({ ...q, subject: q.subject || 'physics', chapter: 'General' })),
  )
}

// 1. No solution: nothing is invented on upload; Hybrid AI fills answer, solution and tags.
const bare = printedCardsPaper('No solution test', [card('Let $a=1$. Then $a+1$ is', null), card('Let $b=1$. Then $b+2$ is', null)])
assert.ok(bare.questions.every((q) => !String(q.solution ?? '').trim() && q.correctIndex == null))
assert.ok(bare.questions.every((q) => !officialPyqCardTagsOnly(q, bare)), 'no printed answer: Hybrid AI fills everything')

// 2. Solution after every question; 3. answers and solutions after the paper in the same PDF.
for (const [layout, file] of [
  ['inline', 'printed-inline-solutions-mathpix.txt'],
  ['end', 'printed-end-solutions-mathpix.txt'],
]) {
  const paper = printedCardsPaper(`Printed ${layout} test`, paperItemsFromMathpixOcr(fixture(file)))
  assert.equal(paper.questions.length, 6, `${layout}: card count`)
  for (const q of paper.questions) {
    assert.equal(q.answerSource, 'from_paper', `${layout}: printed answer kept`)
    assert.equal(q.solutionSource, 'from_paper', `${layout}: printed solution kept`)
    assert.equal(officialPyqCardTagsOnly(q, paper), true, `${layout}: Hybrid AI fills tags only`)
  }
}

// 4. Answers and solutions in another file.
const keyFile = String.raw`Allen Major Test 4 — Answer Key
ANSWER KEY
1. (B)  2. (C)  3. 7`
const keyRead = readAnswerFileSection(keyFile)
assert.ok(keyRead)
assert.equal(keyRead.entries.size, 3)
const oneLineKey = readAnswerFileSection('1. (B) 2. (C) 3. (A) 4. (D)')
assert.equal(oneLineKey.entries.size, 4, 'a key with no heading on one line')
const solutionsFile = String.raw`1. (B) By Newton's second law the acceleration is $a=F/m=5$.
2. (C) The determinant of $2A$ is $2^{3} \det A = 16$ for this matrix.
3. Ans. 7
Adding the two roots gives seven.`
const solRead = readAnswerFileSection(solutionsFile)
assert.equal(solRead.entries.size, 3)
assert.match(String([...solRead.entries.values()][0].solution), /Newton/)
assert.equal(readAnswerFileSection('Thank you for taking the test.'), null)

const later = otherPaper('Separate key test', [
  card('Let $p=1$. Then $p+1$ is', null),
  card('Let $q=2$. Then $q+1$ is', null),
  { ...card('Let $r=3$. Then $r+4$ is', null), questionType: 'integer', options: [] },
  card('Let $s=1$. Then $s+3$ is', null),
])
const noMatch = applyAnswerFileToOfficialPyqPaper(later.id, '41. (A) 42. (B) 43. (C)')
assert.equal(noMatch.ok, false)
assert.match(noMatch.error, /none of its question numbers matched/)
const fromFile = applyAnswerFileToOfficialPyqPaper(later.id, solutionsFile, { fileName: 'solutions.pdf' })
assert.equal(fromFile.ok, true, fromFile.error)
assert.equal(fromFile.answers, 3)
assert.equal(fromFile.solutions, 3)
assert.deepEqual(fromFile.noAnswer, [4])
const laterCards = getOfficialPyqPendingPaper(later.id).questions
assert.equal(laterCards[0].correctIndex, 1)
assert.equal(laterCards[1].correctIndex, 2)
assert.equal(laterCards[2].correctInteger, 7)
assert.ok(laterCards.slice(0, 3).every((q) => q.answerSource === 'from_paper' && q.solutionSource === 'from_paper'))
assert.equal(getOfficialPyqPendingPaper(later.id).answerFileName, 'solutions.pdf')
assert.equal(applyAnswerFileToOfficialPyqPaper(later.id, solutionsFile).unchanged, true, 'same file twice changes nothing')

approveOfficialPyqPaper(withFacts(later.id))
assert.equal(getOfficialPyqPendingPaper(later.id).status, 'approved')
const keyAfterApprove = applyAnswerFileToOfficialPyqPaper(later.id, 'ANSWER KEY\n1. (B) 2. (C) 3. 7 4. (A)')
assert.equal(keyAfterApprove.ok, true, keyAfterApprove.error)
assert.equal(keyAfterApprove.answers, 1)
assert.deepEqual(keyAfterApprove.noAnswer, [])
assert.equal(getOfficialPyqPendingPaper(later.id).questions[3].correctIndex, 0)
assert.equal(getOfficialPyqPendingPaper(later.id).questions[0].solutionSource, 'from_paper', 'a key file keeps the solutions')
const pubLater = publishOfficialPyqPaper(later.id, { audience: 'other_institute' })
assert.equal(pubLater.ok, true, pubLater.errors?.join(' '))
const lockedFile = applyAnswerFileToOfficialPyqPaper(later.id, 'ANSWER KEY\n1. (A) 2. (A)')
assert.equal(lockedFile.ok, false)
assert.match(lockedFile.error, /Unpublish first/)

// --- Page wiring ---
const appSrc = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
assert.match(appSrc, /<OfficialPyqPendingRoute kind="other" \/>/)
assert.equal(appSrc.includes('AnyPaperPending'), false)
const pageSrc = readFileSync(new URL('../src/pages/OfficialPyqPending.jsx', import.meta.url), 'utf8')
assert.match(pageSrc, /other-paper-publish-other-institute/)
assert.match(pageSrc, /other-paper-publish-own/)
assert.match(pageSrc, /paperKind: 'other'/)
assert.match(pageSrc, /Reviewed — Approve/)
assert.match(pageSrc, /OfficialPyqHybridFill/)
const listSrc = readFileSync(new URL('../src/pages/OfficialPyqTabList.jsx', import.meta.url), 'utf8')
assert.match(listSrc, /listOfficialPyqPendingSummaries\([^)]*, kind\)/)

console.log('test-any-paper-upload: ok')
