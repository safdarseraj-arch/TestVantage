import {
  MATH_OCR_MODEL_FALLBACK,
  MATH_OCR_MODEL_LABEL,
  MATH_OCR_MODEL_PRIMARY,
} from './mathOcrConstants.js'
import {
  loadBestMathOcrPipeline,
  resolveMathOcrDevice,
  runMathOcrOnPipeline,
} from './mathOcrPipeline.js'
import { MATH_OCR_WORKER_POOL_SIZE } from './mathOcrConfig.js'
import { normalizeTexifyLatex } from './hybridOcrMerge.js'
import { isAbortError, throwIfAborted } from './ocrAbort.js'

/** @deprecated use MATH_OCR_MODEL_PRIMARY */
export const MATH_OCR_MODEL_ID = MATH_OCR_MODEL_PRIMARY

/** @type {Worker[]} */
const workerPool = []
let workerRoundRobin = 0
/** @type {Promise<{ modelId: string }> | null} */
let loadPromise = null
let workerGeneration = 0
let requestSeq = 0
let preferWorker = true

/** @type {import('@huggingface/transformers').ImageToTextPipeline | null} */
let mainThreadPipe = null

/** @type {'idle' | 'loading' | 'ready' | 'error'} */
let loadStatus = 'idle'
let loadError = ''
/** @type {string} */
let activeModelId = ''

/** @type {Map<number, { resolve: Function, reject: Function }>} */
const pending = new Map()

function rejectAllPending(err) {
  for (const [id, entry] of pending) {
    entry.reject(err)
    pending.delete(id)
  }
}

function handleWorkerMessage(event) {
  const { type, requestId, message, code, text, modelId } = event.data ?? {}
  const entry = pending.get(requestId)
  if (!entry) return

  if (type === 'loaded') {
    loadStatus = 'ready'
    activeModelId = modelId ?? MATH_OCR_MODEL_PRIMARY
    entry.resolve({ modelId: activeModelId })
    pending.delete(requestId)
    return
  }

  if (type === 'result') {
    if (modelId) activeModelId = modelId
    entry.resolve(text ?? '')
    pending.delete(requestId)
    return
  }

  if (type === 'cancelled') {
    entry.resolve('')
    pending.delete(requestId)
    return
  }

  if (type === 'error') {
    const err =
      code === 'AbortError'
        ? new DOMException(message ?? 'Math OCR cancelled', 'AbortError')
        : new Error(message ?? 'Math OCR worker error')
    entry.reject(err)
    pending.delete(requestId)
  }
}

function spawnWorker() {
  const worker = new Worker(new URL('../workers/mathOcr.worker.js', import.meta.url), {
    type: 'module',
  })
  worker.onmessage = handleWorkerMessage
  worker.onerror = (ev) => {
    preferWorker = false
    loadStatus = 'error'
    loadError = ev.message ?? 'Math OCR worker crashed'
    rejectAllPending(new Error(loadError))
    for (const w of workerPool) w.terminate()
    workerPool.length = 0
    loadPromise = null
  }
  return worker
}

function ensureWorkerPool() {
  const target = Math.max(1, MATH_OCR_WORKER_POOL_SIZE)
  while (workerPool.length < target) {
    workerPool.push(spawnWorker())
  }
}

function nextWorker() {
  ensureWorkerPool()
  const worker = workerPool[workerRoundRobin % workerPool.length]
  workerRoundRobin += 1
  return worker
}

function postToWorker(type, payload = {}, signal, worker = nextWorker()) {
  throwIfAborted(signal)
  const requestId = ++requestSeq
  const generation = workerGeneration

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      pending.delete(requestId)
      reject(new DOMException('Math OCR cancelled', 'AbortError'))
    }
    if (signal) {
      if (signal.aborted) {
        onAbort()
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }

    pending.set(requestId, {
      resolve: (val) => {
        signal?.removeEventListener('abort', onAbort)
        resolve(val)
      },
      reject: (err) => {
        signal?.removeEventListener('abort', onAbort)
        reject(err)
      },
    })

    worker.postMessage({ type, requestId, generation, payload })
  })
}

