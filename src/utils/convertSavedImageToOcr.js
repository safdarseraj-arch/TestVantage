import { extractMcqFromImage } from './extractDocument.js'
import { polishExtractedText } from './ocrExtractPolish.js'
import { parseSingleQuestionUpload } from './parseSingleQuestionUpload.js'
import { finalizeStemForBank } from './persistUpload.js'
import { dataUrlToFile } from './dataUrlToFile.js'
import { IMAGE_OPTION_LABELS, isHybridQuestion } from './imageQuestion.js'
import { isPassageLinkedQuestion } from './passage.js'
import {
  isUltraLowConfidenceOcr,
  scoreLocalOcrWeakness,
} from './cloudVisionParse.js'
import {
  stemLikelyNeedsDiagramImage,
  stemTextCompleteWithoutVisualFigure,
} from './stemDiagramDetect.js'
import {
  blobHasTypedTextMcqOptions,
  looksLikeContinuityDiscontinuityTextMcq,
  shouldStripMistakenOptionCrops,
} from './graphOptionOcr.js'
import { recoverTextMcqFromFullOcr } from './uploadPipeline.js'
import { latexExtractionIncomplete } from './healTruncatedLatex.js'

/** @param {import('../data/tests').Question} q */
export function canOfferSavedImageOcr(q) {
  if (!q || q.questionType === 'matrix_match') return false
  if (isPassageLinkedQuestion(q) && q.passageId && !q.questionImage?.trim()) return false
  return (
    !!q.questionImage?.trim() ||
    !!q.optionsImage?.trim() ||
    (Array.isArray(q.optionImages) && q.optionImages.some((img) => img?.trim()))
  )
}

/**
 * @param {string} dataUrl
 * @param {string} id
 * @param {(pct: number) => void} [onProgress]
 * @param {AbortSignal} [signal]
 */
async function ocrBankImageDataUrl(dataUrl, id, onProgress, signal) {
  const file = await dataUrlToFile(dataUrl, `bank-${id || 'q'}.png`)
  return extractMcqFromImage(file, onProgress, { signal })
}

/**
 * @param {string} raw
 * @param {string} alt
 * @param {string} [engine] — must stay cloud-vision/mathpix when AI extract succeeded
 */
function parseOcrToFields(raw, alt, engine = 'builtin') {
  // Single polish with the extract engine — never re-run heavy builtin on Gemini LaTeX.
  const normalized = polishExtractedText(raw, engine)
  const parsed = parseSingleQuestionUpload(normalized, alt)
  if (parsed.multi) {
    // Prefer first usable block over hard Convert crash (PCMB multi-Q crops).
    const firstText = String(parsed.text ?? '').trim()
    const firstOpts = (parsed.options ?? []).map((o) => String(o ?? '').trim())
    while (firstOpts.length < 4) firstOpts.push('')
    if (firstText || firstOpts.some(Boolean)) {
      return {
        multi: false,
        text: firstText,
        options: firstOpts.slice(0, 4),
        optionsFound: firstOpts.filter(Boolean).length,
        complete: firstOpts.filter(Boolean).length >= 4,
        needsReview: true,
      }
    }
    // Soft fail — never throw raw Error into Convert UI.
    return {
      multi: false,
      text: String(normalized ?? '').trim().slice(0, 4000),
      options: ['', '', '', ''],
      optionsFound: 0,
      complete: false,
      needsReview: true,
    }
  }
  return parsed
}

/**
 * Convert a saved bank image question to OCR text (stem + options).
 * Prefers Cloud vision when configured; refuses ultra-garbled local OCR as final.
 * @param {import('../data/tests').Question} question
 * @param {(pct: number) => void} [onProgress]
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<Partial<import('../data/tests').Question> & { ocrEngine?: string, ocrWeakness?: number, lowConfidence?: boolean, cloudNote?: string }>}
 */
