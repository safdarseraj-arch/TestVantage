/**
 * Factual product map vs a public JEE/NEET prep site (acadza.com + Play listing).
 * Their published counts are their claims, not our audit. No copied papers or branding.
 */

export const COMPARE_THEIR_LIST = [
  {
    title: 'Study material pack',
    detail:
      'They advertise a full syllabus pack: theory, examples, chapter summaries, about 2.6 lakh questions (Play listing also says a much larger number), about 9,000 formulas, and about 4,500 lecture videos. Pick exam, subject, and concept.',
  },
  {
    title: 'Practice and mocks',
    detail:
      'Make assignments and tests by chapter, concept, difficulty, and question type. Unlimited mocks on their site. Super-tough questions. Paper patterns they name: JEE Main, Advanced, BITSAT, NEET, CET.',
  },
  {
    title: 'Previous-year papers',
    detail: 'They advertise PYQ papers from 1975–2022 to match the exam style.',
  },
  {
    title: 'Formula sheets',
    detail: 'Build and download a custom formula sheet, with memory tips.',
  },
  {
    title: 'Backlog plan',
    detail: 'A catch-up plan from missed chapters to current class, with reminders and check tests.',
  },
  {
    title: 'Revision pack',
    detail: 'They say faculty pick five “most probable” questions for a topic.',
  },
  {
    title: 'Speed booster',
    detail: 'Timed picking and clicking drills, plus racing friends or All-India rankers.',
  },
  {
    title: 'Doubt and mentor (paid add-on)',
    detail: 'Chanakya-style help: plan, doubt, and motivation, they say within 12 hours.',
  },
  {
    title: 'Rank and college from practice',
    detail: 'Percentile, rank, and college guesses from test scores. Weak / slow / mistake / “danger” reports and a one-click remedy.',
  },
  {
    title: 'Classes and phone app',
    detail: 'Live and recorded classes, class alerts, and an Android app (Acadza Dost).',
  },
]

export const COMPARE_OUR_LIST = [
  {
    title: 'Prepare centre',
    detail:
      'One student hub: AI Mock Builder, Syllabus Practice, Precision Speed, CDF Mastery, Quick Revision, My Formula Sheet, Today’s Target, Daily Practice Sheet, Placement check, Series calendar, PYQ Bank, Mock tests.',
  },
  {
    title: 'Question Bank (staff only)',
    detail:
      'Your own Kota-style bank. Convert OCR (PDF, image, Word). Smart Compose to type questions. Gemini trial drafts. Review queues. Students never see this tab.',
  },
  {
    title: 'Question reports',
    detail: 'Flag a bad question from bank or result. Staff mark it reviewed. Reports never delete the bank.',
  },
  {
    title: 'PYQ Bank',
    detail:
      'Six modes: syllabus practice, full PYQ mock, subject, chapter, calibrated, and year-wise paper. Year-wise uses a paper calendar (year → date/shift or Paper 1/2).',
  },
  {
    title: 'Compete',
    detail:
      'Today’s Drill, Peer Pulse, Merit Stride, Study Circle, Ask Your Doubt (including from a result question).',
  },
  {
    title: 'Insights',
    detail:
      'My Results, Analytics, Form Forecast (practice AIR, Exam Fit, Revision Ladder, Precision Map, Insight Coach), Career Compass (exam-day colleges), Exam Pulse, Leaderboard.',
  },
  {
    title: 'Teaching',
    detail: 'Lecture Planner, lecture question sets, create/assign papers, School Management, teacher results.',
  },
]

/** @type {{ area: string, they: string, we: string, session: string, skip: string }[]} */
export const COMPARE_ROWS = [
  {
    area: 'Practice tests you design',
    they: 'Yes — assignments and unlimited mocks by chapter, type, and level',
    we: 'Yes — Syllabus Practice, AI Mock Builder, mock tests',
    session: 'Already had',
    skip: '—',
  },
  {
    area: 'Previous-year questions',
    they: 'Yes — they advertise 1975–2022 papers',
    we: 'Yes — PYQ Bank after staff import official papers (empty until then)',
    session: 'Added paper calendar (year + sitting)',
    skip: 'We do not import their papers',
  },
  {
    area: 'Formula sheet',
    they: 'Yes — custom download + memory tips',
    we: 'Yes — Quick Revision by chapter',
    session: 'Added My Formula Sheet (pin + PDF)',
    skip: '—',
  },
  {
    area: 'Backlog / daily target',
    they: 'Yes — Backlog Remover plan',
    we: 'Partly — Revision Ladder + Today’s Drill',
    session: 'Added Today’s Target (weak chapters, 15/25/40 Q)',
    skip: '—',
  },
  {
    area: 'Doubt on a question',
    they: 'Yes — paid mentor chat (they say under 12 hours)',
    we: 'Page existed but was off the menu',
    session: 'Wired Ask Your Doubt + result “Ask doubt”',
    skip: 'No paid 12-hour human mentor desk',
  },
  {
    area: 'Speed under the clock',
    they: 'Yes — picking/clicking + race rankers',
    we: 'Yes — Precision Speed, CDF timers, Peer Pulse',
    session: 'Already had',
    skip: 'No separate “race All-India rankers” product',
  },
  {
    area: 'Rank and college guess',
    they: 'Yes — from practice scores',
    we: 'Yes — Form Forecast (practice form) and Career Compass (exam-day colleges)',
    session: 'Already had',
    skip: '—',
  },
  {
    area: 'Weak-area reports',
    they: 'Yes — weak / slow / mistake / danger + one-click remedy',
    we: 'Yes — result analysis, Analytics, Form Forecast, question reports',
    session: 'Already had',
    skip: '—',
  },
  {
    area: 'Ready-made video library',
    they: 'Yes — they advertise ~4,500 videos and live class',
    we: 'Lecture Planner + optional video link on a question if a teacher adds one',
    session: 'Not added',
    skip: 'We will not buy or copy their video pack',
  },
  {
    area: 'Phone app',
    they: 'Yes — Android app',
    we: 'Browser app now; native phone app later',
    session: 'Not added',
    skip: 'Native app is a later phase — browser is the live product',
  },
  {
    area: 'Build your own bank (OCR)',
    they: 'Not their public story — they sell a packed library',
    we: 'Yes — Convert OCR, Smart Compose, Gemini trial drafts',
    session: 'Already had',
    skip: '—',
  },
  {
    area: 'Five “most probable” questions',
    they: 'Yes — they say faculty pick five per topic',
    we: 'Quick Revision + CDF + PYQ chapter tests',
    session: 'Not added',
    skip: 'We do not have their private probable-question list',
  },
]

export const COMPARE_SOURCES =
  'Based on their public site (DOSTs and “tension” pages), Play listing, and shop listing. Direct page loads were often a wait screen; we used indexed public copy. Counts are their claims.'
