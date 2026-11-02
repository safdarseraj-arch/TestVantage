/**
 * Combined OCR stack status (Gemini + Pix2Text + local) for admin UI.
 */
import { API_BASE } from '../config/platform.js'
import { fetchCloudVisionStatus } from './cloudVisionClient.js'
import { fetchPix2TextStatus } from './pix2textClient.js'
import { formatOcrStackStatusMessage, GROK_HYBRID_STACK_LAYERS } from './hybridStackExtract.js'

export { GROK_HYBRID_STACK_LAYERS }

/**
 * @param {{ force?: boolean }} [opts]
 */
export async function fetchOcrStackStatus(opts = {}) {
  const [vision, pix2text] = await Promise.all([
    fetchCloudVisionStatus(opts),
    fetchPix2TextStatus(opts),
  ])
  return {
    layers: GROK_HYBRID_STACK_LAYERS,
    vision,
    pix2text,
    localHybrid: { ready: true, message: 'Browser Tesseract + ONNX (always available)' },
    summary: formatOcrStackStatusMessage({ vision, pix2text }),
    readyForMathUpload: vision.ready || pix2text.ready,
  }
}

/**
 * Server-side combined status (for /api/ocr/stack-status).
 */
export async function fetchOcrStackStatusFromApi(opts = {}) {
  try {
    const res = await fetch(`${API_BASE}/ocr/stack-status`, {
      signal: AbortSignal.timeout(5000),
      cache: opts.force ? 'no-store' : 'default',
    })
    if (!res.ok) return fetchOcrStackStatus(opts)
    return res.json()
  } catch {
    return fetchOcrStackStatus(opts)
  }
}
