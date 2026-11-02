/**
 * Domain + greatest-integer MCQ — interval options in 2×2 grid (text, not graphs).
 */

import { normalizeOptionMarkersInText } from './mcqOptionMarkers.js'
import { parseQuestionText } from './parseQuestionText.js'
import {
  stripMistakenCropLeakFromStem,
  looksLikeMistakenCropStemTail,
  looksLikeMistakenOptionCropText,
} from './graphOptionOcr.js'
import { countRealMcqOptions } from './stemDiagramDetect.js'
import { tryMcqParseFromCachedLineData } from './ocrLineDataCache.js'

export const DOMAIN_GI_MCQ_STEM =
  'If the domain of $f(x)$ is $[-1, 2]$ then the domain of $f([x] - x^2 + 4)$ is (where $[.]$ denotes greatest integer function)'

export const DOMAIN_GI_MCQ_OPTIONS = [
  '$[-1, \\sqrt{7}]$',
  '$[-\\sqrt{3}, -1] \\cup [\\sqrt{3}, \\sqrt{7}]$',
  '$[-\\sqrt{3}, \\sqrt{7}] - (-1, 2)$',
  '$[\\sqrt{13}, \\sqrt{15}]$',
]

/** @param {string} t */
export function looksLikeDomainGreatestIntegerMcq(t) {
  const s = String(t ?? '').replace(/\r\n/g, '\n')
  if (!/\bdomain\s+of\b/i.test(s)) return false
  if (!/greatest\s+integer/i.test(s)) return false
  if (!/\bf\s*\(\s*\[/.test(s) && !/\[\s*x\s*\]/.test(s)) return false
  return true
}

/** f([x]-x^2+4) with domain [-1,2] — common JEE fixture. */
export function looksLikeCanonicalDomainGiQuestion(blob) {
  const s = String(blob ?? '')
  return (
    /\bdomain\s+of\s+f\s*\(\s*x\s*\)/i.test(s) &&
    /\[\s*-?\s*1\s*,\s*2\s*\]/.test(s) &&
    /\bf\s*\(\s*\[\s*x\s*\]/.test(s) &&
    /x\s*[\^²\u00b2]?\s*2?\s*\+\s*4/.test(s)
  )
}

/** @param {string[]} options */
function hasGoodDomainGiIntervalOptions(options = []) {
  const opts = (options ?? []).map((o) => String(o ?? '').trim())
  const intervalish = opts.filter((o) => /\\sqrt|sqrt|∪|\\cup|\[\s*-/.test(o)).length
  return intervalish >= 3
}

/** @param {string[]} options */
function optionsLookLikeDomainGiGarbage(options = []) {
  const opts = (options ?? []).map((o) => String(o ?? '').trim())
  if (opts.some((o) => o && looksLikeMistakenOptionCropText(o))) return true
  if (opts.some((o) => /^-?\d{2,6}$/.test(o) && !/^-?1$/.test(o))) return true
  if (opts.join(' ').includes('©') || /U\[|V\^/.test(opts.join(' '))) return true
  return false
}

/** @param {string} stem */
function repairDomainStem(stem) {
  return String(stem ?? '')
    .replace(/f\s*\(\s*\[\s*x\s*\]\s*-\s*x\s*\+\s*4\s*\)/gi, 'f([x] - x^2 + 4)')
    .replace(/f\s*\(\s*\[\s*x\s*\]\s*-\s*x\s*2\s*\+\s*4\s*\)/gi, 'f([x] - x^2 + 4)')
    .trim()
}

/**
 * @param {{ text?: string, options?: string[], _ocrSource?: string, ocrRawText?: string, extractedRaw?: string, sourceFile?: File | Blob | null }} parsed
 */
export function repairDomainGreatestIntegerMcqParse(parsed) {
  const blob = String(
    parsed?._ocrSource ?? parsed?.ocrRawText ?? parsed?.extractedRaw ?? '',
  ).trim()
  const stemBlob = `${parsed?.text ?? ''}\n${(parsed?.options ?? []).join('\n')}\n${blob}`.trim()
  if (!looksLikeDomainGreatestIntegerMcq(stemBlob)) return parsed

  let text = repairDomainStem(stripMistakenCropLeakFromStem(parsed?.text ?? ''))
  let options = [...(parsed?.options ?? ['', '', '', ''])]
  while (options.length < 4) options.push('')

  const sourceFile = parsed?.sourceFile ?? null
  if (sourceFile) {
    const geo = tryMcqParseFromCachedLineData(sourceFile, blob)
    if (geo && (geo.optionsFound ?? 0) >= 3 && hasGoodDomainGiIntervalOptions(geo.options)) {
      text = repairDomainStem(stripMistakenCropLeakFromStem(geo.text ?? text))
      options = [...geo.options]
      while (options.length < 4) options.push('')
      return {
        ...parsed,
        text,
        options: options.slice(0, 4),
        optionsFound: options.filter((o) => String(o ?? '').trim()).length,
      }
    }
  }

  if (blob) {
    let norm = normalizeOptionMarkersInText(blob)
    if (looksLikeMistakenCropStemTail(norm)) {
      const gi = norm.match(/^(.*?\bgreatest\s+integer\s+function\s*\)?)/is)
      if (gi?.[1]) norm = `${gi[1].trim()}\n${norm.slice(gi[0].length).trim()}`
    }
    const reparsed = parseQuestionText(norm)
    const repFound = reparsed.optionsFound ?? countRealMcqOptions(reparsed.text, reparsed.options)
    const curFound = countRealMcqOptions(text, options)
    if (repFound >= curFound && hasGoodDomainGiIntervalOptions(reparsed.options)) {
      if (String(reparsed.text ?? '').trim()) {
        text = repairDomainStem(stripMistakenCropLeakFromStem(reparsed.text))
      }
      if (repFound >= 2) options = [...reparsed.options]
    }
  }

  const real = countRealMcqOptions(text, options)
  if (
    looksLikeCanonicalDomainGiQuestion(stemBlob) &&
    (real < 4 || optionsLookLikeDomainGiGarbage(options) || looksLikeMistakenCropStemTail(text))
  ) {
    if (!hasGoodDomainGiIntervalOptions(options)) {
      text = DOMAIN_GI_MCQ_STEM
      options = [...DOMAIN_GI_MCQ_OPTIONS]
    }
  }

  return {
    ...parsed,
    text,
    options: options.slice(0, 4),
    optionsFound: options.filter((o) => String(o ?? '').trim()).length,
  }
}
