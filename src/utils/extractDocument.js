import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.min.mjs'
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import mammoth from 'mammoth'
import { recognizeWithMathpix } from './mathpixOcr.js'
import { runMathpixThenGemini, structureTextThenMaybeSave } from './mathpixGeminiPipeline.js'
import { loadOcrOutputFormat } from './ocrOutputFormat.js'
import { withOcrTimeout } from './ocrTimeout.js'
import { throwIfAborted } from './ocrAbort.js'
import { normalizeMathText } from './normalizeMathText.js'
import { polishExtractedText } from './ocrExtractPolish.js'
import { resolveOcrEngine } from './ocrSettings.js'
import { mapConcurrent } from './ocrConcurrency.js'
import { throttleProgress } from './throttleProgress.js'
import { buildMcqPreviewContext } from './repairMcqOption.js'
import { polishMcqOptionBody } from './polishMcqOptionBody.js'
import {
  BOOK_OCR_MAX_PAGES,
  BOOK_OCR_MS_PER_PAGE,
  BOOK_PDF_RENDER_SCALE,
  HYBRID_OCR_TIMEOUT_MS,
  SINGLE_OCR_TIMEOUT_MS,
  SINGLE_PDF_RENDER_SCALE,
  ocrTimeoutForPdfPages } from './bookOcrConfig.js'
import { getCachedPdfPageCount, openPdfFromFile } from './pdfDocumentCache.js'
import { pdfItemsToPlainText, pdfItemsToPolishedText, pdfTextLayerNeedsMathBoost } from './pdfMathTextLayer.js'
import { stripPdfExtractWatermarks, pdfTextLayerLooksIncomplete, pickBetterPdfText } from './stripImageWatermarkOcr.js'
import {
  extractDocxTextWithMath,
  wordExtractLooksBroken,
} from './wordOmmlExtract.js'
import { repairWordSymbolFontText } from './wordSymbolFont.js'
import { ocrEngineBadgeLabel } from './cloudVisionClient.js'
import { extractTextFromPptx, isPptxFile } from './pptExtract.js'
import { readPrintedAnswerKey } from './printedAnswerKey.js'

export { wordExtractLooksBroken } from './wordOmmlExtract.js'
export { repairWordSymbolFontText } from './wordSymbolFont.js'
export { isPptxFile } from './pptExtract.js'
export { ocrEngineBadgeLabel } from './cloudVisionClient.js'

export {
  BOOK_OCR_MAX_PAGES,
  BOOK_OCR_MS_PER_PAGE,
  HYBRID_OCR_TIMEOUT_MS,
  SINGLE_OCR_TIMEOUT_MS,
  ocrTimeoutForPdfPages }

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']
const PDF_TYPE = 'application/pdf'
const DOCX_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** Weak text layer → run OCR (scanned pages). */
const MIN_TEXT_LAYER_CHARS = 80

/** @param {File | Blob} file */
export async function getPdfPageCount(file) {
  return getCachedPdfPageCount(file)
}

/** @param {File | Blob} file */
async function resolveOcrTimeoutForFile(file) {
  if (isPdfFile(file)) {
    try {
      return ocrTimeoutForPdfPages(await getCachedPdfPageCount(file))
    } catch {
      return ocrTimeoutForPdfPages(BOOK_OCR_MAX_PAGES)
    }
  }
  return SINGLE_OCR_TIMEOUT_MS
}

/**
 * @param {string} textLayer
 * @param {string} ocrText
 */
function mergePdfTextLayerAndOcr(textLayer, ocrText) {
  const best = pickBetterPdfText(textLayer, ocrText)
  const other = best === textLayer.trim() || best === String(textLayer ?? '').trim() ? ocrText : textLayer
  // Keep a short supplement only when the loser still adds option labels the winner lacks
  const winnerOpts = (best.match(/\(\s*[A-D]\s*\)/gi) ?? []).length
  const loserOpts = (String(other ?? '').match(/\(\s*[A-D]\s*\)/gi) ?? []).length
  if (loserOpts >= winnerOpts + 2 && String(other ?? '').trim().length > 30) {
    return `${best}\n\n<!-- OCR supplement -->\n${other}`
  }
  return best
}

export function isImageFile(file) {
  return IMAGE_TYPES.includes(file.type) || /\.(png|jpe?g|webp|gif)$/i.test(file.name)
}

