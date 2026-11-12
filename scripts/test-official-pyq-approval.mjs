/**
 * Official PYQ pending → approve → PYQ store + Question Bank.
 * Reject stays out of both.
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
// questionBank only reads localStorage when `window` exists (browser / SSR guard)
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis
}

localStorage.clear()
sessionStorage.clear()

function factsOk(paper) {
  return paper ? { ...paper, adminFacts: { confirmedAt: Date.now(), confirmedBy: 'test' } } : paper
}

function withFacts(id) {
  const paper = getOfficialPyqPendingPaper(id)
  if (paper && paper.status === 'pending_review' && !paper.adminFacts?.confirmedAt) {
    updateOfficialPyqPendingPaper(id, { adminFacts: { confirmedAt: Date.now(), confirmedBy: 'test' } })
  }
  return id
}

const {
  OFFICIAL_PYQ_SOURCE_SLOTS,
  listOfficialPyqSourceSlots,
  getOfficialPyqSourceSlot,
} = await import('../src/data/officialPyqSources.js')

const {
  clearOfficialPyqPendingPapers,
  listOfficialPyqPendingPapers,
  listOfficialPyqPendingSummaries,
  countOfficialPyqPendingByStatus,
  addOfficialPyqPendingPaper,
  pendingPaperFromSourceSlot,
  getOfficialPyqPendingPaper,
  updateOfficialPyqPendingPaper,
  dedupeOfficialPyqPendingPapers,
  OFFICIAL_PYQ_PENDING_KEY,
  getOfficialPyqPendingPreviewPaper,
  keepOfficialPyqQuestionsIfEmptied,
  recoverOfficialPyqQuestionsFromStore,
  findOfficialPyqSiblingWithQuestions,
  countFilledOfficialPyqQuestions,
} = await import('../src/utils/officialPyqPendingStore.js')

const {
  approveOfficialPyqPaper,
  publishOfficialPyqPaper,
  unpublishOfficialPyqPaper,
  unapproveOfficialPyqPaper,
  rejectOfficialPyqPaper,
  dismissOfficialPyqPaper,
  dismissOfficialPyqSitting,
  validateOfficialPyqForApprove,
  importQuestionsToOfficialPyqPending,
  persistHealedOfficialPyqPaper,
  reExtractOfficialPyqPendingPaper,
  reExtractOfficialPyqPendingPaperWithGeminiTimed,
  pendingQuestionToPyqItem,
  pyqItemToBankQuestion,
  linkOfficialPyqBankPassages,
  officialPyqStatusLabel,
  assignOfficialPyqSaveId,
} = await import('../src/utils/officialPyqApproval.js')

const { matchQuestionMissingListI } = await import('../src/utils/extendTruncatedStem.js')

const { loadImportedPyqs, clearImportedPyqs } = await import('../src/utils/pyqStore.js')
const {
  loadQuestionBank,
  clearQuestionBank,
  loadPublishedUploadedQuestions,
} = await import('../src/utils/questionBank.js')

clearOfficialPyqPendingPapers()
clearImportedPyqs()
clearQuestionBank()

// --- Sources catalog sanity ---
assert.ok(OFFICIAL_PYQ_SOURCE_SLOTS.length >= 6)
assert.ok(listOfficialPyqSourceSlots('jee-advanced').every((s) => s.exam === 'jee-advanced'))
assert.ok(getOfficialPyqSourceSlot('jee-adv-2024-p1')?.sourceUrl.includes('jeeadv.ac.in'))
assert.equal(officialPyqStatusLabel('pending_review'), 'Pending approval')
assert.equal(officialPyqStatusLabel('approved'), 'Approved')
assert.equal(officialPyqStatusLabel('published'), 'Published')
assert.equal(
  assignOfficialPyqSaveId(
    {
      id: 'uq-tmp',
      subject: 'mathematics',
      section: 'Algebra',
      chapter: 'Quadratic Equations',
    },
    { exam: 'jee-advanced', year: 2024 },
    [],
  ),
  'MAQ00001A2024',
)
assert.equal(
  assignOfficialPyqSaveId(
    {
      id: 'uq-tmp',
      subject: 'mathematics',
      section: 'Algebra',
      chapter: 'Quadratic Equations',
    },
    { exam: 'jee-main', year: 2024 },
    [],
  ),
  'MAQ00001J2024',
)
assert.equal(
  assignOfficialPyqSaveId(
    {
      id: 'uq-tmp',
      subject: 'mathematics',
      section: 'Algebra',
      chapter: 'Quadratic Equations',
    },
    { exam: 'neet', year: 2023 },
    [],
  ),
  'MAQ00001N2023',
)

// --- Empty paper cannot approve ---
const shell = pendingPaperFromSourceSlot(getOfficialPyqSourceSlot('jee-adv-2024-p1'))
assert.equal(shell.status, 'pending_review')
assert.equal(validateOfficialPyqForApprove(shell).ok, false)
assert.match(validateOfficialPyqForApprove(shell).errors.join(' '), /at least one question/i)

// --- Import questions → pending only (not PYQ / bank yet) ---
const pending = importQuestionsToOfficialPyqPending({
  exam: 'jee-main',
  year: 2024,
  session: 'January Session · Shift 1',
  pyqDate: '2024-01-24',
  pyqShift: 1,
  paperLabel: 'JEE Main 2024 · Test fixture (not a real NTA dump)',
  sourceLabel: 'Official NTA (test fixture)',
  sourceUrl: 'https://nta.ac.in/Examination',
  questions: [
    {
      text: 'Fixture PYQ: acceleration of $2\\,\\mathrm{kg}$ under $10\\,\\mathrm{N}$ is:',
      options: ['$2$', '$5$', '$10$', '$20$'],
      correctIndex: 1,
      subject: 'physics',
      chapter: 'Laws of Motion',
      answerSource: 'from_paper',
      solution: 'a = F/m = 5',
      solutionSource: 'from_paper',
    },
    {
      text: 'Fixture PYQ: $2+2=$?',
      options: ['3', '4', '5', '6'],
      correctIndex: 1,
      subject: 'mathematics',
      chapter: 'General',
      answerSource: 'ai_generated',
      solution: 'Simple arithmetic.',
      solutionSource: 'ai_generated',
    },
  ],
})

assert.equal(pending.status, 'pending_review')
assert.equal(pending.questions.length, 2)
assert.equal(listOfficialPyqPendingPapers('pending_review').some((p) => p.id === pending.id), true)
const pendingSummary = listOfficialPyqPendingSummaries('pending_review').find((p) => p.id === pending.id)
assert.ok(pendingSummary, 'tab list must have a summary row')
assert.equal(pendingSummary.questions, undefined, 'summaries must not hold question bodies')
assert.equal(pendingSummary.preparedText, undefined, 'summaries must not hold OCR')
const pendingPreview = getOfficialPyqPendingPreviewPaper(pending.id)
assert.equal(pendingPreview?.questions?.length, 2)
assert.equal(loadImportedPyqs().length, 0, 'pending must not enter student PYQ yet')
assert.equal(loadPublishedUploadedQuestions().length, 0, 'pending must not enter published bank yet')

const mapped = pendingQuestionToPyqItem(pending, pending.questions[1], 1)
assert.match(String(mapped.solution), /AI solution/i)

// --- Reject stays out ---
const rejected = importQuestionsToOfficialPyqPending({
  exam: 'neet',
  year: 2023,
  sourceLabel: 'Official NTA NEET (test fixture)',
  sourceUrl: 'https://neet.nta.nic.in',
  questions: [
    {
      text: 'Rejected fixture question about mitochondria.',
      options: ['A', 'B', 'C', 'D'],
      correctIndex: 0,
      subject: 'biology',
      chapter: 'Cell',
      answerSource: 'from_paper',
    },
  ],
})
const rej = rejectOfficialPyqPaper(rejected.id, 'Not an official PDF parse')
assert.equal(rej.ok, true)
assert.equal(listOfficialPyqPendingPapers('rejected').find((p) => p.id === rejected.id)?.status, 'rejected')
assert.equal(loadImportedPyqs().length, 0)

const rejAgain = approveOfficialPyqPaper(withFacts(rejected.id))
assert.equal(rejAgain.ok, false)

const dismissRej = dismissOfficialPyqPaper(rejected.id)
assert.equal(dismissRej.ok, true)
assert.equal(listOfficialPyqPendingPapers('rejected').find((p) => p.id === rejected.id), undefined)
assert.equal(listOfficialPyqPendingPapers('pending_review').find((p) => p.id === rejected.id), undefined)

// --- Approve is refused until the paper facts are confirmed ---
const lockedNoFacts = validateOfficialPyqForApprove(getOfficialPyqPendingPaper(pending.id))
assert.equal(lockedNoFacts.ok, false)
assert.match(lockedNoFacts.errors.join(' '), /Paper facts are not confirmed/)

// --- Reviewed — Approve: Approved, nothing for students yet ---
const beforePyq = loadImportedPyqs().length
const beforeBank = (loadQuestionBank().questions ?? []).length
const approvedOnly = approveOfficialPyqPaper(withFacts(pending.id))
assert.equal(approvedOnly.ok, true, approvedOnly.errors?.join(' '))
assert.equal(approvedOnly.questionCount, 2)
assert.equal(getOfficialPyqPendingPaper(pending.id).status, 'approved')
assert.equal(loadImportedPyqs().length, beforePyq, 'approve alone must not reach student PYQ')
assert.equal((loadQuestionBank().questions ?? []).length, beforeBank, 'approve alone must not reach the bank')

// --- Publish → PYQ + published Question Bank ---
const result = publishOfficialPyqPaper(pending.id)
assert.equal(result.ok, true, result.errors?.join(' '))
assert.equal(result.pyqCount, 2)
assert.equal(result.bankCount, 2)
assert.equal(getOfficialPyqPendingPaper(pending.id).status, 'published')

const pyqs = loadImportedPyqs()
assert.equal(pyqs.length, beforePyq + 2)
assert.ok(pyqs.every((q) => q.officialPyq === true))
assert.ok(pyqs.some((q) => q.examPatternId === 'jee-main' && q.pyqYear === 2024))
assert.ok(pyqs.some((q) => q.pyqDate === '2024-01-24' && q.pyqShift === 1))
assert.ok(pyqs.some((q) => /AI solution/i.test(String(q.solution ?? ''))))

const published = loadPublishedUploadedQuestions()
assert.ok(published.length >= 2)
assert.ok(published.some((q) => q.officialPyq === true && q.pyqYear === 2024))
assert.ok(published.some((q) => (q.tags ?? []).includes('PYQ')))
const main2024 = published.filter((q) => q.officialPyq === true && q.pyqYear === 2024)
assert.ok(main2024.length >= 2)
assert.ok(
  main2024.every((q) => /J2024$/.test(String(q.id))),
  `official JEE Main 2024 bank ids must end with J2024, got ${main2024.map((q) => q.id).join(', ')}`,
)
assert.ok(
  main2024.every((q) => pyqs.some((p) => p.id === q.id)),
  'PYQ store and bank must share the founder PYQ id',
)

const { updateUploadedQuestion } = await import('../src/utils/questionBank.js')
const tagFix = main2024[0]
const savedTags = updateUploadedQuestion(tagFix.id, {
  subject: 'chemistry',
  chapter: 'Thermodynamics',
  topic: 'Enthalpy',
  questionType: tagFix.questionType || 'single_correct',
  examIds: tagFix.examIds ?? ['jee-main'],
})
assert.ok(savedTags, 'bank metatag save must succeed after Official PYQ publish')
const pyqAfterTag = loadImportedPyqs().find((p) => p.id === savedTags.id || p.id === tagFix.id)
assert.ok(pyqAfterTag, 'student PYQ copy must still exist after bank tag edit')
assert.equal(pyqAfterTag.subject, 'chemistry')
assert.equal(pyqAfterTag.chapter, 'Thermodynamics')
assert.equal(pyqAfterTag.topic, 'Enthalpy')

const publishedRow = listOfficialPyqPendingPapers('published').find((p) => p.id === pending.id)
assert.equal(publishedRow?.status, 'published')

const double = approveOfficialPyqPaper(withFacts(pending.id))
assert.equal(double.ok, false)
assert.match((double.errors || []).join(' '), /already published/i)
assert.match((double.errors || []).join(' '), /unpublish/i)
const doublePublish = publishOfficialPyqPaper(pending.id)
assert.equal(doublePublish.ok, false)
assert.match((doublePublish.errors || []).join(' '), /already published/i)

const publishedCount = loadImportedPyqs().filter((q) => q.paperId === pending.paperId).length
const publishedIds = getOfficialPyqPendingPaper(pending.id).questions.map((q) => q.id)

sessionStorage.setItem(
  'testvantage-session',
  JSON.stringify({ role: 'admin', email: 'admin@test', name: 'Admin', loggedInAt: 1 }),
)
// Unpublish: Published → Approved, gone from students, ids stay on the cards
const unpub = unpublishOfficialPyqPaper(pending.id)
assert.equal(unpub.ok, true, unpub.error)
assert.equal(unpub.paper?.status, 'approved')
assert.ok(unpub.pyqRemoved >= 2)
assert.equal(listOfficialPyqPendingPapers('published').find((p) => p.id === pending.id), undefined)
assert.equal(listOfficialPyqPendingPapers('approved').find((p) => p.id === pending.id)?.status, 'approved')
assert.equal(loadImportedPyqs().filter((q) => q.paperId === pending.paperId).length, 0)
assert.deepEqual(getOfficialPyqPendingPaper(pending.id).questions.map((q) => q.id), publishedIds)

// Send back for review: Approved → Pending
const back = unapproveOfficialPyqPaper(pending.id)
assert.equal(back.ok, true, back.error)
assert.equal(getOfficialPyqPendingPaper(pending.id).status, 'pending_review')

// Re-approve and publish again: same final ids, one copy only
const reap = approveOfficialPyqPaper(withFacts(pending.id))
assert.equal(reap.ok, true, reap.errors?.join(' '))
assert.equal(listOfficialPyqPendingPapers('approved').find((p) => p.id === pending.id)?.status, 'approved')
const repub = publishOfficialPyqPaper(pending.id)
assert.equal(repub.ok, true, repub.errors?.join(' '))
assert.deepEqual(repub.questionIds, publishedIds, 'publishing again keeps the final ids')
assert.equal(
  loadImportedPyqs().filter((q) => q.paperId === pending.paperId).length,
  publishedCount,
  'a second publish must not add another copy',
)

// --- Direct add path ---
const direct = addOfficialPyqPendingPaper({
  exam: 'jee-advanced',
  year: 2022,
  session: 'Paper 1',
  sourceLabel: 'Official JEE Advanced archive',
  sourceUrl: 'https://jeeadv.ac.in/archive.html',
  questions: [
    {
      text: 'Advanced fixture: which is correct?',
      options: ['P', 'Q', 'R', 'S'],
      correctIndex: 2,
      subject: 'physics',
      chapter: 'General',
      answerSource: 'from_paper',
    },
  ],
})
assert.equal(direct.status, 'pending_review')
assert.ok(localStorage.getItem(OFFICIAL_PYQ_PENDING_KEY))

// --- Duplicate JEE Advanced 2024 imports collapse to one sitting ---
clearOfficialPyqPendingPapers()
const dupMeta = {
  exam: 'jee-advanced',
  year: 2024,
  session: 'Paper 1',
  sourceLabel: 'Official JEE Advanced archive',
  sourceUrl: 'https://jeeadv.ac.in/archive.html',
  paperLabel: 'JEE Advanced 2024',
  questions: [
    {
      text: 'Dup fixture Q1?',
      options: ['A', 'B', 'C', 'D'],
      correctIndex: 0,
      subject: 'physics',
      chapter: 'General',
      answerSource: 'from_paper',
    },
  ],
}
importQuestionsToOfficialPyqPending(dupMeta)
importQuestionsToOfficialPyqPending(dupMeta)
importQuestionsToOfficialPyqPending(dupMeta)
assert.equal(listOfficialPyqPendingPapers('all').length, 1, 'same sitting should upsert, not triple')
const dupRow = listOfficialPyqPendingPapers('pending_review')[0]
const rejDup = rejectOfficialPyqPaper(dupRow.id, 'bad parse')
assert.equal(rejDup.ok, true)
assert.equal(listOfficialPyqPendingPapers('rejected').length, 1)
const delDup = dismissOfficialPyqSitting(dupRow)
assert.equal(delDup.ok, true)
assert.equal(listOfficialPyqPendingPapers('all').length, 0)
assert.equal(dedupeOfficialPyqPendingPapers(), 0)

// Different paperId / empty slot must still collapse to one 2024 Adv P1 row
clearOfficialPyqPendingPapers()
importQuestionsToOfficialPyqPending({
  ...dupMeta,
  paperId: 'jee-advanced-2024-paper-1',
  questions: [{ text: 'Full parse Q', options: ['A', 'B', 'C', 'D'], correctIndex: 0, subject: 'physics', chapter: 'General' }],
})
addOfficialPyqPendingPaper({
  ...dupMeta,
  paperId: 'jee-advanced-2024-jee-adv-2024-p1',
  questions: [],
})
importQuestionsToOfficialPyqPending({
  ...dupMeta,
  paperId: 'custom-label-id',
  paperLabel: 'JEE Advanced 2024 Paper 1',
  questions: [{ text: 'Another import', options: ['A', 'B', 'C', 'D'], correctIndex: 0, subject: 'physics', chapter: 'General' }],
})
assert.equal(listOfficialPyqPendingPapers('all').length, 1, 'different paperIds for same sitting collapse')
assert.ok(listOfficialPyqPendingPapers('all')[0].questions.length >= 1, 'empty slot must not wipe questions')

// --- Re-parse stored OCR on pending paper ---
const sparse = importQuestionsToOfficialPyqPending({
  exam: 'jee-advanced',
  year: 2024,
  session: 'Paper 1',
  sourceLabel: 'Official JEE Advanced archive',
  paperLabel: 'JEE Advanced 2024 Paper 1 (re-parse test)',
  notes: `Imported from fixture.pdf

--- prepared-ocr ---

SECTION 1 (Maximum Marks: 18)
This section contains TWO (2) questions.

1. Let $f(x)=x^2$. Then $f(2)$ equals
(A) $1$
(B) $2$
(C) $4$
(D) $8$

2. If $x+y=5$ then $x$ when $y=2$ is
(A) $1$
(B) $2$
(C) $3$
(D) $4$

3. The slope of the line $y=3x+2$ is
(A) $2$
(B) $3$
(C) $5$
(D) $6$`,
  questions: [
    {
      text: 'SECTION 1 (Maximum Marks: 18)',
      options: [',', 'and', 'marking scheme', 'ONLY ONE of these four options is correct'],
      subject: 'physics',
      chapter: 'General',
      answerSource: 'unknown',
    },
  ],
})
assert.equal(sparse.questions.length, 1)
const reParsed = reExtractOfficialPyqPendingPaper(sparse)
assert.equal(reParsed.ok, true, reParsed.error)
assert.ok(reParsed.count >= 2, `expected >=2 questions, got ${reParsed.count}`)
assert.ok(reParsed.questions.every((q) => !/^section\s+/i.test(String(q.text))))

const geminiReparse = await reExtractOfficialPyqPendingPaperWithGeminiTimed(sparse, {
  timeoutMs: 5000,
  overallTimeoutMs: 120_000,
})
assert.equal(geminiReparse.ok, true, geminiReparse.error)
assert.ok(geminiReparse.count >= 2, `async re-parse must heal stored OCR, got ${geminiReparse.count}`)

const sixAdv = importQuestionsToOfficialPyqPending({
  exam: 'jee-advanced',
  year: 2021,
  session: 'Paper 1',
  sourceLabel: 'Official JEE Advanced archive',
  paperLabel: 'JEE Advanced 2021 Paper 1 (6-Q refuse test)',
  questions: Array.from({ length: 6 }, (_, i) => ({
    text: `SECTION ${i + 1} (Maximum Marks: 12) This section contains FOUR (4) questions.`,
    options: [',', 'and', 'marking scheme', 'ONLY ONE of these four options is correct'],
    subject: 'physics',
    chapter: 'General',
    answerSource: 'unknown',
  })),
})
const sixCheck = validateOfficialPyqForApprove(sixAdv)
assert.equal(sixCheck.ok, false, 'JEE Advanced with 6 questions must not approve')
assert.match(sixCheck.errors.join(' '), /do not approve|at least 40|under 40/i)
const sixApprove = approveOfficialPyqPaper(withFacts(sixAdv.id))
assert.equal(sixApprove.ok, false)
assert.match((sixApprove.errors ?? []).join(' '), /do not approve|at least 40|under 40|usable questions/i)

const keyBlob = importQuestionsToOfficialPyqPending({
  exam: 'jee-main',
  year: 2024,
  session: 'January Session · Shift 1',
  sourceLabel: 'Official NTA (test fixture)',
  paperLabel: 'Answer-key blob must not approve',
  questions: [
    {
      text: 'The correct option is (A) (P)→(4)(Q)→(3)(R)→(1)(S)→(2) --- page --- SECTION 2 (Maximum Marks: 12) This section contains THREE (03) questions. ONE OR MORE THAN ONE choose the option(s)',
      options: ['(P)→(4)', '(Q)→(3)', '(R)→(1)', '(S)→(2)'],
      subject: 'mathematics',
      chapter: 'General',
      answerSource: 'unknown',
    },
  ],
})
const keyCheck = validateOfficialPyqForApprove(keyBlob)
assert.equal(keyCheck.ok, false, 'answer-key + SECTION 2 row must not approve')
assert.match(keyCheck.errors.join(' '), /instruction|answer key|usable/i)

const missingListI = importQuestionsToOfficialPyqPending({
  exam: 'jee-main',
  year: 2024,
  session: 'January Session · Shift 1',
  sourceLabel: 'Official NTA (test fixture)',
  paperLabel: 'Match missing List-I must not approve',
  questions: [
    {
      text: 'List-II (1) $3C_0$ (2) $C_0/2$ (3) $C_0/3$ (4) $2C_0$',
      options: ['P → 3; Q → 2; R → 4; S → 5', 'P → 2; Q → 3; R → 2; S → 1', 'P → 3; Q → 2; R → 4; S → 1', 'P → 3; Q → 2; R → 2; S → 5'],
      subject: 'physics',
      chapter: 'General',
      answerSource: 'from_paper',
    },
  ],
})
const listICheck = validateOfficialPyqForApprove(missingListI)
assert.equal(listICheck.ok, false, 'match-the-column without List-I must not approve')
assert.match(listICheck.errors.join(' '), /List-I|usable|instruction/i)

// Live JEE Advanced 2024 shape: Q31/Q32/Q49 store a List-II-only match stem and
// the List-I rows only exist in the stored OCR. The approve gate must judge the
// healed card (what the preview shows), not the raw stored text.
const HEALABLE_MATCH_OCR = `Q. 31 One mole of an ideal monatomic gas is taken through a cycle. Match each entry in List-I to the correct entry in List-II.
List-I
(P) Work done by the gas in the isothermal expansion is
(Q) Work done by the gas in the isobaric expansion is
(R) Heat absorbed by the gas in the isochoric step is
(S) Change in the internal energy of the gas over the cycle is
List-II
(1) $R T_{0} \\ln 2$
(2) $3 R T_{0}$
(3) $R T_{0} / 2$
(4) $2 R T_{0}$
(5) $0$

Q. 32 The circuit described here contains three capacitors. Match each entry in List-I to the correct entry in List-II.
List-I
(P) The equivalent capacitance between the terminals A and B is
(Q) The equivalent capacitance after the switch is closed is
(R) The equivalent capacitance of the two series capacitors is
(S) The equivalent capacitance of the parallel branch is
List-II
(1) $3 C_{0}$
(2) $C_{0} / 2$
(3) $C_{0} / 3$
(4) $2 C_{0} / 3$
(5) $2 C_{0}$

Q. 49 A light ray is incident on a prism at normal incidence. Match each entry in List-I to the correct entry in List-II.
List-I
(P) The number of totally internally reflected rays is
(Q) The number of rays emerging from the second face is
(R) The number of rays absorbed by the coating is
(S) The number of rays retracing the incident path is
List-II
(1) $0$
(2) $2$
(3) $4$
(4) $20$
(5) $200$
`
const HEAL_MATCH_OPTS = [
  '(P) → (2) (Q) → (4) (R) → (1) (S) → (5)',
  '(P) → (2) (Q) → (4) (R) → (3) (S) → (5)',
  '(P) → (1) (Q) → (5) (R) → (3) (S) → (4)',
  '(P) → (3) (Q) → (2) (R) → (4) (S) → (1)',
]
const listTwoOnlyStem = (title, rows) =>
  `${title} Match each entry in List-I to the correct entry in List-II.\nList-II\n${rows.join('\n')}`
const healableStems = [
  listTwoOnlyStem('One mole of an ideal monatomic gas is taken through a cycle.', [
    '(1) $R T_{0} \\ln 2$',
    '(2) $3 R T_{0}$',
    '(3) $R T_{0} / 2$',
    '(4) $2 R T_{0}$',
    '(5) $0$',
  ]),
  listTwoOnlyStem('The circuit described here contains three capacitors.', [
    '(1) $3 C_{0}$',
    '(2) $C_{0} / 2$',
    '(3) $C_{0} / 3$',
    '(4) $2 C_{0} / 3$',
    '(5) $2 C_{0}$',
  ]),
  listTwoOnlyStem('A light ray is incident on a prism at normal incidence.', [
    '(1) $0$',
    '(2) $2$',
    '(3) $4$',
    '(4) $20$',
    '(5) $200$',
  ]),
]
for (const stem of healableStems) {
  assert.equal(
    matchQuestionMissingListI({ text: stem, options: HEAL_MATCH_OPTS }),
    true,
    'fixture stem must really be missing List-I before heal',
  )
}
const healableQs = Array.from({ length: 51 }, (_, i) => {
  const n = i + 1
  const matchAt = { 31: 0, 32: 1, 49: 2 }[n]
  if (matchAt != null) {
    return {
      text: healableStems[matchAt],
      options: HEAL_MATCH_OPTS,
      subject: 'physics',
      chapter: 'General',
      questionType: 'matrix_match',
      pyqSlot: n,
      questionNumber: n,
      answerSource: 'from_paper',
      correctIndex: 0,
    }
  }
  return {
    text: `Let $f_{${n}}(x)=x^{2}+${n}$. Then the value of $f_{${n}}(1)$ is equal to`,
    options: ['$1$', '$2$', '$3$', '$4$'],
    subject: n <= 17 ? 'physics' : n <= 34 ? 'chemistry' : 'mathematics',
    chapter: 'General',
    pyqSlot: n,
    questionNumber: n,
    answerSource: 'from_paper',
    correctIndex: 0,
  }
})
const healAware = importQuestionsToOfficialPyqPending({
  exam: 'jee-advanced',
  year: 2024,
  session: 'Paper 1',
  sourceLabel: 'Official JEE Advanced (test fixture)',
  paperLabel: 'Heal-aware approve gate (List-I only in OCR)',
  preparedText: HEALABLE_MATCH_OCR,
  notes: HEALABLE_MATCH_OCR,
  questions: healableQs,
})
updateOfficialPyqPendingPaper(healAware.id, { expectedQuestionCount: 51 })
const healAwarePaper = getOfficialPyqPendingPaper(healAware.id)
assert.equal(healAwarePaper.questions.length, 51)
assert.ok(
  healAwarePaper.questions.filter((q) => matchQuestionMissingListI(q)).length <= 3,
  'import may already restore List-I from the stored scan; it never adds missing ones',
)
const healAwareCheck = validateOfficialPyqForApprove(factsOk(healAwarePaper))
assert.equal(
  healAwareCheck.ok,
  true,
  `List-I present in OCR must approve after heal, got: ${healAwareCheck.errors.join(' | ')}`,
)

// Summary paper (no OCR field) must still pass: validate back-fills from the fat store.
const healAwareSummary = { ...healAwarePaper }
delete healAwareSummary.preparedText
delete healAwareSummary.notes
const healAwareSummaryCheck = validateOfficialPyqForApprove(factsOk(healAwareSummary))
assert.equal(
  healAwareSummaryCheck.ok,
  true,
  `validate must back-fill stored OCR for summary papers, got: ${healAwareSummaryCheck.errors.join(' | ')}`,
)

// Guard must NOT be weakened: same 51-card paper with no List-I anywhere still blocks.
const noListIAnywhere = importQuestionsToOfficialPyqPending({
  exam: 'jee-advanced',
  year: 2024,
  session: 'Paper 1',
  sourceLabel: 'Official JEE Advanced (test fixture)',
  paperLabel: 'No List-I anywhere must still block',
  preparedText: `${'This stored OCR window has no List-I rows at all, only prose. '.repeat(40)}`,
  questions: healableQs,
})
updateOfficialPyqPendingPaper(noListIAnywhere.id, { expectedQuestionCount: 51 })
const noListICheck = validateOfficialPyqForApprove(getOfficialPyqPendingPaper(noListIAnywhere.id))
assert.equal(noListICheck.ok, false, 'match cards with no List-I anywhere must still block approve')
assert.match(noListICheck.errors.join(' '), /List-I/i)
const noListIApprove = approveOfficialPyqPaper(withFacts(noListIAnywhere.id))
assert.equal(noListIApprove.ok, false, 'approve must refuse a paper with List-I-less match cards')
assert.match((noListIApprove.errors ?? []).join(' '), /List-I/i)

// The approve gate must run the shared heal, not re-implement it.
const approvalSrc = readFileSync(new URL('../src/utils/officialPyqApproval.js', import.meta.url), 'utf8')
const validateStart = approvalSrc.indexOf('export function validateOfficialPyqForApprove')
const validateEnd = approvalSrc.indexOf('export function approveOfficialPyqPaper')
assert.ok(validateStart >= 0 && validateEnd > validateStart)
const validateSrc = approvalSrc.slice(validateStart, validateEnd)
assert.match(
  validateSrc,
  /healOfficialPyqPaperQuestionsEnriched/,
  'validateOfficialPyqForApprove must judge healed cards',
)
assert.match(
  validateSrc,
  /getOfficialPyqPendingOcrText/,
  'validateOfficialPyqForApprove must back-fill stored OCR',
)
assert.match(
  approvalSrc,
  /healOfficialPyqPaperQuestions\(paper, opts\)\.map\(\(q\) =>\s*\n?\s*enrichMatchListsFromOcr\(healUploadQuestionCard\(q, source\), source\)/,
  'enriched heal must run the shared per-card heal (same path as the preview)',
)

// The Approve button must stay clickable via the pointer-down path used by
// "Re-parse stored OCR", and its error text must render next to the button.
const pendingSrcForButtons = readFileSync(
  new URL('../src/pages/OfficialPyqPending.jsx', import.meta.url),
  'utf8',
)
assert.match(pendingSrcForButtons, /data-testid="official-pyq-approve"/)
assert.match(pendingSrcForButtons, /data-testid="official-pyq-approve-error"/)
const approveBtnAt = pendingSrcForButtons.indexOf('data-testid="official-pyq-approve"')
const approveBtnSrc = pendingSrcForButtons.slice(approveBtnAt, approveBtnAt + 700)
assert.match(approveBtnSrc, /onPointerDown/, 'Approve needs the pointer-down path')
assert.match(approveBtnSrc, /e\.detail > 0/, 'Approve onClick must not double-fire after pointer-down')
assert.match(
  pendingSrcForButtons,
  /official-pyq-approve-error"\]'\s*\)\s*[\s\S]{0,40}?\?\.scrollIntoView/,
  'approve failures must scroll their error into view',
)

// The approve row stays in normal flow above the question: a sticky row covered
// half of a tall graph. It still sits above neighbours so clicks land on it.
const cssSrc = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
const actionsAt = cssSrc.indexOf('.official-pyq-preview .official-pyq-actions.bank-review-status-actions')
assert.ok(actionsAt >= 0, 'approve action row rule must exist')
const actionsRule = cssSrc.slice(actionsAt, cssSrc.indexOf('}', actionsAt) + 1)
assert.doesNotMatch(actionsRule, /position:\s*sticky/, 'approve row must not cover the figure below it')
assert.match(actionsRule, /position:\s*relative/)
assert.match(actionsRule, /z-index:\s*\d+/)
assert.match(cssSrc, /--official-pyq-chrome-h:\s*calc\(/, 'chrome height offset must be defined')

const fragPaper = importQuestionsToOfficialPyqPending({
  exam: 'jee-main',
  year: 2024,
  session: 'January Session · Shift 1',
  sourceLabel: 'Official NTA (test fixture)',
  paperLabel: 'Fragment extras persist-heal',
  questions: [
    {
      text: 'Let $f(x)=x^2$. Then $f(1)$ is equal to',
      options: ['$1$', '$2$', '$3$', '$4$'],
      subject: 'mathematics',
      chapter: 'General',
      answerSource: 'from_paper',
    },
    {
      text: 'Match the quantities mentioned in List-I with their values in List-II and choose the correct option.',
      options: [],
      subject: 'physics',
      chapter: 'General',
    },
  ],
})
assert.equal(fragPaper.questions.length, 2)
const persisted = persistHealedOfficialPyqPaper(fragPaper)
assert.equal(persisted.ok, true)
assert.ok(persisted.count < 2, 'instruction-only extra must drop on persist heal')

const {
  listOfficialPyqMissingSlots,
  reserveOfficialPyqMissingSlots,
  isOfficialPyqPlaceholder,
  mergeOfficialPyqQuestionsBySlot,
  officialPyqSlotNumber,
} = await import('../src/utils/officialPyqMissingSlots.js')
const {
  snapPyqExpectedToCatalog,
  expectedPyqTargetFromOcrLite,
} = await import('../src/utils/pyqOcrCountLite.js')

assert.equal(snapPyqExpectedToCatalog('jee-advanced', 50), 51)
assert.equal(snapPyqExpectedToCatalog('jee-advanced', 53), 51)
assert.equal(snapPyqExpectedToCatalog('jee-advanced', 51), 51)
assert.equal(snapPyqExpectedToCatalog('jee-advanced', 48), 48)
assert.equal(expectedPyqTargetFromOcrLite('jee-advanced', ''), 51)
const ocr48 = Array.from({ length: 48 }, (_, i) => `\\item[Q.] ${i + 1} Let $x=${i}$.`).join('\n')
assert.equal(expectedPyqTargetFromOcrLite('jee-advanced', ocr48), 48)

const fiftyQs = Array.from({ length: 50 }, (_, i) => ({
  text: `Let $f_${i + 1}(x)=x$. Then $f(1)$ is`,
  options: ['$1$', '$2$', '$3$', '$4$'],
  subject: 'physics',
  chapter: 'General',
  pyqSlot: i + 1,
  questionNumber: i + 1,
  answerSource: 'from_paper',
}))
const short50 = importQuestionsToOfficialPyqPending({
  exam: 'jee-advanced',
  year: 2019,
  session: 'Paper 2',
  sourceLabel: 'Official JEE Advanced (test fixture)',
  paperLabel: 'Short 50 vs 51 reserve later',
  questions: fiftyQs,
})
updateOfficialPyqPendingPaper(short50.id, {
  expectedQuestionCount: 51,
  paperFacts: { known: true, expectedQuestionCount: 51 },
})
const short50Check = validateOfficialPyqForApprove(getOfficialPyqPendingPaper(short50.id))
assert.equal(short50Check.ok, false, '50 filled vs 51 expected must not approve')
assert.match(short50Check.errors.join(' '), /50|51|missing|do not approve/i)
const missing51 = listOfficialPyqMissingSlots(getOfficialPyqPendingPaper(short50.id)?.questions, 51)
assert.deepEqual(missing51, [51])
const reserved51 = reserveOfficialPyqMissingSlots(
  getOfficialPyqPendingPaper(short50.id)?.questions,
  51,
  short50.id,
)
assert.equal(reserved51.filter(isOfficialPyqPlaceholder).length, 1)
updateOfficialPyqPendingPaper(short50.id, { questions: reserved51, expectedQuestionCount: 51 })
const reservedCheck = validateOfficialPyqForApprove(getOfficialPyqPendingPaper(short50.id))
assert.equal(reservedCheck.ok, false, 'placeholders must not approve')
assert.match(reservedCheck.errors.join(' '), /reserved|filled|51/i)
persistHealedOfficialPyqPaper(getOfficialPyqPendingPaper(short50.id))
assert.equal(
  (getOfficialPyqPendingPaper(short50.id)?.questions ?? []).filter(isOfficialPyqPlaceholder).length,
  1,
  'heal must keep reserved empty slot',
)

const fiftyThreeQs = Array.from({ length: 53 }, (_, i) => ({
  text: `Let $g_${i + 1}(x)=x$. Then $g(1)$ is`,
  options: ['$1$', '$2$', '$3$', '$4$'],
  subject: 'physics',
  chapter: 'General',
  pyqSlot: i + 1,
  questionNumber: i + 1,
  answerSource: 'from_paper',
}))
const extra53 = importQuestionsToOfficialPyqPending({
  exam: 'jee-advanced',
  year: 2018,
  session: 'Paper 1',
  sourceLabel: 'Official JEE Advanced (test fixture)',
  paperLabel: '53 extras vs 51 must not approve',
  questions: fiftyThreeQs,
})
assert.equal(extra53.expectedQuestionCount, 51)
const extra53Check = validateOfficialPyqForApprove({
  ...extra53,
  paperFacts: { known: true, expectedQuestionCount: 51 },
})
assert.equal(extra53Check.ok, false, '53 cards vs 51 expected must not approve')
assert.match(extra53Check.errors.join(' '), /53|expected|fragment|51/i)
const incoming51 = fiftyThreeQs.slice(0, 51)
const mergedDown = mergeOfficialPyqQuestionsBySlot(fiftyThreeQs, incoming51, 51)
assert.equal(mergedDown.length, 51, 're-parse merge must drop leftover 52/53')
assert.ok(mergedDown.every((q, i) => officialPyqSlotNumber(q, i) <= 51))

const bank = loadQuestionBank()
assert.ok(bank.questions.length >= 2)

const summaries = listOfficialPyqPendingSummaries('all')
assert.ok(summaries.length >= 1)
assert.equal(Object.hasOwn(summaries[0], 'questionCount'), true)
assert.equal(summaries[0].questions, undefined)
assert.equal(summaries[0].preparedText, undefined)
const counts = countOfficialPyqPendingByStatus()
assert.equal(counts.all, summaries.length)
assert.equal(counts.pending_review + counts.approved + counts.rejected, counts.all)
assert.equal(
  listOfficialPyqPendingSummaries('pending_review').every((p) => p.status === 'pending_review'),
  true,
)

const storeSrc = readFileSync(new URL('../src/utils/officialPyqPendingStore.js', import.meta.url), 'utf8')
const listFnStart = storeSrc.indexOf('export function listOfficialPyqPendingSummaries')
const listFnEnd = storeSrc.indexOf('export function countOfficialPyqPendingByStatus')
assert.ok(listFnStart >= 0 && listFnEnd > listFnStart)
assert.equal(
  storeSrc.slice(listFnStart, listFnEnd).includes('loadRoot('),
  false,
  'tab summaries must not JSON.parse the full OCR store',
)
const pendingSrc = readFileSync(new URL('../src/pages/OfficialPyqPending.jsx', import.meta.url), 'utf8')
assert.match(pendingSrc, /OfficialPyqTabList/)
assert.equal(pendingSrc.includes('dedupeOfficialPyqPendingPapers'), false)
assert.equal(pendingSrc.includes('QuestionStem'), false)
assert.equal(pendingSrc.includes('startTransition'), false)
assert.equal(pendingSrc.includes('hydrateOfficialPyqPendingSummariesIfEmpty()'), true)
const tabListSrc = readFileSync(new URL('../src/pages/OfficialPyqTabList.jsx', import.meta.url), 'utf8')
assert.equal(tabListSrc.includes('startTransition'), false)
assert.equal(tabListSrc.includes('hydrateOfficialPyqPendingSummariesIfEmpty'), false)
assert.equal(tabListSrc.includes('onClosePreview'), false)
assert.equal(tabListSrc.includes('listOfficialPyqPendingPapers'), false)
assert.match(tabListSrc, /setFilter\(next\)/)
const pagerSrc = readFileSync(new URL('../src/pages/OfficialPyqPreviewPager.jsx', import.meta.url), 'utf8')
assert.match(pagerSrc, /setPage\(safe\)/)
const goPageStart = pagerSrc.indexOf('const goPage')
const goPageEnd = pagerSrc.indexOf('useEffect', goPageStart + 1)
const goPageSrc = goPageStart >= 0 ? pagerSrc.slice(goPageStart, goPageEnd > goPageStart ? goPageEnd : goPageStart + 500) : ''
assert.equal(goPageSrc.includes('getOfficialPyqPendingPaper'), false)
assert.equal(goPageSrc.includes('OfficialPyqPreviewMath'), false)
assert.equal(goPageSrc.includes('scrollIntoView'), false)
assert.equal(pagerSrc.includes('startTransition,'), false)
assert.equal(pagerSrc.includes('applyUploadQualityGuards'), false, 'Next must not heal all cards on the UI thread')
const routeSrc = readFileSync(new URL('../src/pages/OfficialPyqPendingRoute.jsx', import.meta.url), 'utf8')
assert.equal(routeSrc.includes('OfficialPyqPendingBootstrap'), false)
assert.match(routeSrc, /import OfficialPyqPending from/)

const emptyMissing = listOfficialPyqMissingSlots([], 51)
assert.equal(emptyMissing.includes(6), true, 'empty paper missing list must include Q6')
assert.equal(emptyMissing.length, 51)

clearOfficialPyqPendingPapers()
const fiftyOne = Array.from({ length: 51 }, (_, i) => ({
  text: `Let f_${i + 1}(x) be a stored official stem.`,
  options: ['a', 'b', 'c', 'd'],
  questionNumber: i + 1,
  pyqSlot: i + 1,
}))
const filledPaper = addOfficialPyqPendingPaper({
  exam: 'jee-advanced',
  year: 2024,
  session: 'Paper 1',
  paperLabel: 'JEE Advanced 2024',
  sourceLabel: 'Official JEE Advanced archive',
  questions: fiftyOne,
})
assert.equal(countFilledOfficialPyqQuestions(getOfficialPyqPendingPaper(filledPaper.id).questions), 51)
const wiped = updateOfficialPyqPendingPaper(filledPaper.id, { questions: [] })
assert.equal(
  countFilledOfficialPyqQuestions(wiped.questions),
  51,
  'update must not replace 51 filled cards with 0',
)
assert.equal(keepOfficialPyqQuestionsIfEmptied({ questions: fiftyOne }, []).length, 51)
assert.equal(
  countFilledOfficialPyqQuestions(recoverOfficialPyqQuestionsFromStore(filledPaper.id)),
  51,
)

const emptyP2 = pendingPaperFromSourceSlot(
  {
    id: 'jee-adv-2024-p2',
    exam: 'jee-advanced',
    year: 2024,
    session: 'Paper 2',
    paperLabel: 'JEE Advanced 2024 Paper 2',
    sourceLabel: 'Official JEE Advanced archive',
    sourceUrl: 'https://jeeadv.ac.in/archive.html',
    downloadHint: 'Open archive → 2024 → Paper 2 PDF.',
  },
  [],
)
assert.equal(countFilledOfficialPyqQuestions(emptyP2.questions), 0)
assert.equal(recoverOfficialPyqQuestionsFromStore(emptyP2.id).length, 0, 'do not invent Paper 2 cards')
const sibling = findOfficialPyqSiblingWithQuestions(emptyP2)
assert.ok(sibling, 'empty Paper 2 must find the stored 51-question Paper 1')
assert.equal(sibling.id, filledPaper.id)
assert.ok(Number(sibling.questionCount) >= 51, 'sibling must still report 51 questions')

const passagePaper = {
  id: 'opyq-para',
  exam: 'jee-advanced',
  year: 2024,
  session: 'Paper 2',
  paperId: 'jee-adv-2024-p2',
  paperLabel: 'JEE Advanced 2024 Paper 2',
  sourceLabel: 'Official JEE Advanced archive',
}
const pyqChildA = pendingQuestionToPyqItem(
  passagePaper,
  {
    text: 'The kinetic energy of the particle is',
    options: ['$E$', '$2E$', '$3E$', '$4E$'],
    passageText: 'Let $S$ be the set. $$E = \\frac{1}{2}mv^{2}$$',
    passageGroup: 'pyq-para-5-6-lets',
    subject: 'physics',
  },
  4,
)
const pyqChildB = pendingQuestionToPyqItem(
  passagePaper,
  {
    text: 'The potential energy of the particle is',
    options: ['$0$', '$E$', '$2E$', '$3E$'],
    passageText: 'Let $S$ be the set. $$E = \\frac{1}{2}mv^{2}$$',
    passageGroup: 'pyq-para-5-6-lets',
    subject: 'physics',
  },
  5,
)
assert.match(pyqChildA.passageText, /\$\$E = \\frac/)
assert.equal(pyqChildA.passageText, pyqChildB.passageText)
const linked = linkOfficialPyqBankPassages([
  { ...pyqItemToBankQuestion(passagePaper, pyqChildA, 4), id: 'PHY00005A2024' },
  { ...pyqItemToBankQuestion(passagePaper, pyqChildB, 5), id: 'PHY00006A2024' },
])
assert.ok(linked[0].passageText)
assert.equal(linked[1].passageId, linked[0].id)
assert.ok(!linked[1].passageText, 'second child points at the passage, is not a second passage card')

const paraIBody =
  'Let $S=\\{1,2,3,4,5,6\\}$ and $X$ be the set of all relations $R$ from $S$ to $S$ that satisfy both the following properties. Let $Y=\\{R\\in X:$ The range of $R$ has exactly one element$\\}$. Let $n(A)$ denote the number of elements in a set $A$.'
const paraIPaper = {
  id: 'pending-para-i',
  exam: 'jee-advanced',
  year: 2024,
  paperId: 'p2',
  paperLabel: 'JEE Advanced 2024 Paper 2',
  sourceLabel: 'Official JEE Advanced archive',
}
const child14 = pendingQuestionToPyqItem(
  paraIPaper,
  {
    text: 'If $n(X)={}^{m}C_{6}$, then the value of $m$ is ______.',
    options: ['', '', '', ''],
    passageText: paraIBody,
    passageGroup: 'pyq-para-14-15-lets',
    passageId: 'pyq-para-14-15-lets',
    passageRole: 'comprehension_child',
    subject: 'maths',
  },
  13,
)
const child15 = pendingQuestionToPyqItem(
  paraIPaper,
  {
    text: 'If the value of $n(Y)+n(Z)$ is $k^{2}$, then $|k|$ is ______.',
    options: ['', '', '', ''],
    passageText: paraIBody,
    passageGroup: 'pyq-para-14-15-lets',
    passageId: 'pyq-para-14-15-lets',
    passageRole: 'comprehension_child',
    subject: 'maths',
  },
  14,
)
assert.equal(child14.passageRole, 'comprehension_child')
assert.equal(child15.passageRole, 'comprehension_child')
assert.equal(child14.passageText, child15.passageText)
const linkedI = linkOfficialPyqBankPassages([
  { ...pyqItemToBankQuestion(paraIPaper, child14, 13), id: 'MAT00014A2024' },
  { ...pyqItemToBankQuestion(paraIPaper, child15, 14), id: 'MAT00015A2024' },
])
assert.ok(linkedI[0].passageText)
assert.doesNotMatch(String(linkedI[0].passageText), /\\section/)
assert.equal(linkedI[1].passageId, linkedI[0].id)
assert.ok(!linkedI[1].passageText, 'Q15 points at the same passage, does not duplicate it')
assert.equal(linkedI[0].passageRole, 'comprehension_child')
assert.equal(linkedI[1].passageRole, 'comprehension_child')

const { healAndPersistOfficialPyqPaper } = await import('../src/utils/officialPyqLocalReparse.js')
const rejectedOcr = [
  '\\section*{PARAGRAPH "II"}',
  'Three particles 1, 2 and 3 connected by a spring-mass system oscillate with amplitude A as shown in the figure.',
  '\\includegraphics{https://cdn.mathpix.com/cropped/spring-mass.png}',
  '\\item[Q.] 33 The amplitude of particle 2 is ______.',
  '\\section*{PARAGRAPH "I"}',
  'An organic compound P with molecular formula $C_{9}H_{18}O_{2}$ is treated as follows.',
  '\\item[Q.] 48 Sum of number of oxygen atoms in S and T is ____',
  'END OF THE QUESTION PAPER',
].join('\n')
const rejectedHealPaper = addOfficialPyqPendingPaper({
  exam: 'jee-advanced',
  year: 2024,
  paperLabel: 'Rejected heal',
  sourceLabel: 'test',
  status: 'rejected',
  preparedText: rejectedOcr,
  questions: [
    {
      text: `Three particles 1, 2 and 3 spring-mass ${'\\includegraphics{https://cdn.mathpix.com/cropped/spring-mass.png}'}\nSum of number of oxygen atoms in S and T is ____`,
      options: ['', '', '', ''],
      printedNumber: 48,
      questionNumber: 48,
      subject: 'chemistry',
      passageText: 'Three particles 1, 2 and 3 spring-mass END OF THE QUESTION PAPER',
    },
    {
      text: 'The amplitude of particle 2 is ______.',
      options: ['', '', '', ''],
      printedNumber: 33,
      questionNumber: 33,
      subject: 'physics',
      passageText: 'Three particles 1, 2 and 3 spring-mass oscillate with amplititu',
    },
  ],
})
assert.equal(rejectedHealPaper.status, 'rejected')
const rejectedHeal = healAndPersistOfficialPyqPaper(getOfficialPyqPendingPaper(rejectedHealPaper.id))
assert.equal(rejectedHeal.ok, true, 'rejected papers must re-heal from stored OCR')
const storedRejected = getOfficialPyqPendingPaper(rejectedHealPaper.id)
const chem48 = storedRejected.questions.find((q) => Number(q.printedNumber || q.questionNumber) === 48)
const phys33 = storedRejected.questions.find((q) => Number(q.printedNumber || q.questionNumber) === 33)
assert.doesNotMatch(`${chem48?.text}\n${chem48?.passageText || ''}`, /spring-mass/i)
assert.match(`${chem48?.text}\n${chem48?.passageText || ''}`, /C_\{9\}H_\{18\}O_\{2\}|oxygen atoms/i)
assert.match(String(phys33?.passageText || ''), /as shown in the figure/i)
assert.doesNotMatch(String(phys33?.passageText || ''), /C_\{9\}H_\{18\}O_\{2\}/)
assert.doesNotMatch(`${chem48?.text}\n${phys33?.passageText || ''}`, /END OF THE QUESTION PAPER/i)
assert.match(
  pendingSrcForButtons,
  /healAndPersistOfficialPyqPaper/,
  'Rejected tab open must persist the shared heal',
)

const { officialPyqContentReviewMessages, findReviewFlagSpans, reviewMarkSpans } = await import(
  '../src/utils/officialPyqReviewFlags.js'
)
const flaggedStem =
  'In the following reaction sequence, major products X and Y are acyclic monomers. Red P, $\\mathrm{Br}_{2} $$\\mathrm{CH}_{3}$ and 500 mol of $$\\mathbf{Y}$ to give Z.'
const flagSpans = findReviewFlagSpans(flaggedStem)
assert.ok(flagSpans.length >= 1, 'raw code must produce a highlight span')
assert.ok(
  flagSpans.some((span) => /mathrm\{Br\}|mathbf\{Y\}/.test(flaggedStem.slice(span.start, span.end))),
  'highlight must cover the leftover command, not a second copy of the stem',
)
const checkerStem = 'The value is 4. Raw LaTeX is still showing as code.'
const checkerSpans = findReviewFlagSpans(checkerStem)
assert.ok(
  checkerSpans.some((span) => checkerStem.slice(span.start, span.end).includes('Raw LaTeX is still showing')),
  'a checker sentence stored in the stem must be the marked span',
)
const reviewMsgs = officialPyqContentReviewMessages([
  {
    text: 'Let $x=1$. Then $x$ is',
    options: ['$1$', '$2$', '$3$', '$4$'],
    subject: 'physics',
    chapter: 'General',
  },
  {
    text: flaggedStem,
    printedNumber: 14,
    options: ['$1$', '$2$', '$3$', '$4$'],
    subject: 'chemistry',
    chapter: 'General',
  },
])
const reviewText = reviewMsgs.join(' ')
assert.match(reviewText, /Go to Q 2\b/)
assert.match(reviewText, /TeX is still showing/)
assert.doesNotMatch(reviewText, /Go to Q 1\b/, 'the clean card is not flagged')
const cutOnly = officialPyqContentReviewMessages([
  { text: 'The ratio is \\frac{1}{', options: ['$1$', '$2$'], subject: 'physics', chapter: 'General' },
])
assert.match(cutOnly.join(' '), /Go to Q 1\b/)
assert.match(cutOnly.join(' '), /did not draw/)
const cutSpan = findReviewFlagSpans('The ratio is \\frac{1}{')
assert.ok(cutSpan.some((span) => span.kind === 'cut-off-fraction'))
const tableStem =
  'Readings are given below: \\begin{tabular}[t]{|l|l|} \\hline Wire-1 & 0.5 & 42 \\\\ \\hline \\end{tabular}$$ The value is 2.'
assert.equal(
  reviewMarkSpans(tableStem).length,
  0,
  'a table that draws is not highlighted as raw source',
)
const tableMsgs = officialPyqContentReviewMessages([
  { text: 'Fine $x=1$.', options: ['$1$'], subject: 'physics', chapter: 'General' },
  { text: tableStem, printedNumber: 10, options: [], subject: 'physics', chapter: 'General' },
])
assert.equal(tableMsgs.length, 0, 'a spare dollar after a drawn table does not block approve')

console.log('test-official-pyq-approval: ok')
