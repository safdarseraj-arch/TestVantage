/**
 * Student insight pages — My Results, Analytics, Leaderboard, Career Compass, Exam Pulse.
 */

/** @typedef {{
 *   id: string
 *   icon: string
 *   title: string
 *   tagline: string
 *   desc: string
 *   accent: string
 *   accentSoft: string
 *   pills: string[]
 * }} StudentInsightPage */

/** @type {StudentInsightPage[]} */
export const STUDENT_INSIGHT_PAGES = [
  {
    id: 'my-results',
    icon: '🏆',
    title: 'My Results',
    tagline: 'Test history & scores',
    desc: 'Every attempt in one place — score, accuracy, time, and one-click analysis.',
    accent: '#2563eb',
    accentSoft: 'rgba(37, 99, 235, 0.12)',
    pills: ['Full history', 'AI analysis', 'Account sync'],
  },
  {
    id: 'analytics',
    icon: '📊',
    title: 'Analytics',
    tagline: 'Trends · streak · study path',
    desc: 'Percentile trends, chapter strength, weak topics, and a personalised study path. Practice AIR, Exam Fit, and Precision Map live on Form Forecast.',
    accent: '#0d9488',
    accentSoft: 'rgba(13, 148, 136, 0.12)',
    pills: ['6-tab analysis', 'Weak chapters', 'Study plan'],
  },
  {
    id: 'leaderboard',
    icon: '🥇',
    title: 'Leaderboard',
    tagline: 'Real attempt standings',
    desc: 'Ranks from real scored attempts on each test — synced from the server when available.',
    accent: '#d97706',
    accentSoft: 'rgba(217, 119, 6, 0.14)',
    pills: ['Real attempts', 'Per-test board', 'Your rank'],
  },
  {
    id: 'form-forecast',
    icon: '🎯',
    title: 'Form Forecast',
    tagline: 'Practice AIR · Exam Fit · Precision',
    desc: 'Practice-based AIR with confidence, Exam Fit /100 + Revision Ladder, Precision Map, and Insight Coach — beside Career Compass (exam-day colleges), not instead of it.',
    accent: '#b45309',
    accentSoft: 'rgba(180, 83, 9, 0.12)',
    pills: ['Form Forecast', 'Exam Fit', 'Precision Map', 'Insight Coach'],
  },
  {
    id: 'career-compass',
    icon: '🧭',
    title: 'Career Compass',
    tagline: 'Exam-day rank · colleges',
    desc: '2027 AIR & State Rank from 2024–2026 marks data; JoSAA/CSAB/MCC college match; compare up to 5 colleges by branch (CSE, MBBS…). Practice form stays on Form Forecast.',
    accent: '#0284c7',
    accentSoft: 'rgba(2, 132, 199, 0.12)',
    pills: ['2027 predictor', 'AIR + State Rank', 'Compare by branch'],
  },
  {
    id: 'exam-pulse',
    icon: '📡',
    title: 'Exam Pulse',
    tagline: 'Exams · Admissions · Focus',
    desc: 'Student briefing: NTA / JEE / NEET updates, admissions news, placement notes, and short motivational coverage — AI-refreshed when available.',
    accent: '#0f766e',
    accentSoft: 'rgba(15, 118, 110, 0.12)',
    pills: ['Exam updates', 'Admissions', 'Motivation'],
  },
]

/** @param {string} pageId */
export function getInsightPageById(pageId) {
  return STUDENT_INSIGHT_PAGES.find((p) => p.id === pageId)
}
