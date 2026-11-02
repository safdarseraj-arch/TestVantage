/**
 * Canonical upload extract pipeline — OCR polish, MCQ parse, recovery, image plan.
 * All upload/save paths should use these helpers (not ad-hoc polish + parse in UI).
 *
 * @see .cursor/rules/question-upload-pipeline.mdc
 * @see uploadRegressionContracts.js — UPLOAD_SMOKE_FIXTURES
 */

import { polishExtractedText, polishOcrText } from './ocrExtractPolish.js'
import { parseSingleQuestionUpload } from './parseSingleQuestionUpload.js'
import { normalizeOptionMarkersInText, findOptionsBlockStart } from './mcqOptionMarkers.js'
import { finalizeStemForBank } from './stemBankGuard.js'
import {
  countRealMcqOptions,
  looksLikeUnusableOcrSoup,
  shouldAttemptDiagramAutoCrop,
  shouldShowQuestionStemImage } from './stemDiagramDetect.js'
import { looksLikeLeakedOptionBand } from './splitStemAndGarbledOptions.js'
import {
  countGraphOptionsNeedingImage,
  optionsAreTextOnlyMcq,
  shouldAttemptOptionsAutoCrop,
  shouldSkipOptionsAutoCrop,
  stemSaysOptionsAreFigures,
  blobMentionsGraphOptions } from './graphOptionOcr.js'
import { classifyMcqImageLayout } from './mcqImageLayoutPlan.js'
import { looksLikeMatchColumnUpload } from './parseMatchColumnUpload.js'
import { looksLikePassageMultiMcq } from './parsePassageUpload.js'
import { looksLikeZ5ImaginaryRootsExpDeterminantMcq } from './repairZ5ImaginaryRootsExpDeterminantMcqOcr.js'
import { looksLikeDeterminantMcq } from './repairDeterminantMcqOcr.js'
import { looksLikeCompositionIdentityMcq } from './repairCompositionMcqOcr.js'
import { looksLikeTrigPeriodMcq } from './repairTrigPeriodMcqOcr.js'
import { looksLikeDeterminantQuestion } from './repairDeterminantOcr.js'
import { tryMcqParseFromCachedLineData, geometryParseSource } from './ocrLineDataCache.js'
import { runStructureAwareParse } from './structureAwareUpload.js'
import { healStoredMcqQuestion } from './healStoredMcq.js'
import { repairDomainGreatestIntegerMcqParse } from './repairDomainGreatestIntegerMcqOcr.js'
import {
  stripMistakenCropLeakFromStem } from './graphOptionOcr.js'
import { mcqLaterOptionsLookTruncated } from './mcqOptionCompleteness.js'

export { mcqLaterOptionsLookTruncated } from './mcqOptionCompleteness.js'

/** @param {string} text */
export function normalizeRawOcr(text) {
  return String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .trim()
}

/**
 * Pad/truncate to exactly 4 A–D slots (idempotent — never grows beyond 4).
 * @param {string[] | null | undefined} options
 * @returns {string[]}
 */
export function stabilizeMcqOptionSlots(options = []) {
  const next = (options ?? []).slice(0, 4).map((o) => String(o ?? '').trim())
  while (next.length < 4) next.push('')
  return next
}

/**
 * True when a second split yields the same A–D slots (no cascade / duplication).
 * @param {string[]} a
 * @param {string[]} b
 */
export function mcqOptionSplitIsIdempotent(a = [], b = []) {
  const left = stabilizeMcqOptionSlots(a)
  const right = stabilizeMcqOptionSlots(b)
  return left.every((o, i) => o === right[i])
}

/**
 * Merge a re-split into previous options without cascading errors.
 * Rejects all-identical duplicates and never shrinks a good 4-slot split.
 * @param {string[]} prevOptions
 * @param {string[]} nextOptions
 * @returns {string[]}
 */
