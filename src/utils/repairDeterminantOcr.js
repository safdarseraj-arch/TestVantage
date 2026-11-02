/**
 * Unified determinant / vmatrix OCR repair for integer & matrix-algebra uploads.
 * Delegates to known golden-stem repairs, then applies generic vmatrix fixes.
 */
import { canonicalizeBeginMatrixEnv, repairMatrixRowBreaks } from './repairMatrixStem.js'
import {
  looksLikeSemiperimeterDeterminantInteger,
  repairSemiperimeterDeterminantOcr,
  repairSemiperimeterDeterminantParse,
} from './repairSemiperimeterDeterminantOcr.js'
import {
  looksLikeVandermondePlanesInteger,
  repairVandermondePlanesIntegerOcr,
  repairVandermondePlanesIntegerParse,
} from './repairVandermondePlanesIntegerOcr.js'
import {
  looksLikeAlphaBetaRootsDeterminantMcq,
  repairAlphaBetaRootsDeterminantMcqOcr,
  repairAlphaBetaRootsDeterminantMcqParse,
} from './repairAlphaBetaRootsDeterminantMcqOcr.js'
import {
  looksLikeTrigRangeDeterminantMcq,
  repairTrigRangeDeterminantMcqOcr,
  repairTrigRangeDeterminantMcqParse,
} from './repairTrigRangeDeterminantMcqOcr.js'
import {
  looksLikePolynomialCoeffVmatrix,
  repairPolynomialCoeffVmatrixOcr,
  repairPolynomialCoeffVmatrixParse,
} from './repairPolynomialCoeffVmatrixOcr.js'
import {
  looksLikeZ5ImaginaryRootsExpDeterminantMcq,
  repairZ5ImaginaryRootsExpDeterminantMcqOcr,
  repairZ5ImaginaryRootsExpDeterminantMcqParse,
} from './repairZ5ImaginaryRootsExpDeterminantMcqOcr.js'
import {
  hasIntervalMcqOptions,
  hasNumericMcqOptions,
  looksLikeDeterminantStem,
  repairPipeFxDeterminantOcr,
  repairDeterminantMcqParse,
} from './repairDeterminantMcqOcr.js'
import {
  looksLikeFlatDeterminant,
  repairExistingVmatrixBlocks,
  repairFlatVmatrixOcr,
  repairFlatVmatrixParse,
} from './repairFlatVmatrixOcr.js'
import { looksLikePqrsPerpVectorMcq } from './repairPqrsPerpVectorMcqOcr.js'
import {
  looksLikeSmashedProseVmatrix,
  repairSmashedProseVmatrixOcr,
} from './repairSmashedProseVmatrixOcr.js'

/** @param {string} t */
export function vmatrixBlock(t) {
  return (String(t ?? '').match(/\\begin\{vmatrix\}[\s\S]*?\\end\{vmatrix\}/i) ?? [''])[0]
}

/** @param {string} t */
export function vmatrixLooksBroken(t) {
  const block = vmatrixBlock(t)
  if (!block) return false
  if (looksLikeSmashedProseVmatrix(t)) return true
  if (!/\\\\/.test(block)) return true
  return block.split('\\\\').filter((r) => r.trim()).length < 2
}

