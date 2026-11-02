/**
 * JSON parse/validate for Gemini SCQ trial. No live API.
 */
import assert from 'node:assert/strict'
import { join } from 'node:path'

const {
  listTrialChapters,
  listAllTrialJobs,
  resolveTrialJobs,
  trialSelectionScopeLabel,
  pickSmokeChapter,
  trialSubjectAllowed,
  parseAndValidateScqTrialResponse,
  trialDraftIsIncomplete,
  healTrialExtractedStem,
  parseCorrectIndex,
  trialItemToBankDraft,
  trialItemToPyqBankItem,
  applyTrialDuplicatePolicy,
  SCQ_TRIAL_COUNT,
  SCQ_TRIAL_SOURCE,
  GEMINI_TRIAL_SOURCE,
  clampTrialCount,
  validateTrialCount,
  resolveTrialCount,
  TRIAL_COUNT_MIN,
  TRIAL_COUNT_MAX,
  TRIAL_COUNT_CUSTOM,
  planTrialQuestionTypes,
  trialTypeMixLabel,
  trialItemToBankDrafts,
  parseRepairedTruncatedJson,
  extractJsonValue,
  buildTrialLiveSnapshot,
  stemPreview,
  normalizeTrialExamId,
  trialExamLabel,
  toughnessQuotaForCount,
  plannedToughnessLevels,
  PYQ_STYLE_YEARS,
  SCQ_TRIAL_MODEL_CANDIDATES,
  GEMINI_TRIAL_SYSTEM,
} = await import('../src/utils/geminiScqTrial.js')

assert.equal(trialSubjectAllowed('jee-main', 'biology'), false, 'no Biology chapters for JEE')
assert.equal(trialSubjectAllowed('jee-main', 'mathematics'), true)
assert.equal(trialSubjectAllowed('jee-advanced', 'mathematics'), true)
assert.equal(trialSubjectAllowed('jee-advanced', 'biology'), false)
assert.equal(trialSubjectAllowed('neet', 'biology'), true)
assert.equal(trialSubjectAllowed('neet', 'mathematics'), false)
assert.equal(normalizeTrialExamId('JEEE Main'), 'jee-main')
assert.equal(normalizeTrialExamId('jeee-main'), 'jee-main')
assert.equal(trialExamLabel('jee-advanced'), 'JEE Advanced')
assert.equal(trialExamLabel('neet'), 'NEET')

const maths = listTrialChapters('jee-main', 'mathematics')
assert.ok(maths.length >= 10, 'maths must have built-in chapters')
assert.ok(maths.every((c) => c.chapter && c.section && c.subject === 'mathematics'))
assert.ok(maths.some((c) => c.chapter === 'Integration'))
assert.ok(!maths.some((c) => /definite integration/i.test(c.chapter)))

const bioJee = listTrialChapters('jee-main', 'biology')
assert.equal(bioJee.length, 0)

const allJobs = listAllTrialJobs()
assert.ok(allJobs.every((j) => j.examId === 'jee-main' || j.examId === 'jee-advanced' || j.examId === 'neet'))
assert.ok(!allJobs.some((j) => j.examId === 'jee-main' && j.subject === 'biology'))
assert.ok(allJobs.some((j) => j.examId === 'jee-advanced' && j.subject === 'physics'))
assert.ok(allJobs.filter((j) => j.examId === 'neet' && j.subject === 'biology').length > 0)

const smoke = pickSmokeChapter()
assert.ok(smoke)
assert.equal(smoke.examId, 'jee-main')
assert.equal(smoke.subject, 'mathematics')

assert.equal(parseCorrectIndex(0), 0)
assert.equal(parseCorrectIndex(3), 3)
assert.equal(parseCorrectIndex('B'), 1)
assert.equal(parseCorrectIndex('D'), 3)
assert.equal(parseCorrectIndex(null), null)

console.log('test-gemini-scq-trial: curriculum ok')

const job = {
  examId: 'jee-main',
  subject: 'mathematics',
  section: 'Calculus',
  chapter: 'Integration',
  topics: ['Substitution', 'Parts', 'Partial fractions'],
}

