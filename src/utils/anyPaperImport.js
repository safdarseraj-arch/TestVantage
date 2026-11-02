/**
 * Any-paper upload uses the Official PYQ extract/clean/split path.
 * Cards land in the named-paper pending store -- not Official PYQ.
 */

import { enrichParsedWithAnswerProvenance } from './answerProvenance.js'
import { namedPaperTitleError, normalizeNamedPaperTitle } from './bankMathpixUpload.js'
import { addAnyPaperPending, countFilledAnyPaperQuestions } from './anyPaperPendingStore.js'
import { repairOfficialPyqUntilQuality } from './officialPyqLocalQuality.js'
import {
  extractPyqFileWithGemini,
  formatOfficialPyqExtractSummary,
  formatOfficialPyqStoredNotes,
  questionsFromOfficialPyqExtract,
} from './pyqGeminiExtract.js'

export const ANY_PAPER_FILE_ACCEPT =
  '.pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.gif,image/*,application/pdf'

function isSupportedAnyPaperFile(file) {
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
 * The shared Official PYQ extract keeps a card only when a year is present.
 * That year is not stored on a named paper.
 * @param {string} paperName
 */
function extractorYear(paperName) {
  const hit = String(paperName ?? '').match(/\b(?:19|20)\d{2}\b/)
  return hit ? Number(hit[0]) : 2001
}

/**
 * Stamp a card as a named paper. Does not rewrite the stem.
 * @param {object} q
 * @param {string} paperName
 */
function stampNamedPaperCard(q, paperName) {
  const enriched = enrichParsedWithAnswerProvenance(q, q.text)
  return {
    ...enriched,
    paperName,
    paperLabel: paperName,
    source: paperName,
    officialPyq: false,
    imported: false,
    pyqYear: undefined,
    year: undefined,
    examPatternId: undefined,
    exam: undefined,
    paperId: undefined,
    pyqDate: undefined,
    pyqShift: undefined,
    pyqSession: undefined,
    answerSource: enriched.answerSource || 'unknown',
    solutionSource: enriched.solutionSource,
  }
}

/**
 * Same extract, stored OCR, cleaner, and quality check Official PYQ uses.
 * Cards stay in the named-paper list. Nothing is published here.
 * @param {unknown} extracted
 * @param {{ paperName: string, fileName?: string }} meta
 */
export function applyAnyPaperExtract(extracted, meta) {
  const paperName = normalizeNamedPaperTitle(meta?.paperName)
  const err = namedPaperTitleError(paperName)
  if (err) throw new Error(err)
  const built = questionsFromOfficialPyqExtract(extracted, {
    paperLabel: paperName,
    sourceLabel: paperName,
    year: extractorYear(paperName),
  })
  const visionText = String(extracted?.visionText ?? '')
  const pdfText = String(extracted?.pdfText ?? extracted?.localOcrText ?? '')
  const preparedText = String(built.preparedText || visionText || extracted?.text || pdfText)
  let questions = (Array.isArray(built.questions) ? built.questions : []).map((q) =>
    stampNamedPaperCard(q, paperName),
  )
  if (!questions.length) {
    throw new Error(
      built.rejected?.[0]
        ? `Extract rejected: ${built.rejected[0]}`
        : 'No questions found in the file. Try a clearer PDF or image.',
    )
  }
  let localQuality
  try {
    const repaired = repairOfficialPyqUntilQuality({
      paperLabel: paperName,
      sourceLabel: paperName,
      preparedText,
      questions,
      officialPyq: false,
    })
    if (Array.isArray(repaired?.paper?.questions) && repaired.paper.questions.length) {
      questions = repaired.paper.questions.map((q) => stampNamedPaperCard(q, paperName))
    }
    localQuality = repaired?.quality
  } catch {
    localQuality = undefined
  }
  const failed = Array.isArray(localQuality?.failedGoTo) ? localQuality.failedGoTo : []
  if (localQuality && (localQuality.passed !== true || failed.length || !questions.length)) {
    localQuality = { ...localQuality, passed: false, failedGoTo: failed }
  }
  const paper = addAnyPaperPending({
    paperName,
    preparedText,
    localQuality,
    notes: formatOfficialPyqStoredNotes({
      fileName: meta.fileName,
      summaryLine: built.summary ? formatOfficialPyqExtractSummary(built.summary) : '',
      pdfText: pdfText || preparedText,
      visionText: visionText || preparedText,
    }),
    questions,
  })
  return {
    paper,
    summary: built.summary ?? null,
    preparedText,
    filled: countFilledAnyPaperQuestions(paper.questions),
  }
}

/**
 * Mathpix + Local AI split -- same extractPyqFileWithGemini Official PYQ uses.
 * @param {File} file
 * @param {{ paperName: string }} meta
 * @param {{ onProgress?: function, signal?: AbortSignal, timeoutMs?: number }} [io]
 */
export async function importAnyPaperFile(file, meta, io = {}) {
  const paperName = normalizeNamedPaperTitle(meta?.paperName)
  const err = namedPaperTitleError(paperName)
  if (err) throw new Error(err)
  if (!isSupportedAnyPaperFile(file)) {
    throw new Error('Use a PDF, Word, or image file (same as Official PYQ upload).')
  }
  const extracted = await extractPyqFileWithGemini(file, io.onProgress, {
    signal: io.signal,
    timeoutMs: io.timeoutMs ?? 400_000,
    paperLabel: paperName,
  })
  return applyAnyPaperExtract(extracted, { paperName, fileName: file?.name })
}
