/**
 * Any-paper: name required, same Official PYQ cleaner, approve after review.
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

const { namedPaperTitleError, normalizeNamedPaperTitle } = await import(
  '../src/utils/bankMathpixUpload.js'
)
const {
  addAnyPaperPending,
  clearAnyPaperPending,
  countFilledAnyPaperQuestions,
  getAnyPaperPending,
} = await import('../src/utils/anyPaperPendingStore.js')
const { applyAnyPaperExtract } = await import('../src/utils/anyPaperImport.js')
const { approveAnyPaper, validateAnyPaperForApprove } = await import(
  '../src/utils/anyPaperApproval.js'
)
const { loadQuestionBank, clearQuestionBank } = await import('../src/utils/questionBank.js')
const { listOfficialPyqPendingPapers, clearOfficialPyqPendingPapers } = await import(
  '../src/utils/officialPyqPendingStore.js'
)

assert.equal(namedPaperTitleError('   '), 'Type the name of this paper. It cannot be empty.')
assert.equal(normalizeNamedPaperTitle('  Class test  '), 'Class test')

clearAnyPaperPending()
assert.throws(() => applyAnyPaperExtract({ questions: [{ text: 'Hi', options: ['a', 'b', 'c', 'd'] }] }, { paperName: '  ' }), /name of this paper/i)

const extracted = {
  engine: 'mathpix',
  text: 'Q.1 Let $x=1$. Then $x+1$ is\n(A) $1$\n(B) $2$\n(C) $3$\n(D) $4$\nQ.2 Let $y=2$. Then $y+1$ is\n(A) $1$\n(B) $2$\n(C) $3$\n(D) $4$',
  questions: [
    { stem: 'Let $x=1$. Then $x+1$ is', text: 'Let $x=1$. Then $x+1$ is', options: ['$1$', '$2$', '$3$', '$4$'] },
    { stem: 'Let $y=2$. Then $y+1$ is', text: 'Let $y=2$. Then $y+1$ is', options: ['$1$', '$2$', '$3$', '$4$'] },
  ],
}

const applied = applyAnyPaperExtract(extracted, { paperName: '  Class test 12 April  ', fileName: 'test.pdf' })
assert.equal(applied.paper.paperName, 'Class test 12 April')
assert.equal(applied.paper.officialPyq, false)
assert.ok(applied.filled >= 1, 'extract must keep real cards')
assert.equal(applied.paper.status, 'pending_review')
assert.ok(applied.paper.questions.every((q) => q.officialPyq === false))
assert.ok(
  applied.paper.questions.every((q) => q.pyqYear == null && q.examPatternId == null),
  'named papers must not keep an Official PYQ year',
)

clearOfficialPyqPendingPapers()
assert.equal(listOfficialPyqPendingPapers().length, 0, 'any-paper must not write Official PYQ store')

const empty = addAnyPaperPending({ paperName: 'Empty shell', questions: [] })
const emptyGate = validateAnyPaperForApprove(empty)
assert.equal(emptyGate.ok, false)
assert.match(emptyGate.errors.join(' '), /review|question/i)

const emptyApprove = approveAnyPaper(empty.id)
assert.equal(emptyApprove.ok, false, 'must not publish before there are cards to review')

try {
  clearQuestionBank()
} catch {
  /* optional */
}

const before = loadQuestionBank().questions?.length ?? 0
const published = approveAnyPaper(applied.paper.id)
assert.equal(published.ok, true, published.errors?.join(' ') || 'approve should pass after review cards exist')
assert.ok(published.bankCount >= 1)
const after = loadQuestionBank()
assert.ok((after.questions?.length ?? 0) > before)
const saved = after.questions.filter((q) => q.bankSource === 'any_paper' || q.paperName === 'Class test 12 April')
assert.ok(saved.length >= 1)
assert.equal(saved[0].officialPyq, false)
assert.equal(saved[0].imported, false)
assert.equal(getAnyPaperPending(applied.paper.id)?.status, 'approved')

const second = approveAnyPaper(applied.paper.id)
assert.equal(second.ok, false, 'a second Approve of a published paper stays refused')
assert.match(second.errors.join(' '), /already published/i)
assert.match(second.errors.join(' '), /unapprove/i)

