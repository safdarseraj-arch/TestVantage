/**
 * Gemini PYQ generate + official-paper extract helpers.
 * Isolated from Question Bank UI. Never wipes the bank.
 *
 * Generate: PYQ-style (AI) with paper identity + actual toughness (not 40/30/30).
 * Extract: keep Gemini structured stems/options; do not re-polish as local OCR.
 */

import { polishVisionStemSafe } from './cloudVisionParse.js'
import {
  endsWithDanglingMathOpen,
  latexExtractionIncomplete,
  spaceLatexCommandsAfterWords,
} from './healTruncatedLatex.js'
import { repairSmashedProseVmatrixOcr } from './repairSmashedProseVmatrixOcr.js'
import { wrapBareLatexRuns } from './wrapBareLatexRuns.js'
import {
  extendStemFromSource,
  healOfficialPyqPaperQuestions,
  looksLikeMatchInstructionOnly,
  mergeOrphanStemContinuations,
} from './extendTruncatedStem.js'
import { findOptionsBlockStart } from './mcqOptionMarkers.js'
import { looksLikeVerbalGraphOptionDescription } from './graphOptionOcr.js'
import { mcqLaterOptionsLookTruncated } from './mcqOptionCompleteness.js'
import { parsedBulkToPyqItems } from './pyqImport.js'
import { buildPyqPaperIds } from './pyqPaperDefaults.js'
import { splitStemAndGarbledOptions } from './splitStemAndGarbledOptions.js'
import {
  flattenPaperQuestionMap,
  parsePyqPaperContent,
} from './pyqPaperParse.js'
import {
  geminiPyqJobIsReady,
  normalizePyqExamId,
  normalizePyqYearValue,
} from './pyqSlotMeta.js'
import { looksLikeUnusableOcrSoup } from './stemDiagramDetect.js'
import { clampToughnessLevel } from './bankToughnessMix.js'
import {
  inferBulkQuestionType,
  instructionLikeOptions,
  isGarbageInstructionOption,
  looksLikeAnswerKeyMappingBlob,
  looksLikePyqSectionInstructionStem,
  looksLikeQuestionBlock,
  stripPageBreakAndSectionGlue,
} from './bulkExtractClean.js'
import { looksLikeMatchingListStem } from './parseMatchingListDisplay.js'
import {
  countMathpixQuestionMarkers,
  geminiStructureFailedSplit,
  healPaperItemCards,
  looksLikeMathpixLatexPaper,
  paperItemsFromMathpixOcr,
  sanitizeMathpixOcrText,
  shouldRebuildFromMathpixOcr,
  splitMathpixQuestionBlocks,
  stripMathpixQuestionMarker,
  extractMathpixQuestionNumber,
} from './mathpixQuestionSplit.js'
import { parseQuestionText } from './parseQuestionText.js'
import { hasMathpixMedia } from './mathpixMedia.js'
import { diagnoseLocalUploadSplit } from './uploadLocalFirstPipeline.js'
import { getQuestionType } from '../data/questionTypes.js'
import { parsePaperSectionMap } from './parsePaperSectionMap.js'

export const PYQ_GEMINI_JSON_SCHEMA_HINT = `Return ONLY this JSON (no markdown fences, no extra commentary):
{
  "questions": [
    {
      "stem": "complete question including all lines and display math before (A), LaTeX in $...$ or $$...$",
      "options": ["opt A", "opt B", "opt C", "opt D"],
      "correctIndex": 0,
      "solution": "short working with LaTeX in $...$",
      "toughness": 5,
      "topic": "exact allowed topic name"
    }
  ]
}
Each question MUST have a non-empty COMPLETE stem (every line, including displayed math after Then / is equal to / therefore — never stop at the first \\frac), exactly 4 distinct non-empty options, a real solution, and toughness 1-10. LaTeX in $...$ or $$...$$. Double-escape backslashes in JSON (\\\\frac).
Never leave C or D blank. Never use placeholders like "Option A". Never truncate JSON.`

/** Max PDF pages sent to Gemini per official PYQ upload (cost + timeout). */
export const PYQ_GEMINI_PDF_MAX_PAGES = 24

/** Fast path when the PDF text layer is already a clean full paper. */
export const PYQ_EXTRACT_TIMEOUT_MS = 90_000

/** Scanned / garbled official papers — page vision with progress (not a silent hang). */
export const PYQ_VISION_TIMEOUT_MS = 270_000

/** Per-page Gemini budget. A slow page is skipped; later pages still run. */
export const PYQ_GEMINI_PAGE_TIMEOUT_MS = 35_000

/** Thin-but-readable text: a few Gemini pages only. Garbled scans use PYQ_GEMINI_PDF_MAX_PAGES. */
export const PYQ_GEMINI_GAP_MAX_PAGES = 4

/** Quick PDF text peek only — never block Gemini. */
export const PYQ_TEXT_LAYER_TIMEOUT_MS = 5_000

export const PYQ_PREPARED_OCR_MARKER = '--- prepared-ocr ---'
export const PYQ_PDF_TEXT_MARKER = '--- pdf-text ---'
export const PYQ_VISION_TEXT_MARKER = '--- vision-ocr ---'

export const PYQ_GEMINI_PAGE_HINT =
  'JEE Main / JEE Advanced / NEET paper page. Extract ONLY numbered exam questions — skip SECTION headers, Maximum Marks blocks, "This section contains", marking-scheme bullets, and instruction pages. Split every real question. Keep the COMPLETE stem: every line including displayed math after Then / is equal to / therefore. Never stop at the first \\frac or at Then. Stem is everything before (A). Exactly 4 options A-D when printed. LaTeX in $...$ or $$...$$. Double-escape backslashes in JSON (\\\\frac). Do not invent answers or [Graph A] captions. Do not invent year/date/shift. Return ALL questions on the page — never truncate JSON.'

const PLACEHOLDER_OPTION = /^(?:option\s*[a-d]|opt\s*[a-d]|opt[a-d])$/i

/**
 * Light LaTeX heal for Gemini PYQ stems/options/solutions (cases, π, primes).
 * @param {unknown} text
 */
export function repairGeminiPyqLatex(text) {
  return spaceLatexCommandsAfterWords(
    polishVisionStemSafe(
      wrapBareLatexRuns(repairSmashedProseVmatrixOcr(String(text ?? '').trim())),
    ),
  )
}

/**
 * Pull A-D out of a stem when Gemini glued options onto the question text.
 * @param {string} stem
 * @returns {{ stem: string, options: string[] } | null}
 */
export function recoverLabeledOptionsFromStem(stem) {
  const s = String(stem ?? '').trim()
  let idx = findOptionsBlockStart(s)
  if (idx < 12) idx = s.search(/\(\s*A\s*\)/i)
  if (idx < 12) return null
  if ((s.match(/\(\s*[A-D]\s*\)/gi) ?? []).length < 4) return null
  const head = s.slice(0, idx).trim()
  const band = s.slice(idx).trim()
  if (!head || band.length < 8) return null
  const options = ['A', 'B', 'C', 'D'].map((letter) => {
    const re = new RegExp(
      `\\(\\s*${letter}\\s*\\)\\s*([\\s\\S]*?)(?=\\(\\s*[A-D]\\s*\\)|$)`,
      'i',
    )
    const m = band.match(re)
    return repairGeminiPyqLatex(m?.[1] ?? '')
  })
  if (options.filter(Boolean).length < 4) return null
  return { stem: repairGeminiPyqLatex(head), options }
}

/**
 * Repair stem + options from a Gemini PYQ object (generate or extract).
 * @param {any} item
 * @param {{ keepEmpty?: boolean }} [opts]
 */
