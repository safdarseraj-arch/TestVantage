/**
 * Heavy official-PYQ upload path. Loaded only when the founder picks a file.
 * Keep this out of the Official PYQ first paint so the paper list can appear.
 */

import { getOfficialPyqExamLabel } from '../data/officialPyqSources.js'
import { parsePyqJson, parsePyqCsv } from './pyqImport.js'
import { enrichParsedWithAnswerProvenance } from './answerProvenance.js'
import { importQuestionsToOfficialPyqPending } from './officialPyqApproval.js'
import {
  extractPyqFileWithGemini,
  formatOfficialPyqExtractSummary,
  formatOfficialPyqStoredNotes,
  localPyqTextLooksGarbled,
  officialPyqStemsLookGarbled,
  pyqExtractLowCountThreshold,
  questionsFromOfficialPyqExtract,
  repairGeminiPyqBankItem,
} from './pyqGeminiExtract.js'
import { ocrIsHindiOnly } from './stripHindiOcr.js'

function isSupportedOfficialPyqUpload(file) {
  const name = String(file?.name || '').toLowerCase()
  const type = String(file?.type || '').toLowerCase()
  return (
    name.endsWith('.pdf') ||
    name.endsWith('.doc') ||
    name.endsWith('.docx') ||
    name.endsWith('.png') ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg') ||
    name.endsWith('.webp') ||
    name.endsWith('.gif') ||
    type.includes('pdf') ||
    type.includes('word') ||
    type.startsWith('image/')
  )
}

/**
 * @param {File} file
 * @param {{
 *   exam: 'jee-main' | 'jee-advanced' | 'neet'
 *   year: number
 *   session: string
 *   pyqDate?: string
 *   pyqShift?: number
 *   sourceUrl: string
 *   sourceLabel: string
 *   paperLabel: string
 *   paperKind?: 'other' | 'book'
 *   paperName?: string
 * }} meta paperKind 'other': a named paper from "Upload any paper"; 'book': one exercise of a book range
 * @param {{
 *   onProgress?: (pct: number, label?: string) => void
 *   signal?: AbortSignal
 *   timeoutMs?: number
 * }} [io]
 */
export async function importFileToPending(file, meta, io = {}) {
  const name = file.name.toLowerCase()
  const { other, label } = pendingPaperLabel(meta)

  if (name.endsWith('.json') || name.endsWith('.csv')) {
    const text = await file.text()
    const questions = (name.endsWith('.json') ? parsePyqJson(text) : parsePyqCsv(text)).map(repairGeminiPyqBankItem)
    const paper = savePendingPaper(meta, { questions, preparedText: '', notes: formatOfficialPyqStoredNotes({ fileName: file.name }) })
    return { paper, summary: null, preparedText: '', cloudNote: '' }
  }
  if (!isSupportedOfficialPyqUpload(file)) {
    throw new Error('Use an official PDF, Word, JSON, or CSV file.')
  }
  const extracted = await extractPyqFileWithGemini(file, io.onProgress, {
    signal: io.signal,
    timeoutMs: io.timeoutMs ?? 400_000,
    exam: meta.exam,
    year: meta.year,
    session: meta.session,
    paperLabel: other ? label : meta.paperLabel,
  })
  return pendingPaperFromExtract(extracted, meta, file.name)
}

/** @param {Parameters<typeof importFileToPending>[1]} meta */
function pendingPaperLabel(meta) {
  const other = meta.paperKind === 'other' || meta.paperKind === 'book'
  if (other && !String(meta.paperName ?? '').trim()) {
    throw new Error('Type the name of this paper. It cannot be empty.')
  }
  const label = other
    ? String(meta.paperName).replace(/\s+/g, ' ').trim()
    : meta.paperLabel || `${getOfficialPyqExamLabel(meta.exam)} ${meta.year}`
  return { other, label }
}

/**
 * The second half of an upload: split one scan (Mathpix text) into cards and save the pending
 * paper. Every upload kind (official, any paper, each book exercise) goes through here, so the
 * split, printed answers / solutions, Hindi and garbled-text checks and the stored OCR that
 * Quality check, Auto-fix, Compare and Re-parse read are the same everywhere.
 * @param {any} extracted what {@link extractPyqFileWithGemini} returned (or a part of it)
 * @param {Parameters<typeof importFileToPending>[1] & Record<string, unknown>} meta
 * @param {string} fileName
 */
