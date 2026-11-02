/**
 * Post-parse upload quality — when to run a second local LaTeX OCR pass.
 */

import { countRealMcqOptions } from './stemDiagramDetect.js'
import { pageNeedsOnnxBoost } from './hybridOcrNeeds.js'
import { scoreOcrCandidate } from './pickBestOcrCandidate.js'
import { countUploadBlockingIssues, uploadNeedsReview } from './uploadStatus.js'
import { applyMcqParseRepairs } from './repairRegistry.js'

const STEM_GARBLE_RE =
  /\bLeen|x\^\\circ|gfl\s*\(|jlasamea|R>R|">\+|\\lambda\)|\\\\text\{begin\}|\\\\backslash\\text/i

/**
 * @param {{
 *   quality?: { confidence?: number, readyToSave?: boolean, issues?: { severity?: string }[] } | null
 *   escalation?: { needsAgentRepair?: boolean } | null
 *   stem?: string
 *   options?: string[]
 *   rawOcr?: string
 *   found?: number
 * }} ctx
 */
export function shouldBoostUploadAfterParse(ctx = {}) {
  const quality = ctx.quality
  const escalation = ctx.escalation
  const stem = String(ctx.stem ?? '').trim()
  const options = ctx.options ?? []
  const rawOcr = String(ctx.rawOcr ?? '').trim()
  const found = ctx.found ?? countRealMcqOptions(stem, options)
  const conf = quality?.confidence ?? 0
  const display = `${stem}\n${options.join('\n')}`

  if (uploadNeedsReview(quality, escalation) && conf < 78) return true
  if (found < 4) return true
  if (countUploadBlockingIssues(quality) > 0) return true
  if (STEM_GARBLE_RE.test(display)) return true
  if (pageNeedsOnnxBoost(rawOcr) || pageNeedsOnnxBoost(stem)) return true
  if (scoreOcrCandidate(rawOcr, { source: 'hybrid:merged' }) < 52) return true
  return false
}

/**
 * Score boosted OCR by quick parse (options found + OCR score).
 * @param {string} text
 */
export function scoreBoostCandidate(text) {
  const raw = String(text ?? '').trim()
  if (!raw) return { found: 0, score: 0, text: '' }
  const repaired = applyMcqParseRepairs(
    { text: raw, options: ['', '', '', ''], optionsFound: 0, complete: false },
    raw,
    { passes: 1 },
  )
  const found = countRealMcqOptions(repaired.text, repaired.options)
  const score = scoreOcrCandidate(raw, { source: 'hybrid:merged' }) + found * 6
  return { found, score, text: raw }
}

/**
 * Pick better parse outcome after quality boost.
 * @param {{ found?: number, score?: number, text?: string }} a
 * @param {{ found?: number, score?: number, text?: string }} b
 */
export function pickBetterOcrText(a, b) {
  const aStats = a.score != null && a.found != null ? a : scoreBoostCandidate(a.text ?? '')
  const bStats = b.score != null && b.found != null ? b : scoreBoostCandidate(b.text ?? '')
  if (bStats.found > aStats.found) return bStats.text ?? b.text ?? ''
  if (aStats.found > bStats.found) return aStats.text ?? a.text ?? ''
  return bStats.score > aStats.score + 4 ? bStats.text ?? b.text ?? '' : aStats.text ?? a.text ?? ''
}