const fakePayload = {
  questions: [
    {
      stem: 'The value of $\\int_0^1 2x\\,dx$ is:',
      options: ['$0$', '$1$', '$2$', '$1/2$'],
      correctIndex: 1,
      solution: 'Antiderivative $x^2$ from 0 to 1 is $1$.',
      toughness: 2,
      topic: 'Substitution',
    },
    {
      text: 'If $\\int f(x)\\,dx = \\sin x + C$, then $f(x)$ is:',
      options: ['$\\cos x$', '$\\sin x$', '$-\\cos x$', '$x$'],
      correct: 'A',
      solution: 'Derivative of $\\sin x$ is $\\cos x$.',
      toughness: 1,
      topic: 'Parts',
    },
    {
      stem: 'Missing options should fail',
      options: ['only', 'three'],
      correctIndex: 0,
      solution: 'nope',
      topic: 'Substitution',
    },
  ],
}

const wrapped = 'Here are the questions:\n' + JSON.stringify(fakePayload, null, 2)
const parsed = parseAndValidateScqTrialResponse(wrapped, job)
assert.equal(parsed.questions.length, 2, 'two valid SCQs')
assert.equal(parsed.rawCount, 3)
assert.ok(parsed.errors.some((e) => /4 options/i.test(e)))
assert.equal(parsed.questions[0].correctIndex, 1)
assert.equal(parsed.questions[1].correctIndex, 0)
assert.equal(parsed.questions[0].options.length, 4)
assert.equal(parsed.questions[0].topic, 'Substitution')

const { LET_ABE_SMASHED_VMATRIX_STEM } = await import('../src/utils/repairSmashedProseVmatrixOcr.js')
const smashedTrial = parseAndValidateScqTrialResponse(
  {
    questions: [
      {
        stem: LET_ABE_SMASHED_VMATRIX_STEM,
        options: ['9', '11', '12', '15'],
        correctIndex: 1,
        solution: 'Partial OCR — do not treat as a full question.',
        toughness: 5,
        topic: 'Substitution',
      },
      fakePayload.questions[0],
    ],
  },
  job,
)
assert.equal(smashedTrial.questions.length, 1, 'partial Let/Abe extract is not saved as a trial question')
assert.ok(smashedTrial.errors.some((e) => /incomplete extraction/i.test(e)))
assert.equal(smashedTrial.questions[0].correctIndex, 1)
const smashedDraft = {
  text: healTrialExtractedStem(LET_ABE_SMASHED_VMATRIX_STEM),
  options: ['9', '11', '12', '15'],
}
assert.equal(trialDraftIsIncomplete(smashedDraft), true)
assert.equal(SCQ_TRIAL_MODEL_CANDIDATES[0], 'gemini-3.5-flash-lite')
assert.match(GEMINI_TRIAL_SYSTEM, /Never invent a missing denominator/i)
assert.match(GEMINI_TRIAL_SYSTEM, /Never smash English words/i)

const draft = trialItemToBankDraft(parsed.questions[0], job, { now: 1700000000000, index: 0 })
assert.equal(draft.bankStatus, 'draft')
assert.equal(draft.questionType, 'single_correct')
assert.equal(draft.chapter, 'Integration')
assert.equal(draft.section, 'Calculus')
assert.deepEqual(draft.examIds, ['jee-main'])
assert.equal(draft.source, GEMINI_TRIAL_SOURCE)
assert.equal(SCQ_TRIAL_SOURCE, GEMINI_TRIAL_SOURCE)
assert.notEqual(draft.bankStatus, 'published')

const existing = [
  {
    id: 'old-1',
    text: parsed.questions[0].stem,
    options: parsed.questions[0].options,
    questionType: 'single_correct',
    bankStatus: 'published',
  },
]
const dup = applyTrialDuplicatePolicy(draft, existing)
assert.equal(dup.duplicate, true)
assert.equal(dup.entry.bankStatus, 'draft')
assert.equal(dup.entry.duplicateOfId, 'old-1')

const unique = applyTrialDuplicatePolicy(
  trialItemToBankDraft(
    {
      stem: 'A clearly different integral $\\int e^x\\,dx$ equals:',
      options: ['$e^x+C$', '$x$', '$1$', '$0$'],
      correctIndex: 0,
      solution: 'Standard.',
      toughness: 1,
      topic: 'Substitution',
    },
    job,
    { now: 1700000000001, index: 1 },
  ),
  existing,
)
assert.equal(unique.duplicate, false)
assert.equal(unique.entry.bankStatus, 'draft')
assert.equal(SCQ_TRIAL_COUNT, 10)

