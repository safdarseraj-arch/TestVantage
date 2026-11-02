/**
 * JEE tower collision passage — diagram OCR often bleeds into numbered stems.
 * @param {string} text
 */
export function looksLikeTowerPassage(text) {
  const t = String(text ?? '')
  return (
    /\btower\b/i.test(t) &&
    (/\bDistance\s+D\b/i.test(t) || /\bwind\s+starts\b/i.test(t) || /\bballs\s+collide\b/i.test(t))
  )
}

/** Remove diagram-band garbage fused after (g=10 m/s^2). */
export function stripDiagramNoiseAfterGravity(text) {
  let t = String(text ?? '')
  if (!t) return t

  t = t.replace(
    /\s+A\s+ah\s+ad\s+\$?\d+\^\\circ\$?\s*[\d]*m?\s*(?:\[[\d\s]+m!?\s*s\^?\d\s*©\s*S\s*=\s*\d+\s*[-–]?)?/gi,
    ' ',
  )
  t = t.replace(
    /((?:\(\s*\$?g\s*=\s*10[^)$]*\$?\s*\)|\$g\s*=\s*10[^$]*\$|g\s*=\s*10\\,\\mathrm\{m\/s\}\^2\$?))\s*(?:[A-Za-z]{1,3}\s+){1,4}(?:\$?\d+\^\\circ\$?|[\d]{2,4}m[!]?|\[[\d\s]+|s\^?\d|©)[\s\S]*?(?=\n\s*\d+\.|\n\s*If\s+Distance|\n\s*If\s+wind|$)/gi,
    '$1',
  )
  t = t.replace(/\s+[\d]{2,4}m!\s*s\^?\d\s*©\s*S\s*=\s*\d+\s*[-–]?\s*/gi, ' ')
  t = t.replace(/\s+©\s*S\s*=\s*\d+\s*[-–]?\s*/gi, ' ')

  return t.replace(/\s{2,}/g, ' ').trim()
}

/** @param {string} chunk */
export function isTowerPassageSetupStem(chunk) {
  const c = String(chunk ?? '')
  return (
    /\bIf\s+the\s+balls\s+collide\b/i.test(c) &&
    /\borigin\b/i.test(c) &&
    !/\bDistance\s+D\b/i.test(c) &&
    !/\bwind\s+starts\b/i.test(c)
  )
}

/**
 * Pre-split repairs for tower PIVQ OCR (numbered stems, diagram bleed, PIVQ tails).
 * @param {string} text
 */
export function repairTowerPassageOcr(text) {
  let t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!looksLikeTowerPassage(t)) return t

  t = t.replace(/\b([a-z]{3,})\s+1s\s+([a-z])/gi, '$1 is $2')
  t = t.replace(/\btowers\s+1s\b/gi, 'towers is')

  t = t.replace(
    /horizontal\s+acceleration\s+a\s*=\s*2\s+\$\\mathrm\{m\/s\}\$\s*[""″']/gi,
    'horizontal acceleration $a_x=2\\,\\mathrm{m/s}^2$',
  )
  t = t.replace(
    /horizontal\s+acceleration\s+a\s*=\s*2\s+\$\\mathrm\{m\/s\}\$(?!\^)/gi,
    'horizontal acceleration $a_x=2\\,\\mathrm{m/s}^2$',
  )

  t = t.replace(/\bthen\s+find\s*=\s*$/gim, 'then the value $\\frac{x}{100}$')
  t = t.replace(/\bthen\s+find\s*=\s*(?=\n|$)/gim, 'then the value $\\frac{x}{100}$')
  t = t.replace(/\bthen\s+find\s+X\s*\+\s*y\s+100\b/gi, 'then the value $\\frac{x+y}{100}$')
  t = t.replace(/\bthen\s+find\s+\(x\s*\+\s*y\)\s*\/\s*100\b/gi, 'then the value $\\frac{x+y}{100}$')

  t = t.replace(
    /(as\s+shown\s+in\s+the\s+figure\.)\s*\n+\s*1\.\s+(If\s+the\s+balls\s+collide[\s\S]*?)(?=\n+\s*2\.\s+)/i,
    (_, intro, setup) => {
      const clean = stripDiagramNoiseAfterGravity(setup.trim())
      return `${intro}\n${clean}\nAnswer the following questions:\n`
    },
  )

  t = stripDiagramNoiseAfterGravity(t)

  return t
}
