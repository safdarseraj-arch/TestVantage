import { createWorker, PSM } from 'tesseract.js'
import workerURL from 'tesseract.js/dist/worker.min.js?url'
import { finalizeOcrText } from './inferMathFromPlainOcr.js'
import { pickBestOcrCandidate } from './pickBestOcrCandidate.js'
import { downscaleImageForOcr, preprocessImageForOcr } from './preprocessImage.js'
import { normalizeMathText } from './normalizeMathText.js'
import { isAbortError, throwIfAborted, yieldToMain } from './ocrAbort.js'
import { layoutTextFromTesseractPage } from './tesseractLayoutText.js'

export { layoutTextFromTesseractPage }

/** Reuse one worker so language/WASM load happens once per session. */
let workerInstance = null
/** @type {Promise<import('tesseract.js').Worker> | null} */
let workerReady = null
/** Bumped on cancel — stale worker init / recognize runs exit early. */
let workerGeneration = 0

const PSM_MODES = [
  { psm: PSM.SINGLE_BLOCK, label: 'SINGLE_BLOCK' },
  { psm: PSM.AUTO, label: 'AUTO' },
  { psm: PSM.SINGLE_COLUMN, label: 'SINGLE_COLUMN' },
]

/**
 * @param {import('tesseract.js').LoggerMessage} m
 * @param {(pct: number) => void} [onProgress]
 * @param {number} [recognizeWeight] 0–1 share of bar for recognize phase
 */
function reportTesseractProgress(m, onProgress, recognizeWeight = 0.55) {
  if (!onProgress) return
  let pct = null
  if (m.status === 'loading tesseract core') pct = 5
  else if (m.status === 'initializing tesseract') pct = 12
  else if (m.status === 'loading language traineddata') pct = 35
  else if (m.status === 'initializing api' || m.status === 'initialized api') pct = 48
  else if (m.status === 'recognizing text') {
    pct = 50 + Math.round((m.progress ?? 0) * recognizeWeight * 100)
  } else if (m.status?.includes('loading')) pct = 20

  if (pct != null) onProgress(Math.min(99, pct))
}

/**
 * Immediately stop Tesseract — safe to call from Cancel (sync, non-blocking).
 */
export function cancelTesseractOcr() {
  workerGeneration += 1
  workerReady = null
  const w = workerInstance
  workerInstance = null
  if (w) {
    w.terminate().catch(() => {})
  }
}

/**
 * @param {(pct: number) => void} [onProgress]
 * @param {AbortSignal} [signal]
 */
async function getSharedWorker(onProgress, signal) {
  throwIfAborted(signal)
  const gen = workerGeneration

  if (workerInstance) {
    onProgress?.(50)
    throwIfAborted(signal)
    return workerInstance
  }

  if (!workerReady) {
    workerReady = (async () => {
      onProgress?.(2)
      await yieldToMain()
      throwIfAborted(signal)
      if (gen !== workerGeneration) {
        throw new DOMException('OCR cancelled', 'AbortError')
      }

      const worker = await createWorker('eng', 1, {
        workerPath: workerURL,
        workerBlobURL: false,
        logger: (m) => reportTesseractProgress(m, onProgress, 0.45),
      })

      if (gen !== workerGeneration) {
        await worker.terminate().catch(() => {})
        throw new DOMException('OCR cancelled', 'AbortError')
      }

      try {
        await worker.setParameters({
          textord_equation_detect: '1',
          preserve_interword_spaces: '1',
        })
      } catch {
        /* optional */
      }
      workerInstance = worker
      onProgress?.(50)
      return worker
    })().catch((err) => {
      workerReady = null
      throw err
    })
  }

  const worker = await workerReady
  throwIfAborted(signal)
  if (gen !== workerGeneration) {
    throw new DOMException('OCR cancelled', 'AbortError')
  }
  return worker
}

/**
 * @param {import('tesseract.js').Worker} worker
 * @param {File | Blob} source
 * @param {(pct: number) => void} [onProgress]
 * @param {AbortSignal} [signal]
 */
