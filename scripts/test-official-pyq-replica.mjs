/**
 * Replica papers stay pending. Child ids reuse parent + C + number.
 * Hybrid solution text must be concise and complete, not a hint.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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

const {
  officialPyqReplicaChildId,
  collectPaperHybridFills,
  fillPaperQuestionByQuestion,
  publishedMetaPatchFromHybridFill,
  replicaQuestionIsDuplicate,
  replicaPaperName,
  replicaAlreadyStored,
} = await import('../src/utils/officialPyqReplica.js')
const { questionsForPyqPracticeTab } = await import('../src/utils/pyqDetect.js')
const {
  addOfficialPyqPendingPaper,
  addOfficialPyqReplicaPendingPaper,
  clearOfficialPyqPendingPapers,
  getOfficialPyqPendingPaper,
  officialPyqSittingKey,
  releaseUnprintedAnswerKeys,
} = await import('../src/utils/officialPyqPendingStore.js')

assert.equal(
  officialPyqReplicaChildId({ parentQuestionId: 'MAM00001I' }, []),
  'MAM00001IC1',
)
assert.equal(
  officialPyqReplicaChildId({ parentQuestionId: 'MAM00001A2024' }, []),
  'MAM00001A2024C1',
)
assert.equal(
  officialPyqReplicaChildId({ id: 'MAM00001IC1', parentQuestionId: 'MAM00001I' }, []),
  'MAM00001IC1',
)
assert.equal(
  officialPyqReplicaChildId({ parentQuestionId: 'MAM00001I' }, [{ id: 'MAM00001IC1' }]),
  'MAM00001IC2',
)
assert.equal(
  officialPyqReplicaChildId({ parentQuestionId: 'MAM00001I', replicaDifficultyOffset: -1 }, []),
  'MAM00001IC1',
)
assert.equal(
  officialPyqReplicaChildId({ parentQuestionId: 'MAM00001I', replicaDifficultyOffset: 0 }, []),
  'MAM00001IC2',
)
assert.equal(
  officialPyqReplicaChildId({ parentQuestionId: 'MAM00001I', replicaDifficultyOffset: 1 }, []),
  'MAM00001IC3',
)
assert.equal(
  officialPyqReplicaChildId({ parentQuestionId: 'MAM00001A2024', replicaDifficultyOffset: 2 }, []),
  'MAM00001A2024C4',
)
const sameDifficultyPeer = {
  id: 'MAM00001IC1',
  parentQuestionId: 'MAM00001I',
  replicaDifficultyOffset: -1,
}
assert.equal(
  officialPyqReplicaChildId(
    { parentQuestionId: 'MAM00001I', replicaDifficultyOffset: -1 },
    [sameDifficultyPeer],
  ),
  'MAM00001IC1',
)
assert.equal(
  officialPyqReplicaChildId(
    { parentQuestionId: 'MAM00001I', replicaDifficultyOffset: 0 },
    [sameDifficultyPeer],
  ),
  'MAM00001IC2',
)
assert.equal(
  replicaQuestionIsDuplicate('Find the determinant of this matrix.', [
    { text: 'Find the determinant of this matrix.' },
  ]),
  true,
)
assert.equal(
  replicaQuestionIsDuplicate('A boat crosses a 40 m river at 3 m/s while the current is 1 m/s.', [
    { text: 'Find the determinant of this matrix.' },
  ]),
  false,
)
const advanced2024 = {
  exam: 'jee-advanced',
  year: 2024,
  session: 'Paper 1',
  paperLabel: 'JEE Advanced 2024 Paper 1',
}
assert.equal(replicaPaperName(advanced2024, -1), 'JA2024P1SE1')
assert.equal(replicaPaperName(advanced2024, 0), 'JA2024P1SS')
assert.equal(replicaPaperName(advanced2024, 1), 'JA2024P1SH1')
assert.equal(replicaPaperName(advanced2024, 2), 'JA2024P1SH2')
assert.equal(
  replicaPaperName({ exam: 'jee-advanced', year: 2024, session: 'Paper 2' }, -1),
  'JA2024P2SE1',
)
assert.equal(
  replicaPaperName({ exam: 'jee-advanced', year: 2025, paperLabel: 'JEE Advanced 2025 Paper 1' }, 0),
  'JA2025P1SS',
)
assert.equal(
  replicaPaperName({ exam: 'jee-advanced', year: 2026, session: 'Paper 1' }, 2),
  'JA2026P1SH2',
)
assert.equal(
  replicaAlreadyStored(
    [
      {
        replicaParentPaperId: 'jee-advanced-2024-p1',
        replicaDifficultyOffset: -1,
        paperLabel: 'JA2024P1SE1',
        status: 'pending_review',
      },
    ],
    'jee-advanced-2024-p1',
    -1,
    'JA2024P1SE1',
  ),
  true,
)
assert.equal(
  replicaAlreadyStored(
    [
      {
        replicaParentPaperId: 'jee-advanced-2024-p1',
        replicaDifficultyOffset: -1,
        paperLabel: 'JA2024P1SE1',
        status: 'pending_review',
      },
    ],
    'jee-advanced-2024-p1',
    0,
    'JA2024P1SS',
  ),
  false,
)
const originalCard = {
  id: 'MAM00001A2024',
  text: 'Original stem.',
  officialPyq: true,
  imported: true,
  examPatternId: 'jee-advanced',
  pyqYear: 2024,
  paperLabel: 'JEE Advanced 2024 Paper 1',
  paperId: 'jee-advanced-2024-p1',
}
const replicaCard = {
  id: 'MAM00001A2024C1',
  text: 'A different stem about a 3 by 3 matrix.',
  aiReplicaPaper: true,
  similarToPyq: true,
  officialPyq: false,
  examPatternId: 'jee-advanced',
  pyqYear: 2024,
  paperLabel: 'JA2024P1SE1',
  paperId: 'JA2024P1SE1',
}
const pyqTab = questionsForPyqPracticeTab([originalCard, replicaCard], 'pyq')
const similarTab = questionsForPyqPracticeTab([originalCard, replicaCard], 'similar_pyq')
assert.deepEqual(pyqTab.map((row) => row.paperLabel), ['JEE Advanced 2024 Paper 1'])
assert.deepEqual(similarTab.map((row) => row.paperLabel), ['JA2024P1SE1'])

clearOfficialPyqPendingPapers()
const parent = addOfficialPyqPendingPaper({
  exam: 'jee-advanced',
  year: 2024,
  session: 'Paper 1',
  paperLabel: 'JEE Advanced 2024 Paper 1',
  paperId: 'jee-advanced-2024-replica-parent',
  sourceLabel: 'test',
  status: 'approved',
  questions: [
    {
      id: 'MAM00001A2024',
      text: 'Find the determinant.',
      options: ['1', '2', '3', '4'],
      pyqSlot: 1,
      subject: 'mathematics',
      section: 'Algebra',
      chapter: 'Matrices & Determinants',
    },
  ],
})
const replica = addOfficialPyqReplicaPendingPaper({
  exam: parent.exam,
  year: parent.year,
  session: parent.session,
  paperId: parent.paperId + '-similar-1',
  paperLabel: parent.paperLabel + ' Similar1',
  replicaParentPaperId: parent.paperId,
  replicaDifficultyOffset: 1,
  questions: [
    {
      text: 'Find the determinant of a different matrix.',
      options: ['5', '6', '7', '8'],
      parentQuestionId: 'MAM00001A2024',
      pyqSlot: 1,
      solution: 'Step 1. Expand along row 1. Answer: 6.',
    },
  ],
})
assert.equal(replica.status, 'pending_review')
assert.equal(getOfficialPyqPendingPaper(parent.id).status, 'approved')
assert.equal(getOfficialPyqPendingPaper(parent.id).questions[0].text, 'Find the determinant.')
assert.notEqual(officialPyqSittingKey(replica), officialPyqSittingKey(parent))
assert.equal(getOfficialPyqPendingPaper(replica.id).aiReplicaPaper, true)

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'ai_generator.py')
const source = fs.readFileSync(root, 'utf8')
const pieces = [
  'Write step_by_step_solution in plain exam-solution style.',
  'Be concise: short steps only. No story, no chatty lead-in, no hint wording, and no \'think about\'.',
  'Be complete: give the actual method and the final result, enough for a student to follow.',
  'Do not tease or stop early.',
]
for (const piece of pieces) assert.ok(source.includes(piece), piece)
assert.ok(source.includes('HYBRID_SOLUTION_INSTRUCTION'))
const cloneAt = source.indexOf('def _clone_prompt')
const fillAt = source.indexOf('def _published_fill_prompt')
assert.ok(cloneAt > 0 && fillAt > 0)
assert.ok(source.slice(cloneAt, cloneAt + 1100).includes('HYBRID_SOLUTION_INSTRUCTION'))
assert.ok(source.includes('def official_replica_prompt'))
assert.ok(source.includes('avoid_texts'))
assert.ok(source.includes('Do not paste the parent stem unchanged.'))
assert.ok(source.slice(fillAt, fillAt + 1200).includes('OFFICIAL_PYQ_SOLUTION_INSTRUCTION'))
assert.ok(source.slice(fillAt, fillAt + 1400).includes('If the stored solution is a hint, a story, or longer'))
assert.ok(source.includes("Last line: 'Answer: (X)'"))
assert.ok(source.includes('_PUBLISHED_FILL_TIMEOUT_MS'))
assert.ok(source.includes('Do not rewrite the question stem'))

const asked = []
const paperRows = await collectPaperHybridFills(
  [
    { id: 'MAM00001A2024', text: 'Find the determinant.', subject: 'mathematics', section: 'Algebra', solution: 'Think about the hint.' },
    { id: 'empty-slot', text: '' },
    { id: 'MAM00002A2024', text: 'Find the limit.', chapter: 'Calculus' },
  ],
  async (question) => {
    asked.push(question.id)
    return {
      subject: '',
      unit: 'Calculus',
      chapter: '',
      correct_answer: 'B',
      step_by_step_solution: 'Step 1. Expand. Answer: 2.',
    }
  },
)
assert.deepEqual(asked, ['MAM00001A2024', 'MAM00002A2024'])
assert.equal(paperRows.length, 3)
assert.equal(paperRows[1].skipped, true)
assert.equal(paperRows[0].patch.subject, 'mathematics')
assert.equal(paperRows[0].patch.section, 'Calculus')
assert.equal(paperRows[0].patch.solution, 'Step 1. Expand. Answer: 2.')
assert.equal(paperRows[0].patch.expectText, 'Find the determinant.')
assert.equal(paperRows[0].patch.text, undefined)
assert.equal(paperRows[0].patch.options, undefined)
const kept = publishedMetaPatchFromHybridFill(
  { id: 'MAM00001A2024', text: 'Stem stays.', solution: 'old hint' },
  { step_by_step_solution: '' },
)
assert.equal(kept.solution, 'old hint')
assert.equal(kept.expectText, 'Stem stays.')

const { prepareAndCheckSolution } = await import('../src/utils/solutionFill.js')
const emptySolution = prepareAndCheckSolution('   ')
assert.equal(emptySolution.passed, false)
assert.equal(emptySolution.text, '')
const plainSolution = prepareAndCheckSolution('Step 1. Expand along the first row.\nStep 2. The value is 2.')
assert.equal(plainSolution.text.includes('Step 1. Expand along the first row.'), true)
assert.equal(plainSolution.passed, true)
assert.ok(!plainSolution.text.includes('invented'))
const rawSolution = prepareAndCheckSolution('$\\frac{1}{')
assert.equal(rawSolution.passed, false)
assert.ok(rawSolution.errors.some((line) => /not passed|incomplete math/i.test(line)))
const fillSource = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/utils/solutionFill.js'),
  'utf8',
)
for (const name of [
  'recognizeWithMathpix',
  'cleanMathpixCardText',
  'preCleanMathpixOcr',
  'localOfficialPyqQualityCheck',
  'officialPyqContentReviewMessages',
]) {
  assert.ok(fillSource.includes(name), name)
}
const uiSource = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/components/MissingSolutionFill.jsx'),
  'utf8',
)
assert.ok(uiSource.includes('Ask Hybrid AI for Solution'))
assert.ok(uiSource.includes('Upload image or PDF'))
assert.ok(uiSource.includes('Paste Word or LaTeX'))
assert.ok(uiSource.includes('readSolutionScan'))
assert.ok(uiSource.includes('prepareAndCheckSolution'))
const paperUi = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/components/OfficialPyqReplicaControls.jsx'),
  'utf8',
)
assert.equal(paperUi.includes('Ask Hybrid AI to fill'), false, 'one fill button only: the post-approval Hybrid AI fill')
assert.equal(paperUi.includes('applyOfficialPyqPublishedMeta'), false)
assert.ok(paperUi.indexOf('Create four similar papers') > 0)
assert.ok(paperUi.includes('−1, Same, +1, and +2'))
assert.ok(paperUi.includes('Needs a look'))
assert.ok(paperUi.includes('avoid_texts'))
assert.ok(paperUi.includes('One difficulty only'))
assert.equal(paperUi.includes('officialPyqReplicaChildId'), false)
assert.ok(paperUi.includes('one question at a time'))
assert.ok(paperUi.includes('requestOfficialPyqReplicaSet'))
assert.ok(paperUi.includes('replicaPaperName'))
assert.ok(source.includes('_REPLICA_SET_MAX_OUTPUT_TOKENS = 8000'))
const fillFn = source.indexOf('def fill_published_pyq_sync')
assert.ok(fillFn > 0)
assert.ok(source.slice(fillFn, fillFn + 900).includes('max_output_tokens=_MAX_OUTPUT_TOKENS'))
assert.equal(source.slice(fillFn, fillFn + 900).includes('8000'), false)
assert.ok(source.includes('def published_fill_model'))
const calls = []
const walked = await fillPaperQuestionByQuestion(
  [{ text: 'First stem about a matrix.' }, { text: 'Second stem about a river.' }, { text: '' }],
  async (question) => {
    calls.push(question.text)
    const seen = calls.filter((item) => item === question.text).length
    if (question.text.startsWith('First') && seen < 3) throw new Error('try again')
    if (question.text.startsWith('Second')) throw new Error('still missing')
    return {
      subject: 'Mathematics',
      unit: 'Algebra',
      chapter: 'Matrices & Determinants',
      correct_answer: 'A',
      step_by_step_solution: 'Step 1. Expand. The value is 2.',
    }
  },
)
assert.equal(calls.filter((item) => item.startsWith('First')).length, 3)
assert.equal(calls.filter((item) => item.startsWith('Second')).length, 3)
assert.equal(walked[0].needsLook, false)
assert.equal(walked[1].needsLook, true)
assert.equal(walked[1].patch, null)
assert.equal(walked[2].skipped, true)
let fatalCalls = 0
await assert.rejects(
  fillPaperQuestionByQuestion(
    [{ text: 'One.' }, { text: 'Two.' }],
    async () => {
      fatalCalls += 1
      throw new Error('GEMINI_API_KEY is missing')
    },
    { isFatal: (err) => /GEMINI_API_KEY/i.test(err.message) },
  ),
)
assert.equal(fatalCalls, 1)
assert.ok(source.includes('_MAX_OUTPUT_TOKENS = 1500'))
assert.ok(source.includes('model=_MODEL_PRO'))
assert.ok(paperUi.includes('Similar PYQ tab'))
assert.ok(paperUi.includes('replicaAlreadyStored'))
const practiceUi = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/components/PyqStudyModesPanel.jsx'),
  'utf8',
)
assert.ok(practiceUi.includes('questionsForPyqPracticeTab'))
assert.ok(practiceUi.includes('paper.paperLabel'))
const approveUi = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/utils/officialPyqApproval.js'),
  'utf8',
)
assert.ok(approveUi.includes("sub_bank_type = 'similar_pyq'"))

const { officialPyqSolutionProblem, HYBRID_FILL_PART_SIZE } = await import('../src/utils/officialPyqReplica.js')
const {
  answerFromSolution,
  answerMatchesCard,
  applyHybridPatchToCard,
  fillOfficialPyqApprovedPaperPartByPart,
  hybridFillRequestForQuestion,
  officialPyqCardIsFilled,
  officialPyqFillAnswerProblem,
  withAnswerFromSolution,
  HYBRID_FILL_NEEDS_APPROVAL,
} = await import(
  '../src/utils/officialPyqPendingFill.js'
)
const GOOD_SOLUTION = 'Use $\\det(kA)=k^3\\det A$.\n$\\det(2A)=8\\times 2=16$.\nAnswer: (B)'
assert.equal(HYBRID_FILL_PART_SIZE, 2)
assert.equal(officialPyqSolutionProblem(GOOD_SOLUTION), '')
assert.ok(officialPyqSolutionProblem('Hint: think about the determinant of a scaled matrix.'))
assert.ok(officialPyqSolutionProblem("Let us start by recalling what a determinant is. " + 'x'.repeat(40)))
assert.ok(officialPyqSolutionProblem('x '.repeat(1000)))
assert.ok(officialPyqSolutionProblem(''))

let inFlight = 0
let maxInFlight = 0
const appliedOrder = []
const partRows = await fillPaperQuestionByQuestion(
  [1, 2, 3, 4, 5].map((n) => ({ text: `Stem number ${n}.`, options: ['1', '2', '3', '4'] })),
  async (question) => {
    inFlight += 1
    maxInFlight = Math.max(maxInFlight, inFlight)
    await new Promise((resolve) => setTimeout(resolve, 5))
    inFlight -= 1
    return { correct_answer: 'B', step_by_step_solution: GOOD_SOLUTION, chapter: question.text }
  },
  { concurrency: 2, onApplied: (row) => appliedOrder.push(row.index) },
)
assert.equal(maxInFlight, 2)
assert.deepEqual(appliedOrder, [0, 1, 2, 3, 4])
assert.equal(partRows.filter((row) => row.patch).length, 5)

let hintCalls = 0
const [retried] = await fillPaperQuestionByQuestion([{ text: 'Hint retry stem.' }], async () => {
  hintCalls += 1
  return {
    correct_answer: 'B',
    step_by_step_solution: hintCalls === 1 ? 'Hint: think about scaling each row.' : GOOD_SOLUTION,
  }
})
assert.equal(hintCalls, 2)
assert.equal(retried.needsLook, false)
assert.equal(retried.patch.solution, GOOD_SOLUTION)
const [essay] = await fillPaperQuestionByQuestion([{ text: 'Essay stem.' }], async () => ({
  correct_answer: 'B',
  step_by_step_solution: 'Long words. '.repeat(200),
}))
assert.equal(essay.needsLook, true)
assert.ok(/essay/i.test(essay.problem))

const stopCtl = new AbortController()
let stopCalls = 0
const stopRows = await fillPaperQuestionByQuestion(
  [1, 2, 3, 4].map((n) => ({ text: `Stop stem ${n}.` })),
  async () => {
    stopCalls += 1
    stopCtl.abort()
    return { correct_answer: 'A', step_by_step_solution: GOOD_SOLUTION }
  },
  { concurrency: 2, signal: stopCtl.signal, skip: (q) => q.text.endsWith('2.') },
)
assert.equal(stopCalls, 1)
assert.equal(stopRows.length, 2)
assert.equal(stopRows[1].skipped, true)

const keptCard = applyHybridPatchToCard(
  { text: 'Q', subject: 'physics', questionType: 'integer', correctInteger: 4, answerSource: 'from_paper' },
  { subject: 'chemistry', questionType: 'mcq', chapter: 'Kinematics', correctInteger: 7, solution: GOOD_SOLUTION },
)
assert.equal(keptCard.subject, 'physics')
assert.equal(keptCard.questionType, 'integer')
assert.equal(keptCard.correctInteger, 4)
assert.equal(keptCard.chapter, 'Kinematics')
assert.equal(keptCard.solution, GOOD_SOLUTION)
assert.equal(keptCard.solutionSource, 'hybrid_ai')
const handCard = applyHybridPatchToCard(
  { text: 'Q', adminEdited: true, solution: 'Mine.', correctIndex: 0 },
  { chapter: 'Optics', correctIndex: 2, solution: GOOD_SOLUTION },
)
assert.equal(handCard.solution, 'Mine.')
assert.equal(handCard.correctIndex, 0)
assert.equal(handCard.chapter, 'Optics')
const sameAnswerCard = applyHybridPatchToCard(
  { text: 'Q', correctIndex: 1, answerSource: 'unknown' },
  { correctIndex: 1, correctIndices: [], correctInteger: '', correctNumerical: '' },
)
assert.equal(sameAnswerCard.answerSource, 'unknown', 'an answer Hybrid AI only repeats is not relabelled')

function loginAs(role) {
  sessionStorage.setItem('testvantage-session', JSON.stringify({ role, email: role + '@test', name: role, loggedInAt: 1 }))
}
const fillQuestions = [
  { text: 'Fill stem one.', options: ['1', '2', '3', '4'], subject: 'mathematics', pyqSlot: 1 },
  { text: 'Fill stem two.', options: ['1', '2', '3', '4'], subject: 'mathematics', pyqSlot: 2 },
  {
    text: 'Printed answer stem.',
    options: ['1', '2', '3', '4'],
    subject: 'mathematics',
    pyqSlot: 3,
    correctIndex: 3,
    answerSource: 'from_paper',
  },
  {
    text: 'Already done.',
    options: ['1', '2', '3', '4'],
    pyqSlot: 4,
    chapter: 'Matrices & Determinants',
    section: 'Algebra',
    topic: 'Determinants',
    toughnessLevel: 4,
    correctIndex: 1,
    solution: GOOD_SOLUTION,
  },
]
const pendingFillPaper = addOfficialPyqPendingPaper({
  exam: 'jee-advanced',
  year: 2022,
  session: 'Paper 1',
  paperLabel: 'JEE Advanced 2022 Paper 1',
  paperId: 'jee-advanced-2022-pending-fill',
  sourceLabel: 'test',
  questions: fillQuestions,
})
const fillPaper = addOfficialPyqPendingPaper({
  exam: 'jee-advanced',
  year: 2022,
  session: 'Paper 2',
  paperLabel: 'JEE Advanced 2022 Paper 2',
  paperId: 'jee-advanced-2022-part-fill',
  sourceLabel: 'test',
  status: 'approved',
  questions: fillQuestions,
})
const realFetch = globalThis.fetch
const sentStems = []
const sentBodies = []
const PRINTED_D_SOLUTION = 'Expand the determinant.\nIt equals $-4$.\nAnswer: (D)'
globalThis.fetch = async (_url, init) => {
  const body = JSON.parse(init.body)
  sentStems.push(body.question_text)
  sentBodies.push(body)
  const printed = body.question_text === 'Printed answer stem.'
  return new Response(
    JSON.stringify({
      ok: true,
      chapter: 'Matrices & Determinants',
      unit: 'Algebra',
      topic: 'Determinants',
      toughness_level: '4',
      source: 'AI guessed source',
      correct_answer: 'C',
      step_by_step_solution: printed ? PRINTED_D_SOLUTION : GOOD_SOLUTION,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}
const progress = []
try {
  loginAs('admin')
  await assert.rejects(fillOfficialPyqApprovedPaperPartByPart(pendingFillPaper.id), (err) => err.message === HYBRID_FILL_NEEDS_APPROVAL)
  assert.equal(sentStems.length, 0, 'no Hybrid AI call before approval')
  const filledRun = await fillOfficialPyqApprovedPaperPartByPart(fillPaper.id, {
    onProgress: (info) => progress.push(`${info.from}-${info.to}/${info.total}`),
  })
  assert.equal(filledRun.asked, 3)
  assert.equal(filledRun.filled, 3)
  assert.deepEqual(filledRun.needsLook, [])
} finally {
  globalThis.fetch = realFetch
  sessionStorage.removeItem('testvantage-session')
}
assert.deepEqual(sentStems.sort(), ['Fill stem one.', 'Fill stem two.', 'Printed answer stem.'])
assert.ok(progress.includes('1-2/4'))
const savedFill = getOfficialPyqPendingPaper(fillPaper.id)
assert.equal(savedFill.status, 'approved', 'the fill keeps the paper approved, not published')
assert.equal(savedFill.questions[0].correctIndex, 1, 'the answer is the one the solution reaches, not the reply field')
assert.equal(savedFill.questions[0].answerSource, 'hybrid_ai')
assert.ok(savedFill.questions.every((q) => q.source === 'JEE Advanced 2022 Paper 2'), 'source is the paper name, never the AI guess')
assert.equal(savedFill.questions[0].topic, 'Determinants')
const printedBody = sentBodies.find((b) => b.question_text === 'Printed answer stem.')
assert.equal(printedBody.answer, 'D')
assert.equal(printedBody.answer_is_official, true)
assert.equal(printedBody.source, 'JEE Advanced 2022 Paper 2')
assert.equal(sentBodies.find((b) => b.question_text === 'Fill stem one.').answer_is_official, false)
assert.equal(savedFill.questions[0].solutionSource, 'hybrid_ai')
assert.equal(savedFill.questions[1].solution, GOOD_SOLUTION)
assert.equal(savedFill.questions[1].chapter, 'Matrices & Determinants')
assert.equal(savedFill.questions[1].text, 'Fill stem two.')
assert.equal(savedFill.questions[2].correctIndex, 3, 'the printed answer is never replaced')
assert.equal(savedFill.questions[2].answerSource, 'from_paper')
assert.equal(savedFill.questions[2].chapter, 'Matrices & Determinants')
assert.equal(savedFill.questions[2].solution, PRINTED_D_SOLUTION)
assert.equal(savedFill.questions[3].correctIndex, 1)
assert.equal(getOfficialPyqPendingPaper(pendingFillPaper.id).questions[0].chapter, undefined)

// The solution must reach the official answer: one that keeps reaching another answer is tried 3 times,
// then only its tags are saved. Cards that share an id are each saved on their own slot, and the run goes on.
const officialRunPaper = addOfficialPyqPendingPaper({
  exam: 'jee-advanced',
  year: 2023,
  session: 'Paper 1',
  paperLabel: 'JEE Advanced 2023 Paper 1',
  paperId: 'jee-advanced-2023-official-answer',
  sourceLabel: 'test',
  status: 'approved',
  questions: [
    { id: 'DUP1', text: 'Official C stem.', options: ['1', '2', '3', '4'], subject: 'mathematics', correctIndex: 2, answerSource: 'from_paper' },
    { id: 'DUP1', text: 'Twin stem.', options: ['1', '2', '3', '4'], subject: 'mathematics' },
    { id: 'DUP1', text: 'Third twin stem.', options: ['1', '2', '3', '4'], subject: 'mathematics' },
  ],
})
let officialCalls = 0
globalThis.fetch = async () => {
  officialCalls += 1
  return new Response(
    JSON.stringify({ ok: true, chapter: 'Matrices & Determinants', unit: 'Algebra', topic: 'Determinants', toughness_level: '5', correct_answer: 'B', step_by_step_solution: GOOD_SOLUTION }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}
try {
  loginAs('admin')
  const run = await fillOfficialPyqApprovedPaperPartByPart(officialRunPaper.id)
  assert.equal(officialCalls, 5, 'the off-answer card is asked 3 times, the twins once each')
  assert.deepEqual(run.needsLook, [1])
  assert.deepEqual(run.notSaved, [])
  assert.equal(run.filled, 3)
} finally {
  globalThis.fetch = realFetch
  sessionStorage.removeItem('testvantage-session')
}
const officialSaved = getOfficialPyqPendingPaper(officialRunPaper.id).questions
assert.equal(officialSaved[0].correctIndex, 2, 'the official answer stays')
assert.equal(officialSaved[0].solution, undefined, 'a solution reaching another answer is not saved')
assert.equal(officialSaved[0].chapter, 'Matrices & Determinants', 'its tags are still saved')
assert.deepEqual(officialSaved.map((q) => q.text), ['Official C stem.', 'Twin stem.', 'Third twin stem.'])
assert.equal(officialSaved[1].solution, GOOD_SOLUTION)
assert.equal(officialSaved[2].solution, GOOD_SOLUTION)
assert.equal(officialSaved[2].correctIndex, 1)

// Reading the answer a solution reaches.
const mcq = { options: ['1', '2', '3', '4'] }
assert.equal(answerFromSolution('Work.\n**Answer:** (A) and (C)', mcq), 'A,C')
assert.equal(answerFromSolution('Work.\nAnswer: $\\frac{3}{4}$', {}), '0.75')
assert.equal(answerFromSolution('Work.\nAnswer: $2.5 \\times 10^{-2}$ m', {}), '0.025')
assert.equal(answerFromSolution('Work.\nFinal answer: 12', {}), '12')
assert.equal(answerFromSolution('Answer: (B)\nThen more working that ends nowhere.\nStill going.\nAnd going.', mcq), '')
assert.equal(answerMatchesCard({ ...mcq, correctIndices: [0, 2] }, 'A,C'), true)
assert.equal(answerMatchesCard({ ...mcq, correctIndex: 1 }, 'C'), false)
assert.equal(answerMatchesCard({ correctNumerical: 0.75, numericalTolerance: 0.01 }, '0.75'), true)
assert.equal(answerMatchesCard({ ...mcq, correctIndex: 1, bonusMarksToAll: true }, 'C'), true)
const officialB = { ...mcq, correctIndex: 1, answerSource: 'from_paper' }
assert.equal(officialPyqFillAnswerProblem(officialB, { step_by_step_solution: GOOD_SOLUTION }), '')
assert.match(officialPyqFillAnswerProblem(officialB, { step_by_step_solution: 'x\nAnswer: (C)' }), /official answer is B/)
assert.match(officialPyqFillAnswerProblem(mcq, { step_by_step_solution: 'Some working only.' }), /does not end with its answer/)
assert.equal(withAnswerFromSolution(mcq, { correct_answer: 'D', step_by_step_solution: GOOD_SOLUTION }).correct_answer, 'B')
assert.equal(withAnswerFromSolution(officialB, { correct_answer: 'D', step_by_step_solution: GOOD_SOLUTION }).correct_answer, 'D')
// 2018–2024 uploads saved "(A), from the paper" on every question of papers that print no key.
const fakeKeyCards = [
  ...[1, 2, 3, 4, 5].map((n) => ({ text: `Q${n}`, ...mcq, correctIndex: 0, answerSource: 'from_paper', adminEdited: n === 1 })),
  { text: 'Numeric', correctIndex: 0, answerSource: 'from_paper' },
  { text: 'Numeric with value', correctInteger: 7, answerSource: 'from_paper' },
  { text: 'Read off the page', ...mcq, correctIndex: 0, answerSource: 'from_paper', answerFromOriginalPage: true },
]
const releasedCards = releaseUnprintedAnswerKeys(fakeKeyCards)
assert.deepEqual(
  releasedCards.map((q) => q.answerSource),
  ['unknown', 'unknown', 'unknown', 'unknown', 'unknown', 'unknown', 'from_paper', 'from_paper'],
)
assert.equal(releasedCards[0].correctIndex, 0, 'the old letter stays until Hybrid AI replaces it')
assert.equal(releaseUnprintedAnswerKeys(releasedCards), null, 'runs once')
assert.equal(releaseUnprintedAnswerKeys(fakeKeyCards.slice(0, 4)), null, 'too few cards to tell')
assert.equal(releaseUnprintedAnswerKeys(fakeKeyCards.map((q, i) => (i === 2 ? { ...q, correctIndex: 3 } : q))), null, 'a real key varies')
assert.equal(officialPyqCardIsFilled({ ...releasedCards[1], chapter: 'C', section: 'S', topic: 'T', toughnessLevel: 3, solution: GOOD_SOLUTION }), false)
const releasedRequest = hybridFillRequestForQuestion(releasedCards[0], 'jee-advanced')
assert.equal(releasedRequest.answer_is_official, false, 'a hand-edited card with a released key is still solved by Hybrid AI')
assert.equal(releasedRequest.answer, '')
const releasedPatched = applyHybridPatchToCard(releasedCards[0], { correctIndex: 2, solution: GOOD_SOLUTION })
assert.equal(releasedPatched.correctIndex, 2)
assert.equal(releasedPatched.answerSource, 'hybrid_ai')

const draftCard = { ...officialB, text: 'S', solution: '**Answer.** (B) Quick eliminations', solutionSource: 'draft' }
assert.equal(hybridFillRequestForQuestion(draftCard, 'jee-advanced', { source: 'X' }).solution, '', 'a draft is not sent as a solution')
assert.equal(hybridFillRequestForQuestion(draftCard, 'jee-advanced', { source: 'X' }).source, 'X')

const pendingPage = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/pages/OfficialPyqPending.jsx'),
  'utf8',
)
assert.equal(pendingPage.includes('enrichQuestionsLightClient'), false)
const approvedBlock = pendingPage.indexOf("selected.status === 'approved' ? (")
const hybridFillAt = pendingPage.indexOf('<OfficialPyqHybridFill')
const publishedBlock = pendingPage.indexOf("selected.status === 'published' ? (")
const rejectedBlock = pendingPage.indexOf("selected.status === 'rejected' ? (")
assert.ok(
  approvedBlock > 0 && hybridFillAt > approvedBlock && publishedBlock > hybridFillAt && rejectedBlock > publishedBlock,
  'Hybrid AI fill sits on approved papers only',
)
assert.equal(pendingPage.split('<OfficialPyqHybridFill').length, 2, 'no Hybrid AI fill on pending papers')
assert.equal(pendingPage.includes('OfficialPyqPendingFill'), false)
assert.equal(approveUi.includes('enrichQuestionsLightClient'), false)

console.log('official pyq replica ok')
