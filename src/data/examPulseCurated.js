/**
 * Exam Pulse — curated baseline headlines for JEE / NEET aspirants.
 * Used when live RSS / Gemini is offline. Prefer official portals + reputable education desks.
 */

/** @typedef {'exams' | 'admissions' | 'placements' | 'motivation'} ExamPulseCategory */
/** @typedef {'official' | 'ai' | 'curated' | 'news'} ExamPulseBadge */

/**
 * @typedef {{
 *   id: string
 *   category: ExamPulseCategory
 *   badge: ExamPulseBadge
 *   title: string
 *   summary: string
 *   whyItMatters: string
 *   source: string
 *   sourceUrl: string
 *   publishedAt: string
 * }} ExamPulseItem
 */

/** @type {ExamPulseItem[]} */
export const EXAM_PULSE_CURATED = [
  {
    id: 'cur-nta-home',
    category: 'exams',
    badge: 'official',
    title: 'Check NTA for the latest JEE Main / NEET notices',
    summary:
      'Session dates, city intimation slips, admit cards, and score cards are published only on the National Testing Agency site. Bookmark and verify before acting on social forwards.',
    whyItMatters:
      'Fake “admit card” links and date rumours spread fast — NTA is the single source of truth.',
    source: 'NTA',
    sourceUrl: 'https://nta.ac.in/',
    publishedAt: '2026-01-15',
  },
  {
    id: 'cur-jee-main-portal',
    category: 'exams',
    badge: 'official',
    title: 'JEE (Main) candidate login & information bulletin',
    summary:
      'Use the official JEE Main portal for registration, corrections, and download of admit cards. Ignore unofficial “leak” or shortcut claims.',
    whyItMatters:
      'Corrections and city intimation windows are short — missing the official portal costs attempts.',
    source: 'JEE Main (NTA)',
    sourceUrl: 'https://jeemain.nta.nic.in/',
    publishedAt: '2026-01-15',
  },
  {
    id: 'cur-jee-adv',
    category: 'exams',
    badge: 'official',
    title: 'JEE Advanced — IIT organising zone updates',
    summary:
      'Eligibility, registration windows, and paper pattern notes appear on the JEE Advanced site run by the organising IIT. Confirm year-specific rules every season.',
    whyItMatters:
      'Eligibility and paper pattern can shift slightly year to year — never rely on last year’s notes alone.',
    source: 'JEE Advanced',
    sourceUrl: 'https://jeeadv.ac.in/',
    publishedAt: '2026-01-10',
  },
  {
    id: 'cur-neet',
    category: 'exams',
    badge: 'official',
    title: 'NEET (UG) — official candidate information',
    summary:
      'NEET UG notices, application, and results are issued through NTA’s NEET portal. Always cross-check counselling later on MCC / state portals.',
    whyItMatters:
      'Application and result dates drive your revision calendar — set reminders from the official NEET site only.',
    source: 'NEET (NTA)',
    sourceUrl: 'https://neet.nta.nic.in/',
    publishedAt: '2026-01-10',
  },
  {
    id: 'cur-josaa',
    category: 'admissions',
    badge: 'official',
    title: 'JoSAA counselling — seat allocation & cut-offs',
    summary:
      'IIT / NIT / IIIT / GFTI seat allotment rounds, opening–closing ranks, and document guidelines are published on JoSAA. Keep category and home-state rules handy.',
    whyItMatters:
      'Freeze / float / slide choices are irreversible once locked — read the round’s business rules before you click.',
    source: 'JoSAA',
    sourceUrl: 'https://josaa.nic.in/',
    publishedAt: '2025-12-01',
  },
  {
    id: 'cur-csab',
    category: 'admissions',
    badge: 'official',
    title: 'CSAB special rounds after JoSAA',
    summary:
      'Vacant seats in NITs / IIITs / GFTIs after JoSAA are handled via CSAB. Read eligibility and freeze/float rules before each special round.',
    whyItMatters:
      'Many students find a better branch/institute in special rounds — participation needs a separate CSAB registration.',
    source: 'CSAB',
    sourceUrl: 'https://csab.nic.in/',
    publishedAt: '2025-12-01',
  },
  {
    id: 'cur-mcc',
    category: 'admissions',
    badge: 'official',
    title: 'MCC NEET UG counselling for AIQ seats',
    summary:
      'All India Quota MBBS / BDS counselling, choice filling, and allotment letters run through MCC. State quota seats follow your state counselling authority.',
    whyItMatters:
      'AIQ and state quota calendars differ — missing an MCC round can cost a preferred college forever.',
    source: 'MCC',
    sourceUrl: 'https://mcc.nic.in/',
    publishedAt: '2025-12-01',
  },
  {
    id: 'cur-place-campus',
    category: 'placements',
    badge: 'curated',
    title: 'Campus placements: skills that hiring managers still shortlist',
    summary:
      'For engineering aspirants, strong fundamentals (DSA, core subject depth) plus internships and clear communication remain the durable signals — not last-minute certificate stacks.',
    whyItMatters:
      'What you build in Class 11–first year shows up in interviews more than a rush of certificates in final year.',
    source: 'TestVantages Briefing',
    sourceUrl: 'https://nta.ac.in/',
    publishedAt: '2026-02-01',
  },
  {
    id: 'cur-place-intern',
    category: 'placements',
    badge: 'curated',
    title: 'Early internships beat last-year panic applications',
    summary:
      'Students who start small projects or research exposure in Class 11–first year of college usually interview calmer. Build a short portfolio of real work, not empty résumé lines.',
    whyItMatters:
      'A thin but real project beats ten empty résumé lines when campus shortlists begin.',
    source: 'TestVantages Briefing',
    sourceUrl: 'https://jeemain.nta.nic.in/',
    publishedAt: '2026-02-01',
  },
  {
    id: 'cur-mot-pace',
    category: 'motivation',
    badge: 'curated',
    title: 'Steady daily blocks beat weekend cramming',
    summary:
      'Two focused 90-minute sessions with a short review beat a single exhausted all-nighter. Protect sleep — accuracy drops when rest is sacrificed for “extra” hours.',
    whyItMatters:
      'Accuracy in mocks collapses when sleep is traded for “extra” hours — pace is a scoring skill.',
    source: 'TestVantages Briefing',
    sourceUrl: 'https://nta.ac.in/',
    publishedAt: '2026-03-01',
  },
  {
    id: 'cur-mot-mock',
    category: 'motivation',
    badge: 'curated',
    title: 'Treat every mock as feedback, not a verdict',
    summary:
      'One low mock score is data: which chapter, which error type, which time trap. Fix one pattern this week, then retest. Rankers improve by iteration, not perfection on day one.',
    whyItMatters:
      'Rankers treat one bad mock as a fix-list, not a personality judgment — iteration wins.',
    source: 'TestVantages Briefing',
    sourceUrl: 'https://nta.ac.in/',
    publishedAt: '2026-03-01',
  },
  {
    id: 'cur-edu-desk',
    category: 'admissions',
    badge: 'curated',
    title: 'Follow education desks — not random forwards',
    summary:
      'Reputable newspaper education sections and official portals are safer than WhatsApp forwards about “secret cut-offs” or fake admit-card links. When in doubt, open the official URL yourself.',
    whyItMatters:
      'One wrong forward can send you to a phishing page — type official URLs yourself.',
    source: 'The Hindu Education',
    sourceUrl: 'https://www.thehindu.com/education/',
    publishedAt: '2026-02-15',
  },
]

