/**
 * Browser client for optional cloud vision (proxied via /api/vision/*).
 * Never reads API secrets — keys live on the API server only.
 */

import { API_BASE } from '../config/platform.js'
import {
  isUltraLowConfidenceOcr,
  localOcrNeedsCloudAssist,
  looksLikeMathHeavyOcr,
  normalizeVisionExtract,
  normalizeVisionSolve,
  scoreLocalOcrWeakness,
} from './cloudVisionParse.js'
import { loadOcrSettings } from './ocrSettings.js'

/** @type {{ configured: boolean, providers: string[], preferred: string | null, model: string | null, message: string, checkedAt: number } | null} */
let statusCache = null
const STATUS_TTL_MS = 60_000

export function clearCloudVisionStatusCache() {
  statusCache = null
}

/**
 * @param {{ force?: boolean }} [opts]
 */
export async function fetchCloudVisionStatus(opts = {}) {
  if (!opts.force && statusCache && Date.now() - statusCache.checkedAt < STATUS_TTL_MS) {
    return statusCache
  }
  try {
    const res = await fetch(`${API_BASE}/vision/status`, {
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) {
      statusCache = {
        configured: false,
        ready: false,
        enabled: false,
        reachable: false,
        providers: [],
        preferred: null,
        model: null,
        message:
          'Cloud vision API not reachable. Local OCR still works. Keep the bottom panel open and press F5 if the API server stopped.',
        checkedAt: Date.now(),
      }
      return statusCache
    }
    const data = await res.json()
    statusCache = {
      configured: !!data.configured,
      ready: data.ready !== false && !!data.configured,
      enabled: data.enabled !== false && !!data.configured,
      reachable: true,
      providers: Array.isArray(data.providers) ? data.providers : [],
      preferred: data.preferred ?? null,
      model: data.model ?? data.geminiModel ?? data.openaiModel ?? null,
      message: String(data.message ?? ''),
      checkedAt: Date.now(),
    }
    return statusCache
  } catch {
    statusCache = {
      configured: false,
      ready: false,
      enabled: false,
      reachable: false,
      providers: [],
      preferred: null,
      model: null,
      message:
        'Cloud vision unlock needs the API server running with OPENAI_API_KEY or GEMINI_API_KEY in .env.',
      checkedAt: Date.now(),
    }
    return statusCache
  }
}

export function isCloudVisionConfiguredSync() {
  return !!statusCache?.configured
}

/**
 * @param {Blob | File} file
 * @returns {Promise<{ imageBase64: string, mimeType: string }>}
 */
export async function blobToVisionPayload(file) {
  let blob = file instanceof Blob ? file : new Blob([file])
  // Very large phone screenshots can make Gemini intermittently return empty — shrink first.
  if (blob.size > 2.4 * 1024 * 1024) {
    try {
      const { downscaleImageForOcr } = await import('./preprocessImage.js')
      blob = await downscaleImageForOcr(blob, { maxDim: 2048 })
    } catch {
      /* keep original */
    }
  }
  const buf = await blob.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  const imageBase64 = btoa(binary)
  const mimeType =
    file.type && file.type.startsWith('image/')
      ? file.type
      : /\.png$/i.test(file.name || '')
        ? 'image/png'
        : 'image/jpeg'
  return { imageBase64, mimeType }
}

/**
 * @param {string} src data URL, blob URL, or http(s) image
 * @returns {Promise<{ imageBase64: string, mimeType: string, natW: number, natH: number }>}
 */
export async function srcToVisionPayload(src) {
  const url = String(src ?? '').trim()
  if (!url) throw new Error('Image source required')

  const dataMatch = url.match(/^data:([^;]+);base64,(.+)$/i)
  if (dataMatch) {
    const mimeType = dataMatch[1] || 'image/jpeg'
    const imageBase64 = dataMatch[2]
    const dims = await measureImageSrc(url)
    return { imageBase64, mimeType, ...dims }
  }

  const res = await fetch(url)
  if (!res.ok) throw new Error('Could not load image for vision.')
  const blob = await res.blob()
  const payload = await blobToVisionPayload(blob)
  const dims = await measureImageSrc(url)
  return { ...payload, ...dims }
}

/** @param {string} src */
function measureImageSrc(src) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () =>
      resolve({ natW: img.naturalWidth || 0, natH: img.naturalHeight || 0 })
    img.onerror = () => resolve({ natW: 0, natH: 0 })
    img.src = src
  })
}