export function recoverGeminiPyqStemOptions(item, opts = {}) {
  const keepEmpty = Boolean(opts.keepEmpty)
  const rawStem = String(item?.stem ?? item?.text ?? item?.question ?? '')
  let options = optionListFromGemini(item?.options ?? item?.choices, { keepEmpty: true })
  while (options.length < 4) options.push('')
  options = options.slice(0, 4)
  const filled = options.filter((o) => String(o).trim()).length
  if (filled < 4) {
    const labeled = recoverLabeledOptionsFromStem(rawStem)
    if (labeled) {
      return { stem: labeled.stem, options: labeled.options }
    }
    const split = splitStemAndGarbledOptions(rawStem)
    if (split?.options?.filter(Boolean).length >= 2) {
      const recovered = optionListFromGemini(split.options, { keepEmpty: true })
      const next = options.slice()
      for (let i = 0; i < 4; i += 1) {
        if (!String(next[i] ?? '').trim() && recovered[i]) next[i] = recovered[i]
      }
      return { stem: repairGeminiPyqLatex(split.stem), options: next }
    }
  }
  return {
    stem: repairGeminiPyqLatex(rawStem),
    options: keepEmpty ? options : options.filter((s) => s.length > 0),
  }
}

/**
 * @param {unknown} raw
 * @param {{ keepEmpty?: boolean }} [opts]
 * @returns {string[]}
 */
export function optionListFromGemini(raw, opts = {}) {
  const keepEmpty = Boolean(opts.keepEmpty)
  const clean = (x) => repairGeminiPyqLatex(x)
  if (Array.isArray(raw)) {
    const list = raw.slice(0, 4).map(clean)
    return keepEmpty ? list : list.filter((s) => s.length > 0)
  }
  if (raw && typeof raw === 'object') {
    const o = /** @type {Record<string, unknown>} */ (raw)
    const fromLetters = ['A', 'B', 'C', 'D'].map((k) =>
      clean(o[k] ?? o[k.toLowerCase()] ?? o[`option${k}`] ?? o[`Option${k}`] ?? ''),
    )
    if (keepEmpty || fromLetters.filter(Boolean).length >= 4) {
      return keepEmpty ? fromLetters : fromLetters.filter(Boolean).slice(0, 4)
    }
    const numbered = [1, 2, 3, 4].map((n) => clean(o[n] ?? o[`option${n}`] ?? ''))
    if (keepEmpty || numbered.filter(Boolean).length >= 4) {
      return keepEmpty ? numbered : numbered.filter(Boolean).slice(0, 4)
    }
  }
  return []
}

function isPlaceholderOption(text) {
  const s = String(text ?? '').trim()
  if (!s) return true
  if (PLACEHOLDER_OPTION.test(s)) return true
  if (looksLikeVerbalGraphOptionDescription(s) && !/\bdoes\s+not\s+exist\b/i.test(s)) return true
  return false
}

export function parseGeminiCorrectIndex(raw, optionCount = 4) {
  if (raw == null || raw === '') return null
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const n = Math.trunc(raw)
    if (n >= 0 && n < optionCount) return n
    if (n >= 1 && n <= optionCount) return n - 1
    return null
  }
  const s = String(raw).trim()
  if (/^[A-Da-d]$/.test(s)) return s.toUpperCase().charCodeAt(0) - 65
  if (/^[A-Da-d][).:-]/.test(s)) return s[0].toUpperCase().charCodeAt(0) - 65
  const n = Number(s)
  if (Number.isFinite(n)) return parseGeminiCorrectIndex(n, optionCount)
  return null
}

