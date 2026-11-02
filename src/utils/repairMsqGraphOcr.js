/**
 * MSQ graph questions (molecular velocity, Maxwell curves) — common OCR glitches.
 * @param {string} text
 */
export function looksLikeMsqGraphQuestion(text) {
  const t = String(text ?? '')
  return (
    /\bmolecular\s+velocit/i.test(t) ||
    (/\bgraph\s+shows\b/i.test(t) && /\bchoose\s+the\s+correct\s+options?\b/i.test(t))
  )
}

/**
 * @param {string} text
 */
export function repairMsqGraphOcr(text) {
  let t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!looksLikeMsqGraphQuestion(t) && !/\bchoose\s+the\s+correct\s+options?\b/i.test(t)) {
    return t
  }

  t = t.replace(/\(A\s+and\s+\(B\)/gi, '(A and B)')

  t = t.replace(/\bTT\s+eeearocty\s+ns\)\s*/gi, '')
  t = t.replace(/\b(?:eeearocty|velocity\s*\(m\/s\))\s*ns\)\s*/gi, '')

  t = t.replace(/Gas\s+'A'"\s+is/gi, "Gas 'A' is")
  t = t.replace(
    /\(under all similar conditions including\s+'c"\)/gi,
    '(under all similar conditions including σ)',
  )
  t = t.replace(
    /\(under all similar conditions including\s+'σ'\)/gi,
    '(under all similar conditions including σ)',
  )

  t = t.replace(/\b([A-Za-z]+)\s+1s\s+(more|less|greater|smaller|higher|lower)\b/gi, '$1 is $2')
  t = t.replace(/\bGas\s+-\s+A\s+1s\b/gi, 'Gas – A is')
  t = t.replace(/\bGas\s+-\s+B\s+1s\b/gi, 'Gas – B is')

  t = t.replace(/\s{2,}/g, ' ').trim()

  return t
}
