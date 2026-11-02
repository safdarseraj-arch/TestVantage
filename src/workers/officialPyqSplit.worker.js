/**
 * Off-main-thread Mathpix question split for Official PYQ re-parse.
 * Keeps Re-parse / Next / tabs clickable during large JEE Advanced OCR splits.
 */

import { paperItemsFromMathpixOcr } from '../utils/mathpixQuestionSplit.js'

self.onmessage = (event) => {
  const { type, requestId, ocr, paperMeta } = event.data ?? {}
  try {
    if (type === 'split') {
      const items = paperItemsFromMathpixOcr(String(ocr ?? ''), { paperMeta: paperMeta ?? {} })
      self.postMessage({ type: 'result', requestId, items })
      return
    }
    self.postMessage({ type: 'error', requestId, message: `Unknown worker message: ${type}` })
  } catch (err) {
    self.postMessage({
      type: 'error',
      requestId,
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

export default {}