function looksGarbledAfterRepair(stem, options) {
  const blob = `${stem}\n${(options ?? []).join('\n')}`
  if (looksLikeUnusableOcrSoup(stem, options)) return true
  if (looksLikePyqSectionInstructionStem(stem)) return true
  if (/\bUsxst\b|\basgn\s*\(/i.test(blob)) return true
  if (/\\operatorname\s*\\\{\s*Tr/i.test(blob)) return true
  return false
}

/**
 * Validate + repair one Gemini PYQ-style generate item (stem, 4 options, solution).
 * Does not force 40/30/30 toughness.
 * @param {any} item
 * @param {{ chapter?: string, topics?: string[], pyqStyle?: boolean }} [job]
 * @returns {{ ok: true, item: object } | { ok: false, error: string }}
 */
export function validateGeminiPyqGenerateItem(item, job = {}) {
  if (!item || typeof item !== 'object') {
    return { ok: false, error: 'Item is not an object' }
  }
  const recovered = recoverGeminiPyqStemOptions(item, { keepEmpty: false })
  const stem = recovered.stem
  if (!stem) return { ok: false, error: 'Empty stem' }
  const options = recovered.options
  if (options.length !== 4) {
    return { ok: false, error: `Need exactly 4 options, got ${options.length}` }
  }
  if (options.some(isPlaceholderOption)) {
    return { ok: false, error: 'Placeholder or empty options' }
  }
  if (new Set(options.map((o) => o.toLowerCase())).size < 2) {
    return { ok: false, error: 'Options are not distinct' }
  }
  if (mcqLaterOptionsLookTruncated(options, `${stem}\n${options.join('\n')}`)) {
    return { ok: false, error: 'Truncated options C/D' }
  }
  if (looksGarbledAfterRepair(stem, options)) {
    return { ok: false, error: 'Garbled LaTeX' }
  }
  const correctIndex = parseGeminiCorrectIndex(
    item.correctIndex ?? item.correct ?? item.answer ?? item.answerIndex ?? item.correctOption,
    4,
  )
  if (correctIndex == null) {
    return { ok: false, error: 'correctIndex must be 0-3 (or A-D)' }
  }
  const solution = repairGeminiPyqLatex(item.solution ?? item.explanation ?? item.working)
  if (solution.length < 12) {
    return { ok: false, error: 'Missing solution' }
  }
  const topics = job.topics ?? []
  const want = String(item.topic ?? '').trim()
  const topic =
    (want && topics.includes(want) ? want : topics.find((t) => t.toLowerCase() === want.toLowerCase())) ||
    topics[0] ||
    job.chapter ||
    want
  return {
    ok: true,
    item: {
      stem,
      options,
      correctIndex,
      solution,
      toughness: clampToughnessLevel(item.toughness ?? item.difficulty ?? item.toughnessLevel, 5),
      topic,
    },
  }
}

/**
 * Official-paper extract: stem required; 4 options preferred; solution optional.
 * Never invent an answer key. Never apply 40/30/30.
 * @param {any} item
 */
export function validateGeminiPyqExtractItem(item) {
  if (!item || typeof item !== 'object') {
    return { ok: false, error: 'Item is not an object' }
  }
  const recovered = recoverGeminiPyqStemOptions(item, { keepEmpty: true })
  const stem = recovered.stem
  if (!stem) return { ok: false, error: 'Empty stem' }
  // Recovery drops a trailing "$$", so judge the raw extract for that marker
  // too — otherwise a stem whose math was cut off reads as complete.
  const rawStem = String(item.stem ?? item.text ?? item.question ?? '')
  if (latexExtractionIncomplete(stem) || endsWithDanglingMathOpen(rawStem)) {
    return { ok: false, error: 'Extraction incomplete — do not approve' }
  }
  if (looksLikePyqSectionInstructionStem(stem)) {
    return { ok: false, error: 'Section instruction block' }
  }
  const regionTypes = Array.isArray(item.regionTypes) ? item.regionTypes.map(String) : []
  const graphOpts = regionTypes.includes('optionGraph')
  let options = recovered.options
  while (options.length < 4) options.push('')
  options = options.slice(0, 4)
  const filled = options.filter((o) => String(o ?? '').trim() && !PLACEHOLDER_OPTION.test(String(o).trim())).length
  const placeholderCount = options.filter((o) => PLACEHOLDER_OPTION.test(String(o ?? '').trim())).length
  if (instructionLikeOptions(options)) {
    const cleanedStem = stripPageBreakAndSectionGlue(stem)
    if (!looksLikeQuestionBlock(cleanedStem) || looksLikePyqSectionInstructionStem(cleanedStem)) {
      return { ok: false, error: 'Instruction marking options' }
    }
  }
  if (placeholderCount >= 2) {
    return { ok: false, error: 'Placeholder options' }
  }
  const integerLike =
    item.correctInteger != null ||
    item.correctNumerical != null ||
    /integer|numerical/i.test(String(item.questionType ?? ''))
  const matchListLike =
    looksLikeMatchingListStem(stem) || /matrix_match|matching.?list/i.test(String(item.questionType ?? ''))
  const figureLike = graphOpts || filled === 0
  if (!figureLike && !integerLike && !matchListLike) {
    if (filled !== 4) {
      return { ok: false, error: `Need exactly 4 options, got ${filled}` }
    }
    if (mcqLaterOptionsLookTruncated(options, `${stem}\n${options.join('\n')}`)) {
      return { ok: false, error: 'Truncated options C/D' }
    }
  }
  if (looksGarbledAfterRepair(stem, options.filter(Boolean))) {
    return { ok: false, error: 'Garbled LaTeX' }
  }
  const printedKey =
    item.answerKeyVisible === true ||
    item.answer_key_visible === true ||
    regionTypes.includes('answerKey')
  const correctIndex = printedKey
    ? parseGeminiCorrectIndex(item.correctIndex ?? item.correct ?? item.answer, 4)
    : item.correctIndex != null
      ? parseGeminiCorrectIndex(item.correctIndex, 4)
      : null
  const solution = repairGeminiPyqLatex(item.solution ?? item.explanation ?? '')
  return {
    ok: true,
    item: {
      stem,
      options,
      correctIndex: correctIndex == null ? undefined : correctIndex,
      solution: solution || undefined,
      toughness: item.toughnessLevel != null || item.toughness != null
        ? clampToughnessLevel(item.toughnessLevel ?? item.toughness, 5)
        : undefined,
      subject: item.subject ? String(item.subject).trim().toLowerCase() : undefined,
      chapter: item.chapter ? String(item.chapter).trim() : undefined,
      topic: item.topic ? String(item.topic).trim() : undefined,
      questionType: item.questionType
        ? String(item.questionType)
        : matchListLike && filled < 4
          ? 'matrix_match'
          : 'single_correct',
      number: Number(item.number) > 0 ? Number(item.number) : undefined,
      regionTypes,
      correctInteger:
        item.correctInteger != null && Number.isFinite(Number(item.correctInteger))
          ? Number(item.correctInteger)
          : undefined,
      correctNumerical:
        item.correctNumerical != null && Number.isFinite(Number(item.correctNumerical))
          ? Number(item.correctNumerical)
          : undefined,
    },
  }
}

/**
 * @param {unknown} raw
 * @returns {{ text: string, questions: any[], engine: string }}
 */
export function coercePyqExtractPayload(raw) {
  if (typeof raw === 'string') {
    return { text: raw.trim(), questions: [], engine: 'builtin' }
  }
  if (!raw || typeof raw !== 'object') {
    return { text: '', questions: [], engine: 'builtin' }
  }
  const obj = /** @type {Record<string, any>} */ (raw)
  const questions = Array.isArray(obj.questions)
    ? obj.questions
    : Array.isArray(obj.items)
      ? obj.items
      : []
  const engine = String(obj.engine ?? (questions.length ? 'cloud-vision' : 'builtin'))
  const text = String(obj.text ?? obj.raw ?? '').trim()
  return { text, questions, engine }
}

function polishEngineForPyq(engine) {
  const e = String(engine ?? 'builtin')
  if (e === 'cloud-vision' || e === 'pix2text' || e === 'mathpix' || e === 'word') return e
  return 'builtin'
}

/** @param {string} exam @param {string} [session] @param {string} [ocrText] */
export function expectedPyqPaperQuestionTarget(exam, session, ocrText) {
  void session
  const catalog =
    exam === 'jee-advanced' ? 51 : exam === 'jee-main' ? 30 : exam === 'neet' ? 180 : 10
  const fromOcr = inferOcrQuestionCount(ocrText)
  if (fromOcr >= 8) return fromOcr
  if (fromOcr >= 4 && !exam) return fromOcr
  return catalog
}

/** Count real question markers in OCR (not fixed catalog 51). Marker/regex only — never full split on UI thread. */
export function inferOcrQuestionCount(ocrText) {
  const raw = String(ocrText ?? '').trim()
  if (!raw) return 0
  const markers = countMathpixQuestionMarkers(raw)
  const likely = countLikelyPyqQuestionsInText(raw)
  return Math.max(markers, likely)
}

/** Warn / distrust structured Gemini JSON below this count. */
export function pyqExtractLowCountThreshold(exam) {
  if (exam === 'jee-advanced') return 40
  if (exam === 'jee-main') return 20
  if (exam === 'neet') return 30
  return 8
}

/** @param {unknown} text */
function draftShowsRawCodeLeak(text) {
  const t = String(text ?? '')
  return (
    /\\begin\{tabular\}/i.test(t) ||
    /<smiles[\s>]/i.test(t) ||
    /\\end\{document\}/i.test(t) ||
    /\\documentclass/i.test(t)
  )
}

/** @param {unknown} q */
function draftCardLooksClean(q) {
  const stem = String(q?.text ?? q?.stem ?? '').trim()
  if (!stem || stem.length < 10) return false
  if (draftShowsRawCodeLeak(stem)) return false
  const opts = Array.isArray(q?.options) ? q.options : []
  const filled = opts.filter((o) => String(o ?? '').trim()).length
  if (opts.some((o) => draftShowsRawCodeLeak(o))) return false
  if (filled >= 2) return true
  if (looksLikeMatchingListStem(stem) || /List-I|List-II|Match each entry/i.test(stem)) return true
  const qt = String(q?.questionType ?? '')
  if ((qt === 'integer' || qt === 'numerical') && stem.length >= 20) return true
  return false
}

/**
 * True when Mathpix marker split (+ heal) is good enough to skip Gemini structure OCR.
 * @param {unknown[]} questions
 * @param {string} rawText
 * @param {{ exam?: string, examPatternId?: string, session?: string }} [paperMeta]
 */
export function localMathpixSplitGoodEnough(questions, rawText, paperMeta = {}) {
  const list = Array.isArray(questions) ? questions : []
  const raw = String(rawText ?? '')
  if (!list.length || localPyqTextLooksGarbled(raw)) return false
  if (geminiStructureFailedSplit(list.length, raw)) return false
  if (!looksLikeMathpixLatexPaper(raw) && countMathpixQuestionMarkers(raw) < 8) return false

  const exam = String(paperMeta.exam ?? paperMeta.examPatternId ?? '')
  const expected = expectedPyqPaperQuestionTarget(exam, paperMeta.session, raw)
  const ocrCount = inferOcrQuestionCount(raw)
  const target = ocrCount >= 8 ? ocrCount : expected
  const minKeep = pyqExtractLowCountThreshold(exam)
  const count = list.length

  const nearExpected =
    target > 0
      ? count >= Math.max(minKeep, target - 2) && count <= target + 2
      : count >= minKeep
  if (!nearExpected) return false

  let bad = 0
  for (const q of list) {
    if (!draftCardLooksClean(q)) bad += 1
  }
  const maxBad = Math.max(1, Math.floor(count * 0.06))
  if (bad > maxBad) return false
  const extra = diagnoseLocalUploadSplit(list, raw, paperMeta)
  return extra.reasons.every((r) => r !== 'incomplete-stem' && r !== 'missing-list-i' && r !== 'missing-figures' && r !== 'raw-aligned-code')
}

/** @param {import('./bulkExtractClean.js').OfficialPyqExtractSummary} summary */
export function formatOfficialPyqExtractSummary(summary) {
  if (!summary) return ''
  const bits = [`Found ${summary.found} questions (detected ~${summary.expected} in OCR)`]
  if (summary.instructionFiltered > 0) {
    bits.push(`${summary.instructionFiltered} instruction block(s) skipped`)
  }
  if (summary.rejectedCount > 0) {
    bits.push(`${summary.rejectedCount} Gemini row(s) rejected`)
  }
  bits.push(`source: ${summary.source}`)
  if (summary.lowCountWarning) {
    bits.push(
      `DO NOT APPROVE if under ${summary.minApprove ?? 40} — re-upload or Re-parse stored OCR`,
    )
  }
  return `Extract summary: ${bits.join(' · ')}`
}

/** Numbered stems or (A) blocks — used to skip Gemini when the PDF text layer is already a full paper. */
export function countLikelyPyqQuestionsInText(text) {
  const t = String(text ?? '')
  if (!t.trim()) return 0
  const numbered = (t.match(/(?:^|\n)\s*(?:Q\s*\.?\s*)?\d{1,2}[\.\)]\s+\S/g) || []).length
  const mcq = (t.match(/\(\s*A\s*\)/g) || []).length
  return Math.max(numbered, mcq, countMathpixQuestionMarkers(t))
}

/**
 * Broken official-PDF text layer / Tesseract soup — not a readable JEE paper.
 * Examples: "f () x", smashed limits, options like "11 31 x - 11 9 x 10".
 * @param {string} text
 */
export function localPyqTextLooksGarbled(text) {
  const t = String(text ?? '').trim()
  if (!t) return true
  if (t.length < 80) return true
  if (looksLikeMathpixLatexPaper(t)) return false
  if (/[a-z]\s*\(\s*\)\s*[a-z]/i.test(t) && (/f\s*\(\s*\)\s*x/i.test(t) || (t.match(/[a-z]\s*\(\s*\)\s*[a-z]/gi) || []).length >= 3)) {
    return true
  }
  if (/\blim\s+[a-z]\s+\d{1,3}\b/i.test(t) && !/\\lim\s*_/.test(t) && /1t\s*→|xt\s*[⁹9]|t\s*→\s*xt/i.test(t)) {
    return true
  }
  if ((t.match(/\b11\s+\d{1,2}\s+x\b/g) || []).length >= 2) return true
  const latexBits = (t.match(/\$[^$]{2,}\$/g) || []).length + (t.match(/\\frac|\\int|\\lim/g) || []).length
  const mathWords = (t.match(/\b(?:lim|integral|differentiable|continuously|then,? for all)\b/gi) || []).length
  if (t.length >= 800 && mathWords >= 6 && latexBits < 3) return true
  const pages = Math.max(1, (t.match(/--- page ---/g) || []).length + 1)
  if (t.length / pages < 220 && countLikelyPyqQuestionsInText(t) < 12) return true
  return false
}

export function officialPyqStemsLookGarbled(questions) {
  const blob = (questions ?? []).map((q) => String(q?.text ?? '')).join('\n')
  return localPyqTextLooksGarbled(blob)
}

export function localPyqTextLooksComplete(text, exam = '') {
  const t = String(text ?? '')
  if (localPyqTextLooksGarbled(t)) return false
  const likely = countLikelyPyqQuestionsInText(t)
  const min = exam ? pyqExtractLowCountThreshold(exam) : 18
  const need = min >= 40 ? min : Math.min(18, min)
  return t.length >= 2500 && likely >= need
}

/**
 * @typedef {{
 *   expected: number
 *   found: number
 *   structuredCount: number
 *   textParseCount: number
 *   rejectedCount: number
 *   instructionFiltered: number
 *   source: string
 *   lowCountWarning: boolean
 *   minApprove?: number
 *   preparedTextLength: number
 * }} OfficialPyqExtractSummary
 */
export function combinePyqPreparedOcrText(...parts) {
  const chunks = parts.map((p) => String(p ?? '').trim()).filter(Boolean)
  if (!chunks.length) return ''
  if (chunks.length === 1) return chunks[0]
  const sorted = [...chunks].sort((a, b) => b.length - a.length)
  let out = sorted[0]
  for (let i = 1; i < sorted.length; i += 1) {
    const extra = sorted[i]
    if (extra.length < 80) continue
    const probe = extra.slice(0, 72).replace(/\s+/g, ' ')
    if (probe.length >= 24 && !out.includes(probe.slice(0, 36))) {
      out += `\n\n--- ocr supplement ---\n\n${extra}`
    }
  }
  return out
}

/** @param {any[]} questions @param {string[]} rejected */
function filterInstructionQuestionsFromRows(questions, rejected) {
  /** @type {any[]} */
  const kept = []
  let instructionFiltered = 0
  for (const q of questions ?? []) {
    const stem = String(q?.text ?? '').trim()
    if (!stem) continue
    const cleaned = stripPageBreakAndSectionGlue(stem)
    if (looksLikeAnswerKeyMappingBlob(stem) || looksLikeAnswerKeyMappingBlob(cleaned)) {
      instructionFiltered += 1
      rejected.push(`Filtered answer-key blob: ${stem.slice(0, 72)}`)
      continue
    }
    if (looksLikePyqSectionInstructionStem(stem) || looksLikePyqSectionInstructionStem(cleaned)) {
      instructionFiltered += 1
      rejected.push(`Filtered instruction: ${stem.slice(0, 72)}`)
      continue
    }
    if (/^(?:is equal to|then)\s*[:.]?\s*$/i.test(cleaned)) {
      instructionFiltered += 1
      rejected.push(`Filtered orphan closer: ${stem.slice(0, 72)}`)
      continue
    }
    if (looksLikeMatchInstructionOnly(cleaned)) {
      instructionFiltered += 1
      rejected.push(`Filtered match instruction: ${stem.slice(0, 72)}`)
      continue
    }
    if (instructionLikeOptions(q?.options)) {
      instructionFiltered += 1
      rejected.push(`Filtered marking options: ${stem.slice(0, 72)}`)
      continue
    }
    kept.push(q)
  }
  return { questions: kept, instructionFiltered }
}

/** @param {string} exam */
function expectedMinQuestionCount(exam) {
  return pyqExtractLowCountThreshold(exam)
}

/** @param {any[]} lists */
function mergeUniquePyqQuestions(lists) {
  /** @type {any[]} */
  const out = []
  const indexByKey = new Map()
  for (const list of lists) {
    for (const q of list ?? []) {
      const stem = String(q?.text ?? '').trim()
      if (!stem || looksLikePyqSectionInstructionStem(stem) || looksLikeAnswerKeyMappingBlob(stem)) continue
      if (/^(?:is equal to|then)\s*[:.]?\s*$/i.test(stem)) continue
      const folded = stem
        .replace(/^(?:Q(?:uestion)?\s*\.?\s*\d{1,2}|\d{1,2})[\.\):\s]\s*/i, '')
        .replace(/\s+/g, ' ')
      const key = folded.slice(0, 64).toLowerCase()
      const existingAt = indexByKey.get(key)
      if (existingAt != null) {
        if (stem.length > String(out[existingAt].text ?? '').length) out[existingAt] = q
        continue
      }
      indexByKey.set(key, out.length)
      out.push(q)
    }
  }
  return out
}

