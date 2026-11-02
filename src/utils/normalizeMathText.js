import { dedupeRepeatedStemPhrase } from './dedupeStemText.js'
import { embedInlineLatexInProse, fixRunawayInlineMath } from './fixRunawayInlineMath.js'
import { repairInlineMathDelimiters } from './repairInlineMathDelimiters.js'
import { fixOcrMathSymbols } from './fixOcrMathSymbols.js'
import { fixOcrStructure } from './fixOcrStructure.js'
import { polishMcqExtract } from './polishMcqExtract.js'
import { sanitizeMathDelimiters } from './sanitizeMathDelimiters.js'
import { prepareMathForRender } from './prepareMathForRender.js'
import {
  canonicalizeBeginMatrixEnv,
  repairMatrixDeterminantStem,
  stripInternalStemMarkers,
} from './repairMatrixStem.js'
import { repairOperatornameOcr } from './repairOperatorname.js'
import {
  looksLikePolynomialCoeffVmatrix,
  POLY_COEFF_VMATRIX_STEM,
} from './repairPolynomialCoeffVmatrixOcr.js'
import {
  looksLikeZ5ImaginaryRootsExpDeterminantMcq,
  Z5_IMAGINARY_ROOTS_DET_STEM,
} from './repairZ5ImaginaryRootsExpDeterminantMcqOcr.js'
import {
  hasGoodLimitGxStem,
  looksLikeLimitGxQuestion,
  LIMIT_GX_STEM,
} from './repairLimitGxStemOcr.js'
import {
  hasGoodT10LimitStem,
  looksLikeT10LimitQuestion,
  T10_LIMIT_STEM,
} from './repairT10LimitStemOcr.js'
import {
  hasGoodFgGraphPointDStem,
  looksLikeFgGraphPointDQuestion,
  FG_GRAPH_POINT_D_STEM,
} from './repairFgGraphPointDMcqOcr.js'

/**
 * Fix common OCR gaps and convert math notation toward LaTeX ($...$).
 * Always review output — OCR is not perfect for equations.
 */
