/**
 * TestVantages Tour content — single source for /tour (and /site-map).
 * Mirrors the real top nav: Home → Question Bank (staff) → Prepare → Compete → Insights → Teaching/Admin.
 */

/** @typedef {{ to: string, label: string, desc: string, where?: string, next?: string, openable?: boolean, pathLabel?: string }} SiteMapPage */

/** @typedef {{ id: string, title: string, icon: string, summary: string, pages: SiteMapPage[], flowSteps?: string[], staffOnly?: boolean }} SiteMapSection */

/** @type {SiteMapSection[]} */
export const SITE_MAP_STUDENT_FLOW = [
  {
    id: 'home',
    title: 'Home',
    icon: '🏠',
    summary: 'Your starting place after sign-in — quick links into the real tabs.',
    flowSteps: ['Sign in', 'Home', 'Pick a tab'],
    pages: [
      {
        to: '/login',
        label: 'Sign in',
        desc: 'Open your student or teacher account. Needed before Home and most practice tools unlock.',
        where: 'Top right → Sign in · path /login',
      },
      {
        to: '/home',
        label: 'Home',
        desc: 'Your dashboard with short cuts into Prepare, Compete, and Insights. Same place the Home tab opens.',
        where: 'Top nav → Home · path /home',
        next: 'Prepare',
      },
      {
        to: '/home',
        label: 'Top banner',
        desc: 'Rotating product highlights only — not a separate app. Use the tabs below the banner for real pages.',
        where: 'Strip under the brand bar on every signed-in page',
        pathLabel: '(banner · every page)',
        openable: false,
      },
    ],
  },
  {
    id: 'prepare',
    title: 'Prepare',
    icon: '🎓',
    summary:
      'The only practice hub — study modes including Quick Revision, My Formula Sheet, and Today’s Target. Old bookmark /prep-hub sends you here to /prepare.',
    flowSteps: ['Prepare tab', 'Pick a mode', 'Exam', 'Result'],
    pages: [
      {
        to: '/prepare',
        label: 'Prepare centre',
        desc: 'One page that lists every way to practise, including Quick Revision sheets. Start here if you are not sure which mode to pick. (/prep-hub redirects to this page.)',
        where: 'Top nav → Prepare · path /prepare',
        next: 'Pick a mode',
      },
      {
        to: '/mock-test',
        label: 'AI Mock Builder',
        desc: 'You choose exam and syllabus; AI builds a full NTA-style paper. Real-Time Calibrated is one of the paper options here.',
        where: 'Prepare → AI Mock Builder · path /mock-test',
        next: 'Exam',
      },
      {
        to: '/practice',
        label: 'Syllabus Practice',
        desc: 'Untimed chapter drills. Work in batches, pause, and continue when you are ready.',
        where: 'Prepare → Syllabus Practice · path /practice',
        next: 'Exam',
      },
      {
        to: '/speed-test',
        label: 'Precision Speed Test',
        desc: 'A 15–60 minute timed drill on easier questions so you get faster and more accurate.',
        where: 'Prepare → Precision Speed Test · path /speed-test',
        next: 'Exam',
      },
      {
        to: '/cdf-test',
        label: 'CDF Mastery Test',
        desc: 'Short Concept · Definition · Formula drills with a timer on each question — good for quick revision.',
        where: 'Prepare → CDF Mastery Test · path /cdf-test',
        next: 'Exam',
      },
      {
        to: '/quick-revision',
        label: 'Quick Revision',
        desc: 'Definitions, formulas, and important points by chapter. Filter exam, then subject, then chapter. Download a PDF with the TestVantages name. No need to open Question Bank.',
        where: 'Prepare → Quick Revision · path /quick-revision',
      },
      {
        to: '/formula-sheet',
        label: 'My Formula Sheet',
        desc: 'Pin formulas from Quick Revision into one personal sheet. Download a PDF with the TestVantages name.',
        where: 'Prepare → My Formula Sheet · path /formula-sheet',
      },
      {
        to: '/daily-target',
        label: 'Today’s Target',
        desc: 'Set a question count on your weakest chapters and drill them today. Separate from Today’s Drill mixed set.',
        where: 'Prepare → Today’s Target · path /daily-target',
      },
      {
        to: '/daily-sheet',
        label: 'Daily Practice Sheet',
        desc: 'Dated chapter DPP from your bank. Attempt or print a TestVantages sheet. Separate from Today’s Drill.',
        where: 'Prepare → Daily Practice Sheet · path /daily-sheet',
      },
      {
        to: '/placement-check',
        label: 'Placement check',
        desc: 'Short mixed paper, then weak chapters for Today’s Target. Not a scholarship product.',
        where: 'Prepare → Placement check · path /placement-check',
      },
      {
        to: '/test-series',
        label: 'Series calendar',
        desc: 'Week-by-week dated mock schedule for JEE and NEET Pro Series papers.',
        where: 'Prepare → Series calendar · path /test-series',
      },
      {
        to: '/pyq',
        label: 'PYQ Bank',
        desc: 'Only previous-year questions. Inside this page you pick one of the six PYQ study modes listed below.',
        where: 'Prepare → PYQ Bank · path /pyq',
        next: 'Pick a PYQ mode',
      },
      {
        to: '/pyq',
        label: 'PYQ · Syllabus Practice',
        desc: 'Untimed PYQ batches by subject, unit, and chapter — same idea as Syllabus Practice, but every question is a past paper item.',
        where: 'Prepare → PYQ Bank → Syllabus Practice tab · path /pyq',
      },
      {
        to: '/pyq',
        label: 'PYQ · Comprehensive PYQ Test',
        desc: 'A full-length timed paper made only from previous-year questions across subjects.',
        where: 'Prepare → PYQ Bank → Comprehensive PYQ Test tab · path /pyq',
      },
      {
        to: '/pyq',
        label: 'PYQ · Subject PYQ Proficiency',
        desc: 'A shorter timed PYQ paper focused on one subject.',
        where: 'Prepare → PYQ Bank → Subject PYQ Proficiency tab · path /pyq',
      },
      {
        to: '/pyq',
        label: 'PYQ · Chapter PYQ Proficiency',
        desc: 'A shorter timed PYQ paper focused on chapter or topic picks.',
        where: 'Prepare → PYQ Bank → Chapter PYQ Proficiency tab · path /pyq',
      },
      {
        to: '/pyq',
        label: 'PYQ · Real-Time Calibrated PYQ',
        desc: 'Adaptive PYQ — the level moves after each answer so the set stays challenging.',
        where: 'Prepare → PYQ Bank → Real-Time Calibrated PYQ tab · path /pyq',
      },
      {
        to: '/pyq',
        label: 'PYQ · Year-wise Paper',
        desc: 'Pick a year, then a sitting from the paper calendar. Papers appear after staff import official NTA / Advanced / NEET PDFs.',
        where: 'Prepare → PYQ Bank → Year-wise Paper tab · path /pyq',
      },
      {
        to: '/tests',
        label: 'Mock Tests',
        desc: 'Papers your teacher assigned, plus labelled sample NTA-style papers (not official NTA PYQ).',
        where: 'Prepare → Mock Tests · path /tests',
        next: 'Exam',
      },
    ],
  },
  {
    id: 'compete',
    title: 'Compete',
    icon: '🔗',
    summary: 'Daily habit and peer loops — also linked from the Prepare centre.',
    flowSteps: ['Compete tab', 'Today’s Drill', 'Peer / Merit / Circle'],
    pages: [
      {
        to: '/todays-drill',
        label: 'Today’s Drill',
        desc: 'One mixed daily set for JEE or NEET. Finish it to keep the habit and earn Merit Points.',
        where: 'Top nav → Compete → Today’s Drill · path /todays-drill',
        next: 'Exam',
      },
      {
        to: '/peer-pulse',
        label: 'Peer Pulse',
        desc: 'Link one friend with a Spar Code and compare streak, accuracy, points, and today’s score.',
        where: 'Top nav → Compete → Peer Pulse · path /peer-pulse',
        next: 'Merit Stride',
      },
      {
        to: '/merit-stride',
        label: 'Merit Stride',
        desc: 'See Merit Points, Stride Badges, and your daily Focus Goal in one place.',
        where: 'Top nav → Compete → Merit Stride · path /merit-stride',
      },
      {
        to: '/study-circle',
        label: 'Study Circle',
        desc: 'Create or join a peer room with a Cohort Code. This is friends studying together — not School Management.',
        where: 'Top nav → Compete → Study Circle · path /study-circle',
      },
      {
        to: '/doubts',
        label: 'Ask Your Doubt',
        desc: 'Post a doubt from a result question — text, file, or voice. Peers can reply. Does not copy the question stem.',
        where: 'Top nav → Compete → Ask Your Doubt · path /doubts',
      },
    ],
  },
  {
    id: 'insights',
    title: 'Insights',
    icon: '📈',
    summary: 'Results, trends, Form Forecast (with tools inside it), career match, exam news, and ranks.',
    flowSteps: ['Insights tab', 'My Results / Analytics', 'Form Forecast'],
    pages: [
      {
        to: '/my-results',
        label: 'My Results',
        desc: 'Every attempt you have finished. Open any one again for full analysis.',
        where: 'Top nav → Insights → My Results · path /my-results',
        next: 'Result',
      },
      {
        to: '/analytics',
        label: 'Analytics',
        desc: 'Trends over time: streak, weak chapters, and a study path. Use Form Forecast for practice AIR and Exam Fit.',
        where: 'Top nav → Insights → Analytics · path /analytics',
        next: 'Form Forecast',
      },
      {
        to: '/form-forecast',
        label: 'Form Forecast',
        desc: 'Practice-based AIR with a confidence band from your mocks. Exam Fit, Revision Ladder, Precision Map, and Insight Coach live as sections on this same page — not separate top-nav products.',
        where: 'Top nav → Insights → Form Forecast · path /form-forecast',
        next: 'Career Compass',
      },
      {
        to: '/career-compass',
        label: 'Career Compass',
        desc: 'Exam-day style: marks → likely rank, college–branch match, fees and placements. Use beside Form Forecast, not instead of it.',
        where: 'Top nav → Insights → Career Compass · path /career-compass',
      },
      {
        to: '/exam-pulse',
        label: 'Exam Pulse',
        desc: 'Short updates on exams, counselling, placements, and motivation notes.',
        where: 'Top nav → Insights → Exam Pulse · path /exam-pulse',
      },
      {
        to: '/leaderboard',
        label: 'Leaderboard',
        desc: 'See how you rank against peers on the same tests.',
        where: 'Top nav → Insights → Leaderboard · path /leaderboard',
      },
    ],
  },
  {
    id: 'form-forecast-inside',
    title: 'Inside Form Forecast',
    icon: '🎯',
    summary:
      'Sections on the Form Forecast page only — not separate tabs in the top nav.',
    pages: [
      {
        to: '/form-forecast#exam-fit',
        label: 'Exam Fit',
        desc: 'A score out of 100 for how ready your practice form looks right now.',
        where: 'Insights → Form Forecast → Exam Fit section · #exam-fit',
      },
      {
        to: '/form-forecast#revision-ladder',
        label: 'Revision Ladder',
        desc: 'An ordered list of chapters to revise next, based on your attempts.',
        where: 'Insights → Form Forecast → Revision Ladder section · #revision-ladder',
      },
      {
        to: '/form-forecast#precision-map',
        label: 'Precision Map',
        desc: 'Shows where time and accuracy slip by chapter and question type.',
        where: 'Insights → Form Forecast → Precision Map section · #precision-map',
      },
      {
        to: '/form-forecast#insight-coach',
        label: 'Insight Coach',
        desc: 'Short priorities and tips from your overall practice form (same family as tips on a single result).',
        where: 'Insights → Form Forecast → Insight Coach section · #insight-coach',
      },
    ],
  },
  {
    id: 'exam',
    title: 'Exam & result',
    icon: '📝',
    summary: 'What opens after you start any test from Prepare, Compete, or Mock tests.',
    flowSteps: ['Answer', 'Submit', 'Score', 'Insight Coach · This test'],
    pages: [
      {
        to: '/exam/:testId',
        label: 'Live exam',
        desc: 'The timed paper screen — question palette, mark for review, and sections. Opens only when you start a test.',
        where: 'Starts from any mode’s Start / Begin button · path /exam/…',
        next: 'Result',
        openable: false,
      },
      {
        to: '/result/:testId',
        label: 'Result & analysis',
        desc: 'Score, percentile, time behaviour, and chapter breakdown for that attempt.',
        where: 'After you submit · also My Results → open a row · path /result/…',
        next: 'My Results',
        openable: false,
      },
      {
        to: '/result/:testId',
        label: 'Insight Coach · This test',
        desc: 'Personal tips for this one attempt — strengths, focus areas, and next steps. Sibling of Form Forecast’s Insight Coach.',
        where: 'Result page → Insight Coach tab',
        openable: false,
      },
    ],
  },
]

