import { buildUploadedTest, loadPublishedUploadedQuestions } from '../utils/questionBank.js'
import { loadCustomTests } from '../utils/customTests.js'
import { repairPassageLinksInQuestions, dedupeQuestionsForExam, refreshTestQuestionsFromBank } from '../utils/testQuestionClone.js'
import { getPracticeTestById } from '../utils/practiceTest.js'
import { getDrillTestById } from '../utils/todaysDrillStore.js'
import { getSheetTestById } from '../utils/dailyPracticeSheet.js'
import { getPlacementTestById } from '../utils/placementCheck.js'
import { getSpeedTestById } from '../utils/speedTestSession.js'
import { getCdfTestById } from '../utils/cdfTestSession.js'
import { getStudentMockTestById } from '../utils/studentMockSession.js'
import { getPyqTestById } from '../utils/pyqTests.js'
import { getPyqStudyTestById } from '../utils/pyqStudentSession.js'
import { getAnswerableQuestions } from '../utils/passage.js'
import { computeTestDuration } from '../utils/testConfig.js'
import { buildCalibratedTestFromPool } from '../utils/buildCalibratedTest.js'
import { stripCdfOnlyQuestionsFromNonCdfTest } from '../utils/cdfOnlyQuestions.js'

/** @typedef {'physics' | 'chemistry' | 'mathematics' | 'botany' | 'zoology' | 'biology'} Subject */
/** @typedef {import('./questionTypes').QuestionTypeId} QuestionTypeId */

/**
 * @typedef {Object} Question
 * @property {string} id
 * @property {Subject} subject
 * @property {QuestionTypeId} [questionType]
 * @property {string} text
 * @property {string[]} [options]
 * @property {number} [correctIndex]
 * @property {number[]} [correctIndices]
 * @property {number} [correctInteger]
 * @property {number} [correctNumerical]
 * @property {number} [numericalTolerance]
 * @property {string[]} [matrixRows] Column I — rows A–D
 * @property {string[]} [matrixCols] Column II — match entries (text)
 * @property {string[]} [matrixColLabels] Column II headers — P,Q,R,S,T or (1)…(5)
 * @property {'grid' | 'options'} [matrixResponseMode] grid 4×4/4×5 or options A–D
 * @property {Record<number, number | number[]>} [matrixAnswerKey] row → col index(es)
 * @property {string} [passageId]
 * @property {string} [passageText]
 * @property {string} [passageImage] data URL — shared passage diagram (not stem)
 * @property {boolean} [passageImageCrop] true when passageImage is a diagram crop (show text beside it)
 * @property {boolean} [isPassageHeader]
 * @property {import('./questionTypes').MarkingScheme} [marking]
 * @property {import('../utils/msqMarking').MsqMarkingScheme} [msqMarking]
 * @property {string} [section]
 * @property {string} [chapter]
 * @property {string} [topic]
 * @property {string[]} [examIds] JEE Main, NEET, etc. — multi-select tags
 * @property {number} [toughnessLevel] Difficulty 1 (easiest) – 10 (hardest)
 * @property {string} [source] Book name, coaching material, or PYQ exam label
 * @property {string} [solution]
 * @property {string} [videoSolution]
 * @property {'text' | 'hybrid'} [contentMode]
 * @property {string} [questionImage] data URL — question stem image
 * @property {boolean} [stemImageCrop] true when image is a stem/diagram crop (always show in tests)
 * @property {boolean} [stemTextInImage] hide duplicate stem text when wording is inside questionImage
 * @property {string} [optionsImage] data URL — all options in one image
 * @property {string[]} [optionImages] data URLs — one per option (A, B, …)
 * @property {string} [solutionImage] data URL — solution image for review
 * @property {'offline' | 'pending' | 'live' | 'failed'} [syncStatus] online bank sync state
 * @property {number} [serverSyncedAt] when last pushed to server
 * @property {string} [syncError] last sync failure message
 * @property {number} [savedAt] when first saved to bank (ms)
 * @property {number} [updatedAt] when last edited (ms)
 * @property {string} [uploadedById] teacher / operator login id
 * @property {string} [uploadedByName] teacher / operator display name
 * @property {string} [uploadedByRole] admin | teacher | user
 * @property {'draft' | 'published'} [bankStatus] draft until published; missing status is treated as draft
 * @property {string} [duplicateOfId] original question id when this row is a possible-duplicate draft
 * @property {number} [duplicateSimilarity] 0–1 score vs the original when duplicateOfId is set
 * @property {'exact' | 'similar'} [duplicateMatch] how the stem was matched to the original
 * @property {number} [publishedAt] when published to bank (ms)
 * @property {string} [publishedById] who published
 * @property {string} [publishedByName] publisher display name
 * @property {boolean} [silentPublish] published without student-facing announcement
 * @property {boolean} [removedFromTeacherBank] teacher soft-deleted from private bank; stays in main if published
 * @property {import('../utils/questionBankHistory.js').QuestionHistoryEntry[]} [updateHistory] modification log
 * @property {number} [answerConfidence] 0–100 when the correct answer was scored (OCR/paper/AI)
 * @property {number} [solutionConfidence] 0–100 when the solution was scored
 * @property {number} [uploadFieldConfidence] overall OCR/upload score 0–100
 * @property {boolean} [uploadNeedsManualCheck]
 * @property {number} [generationConfidence] model generation score 0–100 (Gemini trial drafts)
 * @property {{ overall?: number, fields?: { stem?: number, options?: number, answer?: number, solution?: number, meta?: number }, optionScores?: number[], generation?: number, needsManualCheck?: boolean, lowConfidenceFields?: string[] }} [fieldConfidence]
 */