/**
 * Pull OCR blob saved during import (notes field: "Imported from …" then prepared text).
 * @param {string} notes
 */
function sliceNotesAfterMarker(raw, marker) {
  const re = new RegExp(`\\n${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n`, 'i')
  const m = raw.search(re)
  if (m < 0) return ''
  let body = raw.slice(m + `\n${marker}\n`.length)
  const next = body.search(/\n--- (?:prepared-ocr|pdf-text|vision-ocr) ---\n/i)
  if (next >= 0) body = body.slice(0, next)
  return body.trim()
}

export function extractPreparedTextFromPaperNotes(notes) {
  const raw = String(notes ?? '').trim()
  if (!raw) return ''
  const vision = sliceNotesAfterMarker(raw, PYQ_VISION_TEXT_MARKER)
  if (vision.length >= 80) return vision
  const prepared = sliceNotesAfterMarker(raw, PYQ_PREPARED_OCR_MARKER)
  if (prepared.length >= 80) return prepared
  const ocrMark = raw.search(new RegExp(`\\n${PYQ_PREPARED_OCR_MARKER}\\n`, 'i'))
  if (ocrMark >= 0) {
    return raw.slice(ocrMark + `\n${PYQ_PREPARED_OCR_MARKER}\n`.length).trim()
  }
  const marker = /^Imported from [^\n]+\n\n/im
  const m = raw.match(marker)
  let body = m ? raw.slice(m.index + m[0].length).trim() : raw
  body = body.replace(/^Extract summary:[^\n]+\s*/im, '').trim()
  if (body.length > 400 && !/^Imported from /i.test(body.slice(0, 80))) return body
  return body
}

