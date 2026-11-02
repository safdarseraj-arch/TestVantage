/**
 * Build bank-ready fields from a PDF crop bundle (regions → questionImage, optionImages, …).
 */

import { optionImagesFromRegions } from './pdfCropSteps.js'
import { IMAGE_OPTION_LABELS } from './imageQuestion.js'

/** @param {Record<string, import('./pdfCropOcr.js').PdfCropOcrResult>} [ocrMeta] @param {string} key */
export function ocrUseText(ocrMeta, key) {
  return ocrMeta?.[key]?.useText === true
}

/** @param {Record<string, import('./pdfCropOcr.js').PdfCropOcrResult>} [ocrMeta] @param {string} key */
export function ocrText(ocrMeta, key) {
  return String(ocrMeta?.[key]?.text ?? '').trim()
}

/**
 * OCR storage key for a crop step (passage sub-questions get per-index keys).
 * @param {string} stepKey
 * @param {number} subIndex
 * @param {string} questionType
 */
export function ocrMetaKeyForPassageStep(stepKey, subIndex, questionType) {
  const isPassage = questionType === 'passage_scq' || questionType === 'passage_integer'
  const subKeys = new Set([
    'sub_stem',
    'sub_options_block',
    'option_0',
    'option_1',
    'option_2',
    'option_3',
  ])
  if (isPassage && subKeys.has(stepKey)) {
    const suffix =
      stepKey === 'sub_stem'
        ? 'stem'
        : stepKey === 'sub_options_block'
          ? 'options_block'
          : stepKey
    return `sub_${subIndex}_${suffix}`
  }
  return stepKey
}

/**
 * Map scoped passage OCR keys back to generic keys for save helpers.
 * @param {Record<string, import('./pdfCropOcr.js').PdfCropOcrResult>} [ocrMeta]
 * @param {number} subIndex
 */
export function scopedPassageSubOcrMeta(ocrMeta, subIndex) {
  if (!ocrMeta) return {}
  const prefix = `sub_${subIndex}_`
  /** @type {Record<string, import('./pdfCropOcr.js').PdfCropOcrResult>} */
  const out = {}
  for (const [k, v] of Object.entries(ocrMeta)) {
    if (!k.startsWith(prefix)) continue
    const rest = k.slice(prefix.length)
    if (rest === 'stem') out.sub_stem = v
    else if (rest === 'options_block') out.sub_options_block = v
    else if (rest.startsWith('option_')) out[rest] = v
  }
  return out
}

/**
 * Crop image data URL for an OCR meta key on a PDF crop bundle.
 * @param {{
 *   fullImage?: string | null
 *   regions?: Record<string, string | null>
 *   subQuestions?: { stem?: string | null, optionsBlock?: string | null, optionImages?: (string|null)[] }[]
 * }} bundle
 * @param {string} ocrKey
 */
export function cropImageForOcrKey(bundle, ocrKey) {
  if (ocrKey === 'full') return bundle.fullImage ?? null
  const scoped = /^sub_(\d+)_(.+)$/.exec(ocrKey)
  if (scoped) {
    const idx = Number(scoped[1])
    const rest = scoped[2]
    const sq = bundle.subQuestions?.[idx]
    if (!sq) return null
    if (rest === 'stem') return sq.stem ?? null
    if (rest === 'options_block') return sq.optionsBlock ?? null
    if (rest.startsWith('option_')) {
      const oi = Number(rest.replace('option_', ''))
      return sq.optionImages?.[oi] ?? null
    }
  }
  return bundle.regions?.[ocrKey] ?? null
}

/**
 * Stem / title text — OCR text when chosen, else label.
 * @param {string} label
 * @param {Record<string, import('./pdfCropOcr.js').PdfCropOcrResult>} [ocrMeta]
 */
export function stemTextFromBundle(label, ocrMeta) {
  for (const key of ['stem', 'full', 'column_I', 'passage_body', 'sub_stem']) {
    if (ocrUseText(ocrMeta, key)) {
      const t = ocrText(ocrMeta, key)
      if (t) return t
    }
  }
  return label.trim()
}

/** @param {Record<string, string | null>} regions */
export function stemImageFromRegions(regions) {
  return regions.stem || regions.column_I || regions.diagram || null
}