/**
 * @typedef {Object} Test
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {string} examPatternId
 * @property {string} testTypeId
 * @property {number} durationMinutes
 * @property {number} [speedDurationMinutes] Precision Speed Test — chosen duration (15/30/45/60)
 * @property {number} [cdfDurationMinutes] CDF Test — chosen time slot (15/30)
 * @property {number} [cdfPlannedQuestionCount] CDF Test — AI planned question count
 * @property {number} totalQuestions
 * @property {string} [chapter]
 * @property {string} [paperPatternId]
 * @property {import('./examPatterns').QuestionTypeSlot[]} [paperBlueprint]
 * @property {import('../utils/syllabusMeta').SyllabusSelection} [syllabusFilter]
 * @property {{ examPatternId?: string, syllabus?: import('../utils/practiceTest').PracticeSyllabus, sourcePoolSize?: number }} [practiceMeta]
 * @property {Question[]} questions
 * @property {import('../utils/adaptiveTest.js').CalibratedMeta} [calibratedMeta]
 * @property {boolean} [antiCheatShuffle] Per-student question + option shuffle (default on; off for practice)
 * @property {'draft' | 'published'} [status] draft = teacher only; published = students can take
 * @property {number} [publishedAt] ms timestamp when published
 * @property {number} [qualityScore] Test Quality Score 0–100 at publish time
 * @property {number} [publishVersion] Increments on each publish (grading integrity)
 * @property {import('../utils/paperPublish.js').ReturnType<import('../utils/paperPublish.js').computeQualityBreakdown>} [qualityBreakdown]
 * @property {import('../utils/paperPublish.js').ReturnType<import('../utils/paperPublish.js').analyzeDifficultyProfile>} [difficultyProfile]
 * @property {string[]} [questionIds] Snapshot of answerable question ids at publish
 */