/** Persist raw PDF text + vision text so Re-parse is not stuck on garbled text-layer soup. */
export function formatOfficialPyqStoredNotes({ fileName, summaryLine, pdfText, visionText }) {
  const pdf = String(pdfText ?? '').trim()
  const vision = String(visionText ?? '').trim()
  const best = vision.length >= 80 ? vision : pdf
  return [
    fileName ? `Imported from ${fileName}` : '',
    summaryLine,
    pdf ? `${PYQ_PDF_TEXT_MARKER}\n\n${pdf}` : '',
    vision ? `${PYQ_VISION_TEXT_MARKER}\n\n${vision}` : '',
    best ? `${PYQ_PREPARED_OCR_MARKER}\n\n${best}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

/** Prefer a dedicated preparedText field, then notes. */
export function officialPyqStoredOcrText(paper) {
  const dedicated = sanitizeMathpixOcrText(paper?.preparedText)
  if (dedicated.length >= 80) return dedicated
  return sanitizeMathpixOcrText(extractPreparedTextFromPaperNotes(paper?.notes))
}

function buildStructuredPyqRows(structured, payload, defaults, slotMap) {
  const healed = mergeOrphanStemContinuations(
    structured.map((q) => ({ ...q, text: stripPageBreakAndSectionGlue(q.text) })),
  ).map((q) => ({
    ...q,
    text: stripPageBreakAndSectionGlue(extendStemFromSource(q.text, payload.text)),
  }))
  return parsedBulkToPyqItems(healed, defaults, 0, slotMap).map(repairGeminiPyqBankItem)
}

function buildTextFallbackPyqRows(text, payload, defaults, slotMap) {
  const engine = polishEngineForPyq(payload.engine)
  const paper = parsePyqPaperContent(text, engine)
  const sourceText = paper.preparedText || text
  return parsedBulkToPyqItems(
    mergeOrphanStemContinuations(paper.questions).map((q) => ({
      ...q,
      text: extendStemFromSource(q.text, sourceText),
    })),
    defaults,
    0,
    slotMap,
  ).map(repairGeminiPyqBankItem)
}

function buildMathpixSplitPyqRows(text, payload, defaults, slotMap) {
  const { blocks } = splitMathpixQuestionBlocks(text)
  if (blocks.length < 2) return []
  const parsed = blocks
    .map((block, i) => {
      const body = stripMathpixQuestionMarker(block)
      const pq = parseQuestionText(body)
      const stem = String(pq.text || body).trim()
      const options = Array.isArray(pq.options) ? [...pq.options] : ['', '', '', '']
      while (options.length < 4) options.push('')
      return {
        text: stem,
        options: options.slice(0, 4),
        questionType: inferBulkQuestionType(stem, pq) || 'single_correct',
        questionNumber: extractMathpixQuestionNumber(block) || i + 1,
      }
    })
    .filter((q) => q.text.length >= 12 && !looksLikePyqSectionInstructionStem(q.text))
  if (parsed.length < 2) return []
  const sourceText = payload.text || text
  return parsedBulkToPyqItems(
    mergeOrphanStemContinuations(parsed).map((q) => ({
      ...q,
      text: extendStemFromSource(q.text, sourceText),
    })),
    defaults,
    0,
    slotMap,
  ).map(repairGeminiPyqBankItem)
}

/**
 * Paper identity comes from the teacher form — never from a hallucinated Gemini year/date.
 * @param {{
 *   exam?: string
 *   examPatternId?: string
 *   year?: number
 *   pyqYear?: number
 *   pyqDate?: string
 *   pyqShift?: number
 *   session?: string
 *   pyqSession?: string
 *   paperId?: string
 *   paperLabel?: string
 *   sourceLabel?: string
 *   subject?: string
 *   chapter?: string
 * }} paperMeta
 */
export function officialPyqPaperDefaults(paperMeta) {
  const exam = normalizePyqExamId(paperMeta?.exam || paperMeta?.examPatternId)
  const year = normalizePyqYearValue(paperMeta?.year ?? paperMeta?.pyqYear)
  const ids = buildPyqPaperIds({
    pyqYear: year,
    examPatternId: exam,
    pyqDate: paperMeta?.pyqDate,
    pyqShift: paperMeta?.pyqShift,
    pyqSession: paperMeta?.session || paperMeta?.pyqSession,
    paperId: paperMeta?.paperId,
    paperLabel: paperMeta?.paperLabel,
  })
  return {
    pyqYear: year,
    examPatternId: exam,
    paperId: ids.paperId,
    paperLabel: ids.paperLabel,
    pyqDate: ids.pyqDate,
    pyqShift: ids.pyqShift,
    pyqSession: ids.pyqSession,
    sourceLabel: paperMeta?.sourceLabel,
    subject: paperMeta?.subject,
    chapter: paperMeta?.chapter || 'General',
  }
}

/**
 * Turn a Gemini vision extract (or OCR text) into PYQ rows tagged to one paper.
 * Prefers structured questions[] so local OCR polish cannot smash Gemini LaTeX.
 * @param {unknown} extracted
 * @param {Parameters<typeof officialPyqPaperDefaults>[0]} paperMeta
 * @param {{ existingQuestionCount?: number }} [opts]
 */
export function questionsFromOfficialPyqExtract(extracted, paperMeta, opts = {}) {
  const payload = coercePyqExtractPayload(extracted)
  const defaults = officialPyqPaperDefaults(paperMeta)
  const exam = defaults.examPatternId
  const slotMap = flattenPaperQuestionMap(exam)
  /** @type {string[]} */
  const rejected = []
  const structured = []
  const rawForMap = String(payload.text ?? extracted?.text ?? extracted?.visionText ?? '')
  const sectionMap = parsePaperSectionMap(rawForMap)
  const text = sanitizeMathpixOcrText(payload.text)
  payload.text = text
  const expected = expectedPyqPaperQuestionTarget(exam, paperMeta?.session, text)
  const trustThreshold = pyqExtractLowCountThreshold(exam)
  const existingFromCaller = Number(opts.existingQuestionCount)

  payload.questions.forEach((raw, i) => {
    const v = validateGeminiPyqExtractItem(raw)
    if (!v.ok) {
      rejected.push(`Q${i + 1}: ${v.error}`)
      return
    }
    structured.push({
      text: v.item.stem,
      options: v.item.options,
      correctIndex: v.item.correctIndex,
      correctInteger: v.item.correctInteger,
      correctNumerical: v.item.correctNumerical,
      solution: v.item.solution,
      subject: v.item.subject || defaults.subject || 'physics',
      chapter: v.item.chapter || defaults.chapter || 'General',
      questionType: v.item.questionType || 'single_correct',
      questionNumber: v.item.number ?? i + 1,
      toughnessLevel: v.item.toughness,
    })
  })

  const markerCount = countMathpixQuestionMarkers(text)
  const rebuildExisting =
    Number.isFinite(existingFromCaller) && existingFromCaller >= 0
      ? existingFromCaller
      : structured.length
  if (shouldRebuildFromMathpixOcr(text, rebuildExisting, expected)) {
    const canonical = paperItemsFromMathpixOcr(text, { paperMeta: defaults, sectionMap })
    let questions = parsedBulkToPyqItems(canonical, defaults, 0, slotMap).map(repairGeminiPyqBankItem)
    const filtered = filterInstructionQuestionsFromRows(questions, rejected)
    questions = filtered.questions
    const summary = {
      expected,
      found: questions.length,
      structuredCount: structured.length,
      textParseCount: questions.length,
      rejectedCount: rejected.length,
      instructionFiltered: filtered.instructionFiltered,
      source: 'mathpix-canonical',
      lowCountWarning: questions.length < trustThreshold,
      minApprove: trustThreshold,
      preparedTextLength: text.length,
    }
    return {
      questions,
      rejected,
      source: 'mathpix-canonical',
      engine: payload.engine,
      preparedText: text,
      instructionText: '',
      summary,
    }
  }
  const textGarbled = localPyqTextLooksGarbled(text)
  let fromStructured = structured.length
    ? healPaperItemCards(buildStructuredPyqRows(structured, payload, defaults, slotMap))
    : []
  if (geminiStructureFailedSplit(fromStructured.length, text)) {
    fromStructured = []
  }
  const fromTextRaw = text.length > 80 ? buildTextFallbackPyqRows(text, payload, defaults, slotMap) : []
  let fromText = textGarbled ? [] : fromTextRaw
  if (
    !textGarbled &&
    looksLikeMathpixLatexPaper(text) &&
    markerCount >= 2 &&
    (fromText.length <= 1 || fromText.length < Math.min(8, markerCount))
  ) {
    const fromMathpix = buildMathpixSplitPyqRows(text, payload, defaults, slotMap)
    if (fromMathpix.length > fromText.length) {
      fromText = fromMathpix
    }
  }
  if (fromText.length) fromText = healPaperItemCards(fromText)

  let questions = []
  let source = 'empty'
  const sCount = fromStructured.length
  const tCount = fromText.length
  const sDist = sCount ? Math.abs(sCount - expected) : 999
  const tDist = tCount ? Math.abs(tCount - expected) : 999
  const structuredClose = sCount >= trustThreshold && sDist <= tDist

  if (structuredClose) {
    questions = fromStructured
    source = 'gemini-structured'
  } else if (tCount && tDist < sDist) {
    questions = fromText
    source = 'text-fallback'
  } else if (tCount) {
    questions = sCount ? mergeUniquePyqQuestions([fromText, fromStructured]) : fromText
    source = sCount ? 'text+structured-merge' : 'text-fallback'
    if (questions.length < Math.max(sCount, tCount) && Math.max(sCount, tCount) >= trustThreshold) {
      questions = tCount >= sCount ? fromText : fromStructured
      source = tCount >= sCount ? 'text-fallback' : 'gemini-structured'
    }
  } else if (sCount >= trustThreshold) {
    questions = fromStructured
    source = 'gemini-structured'
  } else if (sCount && textGarbled) {
    questions = fromStructured
    source = 'gemini-structured'
  } else if (sCount && exam === 'jee-advanced') {
    questions = []
    source = 'rejected-sparse-gemini'
    rejected.push(
      `Refused ${fromStructured.length} Gemini row(s) as the paper — need the full PDF text (expected ~${expected}, minimum ${trustThreshold}).`,
    )
  } else if (sCount) {
    questions = fromStructured
    source = 'gemini-structured'
  } else if (textGarbled && exam === 'jee-advanced') {
    questions = []
    source = 'rejected-garbled-text'
    rejected.push(
      `PDF text looks scanned/garbled (example: f () x) and was not used as the paper. Need page vision (Gemini) or a text-based official PDF (expected ~${expected}).`,
    )
  }

  questions = healOfficialPyqPaperQuestions({
    notes: text,
    preparedText: text,
    questions,
    exam,
    examPatternId: exam,
    session: paperMeta?.session,
  })
  const filtered = filterInstructionQuestionsFromRows(questions, rejected)
  questions = filtered.questions

  /** @type {OfficialPyqExtractSummary} */
  const summary = {
    expected,
    found: questions.length,
    structuredCount: fromStructured.length,
    textParseCount: fromText.length,
    rejectedCount: rejected.length,
    instructionFiltered: filtered.instructionFiltered,
    source,
    lowCountWarning: questions.length < trustThreshold,
    minApprove: trustThreshold,
    preparedTextLength: text.length,
  }

  if (structured.length && !text.length) {
    rejected.push(
      `Gemini returned ${structured.length} structured row(s) but no OCR text — upload may be partial.`,
    )
  }

  return {
    questions,
    rejected,
    source,
    engine: payload.engine,
    preparedText: text,
    instructionText: '',
    summary,
  }
}

/**
 * PYQ-style generate job must have exam paper identity before calling Gemini.
 * @param {any} job
 */
export function assertGeminiPyqGenerateJob(job) {
  const ready = geminiPyqJobIsReady(job)
  if (!ready.ok) return ready
  return { ok: true }
}

/**
 * Merge per-page Gemini extracts into one paper payload.
 * @param {unknown[]} pageResults
 */
export function mergeGeminiPyqPageExtracts(pageResults = []) {
  const questions = []
  const texts = []
  let anyCloud = false
  for (const page of pageResults ?? []) {
    const payload = coercePyqExtractPayload(page)
    if (payload.engine === 'cloud-vision' || payload.engine === 'pix2text') anyCloud = true
    if (payload.text) texts.push(payload.text)
    for (const q of payload.questions) {
      if (!q || typeof q !== 'object') continue
      questions.push({ ...q, number: questions.length + 1 })
    }
  }
  const pageText = texts.join('\n\n--- page ---\n\n')
  return {
    engine: anyCloud || questions.length ? 'cloud-vision' : 'builtin',
    text: pageText,
    questions,
    pageCount: pageResults?.length ?? 0,
    geminiText: pageText,
  }
}

/**
 * Repair latex on an existing PYQ row without dropping it from the bank.
 * @param {any} q
 */
export function repairGeminiPyqBankItem(q) {
  if (!q || typeof q !== 'object') return q
  const recovered = recoverGeminiPyqStemOptions(
    { stem: q.text ?? q.stem, options: q.options },
    { keepEmpty: true },
  )
  const stem = recovered.stem || String(q.text ?? '').trim()
  if (!stem) return q
  return {
    ...q,
    text: stem,
    options: recovered.options.slice(0, 4),
    solution: q.solution ? repairGeminiPyqLatex(q.solution) : q.solution,
    toughnessLevel:
      q.toughnessLevel != null && q.toughnessLevel !== ''
        ? clampToughnessLevel(q.toughnessLevel, q.toughnessLevel)
        : q.toughnessLevel,
  }
}

function dataUrlToPngFile(dataUrl, name) {
  const m = /^data:([^;]+);base64,(.+)$/.exec(String(dataUrl ?? ''))
  if (!m) throw new Error('Could not render PDF page.')
  const bin = atob(m[2])
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
  return new File([bytes], name, { type: m[1] || 'image/png' })
}

function pyqExtractTimeoutError(timeoutMs) {
  const sec = Math.round(Number(timeoutMs) / 1000)
  const err = new Error(
    `Official PYQ extract timed out after ${sec} seconds. Nothing was saved. Try again, or copy the PDF to the Desktop if it is on OneDrive.`,
  )
  err.code = 'PYQ_EXTRACT_TIMEOUT'
  return err
}

function pyqApiDownError() {
  const err = new Error(
    'Could not reach the API on port 3001. Keep the bottom panel open (Ctrl+J then Ctrl+`), press F5, then try the upload again. Nothing was saved.',
  )
  err.code = 'PYQ_API_DOWN'
  return err
}

