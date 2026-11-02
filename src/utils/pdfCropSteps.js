/**
 * Crop-step definitions for PDF upload — maps question types to draggable regions.
 */

/** @typedef {'single_correct' | 'multiple_correct' | 'matrix_match' | 'passage_scq' | 'passage_integer' | 'integer' | 'numerical'} PdfCropQuestionTypeId */

/** @typedef {{ key: string, label: string, required?: boolean, role?: 'stem' | 'option' | 'passage' | 'crop' }} PdfCropStepDef */

export const PDF_CROP_TYPE_OPTIONS = [
  { id: 'single_correct', label: 'SCQ — single correct' },
  { id: 'multiple_correct', label: 'MCQ — multiple correct' },
  { id: 'matrix_match', label: 'MTC — match the column' },
  { id: 'passage_scq', label: 'PSCQ — passage + SCQ' },
  { id: 'passage_integer', label: 'PIVQ — passage + integer/numerical' },
  { id: 'integer', label: 'IVQ — integer answer' },
  { id: 'numerical', label: 'NVQ — numerical answer' },
]

const SOLUTION_STEP = { key: 'solution', label: 'Solution (optional)', role: 'crop' }

const NUMERIC_STEPS = [
  { key: 'stem', label: 'Question text', required: true, role: 'stem' },
  { key: 'diagram', label: 'Diagram (optional)', role: 'stem' },
  SOLUTION_STEP,
]

const SCQ_STEPS = [
  { key: 'stem', label: 'Question text', required: true, role: 'stem' },
  { key: 'diagram', label: 'Diagram (optional)', role: 'stem' },
  { key: 'options_block', label: 'Options A–D (together)', role: 'option' },
  { key: 'option_0', label: 'Option A', role: 'option' },
  { key: 'option_1', label: 'Option B', role: 'option' },
  { key: 'option_2', label: 'Option C', role: 'option' },
  { key: 'option_3', label: 'Option D', role: 'option' },
  SOLUTION_STEP,
]

const MATRIX_STEPS = [
  { key: 'stem', label: 'Title / instruction', role: 'stem' },
  { key: 'column_I', label: 'Column I (rows A–D)', required: true, role: 'stem' },
  { key: 'column_II', label: 'Column II (P–T / 1–5)', required: true, role: 'option' },
  { key: 'diagram', label: 'Diagram (optional)', role: 'stem' },
  SOLUTION_STEP,
]

const PASSAGE_SHARED = [
  { key: 'passage_body', label: 'Passage body', required: true, role: 'passage' },
  { key: 'passage_diagram', label: 'Passage diagram (optional)', role: 'passage' },
]

const SUB_STEM = { key: 'sub_stem', label: 'Sub-question stem', required: true, role: 'stem' }
const SUB_OPTS = { key: 'sub_options_block', label: 'Sub-question options A–D', role: 'option' }

/** @param {string} qType @param {{ subIndex?: number }} [opts] */
export function getCropStepsForType(qType, { subIndex = 0 } = {}) {
  switch (qType) {
    case 'multiple_correct':
      return SCQ_STEPS
    case 'matrix_match':
      return MATRIX_STEPS
    case 'passage_scq':
    case 'passage_integer':
      return [
        ...PASSAGE_SHARED,
        { ...SUB_STEM, label: `Sub Q${subIndex + 1} — stem`, required: true },
        { ...SUB_OPTS, label: `Sub Q${subIndex + 1} — options (PSCQ only)` },
        { key: 'option_0', label: `Sub Q${subIndex + 1} — option A`, role: 'option' },
        { key: 'option_1', label: `Sub Q${subIndex + 1} — option B`, role: 'option' },
        { key: 'option_2', label: `Sub Q${subIndex + 1} — option C`, role: 'option' },
        { key: 'option_3', label: `Sub Q${subIndex + 1} — option D`, role: 'option' },
        SOLUTION_STEP,
      ]
    case 'integer':
    case 'numerical':
      return NUMERIC_STEPS
    default:
      return SCQ_STEPS
  }
}

/** @returns {Record<string, string | null>} */
export function emptyPdfCropRegions() {
  return {
    stem: null,
    diagram: null,
    options_block: null,
    option_0: null,
    option_1: null,
    option_2: null,
    option_3: null,
    column_I: null,
    column_II: null,
    passage_body: null,
    passage_diagram: null,
    sub_stem: null,
    sub_options_block: null,
    solution: null,
  }
}

/** @param {Record<string, string | null>} regions @param {string} key */
export function regionHasCrop(regions, key) {
  return !!regions[key]
}