/**
 * @typedef {Object} CalibratedMeta
 * @property {string[]} subjectOrder
 * @property {number} questionsPerSection
 * @property {Record<string, number>} [questionsPerSectionBySubject] per-subject Q quota from exam pattern
 * @property {Record<string, { easy: Question[], medium: Question[], hard: Question[] }>} pools
 * @property {Question[]} [sourcePool]
 * @property {string[]} deliveredIds
 * @property {string[]} [deliveredBankIds]
 * @property {{ subjectId: string, difficulty: import('../utils/adaptiveTest.js').DifficultyBand | null }[]} sectionPlan
 * @property {'item' | 'section'} [adaptiveMode]
 * @property {Record<string, number>} [abilityBySubject] live ability 1–10 per subject
 * @property {Record<string, number>} [sectionItemsDelivered] items delivered per subject so far
 * @property {import('../utils/aiAdaptiveEngine.js').AdaptiveItemRecord[]} [itemHistory]
 * @property {string[]} [gradedDeliveredIds]
 * @property {object} [aiPickReport]
 */

/** @param {Omit<Question, 'questionType'>[]} list @param {QuestionTypeId} [type] */
function tagMcq(list, type = 'single_correct') {
  return list.map((q) => ({ questionType: type, ...q }))
}

const JEE_PCM = tagMcq([
  {
    id: 'p1',
    subject: 'physics',
    chapter: 'Kinematics',
    text: 'Velocity $v = 3t^2 - 2t$. Acceleration at $t = 2\\,\\text{s}$ is:',
    options: ['$8\\,\\text{m/s}^2$', '$10\\,\\text{m/s}^2$', '$12\\,\\text{m/s}^2$', '$14\\,\\text{m/s}^2$'],
    correctIndex: 1,
  },
  {
    id: 'p2',
    subject: 'physics',
    chapter: 'Thermodynamics',
    text: 'For an ideal gas, which stays constant in isothermal expansion?',
    options: ['Pressure', 'Volume', 'Temperature', 'Density'],
    correctIndex: 2,
  },
  {
    id: 'p3',
    subject: 'physics',
    chapter: 'Optics',
    text: 'Power of a convex lens with $f = 20\\,\\text{cm}$ is:',
    options: ['$+5\\,\\text{D}$', '$-5\\,\\text{D}$', '$+0.05\\,\\text{D}$', '$-0.05\\,\\text{D}$'],
    correctIndex: 0,
  },
  {
    id: 'c1',
    subject: 'chemistry',
    chapter: 'Atomic Structure',
    text: 'Radial nodes in $3p$ orbital:',
    options: ['0', '1', '2', '3'],
    correctIndex: 1,
  },
  {
    id: 'c2',
    subject: 'chemistry',
    chapter: 'Chemical Bonding',
    text: 'Highest dipole moment among:',
    options: ['$\\text{CO}_2$', '$\\text{BF}_3$', '$\\text{NH}_3$', '$\\text{CH}_4$'],
    correctIndex: 2,
  },
  {
    id: 'c3',
    subject: 'chemistry',
    chapter: 'Electrochemistry',
    text: 'Oxidation in a galvanic cell occurs at the:',
    options: ['Anode', 'Cathode', 'Salt bridge', 'Both electrodes'],
    correctIndex: 0,
  },
  {
    id: 'm1',
    subject: 'mathematics',
    chapter: 'Quadratic Equations',
    text: 'Sum of roots of $x^2 - 5x + 6 = 0$:',
    options: ['5', '6', '-5', '-6'],
    correctIndex: 0,
  },
  {
    id: 'm2',
    subject: 'mathematics',
    chapter: 'Calculus',
    text: 'Derivative of $\\sin^2 x$ is:',
    options: ['$\\sin 2x$', '$2\\sin x$', '$\\cos^2 x$', '$-\\sin 2x$'],
    correctIndex: 0,
  },
  {
    id: 'm3',
    subject: 'mathematics',
    chapter: 'Probability',
    text: 'Probability of even number on one fair die roll:',
    options: ['$1/6$', '$1/3$', '$1/2$', '$2/3$'],
    correctIndex: 2,
  },
])

