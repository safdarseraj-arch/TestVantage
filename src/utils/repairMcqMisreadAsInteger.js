/**
 * Generic repair: OCR SCQ misread as IVQ (integer).
 * Handles any future question — not a single golden stem.
 *
 * Signals:
 * - Stem ends with MCQ prompt ("is equal to -", "equals :-", "is -")
 * - Garbled option markers ®) ©) @) instead of (B)(C)(D)
 * - Fraction / short-math option band after the prompt
 * - Four similar numeric answers without clean (A)–(D)
 */

import { normalizeOptionMarkersInText } from './mcqOptionMarkers.js'
import { countRealMcqOptions } from './stemDiagramDetect.js'

/** MCQ answer-line prompts (student picks A–D; not fill-in integer). */
const MCQ_PROMPT_RE =
  /\b(?:is\s+equal\s+to|equals?|are\s+equal\s+to|is|are)\s*[-–—:]\s*$/i

/** Prompt + optional garbled option tail on same line / after. */
const MCQ_PROMPT_SPLIT_RE =
  /^([\s\S]*?\b(?:is\s+equal\s+to|equals?|are\s+equal\s+to)\s*[-–—:]?\s*)([\s\S]*)$/i

/**
 * True when stem wording is an SCQ prompt, not an integer blank.
 * @param {string} text
 */
export function looksLikeMcqPromptNotInteger(text) {
  const s = String(text ?? '').trim()
  if (!s) return false
  if (MCQ_PROMPT_RE.test(s)) return true
  if (/\bis\s+equal\s+to\s*[-–—:]\s*/i.test(s) && /[®©@]|\(\s*[A-D]\s*\)|5\s*\/\s*\d/.test(s)) {
    return true
  }
  // "then … is -" / "then (M-m) is equal to" with option junk after
  if (/\bthen\b[\s\S]{0,120}\bis\s*(?:equal\s+to\s*)?[-–—:]\s*$/i.test(s)) return true
  return false
}

/**
 * OCR option band that is clearly A–D even when labels are destroyed.
 * @param {string} text
 */
export function looksLikeGarbledMcqOptionBand(text) {
  const t = String(text ?? '')
  if (!t.trim()) return false
  if ((t.match(/[®©@]\s*\)/g) ?? []).length >= 2) return true
  if ((t.match(/\(\s*[A-D]\s*\)/gi) ?? []).length >= 2) return true
  // Horizontal fraction row: 5/3 5/9 5/12 5/18 or 1/2 1/3 1/4 1/6
  const fracs = t.match(/\b\d{1,3}\s*\/\s*\d{1,3}\b/g) ?? []
  if (fracs.length >= 3) return true
  // Garbled "5 5 5 5 @ 3 ®) 3 © 15" — repeated digit + OCR junk markers
  if (/[®©@]/.test(t) && (t.match(/\b5\b/g) ?? []).length >= 3) return true
  // Short numeric options in a row after a prompt
  if (
    /\bis\s+equal\s+to|\bequals?\s*[-–—:]/i.test(t) &&
    (/\b\d+\s*\/\s*\d+/.test(t) || /[®©@]\s*\)/.test(t))
  ) {
    return true
  }
  return false
}

/**
 * Whole upload looks like SCQ that OCR may have typed as IVQ.
 * @param {string} blob stem + options + raw OCR
 */
export function looksLikeMcqMisreadAsInteger(blob) {
  const t = String(blob ?? '')
  if (!t.trim()) return false
  if (looksLikeGarbledMcqOptionBand(t)) return true
  if (looksLikeMcqPromptNotInteger(t.split(/\n/)[0] ?? t)) return true
  // Stem has MCQ prompt; options empty/garbled
  const lines = t.split(/\n/).map((l) => l.trim()).filter(Boolean)
  const last = lines[lines.length - 1] ?? ''
  if (looksLikeMcqPromptNotInteger(last)) return true
  // Trailing "is equal to -" / "is equal to :" is SCQ; bare "is equal to" is IVQ.
  if (/\bis\s+equal\s+to\s*[-–—:]\s*$/im.test(t) && !/\binteger\s+(?:type|value)\b/i.test(t)) {
    return true
  }
  return false
}

