import assert from 'node:assert/strict'
import {
  addOfficialPyqPendingPaper,
  clearOfficialPyqPendingPapers,
  getOfficialPyqPendingPaper,
  updateOfficialPyqPendingPaper,
  officialPyqQuestionsArePublishedLocked,
} from '../src/utils/officialPyqPendingStore.js'
import {
  healAndPersistOfficialPyqPaper,
  reExtractOfficialPyqPendingPaperLocal,
} from '../src/utils/officialPyqLocalReparse.js'
import { reExtractOfficialPyqPendingPaper } from '../src/utils/officialPyqApproval.js'

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

clearOfficialPyqPendingPapers()

const ocr = [
  '\\item[Q.] 1 A thin stiff insulated metal wire is bent into a circular loop.',
  'When a current $I$ is passed, the angle $\\theta$ is given by',
  '(A) $\\tan \\theta=1$',
  '(B) $\\tan \\theta=2$',
  '(C) $\\tan \\theta=3$',
  '(D) $\\tan \\theta=4$',
  '\\item[Q.] 2 Let $x=1$. The value is ____.',
].join('\n')

const originalQs = [
  {
    text: 'A thin stiff insulated metal wire is bent into a circular loop. When a current $I$ is passed, the angle $\\theta$ is given by',
    options: ['$\\tan \\theta=1$', '$\\tan \\theta=2$', '$\\tan \\theta=3$', '$\\tan \\theta=4$'],
    printedNumber: 1,
    questionNumber: 1,
    pyqSlot: 1,
    questionType: 'single_correct',
    subject: 'physics',
  },
  {
    text: 'Let $x=1$. The value is ____.',
    options: ['', '', '', ''],
    printedNumber: 2,
    questionNumber: 2,
    pyqSlot: 2,
    questionType: 'integer',
    subject: 'maths',
  },
]

const paper = addOfficialPyqPendingPaper({
  exam: 'jee-advanced',
  year: 2024,
  session: 'Paper 1',
  paperLabel: 'Published lock fixture',
  sourceLabel: 'test',
  status: 'published',
  preparedText: ocr,
  questions: originalQs,
})

assert.equal(officialPyqQuestionsArePublishedLocked(paper), true)

const before = JSON.stringify(getOfficialPyqPendingPaper(paper.id).questions)

const heal = healAndPersistOfficialPyqPaper(getOfficialPyqPendingPaper(paper.id))
assert.equal(heal.ok, false, 'heal must refuse published papers')
assert.match(String(heal.error || ''), /Unpublish/i)
assert.equal(JSON.stringify(getOfficialPyqPendingPaper(paper.id).questions), before)

const local = reExtractOfficialPyqPendingPaperLocal(getOfficialPyqPendingPaper(paper.id))
assert.equal(local.ok, false, 'local reparse must refuse published papers')
assert.match(String(local.error || ''), /Unpublish/i)
assert.equal(JSON.stringify(getOfficialPyqPendingPaper(paper.id).questions), before)

const geminiPath = reExtractOfficialPyqPendingPaper(getOfficialPyqPendingPaper(paper.id))
assert.equal(geminiPath.ok, false, 'extract reparse must refuse published papers')
assert.match(String(geminiPath.error || ''), /Unpublish/i)
assert.equal(JSON.stringify(getOfficialPyqPendingPaper(paper.id).questions), before)

const sneaky = updateOfficialPyqPendingPaper(paper.id, {
  questions: [{ text: 'MUTATED', options: ['a', 'b', 'c', 'd'], pyqSlot: 1 }],
})
assert.ok(sneaky)
assert.equal(JSON.stringify(sneaky.questions), before, 'store must ignore question writes while published')
assert.notEqual(String(sneaky.questions[0]?.text || ''), 'MUTATED')

const tagWhilePublished = updateOfficialPyqPendingPaper(paper.id, {
  questions: [{ ...originalQs[0], chapter: 'Magnetism' }, originalQs[1]],
  allowPublishedQuestionWrite: true,
})
assert.equal(JSON.stringify(tagWhilePublished.questions), before, 'a published paper takes no tag writes either')

// Approved: wording stays locked, but the tag / answer / solution path may write.
const approvedPaper = updateOfficialPyqPendingPaper(paper.id, { status: 'approved' })
assert.equal(approvedPaper.status, 'approved')
assert.equal(officialPyqQuestionsArePublishedLocked(approvedPaper), true)
assert.equal(JSON.stringify(approvedPaper.questions), before)
const healApproved = healAndPersistOfficialPyqPaper(getOfficialPyqPendingPaper(paper.id))
assert.equal(healApproved.ok, false, 'heal must refuse approved papers')
assert.match(String(healApproved.error || ''), /send it back for review/i)
const sneakyApproved = updateOfficialPyqPendingPaper(paper.id, {
  questions: [{ text: 'MUTATED', options: ['a', 'b', 'c', 'd'], pyqSlot: 1 }],
})
assert.equal(JSON.stringify(sneakyApproved.questions), before, 'store must ignore plain question writes while approved')
const tagged = updateOfficialPyqPendingPaper(paper.id, {
  questions: [{ ...originalQs[0], chapter: 'Magnetism' }, originalQs[1]],
  allowPublishedQuestionWrite: true,
})
assert.equal(tagged.status, 'approved')
assert.equal(tagged.questions[0].chapter, 'Magnetism')
assert.equal(tagged.questions[0].text, originalQs[0].text)

const unlocked = updateOfficialPyqPendingPaper(paper.id, {
  status: 'pending_review',
  questions: [
    { ...originalQs[0], text: 'After unpublish, reparse may rewrite this stem.' },
    originalQs[1],
  ],
})
assert.equal(unlocked.status, 'pending_review')
assert.match(String(unlocked.questions[0].text), /After unpublish/)

const healPending = healAndPersistOfficialPyqPaper(getOfficialPyqPendingPaper(paper.id))
assert.equal(healPending.ok, true, 'pending papers may heal')

console.log('test-official-pyq-published-lock: ok')