const truncated = '{"questions":[{"stem":"What is $1+1$?","options":["1","2","3","4"],"correctIndex":1,"solution":"Add","toughness":1,"topic":"Substitution"}'
const repaired = parseRepairedTruncatedJson(truncated)
assert.ok(repaired)
assert.equal(repaired.questions[0].correctIndex, 1)
const fromExtract = extractJsonValue(truncated)
assert.equal(fromExtract.questions.length, 1)

const snap = buildTrialLiveSnapshot(
  {
    updatedAt: 1,
    jobs: {
      'jee-main::mathematics::Calculus::Integration': { status: 'done', saved: 10, duplicates: 0, at: 1 },
      'jee-main::mathematics::Algebra::Sets': { status: 'error', error: 'No questions array in model JSON', at: 2 },
    },
    questions: [{ text: 'A long stem '.repeat(20), chapter: 'Integration', subject: 'mathematics' }],
  },
  { running: { examId: 'jee-main', subject: 'mathematics', chapter: 'Integration', jobIndex: 1, jobCount: 2, generatingIndex: 4, generatingOf: 10, phase: 'calling-gemini' }, log: [{ t: 1, text: 'hello' }] },
)
assert.equal(snap.totals.done, 1)
assert.equal(snap.totals.error, 1)
assert.equal(snap.totals.drafts, 1)
assert.equal(snap.current.generatingIndex, 4)
assert.ok(snap.lastStem.endsWith('…'))
assert.equal(stemPreview('short'), 'short')
assert.ok(!('questions' in snap))

const { decodeUtf8OrUtf16, writeUtf8RepairUtf16, readJsonFileUtf8OrUtf16 } = await import(
  '../server/readJsonFile.js'
)
const utf16Payload = Buffer.from('{"ok":true,"n":3}', 'utf16le')
assert.equal(utf16Payload[1], 0)
assert.deepEqual(JSON.parse(decodeUtf8OrUtf16(utf16Payload)), { ok: true, n: 3 })

const { mkdtempSync, rmSync } = await import('node:fs')
const { tmpdir } = await import('node:os')
const tmpDir = mkdtempSync(join(tmpdir(), 'scq-utf16-'))
const tmpFile = join(tmpDir, 'trial.json')
writeUtf8RepairUtf16(tmpFile, JSON.stringify({ questions: [{ id: 'uq-1', bankStatus: 'draft' }] }))
const roundTrip = readJsonFileUtf8OrUtf16(tmpFile)
assert.equal(roundTrip.questions[0].id, 'uq-1')
rmSync(tmpDir, { recursive: true, force: true })

const { buildMetaTagCountIndex } = await import('../src/utils/syllabusMeta.js')
const index = buildMetaTagCountIndex([
  { subject: 'mathematics', section: 'Calculus', chapter: 'Integration', topic: 'Parts' },
  { subject: 'mathematics', section: 'Calculus', chapter: 'Integration', topic: 'Parts' },
  { subject: 'physics', section: 'Mechanics', chapter: 'Kinematics', topic: '1D motion' },
])
assert.equal(index.subject('mathematics'), 2)
assert.equal(index.chapter('mathematics', 'Calculus', 'Integration'), 2)
assert.equal(index.topic('mathematics', 'Calculus', 'Integration', 'Parts'), 2)
assert.equal(index.subject('physics'), 1)

assert.deepEqual(toughnessQuotaForCount(10), { easy: 4, moderate: 3, tough: 3 })
const plan10 = plannedToughnessLevels(10)
assert.equal(plan10.length, 10)
assert.equal(plan10.filter((t) => t >= 1 && t <= 3).length, 4)
assert.equal(plan10.filter((t) => t >= 4 && t <= 7).length, 3)
assert.equal(plan10.filter((t) => t >= 8 && t <= 10).length, 3)
assert.ok(new Set(plan10.filter((t) => t <= 3)).size >= 2, 'Easy band should rotate T1/T2/T3')
assert.ok(PYQ_STYLE_YEARS.includes(2024))