/** @type {SiteMapSection[]} */
export const SITE_MAP_TEACHER_FLOW = [
  {
    id: 'bank',
    title: 'Question Bank',
    icon: '📚',
    staffOnly: true,
    summary:
      'Staff only — sits next to Home in the top bar. Sign in as Admin or Teacher to open it. Students never see this tab.',
    flowSteps: ['Convert / Compose', 'Review', 'Publish', 'Use in papers'],
    pages: [
      {
        to: '/question-bank?hub=upload',
        label: 'Convert',
        desc: 'Turn PDF/images into drafts with OCR, hybrid upload, PDF crop, or bulk JSON/CSV.',
        where: 'Top nav → Question Bank → Convert / Upload · path /question-bank?hub=upload',
        next: 'Draft list',
      },
      {
        to: '/question-bank?hub=upload&tab=compose',
        label: 'Smart Compose',
        desc: 'Type questions with live math preview, soft checks, AI polish, marks, status, and tags — all bank types.',
        where: 'Question Bank → Smart Compose · path /question-bank?hub=upload&tab=compose',
        next: 'Draft list',
      },
      {
        to: '/question-bank?hub=view&view=draft',
        label: 'Saved questions',
        desc: 'Browse draft and published lists with filters before you send items to review.',
        where: 'Question Bank → View · path /question-bank?hub=view',
        next: 'Review',
      },
      {
        to: '/question-bank/review',
        label: 'Review & publish',
        desc: 'Queues for untagged, PYQ, and ready-to-publish items so the student bank stays clean.',
        where: 'Question Bank → Review & publish · path /question-bank/review',
        next: 'Published bank',
      },
      {
        to: '/question-bank/reports',
        label: 'Question reports',
        desc: 'Open queue of problems students or teachers flagged on a question. Mark reviewed — reports never delete or unpublish a question.',
        where: 'Question Bank → Question reports · path /question-bank/reports',
      },
      {
        to: '/question-bank?hub=manage',
        label: 'Manage meta',
        desc: 'Edit subjects, units, chapters, and exam patterns used across the bank.',
        where: 'Question Bank → Manage · path /question-bank?hub=manage',
      },
      {
        to: '/merge-banks',
        label: 'Merge banks',
        desc: 'Import question JSON from another computer into this bank.',
        where: 'Admin → Merge banks · path /merge-banks',
      },
      {
        to: '/upload',
        label: 'Upload PDF',
        desc: 'One upload page with a document type: Official PYQ (admin), any test paper, or a book / question bank PDF read in page ranges. All three use the same checks, review and Approve & Publish.',
        where: 'Admin → Upload PDF · path /upload',
      },
      {
        to: '/upload?type=official',
        label: 'Approve official papers',
        desc: 'Admin step: approve pending official PYQ so they appear in the student PYQ Bank.',
        where: 'Upload PDF → Official PYQ · path /upload?type=official (old path /official-pyq still works)',
      },
      {
        to: '/upload?type=book',
        label: 'Book / question bank PDF',
        desc: 'Upload a whole book, read it one page range at a time. Each exercise becomes a card set tagged with book, chapter and exercise; solved examples keep their printed solutions. Publishes to the Question Bank only.',
        where: 'Upload PDF → Book / question bank PDF · path /upload?type=book',
      },
    ],
  },
  {
    id: 'papers',
    title: 'Create & assign papers',
    icon: '📋',
    staffOnly: true,
    summary: 'Build papers from the bank and send them to students as Mock Tests.',
    flowSteps: ['Create paper', 'Edit', 'Publish', 'Students take test'],
    pages: [
      {
        to: '/create-test',
        label: 'Create test',
        desc: 'Paper wizard — pick questions from the bank and set timing.',
        where: 'Teaching / Admin → Create test · path /create-test',
        next: 'Edit test',
      },
      {
        to: '/edit-test',
        label: 'Edit test',
        desc: 'Open draft and published papers to change questions or settings.',
        where: 'Teaching / Admin → Edit test · path /edit-test',
        next: 'Publish review',
      },
      {
        to: '/publish-review/:testId',
        label: 'Publish review',
        desc: 'Final checklist before students can see the paper.',
        where: 'After create/edit → Publish review · path /publish-review/…',
        next: 'Manifest',
        openable: false,
      },
      {
        to: '/paper-manifest/:testId',
        label: 'Paper manifest',
        desc: 'Download the paper manifest and assign the test to a class.',
        where: 'After publish review · path /paper-manifest/…',
        next: 'Mock Tests',
        openable: false,
      },
    ],
  },
  {
    id: 'ops',
    title: 'Teaching & School Management',
    icon: '🏫',
    staffOnly: true,
    summary: 'Teacher hub and school workspace (people, attendance, fees, timetable, exams).',
    pages: [
      {
        to: '/teacher',
        label: 'Teacher home',
        desc: 'Teacher starting hub: bank, papers, Lecture Planner, and upload shortcuts.',
        where: 'Top nav → Teaching · path /teacher',
        next: 'Question Bank',
      },
      {
        to: '/teacher/lecture-planner',
        label: 'Lecture Planner',
        desc: 'Plan a class with AI help, bank picks, teaching order, and topic notes.',
        where: 'Teaching → Lecture Planner · path /teacher/lecture-planner',
        next: 'Lecture set',
      },
      {
        to: '/teacher/lecture-questions',
        label: 'Lecture set',
        desc: 'Classroom question set tagged Source = Lecture for that session.',
        where: 'Teaching → Lecture set · path /teacher/lecture-questions',
      },
      {
        to: '/admin/schools',
        label: 'Schools',
        desc: 'School Management hub — list of schools and modules (people, daily ops, learning).',
        where: 'Teaching / Admin → Schools · path /admin/schools',
        next: 'School page',
      },
      {
        to: '/admin/schools/:schoolId',
        label: 'School page',
        desc: 'One school’s classes, students, staff, attendance, fees, timetable, exams, and reports.',
        where: 'School Management → open a school · path /admin/schools/…',
        openable: false,
      },
      {
        to: '/teacher/results',
        label: 'Student results',
        desc: 'See class attempts and open the same analysis students get.',
        where: 'Teaching → Student results · path /teacher/results',
        next: 'Result',
      },
      {
        to: '/admin',
        label: 'OCR settings',
        desc: 'Platform and OCR configuration, plus teacher account tools for admins.',
        where: 'Top nav → Admin · path /admin',
      },
    ],
  },
]

