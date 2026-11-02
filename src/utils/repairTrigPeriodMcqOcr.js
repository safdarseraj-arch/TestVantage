/**
 * Fundamental period MCQ — f(x), g(x) trig, T₁ and T₂ (single SCQ, not passage).
 */

import { normalizeOptionMarkersInText, splitEmbeddedMcqOptionMarkers } from './mcqOptionMarkers.js'

export const TRIG_PERIOD_MCQ_OPTIONS = [
  '$T_1 = 2T_2$',
  '$2T_1 = T_2$',
  '$T_1 = T_2$',
  '$T_1 = 4T_2$',
]

const T1_PAT = String.raw`(?:T\s*_?\s*1|T\u2081|T₁)`
const T2_PAT = String.raw`(?:T\s*_?\s*2|T\u2082|T₂)`

/** @param {string} s */
export function normalizeTrigPeriodSubscripts(s) {
  return String(s ?? '')
    .replace(/T\u2081/g, 'T1')
    .replace(/T\u2082/g, 'T2')
    .replace(/T₁/g, 'T1')
    .replace(/T₂/g, 'T2')
}

/**
 * Which canonical slot (0–3) does this option text belong to?
 * @param {string} t
 * @returns {number}
 */
export function inferTrigPeriodOptionSlot(t) {
  let s = normalizeTrigPeriodSubscripts(String(t ?? '').trim())
  s = s.replace(/,+$/g, '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim()
  if (!s || /none\s+of\s+(?:the\s+)?these/i.test(s)) return -1
  if (/T\s*1?\s*=\s*4\s*T/i.test(s) || /=4\s*T/i.test(s)) return 3
  if (/^2\s*T/i.test(s) && /=\s*T/i.test(s) && !/=\s*2\s*T/i.test(s)) return 1
  if (/=\s*2\s*T/i.test(s) || /\bT\s*=\s*2\s*T/i.test(s)) return 0
  if (/^(?:OT|O\s*T)\s*=\s*T/i.test(s)) return 2
  if (/^2\s*T\s*1\s*=\s*T\s*2$/i.test(s.replace(/\s+/g, ' '))) return 1
  if (/^2T1\s*=\s*T2$/i.test(s.replace(/\s+/g, ''))) return 1
  if (/T\s*1\s*=\s*4\s*T\s*2/i.test(s)) return 3
  if (/T\s*1\s*=\s*2\s*T\s*2/i.test(s)) return 0
  if (/T\s*1\s*=\s*T\s*2/i.test(s) && !/2\s*T\s*1|2T1/i.test(s)) return 2
  if (/^T\s*=\s*T$/i.test(s) && !/^2/.test(s)) return 2
  return -1
}

/** Split garbled merged B+C — e.g. "2T =T, OT =T," from one OCR crop. */
function splitGarbledTrigPeriodMergedOptions(options) {
  const out = [...options]
  while (out.length < 4) out.push('')
  const b = String(out[1] ?? '').trim()
  if (!b || String(out[2] ?? '').trim()) return out
  const m = b.match(/^(.+?),\s*((?:OT|O\s*T|T)\s*=\s*T[^,]*)/i)
  if (m?.[1] && m?.[2]) {
    out[1] = m[1].trim()
    out[2] = m[2].trim()
    return out
  }
  if (/,\s*(?:OT|O\s*T|T)\s*=/i.test(b)) {
    const parts = b.split(/,\s*(?=(?:OT|O\s*T|T)\s*=)/i)
    if (parts.length >= 2) {
      out[1] = parts[0].trim()
      out[2] = parts.slice(1).join(', ').trim()
    }
  }
  return out
}

/** @param {string} t */
export function looksLikeTrigPeriodMcq(t) {
  const s = String(t ?? '').replace(/\r\n/g, '\n')
  if (!/\bfundamental\s+period\b/i.test(s)) return false
  if (!/\bf\s*\(\s*x\s*\)/i.test(s) || !/\bg\s*[\(\s]/i.test(s)) return false
  if (!/\bsin\b|\bcos\b/i.test(s)) return false
  const norm = normalizeTrigPeriodSubscripts(s)
  const hasT1 = /\bT\s*1\b/i.test(norm) || /T\s*[,]/.test(s) || /T₁/.test(s)
  const hasT2 = /\bT\s*2\b/i.test(norm) || /respectively\s+then/i.test(s) || /T₂/.test(s)
  return hasT1 && hasT2
}

/** @param {string} blob */
export function buildTrigPeriodStem(blob) {
  const s = String(blob ?? '')
    .replace(/\bgfl\s*\(\s*x\s*\)/gi, 'g(x)')
    .replace(/\bg\s*\(\s*x\s*\)/gi, 'g(x)')

  const sinSquared =
    /sin\s*[\u00b2²]|\bsin\s*\^\s*2\b|sin\s*\?\s*x/i.test(s) ||
    /\\sin\^2|\\sin\^\{2\}/.test(s)
  const cosFourth =
    /cos\s*[\u2074⁴]|\bcos\s*\^\s*4\b|cos\s*\*\s*x/i.test(s) || /\\cos\^4|\\cos\^\{4\}/.test(s)

  const fExpr =
    sinSquared && cosFourth
      ? '\\sin^2 x + \\cos^4 x + 2'
      : /\\sin\s*\\pi|\\sin\s+pi\s*x/i.test(s) && !sinSquared
        ? '\\sin \\pi x + \\cos \\pi x + 2'
        : '\\sin^2 x + \\cos^4 x + 2'

  return `Let $f(x) = ${fExpr}$ and $g(x) = \\cos(\\cos x) + \\cos(\\sin x)$. Also let fundamental period of $f(x)$ and $g(x)$ be $T_1$ and $T_2$ respectively then`
}

/** @param {string} blob */
function extractTrigPeriodOptions(blob) {
  const s = normalizeOptionMarkersInText(String(blob ?? ''))
  const norm = normalizeTrigPeriodSubscripts(s)
  /** @type {string[]} */
  const out = ['', '', '', '']
  const patterns = [
    [new RegExp(String.raw`\(\s*A\s*\)\s*(?:\$?)?${T1_PAT}\s*=\s*2\s*${T2_PAT}`, 'i'), '$T_1 = 2T_2$'],
    [new RegExp(String.raw`\(\s*B\s*\)\s*2\s*${T1_PAT}\s*=\s*${T2_PAT}`, 'i'), '$2T_1 = T_2$'],
    [
      new RegExp(String.raw`\(\s*C\s*\)\s*(?:\$?)?${T1_PAT}\s*=\s*${T2_PAT}(?!\s*[=0-9])`, 'i'),
      '$T_1 = T_2$',
    ],
    [new RegExp(String.raw`\(\s*D\s*\)\s*(?:\$?)?${T1_PAT}\s*=\s*4\s*${T2_PAT}`, 'i'), '$T_1 = 4T_2$'],
  ]
  for (let i = 0; i < patterns.length; i += 1) {
    const [re, val] = patterns[i]
    if (re.test(s) || re.test(norm)) out[i] = val
  }
  if (!out[3] && /T\s*1\s*=\s*4\s*T\s*2|4\s*T\s*2/i.test(norm)) {
    out[3] = '$T_1 = 4T_2$'
  }
  return out
}

/** @param {string[]} options @param {string} blob */
function canonicalizeTrigPeriodOptions(options, blob) {
  const extracted = extractTrigPeriodOptions(blob)
  const out = [...options]
  while (out.length < 4) out.push('')

  for (let i = 0; i < 4; i += 1) {
    if (extracted[i]) {
      out[i] = extracted[i]
      continue
    }
    const slot = inferTrigPeriodOptionSlot(out[i])
    if (slot === i) {
      out[i] = TRIG_PERIOD_MCQ_OPTIONS[i]
      continue
    }
    if (slot >= 0 && slot <= 3 && !String(out[slot] ?? '').trim()) {
      out[slot] = TRIG_PERIOD_MCQ_OPTIONS[slot]
      out[i] = ''
      continue
    }
    if (i === 1 && /^2$/i.test(String(out[i]).trim())) {
      out[i] = TRIG_PERIOD_MCQ_OPTIONS[1]
      continue
    }
    if (/none\s+of\s+(?:the\s+)?these/i.test(String(out[i] ?? ''))) {
      out[i] = TRIG_PERIOD_MCQ_OPTIONS[i]
      continue
    }
    if (!String(out[i] ?? '').trim()) {
      out[i] = TRIG_PERIOD_MCQ_OPTIONS[i]
    }
  }

  return out
}

/** @param {{ text?: string, options?: string[], optionsFound?: number, _ocrSource?: string }} parsed */
function trigPeriodBlob(parsed) {
  return [parsed._ocrSource, parsed.text, ...(parsed.options ?? [])].filter(Boolean).join('\n')
}

/** @param {{ text?: string, options?: string[], optionsFound?: number, _ocrSource?: string }} parsed */
export function repairTrigPeriodMcqParse(parsed) {
  const blob = trigPeriodBlob(parsed)
  if (!looksLikeTrigPeriodMcq(blob)) return parsed

  let options = splitEmbeddedMcqOptionMarkers([...(parsed.options ?? [])])
  while (options.length < 4) options.push('')

  options = splitGarbledTrigPeriodMergedOptions(options)
  options = canonicalizeTrigPeriodOptions(options, blob)
  options = splitEmbeddedMcqOptionMarkers(options)
  options = canonicalizeTrigPeriodOptions(options, blob)

  const stem = buildTrigPeriodStem(blob)
  const found = options.filter((o) => String(o ?? '').trim()).length
  return {
    ...parsed,
    text: stem,
    options,
    optionsFound: found,
    complete: found >= 4,
  }
}