/**
 * @param {number} status
 * @param {string} rawMsg
 */
export function isVisionQuotaError(status, rawMsg) {
  return (
    status === 429 ||
    /quota|rate[- ]?limit|exceeded your current|RESOURCE_EXHAUSTED/i.test(String(rawMsg ?? ''))
  )
}

/**
 * Transient failures worth one backoff retry (5xx / network / empty body).
 * @param {number} [status]
 * @param {string} [rawMsg]
 * @param {string} [code]
 */
export function isVisionTransientError(status, rawMsg, code) {
  if (code === 'VISION_EMPTY' || code === 'VISION_NETWORK') return true
  const s = Number(status)
  if (Number.isFinite(s) && s >= 500 && s < 600) return true
  return /Failed to fetch|NetworkError|ECONNRESET|ETIMEDOUT|socket|fetch failed|empty response|no text/i.test(
    String(rawMsg ?? ''),
  )
}

/**
 * @param {number} [ms]
 * @param {AbortSignal} [signal]
 */
function sleepMs(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error('OCR cancelled.'), { name: 'AbortError' }))
      return
    }
    const timer = setTimeout(resolve, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(Object.assign(new Error('OCR cancelled.'), { name: 'AbortError' }))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Parse "retry in 18.3s" style hints from provider errors.
 * @param {string} rawMsg
 * @param {number} [fallbackMs]
 */
export function visionRetryDelayMs(rawMsg, fallbackMs = 4000) {
  const m = String(rawMsg ?? '').match(/retry in\s*([\d.]+)\s*s/i)
  if (m) {
    const sec = Number(m[1])
    if (Number.isFinite(sec) && sec > 0) return Math.min(25_000, Math.max(1500, Math.ceil(sec * 1000)))
  }
  return fallbackMs
}

/**
 * After local OCR, allow one more cloud try when the first AI call returned empty (no usable text).
 * Never double-bill on quota / auth failures.
 * @param {{ cloudCandidate?: unknown, cloudHardError?: unknown, cloudAttempted?: boolean, cloudEmptyRetryUsed?: boolean }} gate
 */
export function shouldAttemptCloudUpgradeAfterLocal(gate = {}) {
  if (gate.cloudCandidate?.text?.trim()) return false
  if (!gate.cloudAttempted) return true
  if (
    gate.cloudHardError?.code === 'VISION_EMPTY' &&
    !gate.cloudEmptyRetryUsed
  ) {
    return true
  }
  return false
}

/**
 * User-facing note when AI failed but Local OCR text is available.
 * @param {Error & { code?: string }} cloudHardError
 */
export function localFallbackNoteAfterCloudFail(cloudHardError) {
  if (!cloudHardError) return ''
  const code = cloudHardError.code || ''
  const msg = String(cloudHardError.message ?? '')
  const quota =
    code === 'VISION_QUOTA' || /HTTP 429|quota|rate[- ]?limit/i.test(msg)
  if (quota) {
    return 'AI rate limit hit — showing Local OCR backup. Review carefully, wait ~1 minute, then Convert again for AI.'
  }
  if (code === 'VISION_NETWORK' || /Failed to fetch|network/i.test(msg)) {
    return 'AI network error — showing Local OCR backup. Keep the bottom panel open; press F5 if needed, then Convert again.'
  }
  if (code === 'VISION_EMPTY' || /empty response/i.test(msg)) {
    return 'AI returned empty text — click **Convert image → text** again (AI usually works on retry). Local OCR backup shown for now — do not Save until stem/options look correct.'
  }
  return `AI extract failed: ${msg} — showing backup Local OCR; review carefully.`
}

/**
 * Call cloud vision extract (Gemini/OpenAI via API).
 * Retries once on HTTP 429 / quota / 5xx / network / empty body.
 * @param {Blob | File} file
 * @param {{ hint?: string, signal?: AbortSignal, skipRetry?: boolean }} [opts]
 */
export async function extractWithCloudVisionClient(file, opts = {}) {
  const status = await fetchCloudVisionStatus()
  if (!status.configured) {
    const err = new Error(status.message)
    err.code = 'VISION_NOT_CONFIGURED'
    throw err
  }
  const { imageBase64, mimeType } = await blobToVisionPayload(file)
  const body = JSON.stringify({ imageBase64, mimeType, hint: opts.hint })
  const maxAttempts = opts.skipRetry ? 1 : 3
  /** @type {Error | null} */
  let lastErr = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    /** @type {Response} */
    let res
    /** @type {any} */
    let data = {}
    try {
      res = await fetch(`${API_BASE}/vision/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: opts.signal,
      })
      data = await res.json().catch(() => ({}))
    } catch (e) {
      if (e?.name === 'AbortError' || opts.signal?.aborted) throw e
      const netErr = new Error(
        e instanceof Error ? e.message : 'Network error talking to AI extract',
      )
      netErr.code = 'VISION_NETWORK'
      netErr.status = 0
      lastErr = netErr
      if (attempt < maxAttempts) {
        console.warn('[TestVantages] AI extract network error — retrying once')
        await sleepMs(2000, opts.signal)
        continue
      }
      throw Object.assign(
        new Error(
          `AI extract failed (network): ${netErr.message}. Local OCR backup will run — review carefully.`,
        ),
        { code: 'VISION_NETWORK', status: 0 },
      )
    }

    if (res.ok) {
      const normalized = normalizeVisionExtract(data.parsed ?? data.raw)
      const hasText = !!String(normalized.text ?? '').trim()
      const hasQs = Array.isArray(normalized.questions) && normalized.questions.length > 0
      if (!hasText && !hasQs) {
        const emptyErr = new Error('AI extract returned empty response')
        emptyErr.code = 'VISION_EMPTY'
        emptyErr.status = res.status
        lastErr = emptyErr
        if (attempt < maxAttempts) {
          console.warn('[TestVantages] AI extract empty — retrying once')
          await sleepMs(1500, opts.signal)
          continue
        }
        throw Object.assign(
          new Error(
            'AI extract failed (empty response). Local OCR backup will run — review carefully.',
          ),
          { code: 'VISION_EMPTY', status: res.status },
        )
      }
      return {
        text: normalized.text,
        questions: normalized.questions,
        pageKind: normalized.pageKind,
        multi: normalized.multi,
        validation: normalized.validation,
        confidence: normalized.confidence,
        valid: normalized.valid !== false,
        engine: 'cloud-vision',
        provider: data.provider,
        model: data.model,
        raw: data.raw,
      }
    }

    const rawMsg = data.error || `Cloud vision extract failed (${res.status})`
    const statusBit = data.status || res.status
    const quota = isVisionQuotaError(statusBit, rawMsg)
    const transient = isVisionTransientError(statusBit, rawMsg, data.code)
    if ((quota || transient) && attempt < maxAttempts) {
      const waitMs = visionRetryDelayMs(rawMsg, quota ? 4000 : 2000)
      console.warn(
        `[TestVantages] AI extract ${quota ? 'quota/rate-limit' : 'transient'} — retrying once in ${waitMs}ms`,
      )
      await sleepMs(waitMs, opts.signal)
      continue
    }

    const authHint =
      res.status === 401 ||
      res.status === 403 ||
      /API[_ ]?KEY|UNAUTHENTICATED|PERMISSION|ACCESS_TOKEN|invalid/i.test(rawMsg)
        ? ' Check GEMINI_API_KEY / OPENAI_API_KEY in onlinetest/.env, then press F5 to restart.'
        : ''
    const modelHint =
      /no longer available|VISION_MODEL_UNAVAILABLE|not found/i.test(rawMsg)
        ? ' Set GEMINI_VISION_MODEL=gemini-3.5-flash in .env, then press F5.'
        : ''
    const quotaHint = quota
      ? ' AI daily/minute limit hit — Local OCR backup will run. Wait ~1 minute, then Convert again for AI.'
      : ''
    const err = new Error(
      `AI extract failed (HTTP ${statusBit}): ${rawMsg}${authHint}${modelHint}${quotaHint}`,
    )
    err.code =
      data.code ||
      (quota
        ? 'VISION_QUOTA'
        : res.status === 401 || res.status === 403
          ? 'VISION_AUTH_FAILED'
          : 'VISION_EXTRACT_FAILED')
    err.status = statusBit
    lastErr = err
    throw err
  }

  const err = lastErr || new Error('AI extract failed after retry.')
  err.code = err.code || 'VISION_EXTRACT_FAILED'
  throw err
}

/**
 * Locate option graph boxes A–D via cloud vision. Returns null when not configured / failed.
 * @param {string} imageSrc data URL or blob/http URL
 * @param {{ hint?: string, signal?: AbortSignal }} [opts]
 * @returns {Promise<({ x: number, y: number, width: number, height: number } | null)[] | null>}
 */
export async function locateOptionRegionsWithCloudVisionClient(imageSrc, opts = {}) {
  const status = await fetchCloudVisionStatus()
  if (!status.configured) return null

  const { imageBase64, mimeType, natW, natH } = await srcToVisionPayload(imageSrc)
  if (!natW || !natH) return null

  const res = await fetch(`${API_BASE}/vision/option-regions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, mimeType, hint: opts.hint }),
    signal: opts.signal,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return null

  const { normalizeVisionOptionRegions } = await import('./visionOptionRegions.js')
  return normalizeVisionOptionRegions(data.parsed ?? data.raw, natW, natH)
}

/**
 * @param {object} question
 * @param {{ signal?: AbortSignal }} [opts]
 */
export async function solveWithCloudVisionClient(question, opts = {}) {
  const status = await fetchCloudVisionStatus()
  if (!status.configured) {
    const err = new Error(status.message)
    err.code = 'VISION_NOT_CONFIGURED'
    throw err
  }
  const res = await fetch(`${API_BASE}/vision/solve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: question.text,
      options: question.options,
      correctIndex: question.correctIndex,
      correctIndices: question.correctIndices,
      correctInteger: question.correctInteger,
      correctNumerical: question.correctNumerical,
      questionType: question.questionType,
    }),
    signal: opts.signal,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || `Cloud solve failed (${res.status})`)
    err.code = data.code || 'VISION_SOLVE_FAILED'
    throw err
  }
  const normalized = normalizeVisionSolve(data.parsed ?? data.raw)
  return {
    ...normalized,
    engine: 'cloud-vision',
    provider: data.provider,
    model: data.model,
    solutionSource: 'ai_generated',
    solutionConfidence: 78,
  }
}

/**
 * Decide whether to attempt cloud after (or instead of) local OCR.
 * Math-heavy / ultra-weak local text strongly prefers cloud when enabled.
 * @param {string} [localText]
 * @param {ReturnType<typeof loadOcrSettings>} [settings]
 */
export function shouldAttemptCloudVision(localText = '', settings = loadOcrSettings()) {
  if (settings.useCloudVision === false) return false
  if (settings.preferCloudVision === true) return true
  const t = String(localText ?? '')
  if (looksLikeMathHeavyOcr(t) || isUltraLowConfidenceOcr(t) || scoreLocalOcrWeakness(t) >= 40) {
    return true
  }
  if (settings.useCloudVision === true) return localOcrNeedsCloudAssist(t)
  // auto: when local looks weak
  return localOcrNeedsCloudAssist(t)
}

/**
 * Prefer cloud *before* local when math-heavy pages and a key is configured.
 * @param {string} [hintText]
 * @param {ReturnType<typeof loadOcrSettings>} [settings]
 */
export function shouldPreferCloudVisionFirst(hintText = '', settings = loadOcrSettings()) {
  if (settings.useCloudVision === false) return false
  if (settings.preferCloudVision === true) return true
  // When cloud is on (auto/true), try cloud first for obvious math / determinants
  return looksLikeMathHeavyOcr(hintText)
}

/**
 * Human badge for OCR engine.
 * @param {string} [engine]
 */
export function ocrEngineBadgeLabel(engine) {
  switch (engine) {
    case 'cloud-vision':
      return 'AI'
    case 'pix2text':
      return 'Pix2Text'
    case 'word':
      return 'Word'
    case 'pptx':
      return 'PowerPoint'
    case 'mathpix':
      return 'Mathpix'
    case 'builtin':
    case 'hybrid':
    default:
      return 'AI'
  }
}
