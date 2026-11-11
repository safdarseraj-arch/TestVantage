/**
 * Curated official previous-year paper sources for JEE Main, JEE Advanced, NEET UG.
 *
 * Prefer NTA / JEE Advanced archives / user-provided official PDFs.
 * Do NOT scrape coaching sites. Live PDF URLs change often — many entries are
 * archive landing pages for manual download, then upload into the pending bank.
 */

/** @typedef {'jee-main' | 'jee-advanced' | 'neet'} OfficialPyqExam */

/**
 * @typedef {{
 *   id: string
 *   exam: OfficialPyqExam
 *   year: number
 *   session?: string
 *   paperLabel: string
 *   sourceLabel: string
 *   sourceUrl: string
 *   downloadHint: string
 *   liveFetch: boolean
 * }} OfficialPyqSourceSlot
 */

export const OFFICIAL_PYQ_EXAMS = [
  { id: 'jee-main', label: 'JEE Main', short: 'Main' },
  { id: 'jee-advanced', label: 'JEE Advanced', short: 'Advanced' },
  { id: 'neet', label: 'NEET UG', short: 'NEET' },
]

/** Portal hubs — always safe to open; not full paper dumps. */
export const OFFICIAL_PYQ_PORTALS = [
  {
    id: 'nta',
    label: 'NTA',
    url: 'https://nta.ac.in',
    note: 'National Testing Agency — exams, notices, and published materials.',
  },
  {
    id: 'nta-exams',
    label: 'NTA Examinations',
    url: 'https://nta.ac.in/Examination',
    note: 'Exam list and official notices for JEE Main / NEET.',
  },
  {
    id: 'jee-adv-archive',
    label: 'JEE Advanced archive',
    url: 'https://jeeadv.ac.in/archive.html',
    note: 'Official past papers and answer keys (IIT JEE Advanced).',
  },
  {
    id: 'nta-neet',
    label: 'NTA NEET',
    url: 'https://neet.nta.nic.in',
    note: 'NEET UG official portal — check Information Bulletin / archives for papers.',
  },
]

/**
 * Curated year slots. When NTA hosts a stable public PDF, set liveFetch + direct URL.
 * Otherwise sourceUrl points at the official archive page for manual download.
 * @type {OfficialPyqSourceSlot[]}
 */
