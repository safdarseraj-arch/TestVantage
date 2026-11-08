/**
 * Standing quality laws for EVERY TestVantages upload — Question Bank Convert,
 * Official PYQ, Word/PDF/JSON/CSV, Mathpix split. Not a per-paper or PYQ-only patch.
 *
 * 1. Never show raw TeX as code (item, itemize, aligned leftovers, bare log/frac).
 * 2. Match-the-column needs both lists; restore List-I from OCR; block publish/approve if still missing.
 * 3. Never drop Mathpix figures (includegraphics / cdn.mathpix.com).
 * 4. Match lists two-column; options A-D unglued; aligned math is a display block.
 * 5. Incomplete-math = unclosed braces / cut OCR only — never a closed frac{5}{4}.
 * 6. Drop instruction-tail extra cards; never drop a real question.
 * 7. Never split one question into two; never merge two questions into one.
 *
 * Call applyUploadQualityGuards(questions, sourceOcr) after any parse that builds cards.
 * persistQuestionForBank uses healUploadQuestionCard (no drop) so a 1550-question bank is not trimmed.
 */
import {
  applyUploadQualityGuards as applyBaseGuards,
  applyOfficialPyqQualityGuards as applyOfficialBase,
  lightRepairOfficialPyqQuestions as lightRepairBase,
  healUploadQuestionCard as healBaseCard,
  matchQuestionMissingListI,
  ocrQuestionBodyForCard,
} from './extendTruncatedStem.js'
import { unwrapReactionStepTables } from './latexTabularDisplay.js'
import { enrichMatchListsFromOcr } from './restoreMatchListsOcr.js'
import { isMatrixGridCard } from './matrixGridPyq.js'
import { repairScanStructureCodes } from './smilesDisplay.js'
import { restoreStructureLabels } from './structureLabels.js'
import {
  missingBracketedGivenLine,
  restoreMissingGivenLine,
  restoreDisplayCloseBeforeInline,
  restoreScanMathBreaks,
  restoreGluedMatchOptionSpacing,
  restoreClosedOptionFraction,
  gluedMatchLettersRemain,
} from './mathpixCleanPipeline.js'
import { labelNumberedQuestions } from './numberedQuestionMarkers.js'

export { matchQuestionMissingListI }

/** A scan numbered "12." reads as "Q. 12", so a card's scan window stops at the next question. */
function scanOf(source) {
  return typeof source === 'string' ? labelNumberedQuestions(source) : source
}

/** This question's scan slice. Falls back to a literal sentence the scan still has. */
export function questionScanWindow(stem, rawSource) {
  const source = scanOf(rawSource)
  const src = String(source ?? '')
  const direct = ocrQuestionBodyForCard(stem, source)
  const stemText = String(stem ?? '')
  if (direct && (!/\\mathbb/.test(stemText) || /\\mathbb/.test(direct))) return direct
  const parts = stemText.split(/\\[a-zA-Z]+|\$+/)
  let bestAt = -1
  let bestLen = 0
  for (const part of parts) {
    const bit = part.replace(/\s+/g, ' ').trim()
    if (bit.length < 24) continue
    const needle = bit.slice(0, 48)
    const at = src.toLowerCase().indexOf(needle.toLowerCase())
    if (at >= 0 && needle.length > bestLen) {
      bestAt = at
      bestLen = needle.length
    }
  }
  if (bestAt >= 0) {
    const slice = src.slice(Math.max(0, bestAt - 700), bestAt + 1800)
    const cut = slice.search(/\n\s*(?:\\item\s*\[\s*Q\.?\s*\]\s*\$?\s*\d|Q\.\s*\d+)/)
    return cut > 80 ? slice.slice(0, cut) : slice
  }
  const head = stemText.split('$')[0].replace(/\s+/g, ' ').trim()
  if (head.length < 20) return direct || ''
  const at = src.toLowerCase().indexOf(head.toLowerCase())
  if (at < 0) return direct || ''
  const slice = src.slice(at, at + 2400)
  const cut = slice.search(/\n\s*(?:\\item\s*\[\s*Q\.?\s*\]\s*\$?\s*\d|Q\.\s*\d+)/)
  return cut > 80 ? slice.slice(0, cut) : slice
}

