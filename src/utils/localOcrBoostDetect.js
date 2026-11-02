/**
 * Lightweight local OCR boost detection (no Tesseract/ONNX imports — safe for unit tests).
 */

import { pageNeedsOnnxBoost } from './hybridOcrNeeds.js'
import { isLocalMathOcrEnabled, loadOcrSettings } from './ocrSettings.js'
import { scoreOcrCandidate } from './pickBestOcrCandidate.js'

/** Below this score, run aggressive local second pass during OCR. */
export const LOCAL_OCR_BOOST_MIN_SCORE = 52

/**
 * @param {string} text
 * @param {import('./ocrSettings.js').OcrSettings} [settings]
 */
export function shouldRunLocalOcrBoost(text, settings = loadOcrSettings()) {
  if (settings.localOcrQualityBoost === false) return false
  if (!isLocalMathOcrEnabled(settings)) return false
  const score = scoreOcrCandidate(text, { source: 'hybrid:merged' })
  const minScore = settings.fullScienceOcr ? 48 : LOCAL_OCR_BOOST_MIN_SCORE
  // Only second-pass when first pass scored poorly — do not re-run ONNX just because
  // the stem "needs math" (hybrid already boosted those pages).
  if (score >= minScore) return false
  // Very garbled / empty — worth a second pass
  if (score < minScore - 12) return true
  return pageNeedsOnnxBoost(text) && score < minScore
}