const poisoned = addAnyPaperPending({
  paperName: 'Poisoned pass',
  preparedText: 'Q.1 The scan says the value of x is 2. '.repeat(4),
  questions: [
    {
      text: 'Raw LaTeX is still showing as code.',
      options: ['$1$', '$2$', '$3$', '$4$'],
      questionNumber: 1,
      officialPyq: false,
    },
  ],
  localQuality: {
    passed: true,
    failedGoTo: [],
    revision: 5,
    questionCount: 1,
    by: 'local',
    sameCheck: 'banner-v2',
  },
})
const poisonedApprove = approveAnyPaper(poisoned.id)
assert.equal(poisonedApprove.ok, false, 'a stored pass must not publish a failing card')
assert.match(poisonedApprove.errors.join(' '), /not passed|Question 1|Go to Q 1/i)
assert.equal(
  (loadQuestionBank().questions ?? []).filter((q) => q.paperName === 'Poisoned pass').length,
  0,
)
assert.notEqual(getAnyPaperPending(poisoned.id)?.localQuality?.passed, true)

const importSrc = readFileSync(new URL('../src/utils/anyPaperImport.js', import.meta.url), 'utf8')
assert.match(importSrc, /extractPyqFileWithGemini/)
assert.match(importSrc, /questionsFromOfficialPyqExtract/)
assert.match(importSrc, /repairOfficialPyqUntilQuality/)
assert.equal(importSrc.includes('validateGeminiPyqExtractItem'), false)
assert.equal(importSrc.includes('importQuestionsToOfficialPyqPending'), false)
const approvalSrc = readFileSync(new URL('../src/utils/anyPaperApproval.js', import.meta.url), 'utf8')
assert.match(approvalSrc, /healOfficialPyqPaperQuestions/)
assert.match(approvalSrc, /localOfficialPyqQualityCheck/)
assert.match(approvalSrc, /officialPyqContentReviewMessages/)
assert.equal(approvalSrc.includes('healAnyPaperQuestions'), false)

const pageSrc = readFileSync(new URL('../src/pages/AnyPaperPending.jsx', import.meta.url), 'utf8')
assert.match(pageSrc, /Approve &amp; Publish|Approve & Publish/)
assert.match(pageSrc, /any-paper-name-input/)
assert.match(pageSrc, /not Official PYQ|not<\/strong> Official PYQ/)

const officialSrc = readFileSync(new URL('../src/pages/OfficialPyqPending.jsx', import.meta.url), 'utf8')
assert.match(officialSrc, /Reviewed — Approve/)
assert.match(officialSrc, /official-pyq-publish"/)
assert.equal(officialSrc.includes('anyPaperImport'), false)
assert.match(officialSrc, /Question Bank/)
assert.match(officialSrc, /metatag/i)

const { paperItemsFromMathpixOcr } = await import('../src/utils/mathpixQuestionSplit.js')
const nvqRaw = `
SECTION 2
This section contains TWO (02) questions.
The answer to each question is a NUMERICAL VALUE.
Paragraph for Questions 14 and 15
Let $S=\\{1,2,3\\}$.
\\item[Q.] 14 If $n(S)=k$ then $|k|$ is ______.
\\item[Q.] 15 If $n(S)=2$ then the value is ______.
`
const nvqCards = paperItemsFromMathpixOcr(nvqRaw)
const n14 = nvqCards.find((q) => Number(q.printedNumber || q.questionNumber) === 14)
const n15 = nvqCards.find((q) => Number(q.printedNumber || q.questionNumber) === 15)
assert.ok(n14 && n15, 'any-paper / official share the same Mathpix split + stamp')
assert.equal(n14.questionType, 'numerical', 'same instruction stamp (NVQ)')
assert.equal(n15.questionType, 'numerical')
assert.match(String(n14.passageText ?? ''), /Let \$S=/)
const nvqApplied = applyAnyPaperExtract(
  {
    engine: 'mathpix',
    text: nvqRaw,
    questions: [
      { stem: n14.text, text: n14.text, options: n14.options, questionType: 'single_correct', number: 14 },
      { stem: n15.text, text: n15.text, options: n15.options, questionType: 'single_correct', number: 15 },
    ],
  },
  { paperName: 'Class NVQ check' },
)
assert.equal(nvqApplied.paper.officialPyq, false)
assert.equal(listOfficialPyqPendingPapers().length, 0, 'second any-paper extract still stays off Official PYQ')

const bankView = readFileSync(new URL('../src/components/BankSavedView.jsx', import.meta.url), 'utf8')
assert.match(bankView, /Passage number questions are NVQ/)
assert.match(bankView, /Save metatags|Metatags/)
const viewer = readFileSync(new URL('../src/components/SavedQuestionViewer.jsx', import.meta.url), 'utf8')
assert.match(viewer, /bank-edit-gemini-metatags-hint/)
assert.match(viewer, /If Gemini chose SCQ/)

console.log('test-any-paper-upload: ok')
