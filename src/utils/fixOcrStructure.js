import { fixBrokenMcqLatex } from './fixBrokenMcqLatex.js'
import { fixOcrSeriesAndLimits } from './fixOcrSeriesAndLimits.js'
import { normalizeOptionMarkersInText } from './mcqOptionMarkers.js'
import { stripOcrStemTailJunk } from './passage.js'
import { collapseSpacedOcrLetters, stripUploadUiOcr } from './stripUploadUiOcr.js'
import { stripImageWatermarkOcr } from './stripImageWatermarkOcr.js'

/**
 * Fix structural OCR errors (MCQ labels, equations, set notation, summation).
 * Run early in the OCR polish pipeline.
 * @param {string} text
 * @returns {string}
 */
const PAGE_MARKER = '\n\n--- page ---\n\n'
const PAGE_TOKEN = '\n\x00PAGE\x00\n'

/** @param {string} text */
function shieldPageMarkers(text) {
  return text.replace(/\n-{3}\s*page\s*-{3}\n/gi, PAGE_TOKEN)
}

/** @param {string} text */
function restorePageMarkers(text) {
  return text.replace(/\n\x00PAGE\x00\n/g, PAGE_MARKER)
}

export function fixOcrStructure(text) {
  if (!text?.trim()) return text

  let out = text.replace(/\r\n/g, '\n')
  out = stripUploadUiOcr(out)
  out = stripImageWatermarkOcr(out)
  out = collapseSpacedOcrLetters(out)
  out = fixBrokenMcqLatex(out)
  out = shieldPageMarkers(out)

  // Drop per-page OCR duplicate (text layer kept; supplement block removed)
  out = out.replace(/\n<!-- OCR supplement -->[\s\S]*?(?=\n\x00PAGE\x00|$)/gi, '')

  // OCR: r r r^2. Given → 2. Given (stray vector markers before question numbers)
  out = out.replace(/(?:\br\s+)+\^?\s*(\d{1,2})\.\s*/g, '$1. ')
  out = out.replace(/^r+\^?\s*(\d{1,2})\.\s*/gm, '$1. ')

  // Orphan bare "r" lines from broken vector arrows
  out = out.replace(/^\s*r\s*$/gm, '')

  out = normalizeOptionMarkersInText(out)

  // (©) (®) etc. misread as option C
  out = out.replace(/\(\s*©\s*\)/g, '(C)')
  out = out.replace(/\(\s*®\s*\)/g, '(C)')
  out = out.replace(/\(\s*℗\s*\)/g, '(C)')
  out = out.replace(/\(\s*@\s*\)/g, '(C)')
  out = out.replace(/\(©\)/g, '(C)')
  out = out.replace(/\(C\)\s*\(/g, '(C) (')

  // Normalize option spacing: (A)360 → (A) 360
  out = out.replace(/\(([A-D])\)\s*(\d)/g, '($1) $2')

  // Semicolon after single-letter variables (a; → a)
  out = out.replace(/\b([a-zA-Z])\s*;\s*/g, '$1 ')

  // Comma before equals: a,=0 → a = 0
  out = out.replace(/,\s*=/g, ' =')
  out = out.replace(/;\s*=/g, ' =')

  // Collapse repeated dashes (not em-dash question endings)
  out = out.replace(/(\d)\s*--+\s*(\d)/g, '$1 - $2')
  out = out.replace(/([a-z])\s*--+\s*([a-z])/gi, '$1 - $2')
  out = out.replace(/=\s*--+/g, '= -')
  out = out.replace(/[—–]/g, '-')
  out = out.replace(/--+/g, '-')

  // x* as x² in quadratics: x*-3x--a,=0 → x^2 - 3x - a = 0
  out = out.replace(
    /([a-z])\s*\*\s*-?(\d*)\s*([a-z])\s*-+\s*([a-z])\s*,?\s*=\s*0/gi,
    '$1^2 - $2$3 - $4 = 0',
  )
  out = out.replace(/\b([a-z])\s*\*\s*-(\d+)/gi, '$1^2 -$2')
  out = out.replace(/\b([a-z])\s*\*(?=\s*[-+0-9])/gi, '$1^2')

  // € or e followed by N/Z/R/Q → ∈
  out = out.replace(/€\s*N\b/gi, '\\in N')
  out = out.replace(/€\s*Z\b/gi, '\\in Z')
  out = out.replace(/€\s*R\b/gi, '\\in R')
  out = out.replace(/€\s*Q\b/gi, '\\in Q')
  out = out.replace(/€\s*([A-Z])\b/g, '\\in $1')
  out = out.replace(/\be\s+N\b/gi, '\\in N')
  out = out.replace(/\bE\s+N\b/g, '\\in N')

  // Summation misreads: Ya, Y a (no $ here — wrapped later)
  out = out.replace(/\bvalue\s+of\s+Y\s*a\b/gi, 'value of \\sum a')
  out = out.replace(/\bvalue\s+of\s+Ya\b/gi, 'value of \\sum a')
  out = out.replace(/\bvalue\s+of\s+Y\s*α\b/gi, 'value of \\sum a')
  out = out.replace(/\bY\s*a\s+is\s+equal\b/gi, '\\sum a is equal')
  out = out.replace(/\bSigma\s*a\b/gi, '\\sum a')
  out = out.replace(/\bsum\s+of\s+a\b/gi, '\\sum a')

  out = out.replace(/\bwhere([a-z])/gi, 'where $1')

  // Less-than with stray chars: a; <300 → a < 300
  out = out.replace(/\b([a-z])\s*<\s*(\d+)/gi, '$1 < $2')

  // Question number spacing: 8.Let → 8. Let
  out = out.replace(/^(\d{1,3})\.([A-Za-z])/gm, '$1. $2')

  // OCR: "If" glued to vector name: Ifa= / $Ifa= → If a =
  out = out.replace(/\$?If\s*([a-z])\s*=/gi, 'If $1 =')

  // Orphan fraction digits from misread 1/2 on the line above MCQ options
  out = out.replace(/^\s*\d\s+\d\s*$/gm, '')

  out = fixOcrSeriesAndLimits(out)

  out = out.replace(/\$\s*#+\s*\d+\s*$/gm, '')
  out = out.replace(/\bfind\^0\b/gi, 'find')
  out = out.replace(/\bfind\s+Hy\b/gi, 'find')
  out = stripOcrStemTailJunk(out)

  return restorePageMarkers(out)
}