/** Category tabs for the Exam Pulse UI */
export const EXAM_PULSE_CATEGORIES = [
  { id: 'exams', label: 'Exam updates', hint: 'JEE · NEET · NTA' },
  { id: 'admissions', label: 'Counselling', hint: 'JoSAA · CSAB · MCC' },
  { id: 'placements', label: 'Placements', hint: 'Careers · skills' },
  { id: 'motivation', label: 'Motivation', hint: 'Focus · study tips' },
]

/** Public RSS feeds (no paywall scrape — titles/summaries only). */
export const EXAM_PULSE_RSS_FEEDS = [
  {
    id: 'hindu-edu',
    label: 'The Hindu — Education',
    url: 'https://www.thehindu.com/education/feeder/default.rss',
    defaultCategory: /** @type {ExamPulseCategory} */ ('admissions'),
  },
  {
    id: 'ie-edu',
    label: 'Indian Express — Education',
    url: 'https://indianexpress.com/section/education/feed/',
    defaultCategory: /** @type {ExamPulseCategory} */ ('admissions'),
  },
]

export const EXAM_PULSE_OFFICIAL_PORTALS = [
  { id: 'nta', label: 'NTA', url: 'https://nta.ac.in/' },
  { id: 'jee-main', label: 'JEE Main', url: 'https://jeemain.nta.nic.in/' },
  { id: 'jee-adv', label: 'JEE Advanced', url: 'https://jeeadv.ac.in/' },
  { id: 'neet', label: 'NEET', url: 'https://neet.nta.nic.in/' },
  { id: 'josaa', label: 'JoSAA', url: 'https://josaa.nic.in/' },
  { id: 'csab', label: 'CSAB', url: 'https://csab.nic.in/' },
  { id: 'mcc', label: 'MCC', url: 'https://mcc.nic.in/' },
]