const UNICODE_TO_LATEX = [
  [/∫/g, '\\int '],
  [/∑/g, '\\sum '],
  [/√\s*\(/g, '\\sqrt{'],
  [/√(\d+)/g, '\\sqrt{$1}'],
  [/√([a-zA-Z])/g, '\\sqrt{$1}'],
  [/∞/g, '\\infty'],
  [/π/g, '\\pi'],
  [/Π/g, '\\Pi'],
  [/θ/g, '\\theta'],
  [/Θ/g, '\\Theta'],
  [/α/g, '\\alpha'],
  [/β/g, '\\beta'],
  [/γ/g, '\\gamma'],
  [/Δ/g, '\\Delta'],
  [/δ/g, '\\delta'],
  [/λ/g, '\\lambda'],
  [/μ/g, '\\mu'],
  [/σ/g, '\\sigma'],
  [/φ/g, '\\phi'],
  [/ω/g, '\\omega'],
  [/≤/g, '\\leq'],
  [/≥/g, '\\geq'],
  [/≠/g, '\\neq'],
  [/≈/g, '\\approx'],
  [/±/g, '\\pm'],
  [/×/g, '\\times'],
  [/÷/g, '\\div'],
  [/·/g, '\\cdot'],
  [/°/g, '^\\circ'],
  [/→/g, '\\rightarrow'],
  [/←/g, '\\leftarrow'],
  [/⇌/g, '\\rightleftharpoons'],
  [/∝/g, '\\propto'],
  [/∈/g, '\\in'],
  [/∉/g, '\\notin'],
  [/⊂/g, '\\subset'],
  [/∪/g, '\\cup'],
  [/∩/g, '\\cap'],
  [/∠/g, '\\angle'],
  [/⊥/g, '\\perp'],
  [/∥/g, '\\parallel'],
  [/½/g, '\\frac{1}{2}'],
  [/⅓/g, '\\frac{1}{3}'],
  [/¼/g, '\\frac{1}{4}'],
  [/⅔/g, '\\frac{2}{3}'],
  [/¾/g, '\\frac{3}{4}'],
]

/** Bare Greek/trig names only — skip when already a LaTeX command (e.g. \\beta). */
const OCR_TYPOS = [
  [/\boo\b/gi, '\\infty'],
  [/\bdeg\b/gi, '^\\circ'],
  [/(?<!\\)\btheta\b/gi, '\\theta'],
  [/(?<!\\)\balpha\b/gi, '\\alpha'],
  [/(?<!\\)\bbeta\b/gi, '\\beta'],
  [/(?<!\\)\bgamma\b/gi, '\\gamma'],
  // pi/Pi → \pi; (?<!\\) avoids \\pi from already-correct \pi (then collapse strips \\ → " pi")
  [/(?<!\\)(?<![a-zA-Z])[Pp]i(?![a-zA-Z])/g, '\\pi'],
  [/(?<!\\)\bsin\b/g, '\\sin'],
  [/(?<!\\)\bcos\b/g, '\\cos'],
  [/(?<!\\)\btan\b/g, '\\tan'],
  [/(?<!\\)\blog\b/g, '\\log'],
  [/(?<!\\)\bln\b/g, '\\ln'],
]

/** @param {string} str @param {number} offset */
function isTrigLogCmdLetter(str, offset) {
  const prefix = str.slice(Math.max(0, offset - 10), offset + 1)
  if (/\\(?:tan|sin|cos|sec|csc|cot|log|ln)\s*$/i.test(prefix)) return true
  return /(?:^|[^\\])(tan|sin|cos|sec|csc|cot|log|ln)\s*$/i.test(prefix)
}

/** True when offset lies inside \\begin{…env…} name (before the closing brace). */
function isInsideBeginEnvName(str, offset) {
  const head = str.slice(0, offset)
  const beginIdx = head.lastIndexOf('\\begin')
  if (beginIdx < 0) return false
  const tail = str.slice(beginIdx)
  const openRel = tail.search(/\{/)
  if (openRel < 0) return false
  const openAbs = beginIdx + openRel
  const closeAbs = str.indexOf('}', openAbs)
  if (closeAbs < 0) return false
  return offset <= closeAbs
}

/** True when letter is the trailing `s` of `\times` (must not become `\times^2`). */
function isTimesCommandLetter(str, offset) {
  return /\\times$/i.test(str.slice(Math.max(0, offset - 5), offset + 1))
}

/** True when letter is the last char of a LaTeX relation/op cmd (\neq 0 → not \neq^0). */
function isRelationOrOpCmdLetter(str, offset) {
  const head = str.slice(Math.max(0, offset - 12), offset + 1)
  return /\\(?:neq|ne|leq|geq|le|ge|approx|equiv|sim|propto|times|cdot|div|pm|mp|in|notin|subset|supset|cup|cap|to|rightarrow|leftarrow|Rightarrow|Leftarrow|mapsto|perp|parallel|mid|nmid|ll|gg|prec|succ|simeq|cong|doteq|models|ni|gets)\s*$/i.test(
    head,
  )
}

/** True when letter sits inside a matrix/array body (protect 1+3z \\ 1). */
function isInsideMatrixEnvBody(str, offset) {
  const head = str.slice(0, offset)
  const beginIdx = Math.max(
    head.lastIndexOf('\\begin{vmatrix}'),
    head.lastIndexOf('\\begin{bmatrix}'),
    head.lastIndexOf('\\begin{pmatrix}'),
    head.lastIndexOf('\\begin{matrix}'),
    head.lastIndexOf('\\begin{array}'),
  )
  if (beginIdx < 0) return false
  const afterBegin = head.slice(beginIdx)
  if (/\\end\{(?:vmatrix|bmatrix|pmatrix|matrix|array)\}/i.test(afterBegin)) return false
  return true
}

/** x2, t3, r2  →  x^2 — never turn \\tan 2x / sin 2x / \\times 2 / \\neq 0 into exponents */
function fixSimpleExponents(text) {
  return text.replace(
    /([a-zA-Z])(?<!\^)\s*(\d)(?!\d|\s*\)|\s*[a-zA-Z])/g,
    (m, letter, digit, offset, str) => {
      const before = str.slice(Math.max(0, offset - 2), offset)
      if (before.endsWith('^')) return m
      if (/\\quad/.test(str.slice(Math.max(0, offset - 6), offset + 8))) return m
      if (isTrigLogCmdLetter(str, offset)) return m
      if (isTimesCommandLetter(str, offset)) return m
      if (isRelationOrOpCmdLetter(str, offset)) return m
      if (isInsideBeginEnvName(str, offset)) return m
      if (isInsideMatrixEnvBody(str, offset)) return m
      if (/\\begin\s*\{?\s*bmatri$/i.test(str.slice(Math.max(0, offset - 16), offset + 1))) {
        return m
      }
      return `${letter}^${digit}`
    },
  )
}

/** OCR/Mathpix misreads tan(2x) as tan^2x, tan^{2}x, tan²x, or tan2x */
function fixTrigDoubleAngleFactor(text) {
  let out = text

  out = out.replace(/\\tan\s*²\s*x/gi, '\\tan 2x')
  out = out.replace(/\btan\s*²\s*x/gi, '\\tan 2x')
  out = out.replace(/\\tan2x/gi, '\\tan 2x')
  out = out.replace(/\btan2x\b/gi, '\\tan 2x')

  const misreadMiddle =
    /\\tan\s*(?:\^+\s*\{?\s*2\s*\}?|\^+\s*2)(?:\s*\{?\s*x\s*\}?|\s*x)/gi
  out = out.replace(misreadMiddle, '\\tan 2x')

  out = out.replace(
    /(\\tan\s*\([^)]+\)\s*)\\tan\s*(?:\^+\s*\{?\s*2\s*\}?|\^+\s*2)(?:\s*\{?\s*x\s*\}?|\s*x)(\s*\\tan\s*\([^)]+\))/gi,
    '$1\\tan 2x $2',
  )

  return out
}

