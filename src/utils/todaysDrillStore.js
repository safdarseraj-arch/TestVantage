/**
 * Today's Drill — one mixed daily practice set per exam + calendar day.
 */
import { getExamPattern } from '../data/examPatterns.js'
import { loadPublishedUploadedQuestions } from './questionBank.js'
import { filterQuestionsForNonCdfUse } from './cdfOnlyQuestions.js'
import { filterQuestionsByExam } from './practiceFilters.js'
import { getAnswerableQuestions } from './passage.js'
import { prepareQuestionsForTest } from './testQuestionClone.js'
import { loadDynamicTestMap, saveDynamicTestMap } from './dynamicTestStorage.js'
import { pickAiPracticeQuestions } from './aiSessionPick.js'
import { buildMasteryGraph } from './aiMastery.js'
import { getAttemptsByOwner, getOwnerKey } from './attemptHistory.js'

const SESSIONS_KEY = 'testvantage-todays-drill-sessions'
const PROGRESS_KEY = 'testvantage-todays-drill-progress'

/** Small local pool when published bank is empty (avoids circular import with tests.js). */
export const DRILL_FALLBACK_QUESTIONS = [
  {
    id: 'drill-fb-p1',
    subject: 'physics',
    chapter: 'Kinematics',
    questionType: 'single_correct',
    text: 'A particle moves with $v = 2t$. Acceleration at $t = 3\\,\\text{s}$ is:',
    options: ['$2\\,\\text{m/s}^2$', '$3\\,\\text{m/s}^2$', '$6\\,\\text{m/s}^2$', '$9\\,\\text{m/s}^2$'],
    correctIndex: 0,
  },
  {
    id: 'drill-fb-c1',
    subject: 'chemistry',
    chapter: 'Atomic Structure',
    questionType: 'single_correct',
    text: 'Number of electrons in $\\text{Na}^+$ is:',
    options: ['10', '11', '12', '23'],
    correctIndex: 0,
  },
  {
    id: 'drill-fb-m1',
    subject: 'mathematics',
    chapter: 'Quadratic Equations',
    questionType: 'single_correct',
    text: 'Roots of $x^2 - 5x + 6 = 0$ are:',
    options: ['2 and 3', '1 and 6', '$-2$ and $-3$', '0 and 5'],
    correctIndex: 0,
  },
  {
    id: 'drill-fb-p2',
    subject: 'physics',
    chapter: 'Optics',
    questionType: 'single_correct',
    text: 'SI unit of power of a lens is:',
    options: ['Dioptre', 'Candela', 'Lux', 'Weber'],
    correctIndex: 0,
  },
  {
    id: 'drill-fb-b1',
    subject: 'biology',
    chapter: 'Cell Biology',
    questionType: 'single_correct',
    text: 'Powerhouse of the cell is the:',
    options: ['Nucleus', 'Mitochondrion', 'Ribosome', 'Golgi body'],
    correctIndex: 1,
  },
  {
    id: 'drill-fb-c2',
    subject: 'chemistry',
    chapter: 'Chemical Bonding',
    questionType: 'single_correct',
    text: 'Shape of $\\text{CH}_4$ is:',
    options: ['Linear', 'Trigonal planar', 'Tetrahedral', 'Octahedral'],
    correctIndex: 2,
  },
  {
    id: 'drill-fb-m2',
    subject: 'mathematics',
    chapter: 'Sequences',
    questionType: 'single_correct',
    text: 'Next term in $2, 5, 10, 17, \\ldots$ is:',
    options: ['24', '26', '28', '30'],
    correctIndex: 1,
  },
  {
    id: 'drill-fb-b2',
    subject: 'biology',
    chapter: 'Human Physiology',
    questionType: 'single_correct',
    text: 'Oxygen is carried mainly by:',
    options: ['Plasma', 'Platelets', 'Haemoglobin', 'White blood cells'],
    correctIndex: 2,
  },
  {
    id: 'drill-fb-p3',
    subject: 'physics',
    chapter: 'Current Electricity',
    questionType: 'single_correct',
    text: 'Ohm’s law relates:',
    options: ['$V$, $I$, $R$', '$F$, $m$, $a$', '$P$, $V$', '$Q$, $t$'],
    correctIndex: 0,
  },
  {
    id: 'drill-fb-m3',
    subject: 'mathematics',
    chapter: 'Trigonometry',
    questionType: 'single_correct',
    text: '$\\sin 90^\\circ$ equals:',
    options: ['0', '1', '$1/2$', 'undefined'],
    correctIndex: 1,
  },
]

