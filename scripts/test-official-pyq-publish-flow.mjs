/**
 * Official PYQ: Reviewed — Approve, then (optional) fill, then Publish.
 *   Upload → Pending. No AI fill.
 *   Approve → Approved. Students see nothing, no final question ids.
 *   Fill (hand or Hybrid AI) works on Approved only and never replaces a printed answer.
 *   Publish → Published. Final ids (kept when a question already had one), student PYQ + bank.
 *   Unpublish → Approved. Send back → Pending.
 *   One-time move: papers published before the split become Approved, keep their ids for later.
 */
import assert from 'node:assert/strict'

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
// questionBank only reads localStorage when `window` exists
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis

const {
  addOfficialPyqPendingPaper,
  clearOfficialPyqPendingPapers,
  countOfficialPyqPendingByStatus,
  getOfficialPyqPendingPaper,
  updateOfficialPyqPendingPaper,
} = await import('../src/utils/officialPyqPendingStore.js')
const {
  approveOfficialPyqPaper,
  importQuestionsToOfficialPyqPending,
  publishOfficialPyqPaper,
  unapproveOfficialPyqPaper,
  unpublishOfficialPyqPaper,
} = await import('../src/utils/officialPyqApproval.js')
const {
  OFFICIAL_PYQ_PUBLISH_SPLIT_KEY,
  isOfficialPyqFinalQuestionId,
  migrateOfficialPyqPublishedToApproved,
  officialPyqPublishGaps,
  runOfficialPyqPublishSplitMigrationOnce,
} = await import('../src/utils/officialPyqPublishFlow.js')
const { HYBRID_FILL_NEEDS_APPROVAL, fillOfficialPyqApprovedPaperPartByPart } = await import(
  '../src/utils/officialPyqPendingFill.js'
)
const { applyOfficialPyqPublishedMeta } = await import('../src/utils/officialPyqPublishedMeta.js')
const { clearImportedPyqs, loadImportedPyqs, saveImportedPyqs } = await import('../src/utils/pyqStore.js')
const { clearQuestionBank, loadQuestionBank, saveQuestionBank } = await import('../src/utils/questionBank.js')
const { officialYearPaperQuestions } = await import('../src/utils/pyqTests.js')

const GOOD_SOLUTION = 'Use $\\det(kA)=k^3\\det A$.\n$\\det(2A)=8\\times 2=16$.\nAnswer: (B)'

let passed = 0
async function test(name, fn) {
  await fn()
  passed += 1
  console.log(`ok - ${name}`)
}

function login(role) {
  sessionStorage.setItem('testvantage-session', JSON.stringify({ role, email: `${role}@test`, name: role, loggedInAt: 1 }))
}

function withFacts(id) {
  updateOfficialPyqPendingPaper(id, { adminFacts: { confirmedAt: Date.now(), confirmedBy: 'test' } })
  return id
}

function rowsOf(paperId) {
  return {
    pyq: loadImportedPyqs().filter((q) => q.paperId === paperId),
    bank: (loadQuestionBank().questions ?? []).filter((q) => q.paperId === paperId),
  }
}

function resetAll() {
  clearOfficialPyqPendingPapers()
  clearImportedPyqs()
  clearQuestionBank()
  localStorage.removeItem(OFFICIAL_PYQ_PUBLISH_SPLIT_KEY)
}

function mainPaper(day, extra = {}) {
  return {
    exam: 'jee-main',
    year: 2024,
    session: 'January Session · Shift 1',
    pyqDate: `2024-01-${day}`,
    pyqShift: 1,
    paperLabel: `JEE Main 2024 · 2024-01-${day} Shift 1 (flow fixture)`,
    paperId: `jee-main-2024-01-${day}-s1-flow`,
    sourceLabel: 'Official NTA (test fixture)',
    questions: [
      {
        text: 'Flow fixture: acceleration of a $2\\,\\mathrm{kg}$ block under $10\\,\\mathrm{N}$ is',
        options: ['$2$', '$5$', '$10$', '$20$'],
        correctIndex: 1,
        answerSource: 'from_paper',
        subject: 'physics',
        chapter: 'Laws of Motion',
        pyqSlot: 1,
      },
      {
        text: 'Flow fixture: the determinant of $2A$ when $\\det A = 2$ for a $3\\times 3$ matrix is',
        options: ['$4$', '$16$', '$8$', '$2$'],
        subject: 'mathematics',
        pyqSlot: 2,
      },
    ],
    ...extra,
  }
}

