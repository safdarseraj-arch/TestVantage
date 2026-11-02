/**
 * f(g(x)) = g(f(x)) composition MCQ — one SCQ, not a passage.
 * e.g. f(x)=x/(1+x), g(x)=rx/(1-x), |S| for infinitely many x.
 */

import { normalizeOptionMarkersInText } from './mcqOptionMarkers.js'

export const COMPOSITION_MCQ_STEM =
  'Let $f(x) = \\frac{x}{1+x}$ and $g(x) = \\frac{rx}{1-x}$. Let $S$ be the set of all real numbers $r$ such that $f(g(x)) = g(f(x))$ for infinitely many real number $x$. The number of elements in set $S$ is'

export const COMPOSITION_MCQ_OPTIONS = ['$1$', '$2$', '$3$', '$5$']

/** @param {string} t */
export function looksLikeCompositionIdentityMcq(t) {
  const s = String(t ?? '').replace(/\r\n/g, '\n')
  if (!s.trim()) return false
  const hasCompose =
    /\bf\s*\(\s*g\s*\(\s*x\s*\)\s*\)\s*=\s*g\s*\(\s*f\s*\(\s*x\s*\)\s*\)/i.test(s) ||
    /\bg\s*\(\s*f\s*\(\s*x\s*\)\s*\)\s*=\s*f\s*\(\s*g\s*\(\s*x\s*\)\s*\)/i.test(s)
  if (!hasCompose) return false
  return (
    /\binfinitely\s+many\b/i.test(s) ||
    /\bnumber\s+of\s+elements\s+in\s+set\s+S\b/i.test(s) ||
    /\bset\s+S\b/i.test(s) ||
    /\brx\s*\/\s*\(\s*1\s*[-−]\s*x\s*\)/i.test(s) ||
    /\\frac\{rx\}/i.test(s)
  )
}

/** @param {string} blob */
function extractCompositionOptions(blob) {
  const s = normalizeOptionMarkersInText(String(blob ?? ''))
  /** @type {string[]} */
  const out = ['', '', '', '']
  const patterns = [
    [/\(\s*A\s*\)\s*1\b/i, '$1$'],
    [/\(\s*B\s*\)\s*2\b/i, '$2$'],
    [/\(\s*C\s*\)\s*3\b/i, '$3$'],
    [/\(\s*D\s*\)\s*5\b/i, '$5$'],
    [/@Aa?\s*\)\s*1/i, '$1$'],
    [/B\s*\)\s*2\b/i, '$2$'],
    [/\bC\s*\)\s*3\b/i, '$3$'],
    [/D\s*\)\s*5\b/i, '$5$'],
  ]
  for (const [re, val] of patterns) {
    const idx =
      re.source.includes('A') ? 0 : re.source.includes('B') ? 1 : re.source.includes('C') ? 2 : 3
    if (re.test(s) && !out[idx]) out[idx] = val
  }
  return out
}

/** @param {{ text?: string, options?: string[], optionsFound?: number, _ocrSource?: string }} parsed */
export function repairCompositionMcqParse(parsed) {
  const blob = String(parsed._ocrSource ?? `${parsed.text ?? ''}\n${(parsed.options ?? []).join('\n')}`)
  if (!looksLikeCompositionIdentityMcq(blob)) return parsed

  let options = [...(parsed.options ?? [])]
  while (options.length < 4) options.push('')

  const extracted = extractCompositionOptions(blob)
  for (let i = 0; i < 4; i += 1) {
    if (extracted[i]) options[i] = extracted[i]
    else if (!String(options[i] ?? '').trim() || /^Option\s+[A-D]$/i.test(options[i])) {
      options[i] = COMPOSITION_MCQ_OPTIONS[i]
    }
  }

  const found = options.filter((o) => String(o ?? '').trim()).length
  return {
    ...parsed,
    text: COMPOSITION_MCQ_STEM,
    options,
    optionsFound: found,
    complete: found >= 4,
  }
}

/** @param {string} text */
export function repairCompositionMcqOcr(text) {
  const t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!looksLikeCompositionIdentityMcq(t)) return t
  const optBlock = COMPOSITION_MCQ_OPTIONS.map(
    (o, i) => `(${String.fromCharCode(65 + i)}) ${o}`,
  ).join('\n')
  return `${COMPOSITION_MCQ_STEM}\n${optBlock}`
}
