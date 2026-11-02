/**
 * Official Career Compass data sources — attribution for NTA / JoSAA / CSAB / MCC.
 * Live scrape is limited; snapshots use published counselling benchmarks (2024–2026).
 */

export const OFFICIAL_SNAPSHOT_VERSION = '2026.1'

export const OFFICIAL_DATA_SOURCES = [
  {
    id: 'nta',
    label: 'NTA',
    fullLabel: 'National Testing Agency',
    url: 'https://nta.ac.in',
    verifyUrl: 'https://nta.ac.in/Examination',
    dataTypes: ['marks', 'percentile', 'air', 'state-rank'],
    exams: ['jee-main', 'jee-advanced', 'neet'],
    years: '2024–2026',
    liveFetch: false,
    note: 'Marks ↔ percentile ↔ AIR curves from published NTA scorecard patterns.',
  },
  {
    id: 'josaa',
    label: 'JoSAA',
    fullLabel: 'Joint Seat Allocation Authority',
    url: 'https://josaa.nic.in',
    verifyUrl: 'https://josaa.nic.in/Archives/result/archiveresult.aspx',
    dataTypes: ['cutoff', 'allotment'],
    appliesTo: ['iit', 'nit', 'iiit', 'gfti'],
    exams: ['jee-main', 'jee-advanced'],
    years: '2024–2026',
    liveFetch: false,
    note: 'General closing ranks from JoSAA round-wise counselling reports.',
  },
  {
    id: 'csab',
    label: 'CSAB',
    fullLabel: 'Central Seat Allocation Board',
    url: 'https://csab.nic.in',
    verifyUrl: 'https://csab.nic.in',
    dataTypes: ['cutoff', 'allotment'],
    appliesTo: ['nit', 'iiit', 'gfti'],
    exams: ['jee-main'],
    years: '2024–2026',
    liveFetch: false,
    note: 'Special-round vacant seat cutoffs after JoSAA.',
  },
  {
    id: 'mcc',
    label: 'MCC',
    fullLabel: 'Medical Counselling Committee',
    url: 'https://mcc.nic.in',
    verifyUrl: 'https://mcc.nic.in/web/open/allotment-result',
    dataTypes: ['cutoff', 'allotment'],
    appliesTo: ['medical'],
    exams: ['neet'],
    years: '2024–2026',
    liveFetch: false,
    note: 'NEET UG AIQ & deemed university MBBS/BDS closing ranks.',
  },
]

/** @param {string} collegeType */
export function primaryCutoffSourceForType(collegeType) {
  if (collegeType === 'medical') return 'mcc'
  return 'josaa'
}