function dayStamp() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY)
    return raw ? JSON.parse(raw) : { byKey: {} }
  } catch {
    return { byKey: {} }
  }
}

function saveProgress(data) {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(data))
}

function progressKey(ownerKey, examPatternId) {
  return `${ownerKey}::${examPatternId}::${dayStamp()}`
}

/** @param {string} testId */
export function getDrillTestById(testId) {
  if (!testId?.startsWith('drill-')) return null
  return loadDynamicTestMap(SESSIONS_KEY)[testId] ?? null
}

/**
 * @param {string} ownerKey
 * @param {string} examPatternId
 */
export function getTodaysDrillProgress(ownerKey, examPatternId) {
  const data = loadProgress()
  return data.byKey[progressKey(ownerKey, examPatternId)] ?? null
}

/**
 * @param {{
 *   ownerKey: string
 *   examPatternId: string
 *   testId: string
 *   score?: number
 *   maxScore?: number
 *   accuracy?: number
 *   completed?: boolean
 * }} entry
 */
export function markDrillProgress(entry) {
  const data = loadProgress()
  const key = progressKey(entry.ownerKey, entry.examPatternId)
  data.byKey[key] = {
    day: dayStamp(),
    examPatternId: entry.examPatternId,
    testId: entry.testId,
    ownerKey: entry.ownerKey,
    ownerLabel: entry.ownerLabel || undefined,
    score: entry.score ?? null,
    maxScore: entry.maxScore ?? null,
    accuracy: entry.accuracy ?? null,
    completed: !!entry.completed,
    updatedAt: Date.now(),
  }
  saveProgress(data)
  return data.byKey[key]
}

/**
 * Build or resume today's mixed drill for an exam.
 * @param {{ examPatternId: string, userId?: string, questionCount?: number }} config
 */
