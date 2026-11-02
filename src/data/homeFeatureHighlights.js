/**
 * Home marketing highlight slides — full TestVantages product story.
 * Used by FeatureHighlightCarousel (auto advance: track shifts left so next slide enters from the right = LTR story order).
 * One idea per slide; accents stay blue / sea-green only (professional education palette).
 * Sections inside a product (Exam Fit, Precision Map, Calibrated mode) are named in support copy — not sold as separate apps.
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

/** Brand accents — blue & sea-green only */
const BLUE = '#3b82f6'
const BLUE_DEEP = '#2563eb'
const SEA = '#14b8a6'
const SEA_DEEP = '#0d9488'
const TEAL = '#0f766e'
const CYAN = '#0891b2'

/** @type {FeatureHighlight[]} */
export const HOME_FEATURE_HIGHLIGHTS = [
  /* ── Home & Prepare ── */
  {
    id: 'home',
    eyebrow: 'Home',
    title: 'Your TestVantages starting point',
    support: 'See what’s new, jump into practice, and reach every tool from one clear home.',
    cta: 'Go to Home',
    to: '/home',
    accent: BLUE,
    mark: 'H',
  },
  {
    id: 'prepare',
    eyebrow: 'Prepare',
    title: 'Practice that matches the real exam',
    support:
      'One Prepare centre for mocks, drills, and PYQ — plus shortcuts to Compete and Form Forecast when you want them.',
    cta: 'Open Prepare centre',
    to: '/prepare',
    accent: BLUE_DEEP,
    mark: 'P',
  },
  {
    id: 'mock-test',
    eyebrow: 'AI Mock Builder',
    title: 'Build a full mock in minutes',
    support:
      'Pick exam, syllabus, and paper type — NTA-style papers with calibrated difficulty. Real-Time Calibrated is a mode here: level can move with you as you answer.',
    cta: 'Build a mock',
    to: '/mock-test',
    accent: BLUE,
    mark: 'M',
  },
  {
    id: 'syllabus-practice',
    eyebrow: 'Syllabus Practice',
    title: 'Self-paced chapter drills',
    support: 'Untimed batches by subject and chapter — build accuracy before you race the clock.',
    cta: 'Start practice',
    to: '/practice',
    accent: TEAL,
    mark: 'SP',
  },
  {
    id: 'speed-test',
    eyebrow: 'Precision Speed',
    title: 'Train recall under time pressure',
    support: 'Short timed drills on easier items — lift pace without burning a full mock.',
    cta: 'Start speed test',
    to: '/speed-test',
    accent: CYAN,
    mark: 'ST',
  },
  {
    id: 'cdf-test',
    eyebrow: 'CDF Mastery',
    title: 'Concept, definition, formula sprints',
    support: 'Short timed sessions on fundamentals — one timer per question for quick revision.',
    cta: 'Start CDF test',
    to: '/cdf-test',
    accent: SEA,
    mark: 'CDF',
  },
  {
    id: 'quick-revision',
    eyebrow: 'Quick Revision',
    title: 'Definitions and formulas by chapter',
    support:
      'Open a readable sheet for one chapter — definitions, formulas, and important points. Download a PDF with the TestVantages name. No need to visit Question Bank.',
    cta: 'Open Quick Revision',
    to: '/quick-revision',
    accent: TEAL,
    mark: 'QR',
  },
  {
    id: 'formula-sheet',
    eyebrow: 'My Formula Sheet',
    title: 'Pin the formulas you keep missing',
    support:
      'Bookmark formulas from Quick Revision into one personal sheet. Download a PDF with the TestVantages name.',
    cta: 'Open formula sheet',
    to: '/formula-sheet',
    accent: SEA_DEEP,
    mark: 'FS',
  },
  {
    id: 'daily-target',
    eyebrow: 'Today’s Target',
    title: 'Clear backlog chapters today',
    support:
      'Set a 15 / 25 / 40 question goal on your weakest chapters, then drill them in Syllabus Practice.',
    cta: 'Set today’s target',
    to: '/daily-target',
    accent: TEAL,
    mark: 'TT',
  },
  {
    id: 'pyq',
    eyebrow: 'PYQ Bank · Six modes',
    title: 'Previous-year papers, six ways to train',
    support:
      'Syllabus Practice · Comprehensive PYQ Test · Subject PYQ Proficiency · Chapter PYQ Proficiency · Real-Time Calibrated PYQ · Year-wise Paper — pick the mode that matches today’s goal.',
    cta: 'Open PYQ Bank',
    to: '/pyq',
    accent: BLUE_DEEP,
    mark: 'PY',
  },
  {
    id: 'official-mocks',
    eyebrow: 'Mock tests',
    title: 'Assigned and sample papers',
    support: 'Take teacher-assigned tests and labelled sample NTA-style papers — not official NTA PYQ.',
    cta: 'Browse mocks',
    to: '/tests',
    accent: BLUE,
    mark: 'OM',
  },

  /* ── Compete ── */
  {
    id: 'todays-drill',
    eyebrow: 'Today’s Drill',
    title: 'One mixed set for the day',
    support: 'A short daily mix from your published bank — habit without planning the whole session.',
    cta: 'Start Today’s Drill',
    to: '/todays-drill',
    accent: SEA,
    mark: 'TD',
  },
  {
    id: 'peer-pulse',
    eyebrow: 'Peer Pulse',
    title: 'Spar with one real peer',
    support: 'Share a Spar Code, link a friend, and compare streak, accuracy, and Merit Points.',
    cta: 'Open Peer Pulse',
    to: '/peer-pulse',
    accent: CYAN,
    mark: 'PP',
  },
  {
    id: 'merit-stride',
    eyebrow: 'Merit Stride',
    title: 'Points and focus, not noise',
    support: 'Earn Merit Points from real attempts and keep a Focus Goal you can actually keep.',
    cta: 'Open Merit Stride',
    to: '/merit-stride',
    accent: TEAL,
    mark: 'MS',
  },
  {
    id: 'study-circle',
    eyebrow: 'Study Circle',
    title: 'Peer rooms with a Cohort Code',
    support: 'Create or join a circle — see members and progress without school ERP clutter.',
    cta: 'Open Study Circle',
    to: '/study-circle',
    accent: BLUE_DEEP,
    mark: 'SC',
  },

  /* ── Insights ── */
  {
    id: 'analytics',
    eyebrow: 'Analytics',
    title: 'Trends, streak, and study path',
    support:
      'Track accuracy and pace over time, surface weak chapters, and open an AI study plan. For practice AIR, Exam Fit, and Precision Map, use Form Forecast.',
    cta: 'Open Analytics',
    to: '/analytics',
    accent: BLUE,
    mark: 'A',
  },
  {
    id: 'form-forecast',
    eyebrow: 'Form Forecast',
    title: 'Know where your practice form stands',
    support:
      'Practice AIR with confidence from real attempts — plus Exam Fit /100 & Revision Ladder, Precision Map (time × chapter × type), and Insight Coach priorities in one place.',
    cta: 'Open Form Forecast',
    to: '/form-forecast',
    accent: SEA_DEEP,
    mark: 'FF',
  },
  {
    id: 'career-compass',
    eyebrow: 'Career Compass',
    title: 'From marks to college shortlists',
    support:
      'Exam-day AIR and counselling-ready college matches for JEE Main, Advanced, and NEET — separate from practice form on Form Forecast.',
    cta: 'Open Career Compass',
    to: '/career-compass',
    accent: CYAN,
    mark: 'CC',
  },
  {
    id: 'exam-pulse',
    eyebrow: 'Exam Pulse',
    title: 'Dates, counselling, and focus briefs',
    support: 'Short updates on exams and admissions — stay oriented without scrolling social feeds.',
    cta: 'Open Exam Pulse',
    to: '/exam-pulse',
    accent: TEAL,
    mark: 'EP',
  },
  {
    id: 'leaderboard',
    eyebrow: 'Leaderboard',
    title: 'See how you rank among peers',
    support: 'Friendly standings from real attempts — motivation without turning practice into a circus.',
    cta: 'Open Leaderboard',
    to: '/leaderboard',
    accent: BLUE,
    mark: 'LB',
  },

  /* ── Question Bank ── */
  {
    id: 'qb-curated',
    eyebrow: 'Question Bank',
    title: 'A living bank built like Kota, Hyderabad & Delhi',
    support:
      'Practice with carefully chosen questions in the spirit of India’s top coaching cities — refreshed every day as the bank grows, so every drill and mock pushes you closer to an excellent score.',
    cta: 'Open Question Bank',
    to: '/question-bank',
    accent: BLUE_DEEP,
    mark: 'QB',
  },
  {
    id: 'qb-convert',
    eyebrow: 'Question Bank · Convert',
    title: 'OCR papers into a tagged bank',
    support: 'Convert PDFs, scans, and bulk files into clean JEE & NEET questions ready to review.',
    cta: 'Open Convert (OCR)',
    to: '/question-bank?hub=upload&tab=single',
    accent: SEA,
    mark: 'CV',
  },
  {
    id: 'qb-compose',
    eyebrow: 'Question Bank · Smart Compose',
    title: 'Type one question, done right',
    support:
      'Live math preview, soft checks, AI polish, marks & status — SCQ through passage — save drafts or publish when ready.',
    cta: 'Open Smart Compose',
    to: '/question-bank?hub=upload&tab=compose',
    accent: CYAN,
    mark: 'CQ',
  },

  /* ── Results ── */
  {
    id: 'my-results',
    eyebrow: 'Result analysis',
    title: 'Weak areas, charts, and clear next practice',
    support:
      'Overall Score · Time & Behaviour · Question-wise · Difficulty · Stamina · Chapterwise · Charts · Insight Coach — find weak chapters and reopen targeted practice.',
    cta: 'View My Results',
    to: '/my-results',
    accent: SEA_DEEP,
    mark: 'R',
  },
  {
    id: 'result-weak-areas',
    eyebrow: 'Weak area identification',
    title: 'See what actually costs marks',
    support:
      'Chapter and topic weak spots surface after every attempt — then jump to Syllabus Practice, PYQ, or Form Forecast’s Revision Ladder instead of guessing.',
    cta: 'Open Form Forecast',
    to: '/form-forecast',
    accent: TEAL,
    mark: 'WA',
  },

  /* ── Teachers & exams ── */
  {
    id: 'teacher',
    eyebrow: 'Teachers',
    title: 'Bank, papers, and lecture plans',
    support: 'Upload, compose, assign papers, and plan lectures from one teacher home.',
    cta: 'Teacher home',
    to: '/teacher',
    accent: BLUE_DEEP,
    mark: 'T',
  },
  {
    id: 'schools',
    eyebrow: 'Schools',
    title: 'School Management in one place',
    support: 'Organise classes, assignments, and results without bolting on a separate admin tool.',
    cta: 'Open Schools',
    to: '/admin/schools',
    accent: TEAL,
    mark: 'SM',
  },
  {
    id: 'jee-neet',
    eyebrow: 'JEE · NEET',
    title: 'One product for both paths',
    support: 'PCM and PCB patterns, marking schemes, and counselling flows — without switching tools.',
    cta: 'Build a mock',
    to: '/mock-test',
    accent: BLUE,
    mark: 'JN',
  },
]