const tenPayload = {
  questions: Array.from({ length: 10 }, (_, i) => ({
    stem: `Stem ${i + 1} for mix check $\\int x\\,dx$?`,
    options: ['$1$', '$2$', '$3$', '$4$'],
    correctIndex: 0,
    solution: 'Short working.',
    toughness: 5,
    topic: 'Substitution',
  })),
}
const scqOnlyJob = { ...job, count: 10, typeMix: ['single_correct'] }
const mixed = parseAndValidateScqTrialResponse(tenPayload, scqOnlyJob)
assert.equal(mixed.questions.length, 10)
assert.equal(mixed.questions.filter((q) => q.toughness >= 1 && q.toughness <= 3).length, 4)
assert.equal(mixed.questions.filter((q) => q.toughness >= 4 && q.toughness <= 7).length, 3)
assert.equal(mixed.questions.filter((q) => q.toughness >= 8 && q.toughness <= 10).length, 3)

const pyqJob = {
  ...job,
  examId: 'jee-main',
  pyqStyle: true,
  pyqYear: 2024,
  pyqDate: '2024-01-27',
  pyqShift: 2,
}
const pyqParsed = parseAndValidateScqTrialResponse(tenPayload, { ...pyqJob, count: 10 })
assert.equal(pyqParsed.questions.length, 10)
assert.ok(
  pyqParsed.questions.every((q) => q.toughness === 5),
  'PYQ batches keep actual toughness; do not force 4+3+3 mix',
)
const pyqDraft = trialItemToPyqBankItem(pyqParsed.questions[0], pyqJob, {
  now: 1700000000099,
  index: 0,
})
assert.equal(pyqDraft.source, 'PYQ-style (AI)')
assert.equal(pyqDraft.bankSource, 'pyq_style_ai')
assert.equal(pyqDraft.pyqYear, 2024)
assert.equal(pyqDraft.pyqDate, '2024-01-27')
assert.equal(pyqDraft.pyqShift, 2)
assert.equal(pyqDraft.pyqStyle, true)
assert.equal(pyqDraft.officialPyq, false)
assert.equal(pyqDraft.imported, false)
assert.deepEqual(pyqDraft.examIds, ['jee-main'])
assert.equal(pyqDraft.examPatternId, 'jee-main')
assert.match(String(pyqDraft.paperLabel), /2024/)
assert.notEqual(pyqDraft.bankSource, 'pyq')

const { isOfficialPyq, isPyqStyleAi, isSimilarToPyq, pyqProvenanceLabel } = await import('../src/utils/pyqDetect.js')
const { pyqPaperKey, geminiPyqJobIsReady } = await import('../src/utils/pyqSlotMeta.js')
assert.equal(isPyqStyleAi(pyqDraft), true)
assert.equal(isOfficialPyq(pyqDraft), false)
assert.equal(pyqProvenanceLabel(pyqDraft), 'PYQ-style (AI)')
assert.equal(pyqPaperKey(pyqDraft), 'jee-main:2024:2024-01-27:s2')
assert.equal(geminiPyqJobIsReady({ examId: 'jee-main', pyqYear: 2024 }).ok, false)
assert.equal(
  geminiPyqJobIsReady({ examId: 'jee-main', pyqYear: 2024, pyqDate: '2024-01-27', pyqShift: 2 }).ok,
  true,
)
assert.equal(
  pyqProvenanceLabel({ bankSource: 'official_pyq', imported: true, pyqYear: 2023 }),
  'Official PYQ',
)
assert.equal(pyqProvenanceLabel({ bankSource: 'pyq', imported: true }), 'Official PYQ')

const advPyq = trialItemToPyqBankItem(
  pyqParsed.questions[1],
  { ...job, examId: 'jee-advanced', pyqStyle: true, pyqYear: 2023, pyqSession: 'Paper 1' },
  { now: 1700000000101, index: 1 },
)
assert.equal(advPyq.pyqSession, 'Paper 1')
assert.equal(pyqPaperKey(advPyq), 'jee-advanced:2023:p1')
assert.equal(advPyq.officialPyq, false)

const {
  buildSimilarFromPyqPrompt,
  clampSimilarFromPyqCount,
  clampSimilarToPyqToughness,
  resolveTrialJobFromSeed,
  stemCopiesSeed,
} = await import('../src/utils/geminiScqTrial.js')

assert.equal(clampSimilarFromPyqCount(3), 3)
assert.equal(clampSimilarFromPyqCount(5), 5)
assert.equal(clampSimilarFromPyqCount(10), 3)
assert.equal(clampSimilarToPyqToughness(3, 6), 6, 'never easier than seed')
assert.equal(clampSimilarToPyqToughness(7, 6), 7, 'one step higher ok')
assert.equal(clampSimilarToPyqToughness(9, 6), 7, 'cap at seed+1')
assert.equal(clampSimilarToPyqToughness(10, 10), 10)