/**
 * Map common OCR misreads of (A)–(D) to real markers.
 * @param {string} text
 */
export function normalizeGarbledMcqOptionMarkers(text) {
  let out = String(text ?? '')
  if (!out.trim()) return out

  // ®) ©) @) often = (B) (C) (A/D) depending on scan; prefer B/C/D after first slot
  out = out.replace(/@\s*\)/g, '(A)')
  out = out.replace(/®\s*\)/g, '(B)')
  out = out.replace(/©\s*\)/g, '(C)')
  // Lone © / ® before a number (no closing paren)
  out = out.replace(/(^|[\s])@(?=\s*\d)/gm, '$1(A) ')
  out = out.replace(/(^|[\s])®(?=\s*\d)/gm, '$1(B) ')
  out = out.replace(/(^|[\s])©(?=\s*\d)/gm, '$1(C) ')

  out = normalizeOptionMarkersInText(out)
  return out
}

/**
 * Pull up to 4 simple fraction / short options from a garbled tail.
 * @param {string} tail
 * @returns {string[]}
 */
export function extractSimpleMcqOptionsFromTail(tail) {
  const t = String(tail ?? '').trim()
  if (!t) return []

  /** @type {string[]} */
  const found = []

  // Prefer explicit fractions
  const fracRe = /\b(\d{1,4})\s*\/\s*(\d{1,4})\b/g
  let m
  while ((m = fracRe.exec(t)) !== null && found.length < 4) {
    const opt = `$\\dfrac{${m[1]}}{${m[2]}}$`
    if (!found.includes(opt)) found.push(opt)
  }
  if (found.length >= 2) return found.slice(0, 4)

  // LaTeX fractions already present
  const latexFrac = t.matchAll(/\\(?:d)?frac\{(\d{1,4})\}\{(\d{1,4})\}/g)
  for (const hit of latexFrac) {
    if (found.length >= 4) break
    const opt = `$\\dfrac{${hit[1]}}{${hit[2]}}$`
    if (!found.includes(opt)) found.push(opt)
  }
  if (found.length >= 2) return found.slice(0, 4)

  // Short integers / decimals as options (last resort)
  const nums = t.match(/\b\d+(?:\.\d+)?\b/g) ?? []
  for (const n of nums) {
    if (found.length >= 4) break
    // Skip lone "5" repeated noise unless we have few options
    if (nums.filter((x) => x === n).length >= 3 && found.length === 0) continue
    const opt = `$${n}$`
    if (!found.includes(opt)) found.push(opt)
  }
  return found.slice(0, 4)
}

/**
 * Split stem from option garbage after an MCQ prompt.
 * @param {string} text
 * @returns {{ stem: string, options: string[], changed: boolean }}
 */