/**
 * @param {Record<string, string | null>} regions
 * @param {Record<string, import('./pdfCropOcr.js').PdfCropOcrResult>} [ocrMeta]
 */
export function stemImageForSave(regions, ocrMeta) {
  if ((ocrUseText(ocrMeta, 'stem') || ocrUseText(ocrMeta, 'full')) && !regions.diagram) return undefined
  if (ocrUseText(ocrMeta, 'column_I') && !regions.stem && !regions.diagram) return undefined
  if (ocrUseText(ocrMeta, 'passage_body') && !regions.passage_diagram) return undefined
  return stemImageFromRegions(regions) || regions.passage_body || regions.passage_diagram || undefined
}

/**
 * @param {Record<string, string | null>} regions
 * @param {Record<string, import('./pdfCropOcr.js').PdfCropOcrResult>} [ocrMeta]
 */
export function stemFlagsForSave(regions, ocrMeta) {
  const img = stemImageForSave(regions, ocrMeta)
  const stemAsText =
    ocrUseText(ocrMeta, 'stem') ||
    ocrUseText(ocrMeta, 'full') ||
    ocrUseText(ocrMeta, 'column_I') ||
    ocrUseText(ocrMeta, 'passage_body')
  const diagramOnly = !!regions.diagram && !regions.stem && !regions.column_I && !stemAsText
  return {
    stemTextInImage: !stemAsText && !diagramOnly && !!img,
    stemImageCrop: diagramOnly || (!!regions.diagram && stemAsText),
    contentMode: img && !stemAsText ? 'hybrid' : stemAsText && !img ? '' : 'hybrid',
  }
}

/**
 * @param {Record<string, string | null>} regions
 * @param {{ stem?: string | null, optionsBlock?: string | null, optionImages?: (string|null)[] }} [sub]
 * @param {Record<string, import('./pdfCropOcr.js').PdfCropOcrResult>} [ocrMeta]
 */
export function optionsPayloadFromRegions(regions, sub, ocrMeta) {
  const optionLabels = IMAGE_OPTION_LABELS.slice(0, 4)

  if (ocrUseText(ocrMeta, 'options_block') || ocrUseText(ocrMeta, 'sub_options_block')) {
    const key = ocrUseText(ocrMeta, 'sub_options_block') ? 'sub_options_block' : 'options_block'
    const opts = ocrMeta?.[key]?.options ?? optionLabels
    const filled = opts.filter((o) => String(o ?? '').trim()).length
    if (filled >= 2) {
      return { options: opts.slice(0, 4), contentMode: '' }
    }
  }

  const perOpt = [0, 1, 2, 3].map((i) => {
    const k = `option_${i}`
    if (ocrUseText(ocrMeta, k)) return ocrText(ocrMeta, k)
    return null
  })
  if (perOpt.filter(Boolean).length >= 2) {
    const options = optionLabels.map((lab, i) => perOpt[i] || lab)
    return { options, contentMode: '' }
  }

  const imgs = sub?.optionImages ?? optionImagesFromRegions(regions)
  const filled = imgs.filter(Boolean).length
  const block = sub?.optionsBlock ?? regions.options_block
  if (filled >= 2) {
    return { options: optionLabels, optionImages: imgs.map((i) => i ?? ''), contentMode: 'hybrid' }
  }
  if (block) {
    return { options: optionLabels, optionsImage: block, contentMode: 'hybrid' }
  }
  return { options: optionLabels, contentMode: 'hybrid' }
}

/**
 * @param {Record<string, string | null>} regions
 * @param {Record<string, import('./pdfCropOcr.js').PdfCropOcrResult>} [ocrMeta]
 */
export function solutionPayloadFromBundle(regions, ocrMeta) {
  if (ocrUseText(ocrMeta, 'solution')) {
    const t = ocrText(ocrMeta, 'solution')
    return t ? { solution: t, solutionImage: undefined } : {}
  }
  if (regions.solution) {
    return { solutionImage: regions.solution, solution: undefined }
  }
  return {}
}

/** @param {Record<string, string | null>} regions */
export function stemFlagsFromRegions(regions) {
  const stem = regions.stem || regions.column_I
  const diagramOnly = !!regions.diagram && !stem
  return {
    stemTextInImage: !diagramOnly && !!(stem || regions.column_I),
    stemImageCrop: diagramOnly || (!!regions.diagram && !stem),
  }
}