const seedJob = resolveTrialJobFromSeed(
  {
    id: 'opyq-1',
    text: 'If $f(x)=\\sin x$ then $f\'(0)$ equals which value in this original stem about 2024 paper?',
    subject: 'Mathematics',
    chapter: 'Integration',
    topic: 'Substitution',
    questionType: 'single_correct',
    toughnessLevel: 6,
    examPatternId: 'jee-advanced',
    pyqYear: 2024,
  },
  { exam: 'jee-advanced', year: 2024, session: 'Paper 1' },
)
assert.equal(seedJob.similarFromPyq, true)
assert.equal(seedJob.examId, 'jee-advanced')
assert.equal(seedJob.subject, 'mathematics')
assert.equal(seedJob.chapter, 'Integration')
assert.equal(seedJob.seedToughness, 6)
assert.ok(seedJob.seedStem.includes('sin'))

const similarPrompt = buildSimilarFromPyqPrompt({ ...seedJob, count: 3 })
assert.match(similarPrompt, /exactly 3/)
assert.match(similarPrompt, /AI similar/)
assert.match(similarPrompt, /NEVER label them Official PYQ/i)
assert.match(similarPrompt, /NEVER copy/i)
assert.match(similarPrompt, /T6 or T7/)
assert.match(similarPrompt, /Do NOT use a 40\/30\/30/)
assert.doesNotMatch(similarPrompt, /Easy 40%/)

const copyStem =
  'If $f(x)=\\sin x$ then $f\'(0)$ equals which value in this original stem about 2024 paper?'
assert.equal(stemCopiesSeed(copyStem, seedJob.seedStem), true)
assert.equal(stemCopiesSeed('A different original integral $\\int e^{2x}\\,dx$ equals:', seedJob.seedStem), false)

const similarPayload = {
  questions: [
    {
      stem: 'The value of $\\int_0^2 3x^{2}\\,dx$ is which of the following?',
      options: ['$2$', '$8$', '$4$', '$6$'],
      correctIndex: 1,
      solution: 'Antiderivative $x^3$ from 0 to 2 is $8$.',
      toughness: 2,
      topic: 'Substitution',
    },
    {
      stem: copyStem,
      options: ['$0$', '$1$', '$2$', '$3$'],
      correctIndex: 1,
      solution: 'Copied seed must be dropped.',
      toughness: 6,
      topic: 'Substitution',
    },
    {
      stem: 'Evaluate $\\int_1^e \\frac{1}{x}\\,dx$ for this new original wording.',
      options: ['$0$', '$1$', '$e$', '$2$'],
      correctIndex: 1,
      solution: 'Ln e minus ln 1 is 1.',
      toughness: 9,
      topic: 'Substitution',
    },
  ],
}
const similarParsed = parseAndValidateScqTrialResponse(similarPayload, {
  ...seedJob,
  count: 3,
  similarFromPyq: true,
})
assert.equal(similarParsed.questions.length, 2, 'drop copied seed stem')
assert.ok(similarParsed.questions.every((q) => q.toughness === 6 || q.toughness === 7))
assert.ok(!similarParsed.questions.some((q) => q.toughness < 6))

const similarDraft = trialItemToBankDraft(similarParsed.questions[0], seedJob, {
  now: 1700000000200,
  index: 0,
})
const founderSimilar = trialItemToBankDraft(similarParsed.questions[0], {
  ...seedJob,
  seedId: 'MAQS2345A2024',
}, {
  now: 1700000000201,
  index: 0,
  variantIndex: 2,
})
assert.equal(founderSimilar.id, 'MAQS2345A2024C2')
assert.equal(similarDraft.id, 'opyq-1C1')
assert.equal(similarDraft.bankStatus, 'draft')
assert.equal(similarDraft.source, 'AI similar')
assert.equal(similarDraft.bankSource, 'ai_similar')
assert.equal(similarDraft.similarToPyq, true)
assert.equal(similarDraft.officialPyq, false)
assert.equal(similarDraft.pyqStyle, false)
assert.equal(similarDraft.imported, false)
assert.notEqual(similarDraft.bankStatus, 'published')
assert.equal(isSimilarToPyq(similarDraft), true)
assert.equal(isOfficialPyq(similarDraft), false)
assert.equal(isPyqStyleAi(similarDraft), false)
assert.equal(pyqProvenanceLabel(similarDraft), 'AI similar')

