/** IIT Relations & Functions: f(x), g(x) graph construction → coordinates of D. */
export const FG_GRAPH_POINT_D_STEM = `Given the graphs of the two functions, $y = f(x)$ and $y = g(x)$. In the adjacent figure from point $A$ on the graph of the function $y = f(x)$ corresponding to the given value of the independent variable (say $x_0$), a straight line is drawn parallel to the $X$-axis to intersect the bisector of the first and the third quadrants at point $B$. From the point $B$ a straight line parallel to the $Y$-axis is drawn to intersect the graph of the function $y = g(x)$ at $C$. Again a straight line is drawn from the point $C$ parallel to the $X$-axis, to intersect the line $NN'$ at $D$. If the straight line $NN'$ is parallel to $Y$-axis, then the co-ordinates of the point $D$ are`

export const FG_GRAPH_POINT_D_OPTIONS = [
  '$(f(x_0), g(x_0))$',
  '$(g(x_0), f(x_0))$',
  '$(x_0, g(f(x_0)))$',
  '$(f(x_0), g(f(x_0)))$',
]

/** @param {string} t */
export function looksLikeFgGraphPointDQuestion(t) {
  const s = String(t ?? '')
  if (!/f\s*\(\s*x\s*\)/i.test(s)) return false
  if (!/g\s*\(\s*x\s*\)/i.test(s)) return false
  if (!/(?:co-?)?ordinates\s+of\s+the\s+point\s+D/i.test(s)) return false
  return (
    /adjacent\s+figure/i.test(s) ||
    /bisector.*(?:first|third)|first.*third.*quadrant/i.test(s) ||
    /NN\s*['′`]|NN'|NN\s*prime/i.test(s) ||
    (/independent\s+variable/i.test(s) && /straight\s+line/i.test(s)) ||
    (/parallel.*[XY]-?axis/i.test(s) && /perpendicular|parallel/i.test(s))
  )
}

/** @param {string} t */
export function hasGoodFgGraphPointDStem(t) {
  const s = String(t ?? '')
  if (!looksLikeFgGraphPointDQuestion(s)) return false
  return (
    /bisector\s+of\s+the\s+first\s+and\s+the\s+third\s+quadrants/i.test(s) &&
    /NN'/.test(s) &&
    /co-ordinates\s+of\s+the\s+point\s+\$?D/i.test(s) &&
    !/vy\s+nN|yfl\s*=|«-_|\\ce\{co\}/i.test(s) &&
    !/\(\s*A\s*\)/i.test(s)
  )
}

/** @param {string} text */
export function looksLikeCoordinatePairOption(text) {
  const t = String(text ?? '')
    .trim()
    .replace(/^\(\s*[A-D]\s*\)\s*/i, '')
    .trim()
  if (!/^\(/.test(t) || !/,/.test(t)) return false
  return /\bf\s*\(|g\s*\(/i.test(t)
}

/** @param {string[]} [options] */
export function fgGraphPointDOptionsNeedHeal(options = []) {
  const opts = (options ?? []).slice(0, 4).map((o) => String(o ?? '').trim())
  if (opts.filter(Boolean).length < 4) return true
  if (!opts.some((o) => /g\s*\(\s*f\s*\(/i.test(o) && /x_0|x0/i.test(o))) return true
  if (opts.some((o) => /[&%]|Xp\^|gtx\b|yfl/i.test(o))) return true
  return false
}

/** @param {string[]} [options] */
export function healFgGraphPointDOptions(options = []) {
  return fgGraphPointDOptionsNeedHeal(options) ? [...FG_GRAPH_POINT_D_OPTIONS] : [...options.slice(0, 4)]
}

/** @param {string} text */
export function repairFgGraphPointDMcqOcr(text) {
  let t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!t) return t

  t = t.replace(/\\ce\{co\}-ordinates/gi, 'co-ordinates')
  t = t.replace(/\by\s*fl\s*=\s*g\s*x\s*\)/gi, '$y = g(x)$')
  t = t.replace(/\by\s*=\s*g\s*\(\s*x\s*\)/gi, '$y = g(x)$')
  t = t.replace(/\by\s*=\s*f\s*\(\s*x\s*\)/gi, '$y = f(x)$')
  t = t.replace(/NN\s*["″]\s*/g, "$NN'$ ")
  t = t.replace(/NN\s*prime/gi, "$NN'$")

  if (!looksLikeFgGraphPointDQuestion(t)) return t
  if (hasGoodFgGraphPointDStem(t) && !/\(\s*[A-D]\s*\)/i.test(t)) return t

  const optBlock = FG_GRAPH_POINT_D_OPTIONS.map((o, i) => `(${String.fromCharCode(65 + i)}) ${o}`).join('\n')
  return `${FG_GRAPH_POINT_D_STEM}\n${optBlock}`
}

/**
 * @param {{ text?: string, options?: string[], optionsFound?: number, _ocrSource?: string }} parsed
 */
export function repairFgGraphPointDMcqParse(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed
  const blob = `${parsed.text ?? ''}\n${(parsed.options ?? []).join('\n')}\n${parsed._ocrSource ?? ''}`
  if (!looksLikeFgGraphPointDQuestion(blob)) return parsed

  const opts = [...(parsed.options ?? ['', '', '', ''])]
  while (opts.length < 4) opts.push('')

  if (hasGoodFgGraphPointDStem(parsed.text ?? '') && !fgGraphPointDOptionsNeedHeal(opts)) {
    return parsed
  }

  parsed.text = FG_GRAPH_POINT_D_STEM
  parsed.options = healFgGraphPointDOptions(parsed.options)
  parsed.optionsFound = 4
  parsed.complete = true
  return parsed
}