/** @param {string} t */
export function looksLikeDeterminantQuestion(t) {
  const s = String(t ?? '')
  if (!s.trim()) return false
  // Vector MSQ misread as matrix — never treat as determinant.
  if (looksLikePqrsPerpVectorMcq(s)) return false
  if (looksLikeSemiperimeterDeterminantInteger(s)) return true
  if (looksLikeVandermondePlanesInteger(s)) return true
  if (looksLikeAlphaBetaRootsDeterminantMcq(s)) return true
  if (looksLikeZ5ImaginaryRootsExpDeterminantMcq(s)) return true
  if (looksLikeTrigRangeDeterminantMcq(s)) return true
  if (looksLikePolynomialCoeffVmatrix(s)) return true
  if (looksLikeFlatDeterminant(s)) return true
  if (looksLikeDeterminantStem(s)) return true
  return (
    /\\begin\{vmatrix\}/i.test(s) ||
    /\bdeterminant\b|\bdet\s*\(|\\operatorname\s*\{\s*det\s*\}/i.test(s) ||
    /\badjoint\b|\bcofactor\b/i.test(s) ||
    /f\s*\(\s*x\s*\)\s*=\s*\|/i.test(s) ||
    /\[l\s*q\s*q|\[?\s*1\s+[pq]\s+[pq]\s*[\^²2°]/i.test(s) ||
    /a'\s*\(\s*s-[abc]\)|\(s-[abc]\)\s*[\^'²?]/i.test(s) ||
    (/\|\s*[^|]{4,}/.test(s) && /cos|sec|cosec|cot|vmatrix|determinant/i.test(s)) ||
    (/\bsatisfying\b/i.test(s) && /=\s*6\b/.test(s) && /p\s*[\^²2]|plane|semiperimeter/i.test(s))
  )
}

/** Integer-style determinant stem — skip false MCQ option split. */
export function looksLikeDeterminantIntegerStem(t) {
  const s = String(t ?? '')
  if (!looksLikeDeterminantQuestion(s)) return false
  if (hasNumericMcqOptions(s)) return false
  if (hasIntervalMcqOptions(s)) return false
  if (looksLikeTrigRangeDeterminantMcq(s)) return false
  if (looksLikePolynomialCoeffVmatrix(s)) return false
  if (looksLikeAlphaBetaRootsDeterminantMcq(s)) return false
  if (looksLikeZ5ImaginaryRootsExpDeterminantMcq(s)) return false
  if (/\(\s*[A-D]\s*\)\s*[^\s()]{4,}/i.test(s) && !/\(\s*s\s*-\s*b\s*\)/i.test(s)) {
    const realOpts = s.match(/\(\s*[A-D]\s*\)\s*[^\n()]{4,}/gi) ?? []
    if (realOpts.length >= 2) return false
  }
  return (
    /\bis\s+equal\s+to\s*$/i.test(s) ||
    /\bthen\s+(?:value\s+of\s+)?\(\s*\d+[a-z]\s*\)\s+is\b/i.test(s) ||
    /\(\s*[a-z]\s*-\s*[a-z]\s*\)\s+is\b/i.test(s) ||
    /semiperimeter|\(210d\)|210\s*d/i.test(s) ||
    /absolute\s+value\s+of\b/i.test(s) ||
    /distance between these planes/i.test(s) ||
    (!hasNumericMcqOptions(s) &&
      !hasIntervalMcqOptions(s) &&
      !/\(\s*[A-D]\s*\)\s*\d/i.test(s) &&
      /vmatrix|determinant|\[l\s*q|f\s*\(\s*x\s*\)\s*=\s*\|/i.test(s) &&
      !/range\s+of\s+f/i.test(s))
  )
}

/** @param {string} t */
function falseDeterminantOptionSplit(options = []) {
  return (options ?? []).some((o) =>
    /^\|\s*\(\s*s-|^\*?\|=\s*bp|^is$|semiperimeter|\(p\s*-\s*q\)/i.test(String(o ?? '').trim()),
  )
}

/** Wrap bare vmatrix blocks in display math when missing $$ delimiters. */
export function ensureVmatrixStemDelimiters(text) {
  let out = String(text ?? '')
  if (!/\\begin\{vmatrix\}/i.test(out)) return out
  if (/\$\$[\s\S]*\\begin\{vmatrix\}/i.test(out)) return out
  out = out.replace(
    /(?<!\$)\$?\s*\\begin\{vmatrix\}([\s\S]*?)\\end\{vmatrix\}\s*(=[\s\S]*?)?\$?(?!\$)/gi,
    (_, body, tail = '') => {
      const inner = repairMatrixRowBreaks(body, 3)
      let rhs = String(tail ?? '').trim()
      if (rhs && /then\s+value\s+of\s+[a-d]\s+is/i.test(rhs) && rhs.length > 120) {
        rhs = rhs.replace(/\s*\(\s*[A-D]\s*\)[\s\S]*$/i, '').trim()
      }
      return `$$\\begin{vmatrix}${inner}\\end{vmatrix}${rhs ? ` ${rhs}` : ''}$$`
    },
  )
  return out.replace(/\$\$\$+/g, '$$')
}

/** Generic vmatrix / pipe-determinant OCR cleanup (no golden stem). */
export function repairGenericDeterminantOcr(text) {
  let t = canonicalizeBeginMatrixEnv(String(text ?? '').replace(/\r\n/g, '\n').trim())
  if (!t || !looksLikeDeterminantQuestion(t)) return t

  t = t.replace(/\bAABC\b/g, '$\\Delta ABC$')
  t = t.replace(/\\ Delta\b/g, '\\Delta')
  t = t.replace(/24x\s*(?:%2|\\%2)/gi, '24x^2')
  t = t.replace(/e Nand/gi, '$\\in \\mathbb{N}$ and')
  t = t.replace(
    /\\begin\{vmatrix\}([\s\S]*?)\\end\{vmatrix\}/gi,
    (_, body) => `\\begin{vmatrix}${repairMatrixRowBreaks(body, 3)}\\end{vmatrix}`,
  )

  if (vmatrixLooksBroken(t) || !/\\begin\{vmatrix\}/i.test(t)) {
    t = t.replace(
      /\[l\s*q\s*q[^\]|]*\|\s*=\s*(\d+)\s*\(?/gi,
      '$$\\begin{vmatrix} 1 & p & p^2 \\\\ 1 & q & q^2 \\\\ 1 & r & r^2 \\end{vmatrix} = $1$$',
    )
    t = t.replace(
      /a'\s*\(\s*s-a\s*\)'\s*\(\s*s-a\s*\)'\s*\|\s*\(\s*s-b\s*\)\?\s*b\?\s*\(\s*s=b\s*\)\*\|\s*=\s*bp/i,
      '$$\\begin{vmatrix} a^2 & (s-a)^2 & (s-a)^2 \\\\ (s-b)^2 & b^2 & (s-b)^2 \\\\ (s-c)^2 & (s-c)^2 & c^2 \\end{vmatrix} = \\frac{p^2}{q}$$',
    )
  }

  t = repairPipeFxDeterminantOcr(t)
  t = repairFlatVmatrixOcr(t)
  return ensureVmatrixStemDelimiters(repairExistingVmatrixBlocks(t))
}

/**
 * Full determinant OCR repair chain (all known + generic).
 * @param {string} text
 */
export function repairDeterminantOcr(text) {
  let t = String(text ?? '').trim()
  if (!t) return t

  t = repairSmashedProseVmatrixOcr(t)
  t = repairSemiperimeterDeterminantOcr(t)
  t = repairVandermondePlanesIntegerOcr(t)
  t = repairAlphaBetaRootsDeterminantMcqOcr(t)
  t = repairZ5ImaginaryRootsExpDeterminantMcqOcr(t)
  t = repairTrigRangeDeterminantMcqOcr(t)
  t = repairPolynomialCoeffVmatrixOcr(t)
  const polyStemOk =
    /\\begin\{vmatrix\}[\s\S]*3x\^2\s*\+\s*19[\s\S]*2x\^2\s*\+\s*17[\s\S]*\\end\{vmatrix\}/i.test(t) &&
    /\\\\/.test(t)
  if (!polyStemOk) {
    t = repairFlatVmatrixOcr(t)
  }
  if (looksLikeDeterminantQuestion(t)) {
    const hasGoodVmatrix =
      /\\begin\{vmatrix\}/i.test(t) &&
      !vmatrixLooksBroken(t) &&
      (/\\\\/.test(t) || /\\sec\^2 x/i.test(t) || looksLikePolynomialCoeffVmatrix(t))
    if (!hasGoodVmatrix) {
      t = repairGenericDeterminantOcr(t)
    } else {
      t = ensureVmatrixStemDelimiters(repairExistingVmatrixBlocks(t))
    }
  }
  return t
}

/**
 * After parse — restore determinant stems; clear false A–D splits on integer types.
 * @param {{ text?: string, options?: string[], optionsFound?: number }} parsed
 */
export function repairDeterminantIntegerParse(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed

  parsed = repairDeterminantMcqParse(parsed)
  parsed = repairTrigRangeDeterminantMcqParse(parsed)
  parsed = repairPolynomialCoeffVmatrixParse(parsed)
  parsed = repairSemiperimeterDeterminantParse(parsed)
  parsed = repairVandermondePlanesIntegerParse(parsed)
  parsed = repairAlphaBetaRootsDeterminantMcqParse(parsed)
  parsed = repairZ5ImaginaryRootsExpDeterminantMcqParse(parsed)

  const blob = `${parsed.text ?? ''}\n${(parsed.options ?? []).join('\n')}\n${parsed._ocrSource ?? ''}`

  // Always restore vmatrix structure when determinant detected (even after polish mangled row breaks).
  parsed = repairFlatVmatrixParse(parsed)

  if (looksLikePolynomialCoeffVmatrix(blob)) {
    parsed = repairPolynomialCoeffVmatrixParse(parsed)
    return parsed
  }
  if (
    looksLikeAlphaBetaRootsDeterminantMcq(blob) ||
    looksLikeZ5ImaginaryRootsExpDeterminantMcq(blob) ||
    looksLikeTrigRangeDeterminantMcq(blob) ||
    hasIntervalMcqOptions(blob) ||
    hasNumericMcqOptions(blob)
  ) {
    if (
      (parsed.optionsFound ?? 0) >= 4 &&
      /\\begin\{vmatrix\}/i.test(parsed.text ?? '') &&
      !vmatrixLooksBroken(parsed.text ?? '')
    ) {
      return parsed
    }
    if (looksLikeTrigRangeDeterminantMcq(blob)) parsed = repairTrigRangeDeterminantMcqParse(parsed)
    if (looksLikeAlphaBetaRootsDeterminantMcq(blob)) parsed = repairAlphaBetaRootsDeterminantMcqParse(parsed)
    if (looksLikeZ5ImaginaryRootsExpDeterminantMcq(blob)) {
      parsed = repairZ5ImaginaryRootsExpDeterminantMcqParse(parsed)
    }
    return parsed
  }

  const blobAfter = `${parsed.text ?? ''}\n${(parsed.options ?? []).join('\n')}\n${parsed._ocrSource ?? ''}`
  if (
    looksLikeAlphaBetaRootsDeterminantMcq(blobAfter) ||
    looksLikeZ5ImaginaryRootsExpDeterminantMcq(blobAfter) ||
    looksLikeTrigRangeDeterminantMcq(blobAfter) ||
    looksLikePolynomialCoeffVmatrix(blobAfter) ||
    hasIntervalMcqOptions(blobAfter) ||
    hasNumericMcqOptions(blobAfter)
  ) {
    return parsed
  }

  if (!looksLikeDeterminantIntegerStem(blobAfter) && !falseDeterminantOptionSplit(parsed.options)) {
    return parsed
  }

  const opts = (parsed.options ?? []).map((o) => String(o ?? '').trim())
  if (
    falseDeterminantOptionSplit(opts) ||
    vmatrixLooksBroken(parsed.text ?? '') ||
    (looksLikeDeterminantQuestion(blobAfter) && !/\\begin\{vmatrix\}/i.test(parsed.text ?? ''))
  ) {
    let text = repairDeterminantOcr(parsed.text ?? blobAfter)
    if (looksLikeSemiperimeterDeterminantInteger(blobAfter)) {
      text = repairSemiperimeterDeterminantOcr(text)
    } else if (looksLikeVandermondePlanesInteger(blobAfter)) {
      text = repairVandermondePlanesIntegerOcr(text)
    }
    parsed.text = text
    parsed.options = ['', '', '', '']
    parsed.optionsFound = 0
    parsed.complete = false
  }

  return parsed
}

export {
  looksLikeSemiperimeterDeterminantInteger,
  looksLikeVandermondePlanesInteger,
  repairDeterminantMcqParse,
  hasIntervalMcqOptions,
  hasNumericMcqOptions,
}
