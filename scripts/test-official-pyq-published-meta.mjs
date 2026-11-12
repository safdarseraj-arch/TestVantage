/**
 * Tag, answer, and solution edits on an Approved Official PYQ paper stay Approved
 * and never change the question id (Publish gives the final id). Published papers refuse them.
 */
import assert from 'node:assert/strict'
import {
  addOfficialPyqPendingPaper,
  clearOfficialPyqPendingPapers,
  getOfficialPyqPendingPaper,
  updateOfficialPyqPendingPaper,
} from '../src/utils/officialPyqPendingStore.js'
import { applyOfficialPyqPublishedMeta } from '../src/utils/officialPyqPublishedMeta.js'

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

const stem = 'Find the value of the matrix determinant.'
const options = ['(A) 1', '(B) 2', '(C) 3', '(D) 4']

function login(role) {
  sessionStorage.setItem(
    'testvantage-session',
    JSON.stringify({ role, email: role + '@test', name: role, loggedInAt: 1 }),
  )
}

clearOfficialPyqPendingPapers()
const paper = addOfficialPyqPendingPaper({
  exam: 'jee-advanced',
  year: 2024,
  session: 'Paper 1',
  paperLabel: 'JEE Advanced 2024 Paper 1 meta',
  paperId: 'jee-advanced-2024-meta-test',
  sourceLabel: 'test',
  status: 'approved',
  questions: [
    {
      id: 'opyq-meta-temp',
      text: stem,
      options,
      pyqSlot: 1,
      solution: 'Gemini solution text',
      correctIndex: 1,
    },
    {
      id: 'MAM00007A2024',
      text: 'Already numbered question.',
      options: ['(A) a'],
      pyqSlot: 2,
      subject: 'mathematics',
      section: 'Algebra',
      chapter: 'Matrices & Determinants',
    },
  ],
})

login('user')
const denied = applyOfficialPyqPublishedMeta(paper.id, 0, {
  questionId: 'opyq-meta-temp',
  expectText: stem,
  subject: 'mathematics',
  section: 'Algebra',
  chapter: 'Matrices & Determinants',
})
assert.equal(denied.ok, false)
assert.match(String(denied.error), /admin/i)
assert.equal(getOfficialPyqPendingPaper(paper.id).status, 'approved')
assert.equal(getOfficialPyqPendingPaper(paper.id).questions[0].id, 'opyq-meta-temp')

login('admin')
const partial = applyOfficialPyqPublishedMeta(paper.id, 0, {
  questionId: 'opyq-meta-temp',
  expectText: stem,
  subject: 'mathematics',
  section: 'Algebra',
  chapter: '',
  solution: '',
})
assert.equal(partial.ok, true)
assert.equal(partial.status, 'approved')
assert.equal(getOfficialPyqPendingPaper(paper.id).questions[0].id, 'opyq-meta-temp')
assert.equal(getOfficialPyqPendingPaper(paper.id).questions[0].text, stem)
assert.equal(getOfficialPyqPendingPaper(paper.id).questions[0].solution, undefined)

const saved = applyOfficialPyqPublishedMeta(paper.id, 0, {
  questionId: 'opyq-meta-temp',
  expectText: stem,
  subject: 'Mathematics',
  section: 'Algebra',
  chapter: 'Matrices & Determinants',
  topic: 'Determinants',
  questionType: 'single_correct',
  examIds: ['jee-advanced'],
  toughnessLevel: 6,
  source: 'Official PYQ',
  correctIndex: 2,
  correctIndices: [],
  correctInteger: '',
  correctNumerical: '',
  solution: 'Updated solution',
})
assert.equal(saved.ok, true)
assert.equal(saved.status, 'approved')
const row = getOfficialPyqPendingPaper(paper.id).questions[0]
assert.equal(row.id, 'opyq-meta-temp', 'saving tags does not make the final id')
assert.equal(row.subject, 'mathematics')
assert.equal(row.section, 'Algebra')
assert.equal(row.chapter, 'Matrices & Determinants')
assert.equal(row.topic, 'Determinants')
assert.equal(row.questionType, 'single_correct')
assert.deepEqual(row.examIds, ['jee-advanced'])
assert.equal(row.toughnessLevel, 6)
assert.equal(row.source, 'Official PYQ')
assert.equal(row.correctIndex, 2)
assert.equal(row.solution, 'Updated solution')
assert.equal(row.text, stem)
assert.deepEqual(row.options, options)
assert.equal(getOfficialPyqPendingPaper(paper.id).status, 'approved')

const again = applyOfficialPyqPublishedMeta(paper.id, 0, {
  questionId: row.id,
  expectText: stem,
  subject: 'mathematics',
  section: 'Calculus',
  chapter: 'Limits',
  topic: '',
  questionType: 'single_correct',
  examIds: ['jee-advanced'],
  toughnessLevel: 6,
  source: 'Official PYQ',
  correctIndex: 2,
  solution: 'Updated solution',
})
assert.equal(again.ok, true)
assert.equal(getOfficialPyqPendingPaper(paper.id).questions[0].id, row.id)
assert.equal(getOfficialPyqPendingPaper(paper.id).questions[0].section, 'Calculus')
assert.equal(getOfficialPyqPendingPaper(paper.id).questions[0].text, stem)
assert.equal(getOfficialPyqPendingPaper(paper.id).status, 'approved')

const kept = applyOfficialPyqPublishedMeta(paper.id, 1, {
  questionId: 'MAM00007A2024',
  expectText: 'Already numbered question.',
  subject: 'mathematics',
  section: 'Calculus',
  chapter: 'Limits',
  solution: '',
})
assert.equal(kept.ok, true)
assert.equal(getOfficialPyqPendingPaper(paper.id).questions[1].id, 'MAM00007A2024')
assert.equal(getOfficialPyqPendingPaper(paper.id).questions[1].text, 'Already numbered question.')

updateOfficialPyqPendingPaper(paper.id, { status: 'published' })
const locked = applyOfficialPyqPublishedMeta(paper.id, 0, {
  questionId: row.id,
  expectText: stem,
  subject: 'mathematics',
  section: 'Algebra',
  chapter: 'Sets',
})
assert.equal(locked.ok, false)
assert.match(String(locked.error), /Unpublish/)
assert.equal(getOfficialPyqPendingPaper(paper.id).questions[0].section, 'Calculus')

console.log('official pyq published meta ok', row.id)
