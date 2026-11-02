/**
 * Adaptive stem / option image layout plan for MCQ uploads.
 * Classifies whether the stem and/or options need figure crops — do not assume one pattern.
 *
 * Cases:
 * 1. text_text — text stem + text A–D (no crops)
 * 2. text_graphs — text stem + graph options (1×4 / 2×2); drop full composite
 * 3. figure_text — stem figure + text options; keep stem crop only
 * 4. figure_graphs — stem figure + option graphs; crop both, no duplicate options in stem
 * 5. mixed_options — some text, some graph options; crop only graph slots
 * 6. no_figure — nothing to crop; never invent graph placeholders
 */

import {
  countRealMcqOptions,
  hasSeparateStemFigureCue,
  stemLikelyNeedsDiagramImage,
  stemSaysOptionsAreFigures,
} from './stemDiagramDetect.js'
import {
  blobMentionsGraphOptions,
  countGraphOptionsNeedingImage,
  looksLikeRealOptionText,
  looksLikeVerbalGraphOptionDescription,
  optionsAreTextOnlyMcq,
  shouldSkipOptionsAutoCrop,
  shouldUseGraphPlaceholder,
} from './graphOptionOcr.js'

/**
 * @typedef {'text_text' | 'text_graphs' | 'figure_text' | 'figure_graphs' | 'mixed_options' | 'no_figure'} McqImageLayoutKind
 */

/**
 * Per-option: which A–D slots need a graph image crop.
 * @param {string} stem
 * @param {string[]} options
 * @param {(string|null|undefined)[]} [optionImages]
 * @returns {number[]}
 */
export function graphOptionIndexesNeedingCrop(stem, options = [], optionImages = []) {
  const idxs = []
  for (let i = 0; i < 4; i++) {
    const hasImg = !!String(optionImages?.[i] ?? '').trim()
    if (hasImg) continue
    if (shouldUseGraphPlaceholder(options?.[i], stem, false)) idxs.push(i)
  }
  return idxs
}

/**
 * Classify stem/option figure layout from OCR + heuristics (no image I/O).
 * Optional visionHints from Gemini region kinds refine the plan.
 * @param {{
 *   stem?: string
 *   options?: string[]
 *   extractedRaw?: string
 *   optionImages?: (string|null|undefined)[]
 *   stemImageCrop?: boolean
 *   questionType?: string
 *   visionHints?: {
 *     hasStemFigure?: boolean
 *     optionGraphCount?: number
 *     optionTextCount?: number
 *     layout?: string
 *   }
 * }} [ctx]
 */