export function mergeMcqOptionsIdempotent(prevOptions = [], nextOptions = []) {
  const prev = stabilizeMcqOptionSlots(prevOptions)
  const next = stabilizeMcqOptionSlots(nextOptions)
  const prevFilled = prev.filter(Boolean).length
  const nextFilled = next.filter(Boolean).length

  const nonEmpty = next.filter(Boolean)
  const unique = new Set(nonEmpty.map((o) => o.replace(/\s+/g, ' ').toLowerCase()))
  // Cascading failure: same body pasted into 3+ slots
  if (unique.size === 1 && nextFilled >= 3 && prevFilled >= 2) return prev
  // Do not replace a fuller split with a weaker one
  if (nextFilled < prevFilled && prevFilled >= 2) return prev
  // Prefer next when equal or better fill count
  if (nextFilled === 0 && prevFilled > 0) return prev
  // Reject next when C/D got truncated vs a fuller previous split
  if (
    prevFilled >= 4 &&
    !mcqLaterOptionsLookTruncated(prev) &&
    mcqLaterOptionsLookTruncated(next, prev.concat(next).join('\n'))
  ) {
    return prev
  }
  return next
}

/**
 * Pre-normalize pasted / OCR text before MCQ extract (markers, glued options).
 * @param {string} text
 */
export function preprocessUploadText(text) {
  const raw = normalizeRawOcr(text)
  if (!raw) return ''
  return normalizeOptionMarkersInText(raw)
}

/** @param {{ text?: string, options?: string[], optionsFound?: number, complete?: boolean, multi?: boolean }} parsed */
function mcqParseScore(parsed) {
  if (!parsed || parsed.multi) return -1
  const opts = parsed.options ?? []
  const found =
    parsed.optionsFound ?? opts.filter((o) => String(o ?? '').trim().length > 0).length
  const stemLen = String(parsed.text ?? '').trim().length
  let score = found * 120 + Math.min(stemLen, 600)
  if (parsed.complete) score += 80
  if (found >= 4) score += 60
  if (/\\begin\{vmatrix\}/.test(parsed.text ?? '')) score += 250
  if (stemLen < 15) score -= 100
  if (/\bf\s*fix\s*\)/i.test(parsed.text ?? '')) score -= 120
  if (/=\s*\.\s*and\s+g/i.test(parsed.text ?? '')) score -= 80
  if (/\\frac\{|\\ln\b/.test(parsed.text ?? '')) score += 30
  for (const o of opts) {
    if (/\\frac|\\ln|\\forall|\\cdot/i.test(String(o ?? ''))) score += 8
  }
  return score
}

/**
 * @param {string} raw
 * @param {{ engine?: string }} [opts]
 */