export async function convertSavedImageToOcr(question, onProgress, opts = {}) {
  const { signal } = opts
  const q = question
  if (!canOfferSavedImageOcr(q)) {
    // Soft fail — Convert UX must never show a raw Error for a missing image.
    return {
      text: String(q?.text ?? '').trim(),
      ocrConvertedAt: Date.now(),
      ocrEngine: 'builtin',
      ocrWeakness: 99,
      lowConfidence: true,
      cloudNote:
        'This question has no image to convert. Needs review — attach a screenshot or type the question.',
    }
  }

  let rawOcr = ''
  let engine = 'builtin'
  let cloudNote = ''
  let ocrWeakness = 0
  let lowConfidence = false
  let parsed = /** @type {ReturnType<typeof parseSingleQuestionUpload>} */ ({
    multi: false,
    text: '',
    options: ['', '', '', ''],
    optionsFound: 0,
    complete: false,
  })

  if (q.questionImage?.trim()) {
    const result = await ocrBankImageDataUrl(
      q.questionImage,
      q.id ?? 'stem',
      (pct) => onProgress?.(Math.round(pct * 0.85)),
      signal,
    )
    engine = result.engine || 'builtin'
    cloudNote = result.cloudNote || ''
    ocrWeakness = result.ocrWeakness ?? scoreLocalOcrWeakness(result.text)
    lowConfidence = !!result.lowConfidence || isUltraLowConfidenceOcr(result.text)
    rawOcr = String(result.text ?? '')
      .replace(/\r\n/g, '\n')
      .trim()
    if (!rawOcr) {
      // Soft fail — never blank Convert with a raw throw when AI already tried.
      lowConfidence = true
      cloudNote =
        (cloudNote ? `${cloudNote} ` : '') +
        'No text found in the question image. Needs review — try a clearer crop, or type the question manually.'
      return {
        text: '',
        stemTextInImage: true,
        ocrConvertedAt: Date.now(),
        ocrEngine: engine,
        ocrWeakness: ocrWeakness || 99,
        lowConfidence: true,
        cloudNote,
      }
    }
    // Prefer structured Gemini stem+options when present (avoids re-parse wipe).
    const visionQ = Array.isArray(result.questions) ? result.questions[0] : null
    if (
      visionQ &&
      (String(visionQ.text ?? '').trim() ||
        (visionQ.options ?? []).some((o) => String(o ?? '').trim()))
    ) {
      const opts = (visionQ.options ?? []).map((o) => String(o ?? '').trim())
      while (opts.length < 4) opts.push('')
      parsed = {
        multi: false,
        text: String(visionQ.text ?? '').trim(),
        options: opts.slice(0, 4),
        optionsFound: opts.filter(Boolean).length,
        complete: opts.filter(Boolean).length >= 4,
        correctIndex: visionQ.correctIndex,
        correctIndices: visionQ.correctIndices,
      }
    } else {
      parsed = parseOcrToFields(rawOcr, rawOcr, engine)
      if (parsed.needsReview) {
        lowConfidence = true
        cloudNote =
          (cloudNote ? `${cloudNote} ` : '') +
          'Multiple questions detected — used the first block. Needs review; crop one question for best results.'
      }
    }
    // Prefer returning fields even when weak — caller shows review warnings.
    // Only escalate ultra-garbled Local OCR as lowConfidence (do not blank Convert).
    if (
      engine !== 'cloud-vision' &&
      isUltraLowConfidenceOcr(parsed.text || rawOcr) &&
      scoreLocalOcrWeakness(parsed.text || rawOcr) >= 70 &&
      !(parsed.optionsFound >= 2 && String(parsed.text || '').trim().length > 20)
    ) {
      lowConfidence = true
      cloudNote =
        (cloudNote ? `${cloudNote} ` : '') +
        'Extraction looks unreadable (garbled math). Needs review — edit stem/options or retry Convert with Cloud vision.'
    } else if (lowConfidence && engine !== 'cloud-vision' && !cloudNote) {
      cloudNote =
        'Extraction looks weak — review stem and options carefully before Save, or retry Convert with Cloud vision.'
    }
  }

  const optionsFound = parsed.optionsFound ?? parsed.options?.filter((o) => o?.trim()).length ?? 0

  if (optionsFound < 2 && q.optionsImage?.trim()) {
    const { text, engine: eng } = await ocrBankImageDataUrl(
      q.optionsImage,
      `${q.id ?? 'q'}-opts`,
      (pct) => onProgress?.(85 + Math.round(pct * 0.1)),
      signal,
    )
    const optRaw = text.replace(/\r\n/g, '\n').trim()
    if (optRaw) {
      const optParsed = parseOcrToFields(optRaw, optRaw, eng || engine)
      if ((optParsed.optionsFound ?? 0) >= 2) {
        parsed = {
          ...parsed,
          options: optParsed.options,
          optionsFound: optParsed.optionsFound,
          complete: optParsed.complete ?? parsed.complete,
          correctIndex: undefined,
          correctIndices: undefined,
        }
        if (
          optParsed.correctIndex != null &&
          String(optParsed.options?.[optParsed.correctIndex] ?? '').trim()
        ) {
          parsed.correctIndex = optParsed.correctIndex
        }
        if (optParsed.correctIndices?.length) {
          parsed.correctIndices = optParsed.correctIndices.filter((i) =>
            String(optParsed.options?.[i] ?? '').trim(),
          )
        }
      }
      rawOcr = rawOcr ? `${rawOcr}\n\n--- options ---\n\n${optRaw}` : optRaw
    }
  }

  const sepOpts = (q.optionImages ?? []).map((img) => String(img ?? '').trim())
  if ((parsed.optionsFound ?? 0) < 2 && sepOpts.some(Boolean)) {
    const merged = [...(parsed.options ?? ['', '', '', ''])]
    while (merged.length < 4) merged.push('')
    let idx = 0
    for (let i = 0; i < sepOpts.length && i < 4; i++) {
      if (!sepOpts[i]) continue
      const { text } = await ocrBankImageDataUrl(
        sepOpts[i],
        `${q.id ?? 'q'}-opt-${i}`,
        (pct) =>
          onProgress?.(
            95 + Math.round((pct / 100) * (5 / Math.max(1, sepOpts.filter(Boolean).length))),
          ),
        signal,
      )
      const line = text.replace(/\r\n/g, '\n').trim().split('\n').find(Boolean)?.trim()
      if (line) {
        merged[i] = line
        idx += 1
      }
    }
    if (idx >= 2) {
      parsed = { ...parsed, options: merged, optionsFound: idx, complete: parsed.complete }
    }
  }

  const options = (parsed.options ?? ['', '', '', '']).map((o) => String(o ?? '').trim())
  while (options.length < 4) options.push('')
  // Prefer recovered A–D text from full OCR over empty/"Option A" + image strips.
  if (
    options.filter(Boolean).length < 3 &&
    rawOcr &&
    (blobHasTypedTextMcqOptions(rawOcr) || looksLikeContinuityDiscontinuityTextMcq(rawOcr))
  ) {
    try {
      const recovered = recoverTextMcqFromFullOcr(parsed.text || '', options, rawOcr)
      if ((recovered.found ?? 0) >= 2) {
        for (let i = 0; i < 4; i++) {
          const t = String(recovered.options?.[i] ?? '').trim()
          if (t) options[i] = t
        }
        if (recovered.stem?.trim()) {
          parsed = { ...parsed, text: recovered.stem.trim() }
        }
      }
    } catch {
      /* keep parsed options */
    }
  }
  const stemOptions = options.some((o) => o) ? options : q.options ?? []
  const stem =
    parsed.text?.trim() ||
    (rawOcr ? finalizeStemForBank(rawOcr.split('\n').slice(0, 12).join('\n'), stemOptions) : '')

  if (!stem?.trim()) {
    const partialFilled = options.filter((o) => o).length
    lowConfidence = true
    cloudNote =
      (cloudNote ? `${cloudNote} ` : '') +
      'OCR ran but no question text could be parsed. Needs review — edit manually or retry Convert with a clearer image.'
    return {
      text: rawOcr ? finalizeStemForBank(rawOcr.slice(0, 2000), stemOptions) : '',
      stemTextInImage: !!rawOcr,
      ocrConvertedAt: Date.now(),
      ocrEngine: engine,
      ocrWeakness: ocrWeakness || 80,
      lowConfidence: true,
      cloudNote,
      options: partialFilled >= 2 ? options.slice(0, 4) : undefined,
    }
  }

  if (isUltraLowConfidenceOcr(stem) && options.filter(Boolean).length < 2) {
    lowConfidence = true
    cloudNote =
      (cloudNote ? `${cloudNote} ` : '') +
      'Extraction confidence is low (garbled stem / missing options). Needs review — edit before Save or retry with Cloud vision.'
  }

  /** @type {Partial<import('../data/tests').Question> & { ocrEngine?: string, ocrWeakness?: number, lowConfidence?: boolean, cloudNote?: string }} */
  const updates = {
    text: finalizeStemForBank(stem, stemOptions),
    stemTextInImage: false,
    ocrConvertedAt: Date.now(),
    ocrEngine: engine,
    ocrWeakness,
    lowConfidence,
    cloudNote: cloudNote || undefined,
  }

  const filledOpts = options.filter((o) => o).length
  if (filledOpts >= 2) {
    updates.options = options.slice(0, 4)
    if (
      parsed.correctIndex != null &&
      String(options[parsed.correctIndex] ?? '').trim()
    ) {
      updates.correctIndex = parsed.correctIndex
    }
    if (parsed.correctIndices?.length) {
      const safe = parsed.correctIndices.filter((i) => String(options[i] ?? '').trim())
      if (safe.length) updates.correctIndices = safe
    }
    if (parsed.suggestedQuestionType === 'multiple_correct') {
      updates.questionType = 'multiple_correct'
      if (parsed.suggestedCorrectIndices?.length) {
        updates.correctIndices = parsed.suggestedCorrectIndices.filter((i) =>
          String(options[i] ?? '').trim(),
        )
      }
    }
  } else if (isHybridQuestion(q) && (q.options ?? []).every((o) => IMAGE_OPTION_LABELS.includes(o))) {
    updates.options = options.slice(0, 4)
  }

  if (parsed.solution?.trim()) updates.solution = parsed.solution

  if (latexExtractionIncomplete(updates.text)) {
    updates.lowConfidence = true
    updates.needsReview = true
    updates.cloudNote =
      (updates.cloudNote ? `${updates.cloudNote} ` : '') +
      'Extraction incomplete — do not approve. Edit the stem or retry Convert. Missing math was not invented.'
  }

  const nextOpts = filledOpts >= 2 ? options : q.options ?? []
  const textOnlyComplete = stemTextCompleteWithoutVisualFigure({
    text: stem,
    options: nextOpts,
    questionType: updates.questionType ?? q.questionType ?? 'single_correct',
    optionImages: q.optionImages,
  })
  const keepDiagram =
    !textOnlyComplete &&
    q.stemImageCrop === true &&
    !!q.questionImage?.trim() &&
    stemLikelyNeedsDiagramImage(stem, '', { questionType: q.questionType ?? 'single_correct' })
  const optGraphCount = (q.optionImages ?? []).filter((u) => !!String(u ?? '').trim()).length
  const stripOptCrops =
    shouldStripMistakenOptionCrops(stem, nextOpts, q.optionImages ?? [], rawOcr) ||
    blobHasTypedTextMcqOptions(`${stem}\n${rawOcr}`) ||
    looksLikeContinuityDiscontinuityTextMcq(`${stem}\n${rawOcr}`)

  if (textOnlyComplete || (!keepDiagram && filledOpts >= 2 && stem.length > 15 && !lowConfidence)) {
    updates.questionImage = ''
    updates.stemImageCrop = false
    updates.stemTextInImage = false
    updates.contentMode = ''
    if (optGraphCount >= 2 && !stripOptCrops) {
      // Graph-option questions: clear stem image only; keep A–D crops.
      updates.optionImages = q.optionImages
      if (q.optionsImage) updates.optionsImage = q.optionsImage
    } else {
      updates.optionsImage = ''
      updates.optionImages = ['', '', '', '']
    }
  } else if (keepDiagram) {
    updates.contentMode = 'hybrid'
    if (stripOptCrops) {
      updates.optionsImage = ''
      updates.optionImages = ['', '', '', '']
    }
  } else if (stripOptCrops) {
    updates.optionsImage = ''
    updates.optionImages = ['', '', '', '']
  }

  return updates
}
