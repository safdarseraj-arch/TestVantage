/**
 * Grok-style 6-layer hybrid OCR stack runtime (server + browser).
 *
 * Layer 1 — Preprocess (preprocessImage.js, downscale in cloudVisionClient)
 * Layer 2 — Formula OCR (Pix2Text sidecar + browser ONNX math crops)
 * Layer 3 — Full-page mixed (Tesseract layout + line split)
 * Layer 4 — Ensemble (pickBestOcrCandidate.js)
 * Layer 5 — Validation & repair (latexValidateRepair + ocrExtractPolish)
 * Layer 6 — Cloud runtime (Gemini/OpenAI via server/vision.js)
 */
import { pickBestOcrCandidate } from './pickBestOcrCandidate.js'
import { polishExtractedText } from './ocrExtractPolish.js'
import { scoreLocalOcrWeakness } from './cloudVisionParse.js'
import { extractWithPix2TextClient, fetchPix2TextStatus, pix2TextWouldHelp, shouldAttemptPix2Text } from './pix2textClient.js'
import { looksLikeComplexFormulaQuestion } from './pix2textParse.js'
import { isAbortError } from './ocrAbort.js'

/**
 * Layer 4 ensemble: pick best of local hybrid OCR vs Pix2Text formula OCR.
 * @param {{
 *   localText: string
 *   localSource?: string
 *   file: File | Blob
 *   signal?: AbortSignal
 *   progress?: (pct: number) => void
 * }} input
 */
export async function ensembleLocalWithPix2Text(input) {
  const localText = String(input.localText ?? '').trim()
  /** @type {Array<{ text: string, raw?: string, source: string }>} */
  const candidates = []

  if (localText) {
    candidates.push({
      text: polishExtractedText(localText, 'builtin'),
      raw: localText,
      source: input.localSource || 'hybrid:local',
    })
  }

  const pix2 = await fetchPix2TextStatus()
  if (pix2.ready) {
    input.progress?.(88)
    try {
      const p2t = await extractWithPix2TextClient(input.file, { signal: input.signal })
      if (p2t.text?.trim()) {
        candidates.push({
          text: polishExtractedText(p2t.text, 'pix2text'),
          raw: p2t.text,
          source: 'pix2text',
        })
      }
    } catch (err) {
      if (isAbortError(err)) throw err
      console.warn('[TestVantages] Pix2Text ensemble skipped:', err)
    }
  }

  if (!candidates.length) {
    return {
      text: '',
      engine: 'builtin',
      ocrWeakness: 99,
      lowConfidence: true,
      stackLayer: 4,
      ensembleSources: [],
    }
  }

  if (candidates.length === 1) {
    const only = candidates[0]
    const weakness = scoreLocalOcrWeakness(only.text)
    return {
      text: only.text,
      engine: only.source === 'pix2text' ? 'pix2text' : 'builtin',
      ocrWeakness: weakness,
      lowConfidence: weakness >= 55,
      stackLayer: only.source === 'pix2text' ? 2 : 3,
      ensembleSources: [only.source],
      localOcrRaw: only.source !== 'pix2text' ? only.raw : undefined,
    }
  }

  const best = pickBestOcrCandidate(candidates)
  const weakness = scoreLocalOcrWeakness(best.text)
  const engine = best.source === 'pix2text' ? 'pix2text' : 'builtin'

  return {
    text: best.text,
    engine,
    ocrWeakness: weakness,
    lowConfidence: weakness >= 55,
    stackLayer: 4,
    ensembleSources: candidates.map((c) => c.source),
    localOcrRaw: candidates.find((c) => c.source !== 'pix2text')?.raw,
    pix2textBeatLocal: best.source === 'pix2text',
  }
}

/**
 * Grok routing: if cloud/local is weak or the stem looks like nested-formula MCQ,
 * ask Pix2Text and keep the better candidate. No-op when sidecar is off.
 * @param {{
 *   file: File | Blob
 *   currentText?: string
 *   currentQuestions?: unknown
 *   currentEngine?: string
 *   currentWeakness?: number
 *   currentValidation?: unknown
 *   settings?: { usePix2Text?: boolean }
 *   cloudAttempted?: boolean
 *   cloudSucceeded?: boolean
 *   cloudWeak?: number
 *   cloudLowConfidence?: boolean
 *   signal?: AbortSignal
 *   progress?: (pct: number) => void
 * }} input
 */
