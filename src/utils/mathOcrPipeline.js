import {
  MATH_OCR_MODEL_FALLBACK,
  MATH_OCR_MODEL_PRIMARY,
} from './mathOcrConstants.js'
import { MATH_OCR_MAX_NEW_TOKENS } from './mathOcrConfig.js'
import { loadOcrSettings } from './ocrSettings.js'

/**
 * @param {string} [device] explicit override, or 'auto' from settings
 */
export function resolveMathOcrDevice(device) {
  const pref = device ?? loadOcrSettings().mathOcrDevice ?? 'auto'
  if (pref === 'wasm') return 'wasm'
  if (pref === 'webgpu') return 'webgpu'
  if (typeof navigator !== 'undefined' && 'gpu' in navigator) return 'webgpu'
  return 'wasm'
}

/** @returns {boolean} */
export function isWebGpuAvailable() {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

/**
 * @param {string} modelId
 * @param {string} [device]
 */
export async function createMathOcrPipeline(modelId, device) {
  const { pipeline, env } = await import('@huggingface/transformers')
  env.allowLocalModels = false
  env.useBrowserCache = true
  const resolved = resolveMathOcrDevice(device)
  try {
    return await pipeline('image-to-text', modelId, {
      device: resolved,
      dtype: 'fp32',
    })
  } catch (err) {
    if (resolved === 'webgpu') {
      return pipeline('image-to-text', modelId, { device: 'wasm', dtype: 'fp32' })
    }
    throw err
  }
}

/**
 * @param {string} [device]
 */
export async function loadBestMathOcrPipeline(device) {
  const models = [MATH_OCR_MODEL_PRIMARY, MATH_OCR_MODEL_FALLBACK]
  let lastErr = null
  for (const modelId of models) {
    try {
      const pipe = await createMathOcrPipeline(modelId, device)
      return { pipe, modelId }
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr ?? new Error('Math OCR model load failed')
}

/**
 * @param {import('@huggingface/transformers').ImageToTextPipeline} pipe
 * @param {string} image
 */
export async function runMathOcrOnPipeline(pipe, image) {
  const opts = { max_new_tokens: MATH_OCR_MAX_NEW_TOKENS }
  const unk = pipe.tokenizer?.unk_token_id
  if (unk != null) opts.bad_words_ids = [[unk]]
  const output = await pipe(image, opts)
  return output?.[0]?.generated_text ?? output?.generated_text ?? ''
}