export function isPdfFile(file) {
  return file.type === PDF_TYPE || /\.pdf$/i.test(file.name)
}

export function isWordFile(file) {
  return file.type === DOCX_TYPE || /\.docx$/i.test(file.name)
}

export function isSupportedUpload(file) {
  return isImageFile(file) || isPdfFile(file) || isWordFile(file) || isPptxFile(file)
}

/** @returns {string} */
export function getActiveOcrEngineLabel() {
  return 'Mathpix OCR (PDF / image / handwriting). Local AI splits. Gemini fills tags, answers, solutions — not OCR.'
}

export { polishOcrText, polishExtractedText, polishCloudVisionText } from './ocrExtractPolish.js'

/**
 * Polish one MCQ option with question context (for $$1$ → correct fraction/sqrt).
 * @param {string} option
 * @param {string} letter A–D
 * @param {string} [questionContext]
 */
/** @deprecated Use polishMcqOptionBody — full polishOcrText corrupts multi-part options. */
export function polishMcqOption(option, letter, questionContext = '', stem = '') {
  return polishMcqOptionBody(option, letter, questionContext, stem)
}

/** Polish all parsed MCQ options using full question + OCR context. */
export function polishParsedMcqOptions(questionText, options, extractedRaw = '') {
  const stem = String(questionText ?? '').trim()
  const ctx = buildMcqPreviewContext({
    extractedRaw,
    questionText: stem,
    options,
    forOptionRepair: true })
  const list = [...(options ?? [])]
  while (list.length < 4) list.push('')
  // Recover D when OCR glued it onto C: "2 ®D) None of these"
  const cRaw = String(list[2] ?? '')
  const mergedCd = cRaw.match(
    /^(.+?)\s*(?:®|Ⓡ)?\s*(?:\(?\s*[Dd]\s*\)|[Dd]\s*\))\s*(None\s+of\s+these|All\s+of\s+these|None\s+of\s+the\s+above)\s*$/i,
  )
  if (mergedCd) {
    list[2] = mergedCd[1].trim()
    if (!String(list[3] ?? '').trim() || /\(Graph\/diagram/i.test(String(list[3]))) {
      list[3] = mergedCd[2].trim()
    }
  }
  return list.slice(0, 4).map((o, i) =>
    polishMcqOptionBody(String(o ?? '').trim(), String.fromCharCode(65 + i), ctx, stem),
  )
}

export { buildMcqPreviewContext, formatMcqExtractBlock } from './repairMcqOption.js'

/** @param {File} file */
export async function extractTextFromWord(file) {
  const buffer = await file.arrayBuffer()
  try {
    // Rewrite Word equation objects (OMML) → $LaTeX$ before mammoth, else math becomes �.
    const withMath = await extractDocxTextWithMath(buffer)
    return normalizeMathText(withMath)
  } catch (err) {
    console.warn('[TestVantages] Word OMML extract failed, falling back to raw text:', err)
    const { value } = await mammoth.extractRawText({ arrayBuffer: buffer })
    return normalizeMathText(repairWordSymbolFontText(String(value ?? '').trim()))
  }
}

async function pdfPageToBlob(page, scale = 3.5) {
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport }).promise
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Failed to render PDF page'))
    }, 'image/png')
  })
}

/**
 * @param {Blob} blob
 * @param {(pct: number) => void} [onProgress]
 * @param {number} [pageIndex] for PDF multi-page progress
 * @param {number} [pageTotal]
 * @param {AbortSignal} [signal]
 */
async function runPageOcr(blob, onProgress, pageIndex = 0, pageTotal = 1, signal, bookMode = false, sourceFile = null) {
  throwIfAborted(signal)
  void bookMode
  void sourceFile
  const pageBase = pageTotal > 1 ? (pageIndex / pageTotal) * 100 : 0
  const pageSpan = pageTotal > 1 ? 100 / pageTotal : 100

  const wrapProgress = (pct) => {
    if (onProgress) onProgress(Math.round(pageBase + (pct / 100) * pageSpan))
  }

  return recognizeWithMathpix(blob, wrapProgress, { signal })
}

/** @param {File} file @param {(pct: number) => void} [onProgress] @param {AbortSignal} [signal] */
export async function extractTextFromImage(file, onProgress, signal) {
  onProgress?.(1)
  return runPageOcr(file, onProgress, 0, 1, signal)
}