export async function tryPix2TextUpgrade(input) {
  const currentText = String(input.currentText ?? '').trim()
  if (
    !pix2TextWouldHelp({
      settings: input.settings,
      cloudAttempted: input.cloudAttempted,
      cloudSucceeded: input.cloudSucceeded,
      cloudWeak: input.cloudWeak,
      cloudLowConfidence: input.cloudLowConfidence,
      cloudText: currentText,
      complexMath: looksLikeComplexFormulaQuestion(currentText),
    })
  ) {
    return null
  }

  const pix2 = await fetchPix2TextStatus()
  if (
    !shouldAttemptPix2Text({
      settings: input.settings,
      pix2Ready: pix2.ready,
      cloudAttempted: input.cloudAttempted,
      cloudSucceeded: input.cloudSucceeded,
      cloudWeak: input.cloudWeak,
      cloudLowConfidence: input.cloudLowConfidence,
      cloudText: currentText,
      complexMath: looksLikeComplexFormulaQuestion(currentText),
    })
  ) {
    return null
  }

  input.progress?.(88)
  try {
    const p2t = await extractWithPix2TextClient(input.file, { signal: input.signal })
    if (!p2t.text?.trim()) return null
    const candidates = []
    if (currentText) {
      candidates.push({
        text: polishExtractedText(currentText, input.currentEngine === 'pix2text' ? 'pix2text' : 'cloud-vision'),
        raw: currentText,
        source: input.currentEngine || 'cloud-vision',
      })
    }
    candidates.push({
      text: polishExtractedText(p2t.text, 'pix2text'),
      raw: p2t.text,
      source: 'pix2text',
    })
    const best = pickBestOcrCandidate(candidates)
    const weakness = scoreLocalOcrWeakness(best.text)
    const usedPix2 = best.source === 'pix2text'
    return {
      text: best.text,
      engine: usedPix2 ? 'pix2text' : input.currentEngine || 'cloud-vision',
      ocrWeakness: weakness,
      lowConfidence: weakness >= 55,
      questions: usedPix2 ? p2t.parsed : input.currentQuestions,
      validation: usedPix2 ? undefined : input.currentValidation,
      pix2textBeatLocal: usedPix2,
      cloudNote: usedPix2
        ? 'Pix2Text formula OCR used because cloud/local looked weak on nested math — review before Save.'
        : undefined,
    }
  } catch (err) {
    if (isAbortError(err)) throw err
    console.warn('[TestVantages] Pix2Text priority route skipped:', err)
    return null
  }
}

/** Layer labels for admin / tour (Grok 6-layer map). */
export const GROK_HYBRID_STACK_LAYERS = [
  { layer: 1, name: 'Preprocess', detail: 'Deskew, contrast, downscale, watermark fade' },
  { layer: 2, name: 'Formula OCR', detail: 'Pix2Text Docker sidecar + browser ONNX LaTeX crops' },
  { layer: 3, name: 'Full-page OCR', detail: 'Tesseract layout + mathpix-style line split' },
  { layer: 4, name: 'Ensemble', detail: 'Score local vs Pix2Text — pickBestOcrCandidate' },
  { layer: 5, name: 'Validate & repair', detail: 'KaTeX check, LaTeX repair, PCMB healers' },
  { layer: 6, name: 'Cloud runtime', detail: 'Gemini/OpenAI extract + metatags; soft-fail → Needs review' },
]

/**
 * Combined OCR stack readiness (browser calls API).
 * @param {{ vision?: object, pix2text?: object }} parts
 */
export function formatOcrStackStatusMessage(parts = {}) {
  const lines = []
  if (parts.vision?.configured) {
    lines.push(`Cloud AI: ${parts.vision.ready ? 'ready' : 'key set, check server'}`)
  } else {
    lines.push('Cloud AI: off (add GEMINI_API_KEY to .env)')
  }
  if (parts.pix2text?.enabled) {
    lines.push(`Pix2Text: ${parts.pix2text.ready ? 'ready' : 'enabled but not running'}`)
  } else {
    lines.push('Pix2Text: off')
  }
  lines.push('Local hybrid: always on in browser')
  return lines.join(' · ')
}