function pyqMathpixRequiredError() {
  const err = new Error(
    'Mathpix keys were not loaded from onlinetest/.env. Keep the bottom panel open (Ctrl+J then Ctrl+`), then press F5. Nothing was saved. Gemini generate still works.',
  )
  err.code = 'PYQ_MATHPIX_REQUIRED'
  return err
}

function pyqVisionRequiredError() {
  const err = new Error(
    'API is running but Gemini is not set up. Add GEMINI_API_KEY to onlinetest/.env, keep the bottom panel open, press F5. Nothing was saved.',
  )
  err.code = 'PYQ_VISION_REQUIRED'
  return err
}

/** Strip extra percents so the UI shows one number. */
export function formatOfficialPyqProgress(pct, label) {
  const n = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)))
  const clean = String(label ?? '')
    .replace(/\s*\d+\s*%/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return { pct: n, label: clean }
}
export function formatOfficialPyqUploadError(err, extra = {}) {
  const timeoutMs = Number(extra.timeoutMs) || PYQ_VISION_TIMEOUT_MS
  const aborted = extra.aborted === true
  const raw = err instanceof Error ? err.message : String(err ?? 'Import failed.')
  const code = err && typeof err === 'object' ? err.code : ''
  if (code === 'PYQ_VISION_REQUIRED' || code === 'PYQ_API_DOWN' || code === 'PYQ_PDF_OPEN_TIMEOUT' || code === 'PYQ_MATHPIX_REQUIRED' || code === 'MATHPIX_NOT_CONFIGURED' || code === 'MATHPIX_TIMEOUT' || code === 'GEMINI_STRUCTURE_TIMEOUT') return raw
  if (code === 'PYQ_EXTRACT_TIMEOUT' || /timed out/i.test(raw)) {
    return raw
  }
  if (aborted && !/timed out/i.test(raw)) {
    return `Official PYQ extract timed out after ${Math.round(timeoutMs / 1000)} seconds. Nothing was saved.`
  }
  if (/failed to fetch|networkerror|econnrefused|err_connection/i.test(raw)) {
    return 'Could not reach the API on port 3001. Keep the bottom panel open (Ctrl+J then Ctrl+`), press F5, then try the upload again.'
  }
  if (/pdf|getdocument|worker|invalid pdf/i.test(raw)) {
    return `Could not read the PDF (${raw}). Try the official file again, or attach JSON/CSV questions.`
  }
  return raw || 'Import failed.'
}