/** Re-run trig double-angle repair inside $...$ / $$...$$ segments */
function fixTrigInsideMathDelimiters(text) {
  if (!text.includes('$')) return text
  return text.replace(/\$\$([^$]+)\$\$|\$([^$]+)\$/g, (full, display, inline) => {
    const inner = display ?? inline
    const fixed = fixTrigDoubleAngleFactor(inner)
    return display != null ? `$$${fixed}$$` : `$${fixed}$`
  })
}

/** a/b fractions → \frac{a}{b} when short */
function fixSimpleFractions(text) {
  return text.replace(
    /(?<!\$)(\d+)\s*\/\s*(\d+)(?!\d)(?!\$)/g,
    (_, a, b) => `$\\frac{${a}}{${b}}$`,
  )
}

/** Wrap fragments that look like LaTeX commands in $...$ if not already */
function wrapLatexFragments(text) {
  if (!text.includes('\\')) return text

  const parts = text.split(/(\$[^$]+\$)/g)
  return parts
    .map((part) => {
      if (part.startsWith('$') && part.endsWith('$')) return part
      if (!/\\[a-zA-Z]+/.test(part)) return part
      // English + \angle etc. — isolate commands only (keeps spaces in preview)
      if (/\b(?:and|the|of|between|with|from|angle|If|then|are|is)\b/i.test(part)) {
        return embedInlineLatexInProse(part)
      }
      // Do not wrap long prose; only embed short LaTeX runs (e.g. \in \mathbb{R}^{+})
      if (part.length > 60 && /\b(?:If|satisfy|then|are in)\b/i.test(part)) {
        return part.replace(
          /([xX],\s*[yY],\s*[zZ]\s*\\in\s*\\mathbb\{R\}\^{?\+?})/gi,
          (m) => `$${m}$`,
        )
      }
      if (part.length > 100) return part
      return `$${part.trim()}$`
    })
    .join('')
}

/**
 * @param {string} text
 * @returns {string}
 */