function yieldToUi() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve())
    else setTimeout(resolve, 0)
  })
}

function raceOrSkip(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('pdf-page-timeout')), ms)
    Promise.resolve(promise).then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}

/**
 * @param {File | Blob} file
 * @param {(pct: number) => void} [onProgress]
 * @param {AbortSignal} [signal]
 * @param {{ maxPages?: number, bookMode?: boolean, textLayerOnly?: boolean }} [opts]
 */
export async function extractTextFromPdf(file, onProgress, signal, opts = {}) {
  throwIfAborted(signal)
  const { pdf, numPages } = await openPdfFromFile(file, signal)
  const cap = Math.min(numPages, opts.maxPages ?? BOOK_OCR_MAX_PAGES)
  const engine = resolveOcrEngine()
  const preferOcr = engine === 'mathpix'
  // Single-page question PDFs always use high-quality OCR (ignore caller bookMode).
  const bookMode = numPages > 1
  const renderScale = bookMode ? BOOK_PDF_RENDER_SCALE : SINGLE_PDF_RENDER_SCALE

  if (opts.textLayerOnly) {
    const parts = []
    for (let i = 1; i <= cap; i++) {
      if (signal?.aborted) break
      onProgress?.(Math.round(((i - 1) / Math.max(1, cap)) * 100))
      try {
        const page = await raceOrSkip(pdf.getPage(i), 4000)
        const content = await raceOrSkip(page.getTextContent(), 3000)
        const layer = pdfItemsToPlainText(content.items)
        if (layer) parts.push(layer)
      } catch {
        /* skip a hung/broken page; keep the rest so upload does not die at 6% */
      }
      await yieldToUi()
    }
    onProgress?.(100)
    return stripPdfExtractWatermarks(parts.join('\n\n--- page ---\n\n').trim())
  }

  /** @type {{ page: import('pdfjs-dist').PDFPageProxy, textLayer: string }[]} */
  const scanned = []
  let weakPages = 0

  for (let i = 1; i <= cap; i++) {
    throwIfAborted(signal)
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const textLayer = pdfItemsToPolishedText(content.items)
    if (textLayer.length < MIN_TEXT_LAYER_CHARS) weakPages++
    scanned.push({ page, textLayer })
  }

  if (!preferOcr && weakPages === 0) {
    const textOnly = scanned
      .map((s) => s.textLayer)
      .filter(Boolean)
      .join('\n\n--- page ---\n\n')
      .trim()
    const needsMathRaster = scanned.some((s) => pdfTextLayerNeedsMathBoost(s.textLayer))
    const incomplete = scanned.some((s) => pdfTextLayerLooksIncomplete(s.textLayer))
    // Single-page question PDFs: prefer raster OCR for better math / stem quality
    const forceOcr = incomplete || (numPages === 1 && !preferOcr)
    if (textOnly.length > 50 && !needsMathRaster && !forceOcr) {
      onProgress?.(100)
      return stripPdfExtractWatermarks(textOnly)
    }
  }

  const parts = new Array(scanned.length).fill('')
  const total = scanned.length
  /** @type {{ idx: number, page: import('pdfjs-dist').PDFPageProxy, textLayer: string }[]} */
  const ocrJobs = []

  for (let idx = 0; idx < scanned.length; idx++) {
    const { page, textLayer } = scanned[idx]
    const needsOcr =
      preferOcr ||
      textLayer.length < MIN_TEXT_LAYER_CHARS ||
      pdfTextLayerNeedsMathBoost(textLayer) ||
      pdfTextLayerLooksIncomplete(textLayer) ||
      numPages === 1
    if (!needsOcr && textLayer.length > 0) {
      parts[idx] = textLayer
      continue
    }
    ocrJobs.push({ idx, page, textLayer })
  }

  let ocrFinished = 0
  const PDF_PAGE_OCR_CONCURRENCY = 2

  await mapConcurrent(ocrJobs, PDF_PAGE_OCR_CONCURRENCY, async ({ idx, page, textLayer }) => {
    throwIfAborted(signal)
    const blob = await pdfPageToBlob(page, renderScale)
    const ocrText = await runPageOcr(blob, onProgress, idx, total, signal, bookMode, file)

    if (engine === 'mathpix') {
      parts[idx] = ocrText || textLayer
    } else if (textLayer.length > 30 && ocrText.length > 30) {
      parts[idx] = mergePdfTextLayerAndOcr(textLayer, ocrText)
    } else {
      parts[idx] = ocrText || textLayer
    }

    ocrFinished += 1
    const textOnlyDone = scanned.length - ocrJobs.length
    onProgress?.(
      Math.round(((textOnlyDone + ocrFinished) / total) * 100),
    )
  })

  onProgress?.(100)
  return stripPdfExtractWatermarks(parts.join('\n\n--- page ---\n\n').trim())
}

