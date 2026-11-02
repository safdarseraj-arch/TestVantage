/**
 * One-at-a-time Gemini generation queue — stays near free-tier ~10 RPM.
 */

import { SCQ_TRIAL_COUNT, SCQ_TRIAL_GAP_MS, sleepMs } from '../src/utils/geminiScqTrial.js'

/** @type {Array<{ label: string, run: () => Promise<unknown>, resolve: (v: unknown) => void, reject: (e: unknown) => void, enqueuedAt: number }>} */
const queue = []
let processing = false
let lastFinishedAt = 0
/** @type {string | null} */
let currentLabel = null

export function geminiQueueStatus() {
  return {
    waiting: queue.length,
    processing,
    currentLabel,
    gapMs: SCQ_TRIAL_GAP_MS,
    questionsPerCall: SCQ_TRIAL_COUNT,
    paceHint: `~1 batch of ${SCQ_TRIAL_COUNT} questions every ${Math.round(SCQ_TRIAL_GAP_MS / 1000)}s (~10 API calls/min free tier)`,
  }
}

export function runGeminiQueued(label, fn) {
  return new Promise((resolve, reject) => {
    queue.push({
      label: String(label || 'gemini').slice(0, 120),
      run: fn,
      resolve,
      reject,
      enqueuedAt: Date.now(),
    })
    void drainGeminiQueue()
  })
}

async function drainGeminiQueue() {
  if (processing) return
  processing = true
  try {
    while (queue.length) {
      const elapsed = Date.now() - lastFinishedAt
      if (lastFinishedAt > 0 && elapsed < SCQ_TRIAL_GAP_MS) {
        await sleepMs(SCQ_TRIAL_GAP_MS - elapsed)
      }
      const item = queue.shift()
      if (!item) break
      currentLabel = item.label
      try {
        const result = await item.run()
        item.resolve(result)
      } catch (e) {
        item.reject(e)
      } finally {
        lastFinishedAt = Date.now()
        currentLabel = null
      }
    }
  } finally {
    processing = false
    if (queue.length) void drainGeminiQueue()
  }
}