/**
 * Sequential Gemini page jobs. A failed / timed-out page does not stop later pages.
 * Whole-job abort is ignored here — only the per-page timer applies.
 * @param {number} pageCount
 * @param {(page: number, signal: AbortSignal) => Promise<unknown>} extractPage
 * @param {{
 *   report?: (pct: number, label?: string) => void
 *   pageTimeoutMs?: number
 *   garbled?: boolean
 * }} [opts]
 */
export async function runPyqGeminiPageJobs(pageCount, extractPage, opts = {}) {
  const n = Math.max(0, Math.min(PYQ_GEMINI_PDF_MAX_PAGES, Number(pageCount) || 0))
  const pageTimeoutMs = Number(opts.pageTimeoutMs) > 0 ? Number(opts.pageTimeoutMs) : PYQ_GEMINI_PAGE_TIMEOUT_MS
  /** @type {unknown[]} */
  const pages = []
  /** @type {{ page: number, error: string }[]} */
  const failures = []
  for (let i = 1; i <= n; i += 1) {
    const label = `Gemini page ${i}/${n}`
    opts.report?.(20 + Math.round(((i - 1) / Math.max(1, n)) * 72), label)
    const pageCtl = new AbortController()
    const pageTimer = setTimeout(() => pageCtl.abort(), pageTimeoutMs)
    try {
      const cloud = await extractPage(i, pageCtl.signal)
      if (cloud) pages.push(cloud)
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e ?? 'page failed')
      failures.push({ page: i, error: errMsg })
      opts.report?.(
        20 + Math.round((i / Math.max(1, n)) * 72),
        `Failed at page ${i}/${n}: ${errMsg.slice(0, 80)}. Continuing remaining pages…`,
      )
    } finally {
      clearTimeout(pageTimer)
    }
  }
  opts.report?.(92, `Gemini finished ${pages.length}/${n} page(s). Parsing questions…`)
  return { pages, failures, pageCount: n }
}

/**
 * Page-by-page Gemini for scanned / garbled official PDFs. Merges every page.
 * @param {File} file
 * @param {{
 *   maxPages: number
 *   report: (pct: number, label?: string) => void
 *   signal?: AbortSignal
 *   garbled?: boolean
 * }} args
 */
async function extractPyqPagesWithGemini(file, args) {
  const { fetchCloudVisionStatus, extractWithCloudVisionClient } = await import(
    './cloudVisionClient.js'
  )
  const status = await fetchCloudVisionStatus({ force: false })
  if (status.reachable === false) {
    throw pyqApiDownError()
  }
  if (!status.configured) {
    return { configured: false, text: '', questions: [], pageCount: 0, failures: [] }
  }
  const { openPdfFromFileOrThrow } = await import('./pdfDocumentCache.js')
  const { renderPdfPageToDataUrl } = await import('./pdfPageRender.js')
  args.report?.(8, 'Gemini page 1/24')
  const { pdf, numPages } = await openPdfFromFileOrThrow(file)
  const pagesToTry = Math.min(numPages, args.maxPages, PYQ_GEMINI_PDF_MAX_PAGES)
  const ran = await runPyqGeminiPageJobs(
    pagesToTry,
    async (i, pageSignal) => {
      const page = await pdf.getPage(i)
      const dataUrl = await renderPdfPageToDataUrl(page, 2)
      const pageFile = dataUrlToPngFile(dataUrl, `pyq-vis-${i}.png`)
      return extractWithCloudVisionClient(pageFile, {
        hint: PYQ_GEMINI_PAGE_HINT,
        signal: pageSignal,
        skipRetry: true,
      })
    },
    { report: args.report, garbled: args.garbled, pageTimeoutMs: PYQ_GEMINI_PAGE_TIMEOUT_MS },
  )
  const merged = mergeGeminiPyqPageExtracts(ran.pages)
  return {
    configured: true,
    text: String(merged.text ?? '').trim(),
    questions: Array.isArray(merged.questions) ? merged.questions : [],
    pageCount: pagesToTry,
    engine: merged.engine,
    failures: ran.failures,
  }
}

/**
 * Official PYQ extract: Mathpix OCR first, then Gemini splits questions vs instructions.
 * Does not auto-publish. Caller saves pending papers.
 * @param {File} file
 * @param {(pct: number, label?: string) => void} [onProgress]
 * @param {{ signal?: AbortSignal, timeoutMs?: number, exam?: string, year?: number, session?: string, paperLabel?: string }} [opts]
 */