const neetPyq = trialItemToPyqBankItem(
  pyqParsed.questions[2],
  { ...job, examId: 'neet', subject: 'biology', pyqStyle: true, pyqYear: 2024 },
  { now: 1700000000102, index: 2 },
)
assert.equal(neetPyq.pyqYear, 2024)
assert.equal(pyqPaperKey(neetPyq), 'neet:2024')

const advDraft = trialItemToBankDraft(mixed.questions[1], { ...job, examId: 'jee-advanced' }, {
  now: 1700000000100,
  index: 1,
})
assert.deepEqual(advDraft.examIds, ['jee-advanced'])
assert.equal(advDraft.source, GEMINI_TRIAL_SOURCE)

assert.equal(clampTrialCount(10), 10)
assert.equal(clampTrialCount(20), 20)
assert.equal(clampTrialCount(25), 25)
assert.equal(clampTrialCount(50), 50)
assert.equal(clampTrialCount(51), 50)
assert.equal(clampTrialCount(0), 1)
assert.equal(validateTrialCount('').ok, false)
assert.equal(validateTrialCount(30).ok, true)
assert.equal(validateTrialCount(30).count, 30)
assert.equal(resolveTrialCount('20').count, 20)
assert.equal(resolveTrialCount('25').count, 25)
assert.equal(resolveTrialCount(TRIAL_COUNT_CUSTOM, 18).count, 18)
assert.equal(resolveTrialCount(TRIAL_COUNT_CUSTOM, 0).ok, false)
assert.equal(resolveTrialCount(TRIAL_COUNT_CUSTOM, 55).ok, false)

const plan20 = planTrialQuestionTypes('jee-main', 20, 'all')
assert.equal(
  plan20.reduce((sum, s) => sum + (s.subCount ?? 1), 0),
  20,
  '20-question plan totals 20 scored items',
)
const plan25 = planTrialQuestionTypes('jee-advanced', 25, 'all')
assert.equal(
  plan25.reduce((sum, s) => sum + (s.subCount ?? 1), 0),
  25,
  '25-question plan totals 25 scored items',
)

const mainPlan = planTrialQuestionTypes('jee-main', 10, 'all')
assert.equal(mainPlan.filter((s) => s.type === 'single_correct').length, 8)
assert.equal(mainPlan.filter((s) => s.type === 'numerical').length, 2)

const advPlan = planTrialQuestionTypes('jee-advanced', 10, 'all')
assert.ok(advPlan.some((s) => s.type === 'multiple_correct'))
assert.ok(advPlan.some((s) => s.type === 'matrix_match'))
assert.ok(advPlan.some((s) => s.type === 'passage_scq'))

const msqJob = { ...job, examId: 'jee-advanced', count: 1, typeMix: ['multiple_correct'] }
const msqParsed = parseAndValidateScqTrialResponse(
  {
    questions: [
      {
        questionType: 'multiple_correct',
        stem: 'Which of the following are even?',
        options: ['$2$', '$3$', '$4$', '$5$'],
        correctIndices: [0, 2],
        solution: '2 and 4 are even.',
        toughness: 5,
        topic: 'Substitution',
      },
    ],
  },
  msqJob,
)
assert.equal(msqParsed.questions.length, 1)
assert.deepEqual(msqParsed.questions[0].correctIndices, [0, 2])
const msqDraft = trialItemToBankDraft(msqParsed.questions[0], msqJob, { now: 1700000000300, index: 0 })
assert.equal(msqDraft.questionType, 'multiple_correct')
assert.ok(msqDraft.msqMarking)

const intJob = { ...job, count: 1, typeMix: ['integer'] }
const intParsed = parseAndValidateScqTrialResponse(
  {
    questions: [
      {
        questionType: 'integer',
        stem: 'The value of $2+2$ is:',
        correctInteger: 4,
        solution: 'Add.',
        toughness: 2,
        topic: 'Substitution',
      },
    ],
  },
  intJob,
)
assert.equal(intParsed.questions[0].correctInteger, 4)
const intDraft = trialItemToBankDraft(intParsed.questions[0], intJob, { now: 1700000000301, index: 0 })
assert.equal(intDraft.questionType, 'integer')
assert.equal(intDraft.correctInteger, 4)
assert.equal(intDraft.options, undefined)

