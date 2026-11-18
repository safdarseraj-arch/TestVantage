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
  hybridFillOutage,
  hybridFillRetryReason,
  hybridFillUsage,
  hybridFillUsageNote,
  HYBRID_FILL_TRIES,
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
    if (question.text.startsWith('First') && seen < 2) throw new Error('bad reply')
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
assert.equal(HYBRID_FILL_TRIES, 2)
assert.equal(calls.filter((item) => item.startsWith('First')).length, 2)
assert.equal(calls.filter((item) => item.startsWith('Second')).length, 2, 'a failing question is asked twice, not three times')
assert.equal(walked[0].needsLook, false)
assert.equal(walked[1].needsLook, true)
assert.equal(walked[1].patch, null)
assert.equal(walked[2].skipped, true)

// Hybrid AI not answering (helper restarting, Gemini busy): wait and ask again, then pause the run
// instead of running through the rest of the paper with nothing filled.
const HELPER_DOWN = 'TestVantages Hybrid AI (FastAPI on port 8000) is not running. Press F5 and keep the bottom terminal open.'
assert.equal(hybridFillOutage(new Error(HELPER_DOWN)), true)
assert.equal(hybridFillOutage(new Error('429 RESOURCE_EXHAUSTED. Quota exceeded')), true)
assert.equal(hybridFillOutage(new Error('503 UNAVAILABLE. The model is overloaded.')), true)
assert.equal(hybridFillOutage(new Error('Hybrid AI did not answer in time. Press F5 and keep the bottom terminal open.')), true)
assert.equal(hybridFillOutage(new Error('Gemini returned a cut-off question, so nothing was saved.')), false)
let blipCalls = 0
const blipRows = await fillPaperQuestionByQuestion(
  [{ text: 'Blip one.' }, { text: 'Blip two.' }],
  async () => {
    blipCalls += 1
    if (blipCalls === 1) throw new Error(HELPER_DOWN)
    return { correct_answer: 'A', step_by_step_solution: 'Step 1. Expand. The value is 2.', usage: { input: 1200, output: 500, model: 'gemini-3.7-flash' } }
  },
  { outageWaitsMs: [1, 1] },
)
assert.equal(blipCalls, 3, 'a short outage waits and asks the same question again')
assert.ok(blipRows.every((row) => row.patch && !row.outage))
const blipUsage = hybridFillUsage(blipRows)
assert.equal(blipUsage.requests, 2)
assert.equal(blipUsage.input, 2400)
assert.ok(Math.abs(blipUsage.usd - (2400 * 0.75 + 1000 * 3.75) / 1e6) < 1e-9)
assert.match(hybridFillUsageNote(blipUsage), /2 replies, 2,400 tokens sent and 1,000 received — about ₹0\.49/)
let downCalls = 0
const appliedDown = []
const downRows = await fillPaperQuestionByQuestion(
  [1, 2, 3, 4, 5, 6].map((n) => ({ text: `Down stem ${n}.` })),
  async (question) => {
    downCalls += 1
    if (question.text !== 'Down stem 1.' && question.text !== 'Down stem 2.') throw new Error(HELPER_DOWN)
    return { correct_answer: 'A', step_by_step_solution: 'Step 1. Expand. The value is 2.' }
  },
  {
    concurrency: 2,
    outageWaitsMs: [1, 1],
    maxOutageStreak: 1,
    onApplied: (row) => appliedDown.push(row.index),
  },
)
assert.deepEqual(appliedDown, [0, 1, 2, 3], 'with streak 1 the run pauses after the first failed pair')
assert.equal(downCalls, 2 + 2 * 3, 'questions 3 and 4 are each asked 3 times (two waits), questions 5 and 6 are not asked')
assert.ok(downRows[2].outage && downRows[2].pausedRun && !downRows[2].needsLook && !downRows[2].patch)
let continueCalls = 0
const continueRows = await fillPaperQuestionByQuestion(
  [1, 2, 3, 4, 5, 6].map((n) => ({ text: `Continue stem ${n}.` })),
  async (question) => {
    continueCalls += 1
    if (question.text === 'Continue stem 1.' || question.text === 'Continue stem 2.') {
      return { correct_answer: 'A', step_by_step_solution: 'Step 1. Expand. The value is 2.' }
    }
    throw new Error(HELPER_DOWN)
  },
  { concurrency: 2, outageWaitsMs: [1, 1], maxOutageStreak: 3 },
)
assert.equal(continueRows.length, 6, 'a short failed pair does not stop the rest of the paper')
assert.ok(continueRows[0].patch && continueRows[1].patch)
assert.ok(continueRows[2].outage && !continueRows[2].pausedRun)
assert.ok(continueRows[4].outage && !continueRows[4].pausedRun)
assert.equal(continueCalls, 2 + 4 * 3, 'pairs 2 and 3 are still attempted after the first outage pair')
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
  officialPyqCardMissingText,
  officialPyqFillAnswerProblem,
  officialPyqFillIncomplete,
  withAnswerFromSolution,
  HYBRID_FILL_NEEDS_APPROVAL,
} = await import(
  '../src/utils/officialPyqPendingFill.js'
)
const { officialPyqAnswerKeyIsReleased } = await import('../src/utils/officialPyqPendingStore.js')
const GOOD_SOLUTION = 'Use $\\det(kA)=k^3\\det A$.\n$\\det(2A)=8\\times 2=16$.\nAnswer: (B)'
assert.equal(HYBRID_FILL_PART_SIZE, 2)
assert.equal(officialPyqSolutionProblem(GOOD_SOLUTION), '')
assert.ok(officialPyqSolutionProblem('Hint: think about the determinant of a scaled matrix.'))
assert.ok(officialPyqSolutionProblem("Let us start by recalling what a determinant is. " + 'x'.repeat(40)))
assert.ok(officialPyqSolutionProblem('x '.repeat(1000)))
assert.ok(officialPyqSolutionProblem(''))
// Seen on JEE Advanced 2026 P2 Q14: the working reached 56, then "Wait … Re-evaluating …" and "Answer: 53".
const MIND_CHANGE = 'So $|A| = 48$ and $|B| = 4$.\nTherefore the value is $56$.\nWait, re-evaluating the count of integers: 53 or 56.\nAnswer: 53'
assert.match(officialPyqSolutionProblem(MIND_CHANGE), /changes its mind/)
assert.match(officialPyqSolutionProblem('Sum is 6.\nRe-verify the official answer which is 5 or 6.\nAnswer: 5'), /changes its mind/)
assert.equal(officialPyqSolutionProblem('The weight is $mg = 20$ N; the tension balances it.\nAnswer: 20'), '')
assert.equal(officialPyqSolutionProblem('Each await of the queue adds $2$ s; total time $= 3 \\times 2 = 6$ s.\nAnswer: 6'), '')

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
const handEmptySol = applyHybridPatchToCard(
  { text: 'Q', adminEdited: true, correctIndex: 0, answerSource: 'from_paper' },
  { chapter: 'Optics', solution: GOOD_SOLUTION },
)
assert.equal(handEmptySol.solution, GOOD_SOLUTION, 'adminEdited with no solution still takes Hybrid AI')
assert.equal(handEmptySol.solutionSource, 'hybrid_ai')
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

