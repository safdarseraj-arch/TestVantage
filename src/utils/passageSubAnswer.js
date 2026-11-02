/**
 * PIVQ sub-questions: integer (IVQ-style) or numerical / decimal (NVQ-style) per row.
 * @typedef {'integer' | 'numerical'} PassageSubAnswerMode
 */

import { sanitizeNumericalAnswerInput, validateNumericalAnswer } from './numericalAnswer.js'

/**
 * @param {{ answerMode?: string, correctInteger?: number | string | null, correctNumerical?: number | string | null }} sq
 * @returns {PassageSubAnswerMode}
 */
export function passageSubAnswerMode(sq) {
  if (sq?.answerMode === 'numerical' || sq?.answerMode === 'integer') return sq.answerMode
  if (sq?.correctNumerical != null && sq?.correctNumerical !== '') {
    if (sq?.correctInteger == null || sq?.correctInteger === '') return 'numerical'
  }
  return 'integer'
}

/** @param {import('../data/tests').Question | { answerMode?: string, correctNumerical?: number | null, correctInteger?: number | null }} q */
export function passageQuestionUsesNumerical(q) {
  return passageSubAnswerMode(q) === 'numerical'
}

/**
 * @param {{ correctInteger?: number | string | null, correctNumerical?: number | string | null, answerMode?: string }} sq
 */
export function passagePivqAnswerDisplay(sq) {
  if (passageSubAnswerMode(sq) === 'numerical') {
    const v = sq?.correctNumerical
    return v != null && v !== '' ? String(v) : ''
  }
  const ci = sq?.correctInteger
  return ci != null && ci !== '' ? String(ci) : ''
}

/**
 * Parse one PIVQ sub-question answer (integer 0–9999 or decimal up to 6 digits).
 * @param {string} raw
 * @returns {{
 *   ok: boolean,
 *   answerMode?: PassageSubAnswerMode,
 *   correctInteger?: number,
 *   correctNumerical?: number,
 *   display?: string,
 *   error?: string,
 * }}
 */
export function parsePassagePivqAnswer(raw) {
  const display = sanitizeNumericalAnswerInput(String(raw ?? ''), { allowIncomplete: true })
  if (!display || display === '-' || display === '.' || display === '-.') {
    return { ok: false, error: 'Enter an answer.' }
  }

  if (display.includes('.')) {
    if (display.endsWith('.')) {
      return { ok: false, error: 'incomplete' }
    }
    const numCheck = validateNumericalAnswer(display)
    if (!numCheck.ok || numCheck.value == null) {
      return { ok: false, error: numCheck.error ?? 'Invalid decimal answer.' }
    }
    return {
      ok: true,
      answerMode: 'numerical',
      correctNumerical: numCheck.value,
      display: numCheck.display ?? display,
    }
  }

  const digitsOnly = /^-?\d+$/.test(display)
  if (digitsOnly) {
    const n = parseInt(display, 10)
    if (Number.isNaN(n) || n < 0 || n > 9999) {
      return { ok: false, error: 'Integer answers must be from 0 to 9999.' }
    }
    return {
      ok: true,
      answerMode: 'integer',
      correctInteger: n,
      display: String(n),
    }
  }

  const numCheck = validateNumericalAnswer(display)
  if (!numCheck.ok || numCheck.value == null) {
    return { ok: false, error: numCheck.error ?? 'Invalid answer.' }
  }
  return {
    ok: true,
    answerMode: 'numerical',
    correctNumerical: numCheck.value,
    display: numCheck.display ?? display,
  }
}

/**
 * @param {{ answerMode?: string, correctInteger?: number | string | null, correctNumerical?: number | string | null }} sq
 * @param {string} raw
 */
export function applyPassagePivqAnswerInput(sq, raw) {
  const display = sanitizeNumericalAnswerInput(String(raw ?? ''), { allowIncomplete: true })
  const parsed = parsePassagePivqAnswer(raw)
  if (parsed.ok) {
    if (parsed.answerMode === 'numerical') {
      return {
        ok: true,
        answerMode: 'numerical',
        correctNumerical: parsed.correctNumerical,
        correctInteger: undefined,
        display: parsed.display,
      }
    }
    return {
      ok: true,
      answerMode: 'integer',
      correctInteger: parsed.correctInteger,
      correctNumerical: undefined,
      display: parsed.display,
    }
  }

  if (parsed.error === 'incomplete' || (display.includes('.') && display.endsWith('.'))) {
    return {
      ok: true,
      answerMode: 'numerical',
      correctNumerical: sq?.correctNumerical,
      correctInteger: undefined,
      display,
      incomplete: true,
    }
  }

  if (/^-?\d*$/.test(display)) {
    const n = display === '' || display === '-' ? undefined : parseInt(display, 10)
    return {
      ok: true,
      answerMode: 'integer',
      correctInteger: Number.isNaN(n) ? sq?.correctInteger : n,
      correctNumerical: undefined,
      display,
      incomplete: display !== '' && display !== '-',
    }
  }

  return { ok: false, error: parsed.error, display }
}