function collectMcqParseCandidates(raw, { engine = 'builtin', sourceFile = null } = {}) {
  /** @type {{ polished: string, parsed: ReturnType<typeof parseSingleQuestionUpload>, score: number, pass: string }[]} */
  const out = []
  const add = (polished, pass) => {
    const parsed = parseSingleQuestionUpload(polished, raw)
    out.push({ polished, parsed, score: mcqParseScore(parsed), pass })
  }

  if (sourceFile) {
    const structResult = runStructureAwareParse({ sourceFile, rawOcr: raw })
    if (structResult?.kind === 'mcq' && structResult.parsed && !structResult.parsed.multi) {
      const p = structResult.parsed
      const optBlock = (p.options ?? [])
        .map((o, i) => (String(o ?? '').trim() ? `(${String.fromCharCode(65 + i)}) ${String(o).trim()}` : ''))
        .filter(Boolean)
        .join('\n')
      const polished = optBlock ? `${p.text}\n${optBlock}` : p.text
      const structFound = p.optionsFound ?? 0
      out.push({
        polished,
        parsed: p,
        score:
          mcqParseScore(p) +
          (p.complete ? 220 : 50) +
          140 -
          Math.max(0, 4 - structFound) * 90,
        pass: 'document-structure' })
    }

    const geo = tryMcqParseFromCachedLineData(sourceFile, raw)
    if (geo && !geo.multi) {
      const optBlock = geo.options
        .map((o, i) => (String(o ?? '').trim() ? `(${String.fromCharCode(65 + i)}) ${String(o).trim()}` : ''))
        .filter(Boolean)
        .join('\n')
      const polished = optBlock ? `${geo.text}\n${optBlock}` : geo.text
      const pass = geometryParseSource(sourceFile)
      const geoBonus = pass === 'mathpix-word-geometry' ? 120 : 0
      const geoFound = geo.optionsFound ?? 0
      const incompletenessPenalty = Math.max(0, 4 - geoFound) * 95
      out.push({
        polished,
        parsed: geo,
        score: mcqParseScore(geo) + (geo.complete ? 200 : 40) + geoBonus - incompletenessPenalty,
        pass })
    }
  }

  add(polishExtractedText(raw, engine), 'polish')
  // Cloud AI LaTeX must not compete with the heavy local rewrite stack —
  // that stack can "win" on option-count score while destroying \\begin{cases}.
  if (engine !== 'cloud-vision' && engine !== 'mathpix') {
    const light = polishOcrText(raw)
    if (light && light !== out[0]?.polished) add(light, 'ocr-text')
  }

  const marked = normalizeOptionMarkersInText(raw)
  if (marked !== raw) {
    add(polishExtractedText(marked, engine), 'markers+polish')
    if (engine !== 'cloud-vision' && engine !== 'mathpix') {
      add(polishOcrText(marked), 'markers+ocr-text')
    }
    // Markers alone — catches "is (A) …" before heavy math polish mangles labels
    add(marked, 'markers-raw')
  } else if (engine !== 'cloud-vision' && engine !== 'mathpix') {
    // Still try a soft marker pass (idempotent) after light polish
    const light = polishOcrText(raw)
    const lightMarked = normalizeOptionMarkersInText(light || raw)
    if (lightMarked && lightMarked !== light && lightMarked !== raw) {
      add(lightMarked, 'light+markers')
    }
  }

  return out
}

/**
 * Best-effort MCQ extract with multi-pass recovery (LaTeX + option split).
 * @param {string} rawOcr
 * @param {{ engine?: string, minFound?: number }} [opts]
 */
export function processMcqUploadExtract(rawOcr, { engine = 'builtin', minFound = 0, sourceFile = null } = {}) {
  const raw = preprocessUploadText(rawOcr)
  if (!raw) {
    return {
      raw: '',
      polished: '',
      parsed: {
        multi: false,
        text: '',
        options: ['', '', '', ''],
        optionsFound: 0,
        complete: false },
      found: 0,
      complete: false,
      pass: 'empty' }
  }

  if (looksLikeMatchColumnUpload(raw)) {
    return {
      raw,
      polished: polishExtractedText(raw, engine),
      parsed: { multi: false, text: '', options: ['', '', '', ''], optionsFound: 0, complete: false },
      found: 0,
      complete: false,
      pass: 'matrix-deferred',
      matrixHint: true }
  }

  if (looksLikePassageMultiMcq(raw)) {
    if (
      !looksLikeZ5ImaginaryRootsExpDeterminantMcq(raw) &&
      !looksLikeDeterminantMcq(raw) &&
      !looksLikeCompositionIdentityMcq(raw) &&
      !looksLikeTrigPeriodMcq(raw)
    ) {
      return {
        raw,
        polished: polishExtractedText(raw, engine),
        parsed: { multi: false, text: '', options: ['', '', '', ''], optionsFound: 0, complete: false },
        found: 0,
        complete: false,
        pass: 'passage-deferred',
        passageHint: true }
    }
  }

  const primaryPolished = polishExtractedText(raw, engine)
  const primaryParsed = parseSingleQuestionUpload(primaryPolished, raw)
  if (primaryParsed.multi) {
    return {
      raw,
      polished: primaryPolished,
      parsed: primaryParsed,
      found: 0,
      complete: false,
      pass: 'bulk' }
  }

  const candidates = collectMcqParseCandidates(raw, { engine, sourceFile })
  let best = candidates[0]
  for (const c of candidates) {
    if (c.score > (best?.score ?? -1)) best = c
  }
  const geoComplete = candidates.find(
    (c) =>
      (c.pass === 'mathpix-line-geometry' || c.pass === 'mathpix-word-geometry') &&
      c.parsed?.complete &&
      !c.parsed?.multi,
  )
  if (
    geoComplete &&
    best?.pass !== 'mathpix-line-geometry' &&
    best?.pass !== 'mathpix-word-geometry' &&
    geoComplete.score >= (best?.score ?? 0) - 120
  ) {
    best = geoComplete
  }

  if (!best || best.parsed.multi) {
    return {
      raw,
      polished: polishExtractedText(raw, engine),
      parsed: best?.parsed ?? { multi: true, text: '', options: ['', '', '', ''], optionsFound: 0 },
      found: 0,
      complete: false,
      pass: best?.pass ?? 'none' }
  }

  const parsed = best.parsed
  const found =
    parsed.optionsFound ??
    (parsed.options ?? []).filter((o) => String(o ?? '').trim().length > 0).length
  const stem = String(parsed.text ?? '').trim()

  if (found <= minFound && !stem) {
    return {
      raw,
      polished: best.polished,
      parsed,
      found,
      complete: !!parsed.complete,
      pass: best.pass,
      weak: true }
  }

  return {
    raw,
    polished: best.polished,
    parsed,
    found,
    complete: !!parsed.complete || found >= 4,
    pass: best.pass }
}