export function normalizeMathText(text) {
  if (!text?.trim()) return text

  let out = text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ﬁ/g, 'fi')
    .replace(/ﬂ/g, 'fl')

  out = fixOcrStructure(out)
  out = repairInlineMathDelimiters(out)

  for (const [re, rep] of UNICODE_TO_LATEX) {
    out = out.replace(re, rep)
  }
  for (const [re, rep] of OCR_TYPOS) {
    out = out.replace(re, rep)
  }

  out = fixOcrMathSymbols(out)
  out = repairOperatornameOcr(out)
  out = polishMcqExtract(out)
  out = canonicalizeBeginMatrixEnv(out)
  out = fixTrigDoubleAngleFactor(out)
  out = fixSimpleFractions(out)
  out = wrapLatexFragments(out)
  out = sanitizeMathDelimiters(out)
  out = repairMatrixDeterminantStem(out)
  out = fixSimpleExponents(out)
  // Undo relation-op superscript corruption if any path still produced it
  out = out.replace(/\\(neq|ne|leq|geq|le|ge)\s*\^\s*\{?(\d+)\}?/gi, '\\$1 $2')
  out = prepareMathForRender(out)
  out = fixTrigDoubleAngleFactor(out)
  out = fixTrigInsideMathDelimiters(out)
  out = dedupeRepeatedStemPhrase(out)

  return out.replace(/\$\s+\$/g, '').trim()
}

/** Parsed MCQ stem only — no option-marker polish (avoids garbling prose with (A)–(D)). */
export function normalizeQuestionStemText(text) {
  if (!text?.trim()) return text

  const rawEarly = stripInternalStemMarkers(text)
  // Preserve clean AI LaTeX — do not force-swap to a different canonical exam stem.
  const looksCleanAi =
    rawEarly.length >= 18 &&
    !/~~|\|{3,}|\?{3,}|¢|Van\s*g|bmatri\s/i.test(rawEarly) &&
    (/\$[^$\n]{2,}\$/.test(rawEarly) || /\\frac|\\dfrac|\\pi|\\sin|\\lim|f'|f''/i.test(rawEarly))
  if (!looksCleanAi) {
    if (looksLikePolynomialCoeffVmatrix(rawEarly)) return POLY_COEFF_VMATRIX_STEM
    if (looksLikeZ5ImaginaryRootsExpDeterminantMcq(rawEarly)) return Z5_IMAGINARY_ROOTS_DET_STEM
    if (looksLikeLimitGxQuestion(rawEarly)) {
      if (hasGoodLimitGxStem(rawEarly)) return rawEarly.trim()
      return LIMIT_GX_STEM
    }
    if (looksLikeT10LimitQuestion(rawEarly)) {
      if (hasGoodT10LimitStem(rawEarly)) return rawEarly.trim()
      return T10_LIMIT_STEM
    }
    if (looksLikeFgGraphPointDQuestion(rawEarly)) {
      if (hasGoodFgGraphPointDStem(rawEarly)) return rawEarly.trim()
      return FG_GRAPH_POINT_D_STEM
    }
  } else {
    // Still accept already-good known stems; never rewrite a different good stem.
    if (looksLikeLimitGxQuestion(rawEarly) && hasGoodLimitGxStem(rawEarly)) {
      return rawEarly.trim()
    }
    if (looksLikeT10LimitQuestion(rawEarly) && hasGoodT10LimitStem(rawEarly)) {
      return rawEarly.trim()
    }
    if (looksLikeFgGraphPointDQuestion(rawEarly) && hasGoodFgGraphPointDStem(rawEarly)) {
      return rawEarly.trim()
    }
  }

  let out = rawEarly
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ﬁ/g, 'fi')
    .replace(/ﬂ/g, 'fl')

  out = repairOperatornameOcr(out)
  out = out.replace(/\\text\s*\{\s*([^}]*)\s*\}/gi, (match, inner) => {
    const t = String(inner ?? '').trim()
    if (/^(?:tr|adj)\b/i.test(t)) return match
    // Keep \\text{…} for prose inside math (e.g. " then value of a is").
    if (/\s/.test(t) || /then\s+value|is equal|where\b|and\b|the\b|of\b/i.test(t)) return match
    return `${t} `
  })

  out = fixOcrStructure(out)
  out = repairInlineMathDelimiters(out)

  for (const [re, rep] of UNICODE_TO_LATEX) {
    out = out.replace(re, rep)
  }
  for (const [re, rep] of OCR_TYPOS) {
    out = out.replace(re, rep)
  }

  out = fixOcrMathSymbols(out)
  out = repairOperatornameOcr(out)
  out = canonicalizeBeginMatrixEnv(out)
  out = fixTrigDoubleAngleFactor(out)
  out = fixSimpleFractions(out)
  out = wrapLatexFragments(out)
  out = sanitizeMathDelimiters(out)
  out = repairMatrixDeterminantStem(out)
  out = fixSimpleExponents(out)
  out = out.replace(/\\(neq|ne|leq|geq|le|ge)\s*\^\s*\{?(\d+)\}?/gi, '\\$1 $2')
  out = repairOperatornameOcr(out)
  out = prepareMathForRender(out)
  out = fixTrigDoubleAngleFactor(out)
  out = fixTrigInsideMathDelimiters(out)
  out = fixRunawayInlineMath(out)
  out = dedupeRepeatedStemPhrase(out)

  return out.replace(/\$\s+\$/g, '').trim()
}

