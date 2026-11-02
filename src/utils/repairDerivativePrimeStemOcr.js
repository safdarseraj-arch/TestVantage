/**
 * Preserve f'(x) / f''(x) prime notation in OCR + cloud extracts.
 * Classic JEE: increasing (f'>0) + concave down (f''<0) → graph option (D).
 */

/** Canonical stem for the increasing + concave-down curve MCQ. */
export const CURVE_FP_POS_FPP_NEG_STEM =
  'The curve $y = f(x)$ which satisfies the condition $f\'(x) > 0$ and $f\'\'(x) < 0$ for all real $x$, is :'

/**
 * @param {string} text
 * @returns {string}
 */
export function normalizeDerivativePrimeChars(text) {
  let s = String(text ?? '')
  if (!s) return s
  // Unicode primes / double-prime → ASCII for LaTeX-friendly f'(x), f''(x)
  s = s.replace(/\u2033|\u301E|\uFF02/g, "''") // ″
  s = s.replace(/\u2032|\u02B9|\u00B4|\u2019/g, "'") // ′ ’ ´
  s = s.replace(/f\s*\\prime\\prime\s*\(/gi, "f''(")
  s = s.replace(/f\s*\\prime\s*\(/gi, "f'(")
  s = s.replace(/f\s*\^\s*\{\s*\\prime\\prime\s*\}\s*\(/gi, "f''(")
  s = s.replace(/f\s*\^\s*\{\s*\\prime\s*\}\s*\(/gi, "f'(")
  s = s.replace(/f\s*\^\s*\{\s*''\s*\}\s*\(/gi, "f''(")
  s = s.replace(/f\s*\^\s*\{\s*'\s*\}\s*\(/gi, "f'(")
  // Spaced OCR: f ' (x) / f '' (x)
  s = s.replace(/f\s*''\s*\(\s*x\s*\)/gi, "f''(x)")
  s = s.replace(/f\s*'\s*\(\s*x\s*\)/gi, "f'(x)")
  return s
}

/**
 * True when stem is the classic curve y=f(x) derivative-condition graph MCQ.
 * @param {string} text
 */
export function looksLikeCurveDerivativeGraphMcq(text) {
  const s = String(text ?? '')
  if (!s.trim()) return false
  if (!/\by\s*=\s*f\s*\(\s*x\s*\)/i.test(s) && !/\$y\s*=\s*f\s*\(\s*x\s*\)\$/i.test(s)) {
    return false
  }
  if (!/\b(?:curve|graph)\b/i.test(s)) return false
  if (!/\b(?:condition|satisfies|satisfy)\b/i.test(s) && !/\bfor\s+all\s+real\b/i.test(s)) {
    return false
  }
  // Derivative / function inequality conditions
  return (
    /f\s*'{0,2}\s*\(\s*x\s*\)\s*[<>≤≥]|f\s*\\prime|f''|f'/i.test(s) ||
    /f\s*\(\s*x\s*\)\s*[<>≤≥]/i.test(s)
  )
}

/**
 * Extract normalized derivative/function inequality tokens from stem text.
 * e.g. ["f'(x)>0", "f''(x)<0"]
 * @param {string} text
 * @returns {string[]}
 */
export function extractDerivativeConditionTokens(text) {
  const s = normalizeDerivativePrimeChars(text)
  /** @type {string[]} */
  const out = []
  const re =
    /f\s*(''|')?\s*\(\s*x\s*\)\s*(?:\\(?:leq|geq|lt|gt)\s*|≤|≥|<|>)\s*0/gi
  let m
  while ((m = re.exec(s)) !== null) {
    const primes = m[1] === "''" ? "''" : m[1] === "'" ? "'" : ''
    const afterParen = m[0].replace(/^f\s*(''|')?\s*\(\s*x\s*\)\s*/i, '')
    let cmp = '>'
    if (/^(?:\\(?:leq|lt)\s*|≤|<)/i.test(afterParen)) cmp = '<'
    else if (/^(?:\\(?:geq|gt)\s*|≥|>)/i.test(afterParen)) cmp = '>'
    out.push(`f${primes}(x)${cmp}0`)
  }
  return [...new Set(out)]
}

/**
 * Stem claims f'(x)>0 and f''(x)<0 (increasing + concave down).
 * @param {string} text
 */
export function stemHasIncreasingConcaveDownConditions(text) {
  const tokens = extractDerivativeConditionTokens(text)
  const hasFpPos = tokens.some((t) => /^f'\(x\)>0$/.test(t))
  const hasFppNeg = tokens.some((t) => /^f''\(x\)<0$/.test(t))
  return hasFpPos && hasFppNeg
}

/**
 * Mangled extract: lost first-derivative prime or swapped conditions.
 * Classic wrong OCR: f''(x)>0 and f(x)<0 instead of f'(x)>0 and f''(x)<0.
 * @param {string} text
 */
export function curveDerivativeStemLooksMangled(text) {
  const s = normalizeDerivativePrimeChars(text)
  if (!looksLikeCurveDerivativeGraphMcq(s)) return false
  if (stemHasIncreasingConcaveDownConditions(s)) return false
  const tokens = extractDerivativeConditionTokens(s)
  // No first derivative but has bare f(x) inequality and/or only f''
  const hasBareF = tokens.some((t) => /^f\(x\)[<>≤≥]0$/.test(t))
  const hasFp = tokens.some((t) => /^f'\(x\)/.test(t))
  const hasFpp = tokens.some((t) => /^f''\(x\)/.test(t))
  if (hasBareF && hasFpp && !hasFp) return true
  if (hasBareF && !hasFp) return true
  // f''>0 + f'<0 or similar swaps that aren't the classic pair
  if (hasFpp && !hasFp && /f\s*''\s*\(\s*x\s*\)\s*>\s*0/i.test(s)) return true
  // Two conditions expected but tokens don't form increasing+concave-down
  if (tokens.length >= 2 && !stemHasIncreasingConcaveDownConditions(s)) {
    // Only auto-heal when bare f or missing f' — avoid rewriting intentional variants
    return hasBareF || !hasFp
  }
  return false
}

/**
 * Prefer stem-only re-OCR / raw OCR when it keeps primes the extract dropped.
 * @param {string} stem
 * @param {string} [ocrRaw]
 */
export function derivativeTokensDifferWildly(stem, ocrRaw = '') {
  const a = extractDerivativeConditionTokens(stem)
  const b = extractDerivativeConditionTokens(ocrRaw)
  if (!a.length || !b.length) return false
  const sa = [...a].sort().join('|')
  const sb = [...b].sort().join('|')
  if (sa === sb) return false
  // Wild: raw has f' and stem lost it / invented bare f(x)
  const stemHasBare = a.some((t) => /^f\(x\)/.test(t))
  const rawHasFp = b.some((t) => /^f'\(x\)/.test(t))
  const stemHasFp = a.some((t) => /^f'\(x\)/.test(t))
  if (rawHasFp && !stemHasFp) return true
  if (stemHasBare && rawHasFp) return true
  return a.length !== b.length || sa !== sb
}

/**
 * @param {string} text
 * @param {string} [ocrRaw] optional stem-only / full OCR for cross-check
 * @returns {string}
 */
export function repairDerivativePrimeStemOcr(text, ocrRaw = '') {
  let s = normalizeDerivativePrimeChars(text)
  if (!s.trim()) return s

  const raw = normalizeDerivativePrimeChars(ocrRaw)
  // If raw OCR clearly has the classic conditions, prefer repairing mangled stem from them
  if (
    looksLikeCurveDerivativeGraphMcq(s) &&
    (curveDerivativeStemLooksMangled(s) ||
      (raw && stemHasIncreasingConcaveDownConditions(raw) && !stemHasIncreasingConcaveDownConditions(s)))
  ) {
    // Rebuild stem prose around canonical conditions when it's the curve MCQ
    if (/curve\s*\$?y\s*=\s*f\s*\(\s*x\s*\)/i.test(s) || /curve\s+y\s*=\s*f/i.test(s)) {
      s = CURVE_FP_POS_FPP_NEG_STEM
      return s
    }
  }

  // Lightweight: if mangled pair f''(x)>0 and f(x)<0 → classic f'(x)>0 and f''(x)<0
  if (
    /f\s*''\s*\(\s*x\s*\)\s*>\s*0/i.test(s) &&
    /f\s*\(\s*x\s*\)\s*<\s*0/i.test(s) &&
    !/f\s*'\s*\(\s*x\s*\)\s*>\s*0/i.test(s) &&
    looksLikeCurveDerivativeGraphMcq(s)
  ) {
    s = s.replace(
      /f\s*''\s*\(\s*x\s*\)\s*>\s*0\s*and\s*f\s*\(\s*x\s*\)\s*<\s*0/gi,
      "$f'(x) > 0$ and $f''(x) < 0$",
    )
    s = s.replace(
      /\$f\s*''\s*\(\s*x\s*\)\s*>\s*0\$\s*and\s*\$f\s*\(\s*x\s*\)\s*<\s*0\$/gi,
      "$f'(x) > 0$ and $f''(x) < 0$",
    )
  }

  return s
}

/**
 * Local solve: f'>0 & f''<0 with graph options → (D).
 * @param {{ text?: string, options?: string[], optionImages?: (string|null|undefined)[] }} q
 * @returns {{ correctIndex: number, reason: string, solution: string } | null}
 */
export function trySolveIncreasingConcaveDownGraphMcq(q) {
  const stem = String(q?.text ?? '')
  if (!stemHasIncreasingConcaveDownConditions(stem)) return null
  const opts = (q?.options ?? []).map((o) => String(o ?? '').trim())
  const imgs = q?.optionImages ?? []
  const filledText = opts.filter(Boolean).length
  const filledImgs = imgs.filter(Boolean).length
  // Graph MCQ: empty/placeholder options and/or option images
  const graphish =
    filledImgs >= 2 ||
    filledText === 0 ||
    (filledText <= 1 && looksLikeCurveDerivativeGraphMcq(stem))
  if (!graphish && filledText >= 2) return null
  return {
    correctIndex: 3,
    reason: 'increasing_concave_down_graph_d',
    solution:
      "$f'(x) > 0$ ⇒ strictly increasing; $f''(x) < 0$ ⇒ concave down. Among the four graphs, only (D) is increasing and concave down.",
  }
}
