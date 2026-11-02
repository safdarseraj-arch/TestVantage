import { closedChemReactionDisplays, finishedMathReviewView, hasUnclosedDisplayMath } from './healTruncatedLatex.js'
import { prepareTextForMathTextDisplay, commandLeftOutsideMathSegments } from './prepareMathForRender.js'
import { stripSheetConfigHtml } from './latexTabularDisplay.js'

const CHECKER_NOTE =
  /Raw LaTeX is still showing|Not inventing|Math looks cut off|Extraction incomplete|missing List-[I]{1,2}/i

/**
 * Commands that still show as source after the display step.
 * Commands inside a balanced $...$ or a real table are not source text.
 * @param {unknown} text
 * @returns {string[]}
 */
export function visibleLatexSourceHits(text) {
  const raw = String(text ?? '')
  if (!raw.trim()) return []
  const hits = []
  if (CHECKER_NOTE.test(raw)) hits.push('checker-note')
  if (/!\]\s*\[\s*\(|!\[\s*\]\s*\(\s*\)/.test(raw)) hits.push('empty-image')
  const viewed = finishedMathReviewView(raw)
  let shown = viewed
  try {
    shown = prepareTextForMathTextDisplay(viewed)
  } catch {
    shown = viewed
  }
  shown = stripSheetConfigHtml(shown)
  if (/\\(?:multirow|multicolumn)\b/.test(shown) || /\\begin\{tabular\}/i.test(shown)) {
    hits.push('table-command')
  }
  const chem = closedChemReactionDisplays(shown) || closedChemReactionDisplays(raw)
  const scan = hasUnclosedDisplayMath(viewed) ? shown : viewed
  if (!chem && hasUnclosedDisplayMath(scan)) hits.push('dangling-dollars')
  const visible = scan
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$\n]*\$/g, ' ')
    .replace(/\\begin\{(?:tabular|array)\}[\s\S]*?\\end\{(?:tabular|array)\}/gi, ' ')
  if (!chem && /\\(?:xrightarrow|mathbf|mathrm|mathbb|frac|epsilon|begin|end|in)\b/.test(visible)) hits.push('raw-command')
  if (!chem && commandLeftOutsideMathSegments(scan) && !hits.includes('raw-command')) hits.push('raw-command')
  if (!chem && /\$\$/.test(visible)) hits.push('stray-dollars')
  return hits
}

/**
 * @param {object} q
 */
export function questionHasVisibleLatexSource(q) {
  const parts = [
    q?.text,
    q?.stem,
    q?.passageText,
    ...(Array.isArray(q?.options) ? q.options : []),
  ]
  return parts.some((part) => visibleLatexSourceHits(part).length > 0)
}