const passageParsed = parseAndValidateScqTrialResponse(
  {
    questions: [
      {
        questionType: 'passage_scq',
        passageText: 'A particle moves with constant velocity along a line.',
        subQuestions: [
          {
            text: 'Speed is measured in:',
            options: ['$\\text{m/s}$', '$\\text{N}$', '$\\text{J}$', '$\\text{Pa}$'],
            correctIndex: 0,
          },
          {
            text: 'Velocity is a:',
            options: ['Scalar', 'Vector', 'Tensor', 'Unitless'],
            correctIndex: 1,
          },
        ],
        solution: 'Basic kinematics.',
        toughness: 4,
        topic: 'Substitution',
      },
    ],
  },
  { ...job, count: 2, typeMix: ['passage_scq'] },
)
assert.equal(passageParsed.questions.length, 1)
const passageRows = trialItemToBankDrafts(passageParsed.questions[0], job, {
  now: 1700000000302,
  index: 0,
})
assert.equal(passageRows.length, 2)
assert.ok(passageRows[0].passageText)
assert.equal(passageRows[1].passageId, passageRows[0].id)

assert.match(trialTypeMixLabel('jee-main', 'all'), /JEE Main/)

const mathsJobs = listTrialChapters('jee-main', 'mathematics')
assert.ok(mathsJobs.length >= 10)
const calcUnit = mathsJobs.find((j) => j.section === 'Calculus')?.section ?? mathsJobs[0].section
const wholeSubject = resolveTrialJobs('jee-main', 'mathematics', {})
assert.equal(wholeSubject.length, mathsJobs.length)
const wholeUnit = resolveTrialJobs('jee-main', 'mathematics', { section: calcUnit })
assert.ok(wholeUnit.length >= 1)
assert.ok(wholeUnit.every((j) => j.section === calcUnit))
const oneChapter = wholeUnit[0]?.chapter
const picked = resolveTrialJobs('jee-main', 'mathematics', {
  section: calcUnit,
  chapters: [oneChapter],
})
assert.equal(picked.length, 1)
assert.equal(picked[0].chapter, oneChapter)
assert.match(
  trialSelectionScopeLabel({ section: calcUnit, chapters: [oneChapter] }, picked, 'mathematics'),
  /1 selected chapter/,
)
assert.match(
  trialSelectionScopeLabel({ section: calcUnit }, wholeUnit, 'mathematics'),
  /whole unit/,
)
assert.match(trialSelectionScopeLabel({}, wholeSubject, 'mathematics'), /whole Mathematics/)

const numParsed = parseAndValidateScqTrialResponse(
  {
    questions: [
      {
        questionType: 'numerical',
        stem: 'Value of $\\pi$ to one decimal:',
        correctNumerical: 3.1,
        solution: 'Approximate.',
        toughness: 3,
        topic: 'Substitution',
      },
    ],
  },
  { ...job, count: 1, typeMix: ['numerical'] },
)
assert.equal(numParsed.questions[0].correctNumerical, 3.1)

const matrixParsed = parseAndValidateScqTrialResponse(
  {
    questions: [
      {
        questionType: 'matrix_match',
        stem: 'Match Column I with Column II:',
        matrixRows: ['$\\sin x$', '$\\cos x$', '$\\tan x$', '$\\cot x$'],
        matrixCols: ['Odd', 'Even', 'Neither', 'Periodic'],
        matrixAnswerKey: { 0: [0], 1: [1], 2: [0], 3: [0] },
        solution: 'Trig parity.',
        toughness: 6,
        topic: 'Substitution',
      },
    ],
  },
  { ...job, count: 1, typeMix: ['matrix_match'] },
)
assert.equal(matrixParsed.questions.length, 1)
assert.equal(matrixParsed.questions[0].matrixRows.length, 4)

const tfParsed = parseAndValidateScqTrialResponse(
  {
    questions: [
      {
        questionType: 'true_false',
        stem: 'Every even integer is divisible by 2.',
        options: ['TRUE', 'FALSE'],
        correctIndex: 0,
        solution: 'Definition of even.',
        toughness: 1,
        topic: 'Substitution',
      },
    ],
  },
  { ...job, count: 1, typeMix: ['true_false'] },
)
assert.equal(tfParsed.questions[0].questionType, 'true_false')

console.log('test-gemini-scq-trial: ok')
