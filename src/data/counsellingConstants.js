/**
 * Career Compass / Form Forecast counselling tables.
 * Rank prediction stays local. Gemini only fills/refreshes structured data.
 * These tables are Indicative (compiled NTA-style curves + optional Gemini fill) - not a live NTA API.
 */

export const PERCENTILE_GRID_YEARS = ['2022', '2023', '2024', '2025', '2026']
export const PERCENTILE_GRID_STEP = 0.5
export const PERCENTILE_GRID_MIN = 50
export const PERCENTILE_GRID_MAX = 100

/**
 * @deprecated Import TREND_GRID_YEARS from ntaPublishedMarks.js (latest two complete published NTA years).
 * Kept as a fallback list only — do not treat 2026 as published NTA.
 */
export const TREND_GRID_YEARS_FALLBACK = ['2024', '2025']

export const COUNSELLING_TREND_YEARS = ['2024', '2025', '2026']

export const JOSAA_ROUNDS = [
  { id: 'r1', label: 'Round 1', factor: 0.78 },
  { id: 'r2', label: 'Round 2', factor: 0.85 },
  { id: 'r3', label: 'Round 3', factor: 0.9 },
  { id: 'r4', label: 'Round 4', factor: 0.94 },
  { id: 'r5', label: 'Round 5', factor: 0.97 },
  { id: 'r6', label: 'Round 6 (final)', factor: 1 },
]

export const CSAB_ROUNDS = [
  { id: 'csab1', label: 'CSAB special 1', factor: 1.08 },
  { id: 'csab2', label: 'CSAB special 2', factor: 1.16 },
]

export const MCC_ROUNDS = [
  { id: 'r1', label: 'Round 1', factor: 0.82 },
  { id: 'r2', label: 'Round 2', factor: 0.92 },
  { id: 'r3', label: 'Round 3 (stray / later)', factor: 1 },
]

/** Five package fields shown per college + branch. */
export const PLACEMENT_PACKAGE_FIELDS = [
  { field: 'pctPlaced', label: '% placed', kind: 'pct' },
  { field: 'avgLpa', label: 'Average package', kind: 'lpa' },
  { field: 'medianLpa', label: 'Median package', kind: 'lpa' },
  { field: 'lowestLpa', label: 'Lowest package', kind: 'lpa' },
  { field: 'highestLpa', label: 'Highest package', kind: 'lpa' },
]

export const PERCENTILE_GRID_SOURCE_NOTE =
  'Year columns are compiled NTA session tables (scorecards / public shift reports), not Gemini guesses. Unknown years show —. Est. AIR, easy/tough marks, and the fitted curve use the latest two complete published years only. Easy/tough is Indicative. Not a live NTA API. Always check your scorecard.'

export const PERCENTILE_CURVE_TITLE =
  'Percentile curve — compiled NTA marks vs percentile (0.5 steps + paper toughness)'

export const ROUND_CHANCE_SOURCE_NOTE =
  'Indicative round-wise chances from last 2-3 years of JoSAA / CSAB / MCC-style closing ranks (compiled tables + Gemini fill). Later rounds usually close at a worse rank. Not a seat guarantee.'

export const PLACEMENT_PACKAGE_NOTE =
  'Indicative unless tagged Official. Official figures come from institute T&P / NIRF reports. Never a guaranteed package. Unknown stays Not available — we do not invent a typical package.'

export const PLACEMENT_UNVERIFIED_NOTE =
  'Unverified — no published institute T&P / NIRF figure found. Shown as Not available instead of a guessed package.'

export const PLACEMENT_OFFICIAL_NOTE =
  'From a published institute placement report or NIRF graduate-outcome table. Not a guaranteed package. Always re-check the college T&P page.'

export const COLLEGE_DETAIL_SOURCE_NOTE =
  'College facts are compiled from the Career Compass catalog plus Gemini fill when available. Fees, quotas, and websites can change - confirm on the official site.'

export const GEMINI_FILL_HINT =
  'If Gemini is offline we keep the last filled tables. Admin can refresh from Career Compass → Update data.'

export const TYPE_LABELS = {
  iit: 'IIT',
  nit: 'NIT',
  iiit: 'IIIT',
  gfti: 'GFTI',
  medical: 'Medical college',
}

export const QUOTAS_BY_TYPE = {
  iit: ['AI (All India)'],
  nit: ['HS (Home State)', 'OS (Other State)', 'AI'],
  iiit: ['AI (All India)'],
  gfti: ['AI / HS (varies)'],
  medical: ['AIQ', 'State quota'],
}

export const COUNSELLING_BODY_BY_TYPE = {
  iit: 'JoSAA',
  nit: 'JoSAA + CSAB special rounds',
  iiit: 'JoSAA + CSAB special rounds',
  gfti: 'JoSAA + CSAB special rounds',
  medical: 'MCC (NEET UG)',
}

