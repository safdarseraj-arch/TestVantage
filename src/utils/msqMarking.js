/**
 * MSQ (one or more correct) marking:
 * - Negative if ANY wrong option is selected
 * - Partial marks for 1 / 2 / 3 correctly selected options (no wrong picks)
 * - Full marks only when ALL correct options selected and nothing extra
 *
 * @typedef {Object} MsqMarkingScheme
 * @property {number} full - all correct options marked, no wrong
 * @property {number} partial1 - exactly 1 correct option marked (no wrong)
 * @property {number} partial2 - exactly 2 correct options marked (no wrong)
 * @property {number} partial3 - exactly 3 correct options marked (no wrong)
 * @property {number} wrongAny - any incorrect option marked
 * @property {number} unattempted
 */

export const DEFAULT_MSQ_MARKING = {
  full: 4,
  partial1: 1,
  partial2: 2,
  partial3: 3,
  wrongAny: -2,
  unattempted: 0,
}

/** JEE Advanced style */
export const JEE_ADV_MSQ_MARKING = {
  full: 4,
  partial1: 1,
  partial2: 2,
  partial3: 3,
  wrongAny: -2,
  unattempted: 0,
}

/**
 * @param {number[]} selected - indices user selected
 * @param {number[]} correctIndices - all correct option indices
 * @param {MsqMarkingScheme} scheme
 * @returns {{ grade: 'correct' | 'partial' | 'wrong' | 'unattempted', marks: number, detail: string }}
 */
export function scoreMsqAnswer(selected, correctIndices, scheme = DEFAULT_MSQ_MARKING) {
  const sel = [...new Set(selected)].sort((a, b) => a - b)
  const correct = [...new Set(correctIndices)].sort((a, b) => a - b)
  const correctSet = new Set(correct)

  if (sel.length === 0) {
    return { grade: 'unattempted', marks: scheme.unattempted, detail: 'Not attempted' }
  }

  const hasWrong = sel.some((i) => !correctSet.has(i))
  if (hasWrong) {
    return {
      grade: 'wrong',
      marks: scheme.wrongAny,
      detail: 'Wrong option selected (−ve marking)',
    }
  }

  const correctSelected = sel.filter((i) => correctSet.has(i)).length

  if (correctSelected === correct.length && sel.length === correct.length) {
    return { grade: 'correct', marks: scheme.full, detail: 'All correct options marked' }
  }

  if (correctSelected === 1 && scheme.partial1 != null) {
    return { grade: 'partial', marks: scheme.partial1, detail: '1 correct option marked (partial)' }
  }
  if (correctSelected === 2 && scheme.partial2 != null) {
    return { grade: 'partial', marks: scheme.partial2, detail: '2 correct options marked (partial)' }
  }
  if (correctSelected === 3 && scheme.partial3 != null) {
    return { grade: 'partial', marks: scheme.partial3, detail: '3 correct options marked (partial)' }
  }

  return {
    grade: 'wrong',
    marks: scheme.wrongAny,
    detail: 'Incomplete or invalid combination',
  }
}

/** @param {MsqMarkingScheme} s */
export function formatMsqMarkingLabel(s) {
  return `Full +${s.full} · Partial +${s.partial1}/+${s.partial2}/+${s.partial3} · Any wrong ${s.wrongAny} · Skip ${s.unattempted}`
}
