/**
 * Figure / diagram images for OCR-uploaded MCQs (stable contract for future saves).
 *
 * Rules (do not bypass):
 * - "as shown", graph, circuit, etc. → auto-crop diagram only; never store full-page OCR shots.
 * - Persist: questionImage + stemImageCrop: true + stemTextInImage: false
 * - Display/tests: shouldShowQuestionStemImage() in stemDiagramDetect.js
 * - Bank migration: normalizeFigureQuestionOnMigrate() on every load/repair
 *
 * Full pipeline rules: `.cursor/rules/question-upload-pipeline.mdc`
 * Regression tests: `npm run test:regression` (from onlinetest/)
 */

import {
  looksLikeIntegerValueQuestion,
  stemLikelyNeedsDiagramImage,
  shouldAttemptDiagramAutoCrop,
  shouldUseDiagramSplitWorkflow,
  stemSaysOptionsAreFigures,
  hasSeparateStemFigureCue,
  stemTextCompleteWithoutVisualFigure,
} from './stemDiagramDetect.js'
import {
  classifyMcqImageLayout,
  shouldDropCompositeForLayout,
} from './mcqImageLayoutPlan.js'

export {
  stemLikelyNeedsDiagramImage,
  shouldUseDiagramSplitWorkflow,
  shouldAttemptDiagramAutoCrop,
  hasSeparateStemFigureCue,
  classifyMcqImageLayout,
}

/**
 * Drop full composite screenshot when A–D option graph crops exist and stem text is usable.
 * Keeps a deliberate stem-only diagram when the stem has its own figure (circuit / as shown).
 * @param {{
 *   stem?: string
 *   extractedRaw?: string
 *   optionImages?: (string|null|undefined)[]
 *   stemImageCrop?: boolean
 *   options?: string[]
 * }} [ctx]
 */
export function shouldDropCompositeStemForOptionGraphs(ctx = {}) {
  return shouldDropCompositeForLayout(ctx)
}

/** @param {string} stem @param {string} [extractedRaw] @param {{ questionType?: string }} [opts] */
export function questionNeedsFigure(stem, extractedRaw = '', opts = {}) {
  return shouldAttemptDiagramAutoCrop(stem, extractedRaw, [], opts.questionType ?? '')
}

/**
 * Auto-crop a diagram from a screenshot URL (structural runs, best band, right column).
 * @param {string} srcUrl data URL or object URL
 * @param {{ excludeTopRatio?: number, excludeBottomRatio?: number, mcqOptionCount?: number }} [opts]
 * @returns {Promise<{ url: string, stemImageCrop: true, stemTextInImage: false } | null>}
 */
/**
 * After OCR upload or switching away from MTC, auto-crop the figure when the stem needs one.
 * @param {{
 *   sourceUrl: string
 *   stem?: string
 *   extractedRaw?: string
 *   questionType?: string
 *   options?: string[]
 *   mcqOptionCount?: number
 * }} input
 * @returns {Promise<{ url: string, stemImageCrop: true, stemTextInImage: false } | null>}
 */
export async function tryAutoCropStemDiagramFromSource({
  sourceUrl,
  stem = '',
  extractedRaw = '',
  questionType = '',
  options = [],
  mcqOptionCount,
}) {
  if (!sourceUrl?.trim()) return null
  const layout = classifyMcqImageLayout({
    stem,
    extractedRaw,
    options,
    questionType,
  })
  if (!layout.attemptDiagramAutoCrop) return null
  if (!shouldAttemptDiagramAutoCrop(stem, extractedRaw, options, questionType)) return null

  // Options ARE the four graphs (1×4 / 2×2) — do not crop them into the stem image
  // unless a separate stem figure exists (figure_graphs).
  const blob = `${stem}\n${extractedRaw}`
  if (stemSaysOptionsAreFigures(stem) || stemSaysOptionsAreFigures(blob)) {
    if (!hasSeparateStemFigureCue(blob) && layout.kind !== 'figure_graphs') return null
  }

  const mcq =
    mcqOptionCount ?? (Array.isArray(options) ? options.filter((o) => String(o ?? '').trim()).length : 0)
  return cropDiagramFromImageSource(sourceUrl, {
    mcqOptionCount: mcq,
    questionType,
    stem,
    // Keep option graph row out of the stem crop when both exist.
    excludeBottomRatio: layout.excludeBottomForStem || mcq >= 2 ? 0.38 : undefined,
  })
}

