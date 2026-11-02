/**
 * Pix2Text sidecar proxy — formula + text OCR via `p2t serve` (Docker or local Python).
 * Keys and models stay on the Pix2Text container; TestVantages only forwards images.
 */
import { PIX2TEXT } from './config.js'
import { normalizePix2TextResults } from '../src/utils/pix2textParse.js'

const DEFAULT_LOCAL_URL = 'http://127.0.0.1:8503'

/** @returns {{ enabled: boolean, baseUrl: string }} */
export function getPix2TextEnv() {
  const pref = PIX2TEXT.enabled
  if (pref === '0' || pref === 'false' || pref === 'off') {
    return { enabled: false, baseUrl: '' }
  }
  const explicit = PIX2TEXT.url.replace(/\/$/, '')
  const baseUrl = explicit || DEFAULT_LOCAL_URL
  return { enabled: true, baseUrl }
}

/** @param {string} baseUrl */
function pix2TextDocsUrl(baseUrl) {
  return `${baseUrl.replace(/\/$/, '')}/docs`
}

/** @param {string} baseUrl */
function pix2TextExtractUrl(baseUrl) {
  return `${baseUrl.replace(/\/$/, '')}/pix2text`
}

/**
 * @returns {Promise<{ configured: boolean, ready: boolean, enabled: boolean, url: string | null, message: string }>}
 */
export async function getPix2TextStatus() {
  const { enabled, baseUrl } = getPix2TextEnv()
  if (!enabled) {
    return {
      configured: false,
      ready: false,
      enabled: false,
      url: null,
      message:
        'Pix2Text is off. Set PIX2TEXT_ENABLED=auto (default) and run `p2t serve -p 8503` or Docker pix2text service.',
    }
  }
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 3500)
    const res = await fetch(pix2TextDocsUrl(baseUrl), { signal: ctrl.signal })
    clearTimeout(timer)
    if (res.ok) {
      return {
        configured: true,
        ready: true,
        enabled: true,
        url: baseUrl,
        message: `Pix2Text ready (${baseUrl}). Used for math-heavy uploads when cloud AI is empty or weak.`,
      }
    }
    return {
      configured: true,
      ready: false,
      enabled: true,
      url: baseUrl,
      message: `Pix2Text not responding at ${baseUrl}. Start: docker compose up pix2text -d OR p2t serve -p 8503`,
    }
  } catch {
    return {
      configured: true,
      ready: false,
      enabled: true,
      url: baseUrl,
      message: `Pix2Text not running at ${baseUrl}. Local: p2t serve -p 8503 · Production: deploy/docker-compose pix2text service.`,
    }
  }
}

/**
 * @param {unknown} results
 * @returns {string}
 */
export { normalizePix2TextResults } from '../src/utils/pix2textParse.js'

/**
 * @param {{ imageBase64: string, mimeType?: string, fileType?: string }} body
 */
export async function extractWithPix2Text(body) {
  const status = await getPix2TextStatus()
  if (!status.enabled) {
    const err = new Error(status.message)
    err.code = 'PIX2TEXT_DISABLED'
    throw err
  }
  if (!status.ready) {
    const err = new Error(status.message)
    err.code = 'PIX2TEXT_NOT_READY'
    throw err
  }

  const { baseUrl } = getPix2TextEnv()
  const b64 = String(body.imageBase64 ?? '').replace(/^data:[^;]+;base64,/, '')
  if (!b64 || b64.length < 80) throw new Error('imageBase64 is required')

  const buf = Buffer.from(b64, 'base64')
  const mime = body.mimeType && body.mimeType.startsWith('image/') ? body.mimeType : 'image/png'
  const form = new FormData()
  form.append('image', new Blob([buf], { type: mime }), 'upload.png')
  form.append('file_type', String(body.fileType ?? 'page'))
  form.append('resized_shape', '768')
  form.append('embed_sep', ' $,$ ')
  form.append('isolated_sep', '$$\n, \n$$')

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), PIX2TEXT.timeoutMs)

  let res
  try {
    res = await fetch(pix2TextExtractUrl(baseUrl), {
      method: 'POST',
      body: form,
      signal: ctrl.signal,
    })
  } catch (e) {
    const err = new Error(
      e?.name === 'AbortError'
        ? `Pix2Text timed out after ${Math.round(PIX2TEXT.timeoutMs / 1000)}s`
        : `Pix2Text network error: ${e instanceof Error ? e.message : e}`,
    )
    err.code = e?.name === 'AbortError' ? 'PIX2TEXT_TIMEOUT' : 'PIX2TEXT_NETWORK'
    throw err
  } finally {
    clearTimeout(timer)
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data?.detail || data?.error || data?.message || `Pix2Text HTTP ${res.status}`
    const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
    err.code = res.status === 503 ? 'PIX2TEXT_NOT_READY' : 'PIX2TEXT_EXTRACT_FAILED'
    err.status = res.status
    throw err
  }

  const text = normalizePix2TextResults(data?.results)
  if (!text) {
    const err = new Error('Pix2Text returned empty text')
    err.code = 'PIX2TEXT_EMPTY'
    throw err
  }

  return {
    ok: true,
    engine: 'pix2text',
    text,
    raw: data,
    url: baseUrl,
  }
}
