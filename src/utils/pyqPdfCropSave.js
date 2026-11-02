import { IMAGE_OPTION_LABELS } from './imageQuestion.js'
import { resolvePdfCropOcrForSave } from './pdfCropOcr.js'
import {
  optionsPayloadFromRegions,
  solutionPayloadFromBundle,
  stemFlagsForSave,
  stemImageForSave,
  stemTextFromBundle,
} from './pdfCropBundleSave.js'
import { normalizePyqItem } from './pyqImport.js'
import { getAllPyqQuestions } from '../data/pyqCatalog.js'

/** @param {string} paperId */
export function nextPyqSlotForPaper(paperId) {
  const existing = getAllPyqQuestions().filter((q) => q.paperId === paperId)
  return existing.reduce((m, q) => Math.max(m, q.pyqSlot ?? 0), 0) + 1
}

/**
 * @param {import('../components/PdfQuestionCropPanel.jsx').PdfCropBundle} bundle
 * @param {import('./pyqPaperDefaults.js').PyqPaperDefaults} paper
 * @param {number} [slotOverride]
 */
export function pdfCropBundleToPyqQuestion(bundle, paper, slotOverride) {
  const ocrMeta = resolvePdfCropOcrForSave(bundle.ocrMeta)
  const { regions } = bundle
  const text = stemTextFromBundle(
    bundle.label.trim() || `PYQ page ${bundle.pageNum}`,
    ocrMeta,
  )
  const questionImage = stemImageForSave(regions, ocrMeta)
  const optPayload = optionsPayloadFromRegions(regions, null, ocrMeta)
  const solPayload = solutionPayloadFromBundle(regions, ocrMeta)
  const slot = slotOverride ?? nextPyqSlotForPaper(paper.paperId)

  const qt =
    bundle.questionType === 'multiple_correct'
      ? 'multiple_correct'
      : bundle.questionType === 'integer'
        ? 'integer'
        : bundle.questionType === 'numerical'
          ? 'numerical'
          : 'single_correct'

  /** @type {Record<string, unknown>} */
  const raw = {
    questionType: qt,
    text,
    questionImage: questionImage || undefined,
    ...stemFlagsForSave(regions, ocrMeta),
    options: optPayload.options ?? IMAGE_OPTION_LABELS.slice(0, 4),
    optionImages: optPayload.optionImages,
    optionsImage: optPayload.optionsImage,
    contentMode: optPayload.contentMode ?? 'hybrid',
    ...solPayload,
    correctIndex: bundle.correctIndex ?? 0,
    ...(qt === 'multiple_correct'
      ? { correctIndices: bundle.correctIndices?.length ? bundle.correctIndices : [0] }
      : {}),
    pyqYear: paper.pyqYear,
    examPatternId: paper.examPatternId,
    paperId: paper.paperId,
    paperLabel: paper.paperLabel,
    pyqDate: paper.pyqDate,
    pyqShift: paper.pyqShift,
    pyqSession: paper.pyqSession,
    pyqSlot: slot,
    subject: paper.subject || 'General',
    chapter: paper.chapter || 'General',
    source: `PYQ PDF crop (page ${bundle.pageNum})`,
  }

  if (qt === 'integer') {
    raw.correctInteger =
      parseInt(String(bundle.subQuestions?.[0]?.correctInteger || '0'), 10) || 0
  }

  return normalizePyqItem(raw, slot - 1)
}