async function recognizeMultiPass(worker, source, onProgress, signal, bookMode = false) {
  /** @type {import('./pickBestOcrCandidate.js').OcrCandidate[]} */
  const candidates = []
  const modes = bookMode ? PSM_MODES.slice(0, 1) : PSM_MODES

  for (let i = 0; i < modes.length; i++) {
    throwIfAborted(signal)
    const { psm, label } = modes[i]
    const { data } = await worker.recognize(source, {
      tessedit_pageseg_mode: psm,
      preserve_interword_spaces: '1',
    })
    throwIfAborted(signal)
    const raw = data.text?.trim() ?? ''
    if (!raw) continue
    const polished = normalizeMathText(finalizeOcrText(raw))
    candidates.push({
      text: polished,
      raw,
      source: `tesseract:${label}`,
      confidence: data.confidence ?? 0,
      psm: label,
    })
    onProgress?.(55 + Math.round(((i + 1) / modes.length) * 35))
  }

  const best = pickBestOcrCandidate(candidates)
  return best.raw ?? best.text ?? ''
}

/**
 * @param {File | Blob} input
 * @param {(pct: number) => void} [onProgress]
 * @param {{ signal?: AbortSignal }} [opts]
 */
export async function recognizeWithEnhancedTesseract(input, onProgress, opts = {}) {
  const { signal, bookMode = false, fastMode = false, skipPreprocess = false } = opts
  throwIfAborted(signal)
  onProgress?.(1)

  /** @type {Array<{ blob: File | Blob, source: string }>} */
  const sources = [{ blob: input, source: 'original' }]

  const preprocessModes = skipPreprocess
    ? []
    : bookMode || fastMode
      ? ['watermark-suppress', 'standard']
      : ['watermark-suppress', 'standard', 'high-contrast', 'sharp']

  for (const mode of preprocessModes) {
    try {
      throwIfAborted(signal)
      const prepped = await preprocessImageForOcr(input, { signal, mode })
      sources.push({ blob: prepped, source: mode })
      onProgress?.(6 + (mode === 'standard' ? 2 : mode === 'high-contrast' ? 4 : 6))
    } catch (err) {
      if (isAbortError(err)) throw err
    }
  }

  throwIfAborted(signal)
  const worker = await getSharedWorker(onProgress, signal)
  onProgress?.(52)

  /** @type {import('./pickBestOcrCandidate.js').OcrCandidate[]} */
  const allCandidates = []

  for (let s = 0; s < sources.length; s++) {
    throwIfAborted(signal)
    const { blob, source } = sources[s]
    const raw = await recognizeMultiPass(worker, blob, onProgress, signal, bookMode || fastMode)
    if (!raw.trim()) continue
    const polished = normalizeMathText(finalizeOcrText(raw))
    allCandidates.push({
      text: polished,
      raw,
      source: `builtin:${source}`,
      confidence: 0,
    })
  }

  throwIfAborted(signal)
  onProgress?.(100)
  const best = pickBestOcrCandidate(allCandidates)
  return best.raw ?? best.text ?? ''
}

/**
 * Preload Tesseract WASM + eng data in the background (Question Bank idle warm-up).
 * First upload then skips the long "stuck at 25%" worker init.
 */
export function warmTesseractWorker() {
  if (workerInstance || workerReady) return workerReady
  return getSharedWorker(undefined, undefined).catch(() => null)
}

/**
 * One layout pass: words/lines with bboxes for hybrid math-region routing.
 * Downscales large screenshots first — full-res phone images made the bar sit at ~25%.
 * @param {File | Blob} input
 * @param {(pct: number) => void} [onProgress]
 * @param {AbortSignal} [signal]
 * @returns {Promise<import('tesseract.js').Page>}
 */
export async function recognizeTesseractLayout(input, onProgress, signal) {
  throwIfAborted(signal)
  onProgress?.(4)
  const scaled = await downscaleImageForOcr(input, { signal })
  onProgress?.(12)
  const worker = await getSharedWorker((pct) => {
    // Worker init 0–50 → 12–40; recognize 50–99 → 40–96
    if (pct <= 50) onProgress?.(12 + Math.round((pct / 50) * 28))
    else onProgress?.(40 + Math.round(((pct - 50) / 50) * 56))
  }, signal)
  onProgress?.(42)
  const { data } = await worker.recognize(scaled, {
    tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    preserve_interword_spaces: '1',
  })
  throwIfAborted(signal)
  onProgress?.(100)
  return data
}

/** @deprecated Use cancelTesseractOcr */
export async function terminateSharedTesseractWorker() {
  cancelTesseractOcr()
}