/**
 * Re-parse stem + A–D from full-page OCR after mistaken option crops are removed.
 * @param {string} stem
 * @param {string[]} options
 * @param {string} rawOcr
 * @param {File | Blob | null} [sourceFile]
 */
export function recoverTextMcqFromFullOcr(stem, options = [], rawOcr = '', sourceFile = null) {
  const blob = String(rawOcr ?? '').replace(/\r\n/g, '\n').trim()
  if (!blob) {
    return {
      stem: stripMistakenCropLeakFromStem(stem),
      options: [...options],
      found: countRealMcqOptions(stem, options) }
  }

  if (sourceFile) {
    const geo = tryMcqParseFromCachedLineData(sourceFile, blob)
    if (geo && (geo.optionsFound ?? 0) >= 4) {
      const healed = repairDomainGreatestIntegerMcqParse({
        text: geo.text,
        options: geo.options,
        _ocrSource: blob,
        sourceFile })
      return {
        stem: healed.text ?? geo.text,
        options: (healed.options ?? geo.options).slice(0, 4),
        found: countRealMcqOptions(healed.text, healed.options) }
    }
  }

  const reparsed = reparseMcqUpload(blob, { sourceFile })
  let nextStem = stripMistakenCropLeakFromStem(
    reparsed.parsed?.text?.trim() || stem,
  )
  let nextOpts = [...(reparsed.parsed?.options ?? options)]
  while (nextOpts.length < 4) nextOpts.push('')

  const healed = healStoredMcqQuestion({
    questionType: 'single_correct',
    text: nextStem,
    options: nextOpts,
    ocrRawText: blob,
    extractedRaw: blob })
  const domainHealed = repairDomainGreatestIntegerMcqParse({
    text: healed.text ?? nextStem,
    options: healed.options ?? nextOpts,
    _ocrSource: blob,
    sourceFile })
  nextStem = stripMistakenCropLeakFromStem(String(domainHealed.text ?? nextStem).trim() || nextStem)
  nextOpts = mergeMcqOptionsIdempotent(options, domainHealed.options ?? nextOpts)

  const found = countRealMcqOptions(nextStem, nextOpts)
  return { stem: nextStem, options: nextOpts.slice(0, 4), found }
}

/**
 * Parse stem + A–D for MCQ upload / save.
 * @param {string} raw
 * @param {{ engine?: string }} [opts]
 */
