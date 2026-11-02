/**
 * PYQ slot metatags - exam-specific, not year-only.
 * JEE Main: year + date + shift. JEE Advanced: year + Paper 1/2. NEET: year.
 * Gemini PYQ-style must never set officialPyq / imported.
 */
import { getJeeMainPaperSlots } from '../data/pyqCatalog.js'
import { buildPyqPaperIds } from './pyqPaperDefaults.js'
import {
  isOfficialPyq,
  isPyqStyleAi,
  pyqProvenanceLabel,
  PYQ_STYLE_AI_BANK_SOURCE,
  PYQ_STYLE_AI_SOURCE,
} from './pyqDetect.js'

export const JEE_ADV_PAPERS = ['Paper 1', 'Paper 2']

export function normalizePyqExamId(examId) {
  const s = String(examId ?? '').trim().toLowerCase().replace(/\s+/g, '-')
  if (s === 'neet' || s === 'neet-ug') return 'neet'
  if (s === 'jee-advanced' || s === 'jee-adv' || s === 'advanced') return 'jee-advanced'
  return 'jee-main'
}

export function normalizePyqYearValue(year) {
  const n = Number(year)
  if (!Number.isFinite(n)) return null
  const y = Math.round(n)
  if (y < 1990 || y > 2100) return null
  return y
}

export function normalizePyqShift(shift) {
  const n = Number(shift)
  if (n === 1 || n === 2) return n
  return null
}

export function normalizeAdvPaper(session) {
  const s = String(session ?? '').trim()
  if (/paper\s*2/i.test(s) || s === '2') return 'Paper 2'
  if (/paper\s*1/i.test(s) || s === '1') return 'Paper 1'
  return ''
}

export function listPyqStyleSlots(examId, year) {
  const id = normalizePyqExamId(examId)
  const y = normalizePyqYearValue(year) ?? 2024
  if (id === 'jee-main') return getJeeMainPaperSlots(y)
  if (id === 'jee-advanced') {
    return JEE_ADV_PAPERS.map((paper) => ({
      paperId: y + '-adv-' + paper.toLowerCase().replace(/\s+/g, '-'),
      paperLabel: 'JEE Advanced ' + y + ' ' + paper,
      pyqYear: y,
      pyqSession: paper,
    }))
  }
  return [{
    paperId: y + '-neet-s1',
    paperLabel: 'NEET ' + y,
    pyqYear: y,
    pyqSession: undefined,
  }]
}

export function uniquePyqDatesFromSlots(slots) {
  const seen = new Set()
  const out = []
  for (const s of slots ?? []) {
    const d = String(s?.pyqDate ?? '').trim()
    if (!d || seen.has(d)) continue
    seen.add(d)
    out.push(d)
  }
  return out
}