async function loadWorkerPool(device, signal) {
  ensureWorkerPool()
  const loads = workerPool.map((worker) =>
    postToWorker('load', { device }, signal, worker).catch((err) => {
      if (isAbortError(err)) throw err
      return null
    }),
  )
  const results = await Promise.all(loads)
  const ok = results.find((r) => r?.modelId)
  if (!ok) throw new Error('Math OCR worker pool failed to load')
  return ok
}

async function loadMainThreadPipeline(onProgress, signal, device) {
  throwIfAborted(signal)
  onProgress?.(10)
  const loaded = await loadBestMathOcrPipeline(device)
  throwIfAborted(signal)
  mainThreadPipe = loaded.pipe
  activeModelId = loaded.modelId
  loadStatus = 'ready'
  onProgress?.(100)
  return { modelId: loaded.modelId }
}

export function getMathOcrLoadStatus() {
  return {
    status: loadStatus,
    error: loadError,
    modelId: activeModelId || MATH_OCR_MODEL_PRIMARY,
    modelLabel: MATH_OCR_MODEL_LABEL,
    fallback: MATH_OCR_MODEL_FALLBACK,
    inWorker: preferWorker && workerPool.length > 0,
    workerPoolSize: workerPool.length,
    device: resolveMathOcrDevice(),
  }
}

export function cancelMathOcr() {
  workerGeneration += 1
  loadPromise = null
  loadStatus = 'idle'
  loadError = ''
  activeModelId = ''
  mainThreadPipe = null
  rejectAllPending(new DOMException('Math OCR cancelled', 'AbortError'))
  for (const worker of workerPool) {
    worker.postMessage({ type: 'cancel', requestId: 0, generation: workerGeneration })
    worker.terminate()
  }
  workerPool.length = 0
  workerRoundRobin = 0
}

/** Preload LaTeX ONNX in the background (Question Bank idle warm-up). */
export function warmMathOcrPipeline() {
  if (loadStatus === 'ready' || loadStatus === 'loading') return loadPromise
  return loadMathOcrPipeline(undefined, undefined).catch(() => {})
}

export async function loadMathOcrPipeline(onProgress, signal) {
  throwIfAborted(signal)
  const gen = workerGeneration

  if (loadPromise && loadStatus === 'ready') {
    onProgress?.(100)
    return loadPromise
  }

  if (!loadPromise) {
    loadStatus = 'loading'
    loadError = ''
    onProgress?.(5)

    loadPromise = (async () => {
      const device = resolveMathOcrDevice()

      if (preferWorker) {
        try {
          const res = await loadWorkerPool(device, signal)
          if (gen !== workerGeneration) {
            throw new DOMException('Math OCR cancelled', 'AbortError')
          }
          onProgress?.(100)
          return res
        } catch (err) {
          if (isAbortError(err)) throw err
          console.warn('[TestVantages] Math OCR worker failed — using main-thread ONNX:', err)
          preferWorker = false
          for (const w of workerPool) w.terminate()
          workerPool.length = 0
          loadPromise = null
        }
      }

      const res = await loadMainThreadPipeline(onProgress, signal, device)
      if (gen !== workerGeneration) {
        throw new DOMException('Math OCR cancelled', 'AbortError')
      }
      return res
    })().catch((err) => {
      loadPromise = null
      loadStatus = 'error'
      loadError = err?.message ?? String(err)
      throw err
    })
  }

  return loadPromise
}

export async function recognizeEquationImage(image, signal) {
  throwIfAborted(signal)
  await loadMathOcrPipeline(undefined, signal)
  throwIfAborted(signal)

  let raw = ''
  if (preferWorker && workerPool.length) {
    raw = await postToWorker(
      'recognize',
      {
        image,
        modelId: activeModelId || MATH_OCR_MODEL_PRIMARY,
        device: resolveMathOcrDevice(),
      },
      signal,
    )
  } else if (mainThreadPipe) {
    raw = await runMathOcrOnPipeline(mainThreadPipe, image)
  }

  throwIfAborted(signal)
  return normalizeTexifyLatex(raw)
}

export async function blobToDataUrl(blob) {
  if (typeof FileReader === 'undefined') {
    throw new Error('FileReader not available')
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(blob)
  })
}