export function resolveMcqFromOcr(raw, { engine = 'builtin' } = {}) {
  const result = processMcqUploadExtract(raw, { engine })
  if (result.parsed?.multi) {
    return { stem: '', options: ['', '', '', ''], found: 0, multi: true, polished: result.polished }
  }
  const opts = [...(result.parsed.options ?? ['', '', '', ''])]
  while (opts.length < 4) opts.push('')
  let stem = String(result.parsed.text ?? '').trim()
  if (!stem) {
    let stemOnly = result.polished || raw
    const optStart = findOptionsBlockStart(stemOnly)
    if (optStart > 40) stemOnly = stemOnly.slice(0, optStart).trim()
    stem = finalizeStemForBank(stemOnly.slice(0, 4000), opts)
  }
  return {
    stem,
    options: stabilizeMcqOptionSlots(opts),
    found: result.found,
    complete: result.complete,
    polished: result.polished,
    pass: result.pass }
}

/**
 * Manual "Parse question & options" + image upload — same multi-pass extract + recovery.
 * @param {string} rawOcr
 * @param {{ engine?: string, minFound?: number }} [opts]
 */
export function reparseMcqUpload(rawOcr, { engine = 'builtin', minFound = 0, sourceFile = null } = {}) {
  const raw = normalizeRawOcr(rawOcr)
  if (!raw) {
    return {
      raw: '',
      polished: '',
      parsed: { multi: false, text: '', options: ['', '', '', ''], optionsFound: 0, complete: false },
      found: 0,
      complete: false,
      pass: 'empty',
      recovered: false }
  }

  const extracted = processMcqUploadExtract(raw, { engine, minFound, sourceFile })
  if (extracted.parsed?.multi) {
    return { ...extracted, recovered: false }
  }

  let parsed = extracted.parsed
  let polished = extracted.polished
  let found = extracted.found ?? 0
  let pass = extracted.pass
  let recovered = false

  if (
    extracted.weak ||
    found < 4 ||
    !String(parsed.text ?? '').trim() ||
    (found < 2 && String(parsed.text ?? '').trim().length < 25)
  ) {
    const retry = tryRecoverSingleUploadParse(raw, { engine, minFound: found, sourceFile })
    if (
      retry &&
      (retry.found > found ||
        (!String(parsed.text ?? '').trim() && String(retry.parsed.text ?? '').trim()))
    ) {
      parsed = retry.parsed
      polished = retry.polished
      found = retry.found
      pass = retry.pass
      recovered = true
    }
  }

  if (parsed && !parsed.multi) {
    const slots = stabilizeMcqOptionSlots(parsed.options)
    parsed = {
      ...parsed,
      options: slots,
      optionsFound: slots.filter(Boolean).length,
    }
    found = parsed.optionsFound ?? found
  }

  return {
    raw,
    polished,
    parsed,
    found,
    complete: !!parsed.complete || found >= 4,
    pass,
    recovered }
}