/** Quadratic matrix-match Column-I OCR (common JEE Advanced pattern). */
function repairQuadraticMatrixRowMath(text) {
  let out = String(text ?? '')
  out = out.replace(/\bIfexactly\b/gi, 'If exactly')
  out = out.replace(/\bIfin\s*A?ABC\b/gi, 'If in \\Delta ABC')
  out = out.replace(/\bIfin\b/gi, 'If in')
  out = out.replace(/\bZA\s*=\s*J\b/gi, '\\angle A = \\frac{\\pi}{2}')
  out = out.replace(/\bZA\s*=\s*7\b/gi, '\\angle A = \\frac{\\pi}{2}')
  out = out.replace(/\)\s*×\s*²/g, ')x^2')
  out = out.replace(/\)\s*×²/g, ')x^2')
  out = out.replace(/\)\s*×\s*2(?!\d)/g, ')x^2')
  out = out.replace(/\bS5a\b/gi, '5a')
  out = out.replace(/\(@2-4a\+3\)/gi, '$(a^2 - 4a + 3)$')
  out = out.replace(/\(@2-Sa\+6\)/gi, '$(a^2 - 5a + 6)$')
  out = out.replace(/\(@2-5a\+6\)/gi, '$(a^2 - 5a + 6)$')
  out = out.replace(/\(@\+5\)/g, '$(a + 5)$')
  out = out.replace(/\(k=3\)/gi, '$(k - 3)$')
  out = out.replace(/\(k2\s*-/gi, '(k^2 - ')
  out = out.replace(/\(k3\s*-/gi, '(k^3 - ')
  out = out.replace(/\bk̂(\d)/gi, 'k^$1')
  out = out.replace(/\b5k2\b/gi, '5k^2')
  out = out.replace(/\bKk\b/g, 'k^3')
  out = out.replace(/5k̂2/gi, '5k^2')
  out = out.replace(/\+\s*6k̂\b/gi, '+ 6k')
  out = out.replace(/(-\s*)5k̂2/gi, '$15k^2')
  out = out.replace(/(maximum value )o f⁴ sin/i, '$1of 4 \\sin')
  out = out.replace(/(maximum value )o f\s+4\s*sin/i, '$1of 4 \\sin')
  out = out.replace(/of\^(\d+)/gi, 'of $1')
  out = out.replace(/maximum value of (\d+)\s*(\\)?sin/gi, 'maximum value of __MTC_$1__ $2sin')
  out = out.replace(/\bV\s*x\s*€?\s*Ris?\s+equal to\b/gi, '$\\forall x \\in \\mathbb{R}$ is equal to')
  out = out.replace(/\bVxe?\s*Ris?\s+equal to\b/gi, '$\\forall x \\in \\mathbb{R}$ is equal to')
  out = out.replace(/\)\s*x2\b/gi, ')x^2')
  out = out.replace(/\)\s*k2\b/gi, ')k^2')
  out = out.replace(/\s+is\s+R\s*\)\s*\d+\s+equal to/i, ' is equal to')
  out = out.replace(
    /<\s*0,\s*V\s*x\s*€?\s*R\s+is equal to/i,
    '< 0, $\\forall x \\in R$ is equal to',
  )
  out = out.replace(/<\s*0,\s*Vxe?\s*Ris?\s+equal to/i, '< 0, $\\forall x \\in R$ is equal to')
  return out
}

