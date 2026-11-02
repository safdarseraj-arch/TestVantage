/**
 * Student prepare modes — single source for hub, sidebar, and home links.
 */

/** @typedef {{
 *   id: string
 *   to: string
 *   icon: string
 *   title: string
 *   tagline: string
 *   desc: string
 *   accent: string
 *   accentSoft: string
 *   pills: string[]
 *   featured?: boolean
 *   cta: string
 * }} StudentPrepareMode */

/** @type {StudentPrepareMode[]} */
export const STUDENT_PREPARE_MODES = [
  {
    id: 'ai-mock-builder',
    to: '/mock-test',
    icon: '🎯',
    title: 'AI Mock Builder',
    tagline: 'Build your own full mock',
    desc: 'Pick exam, syllabus, and paper type. AI assembles an NTA-style paper with 10–25% PYQ when available.',
    accent: '#4f46e5',
    accentSoft: 'rgba(79, 70, 229, 0.12)',
    pills: ['Full · Subject · Chapter', 'Calibrated', '10–25% PYQ'],
    featured: true,
    cta: 'Build mock →',
  },
  {
    id: 'syllabus-practice',
    to: '/practice',
    icon: '📖',
    title: 'Syllabus Practice',
    tagline: 'Self-paced chapter drills',
    desc: 'Untimed batches by subject, unit, and chapter. AI mixes difficulty and includes PYQ from your exam.',
    accent: '#16a34a',
    accentSoft: 'rgba(22, 163, 74, 0.12)',
    pills: ['No timer', 'Continue batches', 'AI pick'],
    cta: 'Start practice →',
  },
  {
    id: 'speed-test',
    to: '/speed-test',
    icon: '⚡',
    title: 'Precision Speed Test',
    tagline: 'Fast recall under time pressure',
    desc: '15–60 minute timed drill on easier questions — build speed and accuracy before full mocks.',
    accent: '#ea580c',
    accentSoft: 'rgba(234, 88, 12, 0.12)',
    pills: ['15–60 min', 'Easy–medium Q', 'Per-subject pace'],
    cta: 'Start speed test →',
  },
  {
    id: 'cdf-test',
    to: '/cdf-test',
    icon: '⏱️',
    title: 'CDF Mastery Test',
    tagline: 'Concept · Definition · Formula',
    desc: 'Short timed session on fundamentals — one timer per question, ideal for revision sprints.',
    accent: '#0891b2',
    accentSoft: 'rgba(8, 145, 178, 0.12)',
    pills: ['Per-question timer', 'CDF bank only', '15–45 min'],
    cta: 'Start CDF test →',
  },
  {
    id: 'quick-revision',
    to: '/quick-revision',
    icon: '📝',
    title: 'Quick Revision',
    tagline: 'Cheat sheet, PYQ strategies, JEE guide',
    desc: 'Same exam, subject, and chapter dropdowns as question tags. Cheat sheet after a chapter. Problem solving strategy: read the complete JEE guide on screen (no download), then PYQ-first questions for the chapter.',
    accent: '#0f766e',
    accentSoft: 'rgba(15, 118, 110, 0.12)',
    pills: ['By chapter', 'Cheat sheet', 'PYQ first'],
    cta: 'Open Quick Revision →',
  },
  {
    id: 'formula-sheet',
    to: '/formula-sheet',
    icon: '📌',
    title: 'My Formula Sheet',
    tagline: 'Pin formulas you keep forgetting',
    desc: 'Bookmark formulas from Quick Revision into one personal sheet. Download a PDF with the TestVantages name.',
    accent: '#0f766e',
    accentSoft: 'rgba(15, 118, 110, 0.12)',
    pills: ['Pin from revision', 'PDF download', 'Your pocket sheet'],
    cta: 'Open formula sheet →',
  },
  {
    id: 'daily-target',
    to: '/daily-target',
    icon: '🎯',
    title: 'Today’s Target',
    tagline: 'Clear backlog chapters today',
    desc: 'Set a question count on your weakest chapters and drill them in Syllabus Practice. Separate from Today’s Drill mixed set.',
    accent: '#c2410c',
    accentSoft: 'rgba(194, 65, 12, 0.12)',
    pills: ['Weak chapters', '15 / 25 / 40 Q', 'Tracks today'],
    cta: 'Set today’s target →',
  },
  {
    id: 'daily-sheet',
    to: '/daily-sheet',
    icon: '📄',
    title: 'Daily Practice Sheet',
    tagline: 'Dated chapter DPP from your bank',
    desc: 'Pick exam, subject, and chapter. Attempt 6–12 questions or print a TestVantages sheet. Separate from Today’s Drill.',
    accent: '#0369a1',
    accentSoft: 'rgba(3, 105, 161, 0.12)',
    pills: ['Chapter sheet', 'Print / PDF', 'Your bank'],
    cta: 'Open today’s sheet →',
  },
  {
    id: 'placement-check',
    to: '/placement-check',
    icon: '📍',
    title: 'Placement check',
    tagline: 'Where you stand — then a plan',
    desc: 'A short mixed paper. After you finish, we suggest weak chapters for Today’s Target. Not a fee-scholarship test.',
    accent: '#7c3aed',
    accentSoft: 'rgba(124, 58, 237, 0.12)',
    pills: ['~15 mixed Q', 'Subject split', 'Locks Today’s Target'],
    cta: 'Start placement check →',
  },
  {
    id: 'test-series',
    to: '/test-series',
    icon: '📆',
    title: 'Series calendar',
    tagline: 'Week-by-week mock schedule',
    desc: 'A dated sample calendar of NTA-style papers until your teacher publishes a real series. Your papers, not someone else’s brand.',
    accent: '#1d4ed8',
    accentSoft: 'rgba(29, 78, 216, 0.12)',
    pills: ['Dated weeks', 'JEE · NEET', 'Start when ready'],
    cta: 'Open series calendar →',
  },
  {
    id: 'pyq-bank',
    to: '/practice/pyq',
    icon: '📅',
    title: 'PYQ Bank',
    tagline: 'Imported previous-year papers',
    desc: 'Six PYQ modes once your institute imports official papers. Empty until staff approve NTA / Advanced / NEET PDFs — no fake dated catalog.',
    accent: '#ca8a04',
    accentSoft: 'rgba(202, 138, 4, 0.14)',
    pills: ['JEE · NEET', 'Imported papers', 'Staff approved'],
    cta: 'Open PYQ bank →',
  },
  {
    id: 'official-mocks',
    to: '/tests',
    icon: '📋',
    title: 'Mock Tests',
    tagline: 'Assigned & sample papers',
    desc: 'Teacher-assigned tests plus labelled sample NTA-style papers — not official NTA PYQ. Start when your coach publishes a paper.',
    accent: '#7c3aed',
    accentSoft: 'rgba(124, 58, 237, 0.12)',
    pills: ['Assigned tests', 'NTA blueprints', 'Instant analysis'],
    cta: 'Browse mocks →',
  },
]

/** Sidebar / compact nav from the same list */
export const STUDENT_PREPARE_NAV = STUDENT_PREPARE_MODES.map((m) => ({
  to: m.to,
  label: m.title,
  icon: m.icon,
  title: m.tagline,
}))

/** @param {string} modeId */
export function getPrepareModeById(modeId) {
  return STUDENT_PREPARE_MODES.find((m) => m.id === modeId)
}

/** @param {string} pathname */
export function getPrepareModeByPath(pathname) {
  return STUDENT_PREPARE_MODES.find(
    (m) => pathname === m.to || pathname.startsWith(`${m.to}/`) || pathname.startsWith(m.to),
  )
}
