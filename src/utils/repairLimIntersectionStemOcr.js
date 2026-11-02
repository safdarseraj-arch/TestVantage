/** JEE stem: intersection count P, then limit with nested sin. */
export const LIM_INTERSECTION_STEM =
  'If $P$ denotes the number of points of intersection of $y^2 = 7x$ and $x^2 + y^2 - 4x + 2 = 0$, then the value of $\\lim_{x \\to P} \\frac{x\\sin(\\sin x) - \\sin^2 x}{x^6}$ is'

export const LIM_INTERSECTION_OPTIONS =
  '(A) $\\frac{1}{6}$ (B) $\\frac{1}{18}$ (C) $\\frac{1}{12}$ (D) $\\frac{1}{24}$'

const LIMIT_EXPR = String.raw`\lim_{x \to P} \frac{x\sin(\sin x) - \sin^2 x}{x^6}`

/** @param {string} t */
function hasCircleFingerprint(t) {
  return /x\^2\s*\+\s*y\^2\s*-\s*4x\s*\+\s*2\s*=\s*0/i.test(t)
}

/** @param {string} t */
function hasParabola7xFingerprint(t) {
  return (
    /y\^2\s*=\s*7x/i.test(t) ||
    /y\^?\*>=?7x/i.test(t) ||
    /y\s*2\s*=\s*7\s*x/i.test(t) ||
    /y2=7x/i.test(t)
  )
}

/** @param {string} t */
function hasIntersectionAsk(t) {
  return /\bP\b.*\bintersection\b/i.test(t) || /\bnumber\s+of\s+(?:points\s+of\s+)?intersection/i.test(t)
}

/** @param {string} t */
function hasGarbledLimitSection(t) {
  return (
    !/\\lim_\{x\s*\\to\s*P\}/.test(t) &&
    (/pd\s*tm|Xx\^?1|111|La\s*\$|tm\s*5/i.test(t) ||
      (/\blim\b/i.test(t) && /sin/i.test(t) === false && /value\s+of/i.test(t)))
  )
}

/** @param {string} t */
function shouldRebuildLimIntersectionStem(t) {
  if (!/\bIf\b/i.test(t) || !hasIntersectionAsk(t)) return false
  if (!hasParabola7xFingerprint(t) || !hasCircleFingerprint(t)) return false
  if (/\\lim_\{x\s*\\to\s*P\}\s*\\frac\{x\\sin\(\\sin\s*x\)/.test(t)) return false
  return hasGarbledLimitSection(t) || /y\^?\*>=?7x/i.test(t) || /\btl\s*\.{2,}/i.test(t)
}

/** @param {string} t */
function hasFullMcqOptionsBlock(t) {
  return (
    /\(\s*A\s*\)/i.test(t) &&
    /\(\s*B\s*\)/i.test(t) &&
    /\(\s*C\s*\)/i.test(t)
  )
}

/** @param {string} t */
function appendOptionsIfMissing(t) {
  let s = String(t ?? '').trim()
  s = s.replace(/\s+is\s*:\s*\(\s*A\s*\)\s*$/i, ' is')
  s = s.replace(/\s+is\s*\(\s*A\s*\)\s*$/i, ' is')
  if (hasFullMcqOptionsBlock(s)) return s
  return `${s.trim()}\n${LIM_INTERSECTION_OPTIONS}`
}

/**
 * Repairs JEE intersection + limit stems (y²=7x ∩ circle, lim x→P with sin(sin x)).
 * @param {string} text
 */
export function repairLimIntersectionStemOcr(text) {
  let t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!t || !/\bIf\b/i.test(t)) return t

  t = t.replace(/\bnumber\s+of\s+intersection\b/gi, 'number of points of intersection')
  t = t.replace(/\by\^?\*>=?7x\b/gi, 'y^2 = 7x')
  t = t.replace(/\$y\^?\*>=?7x\$/gi, '$y^2 = 7x$')
  t = t.replace(/\btl\s*\.{2,}\s*-?\s*/gi, 'then the ')
  t = t.replace(/\btl\b(?=\s*\.)/gi, 'then the')
  t = t.replace(/\bvalue\s+of\s+lim\b/gi, 'value of')

  if (shouldRebuildLimIntersectionStem(t)) {
    return appendOptionsIfMissing(LIM_INTERSECTION_STEM)
  }

  if (hasParabola7xFingerprint(t) && hasCircleFingerprint(t) && hasIntersectionAsk(t)) {
    t = t.replace(
      /\$y\^2\s*=\s*7x\$/i,
      '$y^2 = 7x$',
    )
    if (!/\\lim_\{x\s*\\to\s*P\}/.test(t) && /\bvalue\s+of\b/i.test(t)) {
      t = t.replace(
        /\bvalue\s+of\s+[^.]+?(?=\s+is\b|\s*\([A-D]\)|$)/i,
        `value of $${LIMIT_EXPR}$`,
      )
    }
    if (!/\bdenotes\s+the\s+number\s+of\s+points/i.test(t)) {
      t = t.replace(
        /\bP\s+denotes\s+the\s+number\s+of\s+points\s+of\s+intersection\s+of\b/i,
        '$P$ denotes the number of points of intersection of',
      )
    }
    t = t.replace(
      /\bIf\s+P\s+denotes\b/i,
      'If $P$ denotes',
    )
    t = appendOptionsIfMissing(t)
  }

  t = t.replace(/\s+is\s*:\s*\(\s*A\s*\)\s*$/i, ' is')
  t = t.replace(/\s+is\s*\(\s*A\s*\)\s*$/i, ' is')
  return t
}

/**
 * @param {string} text
 */
export function looksLikeLimIntersectionCalculusQuestion(text) {
  const t = String(text ?? '')
  return hasIntersectionAsk(t) && hasParabola7xFingerprint(t) && hasCircleFingerprint(t)
}