export function createOrResumeTodaysDrill(config) {
  const examId = config.examPatternId || 'jee-main'
  const ownerKey = getOwnerKey(config.userId)
  const existing = getTodaysDrillProgress(ownerKey, examId)
  if (existing?.testId && !existing.completed) {
    const test = getDrillTestById(existing.testId)
    if (test) {
      return {
        ok: true,
        test,
        resumed: true,
        progress: existing,
        usedFallback: !!test.drillMeta?.usedFallback,
      }
    }
  }

  const bank = filterQuestionsForNonCdfUse(loadPublishedUploadedQuestions())
  let examBank = filterQuestionsByExam(bank, examId)
  let answerable = getAnswerableQuestions(examBank)

  // Built-in fallback so Today’s Drill works before the published bank is filled.
  // (Avoid importing tests.js here — it already imports this module.)
  let usedFallback = false
  if (answerable.length < 3) {
    answerable = getAnswerableQuestions(DRILL_FALLBACK_QUESTIONS)
    examBank = answerable
    usedFallback = true
  }
  if (answerable.length < 3) {
    return {
      ok: false,
      error:
        'Not enough published questions for this exam yet. Publish a few in Question Bank, then try again.',
    }
  }

  const count = Math.min(config.questionCount ?? 10, answerable.length, 15)
  const attempts = getAttemptsByOwner(ownerKey)
  const masteryGraph = buildMasteryGraph(attempts)
  const shuffled = [...answerable].sort(() => Math.random() - 0.5)
  // Prefer subject mix: take round-robin-ish by subject then fill
  /** @type {Map<string, typeof answerable>} */
  const bySubject = new Map()
  for (const q of shuffled) {
    const sub = q.subject || q.syllabusSubject || 'General'
    if (!bySubject.has(sub)) bySubject.set(sub, [])
    bySubject.get(sub).push(q)
  }
  /** @type {typeof answerable} */
  const mixed = []
  const subjects = [...bySubject.keys()]
  let i = 0
  while (mixed.length < count && subjects.length) {
    const sub = subjects[i % subjects.length]
    const bucket = bySubject.get(sub)
    if (bucket?.length) mixed.push(bucket.shift())
    else subjects.splice(i % subjects.length, 1)
    i++
  }
  if (mixed.length < count) {
    const { questions: picked } = pickAiPracticeQuestions(answerable, count, { masteryGraph })
    mixed.splice(0, mixed.length, ...picked)
  }

  const pickedMix = mixed.slice(0, count)
  const clonePool = bank.length ? bank : [...DRILL_FALLBACK_QUESTIONS, ...pickedMix]
  const prepared = prepareQuestionsForTest(clonePool, pickedMix, `drill-q-${Date.now()}`)
  const exam = getExamPattern(examId)
  const id = `drill-${dayStamp()}-${examId}-${Date.now()}`
  const minutes = Math.max(15, Math.ceil(prepared.length * 2))

  /** @type {import('../data/tests').Test} */
  const test = {
    id,
    title: `Today’s Drill — ${exam?.shortName ?? examId}`,
    description: `Mixed daily set for ${exam?.name ?? examId}`,
    examPatternId: examId,
    testTypeId: 'practice',
    durationMinutes: minutes,
    totalQuestions: getAnswerableQuestions(prepared).length,
    questions: prepared,
    drillMeta: {
      day: dayStamp(),
      examPatternId: examId,
      mixed: true,
      usedFallback,
      source: usedFallback ? 'starter-pack' : 'published-bank',
    },
  }

  const map = loadDynamicTestMap(SESSIONS_KEY)
  map[id] = test
  saveDynamicTestMap(SESSIONS_KEY, map)
  const progress = markDrillProgress({
    ownerKey,
    examPatternId: examId,
    testId: id,
    completed: false,
  })
  return { ok: true, test, resumed: false, progress, usedFallback }
}

/**
 * Standing from real Today’s Drill finishers stored locally (+ you).
 * No fake peer names.
 * @param {{ score: number, maxScore: number, userName: string, ownerKey?: string }} me
 */
export function buildDrillStanding(me) {
  const pct = me.maxScore > 0 ? Math.round((me.score / me.maxScore) * 100) : 0
  const progressData = loadProgress()
  /** @type {{ name: string, pct: number, you: boolean }[]} */
  const peers = []
  for (const entry of Object.values(progressData.byKey || {})) {
    if (!entry?.completed || entry.score == null || !entry.maxScore) continue
    if (entry.day !== dayStamp()) continue
    const p = Math.round((entry.score / entry.maxScore) * 100)
    peers.push({
      name: entry.ownerLabel || 'Student',
      pct: p,
      you: false,
      ownerKey: entry.ownerKey,
    })
  }
  const board = [
    { name: me.userName || 'You', pct, you: true },
    ...peers.filter((p) => p.pct !== pct || p.name !== (me.userName || 'You')),
  ]
  // Dedupe by name+pct roughly
  const seen = new Set()
  const unique = []
  for (const row of board) {
    const k = `${row.you ? 'you' : row.name}:${row.pct}`
    if (seen.has(k)) continue
    seen.add(k)
    unique.push(row)
  }
  unique.sort((a, b) => b.pct - a.pct)
  const rank = unique.findIndex((r) => r.you) + 1
  return { board: unique, rank, total: unique.length }
}