export async function cropDiagramFromImageSource(srcUrl, opts = {}) {
  if (!srcUrl?.trim()) return null
  const mcq = opts.mcqOptionCount ?? 0
  const isInteger =
    opts.questionType === 'integer' ||
    opts.questionType === 'numerical' ||
    (mcq < 1 && looksLikeIntegerValueQuestion(opts.stem ?? '', []))
  const defaultTop = mcq >= 2 ? 0.1 : isInteger ? 0.14 : 0.06
  const defaultBottom = mcq >= 2 ? 0.32 : isInteger ? 0.16 : 0.08
  const excludeTopRatio = opts.excludeTopRatio ?? defaultTop
  const excludeBottomRatio = opts.excludeBottomRatio ?? defaultBottom
  try {
    const { autoCropDiagram } = await import('./autoDetectDiagram.js')
    const passes = [
      { excludeTopRatio, excludeBottomRatio, lenient: false },
      { excludeTopRatio, excludeBottomRatio, lenient: true },
      { excludeTopRatio: Math.min(excludeTopRatio, 0.06), excludeBottomRatio: 0.06, lenient: true },
      { excludeTopRatio: 0.05, excludeBottomRatio: Math.max(excludeBottomRatio, 0.38), lenient: true },
      { excludeTopRatio: 0.04, excludeBottomRatio: 0.52, lenient: true },
      { excludeTopRatio: 0.12, excludeBottomRatio: 0.22, lenient: true },
    ]
    for (const pass of passes) {
      const cropped = await autoCropDiagram(srcUrl, pass)
      if (cropped) return { url: cropped, stemImageCrop: true, stemTextInImage: false }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Fields to persist on a question with a figure. Passage parents use passageImage instead.
 * @param {{
 *   questionImage?: string
 *   stemImageCrop?: boolean
 *   stemTextInImage?: boolean
 *   needsFigure?: boolean
 *   forPassageParent?: boolean
 * }} opts
 */
export function buildStoredFigureImageFields({
  questionImage,
  stemImageCrop = false,
  stemTextInImage = false,
  needsFigure = false,
  forPassageParent = false,
  mcqOptionCount = 0,
  optionImages = [],
  stem = '',
  extractedRaw = '',
}) {
  let img = questionImage?.trim()
  /** Text MCQ with four OCR options — never persist a duplicate full-page screenshot. */
  if (img && !needsFigure && !stemImageCrop && mcqOptionCount >= 4) {
    img = ''
  }
  /** Complete text extract — also drop mistaken stem-band crops (cases / piecewise OCR). */
  if (img && !needsFigure && stemImageCrop && mcqOptionCount >= 4 && String(stem ?? '').trim().length > 40) {
    img = ''
  }
  /** Option graph crops exist — never persist the full composite as the stem image. */
  if (
    img &&
    shouldDropCompositeStemForOptionGraphs({
      stem,
      extractedRaw,
      optionImages,
      stemImageCrop,
    })
  ) {
    img = ''
  }
  if (!img) return {}

  if (forPassageParent) {
    return {
      passageImage: img,
      questionImage: undefined,
      stemImageCrop: undefined,
      stemTextInImage: undefined,
    }
  }

  if (needsFigure) {
    return {
      questionImage: img,
      stemImageCrop: stemImageCrop ? true : undefined,
      stemTextInImage: false,
    }
  }

  return {
    questionImage: img,
    stemImageCrop: stemImageCrop || undefined,
    stemTextInImage: stemTextInImage ? true : stemImageCrop ? false : undefined,
  }
}

/**
 * Bank migration hook — strip mistaken full-page screenshots on figure questions.
 * @param {import('../data/tests').Question} q
 */
export function normalizeFigureQuestionOnMigrate(q) {
  if (!q || typeof q !== 'object') return q
  const next = { ...q }
  const needsFigure = stemLikelyNeedsDiagramImage(next.text ?? '')
  const optImgs = next.optionImages ?? []
  if (
    shouldDropCompositeStemForOptionGraphs({
      stem: next.text ?? '',
      optionImages: optImgs,
      stemImageCrop: !!next.stemImageCrop,
      options: next.options ?? [],
    })
  ) {
    delete next.questionImage
    delete next.stemImageCrop
    delete next.stemTextInImage
    return next
  }
  if (!next.questionImage || !needsFigure) {
    /** Integer/numerical with OCR text + accidental full-page hybrid image — keep text only. */
    const type = next.questionType ?? ''
    const textLen = String(next.text ?? '').trim().length
    if (
      (type === 'integer' || type === 'numerical') &&
      textLen > 80 &&
      next.questionImage &&
      !next.stemImageCrop &&
      next.stemTextInImage !== true
    ) {
      delete next.questionImage
      delete next.stemImageCrop
      delete next.stemTextInImage
    }
    const mcqType = type === 'single_correct' || type === 'multiple_correct'
    const filledOpts = (next.options ?? []).filter((o) => String(o ?? '').trim().length > 8)
    /** Complete text MCQ — strip redundant stem crop even when stemImageCrop was set (false cases crop). */
    if (
      mcqType &&
      textLen > 40 &&
      next.questionImage &&
      !needsFigure &&
      filledOpts.length >= 4
    ) {
      delete next.questionImage
      delete next.stemImageCrop
      delete next.stemTextInImage
    } else if (
      mcqType &&
      stemTextCompleteWithoutVisualFigure(next)
    ) {
      delete next.questionImage
      delete next.stemImageCrop
      delete next.stemTextInImage
    }
    /** MCQ with A–D option crops + stem text — drop non-cropped composite. */
    const imgSlots = (optImgs ?? []).filter((u) => !!String(u ?? '').trim()).length
    if (mcqType && textLen > 30 && next.questionImage && !next.stemImageCrop && imgSlots >= 2) {
      delete next.questionImage
      delete next.stemImageCrop
      delete next.stemTextInImage
    }
    return next
  }

  if (next.stemTextInImage === true) {
    delete next.questionImage
    delete next.stemImageCrop
    delete next.stemTextInImage
  } else if (next.stemImageCrop) {
    next.stemTextInImage = false
  }
  return next
}

/**
 * Resolve diagram before save: auto-crop from upload source when needed.
 * @param {{
 *   questionImage?: string | null
 *   stemImageCrop?: boolean
 *   stemTextInImage?: boolean
 *   stem: string
 *   extractedRaw?: string
 *   sourceUrl?: string | null
 * }} input
 * @returns {Promise<
 *   | { ok: true, questionImage: string, stemImageCrop: boolean, stemTextInImage: boolean }
 *   | { ok: false, reason: 'not_figure' | 'diagram_missing' | 'full_page' }
 * >}
 */
export async function resolveFigureImageForSave({
  questionImage,
  stemImageCrop = false,
  stemTextInImage = false,
  stem,
  extractedRaw = '',
  sourceUrl = null,
  mcqOptionCount = 0,
  questionType = '',
  optionImages = [],
}) {
  if (questionType === 'matrix_match' && !shouldAttemptDiagramAutoCrop(stem, extractedRaw, [], questionType)) {
    return {
      ok: true,
      questionImage: '',
      stemImageCrop: false,
      stemTextInImage: false,
    }
  }

  /** Option graphs cropped — do not keep full composite as stem (text + A–D crops). */
  if (
    shouldDropCompositeStemForOptionGraphs({
      stem,
      extractedRaw,
      optionImages,
      stemImageCrop,
    })
  ) {
    return {
      ok: true,
      questionImage: '',
      stemImageCrop: false,
      stemTextInImage: false,
    }
  }

  const needsFig = shouldAttemptDiagramAutoCrop(stem, extractedRaw, [], questionType)
  if (!needsFig) {
    /** Complete text MCQ — clear redundant stem crop left from OCR auto-band. */
    if (mcqOptionCount >= 4 && String(stem ?? '').trim().length > 40) {
      return {
        ok: true,
        questionImage: '',
        stemImageCrop: false,
        stemTextInImage: false,
      }
    }
    return {
      ok: true,
      questionImage: questionImage || '',
      stemImageCrop,
      stemTextInImage,
    }
  }

  const manualCropOk =
    questionImage?.trim() && stemImageCrop && stemTextInImage !== true

  /** Keep split-tool / diagram-only crops — do not replace with auto-crop from full OCR page. */
  if (manualCropOk) {
    return {
      ok: true,
      questionImage: questionImage.trim(),
      stemImageCrop: true,
      stemTextInImage: false,
    }
  }

  const cropOpts = {
    mcqOptionCount,
    questionType,
    stem,
  }
  const tryUrls = [sourceUrl, questionImage].filter((u) => u?.trim())
  for (const src of tryUrls) {
    const crop = await cropDiagramFromImageSource(src, cropOpts)
    if (crop) {
      return { ok: true, questionImage: crop.url, ...crop }
    }
  }

  if (questionImage?.trim() && (!stemImageCrop || stemTextInImage === true)) {
    return {
      ok: true,
      questionImage: questionImage.trim(),
      stemImageCrop: false,
      stemTextInImage: false,
    }
  }

  return { ok: false, reason: 'diagram_missing' }
}

/**
 * Passage upload: prefer diagram-only crop so passage text is not duplicated under the image.
 * @param {string} srcUrl
 * @param {string} [passageText]
 */
export async function resolvePassageDiagramFromSource(srcUrl, passageText = '') {
  if (!srcUrl?.trim()) return null
  const crop = await cropDiagramFromImageSource(srcUrl, {
    mcqOptionCount: 0,
    questionType: 'integer',
    stem: passageText,
  })
  if (crop?.url) {
    return { url: crop.url, passageImageCrop: true }
  }
  // Avoid full-page upload as passage diagram (sub-questions / matrices would show in preview).
  return null
}