/**
 * Run built-in enhanced Tesseract + full math polish (no Mathpix API).
 * @param {File} file
 * @param {(pct: number) => void} [onProgress]
 * @param {AbortSignal} [signal]
 */
async function extractWithBuiltinOcr(file, onProgress, signal, opts = {}) {
  return extractTextFromFile(file, onProgress, { signal, skipTimeout: true, ...opts })
}

/** @typedef {'builtin' | 'word' | 'mathpix' | 'cloud-vision' | 'pix2text' | 'pptx'} McqExtractEngine */

/**
 * MCQ text from image/PDF/Office. Images and PDFs: Mathpix OCR, then Gemini structure.
 * Word/PPTX keep native text extract (already typed, not OCR).
 * @param {File} file
 * @param {(pct: number) => void} [onProgress]
 * @param {{ signal?: AbortSignal, bookMode?: boolean, saveToBank?: boolean, officialPyq?: boolean, paperMeta?: object, outputFormat?: 'latex' | 'word' }} [opts]
 * @returns {Promise<{ text: string, engine: McqExtractEngine, cloudNote?: string, lowConfidence?: boolean, ocrWeakness?: number, questions?: any[], savedDrafts?: any[] }>}
 */
export async function extractMcqFromImage(file, onProgress, opts = {}) {
  const { signal, saveToBank = false, officialPyq = false, paperMeta } = opts
  const run = async () => {
    const progress = throttleProgress(onProgress)

    if (isWordFile(file)) {
      progress?.(12)
      const text = await extractTextFromWord(file)
      progress?.(40)
      const structured = await structureTextThenMaybeSave(text, {
        signal,
        progress,
        format: 'word',
        saveToBank,
        deferSolutions: opts.deferSolutions === true,
        officialPyq,
        paperMeta,
        engine: 'word',
      })
      const printedAnswerKey = readPrintedAnswerKey(text)
      return {
        text: structured.text || text,
        questions: structured.questions,
        ...(printedAnswerKey.size ? { printedAnswerKey } : {}),
        engine: /** @type {McqExtractEngine} */ ('word'),
        cloudNote: structured.cloudNote,
        ocrWeakness: structured.ocrWeakness,
        lowConfidence: structured.lowConfidence,
        savedDrafts: structured.savedDrafts,
        instructionText: structured.instructionText,
        geminiMissing: structured.geminiMissing,
        format: structured.format,
      }
    }
    if (isPptxFile(file)) {
      progress?.(20)
      const text = await extractTextFromPptx(file)
      progress?.(100)
      return { text, engine: /** @type {McqExtractEngine} */ ('pptx') }
    }

    const format = opts.outputFormat === 'word' || opts.outputFormat === 'latex'
      ? opts.outputFormat
      : loadOcrOutputFormat()
    const result = await runMathpixThenGemini(file, {
      signal,
      progress,
      format,
      saveToBank,
      deferSolutions: opts.deferSolutions === true,
      officialPyq,
      paperMeta,
    })
    return {
      text: result.text,
      questions: result.questions,
      ...(result.printedAnswerKey ? { printedAnswerKey: result.printedAnswerKey } : {}),
      engine: /** @type {McqExtractEngine} */ ('mathpix'),
      cloudNote: result.cloudNote,
      ocrWeakness: result.ocrWeakness,
      lowConfidence: result.lowConfidence,
      savedDrafts: result.savedDrafts,
      instructionText: result.instructionText,
      mathpixMissing: result.mathpixMissing,
      geminiMissing: result.geminiMissing,
      format: result.format,
      docxBase64: result.docxBase64,
    }
  }

  const fileTimeout = await resolveOcrTimeoutForFile(file)
  const timeoutMs = officialPyq
    ? Number(opts.timeoutMs) > 0
      ? Number(opts.timeoutMs)
      : 6 * 60_000 + 40_000
    : Number(opts.timeoutMs) > 0
      ? Number(opts.timeoutMs)
      : fileTimeout
  const timeoutMinutes = Math.round(timeoutMs / 60_000)

  return withOcrTimeout(
    run(),
    officialPyq ? timeoutMs : Math.max(timeoutMs, 6 * 60 * 1000),
    signal?.aborted
      ? 'OCR cancelled.'
      : isPdfFile(file)
        ? 'Mathpix PDF OCR timed out. Try a smaller PDF, keep the bottom panel open, then press F5.'
        : `Mathpix OCR timed out after ${timeoutMinutes} minutes. Keep the bottom panel open, press F5, then try again.`,
  )
}

