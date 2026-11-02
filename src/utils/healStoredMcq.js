/**
 * Re-run upload-time MCQ/determinant repair on stored questions (bank + exam).
 * Prevents blank B/C/D when OCR only saved option A.
 */

import { parseQuestionText } from './parseQuestionText.js'
import { applyMcqParseRepairs } from './repairRegistry.js'
import { healBinomialLog495Question } from './repairBinomialLog495StemOcr.js'
import {
  looksLikeF0MoebiusFunctionalMcq,
  f0MoebiusOptionsNeedHeal,
} from './repairF0MoebiusFunctionalMcqOcr.js'
import {
  looksLikeFxLimitFiniteMcq,
  fxLimitFiniteOptionsNeedHeal,
} from './repairFxLimitFiniteMcqOcr.js'
import { countRealMcqOptions, looksLikeRealMcqOptionLine } from './stemDiagramDetect.js'
import { mcqLaterOptionsLookTruncated } from './mcqOptionCompleteness.js'

const MCQ_TYPES = new Set(['single_correct', 'multiple_correct', 'passage_scq'])

/** @param {import('../data/tests').Question} q */
export function mcqOptionsNeedHeal(q) {
  if (!q || typeof q !== 'object') return false
  const type = q.questionType ?? 'single_correct'
  if (!MCQ_TYPES.has(type)) return false
  const text = String(q.text ?? '')
  const opts = q.options ?? []
  const real = countRealMcqOptions(text, opts)
  if (real >= 4) {
    return mcqLaterOptionsLookTruncated(opts, [text, ...opts].join('\n'))
  }
  return real > 0 || opts.some((o) => String(o ?? '').trim()) || /\\begin\{vmatrix\}/i.test(text)
}

/** @param {string} blob */
function extractMcqOptionsFromBlob(blob) {
  /** @type {string[]} */
  const opts = ['', '', '', '']
  const s = String(blob ?? '')
  for (let i = 0; i < 4; i += 1) {
    const L = String.fromCharCode(65 + i)
    const num = s.match(new RegExp(`\\(\\s*${L}\\s*\\)\\s*(\\d{1,4})`, 'i'))
    if (num?.[1]) {
      opts[i] = num[1]
      continue
    }
    const interval = s.match(
      new RegExp(`\\(\\s*${L}\\s*\\)\\s*(\\$?\\[[^\\]\\n]{1,40}\\]|\\$?\\([^\\)\\n]{1,40}\\])`, 'i'),
    )
    if (interval?.[1]) opts[i] = interval[1].trim()
    if (opts[i]) continue
    const frac = s.match(
      new RegExp(
        `\\(\\s*${L}\\s*\\)\\s*(\\$?\\\\(?:frac|dfrac)\\{[^}\\n]+\\}\\{[^}\\n]+\\}\\$?)`,
        'i',
      ),
    )
    if (frac?.[1]) opts[i] = frac[1].trim()
  }
  return opts
}

/** @param {string[]} current @param {string[]} extracted */
function mergeMcqOptions(current, extracted) {
  const out = [...current]
  while (out.length < 4) out.push('')
  for (let i = 0; i < 4; i += 1) {
    const cur = String(out[i] ?? '').trim()
    const ext = String(extracted[i] ?? '').trim()
    if (!looksLikeRealMcqOptionLine(cur) && looksLikeRealMcqOptionLine(ext)) out[i] = ext
  }
  return out
}

/** @param {import('../data/tests').Question} q */
function ocrBlobForQuestion(q) {
  return [q.text, ...(q.options ?? []), q.ocrRawText, q.extractedRaw, q.passageText]
    .filter(Boolean)
    .join('\n')
}

/**
 * Apply the same parse/repair chain used on upload to fix partial MCQ saves.
 * @param {import('../data/tests').Question} q
 */
export function healStoredMcqQuestion(q) {
  if (!q || typeof q !== 'object') return q
  const type = q.questionType ?? 'single_correct'
  if (!MCQ_TYPES.has(type)) return q

  const binomial = healBinomialLog495Question(q)
  if (binomial) return binomial

  const text = String(q.text ?? '')
  let opts = [...(q.options ?? [])]
  while (opts.length < 4) opts.push('')

  const realBefore = countRealMcqOptions(text, opts)
  const blob = ocrBlobForQuestion(q)
  const needsF0Heal =
    looksLikeF0MoebiusFunctionalMcq(blob) &&
    (f0MoebiusOptionsNeedHeal(opts) || /then\s+.*f\s*\(\s*0\s*\)/i.test(text))
  const needsFxLimitHeal =
    looksLikeFxLimitFiniteMcq(blob) &&
    (fxLimitFiniteOptionsNeedHeal(opts) || /J\s*PEA|\/im\s*\$?f|lim\s+J\s+PEA/i.test(text))
  if (realBefore >= 4 && !needsF0Heal && !needsFxLimitHeal) return q

  /** @type {{ text: string, options: string[], optionsFound: number, complete?: boolean, _ocrSource?: string }} */
  let parsed = {
    text,
    options: opts,
    optionsFound: realBefore,
    complete: realBefore >= 4,
    _ocrSource: blob,
  }

  parsed = applyMcqParseRepairs(parsed, blob, { passes: 2 })

  if (countRealMcqOptions(parsed.text, parsed.options) < 4) {
    parsed.options = mergeMcqOptions(parsed.options ?? opts, extractMcqOptionsFromBlob(blob))
    parsed = applyMcqParseRepairs(
      { ...parsed, _ocrSource: `${blob}\n${parsed.options.join('\n')}` },
      blob,
      { passes: 1 },
    )
  }

  if (countRealMcqOptions(parsed.text, parsed.options) < 4) {
    const reparsed = parseQuestionText(blob)
    if (countRealMcqOptions(reparsed.text, reparsed.options) > countRealMcqOptions(parsed.text, parsed.options)) {
      parsed = applyMcqParseRepairs(
        {
          ...parsed,
          text: reparsed.text?.trim() ? reparsed.text : parsed.text,
          options: mergeMcqOptions(parsed.options ?? opts, reparsed.options ?? []),
        },
        blob,
        { passes: 1 },
      )
    }
  }

  if (countRealMcqOptions(parsed.text, parsed.options) < 2) {
    const reparsed = parseQuestionText(blob)
    if (countRealMcqOptions(reparsed.text, reparsed.options) > countRealMcqOptions(parsed.text, parsed.options)) {
      parsed = applyMcqParseRepairs(
        {
          text: reparsed.text || parsed.text,
          options: reparsed.options ?? parsed.options,
          optionsFound: reparsed.optionsFound ?? 0,
          _ocrSource: blob,
        },
        blob,
        { passes: 1 },
      )
    }
  }

  const realAfter = countRealMcqOptions(parsed.text ?? text, parsed.options ?? opts)
  if (
    realAfter <= realBefore &&
    (parsed.text ?? text) === text &&
    JSON.stringify(parsed.options ?? opts) === JSON.stringify(opts)
  ) {
    return q
  }

  return {
    ...q,
    text: parsed.text?.trim() ? parsed.text : text,
    options: (parsed.options ?? opts).slice(0, Math.max(4, opts.length)).map((o) => String(o ?? '')),
  }
}