export const OFFICIAL_PYQ_SOURCE_SLOTS = [
  // —— JEE Advanced (stable public archive) ——
  {
    id: 'jee-adv-2024-p1',
    exam: 'jee-advanced',
    year: 2024,
    session: 'Paper 1',
    paperLabel: 'JEE Advanced 2024 Paper 1',
    sourceLabel: 'Official JEE Advanced archive',
    sourceUrl: 'https://jeeadv.ac.in/archive.html',
    downloadHint: 'Open archive → 2024 → Paper 1 PDF (and answer key if listed).',
    liveFetch: false,
  },
  {
    id: 'jee-adv-2024-p2',
    exam: 'jee-advanced',
    year: 2024,
    session: 'Paper 2',
    paperLabel: 'JEE Advanced 2024 Paper 2',
    sourceLabel: 'Official JEE Advanced archive',
    sourceUrl: 'https://jeeadv.ac.in/archive.html',
    downloadHint: 'Open archive → 2024 → Paper 2 PDF (and answer key if listed).',
    liveFetch: false,
  },
  {
    id: 'jee-adv-2023-p1',
    exam: 'jee-advanced',
    year: 2023,
    session: 'Paper 1',
    paperLabel: 'JEE Advanced 2023 Paper 1',
    sourceLabel: 'Official JEE Advanced archive',
    sourceUrl: 'https://jeeadv.ac.in/archive.html',
    downloadHint: 'Open archive → 2023 → Paper 1 PDF.',
    liveFetch: false,
  },
  {
    id: 'jee-adv-2023-p2',
    exam: 'jee-advanced',
    year: 2023,
    session: 'Paper 2',
    paperLabel: 'JEE Advanced 2023 Paper 2',
    sourceLabel: 'Official JEE Advanced archive',
    sourceUrl: 'https://jeeadv.ac.in/archive.html',
    downloadHint: 'Open archive → 2023 → Paper 2 PDF.',
    liveFetch: false,
  },
  {
    id: 'jee-adv-2022-p1',
    exam: 'jee-advanced',
    year: 2022,
    session: 'Paper 1',
    paperLabel: 'JEE Advanced 2022 Paper 1',
    sourceLabel: 'Official JEE Advanced archive',
    sourceUrl: 'https://jeeadv.ac.in/archive.html',
    downloadHint: 'Open archive → 2022 → Paper 1 PDF.',
    liveFetch: false,
  },
  {
    id: 'jee-adv-2022-p2',
    exam: 'jee-advanced',
    year: 2022,
    session: 'Paper 2',
    paperLabel: 'JEE Advanced 2022 Paper 2',
    sourceLabel: 'Official JEE Advanced archive',
    sourceUrl: 'https://jeeadv.ac.in/archive.html',
    downloadHint: 'Open archive → 2022 → Paper 2 PDF.',
    liveFetch: false,
  },
  // —— JEE Main (NTA — PDFs often behind session portals; land on NTA) ——
  {
    id: 'jee-main-2024',
    exam: 'jee-main',
    year: 2024,
    session: 'All sessions',
    paperLabel: 'JEE Main 2024 (official NTA materials)',
    sourceLabel: 'Official NTA',
    sourceUrl: 'https://nta.ac.in/Examination',
    downloadHint:
      'Download the official question paper / answer key PDF from NTA for your date & shift, then upload here.',
    liveFetch: false,
  },
  {
    id: 'jee-main-2023',
    exam: 'jee-main',
    year: 2023,
    session: 'All sessions',
    paperLabel: 'JEE Main 2023 (official NTA materials)',
    sourceLabel: 'Official NTA',
    sourceUrl: 'https://nta.ac.in/Examination',
    downloadHint: 'Use NTA-published papers/keys for 2023 sessions only — not coaching mirrors.',
    liveFetch: false,
  },
  {
    id: 'jee-main-2022',
    exam: 'jee-main',
    year: 2022,
    session: 'All sessions',
    paperLabel: 'JEE Main 2022 (official NTA materials)',
    sourceLabel: 'Official NTA',
    sourceUrl: 'https://nta.ac.in/Examination',
    downloadHint: 'Upload the official NTA PDF for the year/session you hold.',
    liveFetch: false,
  },
  // —— NEET UG ——
  {
    id: 'neet-2024',
    exam: 'neet',
    year: 2024,
    session: 'UG',
    paperLabel: 'NEET UG 2024 (official NTA materials)',
    sourceLabel: 'Official NTA NEET',
    sourceUrl: 'https://neet.nta.nic.in',
    downloadHint: 'Download official NEET UG paper/key from NTA NEET portal, then upload.',
    liveFetch: false,
  },
  {
    id: 'neet-2023',
    exam: 'neet',
    year: 2023,
    session: 'UG',
    paperLabel: 'NEET UG 2023 (official NTA materials)',
    sourceLabel: 'Official NTA NEET',
    sourceUrl: 'https://neet.nta.nic.in',
    downloadHint: 'Use official NTA NEET materials only.',
    liveFetch: false,
  },
  {
    id: 'neet-2022',
    exam: 'neet',
    year: 2022,
    session: 'UG',
    paperLabel: 'NEET UG 2022 (official NTA materials)',
    sourceLabel: 'Official NTA NEET',
    sourceUrl: 'https://neet.nta.nic.in',
    downloadHint: 'Upload the official NTA PDF you downloaded.',
    liveFetch: false,
  },
]

/** @param {OfficialPyqExam | string} exam */
export function getOfficialPyqExamLabel(exam) {
  return OFFICIAL_PYQ_EXAMS.find((e) => e.id === exam)?.label ?? String(exam)
}

/**
 * The paper a question comes from, e.g. "JEE Advanced 2025 Paper 1" or "JEE Main 2024 27 Jan Shift 1".
 * @param {{ exam?: string, year?: number | string, session?: string, pyqDate?: string, pyqShift?: string | number } | null | undefined} paper
 */
export function officialPyqPaperSourceName(paper) {
  const year = Number(paper?.year) || ''
  const session = String(paper?.session ?? '').trim().replace(/^paper\b/i, 'Paper')
  const date = String(paper?.pyqDate ?? '').trim()
  const rawShift = String(paper?.pyqShift ?? '').trim()
  const shift = rawShift && !/shift/i.test(rawShift) ? `Shift ${rawShift}` : rawShift
  return [paper?.exam ? getOfficialPyqExamLabel(paper.exam) : '', year, session, date, shift].filter(Boolean).join(' ')
}

/** @param {OfficialPyqExam | string} [exam] @param {number} [year] */
export function listOfficialPyqSourceSlots(exam, year) {
  return OFFICIAL_PYQ_SOURCE_SLOTS.filter((s) => {
    if (exam && s.exam !== exam) return false
    if (year != null && s.year !== year) return false
    return true
  })
}

/** @param {string} id */
export function getOfficialPyqSourceSlot(id) {
  return OFFICIAL_PYQ_SOURCE_SLOTS.find((s) => s.id === id) ?? null
}