export function splitStemFromGarbledMcqTail(text) {
  const raw = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!raw) return { stem: raw, options: [], changed: false }

  const normalized = normalizeGarbledMcqOptionMarkers(raw)
  const split = normalized.match(MCQ_PROMPT_SPLIT_RE)
  if (!split) {
    // Try last-line option band
    const lines = normalized.split('\n')
    if (lines.length >= 2 && looksLikeGarbledMcqOptionBand(lines[lines.length - 1])) {
      const tail = lines.pop() ?? ''
      const opts = extractSimpleMcqOptionsFromTail(tail)
      let stem = lines.join('\n').trim()
      if (!/[-–—:]\s*$/.test(stem) && /\bis\s+equal\s+to|\bequals?\b/i.test(stem)) {
        stem = stem.replace(/\bequals?\s*:?\s*$/i, 'equals :-').replace(/\bis\s+equal\s+to\s*$/i, 'is equal to -')
      }
      return { stem, options: opts, changed: opts.length >= 2 || tail !== lines[lines.length - 1] }
    }
    return { stem: normalized, options: [], changed: normalized !== raw }
  }

  let stem = String(split[1] ?? '').trim()
  const tail = String(split[2] ?? '').trim()
  // Normalize prompt ending
  stem = stem
    .replace(/\bis\s+equal\s+to\s*:?\s*$/i, 'is equal to -')
    .replace(/\bequals?\s*:?\s*$/i, 'equals :-')

  const fromMarkers = []
  // If (A)…(D) now present after normalize, leave for normal parser — only strip tail
  if (/\(\s*[A-D]\s*\)/i.test(tail)) {
    const parts = tail.split(/(?=\(\s*[A-D]\s*\))/i).map((p) => p.trim()).filter(Boolean)
    for (const p of parts) {
      const body = p.replace(/^\(\s*[A-D]\s*\)\s*/i, '').trim()
      if (body) fromMarkers.push(body.startsWith('$') ? body : `$${body.replace(/^\$|\$$/g, '')}$`.replace(/^\$\$/, '$').replace(/\$\$$/, '$'))
    }
  }

  const opts =
    fromMarkers.length >= 2 ? fromMarkers.slice(0, 4) : extractSimpleMcqOptionsFromTail(tail)

  const changed = opts.length >= 2 || (tail.length > 0 && looksLikeGarbledMcqOptionBand(tail))
  return {
    stem: changed && opts.length >= 2 ? stem : normalized,
    options: opts,
    changed: changed || normalized !== raw,
  }
}

/**
 * @param {{ text?: string, options?: string[], optionsFound?: number, suggestedQuestionType?: string, complete?: boolean }} parsed
 */
export function repairMcqMisreadAsIntegerParse(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed

  const optsIn = [...(parsed.options ?? ['', '', '', ''])]
  while (optsIn.length < 4) optsIn.push('')
  const blob = `${parsed.text ?? ''}\n${optsIn.join('\n')}`
  const filled = optsIn.filter((o) => String(o ?? '').trim()).length
  const real = countRealMcqOptions(parsed.text ?? '', optsIn)

  // Already a healthy SCQ — only force type if prompt says MCQ
  if (real >= 4) {
    if (looksLikeMcqPromptNotInteger(String(parsed.text ?? '').trim())) {
      parsed.suggestedQuestionType = 'single_correct'
    }
    return parsed
  }

  if (!looksLikeMcqMisreadAsInteger(blob) && filled >= 2 && real >= 2) {
    return parsed
  }
  if (!looksLikeMcqMisreadAsInteger(blob) && real >= 2) return parsed
  if (!looksLikeMcqMisreadAsInteger(blob) && !looksLikeMcqPromptNotInteger(String(parsed.text ?? ''))) {
    return parsed
  }

  const { stem, options: recovered, changed } = splitStemFromGarbledMcqTail(parsed.text ?? '')
  if (stem?.trim()) parsed.text = stem.trim()

  if (recovered.length >= 2) {
    for (let i = 0; i < 4; i++) {
      if (!String(optsIn[i] ?? '').trim() && recovered[i]) optsIn[i] = recovered[i]
      else if (recovered[i] && real < 2) optsIn[i] = recovered[i]
    }
    parsed.options = optsIn
    parsed.optionsFound = optsIn.filter((o) => String(o ?? '').trim()).length
    parsed.complete = parsed.optionsFound >= 4
  }

  // Always mark as SCQ when this repair fires — prevents IVQ UI
  parsed.suggestedQuestionType = 'single_correct'
  if (changed || recovered.length >= 2 || looksLikeMcqPromptNotInteger(parsed.text ?? '')) {
    parsed.suggestedQuestionType = 'single_correct'
  }
  return parsed
}
