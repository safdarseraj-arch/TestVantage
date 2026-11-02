/**
 * Year-wise PYQ = one official paper from that year.
 * JEE Advanced: Paper 1 / Paper 2 (AI picks if not chosen).
 * JEE Main: date & shift (AI picks if not chosen).
 * NEET: that year's paper.
 */

import { getPyqExamLabel, getPyqPapers } from '../data/pyqCatalog.js'

/**
 * @param {string} examPatternId
 * @param {number} year
 */
export function listPyqPapersForYear(examPatternId, year, pool) {
  return getPyqPapers(examPatternId, year, pool)
}

/**
 * @param {string} examPatternId
 */
export function yearWisePaperPickerHint(examPatternId) {
  switch (examPatternId) {
    case 'jee-advanced':
      return 'Choose Paper 1 or Paper 2, or leave on AI pick.'
    case 'jee-main':
      return 'Choose date & shift, or leave on AI pick.'
    case 'neet':
      return 'One NEET paper for that year.'
    default:
      return 'Pick a paper or let AI choose.'
  }
}

/**
 * Resolve a single paper for year-wise PYQ.
 * @param {string} examPatternId
 * @param {number} year
 * @param {{ paperId?: string }} [opts]
 */
export function resolvePyqYearPaper(examPatternId, year, opts = {}) {
  const papers = listPyqPapersForYear(examPatternId, year, opts.pool)
  if (!papers.length) {
    return {
      ok: false,
      error: `No PYQ papers for ${getPyqExamLabel(examPatternId)} ${year}.`,
    }
  }

  const chosenId = opts.paperId?.trim()
  if (chosenId) {
    const match = papers.find((p) => p.paperId === chosenId)
    if (!match) {
      return { ok: false, error: 'Selected paper not found for this year.' }
    }
    return { ok: true, paper: match, aiPicked: false }
  }

  if (papers.length === 1) {
    return { ok: true, paper: papers[0], aiPicked: false }
  }

  const maxCount = Math.max(...papers.map((p) => p.count))
  const candidates = papers.filter((p) => p.count === maxCount)
  const paper = candidates[Math.floor(Math.random() * candidates.length)] ?? papers[0]
  return { ok: true, paper, aiPicked: true }
}

/**
 * Group a year's papers into calendar buckets (month for JEE Main, paper/session otherwise).
 * @param {string} examPatternId
 * @param {number} year
 */
export function groupPyqPapersForCalendar(examPatternId, year, pool) {
  const papers = listPyqPapersForYear(examPatternId, year, pool)
  const groups = new Map()
  for (const paper of papers) {
    let groupKey = 'Papers'
    let groupLabel = 'Papers'
    if (paper.pyqDate) {
      const d = new Date(`${paper.pyqDate}T12:00:00`)
      if (!Number.isNaN(d.getTime())) {
        groupKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        groupLabel = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
      }
    } else if (paper.pyqSession) {
      groupKey = String(paper.pyqSession)
      groupLabel = String(paper.pyqSession)
    } else if (/paper\s*1/i.test(paper.paperLabel || '')) {
      groupKey = 'paper-1'
      groupLabel = 'Paper 1'
    } else if (/paper\s*2/i.test(paper.paperLabel || '')) {
      groupKey = 'paper-2'
      groupLabel = 'Paper 2'
    }
    if (!groups.has(groupKey)) groups.set(groupKey, { key: groupKey, label: groupLabel, papers: [] })
    groups.get(groupKey).papers.push(paper)
  }
  return {
    year,
    examPatternId,
    total: papers.length,
    questions: papers.reduce((s, p) => s + (p.count || 0), 0),
    groups: [...groups.values()],
  }
}