/**
 * Whether a crop step already has image data on the bundle.
 * @param {{
 *   questionType?: string
 *   fullImage?: string | null
 *   regions?: Record<string, string | null>
 *   subQuestions?: { stem?: string | null, optionsBlock?: string | null, optionImages?: (string|null)[] }[]
 *   activeSubIndex?: number
 * }} bundle
 * @param {string} stepKey
 */
export function stepHasCropOnBundle(bundle, stepKey) {
  const subIndex = bundle.activeSubIndex ?? 0
  const isPassage =
    bundle.questionType === 'passage_scq' || bundle.questionType === 'passage_integer'
  const subKeys = ['sub_stem', 'sub_options_block', 'option_0', 'option_1', 'option_2', 'option_3']
  if (isPassage && subKeys.includes(stepKey)) {
    const sq = bundle.subQuestions?.[subIndex]
    if (!sq) return false
    if (stepKey === 'sub_stem') return !!sq.stem
    if (stepKey === 'sub_options_block') return !!sq.optionsBlock
    if (stepKey.startsWith('option_')) {
      const oi = Number(stepKey.replace('option_', ''))
      return !!sq.optionImages?.[oi]
    }
  }
  if (stepKey === 'full') return !!bundle.fullImage
  return regionHasCrop(bundle.regions ?? {}, stepKey)
}

/** @param {PdfCropStepDef} step */
function isPerOptionStep(step) {
  return /^option_\d/.test(step.key)
}

/** @param {PdfCropStepDef} step */
function isOptionGroupStep(step) {
  return (
    step.role === 'option' ||
    step.key === 'options_block' ||
    step.key === 'sub_options_block' ||
    isPerOptionStep(step)
  )
}

/**
 * After a crop, advance to the next step — skip unfilled optional slots unless the user picked them.
 * SCQ/MCQ: question text → Option A → B → C → D (diagram only when that pill is selected).
 * @param {PdfCropStepDef[]} steps
 * @param {number} currentIndex
 * @param {Parameters<typeof stepHasCropOnBundle>[0]} bundle
 */
export function nextStepIndexAfterCrop(steps, currentIndex, bundle) {
  if (!steps.length || currentIndex >= steps.length - 1) return currentIndex
  const current = steps[currentIndex]
  const qType = bundle.questionType ?? 'single_correct'
  const isChoice = qType === 'single_correct' || qType === 'multiple_correct'

  for (let j = currentIndex + 1; j < steps.length; j++) {
    const s = steps[j]

    if (isChoice && current.key === 'stem') {
      if (isPerOptionStep(s)) return j
      if (s.key === 'diagram' || s.key === 'options_block') continue
    }

    if (isChoice && current.key === 'diagram') {
      if (isOptionGroupStep(s)) return j
      continue
    }

    if (isChoice && current.key === 'options_block') {
      if (isPerOptionStep(s)) return j
      continue
    }

    if (isChoice && isPerOptionStep(current)) {
      if (isPerOptionStep(s)) return j
      if (s.key === 'solution') continue
      continue
    }

    if (current.key === 'passage_body') {
      if (s.key === 'sub_stem') return j
      if (s.key === 'passage_diagram') continue
    }

    if (current.key === 'passage_diagram' && s.key === 'sub_stem') return j

    if (current.key === 'sub_stem') {
      if (isPerOptionStep(s)) return j
      if (s.key === 'sub_options_block') continue
    }

    if (current.key === 'sub_options_block' && isPerOptionStep(s)) return j

    if (qType === 'matrix_match' && current.key === 'stem' && s.key === 'column_I') return j
    if (qType === 'matrix_match' && current.key === 'column_I' && s.key === 'column_II') return j
    if (qType === 'matrix_match' && current.key === 'column_II' && s.key === 'diagram') continue

    if ((qType === 'integer' || qType === 'numerical') && current.key === 'stem' && s.key === 'diagram') {
      continue
    }

    if (s.required || stepHasCropOnBundle(bundle, s.key)) return j
  }
  return currentIndex
}

/** @param {Record<string, string | null>} regions @param {PdfCropStepDef[]} steps */
export function bundleHasRequiredCrops(regions, steps) {
  return steps.filter((s) => s.required).every((s) => regionHasCrop(regions, s.key))
}

/** @param {Record<string, string | null>} regions */
export function optionImagesFromRegions(regions) {
  return [0, 1, 2, 3].map((i) => regions[`option_${i}`] ?? null)
}

/** @param {Record<string, string | null>} regions */
export function countAssignedRegions(regions) {
  return Object.values(regions).filter(Boolean).length
}