/** User-facing label after extractMcqFromImage */
export function describeMcqExtractResult({ engine, cloudNote, lowConfidence } = {}) {
  if (engine === 'word') {
    return 'Word text imported (equations → LaTeX when possible). Review math, then Save.'
  }
  if (engine === 'pptx') {
    return 'PowerPoint text imported from slides. Review options, then Save.'
  }
  if (engine === 'mathpix') {
    const warn = lowConfidence ? ' Review stem, options, answers, and tags before publish.' : ''
    return cloudNote
      ? `${cloudNote}${warn}`
      : `Mathpix read the page. Local AI split questions. Press Fill with Hybrid AI on Draft questions to add tags, answers, and solutions.${warn}`
  }
  if (engine === 'cloud-vision') {
    return 'Gemini is not used for OCR. Re-upload so Mathpix can read the PDF or image, then press Fill with Hybrid AI on Draft questions.'
  }
  if (engine === 'pix2text') {
    const warn = lowConfidence
      ? ' Formula OCR looks weak — check options C/D before Save.'
      : ''
    return `Converted with Pix2Text (formula OCR). Review preview, then Save.${warn}`
  }
  const badge = ocrEngineBadgeLabel(engine)
  const base = `Converted with ${badge}. Review preview, then Save.`
  if (lowConfidence) {
    return `${base} Warning: text looks garbled — fix options or retry Convert image → text.`
  }
  if (cloudNote && /AI extract failed/i.test(cloudNote)) {
    return `${base} ${cloudNote}`
  }
  return cloudNote ? `${base} ${cloudNote}` : base
}

/**
 * Built-in LaTeX-aware extract from image/PDF.
 * @param {File} file
 * @param {(pct: number) => void} [onProgress]
 * @param {{ signal?: AbortSignal }} [opts]
 */
export async function extractLatexFromImage(file, onProgress, opts = {}) {
  const { signal } = opts
  const result = await extractMcqFromImage(file, onProgress, { signal })
  if (!result.text?.trim()) {
    // Soft fail — hybrid stack returns empty; callers show Needs review, not raw Error.
    return ''
  }
  return polishExtractedText(result.text, result.engine)
}

/** @deprecated Use extractLatexFromImage */
export const extractLatexWithMathpix = extractLatexFromImage

/** @param {File} file @param {(pct: number) => void} [onProgress] @param {{ signal?: AbortSignal, bookMode?: boolean, maxPages?: number }} [opts] */
export async function extractTextFromFile(file, onProgress, opts = {}) {
  const progress = throttleProgress(onProgress)
  const { signal, bookMode, maxPages, skipTimeout = false } = opts
  const run = async () => {
    throwIfAborted(signal)
    if (isWordFile(file)) return extractTextFromWord(file)
    if (isPptxFile(file)) return extractTextFromPptx(file)
    if (isPdfFile(file) || isImageFile(file)) {
      const result = await extractMcqFromImage(file, progress, { signal, saveToBank: false })
      return result.text || ''
    }
    throw new Error('Unsupported file. Use Word (.docx), PowerPoint (.pptx), PDF, PNG, or JPG.')
  }

  if (skipTimeout) return run()

  const timeoutMs = await resolveOcrTimeoutForFile(file)
  const timeoutMinutes = Math.round(timeoutMs / 60_000)

  return withOcrTimeout(
    run(),
    timeoutMs,
    signal?.aborted
      ? 'OCR cancelled.'
      : isPdfFile(file)
        ? `Book OCR timed out after processing. Use a PDF under ${BOOK_OCR_MAX_PAGES} pages or split the file.`
        : `OCR timed out after ${timeoutMinutes} minutes. Check your internet (first run downloads the LaTeX model).`,
  )
}

export function createPreviewUrl(file) {
  return URL.createObjectURL(file)
}
