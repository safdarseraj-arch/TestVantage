/**
 * Mathpix OCR, then local split, then Gemini light tags/answers/solutions.
 * Mathpix never fills bank fields. Gemini never reads the page.
 */
import { API_BASE } from '../config/platform.js'
import {
  isGarbageRawLatexCard,
  stampBankUploadIds,
} from './bankMathpixUpload.js'
import { extractWithMathpixClient, fetchMathpixStatus, MATHPIX_MISSING_MESSAGE } from './mathpixClient.js'
import { loadOcrOutputFormat } from './ocrOutputFormat.js'
import { geminiStructureToBankDrafts } from './mathpixGeminiMap.js'
import { addUploadedQuestionsBulk, loadUploadedQuestions } from './questionBank.js'
import { fetchCloudVisionStatus } from './cloudVisionClient.js'
import {
  geminiStructureFailedSplit,
  mathpixSplitToBankDrafts,
  sanitizeMathpixOcrText,
} from './mathpixQuestionSplit.js'
import { healOfficialPyqPaperQuestions } from './extendTruncatedStem.js'
import { applyUploadQualityGuards } from './uploadQualityGuards.js'
import { localMathpixSplitGoodEnough } from './pyqGeminiExtract.js'
import {
  localBankSplitGoodEnough,
  mergeLightEnrichOntoDrafts,
  GEMINI_LIGHT_MODEL,
} from './uploadLocalFirstPipeline.js'
import { raceStepTimeout } from './ocrTimeout.js'

const GEMINI_STRUCTURE_MISSING =
  'OCR text is ready. Add GEMINI_API_KEY to onlinetest/.env, keep the bottom panel open, then press F5 so Gemini (flash-lite) can fill answers and tags if local split failed.'

export { GEMINI_LIGHT_MODEL }

/** Official PYQ upload: short Gemini budget so 66% cannot freeze Review. */
export const GEMINI_STRUCTURE_TIMEOUT_MS = 12_000
export const GEMINI_STRUCTURE_BANK_TIMEOUT_MS = 40_000
/** Re-parse stored OCR on an open paper — full-paper split needs more time. */
export const GEMINI_REPARSE_TIMEOUT_MS = 90_000
export const MATHPIX_EXTRACT_TIMEOUT_MS = 5 * 60_000 + 20_000
const GEMINI_OFFICIAL_CHUNK_CHARS = 10_000

function mergeAbort(parent, ms) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), Math.max(1000, Number(ms) || 0))
  const onParent = () => ctl.abort()
  if (parent) {
    if (parent.aborted) ctl.abort()
    else parent.addEventListener('abort', onParent, { once: true })
  }
  return {
    signal: ctl.signal,
    clear() {
      clearTimeout(timer)
      parent?.removeEventListener('abort', onParent)
    },
  }
}

/**
 * @param {{
 *   text: string
 *   format?: 'latex' | 'word'
 *   paperMeta?: Record<string, unknown>
 *   officialPyq?: boolean
 *   signal?: AbortSignal
 *   timeoutMs?: number
 * }} opts
 */
