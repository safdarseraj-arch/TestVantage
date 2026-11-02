/**
 * Mathpix OCR browser helpers. Keys never leave the API server.
 * Prefer extractMcqFromImage / runMathpixThenGemini for uploads.
 */
import { extractWithMathpixClient, fetchMathpixStatus } from './mathpixClient.js'
import { normalizeMathText } from './normalizeMathText.js'
import { finalizeOcrText } from './inferMathFromPlainOcr.js'

/**
 * Mathpix Markdown delimiters to $...$ for MathText.
 * @param {string} text
 */
export function normalizeMathpixOutput(text) {
  if (!text?.trim()) return ''
  let out = text
    .replace(/\\\[/g, '\n$$')
    .replace(/\\\]/g, '$$\n')
    .replace(/\\\(/g, '$')
    .replace(/\\\)/g, '$')
  return normalizeMathText(out)
}

/** @param {string} text */
export function looksLikeLatex(text) {
  return /\\[a-zA-Z@*]+|\\\(|\\\[|\$\$?/.test(text ?? '')
}

/**
 * Mathpix via API server (image or PDF blob).
 * @param {Blob} imageBlob
 * @param {(pct: number) => void} [onProgress]
 * @param {{ signal?: AbortSignal, format?: 'latex' | 'word' }} [opts]
 */
export async function recognizeWithMathpix(imageBlob, onProgress, opts = {}) {
  const result = await extractWithMathpixClient(imageBlob, {
    onProgress,
    signal: opts.signal,
    format: opts.format,
  })
  const text = String(result.text ?? '').trim()
  if (!text) {
    throw new Error('Mathpix returned empty text. Try a clearer scan or crop to one page.')
  }
  return looksLikeLatex(text) ? normalizeMathpixOutput(text) : normalizeMathText(finalizeOcrText(text))
}

export async function convertImageToLatex(imageBlob, onProgress, opts = {}) {
  return recognizeWithMathpix(imageBlob, onProgress, opts)
}

/** Quick connectivity check - uses server keys, never browser VITE keys. */
export async function testMathpixConnection() {
  const status = await fetchMathpixStatus({ force: true })
  if (!status.configured) {
    throw new Error(status.message)
  }
  return 'Mathpix keys found on the API server.'
}