/** Second-pass parse when the first upload fill missed stem or options. */
export function tryRecoverSingleUploadParse(rawOcr, opts = {}) {
  const { engine = 'builtin', minFound = 0, sourceFile = null } = opts
  const raw = normalizeRawOcr(rawOcr)
  if (!raw) return null

  /** @type {{ parsed: object, polished: string, found: number, pass: string }[]} */
  const attempts = []

  const primary = processMcqUploadExtract(raw, { engine, minFound, sourceFile })
  if (!primary.matrixHint && !(primary.passageHint && !looksLikeDeterminantMcq(raw))) {
    attempts.push({
      parsed: primary.parsed,
      polished: primary.polished,
      found: primary.found ?? 0,
      pass: primary.pass ?? 'recover-primary',
    })
  }

  // Aggressive marker-first pass (nested-paren / "is (A)" / horizontal A–D)
  const marked = normalizeOptionMarkersInText(raw)
  if (marked && marked !== raw) {
    const markedExtract = processMcqUploadExtract(marked, { engine, minFound: 0, sourceFile })
    if (!markedExtract.matrixHint && !markedExtract.parsed?.multi) {
      attempts.push({
        parsed: markedExtract.parsed,
        polished: markedExtract.polished,
        found: markedExtract.found ?? 0,
        pass: 'recover-markers',
      })
    }
  }

  // Heal from OCR blob when options still incomplete
  for (const attempt of [...attempts]) {
    if ((attempt.found ?? 0) >= 4) continue
    const healed = healStoredMcqQuestion({
      questionType: 'single_correct',
      text: attempt.parsed?.text ?? '',
      options: attempt.parsed?.options ?? ['', '', '', ''],
      ocrRawText: raw,
      extractedRaw: raw,
    })
    const healedFound = countRealMcqOptions(healed.text, healed.options)
    if (healedFound > (attempt.found ?? 0)) {
      attempts.push({
        parsed: {
          ...attempt.parsed,
          text: healed.text,
          options: healed.options,
          optionsFound: healedFound,
          complete: healedFound >= 4,
          multi: false,
        },
        polished: attempt.polished,
        found: healedFound,
        pass: `${attempt.pass}+heal`,
      })
    }
  }

  let best = null
  for (const a of attempts) {
    if (a.parsed?.multi) continue
    const stem = String(a.parsed?.text ?? '').trim()
    const found = a.found ?? 0
    if (found <= minFound && !stem) continue
    if (found <= minFound && stem.length < 20 && found < 2) continue
    if (
      !best ||
      found > best.found ||
      (found === best.found && stem.length > String(best.parsed?.text ?? '').trim().length)
    ) {
      best = a
    }
  }

  if (!best) return null
  if (best.found <= minFound && String(best.parsed?.text ?? '').trim().length < 20) return null
  return { parsed: best.parsed, polished: best.polished, found: best.found, pass: best.pass }
}

/**
 * Diagram + graph option crop plan after OCR parse (no file I/O).
 * @param {{
 *   stem?: string
 *   options?: string[]
 *   extractedRaw?: string
 *   questionType?: string
 *   questionImage?: string
 *   stemImageCrop?: boolean
 *   stemTextInImage?: boolean
 * }} ctx
 */
export function planUploadImageActions(ctx = {}) {
  const stem = String(ctx.stem ?? '').trim()
  const options = ctx.options ?? []
  const extractedRaw = String(ctx.extractedRaw ?? '').trim()
  const questionType = ctx.questionType ?? 'single_correct'
  const mcqCount = countRealMcqOptions(stem, options)
  const filledOpts = options.filter((o) => String(o ?? '').trim().length > 8).length

  const layout = classifyMcqImageLayout({
    stem,
    options,
    extractedRaw,
    optionImages: ctx.optionImages,
    stemImageCrop: ctx.stemImageCrop,
    questionType,
    visionHints: ctx.visionHints,
  })

  const attemptDiagramAutoCrop =
    layout.attemptDiagramAutoCrop &&
    (shouldAttemptDiagramAutoCrop(stem, extractedRaw, options, questionType) ||
      layout.kind === 'figure_graphs' ||
      layout.kind === 'figure_text' ||
      ctx.visionHints?.hasStemFigure === true)
  const graphOptsNeeding = countGraphOptionsNeedingImage(options, ctx.optionImages ?? [], stem)
  const textOnlyOpts = optionsAreTextOnlyMcq(options)
  const skipCrop = shouldSkipOptionsAutoCrop(stem, options, extractedRaw)
  const attemptOptionsAutoCrop =
    layout.attemptOptionsAutoCrop &&
    !skipCrop &&
    (shouldAttemptOptionsAutoCrop(stem, options, ctx.optionImages ?? [], extractedRaw) ||
      graphOptsNeeding >= 1 ||
      stemSaysOptionsAreFigures(stem) ||
      blobMentionsGraphOptions(`${stem}\n${extractedRaw}`) ||
      (!textOnlyOpts && graphOptsNeeding >= 1 && filledOpts >= 3) ||
      layout.kind === 'text_graphs' ||
      layout.kind === 'figure_graphs' ||
      layout.kind === 'mixed_options')

  const dropFullPageQuestionImage =
    layout.dropFullPageQuestionImage ||
    (!ctx.stemImageCrop &&
      stem.length > 40 &&
      (mcqCount >= 4 ||
        filledOpts >= 4 ||
        attemptOptionsAutoCrop ||
        stemSaysOptionsAreFigures(stem) ||
        stemSaysOptionsAreFigures(`${stem}\n${extractedRaw}`) ||
        (looksLikeDeterminantQuestion(`${stem}\n${extractedRaw}`) &&
          /\\begin\{vmatrix\}/i.test(stem) &&
          mcqCount >= 2)) &&
      !attemptDiagramAutoCrop)

  const showStemImageInPreview = shouldShowQuestionStemImage({
    questionType,
    questionImage: ctx.questionImage,
    stemImageCrop: ctx.stemImageCrop,
    stemTextInImage: ctx.stemTextInImage,
    text: stem,
    options,
    optionImages: ctx.optionImages,
  })

  return {
    attemptDiagramAutoCrop,
    attemptOptionsAutoCrop,
    dropFullPageQuestionImage,
    showStemImageInPreview,
    mcqOptionCount: mcqCount,
    layoutKind: layout.kind,
    keepStemImage: layout.keepStemImage,
    excludeBottomForStem: layout.excludeBottomForStem,
    graphOptionIndexes: layout.graphOptionIndexes,
  }
}