const JEE_ADV_MIXED = [
  {
    id: 'adv-sc',
    subject: 'physics',
    questionType: 'single_correct',
    text: 'Which quantity has the dimensions of $ML^2T^{-2}$?',
    options: ['Force', 'Energy', 'Power', 'Pressure'],
    correctIndex: 1,
  },
  {
    id: 'adv-msq',
    subject: 'chemistry',
    questionType: 'multiple_correct',
    text: 'Which of the following are polar molecules?',
    options: ['$\\text{H}_2\\text{O}$', '$\\text{CO}_2$', '$\\text{NH}_3$', '$\\text{CCl}_4$'],
    correctIndices: [0, 2],
    msqMarking: {
      full: 4,
      partial1: 1,
      partial2: 2,
      partial3: 3,
      wrongAny: -2,
      unattempted: 0,
    },
  },
  {
    id: 'adv-matrix',
    subject: 'mathematics',
    questionType: 'matrix_match',
    text: 'Match the entries in Column I with Column II:',
    matrixRows: ['$\\sin x$', '$\\cos x$', '$\\tan x$', '$\\sec x$'],
    matrixCols: ['Odd function', 'Even function', 'Neither', 'Periodic'],
    matrixColLabels: ['P', 'Q', 'R', 'S'],
    matrixResponseMode: 'grid',
    matrixAnswerKey: { 0: [0], 1: [1], 2: [0], 3: [0, 3] },
  },
  {
    id: 'adv-int',
    subject: 'mathematics',
    questionType: 'integer',
    text: 'If $f(x) = x^2 - 4x + 3$, the sum of roots is:',
    correctInteger: 4,
  },
  {
    id: 'adv-num',
    subject: 'physics',
    questionType: 'numerical',
    text: 'A body falls $5\\,\\text{m}$ under gravity ($g = 10\\,\\text{m/s}^2$). Time in seconds is:',
    correctNumerical: 1,
    numericalTolerance: 0.05,
  },
  {
    id: 'adv-pass-1',
    subject: 'biology',
    questionType: 'single_correct',
    passageText:
      'Photosynthesis converts light energy into chemical energy. Chlorophyll in chloroplasts absorbs red and blue light most efficiently.',
    text: 'Primary pigment for photosynthesis:',
    options: ['Carotene', 'Chlorophyll', 'Xanthophyll', 'Anthocyanin'],
    correctIndex: 1,
  },
  {
    id: 'adv-pass-2',
    subject: 'biology',
    questionType: 'single_correct',
    passageId: 'adv-pass-1',
    text: 'Site of photosynthesis in plant cells:',
    options: ['Mitochondria', 'Chloroplast', 'Nucleus', 'Ribosome'],
    correctIndex: 1,
  },
]

const NEET_PCB = tagMcq([
  {
    id: 'np1',
    subject: 'physics',
    chapter: 'Mechanics',
    text: 'SI unit of force is:',
    options: ['Joule', 'Newton', 'Watt', 'Pascal'],
    correctIndex: 1,
  },
  {
    id: 'np2',
    subject: 'physics',
    chapter: 'Waves',
    text: 'Speed of sound in air at room temperature is about:',
    options: ['$330\\,\\text{m/s}$', '$3\\,\\text{m/s}$', '$3000\\,\\text{m/s}$', '$33\\,\\text{m/s}$'],
    correctIndex: 0,
  },
  {
    id: 'nc1',
    subject: 'chemistry',
    chapter: 'Mole Concept',
    text: 'Number of moles in $44\\,\\text{g}$ of $\\text{CO}_2$ (molar mass $44\\,\\text{g/mol}$):',
    options: ['0.5', '1', '2', '44'],
    correctIndex: 1,
  },
  {
    id: 'nc2',
    subject: 'chemistry',
    chapter: 'Organic',
    text: 'General formula of alkanes:',
    options: ['$C_nH_{2n}$', '$C_nH_{2n+2}$', '$C_nH_{2n-2}$', '$C_nH_n$'],
    correctIndex: 1,
  },
  {
    id: 'nb1',
    subject: 'biology',
    chapter: 'Cell Biology',
    text: 'Powerhouse of the cell is:',
    options: ['Nucleus', 'Mitochondria', 'Ribosome', 'Golgi body'],
    correctIndex: 1,
  },
  {
    id: 'nb2',
    subject: 'biology',
    chapter: 'Genetics',
    text: 'DNA replication is:',
    options: ['Conservative', 'Semi-conservative', 'Dispersive', 'Random'],
    correctIndex: 1,
  },
  {
    id: 'nb3',
    subject: 'biology',
    chapter: 'Human Physiology',
    text: 'Insulin is secreted by:',
    options: ['Liver', 'Pancreas', 'Kidney', 'Thyroid'],
    correctIndex: 1,
  },
  {
    id: 'nb4',
    subject: 'biology',
    chapter: 'Ecology',
    text: 'Primary producer in most ecosystems:',
    options: ['Fungi', 'Plants', 'Bacteria only', 'Animals'],
    correctIndex: 1,
  },
  {
    id: 'nb5',
    subject: 'biology',
    chapter: 'Plant Physiology',
    text: 'Photosynthesis occurs mainly in:',
    options: ['Roots', 'Chloroplasts', 'Mitochondria', 'Nucleus'],
    correctIndex: 1,
  },
])

