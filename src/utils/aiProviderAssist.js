/**
 * Shared Gemini-first + local fallback assist for text tasks
 * (Career Compass explain, Mock Builder narrative, etc.).
 * Never blocks UX — always returns a local result if cloud fails.
 */

import { API_BASE } from '../config/platform.js'
import { fetchCloudVisionStatus } from './cloudVisionClient.js'
import { loadOcrSettings } from './ocrSettings.js'
import {
  loadLocalAiLearningSettings,
  recordLocalAiLearningExample,
  findSimilarLocalAiExample,
} from './localAiLearningStore.js'

/**
 * @typedef {{
 *   text: string
 *   provider: 'cloud-vision' | 'local'
 *   badge: string
 *   disclaimer?: string
 *   cloudAttempted?: boolean
 *   cloudError?: string
 *   learned?: boolean
 * }} AiAssistResult
 */

/**
 * Call cloud /api/vision/assist when configured.
 * @param {{ task: string, context?: object, signal?: AbortSignal }} opts
 */
export async function assistWithCloudVisionClient(opts) {
  const status = await fetchCloudVisionStatus()
  if (!status.configured && !status.ready) {
    const err = new Error(status.message || 'Cloud AI not configured')
    err.code = 'VISION_NOT_CONFIGURED'
    throw err
  }
  const res = await fetch(`${API_BASE}/vision/assist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task: opts.task,
      context: opts.context ?? {},
    }),
    signal: opts.signal ?? AbortSignal.timeout(
      opts.task === 'quick-revision-sheet' || opts.task === 'quick-revision-strategy' ? 90000 : 20000,
    ),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || `Cloud assist failed (${res.status})`)
    err.code = data.code || 'VISION_ASSIST_FAILED'
    throw err
  }
  return {
    text: String(data.text ?? '').trim(),
    disclaimer: data.disclaimer ? String(data.disclaimer) : undefined,
    provider: /** @type {'cloud-vision'} */ ('cloud-vision'),
    engine: data.engine,
    model: data.model,
    tags: Array.isArray(data.tags) ? data.tags : [],
  }
}

/**
 * Gemini first when ready; else local. On Gemini success + learning on → store example.
 * @param {{
 *   task: string
 *   context?: object
 *   localText: string
 *   localDisclaimer?: string
 *   recordLearning?: boolean
 *   learningStem?: string
 *   signal?: AbortSignal
 * }} opts
 * @returns {Promise<AiAssistResult>}
 */
export async function runAiAssistWithFallback(opts) {
  const settings = loadOcrSettings()
  const learningOn = loadLocalAiLearningSettings().enabled
  const preferCloud = settings.useCloudVision !== false

  /** @type {AiAssistResult} */
  const localResult = {
    text: String(opts.localText ?? '').trim(),
    provider: 'local',
    badge: 'Local AI',
    disclaimer: opts.localDisclaimer,
    cloudAttempted: false,
  }

  // Seed local text from similar past Gemini examples when available
  if (learningOn && opts.learningStem) {
    const similar = findSimilarLocalAiExample(opts.learningStem)
    if (similar?.cloudSolution?.trim() && similar.cloudSolution.length > localResult.text.length) {
      localResult.text = similar.cloudSolution.slice(0, 4000)
      localResult.badge = 'Local AI (learned)'
      localResult.learned = true
    }
  }

  if (!preferCloud) return localResult

  try {
    const cloud = await assistWithCloudVisionClient({
      task: opts.task,
      context: opts.context,
      signal: opts.signal,
    })
    if (!cloud.text) {
      return { ...localResult, cloudAttempted: true, cloudError: 'Empty cloud response' }
    }
    if (opts.recordLearning !== false && learningOn) {
      recordLocalAiLearningExample({
        cloudStem: opts.learningStem || opts.task,
        cloudSolution: cloud.text,
        provider: 'cloud-vision',
        topic: opts.task,
      })
    }
    return {
      text: cloud.text,
      provider: 'cloud-vision',
      badge: 'Cloud (Gemini)',
      disclaimer: cloud.disclaimer || opts.localDisclaimer,
      cloudAttempted: true,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Cloud assist failed'
    const code = /** @type {{ code?: string }} */ (e)?.code
    return {
      ...localResult,
      cloudAttempted: true,
      cloudError: code === 'VISION_NOT_CONFIGURED' ? undefined : msg,
    }
  }
}

/** Short badge for UI chips. */
export function aiAssistBadgeLabel(provider) {
  if (provider === 'cloud-vision') return 'Cloud (Gemini)'
  if (provider === 'local') return 'Local AI'
  return 'AI'
}