/** Well-known official sites - used when catalog URLs are generic. */
export const KNOWN_COLLEGE_WEBSITES = {
  'iit-madras': 'https://www.iitm.ac.in',
  'iit-delhi': 'https://home.iitd.ac.in',
  'iit-bombay': 'https://www.iitb.ac.in',
  'iit-kanpur': 'https://www.iitk.ac.in',
  'iit-kharagpur': 'https://www.iitkgp.ac.in',
  'iit-roorkee': 'https://www.iitr.ac.in',
  'iit-guwahati': 'https://www.iitg.ac.in',
  'iit-hyderabad': 'https://www.iith.ac.in',
  'iit-indore': 'https://www.iiti.ac.in',
  'iit-bhu': 'https://www.iitbhu.ac.in',
  'iit-ism': 'https://www.iitism.ac.in',
  'iit-bhubaneswar': 'https://www.iitbbs.ac.in',
  'iit-gandhinagar': 'https://www.iitgn.ac.in',
  'iit-patna': 'https://www.iitp.ac.in',
  'iit-ropar': 'https://www.iitrpr.ac.in',
  'iit-mandi': 'https://www.iitmandi.ac.in',
  'iit-jodhpur': 'https://www.iitj.ac.in',
  'iit-tirupati': 'https://www.iittp.ac.in',
  'iit-palakkad': 'https://iitpkd.ac.in',
  'iit-dharwad': 'https://www.iitdh.ac.in',
  'iit-bhilai': 'https://www.iitbhilai.ac.in',
  'iit-goa': 'https://iitgoa.ac.in',
  'iit-jammu': 'https://www.iitjammu.ac.in',
  'nit-trichy': 'https://www.nitt.edu',
  'nit-surathkal': 'https://www.nitk.ac.in',
  'nit-warangal': 'https://www.nitw.ac.in',
  'nit-calicut': 'https://www.nitc.ac.in',
  'nit-rourkela': 'https://www.nitrkl.ac.in',
  'nit-allahabad': 'https://www.mnnit.ac.in',
  'nit-jaipur': 'https://www.mnit.ac.in',
  'nit-kurukshetra': 'https://www.nitkkr.ac.in',
  'nit-durgapur': 'https://nitdgp.ac.in',
  'nit-nagpur': 'https://vnit.ac.in',
  'nit-surat': 'https://www.svnit.ac.in',
  'nit-delhi': 'https://nitdelhi.ac.in',
  'iiit-hyderabad': 'https://www.iiit.ac.in',
  'iiit-bangalore': 'https://www.iiitb.ac.in',
  'iiit-delhi': 'https://www.iiitd.ac.in',
  'iiit-allahabad': 'https://www.iiita.ac.in',
  'iiit-gwalior': 'https://www.iiitm.ac.in',
  'iiit-pune': 'https://www.iiitp.ac.in',
  'iiit-lucknow': 'https://www.iiitl.ac.in',
  'nit-silchar': 'https://www.nits.ac.in',
  'nit-hamirpur': 'https://nith.ac.in',
  'nit-jalandhar': 'https://www.nitj.ac.in',
  'nit-patna': 'https://www.nitp.ac.in',
  'nit-raipur': 'https://www.nitrr.ac.in',
  'nit-bhopal': 'https://www.manit.ac.in',
  'nit-jamshedpur': 'https://www.nitjsr.ac.in',
  'aiims-delhi': 'https://www.aiims.edu',
  'aiims-jodhpur': 'https://www.aiimsjodhpur.edu.in',
  'aiims-bhopal': 'https://www.aiimsbhopal.edu.in',
  'aiims-bhubaneswar': 'https://aiimsbhubaneswar.nic.in',
  'aiims-raipur': 'https://www.aiimsraipur.edu.in',
  'aiims-rishikesh': 'https://aiimsrishikesh.edu.in',
  'aiims-patna': 'https://aiimspatna.edu.in',
}

/**
 * Extra college facts (Indicative compiled). Gemini fill may overlay these.
 * hostelFeeLakh is hostel/mess ballpark, not tuition.
 */