/**
 * @param {Object} cfg
 * @returns {Test}
 */
function makeTest(cfg) {
  const answerable = getAnswerableQuestions(cfg.questions)
  const n = answerable.length
  return {
    ...cfg,
    isSample: cfg.isSample !== false,
    catalogKind: cfg.catalogKind ?? 'sample',
    totalQuestions: n,
    durationMinutes: computeTestDuration(cfg.examPatternId, cfg.testTypeId, n, undefined, cfg.questions),
  }
}

const CALIBRATED_JEE_MAIN = (() => {
  const t = buildCalibratedTestFromPool(JEE_PCM, 'jee-main', {
    questionsPerSection: 3,
    title: 'JEE Main — Sample calibrated paper',
  })
  return t ? { ...t, isSample: true, catalogKind: 'sample' } : t
})()

/** @type {Test[]} */
export const builtInTests = [
  makeTest({
    id: 'jee-main-chapter-kinematics',
    title: 'JEE Main — Chapter Proficiency (Kinematics)',
    description: 'Sample NTA-style chapter paper · PCM · not an official NTA paper.',
    examPatternId: 'jee-main',
    testTypeId: 'chapter',
    chapter: 'Mixed chapters (sample)',
    questions: JEE_PCM,
  }),
  makeTest({
    id: 'jee-main-part-pcm',
    title: 'JEE Main — Subject Proficiency (PCM)',
    description: 'Sample NTA-style subject paper · multi-chapter PCM · not an official NTA paper.',
    examPatternId: 'jee-main',
    testTypeId: 'part',
    questions: JEE_PCM,
  }),
  makeTest({
    id: 'jee-main-full-demo',
    title: 'JEE Main — Comprehensive Mock (Sample)',
    description: 'Sample NTA-style full mock (short set) — not an official NTA paper.',
    examPatternId: 'jee-main',
    testTypeId: 'full',
    questions: JEE_PCM,
  }),
  makeTest({
    id: 'jee-main-speed',
    title: 'JEE Main — Precision Speed Test',
    description: 'Sample speed paper · tighter timer per question · not an official NTA paper.',
    examPatternId: 'jee-main',
    testTypeId: 'speed',
    questions: JEE_PCM,
  }),
  makeTest({
    id: 'jee-advanced-chapter',
    title: 'JEE Advanced — Chapter Proficiency',
    description: 'Sample Advanced-style chapter paper · +3 / −1 marking · not an official paper.',
    examPatternId: 'jee-advanced',
    testTypeId: 'chapter',
    questions: tagMcq(JEE_PCM.slice(0, 6)),
  }),
  makeTest({
    id: 'jee-advanced-all-types',
    title: 'JEE Advanced — All Question Types (Sample)',
    description: 'Sample paper to try MCQ, MSQ, Matrix, Integer, Numerical, Passage — not an official paper.',
    examPatternId: 'jee-advanced',
    testTypeId: 'chapter',
    questions: JEE_ADV_MIXED,
  }),
  makeTest({
    id: 'neet-chapter-demo',
    title: 'NEET — Chapter Proficiency (PCB)',
    description: 'Sample NEET-style chapter paper · PCB · not an official NTA paper.',
    examPatternId: 'neet',
    testTypeId: 'chapter',
    questions: NEET_PCB,
  }),
  makeTest({
    id: 'neet-part-demo',
    title: 'NEET — Subject Proficiency (PCB)',
    description: 'Sample NEET-style subject paper · PCB · not an official NTA paper.',
    examPatternId: 'neet',
    testTypeId: 'part',
    questions: NEET_PCB,
  }),
  ...(CALIBRATED_JEE_MAIN ? [CALIBRATED_JEE_MAIN] : []),
]

