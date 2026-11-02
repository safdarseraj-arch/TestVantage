import { stemForLivePreview } from './stemBankGuard.js'

/**
 * Truncate question text for list previews without breaking $...$ / $$...$$ math delimiters.
 * @param {string} text
 * @param {number} [maxLen]
 * @param {string[]} [options]
 */
export function truncateForMathPreview(text, maxLen = 80, options = []) {
  const s = stemForLivePreview(String(text ?? ''), options)
  if (s.length <= maxLen) return s

  let cut = maxLen
  const slice = s.slice(0, cut)

  // Extend through closing delimiter if we cut inside $...$
  const dollars = (slice.match(/(?<!\\)\$/g) || []).length
  if (dollars % 2 === 1) {
    const close = s.indexOf('$', cut)
    if (close !== -1 && close - cut < 48) cut = close + 1
    else cut = slice.lastIndexOf('$') > 0 ? slice.lastIndexOf('$') : cut
  }

  // Same for an open $$ display block
  const displayOpens = (slice.match(/\$\$/g) || []).length
  if (displayOpens % 2 === 1) {
    const close = s.indexOf('$$', cut)
    if (close !== -1 && close - cut < 80) cut = close + 2
    else {
      const last = slice.lastIndexOf('$$')
      if (last > 0) cut = last
    }
  }

  return `${s.slice(0, cut).trimEnd()}…`
}