/** Short journeys for the visual flow strip */
export const SITE_MAP_JOURNEYS = [
  {
    id: 'student',
    label: 'Typical student',
    steps: ['Home', 'Prepare', 'AI Mock', 'Exam', 'Result', 'Insights'],
  },
  {
    id: 'compete',
    label: 'Daily compete loop',
    steps: ['Compete', 'Today’s Drill', 'Peer Pulse', 'Merit Stride'],
  },
  {
    id: 'teacher',
    label: 'Typical teacher',
    steps: ['Question Bank', 'Convert / Compose', 'Review', 'Create paper', 'Student results'],
  },
]

export const SITE_MAP_GO_LIVE_NOTE =
  'On a hosted live server, peer comparison uses attempts from all students. While you still use Cursor at 127.0.0.1, ranks are from real attempts in this browser (plus the API if it is running) — never a fake All-India seed.'

/** Jump links matching the real top-nav groups */
export const SITE_MAP_NAV_JUMPS = [
  { id: 'home', label: 'Home' },
  { id: 'bank', label: 'Question Bank', staffOnly: true },
  { id: 'prepare', label: 'Prepare' },
  { id: 'compete', label: 'Compete' },
  { id: 'insights', label: 'Insights' },
  { id: 'ops', label: 'Teaching / Admin', staffOnly: true },
]