// The solution must reach the official answer: one that keeps reaching another answer is tried twice,
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
const officialBodies = []
globalThis.fetch = async (_url, init) => {
  officialCalls += 1
  officialBodies.push(JSON.parse(init.body))
  return new Response(
    JSON.stringify({ ok: true, chapter: 'Matrices & Determinants', unit: 'Algebra', topic: 'Determinants', toughness_level: '5', correct_answer: 'B', step_by_step_solution: GOOD_SOLUTION }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}
try {
  loginAs('admin')
  const run = await fillOfficialPyqApprovedPaperPartByPart(officialRunPaper.id)
  assert.equal(officialCalls, 4, 'the off-answer card is asked twice, the twins once each')
  assert.deepEqual(run.needsLook, [1])
  assert.deepEqual(run.notSaved, [])
  assert.equal(run.filled, 3)
} finally {
  globalThis.fetch = realFetch
  sessionStorage.removeItem('testvantage-session')
}
// The second ask tells Gemini what was wrong with the first reply; first asks carry no reason.
const offAnswerAsks = officialBodies.filter((b) => b.question_text === 'Official C stem.')
assert.equal(offAnswerAsks.length, 2)
assert.equal(offAnswerAsks[0].retry_reason, undefined)
assert.match(offAnswerAsks[1].retry_reason, /^Your previous reply was not saved: The solution reaches B, but the official answer is C\./)
assert.match(offAnswerAsks[1].retry_reason, /the last line must be "Answer: C"\.$/)
assert.ok(offAnswerAsks[1].retry_reason.length <= 300)
assert.ok(officialBodies.filter((b) => b.question_text !== 'Official C stem.').every((b) => b.retry_reason === undefined))
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
const releasedPatched = applyHybridPatchToCard(releasedCards[1], { correctIndex: 1, solution: GOOD_SOLUTION })
assert.equal(releasedPatched.correctIndex, 1)
assert.equal(releasedPatched.answerSource, 'hybrid_ai')
assert.equal(releasedPatched.answerKeyReleased, undefined, 'Hybrid AI clears the fake-key release flag')
assert.equal(officialPyqAnswerKeyIsReleased(releasedPatched), false)
assert.equal(
  officialPyqCardIsFilled({
    ...releasedPatched,
    chapter: 'C',
    section: 'S',
    topic: 'T',
    toughnessLevel: 3,
    solution: GOOD_SOLUTION,
    solutionSource: 'hybrid_ai',
  }),
  true,
  'Hybrid-filled card after a released key counts as filled',
)

const draftCard = { ...officialB, text: 'S', solution: '**Answer.** (B) Quick eliminations', solutionSource: 'draft' }
assert.equal(hybridFillRequestForQuestion(draftCard, 'jee-advanced', { source: 'X' }).solution, '', 'a draft is not sent as a solution')
assert.equal(hybridFillRequestForQuestion(draftCard, 'jee-advanced', { source: 'X' }).source, 'X')

// A paragraph question (JEE Advanced Section 4) carries its paragraph: its own line cannot be solved alone,
// so without it every numerical paragraph card came back with no solution and kept tags only.
const PASSAGE = 'Curves $y=e^{-x}$ and $y=e^{-x}(\\sin x+\\cos x)$ on $[0,10\\pi]$ meet at $n$ points.'
const paragraphPaper = addOfficialPyqPendingPaper({
  exam: 'jee-advanced',
  year: 2026,
  session: 'Paper 2',
  paperLabel: 'JEE Advanced 2026 Paper 2',
  paperId: 'jee-advanced-2026-paragraph-fill',
  sourceLabel: 'test',
  status: 'approved',
  questions: [
    {
      text: 'The value of $n$ is ____.',
      options: ['', '', '', ''],
      questionType: 'numerical',
      subject: 'mathematics',
      answerSource: 'unknown',
      chapter: 'General',
      passageText: PASSAGE,
      passageRole: 'comprehension_child',
    },
    { text: 'Numerical stem with its own data: find 2.5 times 2.', options: ['', '', '', ''], questionType: 'numerical', subject: 'mathematics', answerSource: 'unknown' },
  ],
})
const paragraphBodies = []
globalThis.fetch = async (_url, init) => {
  const body = JSON.parse(init.body)
  paragraphBodies.push(body)
  const paragraph = body.question_text.includes(PASSAGE)
  const own = body.question_text.startsWith('Numerical stem')
  const solution = paragraph
    ? '$e^{-x}\\sin x+e^{-x}\\cos x=e^{-x}$ gives $\\sin(x+\\pi/4)=1/\\sqrt2$.\nTwo roots per $2\\pi$ on $[0,10\\pi]$.\nAnswer: 10'
    : own
      ? 'Multiply the two given numbers.\n$2.5 \\times 2 = 5.5 - 0.5$.\nAnswer: 5'
      : ''
  return new Response(
    JSON.stringify({ ok: true, chapter: 'Sequences & Series', unit: 'Algebra', topic: 'Counting roots', toughness_level: '6', correct_answer: solution ? (paragraph ? '10' : '5') : '', step_by_step_solution: solution }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}
try {
  loginAs('admin')
  const run = await fillOfficialPyqApprovedPaperPartByPart(paragraphPaper.id)
  assert.deepEqual(run.needsLook, [], 'the paragraph question is answered, not left for a look')
  assert.equal(run.filled, 2)
} finally {
  globalThis.fetch = realFetch
  sessionStorage.removeItem('testvantage-session')
}
assert.equal(paragraphBodies.length, 2, 'one reply each, no retry')
assert.equal(paragraphBodies[0].question_text, `Paragraph:\n${PASSAGE}\n\nQuestion:\nThe value of $n$ is ____.`)
assert.equal(paragraphBodies[1].question_text, 'Numerical stem with its own data: find 2.5 times 2.')
const paragraphSaved = getOfficialPyqPendingPaper(paragraphPaper.id).questions
assert.equal(paragraphSaved[0].correctInteger, 10, 'the numerical answer is saved')
assert.match(paragraphSaved[0].solution, /Answer: 10$/)
assert.equal(paragraphSaved[0].answerSource, 'hybrid_ai')
assert.equal(paragraphSaved[0].text, 'The value of $n$ is ____.', 'the stem is not changed')
assert.equal(paragraphSaved[0].passageText, PASSAGE)
assert.equal(paragraphSaved[1].correctInteger, 5)
assert.equal(officialPyqCardIsFilled(paragraphSaved[0]), true)
const tagsOnlyParagraph = hybridFillRequestForQuestion(paragraphSaved[0], 'jee-advanced', { tagsOnly: true })
assert.ok(tagsOnlyParagraph.question_text.startsWith(`Paragraph:\n${PASSAGE}`), 'tags-only asks see the paragraph too')

// A question that cannot be solved as it stands is not asked again (no second paid reply): Gemini names what is
// missing, tags it incomplete, or sends no answer and no solution. A card already missing its paragraph or
// named figure is not asked at all. These are listed on their own, not with "needs a look". Usable tags from
// an incomplete reply are still saved; a bogus "Incomplete Question" topic is not.
assert.equal(officialPyqCardMissingText({ text: 'The value of $n$ is ____.', passageRole: 'comprehension_child' }), 'its paragraph is missing')
assert.equal(officialPyqCardMissingText({ text: 'The current in the circuit shown in the figure is', options: ['1', '2', '3', '4'] }), 'it names a figure but the card has no picture')
assert.equal(officialPyqCardMissingText({ text: 'The circuit shown in the figure \\includegraphics{https://cdn.mathpix.com/cropped/a.jpg}' }), '')
assert.equal(officialPyqCardMissingText({ text: 'Find the value of $x$.', passageText: PASSAGE, passageRole: 'comprehension_child' }), '')
assert.equal(officialPyqFillIncomplete({}, { topic: 'Integration', step_by_step_solution: GOOD_SOLUTION, correct_answer: 'B' }), '')
assert.match(officialPyqFillIncomplete({}, { topic: 'Incomplete Question', step_by_step_solution: '', correct_answer: '' }), /looks incomplete/)
assert.match(officialPyqFillIncomplete({}, { missing_info: 'the graph of f is not given' }), /\(the graph of f is not given\) — fix the card, then press Fill again\.$/)
assert.match(officialPyqFillIncomplete({}, { topic: 'Calculus', step_by_step_solution: '', correct_answer: '' }), /no answer and no solution/)
assert.equal(hybridFillRetryReason(''), '')
assert.match(hybridFillRetryReason('The solution reads like a hint, not worked steps.'), /hint, not worked steps\. Give 3 to 8 short worked steps; the last line must be "Answer: "/)
assert.ok(hybridFillRetryReason('x'.repeat(500)).length <= 300)

const incompletePaper = addOfficialPyqPendingPaper({
  exam: 'jee-advanced',
  year: 2026,
  session: 'Paper 1',
  paperLabel: 'JEE Advanced 2026 Paper 1',
  paperId: 'jee-advanced-2026-incomplete-fill',
  sourceLabel: 'test',
  status: 'approved',
  questions: [
    { text: 'Gemini says the table is missing: find $k$.', options: ['', '', '', ''], questionType: 'numerical', subject: 'mathematics', answerSource: 'unknown', chapter: 'General' },
    { text: 'Gemini tags this one incomplete: find $m$.', options: ['', '', '', ''], questionType: 'numerical', subject: 'mathematics', answerSource: 'unknown', chapter: 'General' },
    { text: 'The value of $n$ is ____.', options: ['', '', '', ''], questionType: 'numerical', subject: 'mathematics', answerSource: 'unknown', passageRole: 'comprehension_child', passageGroup: 'pyq-para-x' },
    { text: 'A plain stem whose first reply is a hint: find $p$.', options: ['', '', '', ''], questionType: 'numerical', subject: 'mathematics', answerSource: 'unknown' },
  ],
})
const incompleteBodies = []
globalThis.fetch = async (_url, init) => {
  const body = JSON.parse(init.body)
  incompleteBodies.push(body)
  const reply = body.question_text.startsWith('Gemini says')
    ? { chapter: 'Matrices & Determinants', topic: 'Determinants', unit: 'Algebra', toughness_level: '4', correct_answer: '', step_by_step_solution: '', missing_info: 'the table of values is missing' }
    : body.question_text.startsWith('Gemini tags')
      ? { chapter: 'Sequences & Series', topic: 'Incomplete Question', correct_answer: '', step_by_step_solution: '' }
      : body.retry_reason
        ? { chapter: 'Sequences & Series', unit: 'Algebra', topic: 'AP', toughness_level: '5', correct_answer: '7', step_by_step_solution: 'Sum of the first terms gives $p$.\n$p = 3 + 4 = 7$.\nAnswer: 7' }
        : { chapter: 'Sequences & Series', unit: 'Algebra', topic: 'AP', toughness_level: '5', correct_answer: '7', step_by_step_solution: 'Hint: think about the common difference first.' }
  return new Response(JSON.stringify({ ok: true, ...reply }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
let incompleteRun
try {
  loginAs('admin')
  incompleteRun = await fillOfficialPyqApprovedPaperPartByPart(incompletePaper.id)
} finally {
  globalThis.fetch = realFetch
  sessionStorage.removeItem('testvantage-session')
}
const asksFor = (start) => incompleteBodies.filter((b) => b.question_text.startsWith(start))
assert.equal(asksFor('Gemini says').length, 1, 'a reply naming what is missing is not asked again')
assert.equal(asksFor('Gemini tags').length, 1, 'a reply tagged incomplete is not asked again')
assert.equal(asksFor('The value of').length, 0, 'a paragraph card with no paragraph is not asked at all')
assert.equal(asksFor('A plain stem').length, 2, 'a hint is still asked a second time')
assert.match(asksFor('A plain stem')[1].retry_reason, /reads like a hint/)
assert.deepEqual(incompleteRun.incomplete, [1, 2, 3])
assert.deepEqual(incompleteRun.needsLook, [])
assert.deepEqual(incompleteRun.failed, [])
assert.equal(incompleteRun.filled, 2, 'usable tags from a missing-figure reply are saved, plus the fixed hint question')
assert.deepEqual(incompleteRun.stillBlank, [2, 3], 'blank-tag list names cards that still need chapter/topic')
const incompleteSaved = getOfficialPyqPendingPaper(incompletePaper.id).questions
assert.equal(incompleteSaved[0].chapter, 'Matrices & Determinants', 'usable tags from an incomplete reply are kept')
assert.equal(incompleteSaved[0].topic, 'Determinants')
assert.equal(incompleteSaved[1].topic, undefined, '"Incomplete Question" is never saved as a topic')
assert.equal(incompleteSaved[1].chapter, 'General')
assert.equal(incompleteSaved[3].correctInteger, 7)
assert.match(incompleteSaved[3].solution, /Answer: 7$/)

const fillUi = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/components/OfficialPyqHybridFill.jsx'), 'utf8')
assert.ok(fillUi.includes('result.incomplete') && fillUi.includes('HYBRID_FILL_INCOMPLETE_NOTE'))
assert.ok(fillUi.includes('stillBlankNote') && fillUi.includes('Still blank tags'))
const bankUi = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/components/BankHybridFill.jsx'), 'utf8')
assert.ok(bankUi.includes('result.incomplete') && bankUi.includes('HYBRID_FILL_INCOMPLETE_NOTE'))
// The per-card buttons ("Ask Hybrid AI for Solution", "Ask Hybrid AI to fill") send the paragraph too.
const missingUi = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/components/MissingSolutionFill.jsx'), 'utf8')
assert.match(missingUi, /question_text: questionTextWithPassage\(questionText, passageText\)/)
const metaUi = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/components/OfficialPyqPublishedMetaForm.jsx'), 'utf8')
assert.match(metaUi, /question_text: questionTextWithPassage\(question\?\.text \?\? question\?\.stem, question\?\.passageText\)/)
assert.match(metaUi, /passageText=\{String\(question\?\.passageText \?\? ''\)\}/)
const savedUi = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/components/SavedQuestionContentEditor.jsx'), 'utf8')
assert.match(savedUi, /passageText=\{isPassageParent \? passageText : linkedPassageText \|\| ''\}/)
const mainPy = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../main.py'), 'utf8')
assert.match(mainPy, /retry_reason: str \| None = Field/)
assert.match(mainPy, /"retry_reason": "" if body\.tags_only else \(body\.retry_reason or ""\)\.strip\(\)\[:300\]/)
assert.match(source.slice(source.indexOf('def _published_fill_prompt')), /_published_retry_line\(params\)/)
assert.match(source.slice(source.indexOf('class PublishedPyqFillOutput'), source.indexOf('class PublishedPyqTagsOutput')), /missing_info: str = ""/)

// Code execution can spend the whole 1500-token cap before any JSON ("Gemini returned empty text"):
// the server asks once more without code execution instead of failing the question twice.
const fillPy = source.slice(source.indexOf('def fill_published_pyq_sync'), source.indexOf('def _token_usage'))
assert.match(fillPy, /_published_fill_cut_off\(response, parsed\)/)
assert.match(fillPy, /use_code_tools=False,\s*max_output_tokens=_MAX_OUTPUT_TOKENS/)
assert.match(source.slice(source.indexOf('def _published_fill_cut_off')), /MAX_TOKENS/)
// A reply with no text says why in plain words, never the bare "Gemini returned empty text."
assert.equal(source.includes('ValueError("Gemini returned empty text.")\n    return joined'), false)
assert.match(source.slice(source.indexOf('def _no_text_message')), /Gemini ran out of room while calculating/)

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