resetAll()

await test('upload stops at Pending: no AI answers or solutions, printed answer stays', () => {
  const paper = importQuestionsToOfficialPyqPending(mainPaper('24'))
  assert.equal(paper.status, 'pending_review')
  assert.equal(paper.questions[0].answerSource, 'from_paper')
  assert.equal(paper.questions[0].correctIndex, 1)
  assert.equal(paper.questions[1].solution, undefined)
  assert.notEqual(paper.questions[1].answerSource, 'hybrid_ai')
  assert.equal(loadImportedPyqs().length, 0)
})

await test('Reviewed — Approve: Approved, nothing for students, no final ids yet', () => {
  login('admin')
  const paper = importQuestionsToOfficialPyqPending(mainPaper('25'))
  const idsBefore = getOfficialPyqPendingPaper(paper.id).questions.map((q) => q.id)
  const result = approveOfficialPyqPaper(withFacts(paper.id))
  assert.equal(result.ok, true, result.errors?.join(' '))
  const approved = getOfficialPyqPendingPaper(paper.id)
  assert.equal(approved.status, 'approved')
  assert.equal(approved.publishedAt, undefined)
  assert.ok(approved.questions.every((q) => !isOfficialPyqFinalQuestionId(q.id)), 'approve must not make final ids')
  assert.equal(approved.questions.length, idsBefore.length)
  assert.deepEqual(rowsOf(paper.paperId), { pyq: [], bank: [] })
  assert.equal(countOfficialPyqPendingByStatus().approved >= 1, true)
  assert.equal(countOfficialPyqPendingByStatus().published, 0)
})

await test('send back for review: Approved → Pending, then approve again', () => {
  const paper = importQuestionsToOfficialPyqPending(mainPaper('26'))
  approveOfficialPyqPaper(withFacts(paper.id))
  const back = unapproveOfficialPyqPaper(paper.id)
  assert.equal(back.ok, true, back.error)
  assert.equal(getOfficialPyqPendingPaper(paper.id).status, 'pending_review')
  assert.equal(getOfficialPyqPendingPaper(paper.id).returnedFromPublished, true)
  const again = approveOfficialPyqPaper(withFacts(paper.id))
  assert.equal(again.ok, true, again.errors?.join(' '))
  assert.equal(getOfficialPyqPendingPaper(paper.id).status, 'approved')
})