export async function extractPyqFileWithGemini(file, onProgress, opts = {}) {
  const { extractMcqFromImage, isPdfFile, isImageFile, isWordFile } = await import(
    './extractDocument.js'
  )
  const { isAbortError } = await import('./ocrAbort.js')
  if (!file) {
    return { text: '', questions: [], engine: 'builtin' }
  }

  const timeoutMs = opts.timeoutMs ?? 400_000
  const ownCtl = new AbortController()
  const ownTimer = setTimeout(() => ownCtl.abort(), timeoutMs)
  const onParentAbort = () => ownCtl.abort()
  if (opts.signal) {
    if (opts.signal.aborted) ownCtl.abort()
    else opts.signal.addEventListener('abort', onParentAbort, { once: true })
  }
  const signal = ownCtl.signal
  const report = (pct, label) => {
    const formatted = formatOfficialPyqProgress(pct, label)
    try {
      onProgress?.(formatted.pct, formatted.label)
    } catch {
      /* ignore UI progress errors */
    }
  }
  const labelForExtractPct = (p) => {
    if (p < 68) return 'Mathpix reading the PDF…'
    if (p < 88) return 'Local AI splitting questions…'
    if (p < 96) return 'Gemini flash-lite tags, answers, solutions…'
    return 'Saving pending paper…'
  }

  try {
    if (isWordFile(file) && !isImageFile(file) && !isPdfFile(file)) {
      report(8, 'Reading Word file…')
      const local = await extractMcqFromImage(file, (p) => report(8 + Math.round(Number(p) * 0.7), 'Reading Word file…'), {
        signal,
        saveToBank: false,
        officialPyq: true,
      })
      const localText = String(local?.text ?? '').trim()
      report(100, 'Parsing questions…')
      return {
        engine: local?.engine || 'word',
        text: localText,
        questions: Array.isArray(local?.questions) ? local.questions : [],
        localOcrText: localText,
        pdfText: localText,
        visionText: '',
      }
    }

    report(5, 'Mathpix reading the PDF…')
    const extracted = await extractMcqFromImage(
      file,
      (p) => {
        const n = Number(p) || 0
        report(8 + Math.round(n * 0.8), labelForExtractPct(n))
      },
      {
        signal,
        timeoutMs,
        saveToBank: false,
        officialPyq: true,
        paperMeta: {
          exam: opts.exam,
          year: opts.year,
          session: opts.session,
          paperLabel: opts.paperLabel,
        },
      },
    )
    if (extracted?.mathpixMissing) {
      throw pyqMathpixRequiredError()
    }
    const parseText = String(extracted?.text ?? '').trim()
    const questions = Array.isArray(extracted?.questions) ? extracted.questions : []
    if (!parseText && !questions.length) {
      throw pyqMathpixRequiredError()
    }
    report(100, 'Done')
    return {
      engine: 'mathpix',
      text: parseText,
      questions,
      localOcrText: parseText,
      pdfText: parseText,
      visionText: parseText,
      textLayerGarbled: false,
      structuredQuestionCount: questions.length,
      instructionText: extracted?.instructionText || '',
      cloudNote: extracted?.cloudNote || '',
    }
  } catch (e) {
    if (e?.code === 'PYQ_VISION_REQUIRED' || e?.code === 'PYQ_API_DOWN' || e?.code === 'PYQ_PDF_OPEN_TIMEOUT' || e?.code === 'PYQ_MATHPIX_REQUIRED' || e?.code === 'MATHPIX_NOT_CONFIGURED') throw e
    if (e?.code === 'PYQ_EXTRACT_TIMEOUT' || signal?.aborted || isAbortError(e)) {
      throw e?.code === 'PYQ_EXTRACT_TIMEOUT' ? e : pyqExtractTimeoutError(timeoutMs)
    }
    throw e
  } finally {
    clearTimeout(ownTimer)
    opts.signal?.removeEventListener('abort', onParentAbort)
  }
}

function extractionCardLooksLikeInstruction(q) {
  const stem = String(q?.text ?? q?.stem ?? '').trim()
  return (
    !stem ||
    looksLikePyqSectionInstructionStem(stem) ||
    looksLikeAnswerKeyMappingBlob(stem) ||
    /--- page ---/i.test(stem)
  )
}

function extractionQuestionBody(q) {
  const stem = String(q?.text ?? q?.stem ?? '').trim()
  const opts = Array.isArray(q?.options) ? q.options.join('\n') : ''
  return [stem, opts].filter(Boolean).join('\n')
}

/** @param {unknown[]} questions */
export function countQuestionsByType(questions) {
  /** @type {Record<string, number>} */
  const out = {}
  for (const q of questions ?? []) {
    const id = String(q?.questionType ?? 'single_correct')
    out[id] = (out[id] || 0) + 1
  }
  return out
}

/** @param {Record<string, number>} typeCounts */
export function formatTypeCountSummary(typeCounts) {
  const entries = Object.entries(typeCounts || {}).filter(([, n]) => n > 0)
  if (!entries.length) return '—'
  return entries
    .map(([id, n]) => {
      const label = getQuestionType(id)?.label || id.replace(/_/g, ' ')
      return `${n} ${label}`
    })
    .join(', ')
}

/** @param {unknown[]} questions */
export function analyzeSplitQuality(questions) {
  const list = Array.isArray(questions) ? questions : []
  let correct = 0
  let partial = 0
  let incorrect = 0
  let instructions = 0
  for (const q of list) {
    if (extractionCardLooksLikeInstruction(q)) {
      instructions += 1
      continue
    }
    const opts = (Array.isArray(q?.options) ? q.options : []).filter((o) => String(o ?? '').trim()).length
    const stem = String(q?.text ?? '').trim()
    const qt = String(q?.questionType ?? 'single_correct')
    const bad =
      !stem ||
      stem.length < 10 ||
      /\\begin\{tabular\}/i.test(stem) ||
      ((qt === 'single_correct' || qt === 'multiple_correct') && opts < 2)
    if (bad) incorrect += 1
    else if (opts >= 4) correct += 1
    else partial += 1
  }
  return {
    questions: list.length - instructions,
    correct,
    partial,
    incorrect,
    instructionsFiltered: instructions,
  }
}

/**
 * Summary table rows for verify UI (PDF / LaTeX / split).
 * @param {{
 *   ocrText?: string
 *   questions?: unknown[]
 *   exam?: string
 *   session?: string
 *   fileKind?: string
 *   extractSummary?: OfficialPyqExtractSummary | null
 * }} input
 */
export function buildExtractionSummaryReport(input = {}) {
  const ocrText = String(input.ocrText ?? '')
  const questions = Array.isArray(input.questions) ? input.questions : []
  const exam = String(input.exam ?? '')
  const expected = expectedPyqPaperQuestionTarget(exam, input.session, ocrText)
  const ocrCount = inferOcrQuestionCount(ocrText)
  const markers = countMathpixQuestionMarkers(ocrText)
  const ocrFigures = (ocrText.match(/\\includegraphics|cdn\.mathpix\.com/gi) || []).length
  let ocrErrors = 0
  if (ocrText && ocrCount < 1) ocrErrors += 1
  if (ocrText.length > 400 && markers < 2 && ocrCount < 2) ocrErrors += 1
  const split = analyzeSplitQuality(questions)
  const realQs = questions.filter((q) => !extractionCardLooksLikeInstruction(q))
  const typeCounts = countQuestionsByType(realQs)
  let splitFigures = 0
  for (const q of realQs) {
    if (hasMathpixMedia(extractionQuestionBody(q))) splitFigures += 1
  }
  const instrBlocks = (ocrText.match(/SECTION\s+\d+|This section contains|Maximum Marks:/gi) || []).length

  return {
    expected,
    pdf: {
      questionCount: ocrCount,
      figureQuestions: ocrFigures,
      instructionBlocks: instrBlocks,
    },
    latex: {
      questionCount: ocrCount,
      markers,
      figureQuestions: ocrFigures,
      errors: ocrErrors,
      charCount: ocrText.length,
    },
    split: {
      questionCount: split.questions,
      typeCounts,
      figureQuestions: splitFigures,
      correct: split.correct,
      partial: split.partial,
      incorrect: split.incorrect,
      instructionsFiltered: split.instructionsFiltered,
      matchExpected: (() => {
        if (expected <= 0) return split.questions >= 4
        const tight = expected >= 40
        const minSplit = tight ? expected - 0 : expected - 2
        const maxSplit = expected + 2
        return split.questions >= minSplit && split.questions <= maxSplit
      })(),
    },
    extractMeta: input.extractSummary || null,
  }
}
