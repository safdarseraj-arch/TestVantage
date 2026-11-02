/**
 * Browser client for Pix2Text sidecar (proxied via /api/pix2text/*).
 */
import { API_BASE } from '../config/platform.js'
import { blobToVisionPayload } from './cloudVisionClient.js'
import { looksLikeComplexFormulaQuestion, normalizePix2TextResults } from './pix2textParse.js'
import { processMcqUploadExtract } from './uploadPipeline.js'
import { scoreLocalOcrWeakness } from './cloudVisionParse.js'

/** @type {{ configured: boolean, ready: boolean, enabled: boolean, url: string | null, message: string, checkedAt: number } | null} */
let statusCache = null
const STATUS_TTL_MS = 45_000

export function clearPix2TextStatusCache() {
  statusCache = null
}

/**
 * @param {{ force?: boolean }} [opts]
 */
export async function fetchPix2TextStatus(opts = {}) {
  if (!opts.force && statusCache && Date.now() - statusCache.checkedAt < STATUS_TTL_MS) {
    return statusCache
  }
  try {
    const res = await fetch(`${API_BASE}/pix2text/status`, {
      signal: AbortSignal.timeout(4500),
    })
    if (!res.ok) {
      statusCache = {
        configured: false,
        ready: false,
        enabled: false,
        url: null,
        message: 'Pix2Text API not reachable — start p2t serve or Docker pix2text service.',
        checkedAt: Date.now(),
      }
      return statusCache
    }
    const data = await res.json()
    statusCache = {
      configured: !!data.configured,
      ready: data.ready !== false && !!data.configured,
      enabled: data.enabled !== false,
      url: data.url ?? null,
      message: String(data.message ?? ''),
      checkedAt: Date.now(),
    }
    return statusCache
  } catch {
    statusCache = {
      configured: false,
      ready: false,
      enabled: false,
      url: null,
      message:
        'Pix2Text status check failed — API server running? Keep bottom panel open and press F5.',
      checkedAt: Date.now(),
    }
    return statusCache
  }
}

/**
 * Whether Pix2Text is worth calling (sidecar may still be down).
 * @param {Parameters<typeof shouldAttemptPix2Text>[0]} ctx
 */
export function pix2TextWouldHelp(ctx = {}) {
  if (ctx.settings?.usePix2Text === false) return false
  if (!ctx.cloudAttempted) return true
  if (!ctx.cloudSucceeded) return true
  const weak = Number(ctx.cloudWeak)
  if (Number.isFinite(weak) && weak >= 45) return true
  if (ctx.cloudLowConfidence) return true
  if (ctx.complexMath) return true
  if (looksLikeComplexFormulaQuestion(ctx.cloudText)) return true
  if (ctx.cloudCandidate) return true
  return false
}

/**
 * When to call Pix2Text during Convert (after Gemini attempt, before local OCR).
 * Prefer Pix2Text for low-confidence / nested-formula questions (Grok routing).
 * @param {{
 *   settings?: { usePix2Text?: boolean }
 *   pix2Ready?: boolean
 *   cloudAttempted?: boolean
 *   cloudSucceeded?: boolean
 *   cloudWeak?: number
 *   cloudLowConfidence?: boolean
 *   complexMath?: boolean
 *   cloudText?: string
 *   cloudCandidate?: unknown
 * }} ctx
 */
export function shouldAttemptPix2Text(ctx = {}) {
  if (!ctx.pix2Ready) return false
  return pix2TextWouldHelp(ctx)
}

/**
 * @param {Blob | File} file
 * @param {{ signal?: AbortSignal }} [opts]
 */
export async function extractWithPix2TextClient(file, opts = {}) {
  const status = await fetchPix2TextStatus()
  if (!status.enabled || !status.ready) {
    const err = new Error(status.message)
    err.code = 'PIX2TEXT_NOT_READY'
    throw err
  }

  const { imageBase64, mimeType } = await blobToVisionPayload(file)
  const res = await fetch(`${API_BASE}/pix2text/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, mimeType, fileType: 'page' }),
    signal: opts.signal,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || `Pix2Text extract failed (${res.status})`)
    err.code = data.code || 'PIX2TEXT_EXTRACT_FAILED'
    throw err
  }

  const text = normalizePix2TextResults(data.text ?? data.raw?.results ?? data.raw)
  const extracted = processMcqUploadExtract(text, { engine: 'pix2text' })
  const weakness = scoreLocalOcrWeakness(text)

  return {
    text,
    parsed: extracted.parsed,
    engine: 'pix2text',
    ocrWeakness: weakness,
    lowConfidence: weakness >= 55,
    valid: (extracted.parsed?.optionsFound ?? 0) >= 2 && !!String(extracted.parsed?.text ?? '').trim(),
  }
}
