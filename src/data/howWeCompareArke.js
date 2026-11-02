/**
 * Factual product map vs ARKE Scholars (arkescholars.com).
 * Public marketing claims only. No copied questions, papers, or brand assets.
 */

export const ARKE_THEIR_LIST = [
  {
    title: 'Live class institute (JEE / NEET / Foundation)',
    detail:
      'They sell online coaching: HD live classes with polls, recordings they say go up in 30 minutes, plus a faculty summary PDF and notes. Foundation track names Olympiads and NTSE.',
  },
  {
    title: 'Daily Practice Sheets',
    detail: 'JEE program lists Daily Practice Sheets as a core habit after class — a dated sheet, not only a mixed daily quiz.',
  },
  {
    title: 'All India Test Series',
    detail: 'JEE program advertises an All India Test Series with mentorship. Public pages do not show a student exam screen.',
  },
  {
    title: 'Scholarship / placement test (AST)',
    detail: 'ARKE Scholarship Test (AST) is their fee-discount test. High scorers they say can get up to 100% scholarship. Contact form to a counsellor.',
  },
  {
    title: 'Doubt desk',
    detail: '24/7 Doubt Counter on the app. They say subject experts reply within 30 minutes at peak hours, plus video solutions for popular doubts.',
  },
  {
    title: 'NEET extras they name',
    detail: 'NCERT word-to-word, 3D biology sessions, and visualization-led medical coaching.',
  },
  {
    title: 'Performance analytics',
    detail: 'They advertise in-depth AI reports to track improvement, plus personalized paths from strong and weak points.',
  },
  {
    title: 'Phone app',
    detail: 'ARKE Scholars app: offline downloads, practice tests, live notifications. Homepage still says Play Store and App Store “Coming Soon”.',
  },
]

export const ARKE_ROWS = [
  {
    area: 'Daily practice sheet after class',
    they: 'Yes — Daily Practice Sheets on the JEE program',
    we: 'Today’s Drill is a mixed 10-Q compete set',
    session: 'Added Daily Practice Sheet (chapter sheet + print)',
    skip: '—',
  },
  {
    area: 'Scheduled test series calendar',
    they: 'Yes — they advertise All India Test Series',
    we: 'Mock tests + a Pro Series page that was not in the menu',
    session: 'Wired Series calendar on Prepare',
    skip: 'We do not copy their paper set or “All India” brand',
  },
  {
    area: 'Where-you-stand diagnostic',
    they: 'Yes — AST scholarship test as a lead funnel',
    we: 'Mocks and Forecast after you already attempt',
    session: 'Added Placement check (short mixed paper → Today’s Target)',
    skip: 'No fee-scholarship product or their AST name',
  },
  {
    area: 'Live HD class + polls + recap PDF',
    they: 'Yes — daily live stream, poll, recording, summary PDF',
    we: 'Lecture Planner + optional video link a teacher adds',
    session: 'Not added',
    skip: 'We are a test/bank product, not a live-class studio',
  },
  {
    area: '30-minute human doubt + video answers',
    they: 'Yes — they claim 24/7 desk, 30 min at peak',
    we: 'Ask Your Doubt (peers / staff on a question)',
    session: 'Already had (Acadza pass)',
    skip: 'No paid 30-minute human desk or their video pack',
  },
  {
    area: 'NCERT word-to-word / 3D biology',
    they: 'Yes — named on the NEET card',
    we: 'NEET PYQ + your own bank tags',
    session: 'Not added',
    skip: 'We will not copy their NCERT pack or 3D videos',
  },
  {
    area: 'Analytics and weak-area path',
    they: 'Yes — they advertise AI reports',
    we: 'Results, Analytics, Form Forecast, Career Compass',
    session: 'Already had',
    skip: '—',
  },
  {
    area: 'Phone app / offline class download',
    they: 'Advertised — still “Coming Soon” on their site',
    we: 'Browser app now; native phone app later',
    session: 'Not added',
    skip: 'Native app is a later phase — browser is the live product',
  },
  {
    area: 'Build your own bank (OCR)',
    they: 'Not their public story — they sell classes and sheets',
    we: 'Convert OCR, Smart Compose, Gemini trial drafts',
    session: 'Already had',
    skip: '—',
  },
]

export const ARKE_SOURCES =
  'Based on the public homepage https://www.arkescholars.com/ (JEE / NEET / Foundation cards, Why Us, FAQs, app block). Extra paths like /jee and /login returned 404. Faculty photos are marked as placeholders on their site. Counts and “15k selections” are their claims, not our audit.'