export const KNOWN_COLLEGE_FACTS = {
  'iit-madras': { establishedYear: 1959, hostelFeeLakh: 0.28, affiliation: 'Institute of National Importance', placementPageUrl: 'https://placement.iitm.ac.in' },
  'iit-delhi': { establishedYear: 1961, hostelFeeLakh: 0.28, affiliation: 'Institute of National Importance', placementPageUrl: 'https://tnp.iitd.ac.in' },
  'iit-bombay': { establishedYear: 1958, hostelFeeLakh: 0.3, affiliation: 'Institute of National Importance', placementPageUrl: 'https://placements.iitb.ac.in' },
  'iit-kanpur': { establishedYear: 1959, hostelFeeLakh: 0.26, affiliation: 'Institute of National Importance', placementPageUrl: 'https://spo.iitk.ac.in' },
  'iit-kharagpur': { establishedYear: 1951, hostelFeeLakh: 0.25, affiliation: 'Institute of National Importance', placementPageUrl: 'https://ctc.iitkgp.ac.in' },
  'iit-roorkee': { establishedYear: 1847, hostelFeeLakh: 0.25, affiliation: 'Institute of National Importance', placementPageUrl: 'https://www.iitr.ac.in/placements' },
  'iit-guwahati': { establishedYear: 1994, hostelFeeLakh: 0.24, affiliation: 'Institute of National Importance' },
  'iit-hyderabad': { establishedYear: 2008, hostelFeeLakh: 0.26, affiliation: 'Institute of National Importance' },
  'iit-indore': { establishedYear: 2009, hostelFeeLakh: 0.24, affiliation: 'Institute of National Importance' },
  'iit-bhu': { establishedYear: 1919, hostelFeeLakh: 0.24, affiliation: 'Institute of National Importance' },
  'iit-ism': { establishedYear: 1926, hostelFeeLakh: 0.23, affiliation: 'Institute of National Importance' },
  'iit-bhubaneswar': { establishedYear: 2008, hostelFeeLakh: 0.22, affiliation: 'Institute of National Importance' },
  'iit-gandhinagar': { establishedYear: 2008, hostelFeeLakh: 0.24, affiliation: 'Institute of National Importance' },
  'iit-patna': { establishedYear: 2008, hostelFeeLakh: 0.22, affiliation: 'Institute of National Importance' },
  'iit-ropar': { establishedYear: 2008, hostelFeeLakh: 0.22, affiliation: 'Institute of National Importance' },
  'iit-mandi': { establishedYear: 2009, hostelFeeLakh: 0.22, affiliation: 'Institute of National Importance' },
  'iit-jodhpur': { establishedYear: 2008, hostelFeeLakh: 0.22, affiliation: 'Institute of National Importance' },
  'iit-tirupati': { establishedYear: 2015, hostelFeeLakh: 0.22, affiliation: 'Institute of National Importance' },
  'iit-palakkad': { establishedYear: 2015, hostelFeeLakh: 0.22, affiliation: 'Institute of National Importance' },
  'iit-dharwad': { establishedYear: 2016, hostelFeeLakh: 0.22, affiliation: 'Institute of National Importance' },
  'iit-bhilai': { establishedYear: 2016, hostelFeeLakh: 0.21, affiliation: 'Institute of National Importance' },
  'iit-goa': { establishedYear: 2016, hostelFeeLakh: 0.22, affiliation: 'Institute of National Importance' },
  'iit-jammu': { establishedYear: 2016, hostelFeeLakh: 0.21, affiliation: 'Institute of National Importance' },
  'nit-trichy': { establishedYear: 1964, hostelFeeLakh: 0.22, affiliation: 'NIT (Institute of National Importance)', placementPageUrl: 'https://www.nitt.edu/home/students/facilitiesnservices/tnp/' },
  'nit-surathkal': { establishedYear: 1960, hostelFeeLakh: 0.22, affiliation: 'NIT (Institute of National Importance)' },
  'nit-warangal': { establishedYear: 1959, hostelFeeLakh: 0.22, affiliation: 'NIT (Institute of National Importance)' },
  'nit-calicut': { establishedYear: 1961, hostelFeeLakh: 0.21, affiliation: 'NIT (Institute of National Importance)' },
  'nit-rourkela': { establishedYear: 1961, hostelFeeLakh: 0.21, affiliation: 'NIT (Institute of National Importance)' },
  'nit-allahabad': { establishedYear: 1961, hostelFeeLakh: 0.2, affiliation: 'NIT (Institute of National Importance)' },
  'nit-jaipur': { establishedYear: 1963, hostelFeeLakh: 0.2, affiliation: 'NIT (Institute of National Importance)' },
  'iiit-hyderabad': { establishedYear: 1998, hostelFeeLakh: 0.32, affiliation: 'Deemed university (public-private)' },
  'iiit-delhi': { establishedYear: 2008, hostelFeeLakh: 0.35, affiliation: 'State university (Delhi)' },
  'iiit-bangalore': { establishedYear: 1999, hostelFeeLakh: 0.32, affiliation: 'Deemed university' },
  'iiit-allahabad': { establishedYear: 1999, hostelFeeLakh: 0.24, affiliation: 'Institute of National Importance' },
  'aiims-delhi': { establishedYear: 1956, hostelFeeLakh: 0.12, affiliation: 'Institute of National Importance (MoHFW)' },
}
