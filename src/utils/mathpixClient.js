/**
 * Browser client for Mathpix OCR (proxied via /api/mathpix/*).
 * Never reads API secrets - keys live on the API server only.
 */
import { API_BASE } from '../config/platform.js'
import { loadOcrOutputFormat } from './ocrOutputFormat.js'

const STATUS_TTL_MS = 30_000

/** @type {{ configured: boolean, ready: boolean, message: string, checkedAt: number } | null} */
let statusCache = null

export function clearMathpixStatusCache() {
  statusCache = null
}

export const MATHPIX_MISSING_MESSAGE =
  'Mathpix keys were not loaded from onlinetest/.env. Keep the bottom panel open (Ctrl+J then Ctrl+`), then press F5 so port 3001 re-reads the file. Local AI and Gemini do not read PDF/image/handwriting — only Mathpix does.'

/**
 * @param {{ force?: boolean }} [opts]
 */
export async function fetchMathpixStatus(opts = {}) {
  if (!opts.force && statusCache && Date.now() - statusCache.checkedAt < STATUS_TTL_MS) {
    return statusCache
  }
  try {
    const res = await fetch(`${API_BASE}/mathpix/status`, {
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) {
      statusCache = {
        configured: false,
        ready: false,
        reachable: false,
        message:
          'Could not reach the API on port 3001. Keep the bottom panel open (Ctrl+J then Ctrl+`), then press F5.',
        checkedAt: Date.now(),
      }
      return statusCache
    }
    const data = await res.json()
    statusCache = {
      configured: !!data.configured,
      ready: data.ready !== false && !!data.configured,
      reachable: true,
      message: String(data.message ?? MATHPIX_MISSING_MESSAGE),
      checkedAt: Date.now(),
    }
    return statusCache
  } catch {
    statusCache = {
      configured: false,
      ready: false,
      reachable: false,
      message:
        'Could not reach the API on port 3001. Keep the bottom panel open (Ctrl+J then Ctrl+`), then press F5.',
      checkedAt: Date.now(),
    }
    return statusCache
  }
}

/**
 * @param {Blob | File} file
 * @returns {Promise<{ base64: string, mimeType: string, fileName: string }>}
 */
export async function blobToMathpixPayload(file) {
  const blob = file instanceof Blob ? file : new Blob([file])
  const buf = await blob.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  const base64 = btoa(binary)
  const fileName = file.name || 'upload'
  const mimeType =
    file.type ||
    (/\.pdf$/i.test(fileName)
      ? 'application/pdf'
      : /\.png$/i.test(fileName)
        ? 'image/png'
        : 'image/jpeg')
  return { base64, mimeType, fileName }
}

/**
 * Send a file to server-side Mathpix. format: latex (default) or word (mmd/docx).
 * @param {Blob | File} file
 * @param {{
 *   format?: 'latex' | 'word'
 *   signal?: AbortSignal
 *   onProgress?: (pct: number) => void
 * }} [opts]
 */
export async function extractWithMathpixClient(file, opts = {}) {
  const status = await fetchMathpixStatus()
  if (!status.configured) {
    const err = new Error(status.message || MATHPIX_MISSING_MESSAGE)
    err.code = 'MATHPIX_NOT_CONFIGURED'
    throw err
  }
  const format = opts.format === 'word' || opts.format === 'latex'
    ? opts.format
    : loadOcrOutputFormat()
  opts.onProgress?.(8)
  const { base64, mimeType, fileName } = await blobToMathpixPayload(file)
  opts.onProgress?.(18)
  const isPdf = mimeType.includes('pdf') || /\.pdf$/i.test(fileName)
  const body = {
    format,
    mimeType,
    fileName,
    ...(isPdf ? { pdfBase64: base64 } : { imageBase64: base64 }),
  }
  let heartbeat = null
  let pct = 22
  heartbeat = setInterval(() => {
    pct = Math.min(82, pct + 3)
    opts.onProgress?.(pct)
  }, 1200)
  const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : 5 * 60_000 + 20_000
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  const onParent = () => ctl.abort()
  if (opts.signal) {
    if (opts.signal.aborted) ctl.abort()
    else opts.signal.addEventListener('abort', onParent, { once: true })
  }
  try {
    const res = await fetch(`${API_BASE}/mathpix/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
      signal: ctl.signal,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = new Error(data.error || `Mathpix OCR failed (${res.status})`)
      err.code = data.code || 'MATHPIX_EXTRACT_FAILED'
      err.status = res.status
      throw err
    }
    const text = String(data.text ?? '').trim()
    if (!text) {
      const err = new Error('Mathpix returned empty text. Try a clearer scan or crop to one page.')
      err.code = 'MATHPIX_EMPTY'
      throw err
    }
    opts.onProgress?.(100)
    return {
      text,
      engine: 'mathpix',
      format: data.format === 'word' ? 'word' : 'latex',
      docxBase64: String(data.docxBase64 ?? ''),
      source: String(data.source ?? ''),
    }
  } catch (err) {
    if (err?.name === 'AbortError' || opts.signal?.aborted || ctl.signal.aborted) {
      const timed = new Error(
        'Mathpix OCR timed out. Keep the bottom panel open (Ctrl+J then Ctrl+`), press F5, then try again.',
      )
      timed.code = 'MATHPIX_TIMEOUT'
      throw timed
    }
    throw err
  } finally {
    clearTimeout(timer)
    opts.signal?.removeEventListener('abort', onParent)
    if (heartbeat) clearInterval(heartbeat)
  }
}