/** Bank-safe stem after OCR (polish + finalize). */
export function polishOcrForBank(text, options = [], engine = 'builtin') {
  const raw = normalizeRawOcr(text)
  if (!raw) return ''
  return finalizeStemForBank(polishExtractedText(raw, engine), options)
}

/** True for Gemini/UI stubs like "Option A" — never treat as a real A–D answer. */
export function isPlaceholderMcqOption(t) {
  return /^Option\s+[A-D]$/i.test(String(t ?? '').trim())
}

/** @param {string[]} [options] */
export function countPlaceholderMcqOptions(options = []) {
  return (options ?? []).filter((o) => isPlaceholderMcqOption(o)).length
}

/**
 * Skip heavy local heal only when cloud already filled real A–D (not placeholders).
 * Placeholder stubs must never lock the form and skip recovery.
 */
export function shouldSkipHeavyMcqHeal({ preserveVision = false, stem = '', options = [] } = {}) {
  if (!preserveVision) return false
  if (countPlaceholderMcqOptions(options) >= 2) return false
  if (looksLikeUnusableOcrSoup(stem, options)) return false
  if (countRealMcqOptions(stem, options) < 2) return false
  if (looksLikeLeakedOptionBand(stem)) return false
  return true
}

/**
 * Run a late upload step; never throw into the OCR-success path.
 * @template T
 * @param {string} label
 * @param {() => T} fn
 * @param {T} [fallback]
 * @returns {T}
 */
export function runGuardedUploadStep(label, fn, fallback = null) {
  try {
    return fn()
  } catch (err) {
    console.warn(`[upload] ${label} failed`, err)
    return fallback
  }
}

/**
 * If convert/heal throws after OCR, still produce a parse the form can show.
 * Never returns null when raw OCR has text — last resort is the raw blob as stem.
 * @param {string} rawOcr
 * @param {string} [engine]
 */
export function salvageParseFromOcr(rawOcr, engine = 'builtin') {
  const raw = String(rawOcr ?? '').replace(/\r\n/g, '\n').trim()
  if (!raw) return null
  try {
    const parsed = parseSingleQuestionUpload(polishExtractedText(raw, engine), raw)
    if (!parsed?.multi && (String(parsed?.text ?? '').trim() || (parsed?.optionsFound ?? 0) >= 1)) {
      return parsed
    }
  } catch (err) {
    console.warn('[upload] salvage parse failed', err)
  }
  return {
    text: raw.slice(0, 2500),
    options: ['', '', '', ''],
    optionsFound: 0,
    complete: false,
    salvageRaw: true,
  }
}
