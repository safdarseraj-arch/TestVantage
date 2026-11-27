/**
 * Fixed sample student test analysis for /demo/test-analysis.
 * Uses the built-in JEE Main sample paper + scripted answers so every Result tab has data.
 */

import { getTestById } from './tests.js'
import { DEMO_REPORT_STUDENT } from './demoStudentReportCard.js'
import { evaluateTest } from '../utils/scoring.js'
import { scoreToPercentile, estimateAIR } from '../utils/percentile.js'

export const DEMO_ANALYSIS_TEST_ID = 'jee-main-full-demo'
export const DEMO_ANALYSIS_ATTEMPT_ID = 'demo-sample-analysis-aarav'

/** Scripted answers for the 9-question sample paper (realistic mix). */
const DEMO_ANSWERS = {
  p1: 1, // correct — Kinematics
  p2: 0, // wrong — Thermodynamics (misread)
  p3: 0, // correct — Optics
  c1: 1, // correct — Atomic Structure
  c2: 0, // wrong — Chemical Bonding (concept)
  c3: undefined, // skipped — Electrochemistry
  m1: 0, // correct — Quadratic Equations
  m2: 1, // wrong — Calculus (calc slip; time sink)
  m3: 2, // correct — Probability
}

/** Seconds spent per question — uneven so Time / Stamina tabs look real. */
const DEMO_QUESTION_TIMES = {
  p1: 95,
  p2: 140,
  p3: 70,
  c1: 85,
  c2: 125,
  c3: 40,
  m1: 60,
  m2: 210,
  m3: 55,
}

/** Hybrid-style ideal times (seconds) — demo pretends Hybrid AI filled these. */
const DEMO_IDEAL_TIMES = {
  p1: 75,
  p2: 100,
  p3: 60,
  c1: 70,
  c2: 90,
  c3: 80,
  m1: 55,
  m2: 110,
  m3: 50,
}

const DEMO_TOUGHNESS = {
  p1: 3,
  p2: 4,
  p3: 2,
  c1: 3,
  c2: 4,
  c3: 3,
  m1: 2,
  m2: 5,
  m3: 2,
}

/** Why-wrong tags (same keys as Result Charts / Question-wise). */
export const DEMO_WRONG_REASONS = {
  p2: 'misread',
  c2: 'concept',
  m2: 'calc',
}

export const DEMO_ANALYSIS_HIGHLIGHTS = [
  {
    group: 'Printable full diagnostic',
    items: [
      'Download full diagnostic report (6-page HTML → Print → PDF)',
      'Same sections as founder Flagship / JEE Adv / NEET sample PDFs',
      'Also on /demo/report-card with live multi-page preview',
    ],
  },
  {
    group: 'Overall',
    items: [
      'Score ring, grade, accuracy, est. percentile & AIR',
      'Subject bar chart vs local top 10% / 25% / average',
      'Focus chapters from this attempt',
    ],
  },
  {
    group: 'Time behaviour',
    items: [
      'Average time bars by subject',
      'Time sinks (slow + wrong)',
      'Longest time list → jump to question',
    ],
  },
  {
    group: 'Question level (Your vs correct)',
    items: [
      'Attempt & Accuracy Rate — Top 10% / Top 25% / All',
      'Self time spent visit timeline',
      'Bar chart: time by students who got it correct + Ideal',
      'Toughness Level + Ideal time (Hybrid AI / estimate)',
    ],
  },
]

/**
 * Build navEvents so question visit timelines have multiple segments.
 * @param {string[]} questionIds
 * @param {Record<string, number>} times
 */
function buildDemoSessionTelemetry(questionIds, times) {
  /** @type {{ t: number, questionId: string, subject?: string, action: string, visitN: number }[]} */
  const navEvents = []
  /** @type {Record<string, number>} */
  const visitCounts = {}
  /** @type {Record<string, number>} */
  const firstSeenAt = {}
  let t = 0
  const passOrder = [...questionIds, ...questionIds.slice().reverse().slice(0, 4), ...questionIds.slice(0, 3)]
  for (const id of passOrder) {
    visitCounts[id] = (visitCounts[id] ?? 0) + 1
    if (firstSeenAt[id] == null) firstSeenAt[id] = t
    navEvents.push({
      t,
      questionId: id,
      action: 'enter',
      visitN: visitCounts[id],
    })
    const slice = Math.max(8, Math.round((times[id] || 60) / Math.max(2, (visitCounts[id] || 1) + 1)))
    t += slice
  }
  return {
    navEvents,
    subjectSwitches: [],
    firstSeenAt,
    answerAt: Object.fromEntries(questionIds.map((id) => [id, (firstSeenAt[id] ?? 0) + 20])),
    visitCounts,
  }
}

/**
 * @returns {{ test: import('./tests').Test, data: object, attemptId: string } | null}
 */
export function getDemoTestAnalysisBundle() {
  const base = getTestById(DEMO_ANALYSIS_TEST_ID)
  if (!base?.questions?.length) return null

  const questions = base.questions.map((q) => ({
    ...q,
    toughnessLevel: DEMO_TOUGHNESS[q.id] ?? q.toughnessLevel ?? 3,
    idealTimeSeconds: DEMO_IDEAL_TIMES[q.id] ?? q.idealTimeSeconds,
  }))
  const test = { ...base, questions, title: base.title }

  const answers = { ...DEMO_ANSWERS }
  delete answers.c3

  const result = evaluateTest(test, answers, { questionTimes: DEMO_QUESTION_TIMES })
  const durationSeconds = Object.values(DEMO_QUESTION_TIMES).reduce((a, b) => a + b, 0)
  const percentile = scoreToPercentile(result.score, result.maxScore)
  const estimatedAIR = estimateAIR(percentile, test.examPatternId)

  const perQuestion = (result.perQuestion ?? []).map((pq) => {
    const tag = DEMO_WRONG_REASONS[pq.questionId]
    const q = questions.find((x) => x.id === pq.questionId)
    return {
      ...pq,
      wrongReason: tag || pq.wrongReason,
      toughnessLevel: q?.toughnessLevel,
      idealTimeSeconds: q?.idealTimeSeconds,
      difficulty: q?.difficulty,
    }
  })

  const questionIds = questions.map((q) => q.id)
  const sessionTelemetry = buildDemoSessionTelemetry(questionIds, DEMO_QUESTION_TIMES)

  const data = {
    testId: test.id,
    title: `${test.title} — Sample analysis`,
    examPatternId: test.examPatternId,
    testTypeId: test.testTypeId,
    userName: DEMO_REPORT_STUDENT.name,
    userEmail: DEMO_REPORT_STUDENT.email,
    submittedAt: '2026-11-20T10:42:00+05:30',
    startedAt: '2026-11-20T09:00:00+05:30',
    durationSeconds,
    percentile: Math.round(percentile * 10) / 10,
    estimatedAIR,
    questionTimes: { ...DEMO_QUESTION_TIMES },
    visitedIds: questionIds,
    wrongReasons: { ...DEMO_WRONG_REASONS },
    sessionTelemetry,
    demoAnalysis: true,
    result: {
      ...result,
      perQuestion,
    },
  }

  return {
    test,
    data,
    attemptId: DEMO_ANALYSIS_ATTEMPT_ID,
  }
}