/** @deprecated use getSubjectsForPattern from subjects.js */
export const SUBJECTS = JEE_PCM

/** @returns {Test[]} */
export function getAllTests() {
  const uploaded = buildUploadedTest()
  const custom = loadCustomTests()
  const list = [...builtInTests, ...custom]
  if (uploaded) list.push(uploaded)
  return list
}

/** @param {Test} test */
function withRepairedPassages(test) {
  if (!test?.questions?.length) return test
  const bank = loadPublishedUploadedQuestions()
  let questions = repairPassageLinksInQuestions(test.questions, bank)
  questions = refreshTestQuestionsFromBank(questions, bank)
  questions = dedupeQuestionsForExam(questions)
  const repaired = {
    ...test,
    questions,
    totalQuestions: getAnswerableQuestions(questions).length,
  }
  const filtered = stripCdfOnlyQuestionsFromNonCdfTest(repaired)
  const same =
    questions.length === test.questions.length &&
    questions.every((q, i) => q.id === test.questions[i]?.id) &&
    (filtered.questions ?? []).length === test.questions.length
  if (same) return test
  return filtered
}

/** @param {string} testId */
export function getTestById(testId) {
  try {
    if (testId?.startsWith('practice-')) {
      const practice = getPracticeTestById(testId)
      if (practice) return withRepairedPassages(practice)
    }
    if (testId?.startsWith('drill-')) {
      const drill = getDrillTestById(testId)
      if (drill) return withRepairedPassages(drill)
    }
    if (testId?.startsWith('sheet-')) {
      const sheet = getSheetTestById(testId)
      if (sheet) return withRepairedPassages(sheet)
    }
    if (testId?.startsWith('place-')) {
      const place = getPlacementTestById(testId)
      if (place) return withRepairedPassages(place)
    }
    if (testId?.startsWith('speed-')) {
      const speed = getSpeedTestById(testId)
      if (speed) return withRepairedPassages(speed)
    }
    if (testId?.startsWith('cdf-')) {
      const cdf = getCdfTestById(testId)
      if (cdf) return withRepairedPassages(cdf)
    }
    if (testId?.startsWith('smock-')) {
      const smock = getStudentMockTestById(testId)
      if (smock) return withRepairedPassages(smock)
    }
    if (testId?.startsWith('pyq-')) {
      const pyq = getPyqTestById(testId)
      if (pyq) return withRepairedPassages(pyq)
    }
    if (testId?.startsWith('pystudy-')) {
      const pystudy = getPyqStudyTestById(testId)
      if (pystudy) return withRepairedPassages(pystudy)
    }
    const test = getAllTests().find((t) => t.id === testId)
    return test ? withRepairedPassages(test) : undefined
  } catch (err) {
    console.error('[getTestById] failed', testId, err)
    return undefined
  }
}

/** @param {{ examPatternId?: string, testTypeId?: string }} filters */
export function filterTests(filters = {}) {
  return getAllTests().filter((t) => {
    if (filters.examPatternId && t.examPatternId !== filters.examPatternId) return false
    if (filters.testTypeId && t.testTypeId !== filters.testTypeId) return false
    return true
  })
}

export const tests = builtInTests
