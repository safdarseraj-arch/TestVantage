/**
 * One fixed demo student attempt — used by /demo/report-card
 * so founders can see the parent/student report without sitting a paper.
 */

import { buildReportCardModel } from '../utils/resultReportCard.js'

export const DEMO_REPORT_STUDENT = {
  name: 'Aarav Sharma',
  email: 'aarav.s@demo.school',
  classLabel: 'Class 12 · PCM · Batch A',
  schoolName: 'Demo Public School (pilot)',
  parentEmail: 'parent.aarav@demo.school',
}

export const DEMO_REPORT_TEST = {
  id: 'demo-report-jee-main-full',
  title: 'JEE Main Full Mock — Sample (Demo)',
  examPatternId: 'jee-main',
}

/** Attempt-shaped payload matching Result / buildReportCardModel. */
export function getDemoReportAttemptData() {
  return {
    testId: DEMO_REPORT_TEST.id,
    title: DEMO_REPORT_TEST.title,
    examPatternId: DEMO_REPORT_TEST.examPatternId,
    userName: DEMO_REPORT_STUDENT.name,
    userEmail: DEMO_REPORT_STUDENT.email,
    submittedAt: '2026-11-20T10:42:00+05:30',
    percentile: 97.4,
    estimatedAIR: 18500,
    result: {
      score: 186,
      maxScore: 300,
      accuracy: 78,
      correct: 52,
      wrong: 14,
      unattempted: 9,
      bySubject: {
        physics: { score: 64, maxScore: 100, accuracy: 76 },
        chemistry: { score: 72, maxScore: 100, accuracy: 84 },
        mathematics: { score: 50, maxScore: 100, accuracy: 68 },
      },
      byChapter: {
        Kinematics: { correct: 4, wrong: 2, unattempted: 0 },
        'Laws of Motion': { correct: 3, wrong: 1, unattempted: 1 },
        'Current Electricity': { correct: 5, wrong: 1, unattempted: 0 },
        Optics: { correct: 2, wrong: 3, unattempted: 1 },
        'Atomic Structure': { correct: 5, wrong: 0, unattempted: 1 },
        'Chemical Bonding': { correct: 4, wrong: 1, unattempted: 0 },
        Equilibrium: { correct: 3, wrong: 2, unattempted: 1 },
        'Organic Chemistry': { correct: 4, wrong: 1, unattempted: 0 },
        'Complex Numbers': { correct: 3, wrong: 2, unattempted: 1 },
        Matrices: { correct: 4, wrong: 1, unattempted: 0 },
        Integrals: { correct: 2, wrong: 3, unattempted: 1 },
        Probability: { correct: 3, wrong: 1, unattempted: 2 },
      },
    },
  }
}

export function getDemoReportCardModel() {
  return buildReportCardModel({
    data: getDemoReportAttemptData(),
    test: DEMO_REPORT_TEST,
    studentName: DEMO_REPORT_STUDENT.name,
    parentEmail: DEMO_REPORT_STUDENT.parentEmail,
  })
}

/** Field legend — what parents see on the one-page report. */
export const DEMO_REPORT_CARD_FIELDS = [
  {
    group: 'Header',
    items: [
      'Product label (TestVantages · Parent / student report)',
      'Test title',
      'Student name + email + submitted date/time',
    ],
  },
  {
    group: 'Score strip (KPIs)',
    items: [
      'Marks scored / max + %',
      'Accuracy %',
      'Estimated percentile (not official NTA)',
      'Estimated AIR (practice curve)',
      'Right / wrong / skip counts',
    ],
  },
  {
    group: 'Subjects table',
    items: ['Physics, Chemistry, Maths marks', 'Subject % of max'],
  },
  {
    group: 'Focus chapters',
    items: [
      'Weak chapters sorted by low accuracy',
      'Accuracy % and wrong count per chapter',
    ],
  },
  {
    group: 'Footer note',
    items: [
      'Disclaimer: ranks are estimates, not NTA ranks',
      'Tip: Print → Save as PDF',
    ],
  },
]

/** Field legend — full multi-page diagnostic (founder PDF depth). */
export const DEMO_DIAGNOSTIC_REPORT_FIELDS = [
  {
    group: 'Pages 1–2 · Cover & score recovery',
    items: [
      'Cover: student, test, pattern, duration',
      'KPI strip + executive scorecard',
      'Marks-left waterfall + diagnostic headline',
      'Subject ROI table (score, time, MPM bars)',
      'Question-format split + 7-bucket attempt quality matrix',
    ],
  },
  {
    group: 'Pages 3–4 · Errors, toughness, time',
    items: [
      'Error DNA / root-cause taxonomy',
      'Difficulty conversion + sitter notes',
      'Toughness L1–L5 mix',
      'Time behaviour, sinks, stamina curve, Skip IQ',
      'Subject navigation / Pass-1 vs revisits',
    ],
  },
  {
    group: 'Pages 5–6 · Chapters, questions, plan',
    items: [
      'Chapter ROI P1–P4 + weak chapters',
      'Question highlights: time vs ideal, toughness, why-wrong, visits, peer Top10/25/All',
      'Cohort score comparison when device peers exist',
      'Trajectory, 7-day prescription, coach + parent brief',
      'Disclaimers: est. AIR/percentile; device peers ≠ NTA',
    ],
  },
]
