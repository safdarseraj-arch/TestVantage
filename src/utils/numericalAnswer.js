/** Max count of digit characters 0–9 (sign and decimal point are extra). */
export const MAX_NUMERICAL_DIGITS = 6

/**
 * Sanitize typed/pasted numerical answer: optional `-`, one `.`, up to 6 digits.
 * Accepts `,` as decimal separator (normalized to `.`).
 * @param {string} raw
 * @param {{ allowIncomplete?: boolean }} [opts]
 */
export function sanitizeNumericalAnswerInput(raw, { allowIncomplete = true } = {}) {
  const s = String(raw ?? '')
    .trim()
    .replace(/,/g, '.')
  let out = ''
  let digits = 0
  let hasDot = false

  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '-' && out === '') {
      out = '-'
      continue
    }
    if (c === '.' && !hasDot) {
      hasDot = true
      out += '.'
      continue
    }
    if (c >= '0' && c <= '9') {
      if (digits >= MAX_NUMERICAL_DIGITS) continue
      digits++
      out += c
    }
  }

  if (!allowIncomplete) {
    if (out === '-' || out === '.' || out === '-.') return ''
    if (out.endsWith('.')) out = out.slice(0, -1)
  }

  return out
}

/** @param {string} s */
export function countNumericalDigits(s) {
  return (String(s ?? '').match(/\d/g) || []).length
}

/**
 * @param {string} raw
 * @returns {number | null}
 */
export function parseNumericalAnswer(raw) {
  const s = sanitizeNumericalAnswerInput(raw, { allowIncomplete: false })
  if (!s) return null
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

/**
 * @param {string} raw
 * @returns {{ ok: boolean, value?: number, error?: string }}
 */
export function validateNumericalAnswer(raw) {
  const display = sanitizeNumericalAnswerInput(raw, { allowIncomplete: true })
  if (!display || display === '-' || display === '.' || display === '-.') {
    return { ok: false, error: 'Enter a numerical answer.' }
  }
  const digits = countNumericalDigits(display)
  if (digits < 1) {
    return { ok: false, error: 'Enter at least one digit.' }
  }
  if (digits > MAX_NUMERICAL_DIGITS) {
    return { ok: false, error: `Use at most ${MAX_NUMERICAL_DIGITS} digits (e.g. 45.23, -2.345).` }
  }
  const value = parseNumericalAnswer(display)
  if (value == null) {
    return { ok: false, error: 'Invalid numerical format.' }
  }
  return { ok: true, value, display }
}
