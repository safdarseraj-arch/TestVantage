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
assert.ok(source.slice(fillAt, fillAt + 1200).includes('HYBRID_SOLUTION_INSTRUCTION'))
assert.ok(source.slice(fillAt, fillAt + 1400).includes('If the stored solution is a hint or a story'))
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
const fillBtn = paperUi.indexOf('Ask Hybrid AI to fill')
const similarBtn = paperUi.indexOf('Create four similar papers')
assert.ok(fillBtn > 0 && similarBtn > fillBtn)
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

console.log('official pyq replica ok')
