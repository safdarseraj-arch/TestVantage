/**
 * Published papers stay published.
 * Snapshot reload must not put them back in Pending.
 * Re-parse skips a published paper.
 * A student year pick uses that paper, not a bank mix.
 */
import assert from 'node:assert/strict'
import {
  mergeOfficialPyqSnapshotIntoPapers,
  officialPyqSnapshotApplyKey,
} from '../src/utils/applyOfficialPyqPublicSnapshot.js'
import {
  addOfficialPyqPendingPaper,
  clearOfficialPyqPendingPapers,
  getOfficialPyqPendingPaper,
  updateOfficialPyqPendingPaper,
} from '../src/utils/officialPyqPendingStore.js'
import {
  healAndPersistOfficialPyqPaper,
  officialPyqNeedsAutoResplit,
  reExtractOfficialPyqPendingPaperLocal,
} from '../src/utils/officialPyqLocalReparse.js'
import { unpublishOfficialPyqPaper } from '../src/utils/officialPyqApproval.js'
import { officialYearPaperQuestions } from '../src/utils/pyqTests.js'
import { healExamQuestionsForStudent } from '../src/utils/examQuestionHeal.js'

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
  globalThis.sessionStorage = globalThis.localStorage
}

const lockedStem = 'List-I (P) locked published row AgNO3'
const published = {
  id: 'opyq-published-stay',
  exam: 'jee-advanced',
  year: 2026,
  session: 'Paper 1',
  paperLabel: 'JEE Advanced 2026 Paper 1',
  paperId: 'jee-advanced-2026-paper-1',
  status: 'approved',
  questions: [
    {
      text: lockedStem,
      options: ['(A) P-1', '(B) P-2', '(C) P-3', '(D) P-4'],
      pyqSlot: 48,
      questionType: 'matrix_match',
    },
  ],
}
const snapshotCopy = {
  ...published,
  status: 'pending_review',
  questions: [
    {
      text: 'DISTURBED List-I rows from a later reparse',
      options: ['(A) scrambled'],
      pyqSlot: 48,
      questionType: 'single_correct',
    },
  ],
}

const merged = mergeOfficialPyqSnapshotIntoPapers([published], [snapshotCopy])
assert.equal(merged.skippedPublished, 1)
assert.equal(merged.papers.length, 1)
assert.equal(merged.papers[0].status, 'approved')
assert.equal(merged.papers[0].questions[0].text, lockedStem)
assert.equal(merged.papers.filter((p) => p.status === 'pending_review').length, 0)

clearOfficialPyqPendingPapers()
const paper = addOfficialPyqPendingPaper({
  exam: 'jee-advanced',
  year: 2026,
  session: 'Paper 1',
  paperLabel: 'JEE Advanced 2026 Paper 1',
  paperId: 'jee-advanced-2026-paper-1',
  sourceLabel: 'test',
  status: 'approved',
  preparedText: '\\item[Q.] 48 Match List-I with List-II.\n(A) one\n(B) two\n(C) three\n(D) four',
  questions: [
    {
      text: lockedStem,
      options: ['(A) P-1', '(B) P-2', '(C) P-3', '(D) P-4'],
      pyqSlot: 48,
      questionType: 'matrix_match',
      subject: 'chemistry',
    },
  ],
})

const before = getOfficialPyqPendingPaper(paper.id).questions[0].text
const reparse = reExtractOfficialPyqPendingPaperLocal(getOfficialPyqPendingPaper(paper.id))
assert.equal(reparse.ok, false)
assert.equal(getOfficialPyqPendingPaper(paper.id).questions[0].text, before)
assert.equal(getOfficialPyqPendingPaper(paper.id).status, 'approved')

globalThis.window = globalThis
sessionStorage.setItem(
  'testvantage-session',
  JSON.stringify({ role: 'user', email: 'student@test', name: 'Student', loggedInAt: 1 }),
)
const denied = unpublishOfficialPyqPaper(paper.id)
assert.equal(denied.ok, false)
assert.match(String(denied.error), /admin/i)
assert.equal(getOfficialPyqPendingPaper(paper.id).status, 'approved')
assert.equal(getOfficialPyqPendingPaper(paper.id).questions[0].text, before)