export async function structureOcrWithGeminiClient(opts) {
  const text = String(opts.text ?? '').trim()
  if (!text) {
    return { ok: false, questions: [], instructions: '', parsed: null, geminiMissing: true }
  }
  const status = await raceStepTimeout(
    fetchCloudVisionStatus(),
    4000,
    'Could not reach Gemini on port 3001. Keep the bottom panel open, press F5.',
    'VISION_STATUS_TIMEOUT',
  )
  if (!status.configured) {
    const err = new Error(status.message || GEMINI_STRUCTURE_MISSING)
    err.code = 'VISION_NOT_CONFIGURED'
    throw err
  }
  const budget = opts.timeoutMs ?? (opts.officialPyq ? GEMINI_STRUCTURE_TIMEOUT_MS : GEMINI_STRUCTURE_BANK_TIMEOUT_MS)
  const sendText =
    opts.officialPyq && text.length > GEMINI_OFFICIAL_CHUNK_CHARS
      ? text.slice(0, GEMINI_OFFICIAL_CHUNK_CHARS)
      : text
  const gate = mergeAbort(opts.signal, budget)
  try {
    const work = (async () => {
      const res = await fetch(`${API_BASE}/vision/structure-ocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          text: sendText,
          format: opts.format === 'word' ? 'word' : 'latex',
          officialPyq: opts.officialPyq === true,
          deferSolutions: opts.deferSolutions === true,
          paperMeta: opts.paperMeta && typeof opts.paperMeta === 'object' ? opts.paperMeta : {},
        }),
        signal: gate.signal,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const err = new Error(data.error || `Gemini structure failed (${res.status})`)
        err.code = data.code || 'VISION_ASSIST_FAILED'
        throw err
      }
      const parsed = data.parsed && typeof data.parsed === 'object' ? data.parsed : { questions: data.questions, instructions: data.instructions }
      return {
        ok: true,
        questions: Array.isArray(parsed.questions) ? parsed.questions : [],
        instructions: String(parsed.instructions ?? data.instructions ?? ''),
        parsed,
        model: data.model,
        provider: data.provider,
      }
    })()
    return await raceStepTimeout(
      work,
      budget,
      `Gemini split timed out after ${Math.round(budget / 1000)} seconds.`,
      'GEMINI_STRUCTURE_TIMEOUT',
    )
  } finally {
    gate.clear()
  }
}

const LIGHT_ENRICH_TIMEOUT_MS = 20_000
const LIGHT_ENRICH_BATCH = 10

/**
 * Cheap flash-lite pass: metatags, answers, brief solutions. Never rewrites stems.
 * Fail-open — local cards stay if Gemini is down.
 * @param {object[]} questions
 * @param {{ paperMeta?: object, deferSolutions?: boolean, signal?: AbortSignal }} [opts]
 */
export async function enrichQuestionsLightClient(questions, opts = {}) {
  const list = Array.isArray(questions) ? questions : []
  if (!list.length) return list
  if (typeof window === 'undefined') return list
  const deferSolutions = opts.deferSolutions === true
  const budget = Math.max(4000, Number(opts.timeoutMs) || LIGHT_ENRICH_TIMEOUT_MS)
  try {
    const status = await raceStepTimeout(
      fetchCloudVisionStatus(),
      2500,
      'Gemini status timeout',
      'VISION_STATUS_TIMEOUT',
    )
    if (!status.configured) return list
    const started = Date.now()
    let merged = list
    for (let start = 0; start < list.length; start += LIGHT_ENRICH_BATCH) {
      const remaining = budget - (Date.now() - started)
      if (remaining < 1500) break
      const slice = list.slice(start, start + LIGHT_ENRICH_BATCH)
      const slim = slice.map((q, j) => ({
        i: start + j,
        stem: String(q.text ?? q.stem ?? '').slice(0, 360),
        options: Array.isArray(q.options) ? q.options.map((o) => String(o ?? '').slice(0, 100)) : [],
        questionType: q.questionType || '',
      }))
      const gate = mergeAbort(opts.signal, Math.min(8000, remaining))
      try {
        const res = await fetch(`${API_BASE}/vision/enrich-ocr-light`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify({
            questions: slim,
            paperMeta: opts.paperMeta && typeof opts.paperMeta === 'object' ? opts.paperMeta : {},
            deferSolutions,
            model: GEMINI_LIGHT_MODEL,
          }),
          signal: gate.signal,
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok && Array.isArray(data.questions) && data.questions.length) {
          merged = mergeLightEnrichOntoDrafts(merged, data.questions, { deferSolutions })
        }
      } catch {
        /* keep local cards */
      } finally {
        gate.clear()
      }
    }
    return merged
  } catch {
    return list
  }
}

function loadExistingBankSafe() {
  try {
    if (typeof window === 'undefined') return []
    return loadUploadedQuestions()
  } catch {
    return []
  }
}

function emptyPipelineResult(extra = {}) {
  return {
    text: '',
    questions: [],
    engine: extra.engine || 'mathpix',
    format: extra.format || 'latex',
    cloudNote: extra.cloudNote || '',
    lowConfidence: true,
    ocrWeakness: 99,
    mathpixMissing: false,
    geminiMissing: false,
    savedDrafts: [],
    instructionText: '',
    structuredBy: null,
    ...extra,
  }
}

/**
 * Gemini (or Mathpix-marker backup) splits OCR/Word text into bank drafts.
 * Never leaves progress hanging: callers always get 100% or a thrown error.
 *
 * @param {string} rawText
 * @param {{
 *   signal?: AbortSignal
 *   progress?: (pct: number) => void
 *   format?: 'latex' | 'word'
 *   saveToBank?: boolean
 *   officialPyq?: boolean
 *   paperMeta?: Record<string, unknown>
 *   engine?: string
 *   docxBase64?: string
 *   deferSolutions?: boolean
 * }} [opts]
 */
export async function structureTextThenMaybeSave(rawText, opts = {}) {
  const progress = opts.progress || (() => {})
  const format = opts.format === 'word' || opts.format === 'latex' ? opts.format : 'latex'
  const engine = opts.engine || 'mathpix'
  const text = sanitizeMathpixOcrText(rawText)
  if (!text) {
    progress(100)
    return emptyPipelineResult({
      format,
      engine,
      docxBase64: opts.docxBase64,
      cloudNote: 'No readable text to split. Try a clearer scan.',
    })
  }

  progress(70)
  const backup = mathpixSplitToBankDrafts(text, { paperMeta: opts.paperMeta })
  progress(78)
  const paperMeta = opts.paperMeta && typeof opts.paperMeta === 'object' ? opts.paperMeta : {}
  const healedLocal = opts.officialPyq === true
    ? healOfficialPyqPaperQuestions({
        questions: backup.drafts,
        preparedText: text,
        exam: paperMeta.exam,
        examPatternId: paperMeta.exam,
        session: paperMeta.session,
      })
    : applyUploadQualityGuards(backup.drafts, text)
  const localOk =
    opts.officialPyq === true
      ? localMathpixSplitGoodEnough(healedLocal, text, paperMeta)
      : localBankSplitGoodEnough(healedLocal, text)
  if (localOk) {
    progress(86)
    let questions = applyUploadQualityGuards(healedLocal, text)
    if (opts.officialPyq !== true) {
      questions = await enrichQuestionsLightClient(questions, {
        paperMeta,
        deferSolutions: opts.deferSolutions === true,
        signal: opts.signal,
        timeoutMs: 12_000,
      })
    }
    questions = stampBankUploadIds(
      opts.deferSolutions === true
        ? questions.map((d) => ({
            ...d,
            solution: '',
            solutionSource: undefined,
            solutionPending: true,
          }))
        : questions,
      loadExistingBankSafe(),
      opts.paperMeta,
    )
    let savedDrafts = []
    if (opts.saveToBank && questions.length && typeof window !== 'undefined') {
      savedDrafts = addUploadedQuestionsBulk(questions)
    }
    progress(100)
    return {
      text,
      questions,
      engine,
      format,
      docxBase64: opts.docxBase64,
      cloudNote: savedDrafts.length
        ? `Local split + Gemini ${GEMINI_LIGHT_MODEL} saved ${savedDrafts.length} draft(s) (tags/answers${opts.deferSolutions === true ? '' : '/solutions'}).`
        : `Split ${questions.length} question(s) locally from Mathpix. Gemini ${GEMINI_LIGHT_MODEL} filled tags, answers${opts.deferSolutions === true ? '' : ', and brief solutions'}.`,
      lowConfidence: false,
      ocrWeakness: 12,
      mathpixMissing: false,
      geminiMissing: false,
      savedDrafts,
      instructionText: backup.instructionText,
      structuredBy: 'local+gemini-light',
    }
  }

  let mapped =
    backup.drafts.length >= 2
      ? backup
      : { drafts: [], instructionText: backup.instructionText }
  let geminiMissing = false
  let cloudNote = backup.drafts.length
    ? `Split ${backup.drafts.length} question(s) from Mathpix markers.`
    : ''
  let geminiPct = 82
  const geminiBeat = setInterval(() => {
    geminiPct = Math.min(96, geminiPct + 1)
    progress(geminiPct)
  }, 700)
  try {
    const structured = await structureOcrWithGeminiClient({
      text,
      format,
      paperMeta: opts.paperMeta,
      officialPyq: opts.officialPyq === true,
      deferSolutions: opts.deferSolutions === true,
      signal: opts.signal,
      timeoutMs: opts.officialPyq ? GEMINI_STRUCTURE_TIMEOUT_MS : GEMINI_STRUCTURE_BANK_TIMEOUT_MS,
    })
    const fromGemini = geminiStructureToBankDrafts(
      { questions: structured.questions, instructions: structured.instructions },
      { paperMeta: opts.paperMeta, deferSolutions: opts.deferSolutions === true },
    )
    if (
      fromGemini.drafts.length >= 2 &&
      !geminiStructureFailedSplit(fromGemini.drafts.length, text) &&
      fromGemini.drafts.length >= mapped.drafts.length
    ) {
      mapped = fromGemini
      cloudNote = `Local split was incomplete — Gemini ${GEMINI_LIGHT_MODEL} filled ${fromGemini.drafts.length} question(s).`
    } else if (mapped.drafts.length < 2 && fromGemini.drafts.length >= 1) {
      mapped = fromGemini
      if (fromGemini.drafts.length === 1) {
        cloudNote = 'Gemini filled 1 question from Mathpix text.'
      }
    }
    progress(90)
  } catch (err) {
    if (err?.code === 'VISION_NOT_CONFIGURED' || err?.code === 'VISION_STATUS_TIMEOUT') {
      geminiMissing = true
      cloudNote = mapped.drafts.length
        ? `${GEMINI_STRUCTURE_MISSING} Saved a local split so you can review.`
        : GEMINI_STRUCTURE_MISSING
    } else if (err?.code === 'GEMINI_STRUCTURE_TIMEOUT' || err?.code === 'STEP_TIMEOUT') {
      cloudNote = mapped.drafts.length
        ? 'Gemini split timed out. Saved a local split from Mathpix text. Use Re-parse stored OCR — no second Mathpix bill.'
        : 'Gemini split timed out. Keep the bottom panel open (Ctrl+J then Ctrl+`), press F5, then try again.'
    } else {
      cloudNote =
        (err instanceof Error ? err.message : 'Gemini could not structure this OCR text.') +
        (mapped.drafts.length ? ' Saved a local split from Mathpix text.' : '')
    }
  } finally {
    clearInterval(geminiBeat)
  }

  if (geminiStructureFailedSplit(mapped.drafts.length, text) && backup.drafts.length >= 2) {
    mapped = backup
    cloudNote =
      cloudNote ||
      `Split ${backup.drafts.length} question(s) from Mathpix markers (Gemini returned one blob).`
  }
  if (!mapped.drafts.length && backup.drafts.length >= 2) {
    mapped = backup
  }
  if (isGarbageRawLatexCard(mapped.drafts, text)) {
    if (backup.drafts.length >= 2) {
      mapped = backup
      cloudNote = `Split ${backup.drafts.length} question(s) from Mathpix markers so this file is not one raw-LaTeX card.`
    } else {
      mapped = { drafts: [], instructionText: mapped.instructionText }
      cloudNote =
        'This file looks like several questions stuck in one LaTeX block. Keep the bottom panel open, press F5, then upload again so Gemini can split them. Nothing was saved.'
    }
  }

  mapped = {
    ...mapped,
    drafts: applyUploadQualityGuards(
      stampBankUploadIds(
        (opts.deferSolutions || !opts.saveToBank
          ? mapped.drafts.map((d) => ({
              ...d,
              solution: '',
              solutionSource: undefined,
              solutionPending: true,
            }))
          : mapped.drafts),
        loadExistingBankSafe(),
        opts.paperMeta,
      ),
      text,
    ),
  }

  let savedDrafts = []
  if (opts.saveToBank && mapped.drafts.length && typeof window !== 'undefined') {
    savedDrafts = addUploadedQuestionsBulk(mapped.drafts)
    cloudNote =
      cloudNote ||
      `Mathpix OCR + Gemini saved ${savedDrafts.length} draft(s) to the question bank (not published).`
  } else if (mapped.drafts.length) {
    cloudNote = cloudNote || `Gemini filled ${mapped.drafts.length} question(s) from Mathpix text.`
  } else if (!cloudNote) {
    cloudNote = geminiMissing
      ? GEMINI_STRUCTURE_MISSING
      : 'Mathpix text is ready. Review before saving.'
  }

  progress(100)
  return {
    text,
    questions: mapped.drafts,
    engine,
    format,
    docxBase64: opts.docxBase64,
    cloudNote,
    lowConfidence: !mapped.drafts.length,
    ocrWeakness: mapped.drafts.length ? 10 : 40,
    mathpixMissing: false,
    geminiMissing,
    savedDrafts,
    instructionText: mapped.instructionText,
    structuredBy: mapped.drafts.length ? (geminiMissing ? 'mathpix-split' : 'gemini') : null,
  }
}

/**
 * File/photo -> Mathpix OCR -> Gemini structure -> optional question-bank drafts.
 * Official PYQ should pass saveToBank: false (pending approval gate).
 *
 * @param {File | Blob} file
 * @param {{
 *   signal?: AbortSignal
 *   progress?: (pct: number) => void
 *   format?: 'latex' | 'word'
 *   saveToBank?: boolean
 *   officialPyq?: boolean
 *   paperMeta?: Record<string, unknown>
 * }} [opts]
 */
export async function runMathpixThenGemini(file, opts = {}) {
  const progress = opts.progress || (() => {})
  const format = opts.format === 'word' || opts.format === 'latex' ? opts.format : loadOcrOutputFormat()
  try {
    const mathpixStatus = await fetchMathpixStatus()
    if (!mathpixStatus.configured) {
      progress(100)
      return emptyPipelineResult({
        format,
        engine: 'mathpix',
        cloudNote: mathpixStatus.message || MATHPIX_MISSING_MESSAGE,
        mathpixMissing: true,
      })
    }

    progress(6)
    const ocr = await extractWithMathpixClient(file, {
      format,
      signal: opts.signal,
      onProgress: (p) => progress(Math.max(6, Math.round(6 + Number(p) * 0.56))),
    })
    const text = sanitizeMathpixOcrText(ocr.text)
    if (!text) {
      progress(100)
      return emptyPipelineResult({
        format,
        engine: 'mathpix',
        docxBase64: ocr.docxBase64,
        cloudNote: 'Mathpix returned empty text. Try a clearer scan.',
      })
    }

    return await structureTextThenMaybeSave(text, {
      signal: opts.signal,
      progress,
      format,
      saveToBank: opts.saveToBank,
      officialPyq: opts.officialPyq,
      deferSolutions: opts.deferSolutions === true,
      paperMeta: opts.paperMeta,
      engine: 'mathpix',
      docxBase64: ocr.docxBase64,
    })
  } catch (err) {
    progress(100)
    throw err
  }
}
