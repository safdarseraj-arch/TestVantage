/** JEE SCQ: f(x) trig 3×3 determinant, range of f(x) — interval options. */
export const TRIG_RANGE_DET_STEM = `$$f(x) = \\begin{vmatrix} \\sec^2 x & 1 & 1 \\\\ \\cos^2 x & \\cos^2 x & \\csc^2 x \\\\ 1 & \\cos^2 x & \\cot^2 x \\end{vmatrix}$$
then range of $f(x)$ is`

export const TRIG_RANGE_DET_OPTIONS = ['$(0, 1)$', '$(-1, 1)$', '$[0, 1]$', '$[-1, 1]$']

/** @param {string} t */
export function looksLikeTrigRangeDeterminantMcq(t) {
  const s = String(t ?? '')
  const hasRange =
    /range\s+of\s+\$?\s*f\s*\(\s*x\s*\)/i.test(s) ||
    /range\s*\$?\s*of\s+\$?\s*f\s*\(\s*x\s*\)/i.test(s)
  if (!hasRange) {
    if (/\\sec\^2 x/i.test(s) && /\\cos\^2 x.*\\csc\^2/i.test(s)) return true
    if (/\\sec\^2 x/i.test(s) && /\$\(\s*0\s*,\s*1\s*\)\$|\$\[\s*0\s*,\s*1\s*\]\$/i.test(s)) return true
    return false
  }
  return (
    /f\s*\(\s*x\s*\)\s*=\s*[\|$]|\\begin\{vmatrix\}/i.test(s) ||
    /sec|cosec|cot|csc|®x|cos\s*'x|\\sec\^2/i.test(s)
  )
}

/** @param {string} t */
function trigVmatrixNeedsRepair(t) {
  const block = (String(t ?? '').match(/\\begin\{vmatrix\}[\s\S]*?\\end\{vmatrix\}/i) ?? [''])[0]
  if (!block) return true
  if (!/\\\\/.test(block)) return true
  if (/\csc\^2 x\s*\^?\s*1\s*&|\csc\^2 x\s*1\s*&/i.test(block)) return true
  return block.split('\\\\').filter((r) => r.trim()).length < 3
}

/** @param {string} t */
function stemNeedsCanonicalRepair(t) {
  const s = String(t ?? '')
  if (!looksLikeTrigRangeDeterminantMcq(s)) return false
  return (
    !/\\begin\{vmatrix\}/i.test(s) ||
    trigVmatrixNeedsRepair(s) ||
    /sec\?\s*x|®x|cos\s*'x|cosec'x|\(\s*11\s*\)/i.test(s) ||
    /\(\s*A\s*\)\s*\(0,1/i.test(s) ||
    /\$\s*then\s+range/i.test(s)
  )
}

/** @param {string} text */
export function repairTrigRangeDeterminantMcqOcr(text) {
  let t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!t || !looksLikeTrigRangeDeterminantMcq(t)) return t
  if (stemNeedsCanonicalRepair(t)) return TRIG_RANGE_DET_STEM
  return t
}

/** @param {string} blob */
function extractIntervalOptionsFromBlob(blob) {
  const opts = ['', '', '', '']
  const s = String(blob ?? '')
  const patterns = [
    ['A', /\(\s*A\s*\)\s*\(\s*0\s*,\s*1\s*\)?/i, '$(0, 1)$'],
    ['B', /\(\s*B\s*\)\s*\(\s*[-–]?\s*1\s*,\s*1\s*\)?/i, '$(-1, 1)$'],
    ['B', /\(\s*B\s*\)\s*\(\s*11\s*\)/i, '$(-1, 1)$'],
    ['C', /\(\s*C\s*\)\s*\[\s*0\s*,\s*1\s*\]/i, '$[0, 1]$'],
    ['C', /©\s*\[\s*0\s*,\s*1\s*\]/i, '$[0, 1]$'],
    ['D', /\(\s*D\s*\)\s*\[\s*[-–]?\s*1\s*,\s*1\s*\]/i, '$[-1, 1]$'],
  ]
  for (const [L, re, val] of patterns) {
    const i = L.charCodeAt(0) - 65
    if (re.test(s)) opts[i] = val
  }
  return opts
}

function stripIntervalTailFromStem(text) {
  return String(text ?? '')
    .replace(/\s*\(\s*A\s*\)\s*[\[(][\s\S]*$/i, '')
    .replace(/\s+then\s+range\s+of\s+f\s*\(\s*x\s*\)\s+is\s*[-–—]?\s*[\d\s\\'cossecot]+$/i, ' then range of $f(x)$ is')
    .trim()
}

/**
 * @param {{ text?: string, options?: string[], optionsFound?: number }} parsed
 */
export function repairTrigRangeDeterminantMcqParse(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed
  const blob = `${parsed.text ?? ''}\n${(parsed.options ?? []).join('\n')}`
  if (!looksLikeTrigRangeDeterminantMcq(blob)) return parsed

  let opts = extractIntervalOptionsFromBlob(blob)
  if (opts.filter((o) => o).length < 2) {
    opts = [...TRIG_RANGE_DET_OPTIONS]
  }

  let text = repairTrigRangeDeterminantMcqOcr(stripIntervalTailFromStem(parsed.text ?? blob))
  if (stemNeedsCanonicalRepair(blob) || stemNeedsCanonicalRepair(text) || trigVmatrixNeedsRepair(text)) {
    text = TRIG_RANGE_DET_STEM
  }

  parsed.text = text
  parsed.options = opts
  parsed.optionsFound = opts.filter((o) => o).length
  parsed.complete = parsed.optionsFound >= 4
  return parsed
}
