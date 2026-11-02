import {
  loadBestMathOcrPipeline,
  runMathOcrOnPipeline,
} from '../utils/mathOcrPipeline.js'

/** @type {import('@huggingface/transformers').ImageToTextPipeline | null} */
let pipe = null
/** @type {string} */
let loadedModelId = ''
let workerGeneration = 0

self.onmessage = async (event) => {
  const { type, requestId, generation, payload } = event.data ?? {}

  try {
    if (type === 'cancel') {
      workerGeneration = generation ?? workerGeneration + 1
      pipe = null
      loadedModelId = ''
      self.postMessage({ type: 'cancelled', requestId })
      return
    }

    if (generation != null && generation !== workerGeneration) {
      self.postMessage({
        type: 'error',
        requestId,
        message: 'Math OCR cancelled',
        code: 'AbortError',
      })
      return
    }

    if (type === 'load') {
      const loaded = await loadBestMathOcrPipeline(payload?.device)
      pipe = loaded.pipe
      loadedModelId = loaded.modelId
      self.postMessage({ type: 'loaded', requestId, modelId: loadedModelId })
      return
    }

    if (type === 'recognize') {
      if (!pipe) {
        const loaded = await loadBestMathOcrPipeline(payload?.device)
        pipe = loaded.pipe
        loadedModelId = loaded.modelId
      }
      const text = await runMathOcrOnPipeline(pipe, payload.image)
      self.postMessage({ type: 'result', requestId, text, modelId: loadedModelId })
      return
    }

    self.postMessage({ type: 'error', requestId, message: `Unknown worker message: ${type}` })
  } catch (err) {
    self.postMessage({
      type: 'error',
      requestId,
      message: err?.message ?? String(err),
      code: err?.name,
    })
  }
}

// Named as a module for Vite/esbuild. Side-effect worker — no constructor export needed.
export default {}