await test('Hybrid AI fill runs on Approved only; printed answers stay; paper stays Approved', async () => {
  login('admin')
  const paper = importQuestionsToOfficialPyqPending(mainPaper('27'))
  const realFetch = globalThis.fetch
  const sent = []
  globalThis.fetch = async (_url, init) => {
    sent.push(JSON.parse(init.body).question_text)
    return new Response(
      JSON.stringify({ ok: true, chapter: 'Matrices & Determinants', correct_answer: 'B', step_by_step_solution: GOOD_SOLUTION }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }
  try {
    await assert.rejects(fillOfficialPyqApprovedPaperPartByPart(paper.id), (err) => err.message === HYBRID_FILL_NEEDS_APPROVAL)
    assert.equal(sent.length, 0, 'no Hybrid AI call on a pending paper')
    approveOfficialPyqPaper(withFacts(paper.id))
    const run = await fillOfficialPyqApprovedPaperPartByPart(paper.id, { redoAll: true })
    assert.equal(run.filled, 2)
  } finally {
    globalThis.fetch = realFetch
  }
  const filled = getOfficialPyqPendingPaper(paper.id)
  assert.equal(filled.status, 'approved')
  assert.equal(filled.questions[0].correctIndex, 1, 'the printed answer is never replaced')
  assert.equal(filled.questions[0].answerSource, 'from_paper')
  assert.equal(filled.questions[1].correctIndex, 1)
  assert.equal(filled.questions[1].answerSource, 'hybrid_ai')
  assert.equal(filled.questions[1].solutionSource, 'hybrid_ai')
  assert.ok(filled.questions.every((q) => !isOfficialPyqFinalQuestionId(q.id)), 'fill must not make final ids')
  assert.deepEqual(rowsOf(paper.paperId), { pyq: [], bank: [] })
  const gaps = officialPyqPublishGaps(filled)
  assert.equal(gaps.total, 2)
  assert.equal(gaps.noAnswer, 0)
})

await test('Publish: final ids, student PYQ + bank; Unpublish → Approved keeps ids; Publish again reuses them', () => {
  login('admin')
  const paper = importQuestionsToOfficialPyqPending(mainPaper('28'))
  approveOfficialPyqPaper(withFacts(paper.id))
  const pub = publishOfficialPyqPaper(paper.id)
  assert.equal(pub.ok, true, pub.errors?.join(' '))
  const published = getOfficialPyqPendingPaper(paper.id)
  assert.equal(published.status, 'published')
  assert.ok(published.publishedAt > 0)
  const ids = published.questions.map((q) => q.id)
  assert.ok(ids.every((id) => /^[A-Z]{3}\d{5}J2024$/.test(id)), `final ids: ${ids.join(', ')}`)
  assert.equal(new Set(ids).size, ids.length)
  const live = rowsOf(paper.paperId)
  assert.deepEqual(live.pyq.map((q) => q.id).sort(), [...ids].sort())
  assert.deepEqual(live.bank.map((q) => q.id).sort(), [...ids].sort(), 'bank rows carry the same final ids')
  assert.ok(live.bank.every((q) => q.bankStatus === 'published'))
  assert.equal(officialYearPaperQuestions(loadImportedPyqs(), { examPatternId: 'jee-main', year: 2024, paperId: paper.paperId }).length, 2)

  const fillLocked = applyOfficialPyqPublishedMeta(paper.id, 0, {
    questionId: ids[0],
    expectText: published.questions[0].text,
    subject: 'physics',
    section: 'Mechanics',
    chapter: 'Work',
  })
  assert.equal(fillLocked.ok, false, 'a published paper takes no tag edits')
  assert.match(String(fillLocked.error), /Unpublish/)

  const un = unpublishOfficialPyqPaper(paper.id)
  assert.equal(un.ok, true, un.error)
  assert.equal(getOfficialPyqPendingPaper(paper.id).status, 'approved')
  assert.deepEqual(rowsOf(paper.paperId), { pyq: [], bank: [] })
  assert.deepEqual(getOfficialPyqPendingPaper(paper.id).questions.map((q) => q.id), ids)
  assert.equal(unapproveOfficialPyqPaper(paper.id).ok, true)
  assert.equal(approveOfficialPyqPaper(withFacts(paper.id)).ok, true)
  const again = publishOfficialPyqPaper(paper.id)
  assert.equal(again.ok, true, again.errors?.join(' '))
  assert.deepEqual(again.questionIds, ids, 'publishing again keeps every final id')
  assert.equal(rowsOf(paper.paperId).pyq.length, 2, 'one copy only')
  const sendBackWhilePublished = unapproveOfficialPyqPaper(paper.id)
  assert.equal(sendBackWhilePublished.ok, false)
  assert.match(String(sendBackWhilePublished.error), /Unpublish first/)
})

await test('Unpublish remembers final ids, so a re-parse in Pending still gets them back on Publish', () => {
  login('admin')
  const paper = importQuestionsToOfficialPyqPending(mainPaper('31'))
  approveOfficialPyqPaper(withFacts(paper.id))
  const ids = publishOfficialPyqPaper(paper.id).questionIds
  assert.equal(unpublishOfficialPyqPaper(paper.id).ok, true)
  const kept = getOfficialPyqPendingPaper(paper.id).keptPublishedIds
  assert.deepEqual(Object.values(kept).map((v) => v.id), ids)
  const reparsed = getOfficialPyqPendingPaper(paper.id).questions.map((q, i) => ({ ...q, id: `pyq-imp-reparse-${i}` }))
  assert.equal(unapproveOfficialPyqPaper(paper.id, { questions: reparsed }).ok, true)
  assert.ok(getOfficialPyqPendingPaper(paper.id).questions.every((q) => !isOfficialPyqFinalQuestionId(q.id)))
  const other = importQuestionsToOfficialPyqPending(mainPaper('30'))
  approveOfficialPyqPaper(withFacts(other.id))
  const otherIds = publishOfficialPyqPaper(other.id).questionIds
  assert.ok(otherIds.every((id) => !ids.includes(id)), 'another paper may not take a remembered id')
  assert.equal(approveOfficialPyqPaper(withFacts(paper.id)).ok, true)
  const again = publishOfficialPyqPaper(paper.id)
  assert.equal(again.ok, true, again.errors?.join(' '))
  assert.deepEqual(again.questionIds, ids, 'every final id comes back after a re-parse')
})

await test('a new final id never takes an id another question already has', () => {
  login('admin')
  const first = rowsOf('jee-main-2024-01-28-s1-flow').pyq.map((q) => q.id)
  assert.equal(first.length, 2)
  const paper = importQuestionsToOfficialPyqPending(mainPaper('29'))
  approveOfficialPyqPaper(withFacts(paper.id))
  const approved = getOfficialPyqPendingPaper(paper.id)
  // A card carrying another paper's live id must not keep it.
  updateOfficialPyqPendingPaper(paper.id, {
    questions: approved.questions.map((q, i) => (i === 0 ? { ...q, id: first[0] } : q)),
    allowPublishedQuestionWrite: true,
  })
  const pub = publishOfficialPyqPaper(paper.id)
  assert.equal(pub.ok, true, pub.errors?.join(' '))
  assert.equal(pub.questionIds.includes(first[0]), false)
  assert.equal(pub.questionIds.includes(first[1]), false)
  const everyId = loadImportedPyqs().map((q) => q.id)
  assert.equal(new Set(everyId).size, everyId.length, 'no two student PYQ rows share an id')
})

await test('one-time move: published papers become Approved, keep content, remember their ids', () => {
  resetAll()
  login('admin')
  const cards = [
    { id: 'pyq-imp-1', text: 'Moved paper: a ball is thrown up with speed $u$; the maximum height is', options: ['a', 'b', 'c', 'd'], correctIndex: 2, answerSource: 'from_paper', subject: 'physics', chapter: 'Kinematics', pyqSlot: 1 },
    { id: 'pyq-imp-2', text: 'Moved paper: the number of real roots of $x^2+1=0$ is', options: ['0', '1', '2', '3'], correctIndex: 0, answerSource: 'from_paper', subject: 'mathematics', chapter: 'Quadratic Equations', pyqSlot: 2 },
    { id: 'pyq-imp-3', text: 'Moved paper: the oxidation state of Mn in $\\mathrm{KMnO_4}$ is', options: ['+5', '+6', '+7', '+4'], subject: 'chemistry', chapter: 'Redox Reactions', pyqSlot: 3 },
  ]
  const paper = addOfficialPyqPendingPaper({
    exam: 'jee-main',
    year: 2023,
    session: 'January Session · Shift 2',
    pyqDate: '2023-01-30',
    pyqShift: 2,
    paperLabel: 'JEE Main 2023 · moved fixture',
    paperId: 'jee-main-2023-01-30-s2-moved',
    sourceLabel: 'test',
    status: 'approved',
    questions: cards,
  })
  const row = (id, slot, text) => ({
    id,
    text,
    options: ['a', 'b', 'c', 'd'],
    officialPyq: true,
    imported: true,
    examPatternId: 'jee-main',
    pyqYear: 2023,
    paperId: paper.paperId,
    pyqSlot: slot,
  })
  // Older publishes gave PKK00001J2023 to two questions; the bank kept slot 1.
  saveImportedPyqs([
    row('PKK00001J2023', 1, cards[0].text),
    row('MQQ00001J2023', 2, cards[1].text),
    row('PKK00001J2023', 3, cards[2].text),
    { id: 'user-import-1', text: 'A question the admin imported by hand', officialPyq: false, pyqYear: 2019 },
  ])
  saveQuestionBank({
    settings: {},
    questions: [
      { ...row('PKK00001J2023', 1, cards[0].text), bankSource: 'official_pyq', bankStatus: 'published' },
      { id: 'uq-own-1', text: 'An unrelated bank question', bankStatus: 'published', subject: 'physics' },
    ],
  })
  const before = JSON.stringify(getOfficialPyqPendingPaper(paper.id).questions)

  const moved = runOfficialPyqPublishSplitMigrationOnce()
  assert.equal(moved.papers, 1)
  assert.equal(moved.pyqRemoved, 3)
  assert.equal(moved.bankRemoved, 1)
  assert.equal(moved.keptIds, 2)
  assert.equal(localStorage.getItem(OFFICIAL_PYQ_PUBLISH_SPLIT_KEY), '1')
  const after = getOfficialPyqPendingPaper(paper.id)
  assert.equal(after.status, 'approved')
  assert.equal(JSON.stringify(after.questions), before, 'question cards are not changed by the move')
  assert.deepEqual(
    Object.fromEntries(Object.entries(after.keptPublishedIds).map(([slot, v]) => [slot, v.id])),
    { 1: 'PKK00001J2023', 2: 'MQQ00001J2023' },
  )
  assert.deepEqual(loadImportedPyqs().map((q) => q.id), ['user-import-1'], 'other student rows stay')
  assert.deepEqual((loadQuestionBank().questions ?? []).map((q) => q.id), ['uq-own-1'], 'other bank rows stay')
  assert.equal(countOfficialPyqPendingByStatus().published, 0)
  assert.equal(officialYearPaperQuestions(loadImportedPyqs(), { examPatternId: 'jee-main', year: 2023, paperId: paper.paperId }).length, 0)

  assert.equal(runOfficialPyqPublishSplitMigrationOnce().skipped, true, 'runs once')
  const second = migrateOfficialPyqPublishedToApproved()
  assert.equal(second.pyqRemoved + second.bankRemoved, 0, 'running it again changes nothing')
  assert.equal(JSON.stringify(getOfficialPyqPendingPaper(paper.id).questions), before)
  assert.deepEqual(getOfficialPyqPendingPaper(paper.id).keptPublishedIds, after.keptPublishedIds)

  const pub = publishOfficialPyqPaper(paper.id)
  assert.equal(pub.ok, true, pub.errors?.join(' '))
  assert.equal(pub.questionIds[0], 'PKK00001J2023', 'slot 1 gets its old id back')
  assert.equal(pub.questionIds[1], 'MQQ00001J2023', 'slot 2 gets its old id back')
  assert.match(pub.questionIds[2], /^[A-Z]{3}\d{5}J2023$/)
  assert.ok(!['PKK00001J2023', 'MQQ00001J2023'].includes(pub.questionIds[2]), 'the old duplicate gets a new id')
  const live = getOfficialPyqPendingPaper(paper.id)
  assert.equal(live.questions[0].correctIndex, 2)
  assert.equal(live.questions[0].answerSource, 'from_paper')
  assert.equal(live.questions[2].text, cards[2].text)
})

await test('student views work with zero published papers', () => {
  resetAll()
  assert.deepEqual(officialYearPaperQuestions(loadImportedPyqs(), { examPatternId: 'jee-advanced', year: 2017, paperId: 'jee-advanced-2017-paper-1' }), [])
  assert.equal(migrateOfficialPyqPublishedToApproved().papers, 0)
})

sessionStorage.removeItem('testvantage-session')
console.log(`test-official-pyq-publish-flow: ok (${passed} checks)`)
