/**
 * Fill a missing solution from a Mathpix scan or pasted Word/LaTeX.
 * Uses the Official PYQ Mathpix reader, the shared cleaner, and the red-banner quality check.
 * Does not invent text that was not in the scan or the paste.
 */
import { cleanMathpixCardText, preCleanMathpixOcr } from './mathpixCleanPipeline.js'
import { recognizeWithMathpix } from './mathpixOcr.js'
import { localOfficialPyqQualityCheck } from './officialPyqLocalQuality.js'
import { officialPyqContentReviewMessages } from './officialPyqReviewFlags.js'

/**
 * Clean pasted or scanned text, then run the same local quality check as the red banner.
 * A failed check is not marked passed.
 * @param {string} raw
 */
export function prepareAndCheckSolution(raw) {
  const source = String(raw ?? '')
  const prepared = preCleanMathpixOcr(source).trim()
  const formatted = cleanMathpixCardText(prepared).trim()
  // The card cleaner peels a printed answer off a question stem. A solution is
  // allowed to end with the result, so an empty peel keeps the scanned text.
  const cleaned = formatted || prepared
  if (!cleaned) {
    return {
      passed: false,
      text: '',
      errors: ['No solution text was found. Nothing was added.'],
    }
  }
  const card = { text: cleaned, options: [] }
  let quality = null
  try {
    quality = localOfficialPyqQualityCheck({
      questions: [card],
      preparedText: source,
    })
  } catch (err) {
    return {
      passed: false,
      text: cleaned,
      errors: [
        err instanceof Error
          ? err.message
          : 'Quality check could not run. The solution was not marked passed.',
      ],
    }
  }
  const messages = officialPyqContentReviewMessages([card])
  const failed = Array.isArray(quality?.failedGoTo) ? quality.failedGoTo : []
  const passed = quality?.passed === true && failed.length === 0 && messages.length === 0
  /** @type {string[]} */
  const errors = []
  if (!passed) {
    errors.push('Quality checked by local AI — not passed.')
    if (failed.length) errors.push('Go to Q ' + failed.join(', ') + '.')
    errors.push(...messages)
  }
  return { passed, text: cleaned, errors, quality }
}

/**
 * Mathpix read of one image or PDF, then the shared cleaner and quality check.
 * If Mathpix is not configured, this throws before a scan is sent.
 * @param {Blob | File} file
 * @param {(pct: number) => void} [onProgress]
 */
export async function readSolutionScan(file, onProgress) {
  const scanned = await recognizeWithMathpix(file, onProgress, { format: 'latex' })
  const checked = prepareAndCheckSolution(scanned)
  return { ...checked, scanned }
}
