/**
 * Home marketing highlight slides — TestVantages product story (5 strongest).
 * Used by FeatureHighlightCarousel (auto advance: track shifts left so next slide
 * enters from the right = LTR story order). Keep this list short for go-live.
 */

/** @typedef {{
 *   id: string
 *   eyebrow: string
 *   title: string
 *   support: string
 *   cta: string
 *   to: string
 *   accent: string
 *   mark: string
 * }} FeatureHighlight */

const BLUE = '#3b82f6'
const BLUE_DEEP = '#2563eb'
const SEA = '#14b8a6'
const SEA_DEEP = '#0d9488'
const TEAL = '#0f766e'

/** @type {FeatureHighlight[]} */
export const HOME_FEATURE_HIGHLIGHTS = [
  {
    id: 'prepare',
    eyebrow: 'Practice Hub',
    title: 'Every practice mode in one place',
    support:
      'Mocks, syllabus drills, High mistake, High skip, speed, CDF, PYQ, and daily targets — start here when you are not sure what to open next.',
    cta: 'Open Practice Hub',
    to: '/prepare',
    accent: BLUE_DEEP,
    mark: 'P',
  },
  {
    id: 'mock-test',
    eyebrow: 'Mock Builder',
    title: 'Build a full NTA-style mock in minutes',
    support:
      'Pick exam, syllabus, and paper type. Calibrated difficulty keeps the paper honest — then submit for full result analysis.',
    cta: 'Build a mock',
    to: '/mock-test',
    accent: BLUE,
    mark: 'M',
  },
  {
    id: 'pyq',
    eyebrow: 'PYQ Bank',
    title: 'Official previous-year papers, six ways to train',
    support:
      'Practice, full PYQ tests, subject/chapter drills, calibrated PYQ, and year-wise papers — once staff approve the official PDFs.',
    cta: 'Open PYQ Bank',
    to: '/pyq',
    accent: TEAL,
    mark: 'PY',
  },
  {
    id: 'high-mistake-skip',
    eyebrow: 'Fix first',
    title: 'High mistake & High skip — practice or take a test',
    support:
      'Drill the questions classmates get wrong or leave blank. After a mock, Charts → Fix first shows your personal list.',
    cta: 'Open High mistake',
    to: '/high-mistake',
    accent: SEA,
    mark: 'HM',
  },
  {
    id: 'form-forecast',
    eyebrow: 'Rank Forecast',
    title: 'Know where your practice form stands',
    support:
      'Practice AIR, Exam Fit /100, Revision Ladder, and Insight Coach from real attempts — then jump to Career Guide for exam-day colleges.',
    cta: 'Open Rank Forecast',
    to: '/form-forecast',
    accent: SEA_DEEP,
    mark: 'RF',
  },
]
