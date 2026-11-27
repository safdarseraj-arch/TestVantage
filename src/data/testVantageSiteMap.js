/**
 * Product Tour content — single source for /tour (and /site-map).
 * Mirrors the real top nav: Home → Question Bank (staff) → Practice → Challenges → Progress → Classroom/Admin.
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
        desc: 'Your dashboard with short cuts into Practice, Challenges, and Progress. Same place the Home tab opens.',
        where: 'Top nav → Home · path /home',
        next: 'Practice',
      },
      {
        to: '/home',
        label: 'Home banner',
        desc: 'Five rotating product highlights on Home only (Practice Hub, Mock, PYQ, High mistake/skip, Rank Forecast). Other pages keep the tabs without this banner.',
        where: 'Strip under the brand bar on Home',
        pathLabel: '(banner · Home only)',
        openable: false,
      },
    ],
  },
  {
    id: 'prepare',
    title: 'Practice',
    icon: '🎓',
    summary:
      'The only practice hub — study modes including High mistake, High skip, Quick Revision, Formula Sheet, and Daily Target. Old bookmark /prep-hub sends you here to /prepare.',
    flowSteps: ['Practice tab', 'Pick a mode', 'Exam', 'Result'],
    pages: [
      {
        to: '/prepare',
        label: 'Practice Hub',
        desc: 'One page that lists every way to practise, including Quick Revision sheets. Start here if you are not sure which mode to pick. (/prep-hub redirects to this page.)',
        where: 'Top nav → Practice · path /prepare',
        next: 'Pick a mode',
      },
      {
        to: '/mock-test',
        label: 'Mock Builder',
        desc: 'You choose exam and syllabus; AI builds a full NTA-style paper. Real-Time Calibrated is one of the paper options here.',
        where: 'Practice → AI Mock Builder · path /mock-test',
        next: 'Exam',
      },
      {
        to: '/practice',
        label: 'Syllabus Practice',
        desc: 'Untimed chapter drills. Work in batches, pause, and continue when you are ready.',
        where: 'Practice → Syllabus Practice · path /practice',
        next: 'Exam',
      },
      {
        to: '/high-mistake',
        label: 'High mistake',
        desc: 'Category of questions classmates get wrong most often. Practice self-paced or Take test timed.',
        where: 'Practice → High mistake · path /high-mistake',
        next: 'Exam',
      },
      {
        to: '/high-skip',
        label: 'High skip',
        desc: 'Category of questions classmates leave blank most often. Practice self-paced or Take test timed.',
        where: 'Practice → High skip · path /high-skip',
        next: 'Exam',
      },
      {
        to: '/speed-test',
        label: 'Speed Test',
        desc: 'A 15–60 minute timed drill on easier questions so you get faster and more accurate.',
        where: 'Practice → Precision Speed Test · path /speed-test',
        next: 'Exam',
      },
      {
        to: '/cdf-test',
        label: 'CDF Mastery',
        desc: 'Short Concept · Definition · Formula drills with a timer on each question — good for quick revision.',
        where: 'Practice → CDF Mastery Test · path /cdf-test',
        next: 'Exam',
      },
      {
        to: '/quick-revision',
        label: 'Quick Revision',
        desc: 'Definitions, formulas, and important points by chapter. Filter exam, then subject, then chapter. Download a PDF with the TestVantages name. No need to open Question Bank.',
        where: 'Practice → Quick Revision · path /quick-revision',
      },
      {
        to: '/formula-sheet',
        label: 'Formula Sheet',
        desc: 'Pin formulas from Quick Revision into one personal sheet. Download a PDF with the TestVantages name.',
        where: 'Practice → My Formula Sheet · path /formula-sheet',
      },
      {
        to: '/daily-target',
        label: 'Daily Target',
        desc: 'Set a question count on your weakest chapters and drill them today. Separate from Daily Challenge mixed set.',
        where: 'Practice → Today’s Target · path /daily-target',
      },
      {
        to: '/daily-sheet',
        label: 'Daily Practice Sheet',
        desc: 'Dated chapter DPP from your bank. Attempt or print a TestVantages sheet. Separate from Daily Challenge.',
        where: 'Practice → Daily Practice Sheet · path /daily-sheet',
      },
      {
        to: '/placement-check',
        label: 'Starter Diagnosis',
        desc: 'Short paper → see weak chapters → set today’s plan. Not a scholarship or job-placement exam.',
        where: 'Practice → Starter Diagnosis · path /placement-check',
      },
      {
        to: '/test-series',
        label: 'Series calendar',
        desc: 'Week-by-week dated mock schedule for JEE and NEET Pro Series papers.',
        where: 'Practice → Series calendar · path /test-series',
      },
      {
        to: '/pyq',
        label: 'PYQ Bank',
        desc: 'Only previous-year questions. Inside this page you pick one of the six PYQ study modes listed below.',
        where: 'Practice → PYQ Bank · path /pyq',
        next: 'Pick a PYQ mode',
      },
      {
        to: '/pyq',
        label: 'PYQ · Syllabus Practice',
        desc: 'Untimed PYQ batches by subject, unit, and chapter — same idea as Syllabus Practice, but every question is a past paper item.',
        where: 'Practice → PYQ Bank → Syllabus Practice tab · path /pyq',
      },
      {
        to: '/pyq',
        label: 'PYQ · Comprehensive PYQ Test',
        desc: 'A full-length timed paper made only from previous-year questions across subjects.',
        where: 'Practice → PYQ Bank → Comprehensive PYQ Test tab · path /pyq',
      },
      {
        to: '/pyq',
        label: 'PYQ · Subject PYQ Proficiency',
        desc: 'A shorter timed PYQ paper focused on one subject.',
        where: 'Practice → PYQ Bank → Subject PYQ Proficiency tab · path /pyq',
      },
      {
        to: '/pyq',
        label: 'PYQ · Chapter PYQ Proficiency',
        desc: 'A shorter timed PYQ paper focused on chapter or topic picks.',
        where: 'Practice → PYQ Bank → Chapter PYQ Proficiency tab · path /pyq',
      },
      {
        to: '/pyq',
        label: 'PYQ · Real-Time Calibrated PYQ',
        desc: 'Adaptive PYQ — the level moves after each answer so the set stays challenging.',
        where: 'Practice → PYQ Bank → Real-Time Calibrated PYQ tab · path /pyq',
      },
      {
        to: '/pyq',
        label: 'PYQ · Year-wise Paper',
        desc: 'Pick a year, then a sitting from the paper calendar. Papers appear after staff import official NTA / Advanced / NEET PDFs.',
        where: 'Practice → PYQ Bank → Year-wise Paper tab · path /pyq',
      },
      {
        to: '/tests',
        label: 'Mock Tests',
        desc: 'Papers your teacher assigned, plus labelled sample NTA-style papers (not official NTA PYQ).',
        where: 'Practice → Mock Tests · path /tests',
        next: 'Exam',
      },
    ],
  },
  {
    id: 'compete',
    title: 'Challenges',
    icon: '🔗',
    summary: 'Daily habit and peer loops — also linked from the Practice Hub.',
    flowSteps: ['Challenges tab', 'Daily Challenge', 'Peer / Rewards / Groups'],
    pages: [
      {
        to: '/todays-drill',
        label: 'Daily Challenge',
        desc: 'One mixed daily set for JEE or NEET. Finish it to keep the habit and earn Merit Points.',
        where: 'Top nav → Challenges → Daily Challenge · path /todays-drill',
        next: 'Exam',
      },
      {
        to: '/peer-pulse',
        label: 'Peer Match',
        desc: 'Link one friend with a Spar Code and compare streak, accuracy, points, and today’s score.',
        where: 'Top nav → Challenges → Peer Match · path /peer-pulse',
        next: 'Rewards',
      },
      {
        to: '/merit-stride',
        label: 'Rewards',
        desc: 'See Merit Points, Stride Badges, and your daily Focus Goal in one place.',
        where: 'Top nav → Challenges → Rewards · path /merit-stride',
      },
      {
        to: '/study-circle',
        label: 'Study Groups',
        desc: 'Create or join a peer room with a Cohort Code. This is friends studying together — not School Management.',
        where: 'Top nav → Challenges → Study Groups · path /study-circle',
      },
      {
        to: '/doubts',
        label: 'Ask a Doubt',
        desc: 'Post a doubt from a result question — text, file, or voice. Peers can reply. Does not copy the question stem.',
        where: 'Top nav → Challenges → Ask a Doubt · path /doubts',
      },
      {
        to: '/earn',
        label: 'Refer & Earn',
        desc: 'Share referral / vanity codes, free-mock locks, wallet credits, video submissions, and the 3-bucket earnings ledger.',
        where: 'Top nav → Challenges → Refer & Earn · path /earn',
        next: 'Campus Referrals',
      },
      {
        to: '/campus-earn',
        label: 'Campus Referrals',
        desc: 'University mentor onboarding, side-income calculator, and promoter profile for 18+ campus students.',
        where: 'Top nav → Explore → Campus Referrals · path /campus-earn',
      },
      {
        to: '/m/your-slug',
        label: 'Mentor microsite',
        desc: 'Public mentor landing (free mocks + vanity code). Replace your-slug with the promoter microsite slug from Earn.',
        where: 'Shared link · path /m/:slug · outside main chrome',
      },
      {
        to: '/v/video-slug',
        label: 'Promo video page',
        desc: 'Approved creator reel with 15% tracked attribution. Open from Earn after admin approval.',
        where: 'Shared link · path /v/:slug · outside main chrome',
      },
    ],
  },
  {
    id: 'insights',
    title: 'Progress',
    icon: '📈',
    summary: 'Results, trends, Rank Forecast (with tools inside it), career match, exam news, and ranks.',
    flowSteps: ['Progress tab', 'My Results / Analytics', 'Rank Forecast'],
    pages: [
      {
        to: '/my-results',
        label: 'My Results',
        desc: 'Every attempt you have finished. Open any one again for full analysis.',
        where: 'Top nav → Progress → My Results · path /my-results',
        next: 'Result',
      },
      {
        to: '/demo/report-card',
        label: 'Demo report card',
        desc: 'Fixed sample for Aarav Sharma — one-page parent/student marks report (print or download). No real attempt needed.',
        where: 'Top nav → Progress → Demo report card · path /demo/report-card',
      },
      {
        to: '/demo/test-analysis',
        label: 'Sample analysis',
        desc: 'Full Result & analysis for Aarav Sharma on the JEE Main sample paper — Overall, Time, Question-wise, Charts, Insight Coach.',
        where: 'Top nav → Progress → Sample analysis · path /demo/test-analysis',
      },
      {
        to: '/analytics',
        label: 'Score Analytics',
        desc: 'Trends over time: streak, weak chapters, and a study path. Use Rank Forecast for practice AIR and Exam Fit.',
        where: 'Top nav → Progress → Analytics · path /analytics',
        next: 'Rank Forecast',
      },
      {
        to: '/form-forecast',
        label: 'Rank Forecast',
        desc: 'Practice-based AIR with a confidence band from your mocks. Exam Fit, Revision Ladder, Precision Map, and Insight Coach live as sections on this same page — not separate top-nav products.',
        where: 'Top nav → Progress → Rank Forecast · path /form-forecast',
        next: 'Career Guide',
      },
      {
        to: '/career-compass',
        label: 'Career Guide',
        desc: 'Exam-day style: marks → likely rank, college–branch match, fees and placements. Use beside Rank Forecast, not instead of it.',
        where: 'Top nav → Progress → Career Guide · path /career-compass',
      },
      {
        to: '/exam-pulse',
        label: 'Exam Updates',
        desc: 'Short updates on exams, counselling, placements, and motivation notes.',
        where: 'Top nav → Progress → Exam Updates · path /exam-pulse',
      },
      {
        to: '/leaderboard',
        label: 'Rankings',
        desc: 'See how you rank against peers on the same tests.',
        where: 'Top nav → Progress → Leaderboard · path /leaderboard',
      },
    ],
  },
  {
    id: 'form-forecast-inside',
    title: 'Inside Rank Forecast',
    icon: '🎯',
    summary:
      'Sections on the Rank Forecast page only — not separate tabs in the top nav.',
    pages: [
      {
        to: '/form-forecast#exam-fit',
        label: 'Exam Fit',
        desc: 'A score out of 100 for how ready your practice form looks right now.',
        where: 'Progress → Rank Forecast → Exam Fit section · #exam-fit',
      },
      {
        to: '/form-forecast#revision-ladder',
        label: 'Revision Ladder',
        desc: 'An ordered list of chapters to revise next, based on your attempts.',
        where: 'Progress → Rank Forecast → Revision Ladder section · #revision-ladder',
      },
      {
        to: '/form-forecast#precision-map',
        label: 'Precision Map',
        desc: 'Shows where time and accuracy slip by chapter and question type.',
        where: 'Progress → Rank Forecast → Precision Map section · #precision-map',
      },
      {
        to: '/form-forecast#insight-coach',
        label: 'Insight Coach',
        desc: 'Short priorities and tips from your overall practice form (same family as tips on a single result).',
        where: 'Progress → Rank Forecast → Insight Coach section · #insight-coach',
      },
    ],
  },
  {
    id: 'exam',
    title: 'Exam & result',
    icon: '📝',
    summary: 'What opens after you start any test from Practice, Challenges, or Mock tests.',
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
        desc: 'Personal tips for this one attempt — strengths, focus areas, and next steps. Sibling of Rank Forecast’s Insight Coach.',
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
        where: 'Classroom / Admin → Create test · path /create-test',
        next: 'Edit test',
      },
      {
        to: '/edit-test',
        label: 'Edit test',
        desc: 'Open draft and published papers to change questions or settings.',
        where: 'Classroom / Admin → Edit test · path /edit-test',
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
    title: 'Classroom & School Management',
    icon: '🏫',
    staffOnly: true,
    summary: 'Teacher hub and school workspace (people, attendance, fees, timetable, exams).',
    pages: [
      {
        to: '/teacher',
        label: 'Teacher Home',
        desc: 'Teacher starting hub: bank, papers, Lecture Planner, and upload shortcuts.',
        where: 'Top nav → Classroom · path /teacher',
        next: 'Question Bank',
      },
      {
        to: '/teacher/lecture-planner',
        label: 'Lecture Planner',
        desc: 'Plan a class with AI help, bank picks, teaching order, and topic notes.',
        where: 'Classroom → Lecture Planner · path /teacher/lecture-planner',
        next: 'Lecture set',
      },
      {
        to: '/teacher/lecture-questions',
        label: 'Lecture Set',
        desc: 'Classroom question set tagged Source = Lecture for that session.',
        where: 'Classroom → Lecture set · path /teacher/lecture-questions',
      },
      {
        to: '/admin/schools',
        label: 'Schools',
        desc: 'School Management hub — list of schools and modules (people, daily ops, learning).',
        where: 'Classroom / Admin → Schools · path /admin/schools',
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
        label: 'Student Results',
        desc: 'See class attempts and open the same analysis students get.',
        where: 'Classroom → Student results · path /teacher/results',
        next: 'Result',
      },
      {
        to: '/admin',
        label: 'OCR Settings',
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
    steps: ['Home', 'Practice', 'Mock Builder', 'Exam', 'Result', 'Progress'],
  },
  {
    id: 'compete',
    label: 'Daily challenge loop',
    steps: ['Challenges', 'Daily Challenge', 'Peer Match', 'Rewards'],
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
  { id: 'prepare', label: 'Practice' },
  { id: 'test', label: 'Tests' },
  { id: 'pyq', label: 'PYQ' },
  { id: 'insights', label: 'Progress' },
  { id: 'compete', label: 'Challenges' },
  { id: 'ops', label: 'Classroom / Admin', staffOnly: true },
]