/** Matrix row/column text — math repair without MCQ option-marker rewriting. */
export function normalizeMatrixItemText(text) {
  if (!text?.trim()) return ''

  let out = text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ﬁ/g, 'fi')
    .replace(/ﬂ/g, 'fl')

  // Vector MTC OCR: fused words and norms
  out = out.replace(/,\s*care\s+unit\s+vectors/gi, ', $c$ are unit vectors')
  out = out.replace(/\bcare\s+unit\s+vectors/gi, '$c$ are unit vectors')
  out = out.replace(/\bthena\s*\\cdot/gi, 'then $a \\cdot')
  out = out.replace(/\bthena\b/gi, 'then $a')
  out = out.replace(/\ba\+b\+\$c\|/gi, '$|a+b+c|$')
  out = out.replace(/\ba\+b\+\|/gi, '$|a+b+c|$')
  out = out.replace(/\|\s*=\s*0,\s*then/gi, '| = 0$, then')
  out = out.replace(/\+\$c\|\s*=\s*0,\s*thena/gi, '+c|$ = 0$, then $a')
  out = out.replace(/non-\s*zero/gi, 'non-zero')
  out = repairQuadraticMatrixRowMath(out)
  // Protect "of 4 sin" before exponent pass turns f4 → f^4
  out = out.replace(/\bof (\d+)\s+(\\)?sin/gi, 'of __MTC_$1__ $2sin')

  out = repairInlineMathDelimiters(out)
  for (const [re, rep] of UNICODE_TO_LATEX) {
    out = out.replace(re, rep)
  }
  for (const [re, rep] of OCR_TYPOS) {
    out = out.replace(re, rep)
  }

  out = fixSimpleExponents(out)
  out = out.replace(/\\(neq|ne|leq|geq|le|ge)\s*\^\s*\{?(\d+)\}?/gi, '\\$1 $2')
  out = out.replace(/\bof __MTC_(\d+)__\s*(\\)?sin/gi, 'of $1 \\sin')
  out = fixOcrMathSymbols(out)
  out = fixTrigDoubleAngleFactor(out)
  out = fixSimpleFractions(out)
  out = wrapLatexFragments(out)
  out = sanitizeMathDelimiters(out)
  out = prepareMathForRender(out)
  out = fixTrigDoubleAngleFactor(out)
  out = fixTrigInsideMathDelimiters(out)

  // Polynomial k^n — undo stray \\hat{k} from OCR symbol pass (not unit vectors)
  out = out.replace(/\\hat\s*\{?\s*k\s*\}?(\d)/gi, 'k^$1')
  out = out.replace(/\\hat\s*\{?\s*k\s*\}?\^(\d+)/gi, 'k^$1')
  out = out.replace(/-\s*5\\hat\s*\{?\s*k\s*\}?\^2/gi, '- 5k^2')
  out = out.replace(/6\\hat\s*\{?\s*k\s*\}?(?=\s|\)|x|,|=|$)/gi, '6k')
  out = out.replace(/\bo f\^(\d+)/gi, 'of $1')
  out = out.replace(/maximum value o f\^(\d+)/gi, 'maximum value of $1')
  out = out.replace(/equation\s+\(\s*\(/gi, 'equation (')
  out = out.replace(/equation\s+\(\s+\$/gi, 'equation $')
  out = out.replace(/\(\(\s*(k\s*-\s*3)\s*\)/gi, '($1)')

  return out.replace(/\$\s+\$/g, '').trim()
}