export function formatPyqDatePretty(iso) {
  const s = String(iso ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = new Date(s + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Stable paper identity: Main year+date+shift, Advanced year+paper, NEET year. */
export function pyqPaperKey(q) {
  const exam = normalizePyqExamId(q?.examPatternId || q?.examIds?.[0] || q?.exam)
  const year = normalizePyqYearValue(q?.pyqYear ?? q?.year)
  if (!year) return ''
  if (exam === 'jee-main') {
    const date = String(q?.pyqDate ?? '').trim()
    const shift = normalizePyqShift(q?.pyqShift)
    if (date && shift) return 'jee-main:' + year + ':' + date + ':s' + shift
    return ''
  }
  if (exam === 'jee-advanced') {
    const paper = normalizeAdvPaper(q?.pyqSession) || normalizeAdvPaper(q?.paperLabel) || 'Paper 1'
    return 'jee-advanced:' + year + ':' + (paper === 'Paper 2' ? 'p2' : 'p1')
  }
  return 'neet:' + year
}

export function formatPyqSlotLabel(q) {
  const exam = normalizePyqExamId(q?.examPatternId || q?.examIds?.[0])
  const year = normalizePyqYearValue(q?.pyqYear)
  if (exam === 'jee-main') {
    const date = String(q?.pyqDate ?? '').trim()
    const shift = normalizePyqShift(q?.pyqShift)
    if (date && shift) return formatPyqDatePretty(date) + ' Shift ' + shift
    return q?.paperLabel || (year ? 'JEE Main ' + year : 'JEE Main')
  }
  if (exam === 'jee-advanced') {
    const paper = normalizeAdvPaper(q?.pyqSession) || normalizeAdvPaper(q?.paperLabel)
    if (year && paper) return year + ' ' + paper
    return q?.paperLabel || (year ? 'JEE Advanced ' + year : 'JEE Advanced')
  }
  return year ? 'NEET ' + year : q?.paperLabel || 'NEET'
}

export function formatPyqCardChip(q) {
  const provenance = pyqProvenanceLabel(q)
  const slot = formatPyqSlotLabel(q)
  if (!provenance && !slot) return ''
  if (provenance && slot) return provenance + ' / ' + slot
  return provenance || slot
}

export function geminiPyqJobIsReady(job) {
  const examId = normalizePyqExamId(job?.examId)
  const pyqYear = normalizePyqYearValue(job?.pyqYear)
  if (!pyqYear) return { ok: false, error: 'Pick a year.' }
  if (examId === 'jee-main') {
    const pyqDate = String(job?.pyqDate ?? '').trim()
    const pyqShift = normalizePyqShift(job?.pyqShift)
    if (!pyqDate || !pyqShift) return { ok: false, error: 'JEE Main needs a date and Shift 1 or 2.' }
  }
  if (examId === 'jee-advanced') {
    const paper = normalizeAdvPaper(job?.pyqSession)
    if (!paper) return { ok: false, error: 'JEE Advanced needs Paper 1 or Paper 2.' }
  }
  return { ok: true }
}

export function buildGeminiPyqStyleFields(job) {
  const examId = normalizePyqExamId(job?.examId)
  const pyqYear = normalizePyqYearValue(job?.pyqYear)
  if (!pyqYear) return null
  const pyqDate = examId === 'jee-main' ? String(job?.pyqDate ?? '').trim() : ''
  const pyqShift = examId === 'jee-main' ? normalizePyqShift(job?.pyqShift) : null
  const pyqSession = examId === 'jee-advanced' ? (normalizeAdvPaper(job?.pyqSession) || 'Paper 1') : undefined
  if (examId === 'jee-main' && (!pyqDate || !pyqShift)) return null
  const ids = buildPyqPaperIds({
    pyqYear,
    examPatternId: examId,
    pyqDate: pyqDate || undefined,
    pyqShift: pyqShift ?? undefined,
    pyqSession,
  })
  const slotLabel = formatPyqSlotLabel({
    examPatternId: examId,
    pyqYear,
    pyqDate: ids.pyqDate,
    pyqShift: ids.pyqShift,
    pyqSession: ids.pyqSession,
    paperLabel: ids.paperLabel,
  })
  return {
    examIds: [examId],
    examPatternId: examId,
    pyqYear,
    pyqDate: ids.pyqDate,
    pyqShift: ids.pyqShift,
    pyqSession: ids.pyqSession,
    paperId: ids.paperId,
    paperLabel: slotLabel + ' / PYQ-style (AI)',
    pyqStyle: true,
    bankSource: PYQ_STYLE_AI_BANK_SOURCE,
    source: PYQ_STYLE_AI_SOURCE,
    officialPyq: false,
    imported: false,
    subject: job?.subject,
    chapter: job?.chapter,
    questionType: job?.questionType || 'single_correct',
  }
}

export function questionMatchesPyqSlotFilters(q, filters) {
  const f = filters ?? {}
  const yearWant = String(f.pyqYear ?? '').trim()
  if (yearWant && String(q?.pyqYear ?? '') !== yearWant) return false
  const dateWant = String(f.pyqDate ?? '').trim()
  if (dateWant && String(q?.pyqDate ?? '') !== dateWant) return false
  const shiftWant = String(f.pyqShift ?? '').trim()
  if (shiftWant && String(normalizePyqShift(q?.pyqShift) ?? '') !== shiftWant) return false
  const paperWant = String(f.pyqPaper ?? '').trim()
  if (paperWant) {
    const have = normalizeAdvPaper(q?.pyqSession) || normalizeAdvPaper(q?.paperLabel)
    if (have !== paperWant) return false
  }
  return true
}

export function collectPyqDatesInBank(questions) {
  const set = new Set()
  for (const q of questions ?? []) {
    const d = String(q?.pyqDate ?? '').trim()
    if (d) set.add(d)
  }
  return [...set].sort((a, b) => b.localeCompare(a))
}

export function collectPyqShiftsInBank(questions) {
  const set = new Set()
  for (const q of questions ?? []) {
    const s = normalizePyqShift(q?.pyqShift)
    if (s) set.add(s)
  }
  return [...set].sort((a, b) => a - b)
}

export function collectPyqPapersInBank(questions) {
  const set = new Set()
  for (const q of questions ?? []) {
    const p = normalizeAdvPaper(q?.pyqSession) || normalizeAdvPaper(q?.paperLabel)
    if (p) set.add(p)
  }
  return JEE_ADV_PAPERS.filter((p) => set.has(p))
}

export function pyqSlotIsOfficial(q) {
  return isOfficialPyq(q) && !isPyqStyleAi(q)
}

export function groupPyqQuestionsByPaper(questions) {
  const map = new Map()
  for (const q of questions ?? []) {
    const key = pyqPaperKey(q) || String(q?.paperId ?? '').trim()
    if (!key) continue
    if (!map.has(key)) {
      map.set(key, {
        key,
        paperId: q.paperId,
        paperLabel: q.paperLabel || formatPyqSlotLabel(q),
        examPatternId: q.examPatternId,
        pyqYear: q.pyqYear,
        pyqDate: q.pyqDate,
        pyqShift: q.pyqShift,
        pyqSession: q.pyqSession,
        questions: [],
      })
    }
    map.get(key).questions.push(q)
  }
  return [...map.values()]
}