export function pendingPaperFromExtract(extracted, meta, fileName) {
  const { other, label } = pendingPaperLabel(meta)
  const built = questionsFromOfficialPyqExtract(extracted, {
    exam: meta.exam,
    year: meta.year,
    session: meta.session,
    pyqDate: meta.pyqDate,
    pyqShift: meta.pyqShift,
    paperLabel: label,
    sourceLabel: meta.sourceLabel || (other ? label : undefined),
  })
  const visionText = String(extracted?.visionText ?? '')
  const pdfText = String(extracted?.pdfText ?? extracted?.localOcrText ?? '')
  const preparedText = String(built.preparedText || visionText || extracted?.text || pdfText)
  const cloudNote = String(extracted?.cloudNote ?? '')
  /** @type {import('./pyqGeminiExtract.js').OfficialPyqExtractSummary | null} */
  const summary = built.summary ?? null
  const extractSummaryLine = built.summary ? formatOfficialPyqExtractSummary(built.summary) : ''
  const questions = built.questions.map((q) => {
    const enriched = enrichParsedWithAnswerProvenance(q, q.text, { paperOnly: true })
    return {
      ...enriched,
      answerSource: enriched.answerSource || 'unknown',
      solutionSource: enriched.solutionSource,
    }
  })
  const min = pyqExtractLowCountThreshold(meta.exam)
  if (ocrIsHindiOnly(visionText || preparedText || pdfText)) {
    throw new Error('This PDF is in Hindi only. Nothing was saved. Upload the English (or English + Hindi) paper.')
  }
  if (!questions.length && preparedText.length < 80) {
    throw new Error(
      built.rejected[0]
        ? `Extract rejected: ${built.rejected[0]}`
        : 'No questions found in the PDF/Word file. Check it is an official paper, or use JSON/CSV.',
    )
  }
  if (
    !other &&
    meta.exam === 'jee-advanced' &&
    questions.length > 0 &&
    questions.length < min &&
    preparedText.length < 80 &&
    (officialPyqStemsLookGarbled(questions) ||
      (localPyqTextLooksGarbled(preparedText) && visionText.length < 80))
  ) {
    throw new Error(
      `Only ${questions.length} garbled row(s) from a broken PDF text layer. Nothing was saved. Official JEE Advanced papers are often scanned ? we need Gemini page reading (API on port 3001 + GEMINI_API_KEY). Do not approve if under ${min}.`,
    )
  }

  const paper = savePendingPaper(meta, {
    questions,
    preparedText,
    notes: formatOfficialPyqStoredNotes({
      fileName,
      summaryLine: extractSummaryLine,
      pdfText,
      visionText,
    }),
  })
  return { paper, summary, preparedText, cloudNote }
}

/**
 * @param {Parameters<typeof pendingPaperFromExtract>[1]} meta
 * @param {{ questions: any[], preparedText: string, notes: string }} found
 */
function savePendingPaper(meta, { questions, preparedText, notes }) {
  const { other, label } = pendingPaperLabel(meta)
  const book = meta.paperKind === 'book'
  return importQuestionsToOfficialPyqPending({
    ...(other ? { paperKind: book ? 'book' : 'other', paperName: label } : {}),
    ...(book
      ? {
          bookId: meta.bookId,
          bookName: meta.bookName,
          bookChapter: meta.bookChapter,
          bookExercise: meta.bookExercise,
          bookPartKind: meta.bookPartKind,
          bookPageStart: meta.bookPageStart,
          bookPageEnd: meta.bookPageEnd,
        }
      : {}),
    exam: meta.exam,
    year: meta.year,
    session: other ? undefined : meta.session || undefined,
    pyqDate: other ? undefined : meta.pyqDate,
    pyqShift: other ? undefined : meta.pyqShift,
    paperLabel: label,
    sourceUrl: meta.sourceUrl || undefined,
    sourceLabel: meta.sourceLabel || (other ? label : 'Official source (uploaded)'),
    preparedText,
    notes,
    questions: questions.map((q) => ({
      ...(book && meta.bookNoOptions ? openAnswerCard(q) : q),
      answerSource: q.answerSource || (q.correctIndex != null ? 'from_paper' : 'unknown'),
      solutionSource: q.solutionSource || (q.solution ? 'from_paper' : undefined),
    })),
  })
}

/**
 * A worked example or a question of an exercise printed with no options: answered with a value,
 * not A–D (there is no free-text type, so a value question it is).
 * @param {any} q
 */
function openAnswerCard(q) {
  const hasOptions = (Array.isArray(q?.options) ? q.options : []).some((o) => String(o ?? '').trim())
  if (hasOptions || !['single_correct', 'multiple_correct', undefined, ''].includes(q?.questionType)) return q
  return { ...q, questionType: q.correctInteger != null ? 'integer' : 'numerical' }
}