sessionStorage.setItem(
  'testvantage-session',
  JSON.stringify({ role: 'admin', email: 'admin@test', name: 'Admin', loggedInAt: 1 }),
)
const sent = unpublishOfficialPyqPaper(paper.id)
assert.equal(sent.ok, true)
assert.equal(sent.paper.status, 'pending_review')
assert.equal(sent.paper.returnedFromPublished, true)
assert.equal(sent.paper.questions[0].text, before)
assert.equal(sent.paper.questions[0].options.length, 4)

const heal = healAndPersistOfficialPyqPaper(getOfficialPyqPendingPaper(paper.id))
assert.equal(heal.changed, false)
assert.equal(getOfficialPyqPendingPaper(paper.id).questions[0].text, before)
assert.equal(officialPyqNeedsAutoResplit(getOfficialPyqPendingPaper(paper.id)), false)

const pool = [
  {
    id: 'other-year',
    text: 'A random bank question from another paper',
    officialPyq: true,
    imported: true,
    examPatternId: 'jee-advanced',
    pyqYear: 2024,
    paperId: 'jee-advanced-2024-paper-2',
    pyqSlot: 1,
    questionType: 'single_correct',
    options: ['A', 'B', 'C', 'D'],
  },
  {
    id: 'sample',
    text: '[JEE Adv 2026] sample practice item',
    officialPyq: false,
    isDemo: true,
    bankSource: 'sample_practice',
    examPatternId: 'jee-advanced',
    pyqYear: 2026,
    paperId: 'jee-advanced-2026-paper-1',
    pyqSlot: 1,
    questionType: 'single_correct',
    options: ['A', 'B', 'C', 'D'],
  },
  {
    id: 'q2',
    text: 'Published question two',
    officialPyq: true,
    imported: true,
    examPatternId: 'jee-advanced',
    pyqYear: '2026',
    paperId: 'jee-advanced-2026-paper-1',
    pyqSlot: 2,
    questionType: 'integer',
    options: [],
  },
  {
    id: 'q1',
    text: 'Published question one List-I (P)',
    officialPyq: true,
    imported: true,
    examPatternId: 'jee-advanced',
    pyqYear: 2026,
    paperId: 'jee-advanced-2026-paper-1',
    pyqSlot: 1,
    questionType: 'matrix_match',
    options: ['(A)', '(B)', '(C)', '(D)'],
  },
]
const picked = officialYearPaperQuestions(pool, {
  examPatternId: 'jee-advanced',
  year: 2026,
  paperId: 'jee-advanced-2026-paper-1',
})
assert.deepEqual(
  picked.map((q) => q.id),
  ['q1', 'q2'],
)
assert.equal(picked[0].questionType, 'matrix_match')

const studentHeal = healExamQuestionsForStudent(
  [
    {
      id: 'official-stem',
      text: 'Published match list must stay',
      questionType: 'matrix_match',
      subject: 'chemistry',
      options: [],
    },
  ],
  { pyqMode: 'year', pyqOfficialPaper: true, examPatternId: 'jee-advanced' },
  [
    {
      id: 'bank-other',
      text: 'Unrelated published bank question',
      questionType: 'single_correct',
      subject: 'chemistry',
      options: ['A', 'B', 'C', 'D'],
      correctIndex: 0,
    },
  ],
)
assert.equal(studentHeal.questions.length, 1)
assert.equal(studentHeal.questions[0].text, 'Published match list must stay')
assert.equal(studentHeal.swapped.length, 0)

updateOfficialPyqPendingPaper(paper.id, { status: 'approved', returnedFromPublished: false })
assert.equal(getOfficialPyqPendingPaper(paper.id).status, 'approved')

const reactionKey = officialPyqSnapshotApplyKey({
  restoredAt: 'same',
  root: {
    papers: [
      {
        paperId: 'jee-advanced-2026-paper-2',
        questions: [
          {
            printedNumber: 14,
            text: 'In the following reaction sequence, major products X and Y are acyclic monomers.\n1. KCN\n2. H3O+',
            options: ['', '', '', ''],
          },
        ],
      },
    ],
  },
})
const peeledKey = officialPyqSnapshotApplyKey({
  restoredAt: 'same',
  root: {
    papers: [
      {
        paperId: 'jee-advanced-2026-paper-2',
        questions: [
          {
            printedNumber: 14,
            text: 'In the following reaction sequence, major products X and Y are acyclic monomers.',
            options: ['KCN', 'H3O+', 'Red P', ''],
          },
        ],
      },
    ],
  },
})
assert.notEqual(reactionKey, peeledKey, 'a corrected reaction sequence reloads into the review page')

console.log('test-official-pyq-published-stay: ok')