export function classifyMcqImageLayout(ctx = {}) {
  const stem = String(ctx.stem ?? '').trim()
  const options = ctx.options ?? []
  const extractedRaw = String(ctx.extractedRaw ?? '').trim()
  const optionImages = ctx.optionImages ?? []
  const blob = `${stem}\n${extractedRaw}`
  const textOpts = countRealMcqOptions(stem, options)
  const textOnly = optionsAreTextOnlyMcq(options)
  const graphNeed = countGraphOptionsNeedingImage(options, optionImages, stem)
  const existingGraphImgs = (optionImages ?? []).filter((u) => !!String(u ?? '').trim()).length
  const graphIdxs = graphOptionIndexesNeedingCrop(stem, options, optionImages)
  const optionsAreGraphs =
    stemSaysOptionsAreFigures(stem) ||
    stemSaysOptionsAreFigures(blob) ||
    blobMentionsGraphOptions(blob) ||
    existingGraphImgs >= 2
  const separateStem = hasSeparateStemFigureCue(blob)
  const stemLikelyFig = stemLikelyNeedsDiagramImage(stem, extractedRaw, {
    questionType: ctx.questionType ?? 'single_correct',
  })
  const vision = ctx.visionHints ?? {}
  const visionStemFig = vision.hasStemFigure === true
  const visionOptGraphs = Number(vision.optionGraphCount ?? 0)
  const visionOptText = Number(vision.optionTextCount ?? 0)

  const stemHasFigure = separateStem || visionStemFig || (stemLikelyFig && !stemSaysOptionsAreFigures(blob))
  const skipOptCrop = shouldSkipOptionsAutoCrop(stem, options, extractedRaw)

  /** Case 3 — stem figure + text options (before generic text_text) */
  if (
    stemHasFigure &&
    (textOnly || textOpts >= 2) &&
    graphNeed === 0 &&
    existingGraphImgs < 2 &&
    visionOptGraphs < 2 &&
    // "graph as shown" stems still have numeric/text A–D — not option-graph strips
    (!optionsAreGraphs || textOnly || textOpts >= 3)
  ) {
    return {
      kind: /** @type {McqImageLayoutKind} */ ('figure_text'),
      attemptDiagramAutoCrop: true,
      attemptOptionsAutoCrop: false,
      dropFullPageQuestionImage: false,
      keepStemImage: true,
      excludeBottomForStem: textOpts >= 2,
      graphOptionIndexes: [],
    }
  }

  /** Case 1 — text stem + text options */
  if (
    !stemHasFigure &&
    (textOnly || (textOpts >= 3 && graphNeed === 0 && !optionsAreGraphs && visionOptGraphs < 2))
  ) {
    return {
      kind: /** @type {McqImageLayoutKind} */ ('text_text'),
      attemptDiagramAutoCrop: false,
      attemptOptionsAutoCrop: false,
      dropFullPageQuestionImage: stem.length > 40 && textOpts >= 2,
      keepStemImage: false,
      excludeBottomForStem: false,
      graphOptionIndexes: [],
    }
  }

  /** Case 5 — mixed text + graph options */
  const realTextSlots = (options ?? []).filter((o) => looksLikeRealOptionText(o)).length
  const mixed =
    (graphNeed >= 1 && realTextSlots >= 1 && graphNeed <= 3) ||
    (visionOptGraphs >= 1 && visionOptText >= 1 && visionOptGraphs <= 3)
  if (mixed && !optionsAreGraphs) {
    return {
      kind: /** @type {McqImageLayoutKind} */ ('mixed_options'),
      attemptDiagramAutoCrop: stemHasFigure,
      attemptOptionsAutoCrop: !skipOptCrop || graphNeed >= 1,
      dropFullPageQuestionImage: !stemHasFigure && !ctx.stemImageCrop,
      keepStemImage: stemHasFigure || !!ctx.stemImageCrop,
      excludeBottomForStem: stemHasFigure && (graphNeed >= 1 || visionOptGraphs >= 1),
      graphOptionIndexes: graphIdxs.length ? graphIdxs : graphNeed > 0 ? graphIdxs : [],
    }
  }

  /** Cases 2 / 4 — graph options (all or stem-says-figures) */
  const wantOptionGraphs =
    optionsAreGraphs ||
    graphNeed >= 2 ||
    existingGraphImgs >= 2 ||
    visionOptGraphs >= 2 ||
    (options ?? []).some((o) => looksLikeVerbalGraphOptionDescription(o))

  if (wantOptionGraphs) {
    if (stemHasFigure || separateStem || visionStemFig) {
      return {
        kind: /** @type {McqImageLayoutKind} */ ('figure_graphs'),
        attemptDiagramAutoCrop: true,
        attemptOptionsAutoCrop: true,
        dropFullPageQuestionImage: true,
        keepStemImage: true,
        excludeBottomForStem: true,
        graphOptionIndexes: graphIdxs.length ? graphIdxs : [0, 1, 2, 3],
      }
    }
    return {
      kind: /** @type {McqImageLayoutKind} */ ('text_graphs'),
      attemptDiagramAutoCrop: false,
      attemptOptionsAutoCrop: true,
      dropFullPageQuestionImage: true,
      keepStemImage: false,
      excludeBottomForStem: false,
      graphOptionIndexes: graphIdxs.length ? graphIdxs : [0, 1, 2, 3],
    }
  }

  /** Case 6 — no figure anywhere */
  return {
    kind: /** @type {McqImageLayoutKind} */ ('no_figure'),
    attemptDiagramAutoCrop: false,
    attemptOptionsAutoCrop: false,
    dropFullPageQuestionImage: stem.length > 40 && textOpts >= 4,
    keepStemImage: false,
    excludeBottomForStem: false,
    graphOptionIndexes: [],
  }
}

/**
 * Whether to clear a full composite question image after option graph crops.
 * Respects figure_graphs / figure_text (keep stem-only crop).
 * @param {{
 *   stem?: string
 *   extractedRaw?: string
 *   optionImages?: (string|null|undefined)[]
 *   stemImageCrop?: boolean
 *   options?: string[]
 *   layoutKind?: McqImageLayoutKind
 * }} [ctx]
 */
export function shouldDropCompositeForLayout(ctx = {}) {
  const plan = classifyMcqImageLayout(ctx)
  const imgs = (ctx.optionImages ?? []).filter((u) => !!String(u ?? '').trim()).length
  const text = String(ctx.stem ?? '').trim()

  if (plan.kind === 'figure_text') return false
  /** Keep deliberate stem-only diagram when stem has its own figure. */
  if (plan.keepStemImage && ctx.stemImageCrop) return false

  if (plan.kind === 'text_graphs' || plan.kind === 'figure_graphs' || plan.kind === 'mixed_options') {
    if (!ctx.stemImageCrop && imgs >= 2) return true
    if (!ctx.stemImageCrop && imgs >= 1 && text.length >= 30) return true
    /** Stem-band crop but options-are-graphs without separate stem figure → prefer text. */
    if (ctx.stemImageCrop && !plan.keepStemImage && imgs >= 2 && text.length >= 30) return true
    return false
  }

  if (plan.kind === 'text_text' || plan.kind === 'no_figure') {
    /** Complete text stem — drop stem crop even when a false-positive stemImageCrop was set. */
    if (!plan.keepStemImage && text.length >= 40) {
      const textOpts = countRealMcqOptions(text, ctx.options ?? [])
      if (textOpts >= 2 || imgs >= 1) return true
    }
    return !ctx.stemImageCrop && imgs >= 1 && text.length >= 30
  }
  return false
}