/** Option rows sit after List-II. The stem window often stops before them. */
function optionRowsWindow(stem, rawSource) {
  const source = scanOf(rawSource)
  const src = String(source ?? '')
  const stemWindow = questionScanWindow(stem, source)
  const plain = String(stem ?? '')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$]*\$/g, ' ')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  let at = -1
  for (let i = 0; i < plain.length - 24 && at < 0; i += 12) {
    const chunk = plain.slice(i, i + 32)
    at = src.toLowerCase().indexOf(chunk.toLowerCase())
  }
  if (at < 0 && stemWindow) {
    const bit = stemWindow.replace(/\s+/g, ' ').trim().slice(0, 40)
    at = bit.length >= 20 ? src.indexOf(bit.slice(0, 32)) : -1
  }
  if (at < 0) return stemWindow
  const slice = src.slice(at, at + 4000)
  const cut = slice.search(/\n\s*\\item\s*\[\s*Q\.?\s*\]\s*\$?\s*\d/)
  const extended = (cut > 40 ? slice.slice(0, cut) : slice).trim()
  return extended.length > stemWindow.length ? extended : stemWindow
}

/** A short label such as "Configuration I" still starts this question's scan. */
function mathBreakWindow(stem, rawSource) {
  const optionWindow = optionRowsWindow(stem, rawSource)
  if (optionWindow) return optionWindow
  const src = String(scanOf(rawSource) ?? '')
  const head = String(stem ?? '').split('$')[0].replace(/\s+/g, ' ').trim().slice(0, 48)
  if (head.length < 8) return ''
  const at = src.indexOf(head)
  if (at < 0) return ''
  const slice = src.slice(at, at + 4000)
  const cut = slice.search(/\n\s*\\item\s*\[\s*Q\.?\s*\]\s*\$?\s*\d/)
  return (cut > 40 ? slice.slice(0, cut) : slice).trim()
}

/**
 * Copy a dropped [Given: ...] line and a glued match-letter space from the scan.
 * Returns the same card when the scan has nothing to copy.
 * @param {object} q
 * @param {unknown} source
 */
export function applyStoredOcrCardFixes(q, source) {
  if (isMatrixGridCard(q)) return q
  const window = questionScanWindow(q?.text, source)
  const optionWindow = optionRowsWindow(q?.text, source)
  const scanText = repairScanStructureCodes(
    unwrapReactionStepTables(
      restoreScanMathBreaks(
        restoreDisplayCloseBeforeInline(restoreMissingGivenLine(q?.text ?? '', window), window),
        mathBreakWindow(q?.text, source),
      ),
    ),
  )
  const restoredOptions = restoreClosedOptionFraction(
    restoreGluedMatchOptionSpacing(q?.options, optionWindow),
    optionWindow || mathBreakWindow(q?.text, source),
  )
  const options = Array.isArray(restoredOptions)
    ? restoredOptions.map((opt) => repairScanStructureCodes(opt))
    : restoredOptions
  const text = restoreStructureLabels({ text: scanText, options }).text
  const sameText = text === String(q?.text ?? '')
  const sameOpts = options === q?.options || JSON.stringify(options) === JSON.stringify(q?.options ?? [])
  if (sameText && sameOpts) return q
  return { ...q, text, options }
}

/** The scan still has a Given line or a separated match letter that the card dropped. */
export function storedCardMissesOcrFix(q, source) {
  const window = questionScanWindow(q?.text, source)
  const optionWindow = optionRowsWindow(q?.text, source)
  return (
    Boolean(missingBracketedGivenLine(q?.text, window)) ||
    gluedMatchLettersRemain(q?.options, optionWindow)
  )
}

export function healUploadQuestionCard(q, rawSource, map) {
  const source = scanOf(rawSource)
  return applyStoredOcrCardFixes(
    enrichMatchListsFromOcr(healBaseCard(q, source, map), source),
    source,
  )
}

export function applyUploadQualityGuards(questions, rawSource, map) {
  const source = scanOf(rawSource)
  return applyBaseGuards(questions, source, map).map((q) => enrichMatchListsFromOcr(q, source))
}

export function applyOfficialPyqQualityGuards(questions, rawSource, map) {
  const source = scanOf(rawSource)
  return applyOfficialBase(questions, source, map).map((q) => enrichMatchListsFromOcr(q, source))
}

export function lightRepairOfficialPyqQuestions(questions, rawSource) {
  const source = scanOf(rawSource)
  return lightRepairBase(questions, source).map((q) => enrichMatchListsFromOcr(q, source))
}
