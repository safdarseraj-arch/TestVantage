/**
 * Question-bank upload helpers after Mathpix OCR + Gemini structure.
 * Never replaces the published bank. IDs use founder rules (MAQS2345 / A2024 / C1).
 */
import {
  assignClassifiedQuestionId,
  canAssignClassifiedId,
} from './classifiedQuestionId.js'
import {
  geminiStructureFailedSplit,
  countMathpixQuestionMarkers,
  looksLikeMathpixLatexPaper,
} from './mathpixQuestionSplit.js'
import { pyqId, stripFounderIdSuffixes } from './questionId.js'
import { addUploadedQuestionsBulk, loadUploadedQuestions } from './questionBank.js'

export const BANK_DRAFTS_SAVED_EVENT = 'testvantage-bank-drafts-saved'

/**
 * One raw LaTeX blob is not a question card.
 * @param {unknown[]} drafts
 * @param {unknown} rawText
 */
export function isGarbageRawLatexCard(drafts, rawText) {
  const list = Array.isArray(drafts) ? drafts : []
  const raw = String(rawText ?? '')
  if (geminiStructureFailedSplit(list.length, raw)) return true
  if (list.length !== 1) return false
  const t = String(list[0]?.text ?? '')
  const hasOpts = (list[0]?.options ?? []).some((o) => String(o ?? '').trim())
  if (countMathpixQuestionMarkers(raw) >= 2) return true
  if (looksLikeMathpixLatexPaper(raw) && raw.length > 400 && t.length > 300) return true
  if (raw.length > 700 && t.length > 500 && /\\begin\{/.test(t) && !hasOpts) return true
  return false
}

/**
 * @param {Record<string, unknown>} [paperMeta]
 */
export function isLabelledPyqUpload(paperMeta) {
  const p = paperMeta && typeof paperMeta === 'object' ? paperMeta : {}
  return p.labelledPyq === true || p.officialPyq === true || p.pyqIntoBank === true
}

/** Required paper title for the general (not Official PYQ) upload path. */
export function normalizeNamedPaperTitle(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * @param {unknown} raw
 * @returns {string} empty when the name is usable
 */
export function namedPaperTitleError(raw) {
  if (!normalizeNamedPaperTitle(raw)) {
    return 'Type the name of this paper. It cannot be empty.'
  }
  return ''
}

/**
 * Suggested name from the file (user can change it). Never invents question text.
 * @param {{ name?: string } | null | undefined} file
 */
export function suggestedPaperNameFromFile(file) {
  const base = String(file?.name || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return normalizeNamedPaperTitle(base)
}

/**
 * Stamp classified + optional PYQ suffix. Does not invent a new prefix.
 * @param {object[]} drafts
 * @param {object[]} existing
 * @param {Record<string, unknown>} [paperMeta]
 */
export function stampBankUploadIds(drafts, existing = [], paperMeta = {}) {
  const list = Array.isArray(drafts) ? drafts.filter(Boolean) : []
  const bank = Array.isArray(existing) ? existing : []
  const stamped = []
  const excludeIds = []
  const labelled = isLabelledPyqUpload(paperMeta)
  const paperName = normalizeNamedPaperTitle(paperMeta.paperName ?? paperMeta.paperLabel)
  for (const draft of list) {
    let row = assignClassifiedQuestionId({ ...draft }, [...bank, ...stamped], { excludeIds })
    const year = paperMeta.year ?? paperMeta.pyqYear ?? row.pyqYear
    const exam = paperMeta.exam ?? paperMeta.examPatternId ?? row.examPatternId
    if (labelled && year && exam && canAssignClassifiedId(row)) {
      const core = stripFounderIdSuffixes(row.id)
      row = { ...row, id: pyqId(core, exam, year) }
    }
    if (paperName) {
      row = {
        ...row,
        paperName,
        paperLabel: String(row.paperLabel || '').trim() || paperName,
        source: String(row.source || '').trim() || paperName,
      }
    }
    stamped.push(row)
    excludeIds.push(String(row.id))
  }
  return stamped
}

/**
 * @param {unknown} result
 */
export function savedBankDraftCount(result) {
  return Array.isArray(result?.savedDrafts) ? result.savedDrafts.filter(Boolean).length : 0
}

/**
 * @param {unknown} result
 */
export function bankDraftsSuccessMessage(result) {
  const n = savedBankDraftCount(result)
  const note = String(result?.cloudNote ?? '').trim()
  const extra = String(result?.instructionText ?? '').trim()
    ? ' Instructions stayed as instructions, not extra questions.'
    : ''
  const paperName = normalizeNamedPaperTitle(result?.paperName ?? result?.paperMeta?.paperName)
  const named = paperName ? ` Paper name: “${paperName}”.` : ''
  const head =
    note ||
    (n
      ? `Mathpix OCR saved ${n} draft${n === 1 ? '' : 's'} (not published). Press Fill with Hybrid AI on Draft questions to add tags, answers, and solutions.`
      : 'Upload finished.')
  return `${head}${named}${extra} Open Saved questions → Draft to review. Published questions were not wiped.`
}

/**
 * If drafts were saved (or Mathpix/Gemini returned a clear empty/error), skip the
 * old single raw-LaTeX form fill so one PDF cannot become one garbage card.
 * @param {unknown} result
 * @param {{
 *   refresh?: () => void
 *   openDrafts?: () => void
 *   setMessage?: (msg: { type: string, text: string }) => void
 * }} [hooks]
 */
export function consumeBankMathpixExtractResult(result, hooks = {}) {
  const saved = savedBankDraftCount(result)
  if (saved > 0) {
    hooks.refresh?.()
    hooks.openDrafts?.()
    hooks.setMessage?.({
      type: result?.geminiMissing ? 'warning' : 'success',
      text: bankDraftsSuccessMessage(result),
    })
    try {
      window.dispatchEvent(
        new CustomEvent(BANK_DRAFTS_SAVED_EVENT, { detail: { count: saved } }),
      )
    } catch {
      /* ignore */
    }
    return true
  }
  const n = Array.isArray(result?.questions) ? result.questions.length : 0
  const engine = String(result?.engine ?? '')
  const note = String(result?.cloudNote ?? '').trim()
  if ((engine === 'mathpix' || engine === 'word') && n === 0 && note) {
    hooks.setMessage?.({
      type: result?.mathpixMissing || result?.geminiMissing ? 'error' : 'warning',
      text: note,
    })
    return true
  }
  return false
}

/**
 * @param {{
 *   subject?: string
 *   section?: string
 *   chapter?: string
 *   examPatternId?: string
 *   labelledPyq?: boolean
 *   exam?: string
 *   year?: number | string
 * }} [form]
 */
export function buildBankUploadPaperMeta(form = {}) {
  const year = Number(form.year)
  const paperName = normalizeNamedPaperTitle(form.paperName ?? form.paperLabel)
  return {
    subject: String(form.subject ?? '').trim() || undefined,
    section: String(form.section ?? '').trim() || undefined,
    chapter: String(form.chapter ?? '').trim() || undefined,
    examPatternId: String(form.examPatternId ?? form.exam ?? '').trim() || undefined,
    exam: String(form.exam ?? form.examPatternId ?? '').trim() || undefined,
    year: Number.isFinite(year) && year > 1900 ? year : undefined,
    pyqYear: Number.isFinite(year) && year > 1900 ? year : undefined,
    paperName: paperName || undefined,
    paperLabel: paperName || undefined,
    sourceLabel: paperName || undefined,
    labelledPyq: form.labelledPyq === true,
  }
}

/** Save verify-step cards to Draft (no solutions until user asks later). */
export function saveVerifiedBankDrafts(questions, paperMeta = {}) {
  const existing = loadUploadedQuestions()
  const stamped = stampBankUploadIds(questions, existing, paperMeta)
  return addUploadedQuestionsBulk(stamped)
}
