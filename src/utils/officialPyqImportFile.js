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
 * }} meta
 * @param {{
 *   onProgress?: (pct: number, label?: string) => void
 *   signal?: AbortSignal
 *   timeoutMs?: number
 * }} [io]
 */
export async function importFileToPending(file, meta, io = {}) {
  const name = file.name.toLowerCase()
  let questions
  let preparedText = ''
  let extractSummaryLine = ''
  let pdfText = ''
  let visionText = ''
  let cloudNote = ''
  /** @type {import('./pyqGeminiExtract.js').OfficialPyqExtractSummary | null} */
  let summary = null

  if (name.endsWith('.json')) {
    questions = parsePyqJson(await file.text()).map(repairGeminiPyqBankItem)
  } else if (name.endsWith('.csv')) {
    questions = parsePyqCsv(await file.text()).map(repairGeminiPyqBankItem)
  } else if (isSupportedOfficialPyqUpload(file)) {
    const extracted = await extractPyqFileWithGemini(file, io.onProgress, {
      signal: io.signal,
      timeoutMs: io.timeoutMs ?? 400_000,
      exam: meta.exam,
      year: meta.year,
      session: meta.session,
      paperLabel: meta.paperLabel,
    })
    const built = questionsFromOfficialPyqExtract(extracted, {
      exam: meta.exam,
      year: meta.year,
      session: meta.session,
      pyqDate: meta.pyqDate,
      pyqShift: meta.pyqShift,
      paperLabel: meta.paperLabel || `${getOfficialPyqExamLabel(meta.exam)} ${meta.year}`,
      sourceLabel: meta.sourceLabel,
    })
    visionText = String(extracted?.visionText ?? '')
    pdfText = String(extracted?.pdfText ?? extracted?.localOcrText ?? '')
    preparedText = String(built.preparedText || visionText || extracted?.text || pdfText)
    cloudNote = String(extracted?.cloudNote ?? '')
    summary = built.summary ?? null
    extractSummaryLine = built.summary ? formatOfficialPyqExtractSummary(built.summary) : ''
    questions = built.questions.map((q) => {
      const enriched = enrichParsedWithAnswerProvenance(q, q.text, { paperOnly: true })
      return {
        ...enriched,
        answerSource: enriched.answerSource || 'unknown',
        solutionSource: enriched.solutionSource,
      }
    })
    const min = pyqExtractLowCountThreshold(meta.exam)
    if (!questions.length && preparedText.length < 80) {
      throw new Error(
        built.rejected[0]
          ? `Extract rejected: ${built.rejected[0]}`
          : 'No questions found in the PDF/Word file. Check it is an official paper, or use JSON/CSV.',
      )
    }
    if (
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
  } else {
    throw new Error('Use an official PDF, Word, JSON, or CSV file.')
  }

  const paper = importQuestionsToOfficialPyqPending({
    exam: meta.exam,
    year: meta.year,
    session: meta.session || undefined,
    pyqDate: meta.pyqDate,
    pyqShift: meta.pyqShift,
    paperLabel: meta.paperLabel || `${getOfficialPyqExamLabel(meta.exam)} ${meta.year}`,
    sourceUrl: meta.sourceUrl || undefined,
    sourceLabel: meta.sourceLabel || 'Official source (uploaded)',
    preparedText,
    notes: formatOfficialPyqStoredNotes({
      fileName: file.name,
      summaryLine: extractSummaryLine,
      pdfText,
      visionText,
    }),
    questions: questions.map((q) => ({
      ...q,
      answerSource: q.answerSource || (q.correctIndex != null ? 'from_paper' : 'unknown'),
      solutionSource: q.solutionSource || (q.solution ? 'from_paper' : undefined),
    })),
  })
  return { paper, summary, preparedText, cloudNote }
}
