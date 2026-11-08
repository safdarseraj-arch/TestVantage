/**
 * Shared paper-quality heal for EVERY TestVantages upload (Question Bank Convert,
 * Official PYQ, Word/PDF/JSON/CSV, Mathpix split). All years: JEE Main, Advanced, NEET.
 * Do not add per-paper regex. Future edits must keep these laws:
 * 1. Never show raw TeX as code (`\\item`, itemize, aligned `& … \\\\`, bare `\\log`/`\\frac`).
 * 2. Never leave match-the-column with only one list — restore List-I/Column-I from OCR.
 * 3. Never drop Mathpix figures (`\\includegraphics` / cdn.mathpix.com).
 * 4. Match lists stay two-column; options A–D stay unglued; aligned math is a display block.
 * 5. Incomplete-math is unclosed braces / cut OCR only — never a closed `\\frac{5}{4}`.
 * 6. Drop instruction-tail extra cards; never drop a real paper item.
 * 7. Call applyUploadQualityGuards after any parse that builds cards — not a PYQ-only patch.
 * 8. Never split one question into two; never merge two questions into one.
 * Never invent missing denominators or list rows.
 */

import { findFirstOptionsBlockStart } from './mcqOptionMarkers.js'
import { isMatrixGridCard, keepMatrixGridCards } from './matrixGridPyq.js'
import { restoreLabelledFigureOptions } from './labelledFigureOptions.js'
import { extractLatexItemizeMcq, extractLatexTabularMcq } from './mathpixQuestionSplit.js'
import { stripHindiOcr } from './stripHindiOcr.js'
import { hasOriginalPageCrop, isOriginalCropUrl, restoreMissingOptionGridGraphs } from './mathpixMedia.js'
import { repairScanStructureCodes } from './smilesDisplay.js'
import {
  parsePaperSectionMap,
  printedQuestionNumber,
  stampOneQuestionTypeFromSectionMap,
  stampQuestionTypesFromSectionMap,
  stampSubjectsFromPaper,
} from './parsePaperSectionMap.js'
import { findFracExpression } from './latexBraceMatch.js'
import {
  looksLikeAnswerKeyMappingBlob,
  looksLikePyqSectionInstructionStem,
  pageBreakStartsNewSection,
  stripPageBreakAndSectionGlue,
  stripTrailingPyqSectionHeader,
} from './bulkExtractClean.js'
import {
  hasIncompleteFrac,
  latexExtractionIncomplete,
  normalizeFracLatex,
  normalizeSmashedChemDollars,
  spaceLatexCommandsAfterWords,
} from './healTruncatedLatex.js'
import {
  flattenTabularMatchLists,
  looksLikeMatchingListStem,
  normalizeMatchAnswerKey,
  optionsLookLikeMatchAnswers,
  parseMatchingListForDisplay,
  repairMatchListOcrGlitches,
  rewriteLatexItemLabels,
  splitMatchListItems,
  unwrapMathrmListLabels,
  foldListIIFromOptionsIntoStem,
  stripUnlabeledListTwoDump,
} from './parseMatchingListDisplay.js'
import {
  hasMathpixMedia,
  mathpixFiguresSupplyListI,
  extractMathpixImageUrls,
  normalizeBrokenMathpixGraphics,
  restoreTruncatedMathpixCropsFromSource,
  stripEmptyFigureShells,
  stripEmptyImageMarkdown,
  stripMathpixImageMarkup,
} from './mathpixMedia.js'
import {
  repairArrayBodiesMissingRowBreaks,
  restoreGatheredEquationBreaks,
  unwrapProseTabular,
} from './repairMatrixStem.js'
import {
  wrapBareLatexRuns,
  repairOrphanAlignedBody,
  stripRepeatedQuestionNumberPrefix,
  repairFlattenedSetMatrixOcr,
  repairSmashedXyzColumnOcr,
  repairBrokenLeftRightSetOcr,
} from './wrapBareLatexRuns.js'
import { repairSmashedProseVmatrixOcr } from './repairSmashedProseVmatrixOcr.js'
import {
  healPaperItemCards,
  countMathpixQuestionMarkers,
  looksLikeMathpixLatexPaper,
  paperItemsFromMathpixOcr,
  pendingPaperMathpixOcr,
  recoverOptionsFromStem,
  shouldRebuildFromMathpixOcr,
} from './mathpixQuestionSplit.js'
import { dropStemRepeatOptions } from './optionStemLeak.js'
import { annotateMathpixCleanStatus } from './mathpixCleanPipeline.js'
import { sanitizeStemForDisplay } from './sanitizeStemForDisplay.js'
import {
  fillOfficialPyqPairPassages,
  officialPyqCardAllowsPassage,
  officialPyqPassageNeedsOcrRefresh,
  officialPyqPassageRanges,
  officialPyqQuestionsHaveMistakenPassages,
  stripMistakenOfficialPyqPassages,
  peelForeignComprehensionFromStem,
  peelOfficialPyqCardForDisplay,
  recoverOfficialPyqPassageFromSource,
  replaceConflictingStemFromOcr,
} from './passage.js'
import { stemLooksIncompleteOnDisplay } from './sanitizeStemForDisplay.js'
import { visibleLatexSourceHits } from './visibleLatexSource.js'
import { peelPrintedAnswerFromStem } from './answerProvenance.js'
import { restoreDroppedMsOnGivenLine } from './mathpixCleanPipeline.js'
import { repairSmashedWeightSubscripts } from './wrapBareLatexRuns.js'
import { assignUniqueOfficialPyqNumbers } from './officialPyqMissingSlots.js'
import { peelGluedMcqOptions } from './peelGluedMcqOptions.js'

/** OCR often glues "6.if and only if" with no space after the dot — still an option-D tail. */
function stripLeadingQuestionNumberPrefix(text) {
  return stripRepeatedQuestionNumberPrefix(text)
}

export { stripRepeatedQuestionNumberPrefix }

const NEXT_QUESTION_OPENER_RE =
  /^(?:Let|If|Which|Consider|Suppose|Given|Match(?:\s+each)?|For\s+the|How\s+many|What\s+is|The\s+value|An\s+integer|A\s+(?:particle|student)|A\s+function(?!\s+of\b)|Q\s*\.?\s*\d)/i

function stripIncompleteFracTail(s) {
  return String(s ?? '')
    .replace(/\\frac\s*\{[^}]*\}\s*\{[^}]*$/g, '')
    .replace(/\\frac\s*\{[^}]*\}\s*\{?\s*$/g, '')
    .replace(/\s*\/\s*(?:…|\.{2,})\s*$/g, '')
    .trim()
}

/** "(P)" or a row that starts its line with "P." / "P)" (older papers). */
function countListMarkers(text, letters) {
  const t = String(text ?? '')
  return letters.filter((L) =>
    new RegExp(`\\(\\s*${L}\\s*\\)|(?:^|\\n)[ \\t]*${L}\\s*[.)][ \\t]+[A-Za-z$\\\\]`).test(t),
  ).length
}

function filledMatchRows(text, letters) {
  return splitMatchListItems(rewriteLatexItemLabels(String(text ?? '')), letters).filter((x) =>
    String(x.text ?? '').replace(/\s+/g, ' ').trim().length >= 3,
  ).length
}

function hasListIEntries(text, options) {
  const t = String(text ?? '')
  if (mathpixFiguresSupplyListI(t)) return true
  if ((t.match(/Titrate\s*:/gi) || []).length >= 2 && /(?:List|Column)\s*[-–]?\s*I(?!I)\b/i.test(t)) {
    return true
  }
  try {
    const parsed = parseMatchingListForDisplay(t, options)
    const filled = (parsed?.listI || []).filter((x) => String(x.text ?? '').trim()).length
    if (filled >= 2) return true
    if (
      parsed?.listI?.filter((x) => /includegraphics|cdn\.mathpix/i.test(x.text)).length >= 2
    ) {
      return true
    }
  } catch {
    /* display parse is best-effort */
  }
  const optList = Array.isArray(options) ? options : []
  const blob = optionsLookLikeMatchAnswers(optList)
    ? t
    : optList.length
      ? `${t}\n${optList.map((o) => String(o ?? '')).join('\n')}`
      : t
  if (!/(?:List|Column)\s*[-–]?\s*I(?!I)\b/i.test(blob)) return false
  return filledMatchRows(blob, ['P', 'Q', 'R', 'S']) >= 2 || filledMatchRows(blob, ['A', 'B', 'C', 'D']) >= 3
}

function hasListIHeader(text) {
  return /(?:List|Column)\s*[-–]?\s*I(?!I)\b/i.test(String(text ?? ''))
}

function hasListTwoValueRows(text) {
  return countListMarkers(text, ['1', '2', '3', '4']) >= 3
}

function precededByMatchPrep(text, index) {
  return /(?:in|to|with|and)\s+$/i.test(String(text ?? '').slice(Math.max(0, index - 12), index))
}

function isProseListHeader(text, index, end) {
  const after = String(text ?? '').slice(end, end + 80)
  if (/^\s*contains\b/i.test(after)) return true
  if (/^\s*with\s+(?:the\s+)?appropriate/i.test(after)) return true
  return precededByMatchPrep(text, index)
}

function standaloneListIIndex(text) {
  const t = String(text ?? '')
  const re = /(?:List|Column)\s*[-–]?\s*I(?!I)\b/gi
  let m
  while ((m = re.exec(t))) {
    if (isProseListHeader(t, m.index, m.index + m[0].length)) continue
    return m.index
  }
  return -1
}

function standaloneListTwoIndex(text) {
  const t = String(text ?? '')
  const re = /(?:List|Column)\s*[-–]?\s*II\b/gi
  let m
  while ((m = re.exec(t))) {
    if (isProseListHeader(t, m.index, m.index + m[0].length)) continue
    return m.index
  }
  return -1
}

/** Tiny “Match List-I with List-II…” card with no (P)–(S) rows. */
export function looksLikeMatchInstructionOnly(text) {
  const t = String(text ?? '').trim()
  if (!t) return false
  if (hasListIEntries(t)) return false
  if (hasMathpixMedia(t)) return false
  if (hasListTwoValueRows(t)) return false
  const instruction =
    /match\s+(?:the|each)\b/i.test(t) &&
    /List-I/i.test(t)
  if (!instruction) return false
  if (!/^\s*Match\b/i.test(t) && t.length > 180) return false
  if (/\b(?:Let|If|Given|Suppose|Consider|Four identical)\b/.test(t) && !/^\s*Match\b/i.test(t)) {
    return false
  }
  if (t.length <= 420) return true
  return countListMarkers(t, ['P', 'Q', 'R', 'S']) < 2
}

/**
 * True when the stem was cut mid-formula or mid-sentence (Then / such that / …).
 * @param {unknown} text
 */
export function stemLooksCutOff(text) {
  const t = String(text ?? '').trim()
  if (!t) return false
  if (latexExtractionIncomplete(t)) return true
  if (/\bThen\s*[:.]?\s*$/i.test(t)) return true
  const thenAt = t.search(/\bThen\b/i)
  if (thenAt >= 0 && t.length - thenAt < 28 && !/\$/.test(t.slice(thenAt))) return true
  if (looksLikeMatchingListStem(t) && !hasListTwoEntries(t)) return true
  if (/\bsuch that\s*$/i.test(t)) return true
  if (/[-–=]\s*$/.test(t) && t.length < 500) return true
  if (/\/\s*(?:…|\.{2,})\s*$/.test(t)) return true
  return false
}

/**
 * A real paper item that happens to start with display math (Mathpix aligned).
 * Must not be dropped or glued back onto the previous card.
 * @param {unknown} text
 */
export function looksLikeFullPaperItem(text) {
  const t = String(text ?? '').trim()
  if (/\\end\{tabular\}/i.test(t) && !/\\begin\{tabular\}/i.test(t)) return false
  if (t.length < 48) return false
  const body = stripLeadingQuestionNumberPrefix(t)
  if (/^(?:if and only if|and only if)\b/i.test(body)) return false
  if (looksLikeMatchInstructionOnly(t)) return false
  if (/^(?:List|Column)\s*[-–]?\s*II\b/i.test(body) && !hasListIEntries(t)) return false
  if (/Match/i.test(t) && !hasListIEntries(t) && !/\b(?:Let|If|Which|Consider|Suppose)\b/.test(t)) {
    return false
  }
  if (/^(?:also|and)\s+let\b/i.test(body)) return false
  if (/^(?:as\s+)?a\s+function\s+of\b/i.test(body)) return false
  if (/^\(\s*[PQRS]\s*\)/i.test(body) && !/^\(\s*A\s*\)/i.test(body)) return false
  if (/\(\s*Q\s*\)\s*(?:If|Let)\b/i.test(t) && /^(?:If|Let)\b/i.test(body) && !/^Match\b/i.test(body)) {
    return false
  }
  if (/\b(?:Let|If|Which|Consider(?:ing)?|Suppose|Match|Among|Sum\s+of|An\s+)\b/i.test(t) && t.length >= 64) {
    return true
  }
  if (/\\begin\{aligned\}/.test(t) && /\\text\s*\{\s*Let/.test(t) && t.length >= 60) {
    return true
  }
  if (/\(\s*A\s*\)[\s\S]{8,}\(\s*B\s*\)/i.test(t)) return true
  return false
}

/**
 * Formula / “is equal to” fragment — not a new Let/If/Q.n item.
 * @param {unknown} text
 */
export function looksLikeOrphanFragment(text) {
  const t = String(text ?? '').trim()
  if (!t) return false
  if (/\\end\{tabular\}/i.test(t) && !/\\begin\{tabular\}/i.test(t)) return true
  const body = stripLeadingQuestionNumberPrefix(t)
  if (/^(?:if and only if|and only if)\b/i.test(body)) return true
  if (looksLikeMatchInstructionOnly(t)) return true
  if (/^(?:List|Column)\s*[-–]?\s*II\b/i.test(t) && !hasListIEntries(t)) return true
  if (looksLikeFullPaperItem(t)) return false
  if (/^(?:Q(?:uestion)?\s*\.?\s*)?\d{1,2}[\.\)]\s*(?!if and only if|and only if\b)/i.test(t)) {
    return false
  }
  if (/\bQ\s*\.?\s*\d{1,2}\b/i.test(t.slice(0, 48))) return false
  if (/^JEE\b|^SECTION\s+/i.test(t)) return false
  if (/^is equal to\b/i.test(t)) return true
  if (/^\$\$/.test(t) || /^\\left\b/.test(t)) return true
  if (/^Answer\.?\s*$/i.test(t) || /^Answer\.\s/i.test(t)) return true
  if (/^\[?\s*en\s*=/i.test(t)) return true
  if (/^[a-z]/.test(t)) return true
  if (/^\(\s*[A-D]\s*\)\s+\S/.test(t)) return true
  if (/^[\s(]*\(P\)\s*\\?rightarrow/i.test(t) && t.length < 280) return true
  return false
}

export function looksLikeStemContinuation(text) {
  const t = String(text ?? '').trim()
  if (!t) return false
  if (looksLikeOrphanFragment(t)) return true
  if (/^(?:Q(?:uestion)?\s*\.?\s*)?\d{1,2}[\.\)]\s/.test(t)) return false
  if (/\bQ\s*\.?\s*\d{1,2}\b/i.test(t.slice(0, 48))) return false
  if (/^JEE\b|^SECTION\s+/i.test(t)) return false
  if (/^(?:List|Column)\s*[-–]?\s*II\b/i.test(t)) return true
  if (/^(?:is equal to|then)\b/i.test(t)) return true
  if (/^(?:If|Let|Given|Find|Suppose|Consider(?:ing)?|Match|Which|A function|Among|Sum\s+of|An\s+)\b/.test(t)) {
    return false
  }
  return /\\(?:sin|cos|tan|cot|left|frac|sqrt)|\$\$|\bis equal to\b|\bif and only if\b/i.test(t)
}

/** Fold at most this many OCR chars — a 1.6MB notes dump must never be walked as one string. */
const INDEX_IGNORE_MAX = 48_000
/** After a stem hit, copy at most this much — never the rest of the paper. */
const STEM_EXTEND_MAX = 8_000

/**
 * Index of needle in haystack, ignoring $ and extra whitespace.
 * O(n) only, and never folds more than INDEX_IGNORE_MAX chars.
 * The old `folded += ch` + `endsWith` loop went quadratic on JEE Adv 2024 Q17
 * (empty List-II, 1.6MB notes) and froze Approve for tens of minutes.
 * @param {string} haystack
 * @param {string} needle
 * @returns {number}
 */
function indexIgnoreMathWs(haystack, needle) {
  const want = String(needle)
    .replace(/\$+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (want.length < 10) return -1
  const raw = String(haystack ?? '')
  const limit = Math.min(raw.length, INDEX_IGNORE_MAX)
  const parts = []
  const map = []
  let lastSpace = false
  for (let i = 0; i < limit; i += 1) {
    const ch = raw[i]
    if (ch === '$') continue
    if (ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r' || ch === '\f') {
      if (lastSpace) continue
      lastSpace = true
      parts.push(' ')
      map.push(i)
      continue
    }
    lastSpace = false
    parts.push(ch)
    map.push(i)
  }
  const at = parts.join('').indexOf(want)
  if (at < 0) return -1
  return map[at] ?? -1
}

/**
 * Locate a stem snippet in stored OCR. Literal indexOf first (full paper is
 * fine). Fold only 48k windows if spacing/$ differs. Never fold 1.6MB at once.
 * @param {string} src
 * @param {string} needle
 * @param {number} [from]
 * @returns {number} absolute index, or -1
 */
function indexStemInSource(src, needle, from = 0) {
  const raw = String(src ?? '')
  const start = Math.max(0, Number(from) || 0)
  const slice = start > 0 ? raw.slice(start) : raw
  const n = String(needle ?? '')
  if (n.length < 10 || !slice) return -1
  const tryAt = (ndl) => {
    if (!ndl || ndl.length < 10) return -1
    const i = slice.indexOf(ndl)
    return i >= 0 ? start + i : -1
  }
  let hit = tryAt(n)
  if (hit >= 0) return hit
  const noDollar = n.replace(/\$+/g, '')
  if (noDollar !== n) {
    hit = tryAt(noDollar)
    if (hit >= 0) return hit
  }
  const compact = noDollar.replace(/\s+/g, ' ').trim()
  const chunk = compact.slice(0, Math.min(36, compact.length))
  if (chunk.length >= 10) {
    hit = tryAt(chunk)
    if (hit >= 0) return hit
  }
  const overlap = Math.max(80, compact.length)
  for (let pos = 0; pos < slice.length; pos += INDEX_IGNORE_MAX - overlap) {
    const local = indexIgnoreMathWs(slice.slice(pos, pos + INDEX_IGNORE_MAX), compact)
    if (local >= 0) return start + pos + local
    if (pos + INDEX_IGNORE_MAX >= slice.length) break
  }
  return -1
}

/** Stop before (A)–(D), SECTION headers, or the next numbered / Let-If question. */
function sliceUntilStemEnd(taken) {
  const rawTaken = String(taken)
  const t = rawTaken.length > STEM_EXTEND_MAX ? rawTaken.slice(0, STEM_EXTEND_MAX) : rawTaken
  let end = t.length
  const opt = findFirstOptionsBlockStart(t)
  if (opt > 24) end = Math.min(end, opt)
  const pageAt = t.search(/\n*--- page ---/i)
  if (pageAt > 8) {
    const after = t.slice(pageAt).replace(/\n*--- page ---\n*/i, '')
    if (pageBreakStartsNewSection(after)) end = Math.min(end, pageAt)
  }
  const secAt = t.search(/\n\s*SECTION\s+[A-Z0-9()]/i)
  if (secAt > 24) end = Math.min(end, secAt)
  const midSec = t.search(/(?:^|\s)SECTION\s+\d+\s*\(/i)
  if (midSec > 40) end = Math.min(end, midSec)
  const nextNum = t.slice(24).search(/\n(?:Q(?:uestion)?\s*\.?\s*)?\d{1,2}[\.\)]\s/)
  if (nextNum >= 0) end = Math.min(end, 24 + nextNum)
  const nextItemQ = t.slice(20).search(/\\item\s*\[\s*Q\s*\.?\s*(?:\d{1,3}\s*\]|\]\s*\$?\s*\d)/i)
  if (nextItemQ >= 0) end = Math.min(end, 20 + nextItemQ)
  const nextQDot = t.slice(20).search(/\nQ\s*\.\s*\d{1,3}\b/)
  if (nextQDot >= 0) end = Math.min(end, 20 + nextQDot)
  const nextOpener = t.slice(40).search(/\n(?:Let|If|Given|Suppose|Consider|Match each|Which of)\s/)
  if (nextOpener >= 0) end = Math.min(end, 40 + nextOpener)
  const nextBlankEnglish = t.slice(40).search(/\n{2,}(?:The|A|An) [A-Za-z]/)
  if (nextBlankEnglish >= 0) end = Math.min(end, 40 + nextBlankEnglish)
  return stripPageBreakAndSectionGlue(t.slice(0, end))
}

/**
 * If a structured stem was cut, splice the rest from full extract / OCR text
 * up to the option block. Uses whatever is in source — does not hardcode items.
 * @param {unknown} stem
 * @param {unknown} source
 */
/** Finish a trailing unclosed \\frac{…}{ from the paper source — never invent braces. */
function completeTrailingFracFromSource(stem, source) {
  const t = String(stem ?? '')
  const src = String(source ?? '')
  if (!src || !hasIncompleteFrac(t)) return t
  let fracAt = -1
  let search = 0
  while (search < t.length) {
    const at = t.indexOf('\\frac', search)
    if (at < 0) break
    const found = findFracExpression(t, at)
    if (!found || found.start !== at) {
      fracAt = at
      break
    }
    search = at + 5
  }
  if (fracAt < 0) return t
  const before = t.slice(0, fracAt)
  const numM = t.slice(fracAt).match(/^\\frac\s*(\{[^}]*\})/)
  const probe = before.slice(-48).replace(/\$+/g, '').replace(/\s+/g, ' ').trim()
  const hit = probe.length >= 10 ? indexStemInSource(src, probe) : -1
  const searchFrom = hit >= 0 ? hit : 0
  const slice = src.slice(searchFrom, searchFrom + STEM_EXTEND_MAX)
  const re = /\\frac\s*\{/g
  let m
  while ((m = re.exec(slice))) {
    const found = findFracExpression(slice, m.index)
    if (!found) continue
    const numInner = numM?.[1]?.replace(/[{}]/g, '').trim()
    if (numInner && !found.full.replace(/\s+/g, '').includes(numInner.replace(/\s+/g, ''))) {
      continue
    }
    const rest = sliceUntilStemEnd(slice.slice(m.index))
    if (rest.length > 8) return `${before}${rest}`.replace(/\s+\n/g, '\n').trim()
    return `${before}${found.full}`.trim()
  }
  return t
}

function completeUnclosedAlignedFromSource(stem, source) {
  const t = String(stem ?? '')
  const src = String(source ?? '')
  const opens = (t.match(/\\begin\{aligned\}/g) || []).length
  const closes = (t.match(/\\end\{aligned\}/g) || []).length
  if (!src || opens <= closes) return t
  const probe = t.replace(/\$+/g, '').replace(/\s+/g, ' ').trim().slice(0, 56)
  const hit = probe.length >= 16 ? indexStemInSource(src, probe) : -1
  if (hit < 0) return t
  const rest = sliceUntilStemEnd(src.slice(hit, hit + STEM_EXTEND_MAX))
  if (/\\end\{aligned\}/i.test(rest) && rest.length > t.length) {
    return rest.replace(/\s+\n/g, '\n').trim()
  }
  return t
}

export function extendStemFromSource(stem, source) {
  const raw = normalizeFracLatex(stem).trim()
  const src = String(source ?? '')
  if (!src || !raw) return raw
  const spaced = completeUnclosedAlignedFromSource(spaceLatexCommandsAfterWords(raw), src)
  if (!stemLooksCutOff(spaced) && !hasIncompleteFrac(spaced) && !latexExtractionIncomplete(spaced)) {
    return stripPageBreakAndSectionGlue(spaced)
  }

  const fromFrac = completeTrailingFracFromSource(spaced, src)
  let best = fromFrac.length > spaced.length ? fromFrac : spaced

  const needle = stripIncompleteFracTail(best)
  const short = needle.slice(0, Math.min(72, needle.length))
  if (short.length >= 12) {
    let from = 0
    const limit = 8
    for (let n = 0; n < limit; n += 1) {
      const abs = indexStemInSource(src, short, from)
      if (abs < 0) break
      const taken = sliceUntilStemEnd(src.slice(abs, abs + STEM_EXTEND_MAX))
      if (taken.length > best.length) best = taken
      from = abs + Math.max(1, short.length)
      if (from >= src.length) break
    }
  }

  if (best.length > spaced.length) {
    return stripPageBreakAndSectionGlue(spaceLatexCommandsAfterWords(sliceUntilStemEnd(best)))
  }
  return stripPageBreakAndSectionGlue(fromFrac.length > spaced.length ? fromFrac : spaced)
}

function optionCount(q) {
  return (Array.isArray(q?.options) ? q.options : []).filter((o) => String(o ?? '').trim()).length
}

function hasListTwoEntries(text) {
  const t = String(text ?? '')
  const re = /(?:List|Column)\s*[-–]?\s*II\b/gi
  let last = -1
  let m
  while ((m = re.exec(t)) !== null) {
    if (precededByMatchPrep(t, m.index)) continue
    last = m.index
  }
  if (last >= 0) {
    const after = t.slice(last)
    const listIAt = after.search(/(?:List|Column)\s*[-–]?\s*I(?!I)\b/i)
    const romanI = countListMarkers(t, ['I', 'II', 'III', 'IV']) >= 2
    const numAt = after.search(romanI ? /\(\s*(?:[1-5]|[PQRST])\s*\)/ : /\(\s*[1-5]\s*\)/)
    if (numAt >= 0 && (listIAt < 0 || numAt < listIAt)) return true
  }
  if (
    hasListTwoValueRows(t) &&
    countListMarkers(t, ['P', 'Q', 'R', 'S']) < 2 &&
    /(?:^List-II\b|\(1\)\s*\$?\s*\d|\binfinite\b)/i.test(t)
  ) {
    return true
  }
  return false
}

function matchingListMissingListTwo(q) {
  const t = String(q?.text ?? '').trim()
  return looksLikeMatchingListStem(t) && !hasListTwoEntries(t)
}

/** List-II values from a different glued item (gas 2R on an optics card, etc.). */
function listTwoLooksForeign(text) {
  const t = String(text ?? '')
  const ii = standaloneListTwoIndex(t)
  if (ii < 12) return false
  const head = t.slice(0, ii)
  const tail = t.slice(ii)
  const optics = /light ray|refractive index|sphere of refractive/i.test(head)
  const sheets = /Four identical thin|metal sheets/i.test(head)
  const gasHead = /ideal gas|P-T diagram|monatomic/i.test(head)
  const gasTail =
    /gas constant|\b2R\b|\b3R\b|\bnR\b|\\mathcal\{R\}|T_\{0\}|\bT_0\b|\\ln\s*2/i.test(tail)
  const angleTail = /\b(?:30|45|60|90)\s*(?:\\circ|°)/i.test(tail)
  const capTail = /C_\{0\}|\\varepsilon_\{0\}/i.test(tail)
  const chemTail = /<smiles>/i.test(tail)
  const physicsHead =
    optics ||
    sheets ||
    gasHead ||
    /circuit shown|kilo-radians|in Ampere|in Volt|P-T diagram|ideal gas|metal sheets|light ray|capacitance between/i.test(
      head,
    )
  if (optics && (gasTail || capTail)) return true
  if (sheets && gasTail) return true
  if (gasHead && angleTail) return true
  if (physicsHead && chemTail) return true
  return false
}

function stemWantsChemistryProducts(text) {
  const t = String(text ?? '')
  if (/List-I contains various reaction sequences|possible products|phenolic compounds/i.test(t)) {
    return true
  }
  // Official chem match lists: List-I/II with SMILES or reaction-product wording.
  if (
    /<smiles>/i.test(t) &&
    /(?:List|Column)\s*[-–]?\s*I\b/i.test(t) &&
    /(?:List|Column)\s*[-–]?\s*II\b|products?\s+obtained|reaction\s+sequences?|Match each entry/i.test(t)
  ) {
    return true
  }
  return false
}

/** Physics match lists must not keep Q50-style SMILES leftovers. */
function stripChemistryLeakFromPhysicsStem(text, subject = '') {
  const t = String(text ?? '')
  if (!/<smiles>/i.test(t)) return t
  if (stemWantsChemistryProducts(t)) return t
  // A chemistry stem's own structure ("the peptide shown below", 2014 P1 Q36) is the question.
  if (subject === 'chemistry') return t
  if (/(?:shown|given|drawn)\s+below|following\s+(?:compound|structure|molecule|peptide)/i.test(t.split(/<smiles>/i)[0])) return t
  if (/\(\s*[PQRS]\s*\)\s*<smiles>/i.test(t)) return t
  return t
    .replace(/\n?\(\s*[1-5]\s*\)\s*\n\s*<smiles>[\s\S]*?<\/smiles>/gi, '')
    .replace(/<smiles>[\s\S]*?<\/smiles>/gi, '')
}

function stripForeignListTwo(text) {
  const t = stripChemistryLeakFromPhysicsStem(text)
  if (!listTwoLooksForeign(t)) return t
  const ii = standaloneListTwoIndex(t)
  if (ii < 12) return t
  return t.slice(0, ii).trim()
}

/** True leftover List-II dump vs a real match card that still needs List-I. */
function listTwoHasOwnStem(q) {
  const t = String(q?.text ?? '').trim()
  // "Q. 17 LIST-I contains reactions and LIST-II contains major products." opens a new item
  // even when OCR lost every (P)/(1) label of its lists.
  if (/^(?:(?:Q\.?\s*)?\d{1,3}[.)]?\s+)?(?:List|Column)\s*[-–]?\s*I\s+(?:contains|gives|lists|shows)\b/i.test(t)) return true
  const ii = t.search(/(?:List|Column)\s*[-–]?\s*II\b/i)
  const before = (ii >= 0 ? t.slice(0, ii) : t).trim()
  if (before.length < 40) return false
  if (looksLikeMatchInstructionOnly(before)) return false
  return (
    /\b(?:in|from)\s+(?:the\s+)?(?:List|Column)\s*[-–]?\s*I\b(?!\s*I)/i.test(before) ||
    looksLikeMatchingListStem(before) ||
    looksLikeFullPaperItem(before) ||
    /Match each|Match the|A thin uniform|A light ray|One mole|The circuit shown|Four identical/i.test(
      before,
    )
  )
}

function looksLikeOrphanListTwo(q) {
  const t = String(q?.text ?? '').trim()
  if (!t) return false
  if (hasListIEntries(t)) return false
  if (looksLikeMatchInstructionOnly(t)) return false
  const hasIIHeader = /(?:^|\n)\s*(?:List|Column)\s*[-–]?\s*II\b/i.test(t)
  if (hasIIHeader) return true
  if (
    t.length < 640 &&
    hasListTwoValueRows(t) &&
    countListMarkers(t, ['P', 'Q', 'R', 'S']) < 2 &&
    /(?:^List-II\b|\(1\)\s*\$?\s*\d|\binfinite\b)/i.test(t)
  ) {
    return true
  }
  return false
}

/** Match-the-column card that still has no List-I (P)–(S) / Titrate / figure rows — do not approve. */
export function matchQuestionMissingListI(q) {
  if (isMatrixGridCard(q)) {
    return (Array.isArray(q.matrixRows) ? q.matrixRows : []).filter((row) => String(row ?? '').trim()).length < 2
  }
  const t = String(q?.text ?? '').trim()
  if (!t) return false
  if (hasListIEntries(t, q?.options)) return false
  if (hasOriginalPageCrop(t)) return false
  if (looksLikeOrphanListTwo(q)) return true
  if (looksLikeMatchInstructionOnly(t) && !hasListIEntries(t, q?.options)) return true
  if (looksLikeMatchingListStem(t) && !hasListIEntries(t, q?.options)) return true
  if (
    /match\s+(?:the|each)\b/i.test(t) &&
    /(?:List|Column)\s*[-–]?\s*I(?!I)\b/i.test(t) &&
    countListMarkers(t, ['P', 'Q', 'R', 'S']) < 2 &&
    countListMarkers(t, ['A', 'B', 'C', 'D']) < 3
  ) {
    return true
  }
  return false
}

function formatListIBlockFromParsed(parsed) {
  if (!parsed?.listI?.length) return ''
  const rows = parsed.listI
    .filter((x) => /\\mathrm|Titrate|includegraphics|cdn\.mathpix|.{8,}/i.test(String(x.text ?? '').trim()))
    .map((x) => `${x.label} ${String(x.text ?? '').trim()}`.trim())
    .filter(Boolean)
  if (rows.length < 2) return ''
  const title = parsed.listITitle || 'List-I'
  return `${title}\n${rows.join('\n')}`
}

function extractListIBlockFromWindow(window) {
  const raw = rewriteLatexItemLabels(flattenTabularMatchLists(window))
  const parsed = parseMatchingListForDisplay(raw)
  const block = formatListIBlockFromParsed(parsed)
  if (block) return block
  const header = raw.search(/(?:List|Column)\s*[-–]?\s*I(?!I)\b/i)
  const fromHeader = header >= 0 ? raw.slice(header) : raw
  const iiAt = fromHeader.search(/(?:List|Column)\s*[-–]?\s*II\b/i)
  const slice = iiAt > 8 ? fromHeader.slice(0, iiAt) : fromHeader.slice(0, 2400)
  const filled = (x) => /\\mathrm|Titrate|includegraphics|cdn\.mathpix|.{8,}/i.test(String(x.text ?? '').trim())
  const pqrs = splitMatchListItems(slice, ['P', 'Q', 'R', 'S']).filter(filled)
  const abcd = splitMatchListItems(slice, ['A', 'B', 'C', 'D']).filter(filled)
  const items = pqrs.length >= abcd.length ? pqrs : abcd
  if (items.length < 2) return ''
  const title = /column/i.test(slice) ? 'Column I' : 'List-I'
  return `${title}\n${items.map((x) => `${x.label} ${x.text}`.trim()).join('\n')}`
}

function extractListIIBlockFromWindow(window) {
  const raw = rewriteLatexItemLabels(flattenTabularMatchLists(window))
  const parsed = parseMatchingListForDisplay(raw)
  if (parsed?.listII?.length >= 2) {
    const rows = parsed.listII
      .map((x) => `${x.label} ${String(x.text ?? '').trim()}`.trim())
      .filter(Boolean)
    if (rows.length >= 2) return `List-II\n${rows.join('\n')}`
  }
  return ''
}

/**
 * Keep only the question that contains `probeAt`. Never keep the NEXT item's
 * drawing (old code sliced from the last Q-marker, which stole Q.30's figure).
 * Also cut at a new full paper stem glued without a Q. N marker.
 */
const OCR_STEM_BOUNDARY_RE =
  /(?:\\item\s*\[\s*Q\s*\.?\s*(?:\d{1,3}\s*\]|\]\s*\$?\s*\d)|(?:\\section\*?\{\s*)?Question\s+Stem\s+for\s+Question\s+Nos?\.?|(?:^|\n)Q\s*\.?\s*\d{1,2}\b|\b(?:Four identical|A light ray is incident|A thin uniform rod|A source\s*\(\s*S\s*\)|One mole of a|The circuit shown in the figure|A parallel plate|Two identical thin|Based on VSEPR|List-I contains various|Among the following phenolic|In a conductometric|The option\(s\) with correct sequence|A particle of charge|PARAGRAPH|Question\s+Stem\s+for\s+Question\s+Nos?)\b)/gi

function clipOcrWindowToQuestion(window, probeAt) {
  const t = String(window ?? '')
  const markers = [...t.matchAll(OCR_STEM_BOUNDARY_RE)]
  if (!markers.length) return t
  const at = Number.isFinite(Number(probeAt))
    ? Math.max(0, Math.min(Number(probeAt), t.length))
    : -1
  if (at < 0) {
    if (markers.length < 2) return t
    return t.slice(0, markers[1].index ?? t.length)
  }
  let start = 0
  let end = t.length
  for (const m of markers) {
    const i = m.index ?? 0
    if (i <= at) start = i
    if (i > at) {
      end = i
      break
    }
  }
  return t.slice(start, end)
}

/**
 * The stored scan's own question, cut before the next question.
 * Used when the saved card is damaged and the scan still has that sentence.
 * @param {unknown} stem
 * @param {unknown} source
 */
export function ocrQuestionBodyForCard(stem, source) {
  const src = String(source ?? '')
  if (src.length < 80) return ''
  const plain = String(stem ?? '')
    .replace(/\\begin\{tabular\}[\s\S]*?\\end\{tabular\}/gi, ' ')
    .replace(/\\includegraphics(?:\[[^\]]*\])?\{[^}]*\}/gi, ' ')
    .replace(/\$+/g, ' ')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[{}\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const bits = []
  for (let i = 0; i < plain.length && bits.length < 8; i += 36) {
    const chunk = plain.slice(i, i + 64).trim()
    if (chunk.length >= 28) bits.push(chunk)
  }
  const needles = bits.slice(0, 8)
  const stemTokens = new Set(
    plain
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 4),
  )
  const srcLower = src.toLowerCase()
  let best = ''
  let bestScore = 0
  for (const candidate of needles) {
    if (candidate.length < 24) continue
    if (/^match each entry in list/i.test(candidate)) continue
    const needle = candidate.toLowerCase()
    let from = 0
    for (let hop = 0; hop < 4; hop += 1) {
      const at = srcLower.indexOf(needle, from)
      if (at < 0) break
      from = at + needle.length
      const start = Math.max(0, at - 1600)
      const window = src.slice(start, at + 4500)
      let clipped = clipOcrWindowToQuestion(window, at - start)
      clipped = clipped.replace(/\n?\s*Answer\s*:[^\n]*/gi, '\n').replace(/\n{3,}/g, '\n\n').trim()
      if (clipped.length < 60) continue
      const clipTokens = new Set(
        clipped
          .toLowerCase()
          .replace(/\\[a-z]+/g, ' ')
          .split(/[^a-z0-9]+/)
          .filter((word) => word.length > 4),
      )
      let hit = 0
      for (const word of stemTokens) if (clipTokens.has(word)) hit += 1
      const score = stemTokens.size ? hit / stemTokens.size : 0
      if (score > bestScore) {
        bestScore = score
        best = clipped
      }
    }
  }
  if (bestScore < 0.35 || !best) return ''
  return best
}

function stemMentionsFigure(text) {
  const t = stripMathpixImageMarkup(String(text ?? ''))
  return (
    /\b(?:as shown|is shown|are shown|shown in|shown below|in the (?:following )?(?:figure|graph|diagram)|(?:figure|graph|diagram) below|the (?:figure|graph|diagram) shows|refer(?:ring)? to (?:the )?(?:figure|graph|diagram)|see (?:the )?(?:figure|graph|diagram)|the (?:given|following )?(?:figure|graph|diagram)|pictogram|the structure of)\b/i.test(
      t,
    ) ||
    /\bfigure\b/i.test(t) ||
    /conversion of P to Q|sequence of reagents/i.test(t)
  )
}

function stemLooksChemistry(text) {
  return /Lindlar|NaBH|SnCl|phenol|reagent|conversion of P to Q|Titrate\s*:|VSEPR|xenon|reaction sequences|phenolic|conductometric|<smiles>|\\ce\{|C_?\{?9\}?H_?\{?18\}?O_?\{?2\}?|ferricyanide|oxygen atoms in\s+S\s+and\s+T|molecular weight of\s+U|moles of\s+KI|zinc ions|van'?t\s*Hoff/i.test(
    String(text ?? ''),
  )
}

function stemLooksPhysics(text) {
  const t = String(text ?? '')
  if (stemLooksChemistry(t) && !/Young(?:['’]s)?\s+double|spring(?:-|\s*)mass|double\s+slit/i.test(t)) {
    return false
  }
  return /detector|magnetic field|charged particle|velocity selector|circuit shown|capacitance between|kilo-radians|P-T diagram|ideal gas|metal sheets|light ray|uniform magnetic|Work done in the complete|A particle of (?:mass|charge)|ion of mass|Young(?:['’]s)?\s+double|double\s+slit|spring(?:-|\s*)mass|amplitud|oscil/i.test(
    t,
  )
}

function looksLikePhysicsFigureContext(ctx) {
  return /\b(?:detector|magnetic field|B_\{?0\}?|charged particle|velocity selector|ion beam|mass spectrometer|uniform magnetic|H\^\{?\s*\+\s*\}?\s*ion|kinetic energy of (?:the )?ion|Young(?:['’]s)?|double\s+slit|spring(?:-|\s*)mass|particles?\s*[123]|amplitud|oscil)\b/i.test(
    String(ctx ?? ''),
  )
}

function looksLikeChemistryFigureContext(ctx) {
  return /\b(?:Lindlar|NaBH4|NaBH_\{4\}|SnCl2|SnCl_\{2\}|phenol|Titrate\s*:|VSEPR|xenon|<smiles>|\\ce\{|C_?\{?9\}?H_?\{?18\}?O_?\{?2\}?|ferricyanide)\b/i.test(
    String(ctx ?? ''),
  )
}

function contextAroundUrl(hay, url) {
  const u = String(url ?? '')
  const t = String(hay ?? '')
  if (!u || !t) return ''
  const i = t.indexOf(u)
  if (i < 0) return ''
  const from = Math.max(0, i - 400)
  return clipOcrWindowToQuestion(t.slice(from, i + 160), i - from)
}

function stripUrlFromStem(text, url) {
  let s = String(text ?? '')
  const u = String(url ?? '')
  if (!u) return s
  const esc = u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  s = s.replace(new RegExp(`\\\\includegraphics(?:\\[[^\\]]*\\])?\\{${esc}\\}`, 'gi'), '')
  s = s.replace(new RegExp(`!\\[[^\\]]*\\]\\(\\s*${esc}[^)]*\\)`, 'gi'), '')
  return s
}

function figureSubjectConflictsStem(stem, ctx) {
  const chem = stemLooksChemistry(stem)
  const phys = stemLooksPhysics(stem)
  const figPhys = looksLikePhysicsFigureContext(ctx)
  const figChem = looksLikeChemistryFigureContext(ctx)
  if (chem && figPhys && !figChem) return true
  if (phys && figChem && !figPhys) return true
  return false
}

function ocrWindowForStem(stem, source) {
  const src = String(source ?? '')
  if (src.length < 40) return ''
  for (const probe of uniqueStemProbes(stem)) {
    const short = String(probe).replace(/\$+/g, '').replace(/\s+/g, ' ').trim()
    if (short.length < 16 || probeIsGenericMatch(short)) continue
    const idx = findProbeInSource(src, short)
    if (idx < 0) continue
    const from = Math.max(0, idx - 120)
    const window = clipOcrWindowToQuestion(src.slice(from, idx + 4000), idx - from)
    if (window.length > 80) return window
  }
  return ''
}

/** A figure that sits after the next question marker is not this card's option. */
function dropForeignOptionFigures(options, stem, source) {
  const window = ocrWindowForStem(stem, source)
  if (!window) return options
  const winUrls = new Set(extractMathpixImageUrls(window))
  return (Array.isArray(options) ? options : []).map((opt) => {
    const o = String(opt ?? '')
    const urls = extractMathpixImageUrls(o)
    if (!urls.length) return o
    const prose = o
      .replace(/\\includegraphics(?:\[[^\]]*\])?\{[^}]*\}/gi, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\$+/g, '')
      .trim()
    if (prose.length > 12) return o
    if (urls.every((u) => winUrls.has(u))) return o
    return ''
  })
}

/** A match card must not keep a List row, or a SMILES cut on an internal (C), as an A–D option. */
function dropSmilesFragmentsFromMatchOptions(options, stem) {
  const t = String(stem ?? '')
  if (!/(?:List|Column)\s*[-–]?\s*I/i.test(t) || !/<smiles>/i.test(t)) return options
  const bodies = [...t.matchAll(/<smiles>\s*([\s\S]*?)\s*<\/smiles>/gi)].map((m) => String(m[1] ?? '').trim())
  return (Array.isArray(options) ? options : []).map((opt) => {
    const o = String(opt ?? '').trim()
    if (!o) return ''
    const bare = o.replace(/<\/?smiles>/gi, '').trim()
    const broken = /<smiles>/i.test(o) !== /<\/smiles>/i.test(o)
    if (broken) return ''
    if (bare.length >= 8 && bodies.some((b) => b.includes(bare) || bare.includes(b))) return ''
    return o
  })
}

/** "$P \rightarrow 2$" is not an A–D choice unless this question's OCR actually prints it. */
function dropLoneMatchArrowDebris(options, stem, source) {
  const t = String(stem ?? '')
  if (!/match\s+(?:the|each)|(?:List|Column)\s*[-–]?\s*I/i.test(t)) return options
  const window = ocrWindowForStem(stem, source)
  return (Array.isArray(options) ? options : []).map((opt) => {
    const bare = String(opt ?? '')
      .replace(/\$/g, '')
      .replace(/\\mathrm\s*\{([^}]*)\}/g, '$1')
      .replace(/\\rightarrow/g, '→')
      .replace(/[{}~]/g, '')
      .replace(/^[&,\s]+/, '')
      .trim()
    if (!/^P\s*→\s*[1-5]$/.test(bare)) return String(opt ?? '')
    const windowHasFullKey =
      window &&
      /P\s*(?:\\rightarrow|→|->)\s*[1-5]/.test(window) &&
      /Q\s*(?:\\rightarrow|→|->)\s*[1-5]/.test(window)
    if (windowHasFullKey) return String(opt ?? '')
    return ''
  })
}

function probeIsGenericMatch(probe) {
  const s = String(probe ?? '').replace(/\s+/g, ' ').trim()
  return /^match each/i.test(s) && s.length < 56
}

function windowBelongsToStem(window, stem) {
  const fold = (x) =>
    String(x ?? '')
      .replace(/\\includegraphics[\s\S]*?(?:\}|$)/gi, ' ')
      .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
      .replace(/\$+/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  const s = fold(stem)
  const w = fold(window)
  if (s.length < 24) return true
  const unique = s.slice(Math.min(20, s.length - 1), Math.min(s.length, 54)).trim()
  if (unique.length >= 14 && w.includes(unique)) return true
  const head = s.slice(0, Math.min(40, s.length))
  return head.length >= 20 && w.includes(head)
}

/**
 * A recovered A–D table belongs to this card only when the window still
 * contains this card's structure or figure. The next question's table does not.
 */
function matchWindowOwnsStem(window, stem) {
  const w = String(window ?? '')
  const smiles = [...String(stem ?? '').matchAll(/<smiles>\s*([\s\S]*?)\s*<\/smiles>/gi)]
    .map((m) => String(m[1] ?? '').replace(/\s+/g, '').trim())
    .filter((s) => s.length >= 8)
  if (smiles.length) {
    const flat = w.replace(/\s+/g, '')
    return smiles.some((s) => flat.includes(s.slice(0, 20)))
  }
  const urls = extractMathpixImageUrls(stem)
  if (urls.length) {
    return urls.some((u) => w.includes(String(u).split('?')[0].slice(-48)))
  }
  return windowBelongsToStem(w, stem)
}

/**
 * Printed numbers repeat per subject, so a paragraph's pictures are checked against the
 * scan right after its own wording, not the first "Q. 17" span.
 */
function passageWordingOwnsUrls(passage, source, urls) {
  const src = String(source ?? '')
  const lines = stripMathpixImageMarkup(String(passage ?? ''))
    .replace(/<smiles>[\s\S]*?<\/smiles>/gi, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length >= 30)
    .sort((a, b) => b.length - a.length)
  for (const line of lines.slice(0, 3)) {
    for (let at = src.indexOf(line); at >= 0; at = src.indexOf(line, at + 1)) {
      const region = src.slice(at, at + String(passage).length + 2000)
      if (urls.every((url) => region.includes(url))) return true
    }
  }
  return false
}

/** Wrong-question drawings: drop URLs that are not in this card's OCR span. */
function dropStolenFigures(stem, source, printedNumber, map, { passage = false } = {}) {
  const t = String(stem ?? '').trim()
  if (!t) return t
  const urls = extractMathpixImageUrls(t)
  if (!urls.length) return t
  const src = String(source ?? '')
  if (passage && passageWordingOwnsUrls(t, src, urls.filter((url) => !isOriginalCropUrl(url)))) return t
  // A shared passage owns the figures of its whole range (heading to last child), not one
  // child's span, which can run into the next stem's heading and figure.
  const n = Number(printedNumber)
  const inRange = passage && officialPyqPassageRanges(src, map).some((r) => n >= r.from && n <= r.to)
  const span = passage ? (inRange ? ocrSpanForCard(src, printedNumber, map) : '') : ocrSpanForCard(src, printedNumber, map, t)
  const spanUrls = span ? new Set(extractMathpixImageUrls(span)) : null
  let next = t
  for (const url of urls) {
    // A picture cropped from this card's original page is never in the OCR and never stolen.
    if (isOriginalCropUrl(url)) continue
    // Only drop when this card's OCR span clearly owns other figures and not this URL.
    if (span && span.length >= 80 && spanUrls && spanUrls.size > 0 && !spanUrls.has(url)) {
      next = stripUrlFromStem(next, url)
      continue
    }
    const ctx = contextAroundUrl(span || src, url) || contextAroundUrl(t, url)
    if (figureSubjectConflictsStem(t, ctx)) next = stripUrlFromStem(next, url)
  }
  next = next.replace(/\n{3,}/g, '\n\n').trim()
  const kept = extractMathpixImageUrls(next).filter((url) => !isOriginalCropUrl(url))
  if (!kept.length) return next
  if (stemMentionsFigure(next)) return next
  if (kept.length >= 2 && mathpixFiguresSupplyListI(next)) return next
  if (src.length >= 40) {
    const probes = uniqueStemProbes(stripMathpixImageMarkup(next))
    for (const probe of probes) {
      const short = String(probe).replace(/\$+/g, '').replace(/\s+/g, ' ').trim()
      if (short.length < 12 || probeIsGenericMatch(short)) continue
      const idx = findProbeInSource(src, short)
      if (idx < 0) continue
      const from = Math.max(0, idx - 200)
      const window = clipOcrWindowToQuestion(src.slice(from, idx + 1400), idx - from)
      if (!windowBelongsToStem(window, next)) continue
      const winUrls = new Set(extractMathpixImageUrls(window))
      let owned = next
      for (const url of kept) {
        if (!winUrls.has(url)) owned = stripUrlFromStem(owned, url)
      }
      return owned.replace(/\n{3,}/g, '\n\n').trim()
    }
  }
  if (kept.length === extractMathpixImageUrls(next).length) return stripMathpixImageMarkup(next)
  return kept.reduce((s, url) => stripUrlFromStem(s, url), next).replace(/\n{3,}/g, '\n\n').trim()
}

function spliceListIIntoStem(stem, listIBlock) {
  const t = String(stem ?? '').trim()
  const block = String(listIBlock ?? '').trim()
  if (!t || !block) return t
  if (countListMarkers(t, ['P']) < 1 && countListMarkers(t, ['Q', 'R', 'S']) >= 2) {
    const pRow = block.match(/\(P\)[^\n]+/)
    const qAt = t.search(/\(\s*Q\s*\)/)
    if (pRow && qAt >= 0) return `${t.slice(0, qAt)}${pRow[0]}\n${t.slice(qAt)}`
  }
  if (hasListIEntries(t) && countListMarkers(t, ['P']) >= 1) return t
  const ii = standaloneListTwoIndex(t)
  const iAt = standaloneListIIndex(t)
  if (iAt >= 0) {
    const end = ii > iAt ? ii : t.length
    return `${t.slice(0, iAt).trim()}\n\n${block}\n\n${t.slice(end).trim()}`.trim()
  }
  if (ii >= 0) return `${t.slice(0, ii).trim()}\n\n${block}\n\n${t.slice(ii).trim()}`
  return `${t}\n\n${block}`
}

/** Prefer a unique List-I row / opener over generic “Let f” / “Match each”. */
function uniqueStemProbes(text) {
  const t = String(text ?? '')
  const probes = []
  const push = (p) => {
    const s = String(p ?? '')
      .replace(/\$+/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (s.length >= 12 && !probes.includes(s)) probes.push(s)
  }
  const rowP = t.match(/\(\s*P\s*\)\s+([^\n]{8,70})/)
  if (rowP) push(rowP[0])
  // OCR writes the label as \item[P.], so also look for the row wording alone.
  if (rowP && rowP[1].replace(/\$+/g, '').trim().length >= 24) push(rowP[1])
  const distinctive = t.match(
    /(?:Let\s+\$\\alpha|Let\s+\$f\s*:\s*\\mathbb\{R\}|One mole of a|Four identical thin|A light ray is incident|The circuit shown in the figure|Based on VSEPR|List-I contains various|Among the following phenolic|In a conductometric|A particle of charge|The option\(s\) with correct sequence|conversion of P to Q|Work done in the complete)[^\n]{0,48}/i,
  )
  if (distinctive) push(distinctive[0])
  push(t.replace(/\$+/g, '').replace(/\s+/g, ' ').trim().slice(0, 72))
  const matchLine = t.match(/Match[^\n]{12,80}/i)
  if (matchLine) push(matchLine[0])
  return probes
}

/** Fast locate of a stem snippet in stored OCR — avoid folding the whole paper. */
function findProbeInSource(src, probe) {
  const raw = String(probe ?? '').trim()
  if (raw.length < 12) return -1
  const direct = src.indexOf(raw)
  if (direct >= 0) return direct
  const noDollar = raw.replace(/\$+/g, '')
  if (noDollar.length >= 12 && noDollar !== raw) {
    const at = src.indexOf(noDollar)
    if (at >= 0) return at
  }
  const compact = raw.replace(/\$+/g, '').replace(/\s+/g, ' ').trim()
  if (compact.length < 12) return -1
  const beforeThen = compact.split(/\bthen\b/i)[0].trim()
  const genericThen =
    /^(?:a particle of charge|let |if |match each)\b/i.test(beforeThen) && beforeThen.length < 40
  if (beforeThen.length >= 16 && beforeThen !== compact && !genericThen) {
    const atThen = src.indexOf(beforeThen)
    if (atThen >= 0) return atThen
  }
  const chunk = compact.slice(0, Math.min(36, compact.length))
  const spaced = src.indexOf(chunk)
  if (spaced >= 0) return spaced
  const cap = Math.min(src.length, 48_000)
  return indexIgnoreMathWs(src.slice(0, cap), compact)
}

/**
 * Copy List-I / Column I from stored OCR around this question. Never invent rows.
 * @param {unknown} stem
 * @param {unknown} options
 * @param {unknown} source
 */
export function restoreMissingListIFromSource(stem, options, source) {
  const text = String(stem ?? '').trim()
  const src = String(source ?? '')
  if (!text || src.length < 40) return text
  const missingPRow =
    countListMarkers(text, ['P']) < 1 &&
    (countListMarkers(text, ['Q', 'R', 'S']) >= 2 || standaloneListIIndex(text) >= 0)
  if (!matchQuestionMissingListI({ text, options }) && !missingPRow) return text
  // Already has the List-I drawings — only label (P). Never splice a figure
  // from another page (that stole Q50’s scheme).
  if (missingPRow && extractMathpixImageUrls(text).length >= 3) {
    if (!/\(\s*P\s*\)/.test(text)) {
      return text.replace(
        /((?:List|Column)\s*[-–]?\s*I(?!I)\b[^\n]*\n+)(?=\s*\\includegraphics)/i,
        '$1(P)\n',
      )
    }
    return text
  }

  const probes = uniqueStemProbes(text)
  const listTwo = text.match(/\(\s*1\s*\)\s*([^(\n]{8,80})/)
  if (listTwo) probes.unshift(String(listTwo[0]).replace(/\$+/g, '').replace(/\s+/g, ' ').trim())

  let bestBlock = ''
  for (const probe of probes) {
    const short = String(probe).replace(/\$+/g, '').replace(/\s+/g, ' ').trim()
    if (short.length < 12) continue
    let from = 0
    for (let n = 0; n < 4; n += 1) {
      const idx = findProbeInSource(src.slice(from), short)
      if (idx < 0) break
      const abs = from + idx
      const winStart = Math.max(0, abs - 3500)
      const window = clipOcrWindowToQuestion(src.slice(winStart, abs + 2400), abs - winStart)
      const block = extractListIBlockFromWindow(window)
      if (block && (block.length > bestBlock.length || /\\includegraphics/.test(block))) {
        bestBlock = block
      }
      from = abs + Math.max(1, short.length)
      if (from >= src.length) break
    }
    if (bestBlock) break
  }

  if (!bestBlock) return text
  if (
    !hasListIEntries(bestBlock, options) &&
    !/includegraphics|Titrate\s*:|\\mathrm/i.test(bestBlock)
  ) {
    return text
  }
  if (
    /includegraphics|cdn\.mathpix/i.test(bestBlock) &&
    extractMathpixImageUrls(bestBlock).length < 2 &&
    !/\(\s*[PQRS]\s*\)\s*(?:If|Let)\b/i.test(bestBlock) &&
    !/Titrate\s*:/i.test(bestBlock) &&
    !stemMentionsFigure(text)
  ) {
    return text
  }
  return spliceListIIntoStem(text, bestBlock)
}

/**
 * Copy List-II / Column II from stored OCR. Never invent rows.
 * @param {unknown} stem
 * @param {unknown} options
 * @param {unknown} source
 */
export function restoreMissingListIIFromSource(stem, options, source) {
  const text = String(stem ?? '').trim()
  const src = String(source ?? '')
  if (!text || src.length < 40) return text
  if (!matchingListMissingListTwo({ text, options })) return text

  const probes = uniqueStemProbes(text)

  let bestBlock = ''
  for (const probe of probes) {
    const short = String(probe).replace(/\$+/g, '').replace(/\s+/g, ' ').trim()
    if (short.length < 12) continue
    let from = 0
    for (let n = 0; n < 4; n += 1) {
      const idx = findProbeInSource(src.slice(from), short)
      if (idx < 0) break
      const abs = from + idx
      // A List-I row probe sits after the whole stem; look back far enough to keep the stem.
      const winStart = Math.max(0, abs - Math.max(200, Math.min(text.length + 200, 2400)))
      const window = clipOcrWindowToQuestion(src.slice(winStart, abs + 2800), abs - winStart)
      // A later question can have a longer List-II. Keep only the window that
      // still contains this card. Do not delete rows that window already has,
      // and do not fill this card from the next question.
      if (!matchWindowOwnsStem(window, text)) {
        from = abs + Math.max(1, short.length)
        continue
      }
      const block = extractListIIBlockFromWindow(window)
      if (block && listTwoLooksForeign(`${text}\n${block}`)) {
        from = abs + Math.max(1, short.length)
        continue
      }
      if (block && block.length > bestBlock.length) bestBlock = block
      from = abs + Math.max(1, short.length)
      if (from >= src.length) break
    }
    if (bestBlock) break
  }
  if (!bestBlock) return text
  return spliceListIIIntoStem(text, bestBlock)
}

function spliceListIIIntoStem(stem, listIIBlock) {
  const t = String(stem ?? '').trim()
  const block = String(listIIBlock ?? '').trim()
  if (!t || !block) return t
  if (hasListTwoEntries(t)) return t
  const emptyII = t.search(
    /(?:List|Column)\s*[-–]?\s*II\b\s*(?=\s*$)/i,
  )
  if (emptyII >= 0) {
    return `${t.slice(0, emptyII).trim()}\n\n${block}`.trim()
  }
  return `${t}\n\n${block}`
}

function questionMarkerIndicesInSource(text, n) {
  const t = String(text ?? '')
  const num = Number(n)
  if (!Number.isFinite(num) || num < 1) return []
  const re = new RegExp(
    `(?:\\\\item\\s*\\[\\s*Q[^\\]]*\\]\\s*|(?:^|\\n)\\s*Q\\s*\\.?\\s*)${num}\\b`,
    'gi',
  )
  const out = []
  let m
  while ((m = re.exec(t))) {
    if (m.index != null) out.push(m.index)
  }
  return out
}

function questionMarkerIndexInSource(text, n, stemHint = '') {
  const indices = questionMarkerIndicesInSource(text, n)
  if (!indices.length) return -1
  const hint = foldStem(stemHint).slice(0, 56)
  if (hint.length >= 16 && indices.length > 1) {
    const needle = hint.slice(0, 28)
    for (const i of indices) {
      if (foldStem(String(text).slice(i, i + 500)).includes(needle)) return i
    }
  }
  return indices[0]
}

function nextQuestionMarkerAfter(text, from) {
  const t = String(text ?? '')
  const re = /(?:\\item\s*\[\s*Q[^\]]*\]\s*|(?:^|\n)\s*Q\s*\.?\s*)\d{1,3}\b/gi
  re.lastIndex = Math.max(0, Number(from) || 0)
  const m = re.exec(t)
  return m && m.index != null ? m.index : -1
}

/**
 * OCR slice that belongs to this printed number: the paragraph block if the
 * card is a child, otherwise Q.n through the next Q marker.
 * When Q.n is reprinted (Math / Physics / Chemistry), stemHint picks the right copy.
 */
function ocrSpanForCard(source, printedNumber, map, stemHint = '') {
  const src = String(source ?? '')
  const n = Number(printedNumber)
  if (!src || !Number.isFinite(n) || n <= 0) return ''
  const ranges = officialPyqPassageRanges(src, map)
  const range = ranges.find((r) => n >= r.from && n <= r.to)
  if (range && !stemHint) {
    const firstAt = questionMarkerIndexInSource(src, range.from)
    const lastAt = questionMarkerIndexInSource(src, range.to)
    const headerRe =
      /(?:\\section\*?\{[^}]*PARAGRAPH|PARAGRAPH\s*[“"'"]?[IVXL\d]|Paragraph\s+for\s+(?:Questions?|Q\.?)\s*\d|(?:Passage|Comprehension)\s*:|(?:\\section\*?\{\s*)?Question\s+Stem\s+for\s+Question\s+Nos?\.?\s*\d)/gi
    let headerAt = -1
    const searchEnd = firstAt >= 0 ? firstAt : src.length
    let m
    const re = new RegExp(headerRe.source, 'gi')
    const head = src.slice(0, searchEnd)
    while ((m = re.exec(head)) !== null) headerAt = m.index
    const start = headerAt >= 0 ? headerAt : firstAt >= 0 ? firstAt : 0
    const afterLast = lastAt >= 0 ? nextQuestionMarkerAfter(src, lastAt + 2) : -1
    const end = afterLast >= 0 ? afterLast : src.length
    if (end > start) return src.slice(start, end)
  }
  const at = questionMarkerIndexInSource(src, n, stemHint)
  if (at < 0) return ''
  const nxt = nextQuestionMarkerAfter(src, at + 2)
  return src.slice(at, nxt >= 0 ? nxt : src.length)
}

/**
 * If the stem says a figure is shown but has no Mathpix URL, copy
 * \\includegraphics / cdn.mathpix.com URLs from THIS card's OCR span only.
 * Never invents drawings.
 * @param {unknown} stem
 * @param {unknown} source
 * @param {number} [printedNumber]
 * @param {{ passageRanges?: Array<{ from: number, to: number }> }} [map]
 */
export function restoreMissingFiguresFromSource(stem, source, printedNumber, map) {
  const text = String(stem ?? '').trim()
  const src = String(source ?? '')
  if (!text || src.length < 40) return text
  if (extractMathpixImageUrls(text).length) return text
  const span = ocrSpanForCard(src, printedNumber, map, text)
  const hay = span || src
  const wantsFigure = stemMentionsFigure(text)
  const probes = uniqueStemProbes(text)
  for (const probe of probes) {
    const short = String(probe).replace(/\$+/g, '').replace(/\s+/g, ' ').trim()
    if (short.length < 16) continue
    if (!wantsFigure && probeIsGenericMatch(short)) continue
    let from = 0
    for (let step = 0; step < 4; step += 1) {
      const idx = findProbeInSource(hay.slice(from), short)
      if (idx < 0) break
      const abs = from + idx
      const winStart = Math.max(0, abs - 200)
      const window = clipOcrWindowToQuestion(hay.slice(winStart, abs + 1400), abs - winStart)
      from = abs + Math.max(1, short.length)
      if (!windowBelongsToStem(window, text)) continue
      if (figureSubjectConflictsStem(text, window)) continue
      const urls = extractMathpixImageUrls(window).filter((url) => {
        const file = String(url).split('?')[0]
        const at = window.indexOf(file)
        const before = at >= 0 ? window.slice(Math.max(0, at - 90), at) : ''
        return !/\(\s*[A-D]\s*\)\s*(?:\\?&)?\s*(?:!\[[^\]]*\]\(\s*)?$/i.test(before)
      })
      if (!urls.length) continue
      if (!wantsFigure && short.length < 20) continue
      const extra = urls.map((u) => `\\includegraphics{${u}}`).join('\n')
      return `${text}\n${extra}`
    }
  }
  return text
}

/** Copy List-II SMILES rows from THIS question’s OCR only — never a later chemistry item. */
function restoreListTwoSmilesFromSource(stem, source) {
  const text = String(stem ?? '').trim()
  const src = String(source ?? '')
  if (!text || src.length < 40) return text
  if ((text.match(/<smiles>/gi) || []).length >= 2) return text
  if (!stemWantsChemistryProducts(text)) return text
  const iiAt0 = standaloneListTwoIndex(text)
  const listTwo0 = iiAt0 >= 0 ? text.slice(iiAt0) : ''
  if (
    /\\circ|°|C_\{0\}|\\varepsilon|\\mathcal\{R\}|T_\{0\}|kilo-radians|\(\s*1\s*\)\s*\$?\s*\d/i.test(
      listTwo0,
    )
  ) {
    return text
  }
  const iAt0 = standaloneListIIndex(text)
  const iFiles = new Set(
    extractMathpixImageUrls(iAt0 >= 0 && iiAt0 > iAt0 ? text.slice(iAt0, iiAt0) : text)
      .map((u) => String(u).split('?')[0]),
  )
  const iiForeign = extractMathpixImageUrls(listTwo0).filter((u) => !iFiles.has(String(u).split('?')[0]))
  let working = text
  if (iiForeign.length && iFiles.size) {
    for (const url of iiForeign) {
      working = working.split(`\\includegraphics{${url}}`).join('')
    }
  }
  const listTwo = working.slice(Math.max(0, standaloneListTwoIndex(working)))
  const listTwoOnly = extractMathpixImageUrls(listTwo).filter((u) => {
    const w = Number(String(u).match(/width=(\d+)/i)?.[1] || 0)
    const x = Number(String(u).match(/top_left_x=(\d+)/i)?.[1] || 0)
    return !(x < 900 && w >= 500)
  })
  // Same-page List-II product drawings beat SMILES. Left-column schemes are List-I.
  if (listTwoOnly.length >= 3) return working
  const probes = uniqueStemProbes(working)
  for (const probe of probes) {
    const short = String(probe).replace(/\$+/g, '').replace(/\s+/g, ' ').trim()
    if (short.length < 12) continue
    const idx = findProbeInSource(src, short)
    if (idx < 0) continue
    const from = Math.max(0, idx - 200)
    const window = clipOcrWindowToQuestion(src.slice(from, idx + 2800), idx - from)
    if (!stemWantsChemistryProducts(window) && !/<smiles>/i.test(window)) continue
    const rows = [...rewriteLatexItemLabels(window).matchAll(
      /\(\s*([1-5])\s*\)\s*\n\s*<smiles>\s*([\s\S]*?)\s*<\/smiles>/gi,
    )]
    if (rows.length < 2) continue
    const block = rows
      .map((m) => `(${m[1]})\n<smiles>${String(m[2] ?? '').trim()}</smiles>`)
      .join('\n')
    if (/<smiles>/i.test(working)) return working
    return `${working.trim()}\n${block}`
  }
  return working
}

/** Copy a complete [Given, …] line from OCR when heal left $$ ] or cut en =. */
function restoreGivenBracketFromSource(stem, source) {
  const text = String(stem ?? '')
  const src = String(source ?? '')
  if (!/\[Given/i.test(text) || src.length < 40) return text
  if (!/\$\$\s*\]/.test(text) && !latexExtractionIncomplete(text) && !/\\right\]\$\$/.test(text)) {
    return text
  }
  const probe = text.match(/\[Given[^\n\]]{0,48}/i)?.[0]
  if (!probe) return text
  const idx = findProbeInSource(src, probe)
  if (idx < 0) return text
  const win = src.slice(idx, idx + 520)
  const given = win.match(
    /\[Given[\s\S]{12,400}?(?:\$\$\s*$|\$(?:\s*\])|(?:\\right\]\s*\$\$))/m,
  )
  if (!given?.[0] || given[0].length < 24) return text
  return text.replace(/\[Given[\s\S]*?(?:\$\$\s*\]|\](?:\s*\$\$)?|$)/, given[0].trim())
}

/** Copy a clean ion table from OCR when the stored tabular has leftover $$. */
/** Put OCR chemistry back on empty (P)(Q)(R)(S) labels. Never invent formulas. */
function fillEmptyPqrsFromSource(stem, source) {
  const text = String(stem ?? '')
  const src = String(source ?? '')
  if (!/\(\s*P\s*\)\s*\n\s*\(\s*Q\s*\)/.test(text) || src.length < 40) return text
  if (/\(\s*P\s*\)\s+(?!\(\s*[QRS]\s*\))\S/.test(text)) return text
  const probes = uniqueStemProbes(text)
  for (const probe of probes) {
    const short = String(probe).replace(/\$+/g, '').replace(/\s+/g, ' ').trim()
    if (short.length < 12) continue
    const idx = findProbeInSource(src, short)
    if (idx < 0) continue
    const from = Math.max(0, idx - 200)
    const window = clipOcrWindowToQuestion(src.slice(from, idx + 2000), idx - from)
    const filled = {}
    const raw = rewriteLatexItemLabels(window)
    for (const m of raw.matchAll(/\(\s*([PQRS])\s*\)\s+(\$\\mathrm[\s\S]{2,80}?)(?=\n\s*\(\s*[PQRS1-5]\s*\)|\n\s*List-|\n\s*$)/gi)) {
      const body = String(m[2] ?? '').trim()
      if (/\\mathrm/.test(body)) filled[m[1].toUpperCase()] = body
    }
    if (Object.keys(filled).length < 2) continue
    return text.replace(/\(\s*([PQRS])\s*\)[ \t]*(?=\n)/g, (full, L) => {
      const body = filled[String(L).toUpperCase()]
      return body ? `(${String(L).toUpperCase()}) ${body}` : full
    })
  }
  return text
}

function restoreSmashedTabularFromSource(stem, source) {
  const text = String(stem ?? '')
  const src = String(source ?? '')
  if (!/\\begin\{tabular\}/i.test(text) || src.length < 40) return text
  if (!/\\\\\$+|COO\^\{-\}\s*\\\\?\s*\$/.test(text) && !latexExtractionIncomplete(text)) {
    return text
  }
  const probe =
    text.match(/limiting ionic conductivity[^\n]{0,40}/i)?.[0] ||
    text.match(/In a conductometric[^\n]{0,40}/i)?.[0]
  if (!probe) return text
  const idx = findProbeInSource(src, probe)
  if (idx < 0) return text
  const win = src.slice(idx, idx + 1800)
  const tab = win.match(/\\begin\{tabular\}[\s\S]*?\\end\{tabular\}/)
  if (!tab?.[0] || /\\\\\$+/.test(tab[0])) return text
  return text.replace(/\\begin\{tabular\}[\s\S]*?\\end\{tabular\}(?:\s*\$+)?/, tab[0])
}

function prevAcceptsMatchContinuation(q) {
  const t = String(q?.text ?? '').trim()
  if (!t) return false
  if (looksLikeMatchInstructionOnly(t)) return true
  if (looksLikeMatchingListStem(t) || hasListIEntries(t) || matchingListMissingListTwo(q)) return true
  if (hasListIHeader(t) && countListMarkers(t, ['P', 'Q', 'R', 'S']) >= 2) return true
  return false
}

function foldStem(text) {
  return String(text ?? '')
    .replace(/\$+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function appendStemPart(prev, part) {
  const p = String(prev ?? '').trim()
  const add = String(part ?? '').trim()
  if (!add) return p
  if (!p) return add
  const foldedP = foldStem(p)
  const probe = foldStem(add).slice(0, Math.min(56, foldStem(add).length))
  if (probe.length >= 16 && foldedP.includes(probe)) return p
  return `${p}\n\n${add}`
}

function pickMergedOptions(prevOpts, nextOpts) {
  const a = (Array.isArray(prevOpts) ? prevOpts : []).map((o) => String(o ?? ''))
  const b = (Array.isArray(nextOpts) ? nextOpts : []).map((o) => String(o ?? ''))
  const aN = a.filter((o) => o.trim()).length
  const bN = b.filter((o) => o.trim()).length
  const aMap = optionsLookLikeMatchAnswers(a)
  const bMap = optionsLookLikeMatchAnswers(b)
  const bForeign =
    bN >= 2 &&
    !bMap &&
    b.filter((o) => /°|\\circ|degrees/i.test(o) || /^(?:30|45|60|90|150)/.test(o.trim())).length >= 2
  if (bForeign && !aMap) return aN ? a : a
  if (bForeign && aMap) return a
  if (bN >= 2 && aN < 2 && bForeign) return a
  if (bN >= 2 && aN < 2) return b
  if (aN >= 2 && bN < 2) return a
  if (aN >= 2 && bN >= 2) {
    if (aMap && !bMap) return a
    if (bMap && !aMap) return b
    const a0 = String(a[0] ?? '').trim()
    const b0 = String(b[0] ?? '').trim()
    if (optionLooksTruncated(b0) && !optionLooksTruncated(a0)) return a
    if (optionLooksTruncated(a0) && !optionLooksTruncated(b0)) return b
    if (a0.length >= b0.length) return a
    return b
  }
  return aN >= bN ? a : b
}

function optionLooksTruncated(opt) {
  const s = String(opt ?? '').trim()
  if (!s) return false
  const opens = (s.match(/\{/g) || []).length
  const closes = (s.match(/\}/g) || []).length
  if (opens > closes) return true
  if (/\\text\s*\{\s*[^}]*$/.test(s)) return true
  if (/\[[^\]]*$/.test(s)) return true
  return false
}

function optionLooksBleedHead(opt) {
  const s = String(opt ?? '').trim()
  return /^[_}\\\]]/.test(s) || /^and\s*\[/.test(s)
}

/** Join a cut option with the next box that starts mid-formula (page-break bleed). */
export function joinBleedingOptions(options) {
  const opts = (Array.isArray(options) ? options.map((o) => String(o ?? '')) : []).slice()
  while (opts.length < 4) opts.push('')
  for (let i = 0; i < opts.length; i += 1) {
    if (!optionLooksTruncated(opts[i])) continue
    for (let j = i + 1; j < opts.length; j += 1) {
      if (!optionLooksBleedHead(opts[j])) continue
      opts[i] = `${String(opts[i]).trim()}${String(opts[j]).trim()}`
      opts[j] = ''
      break
    }
  }
  return opts
}

function stripAnswerDotTail(text) {
  return String(text ?? '')
    .replace(/\s+Answer\.?\s*$/i, '')
    .replace(/\s+Answer\.\s+/gi, ' ')
    .trim()
}

/** Mapping key leaked into List-II: “The correct option is (A) (P)→…” */
function stripMatchKeyLeakFromStem(text) {
  return peelMatchMappingRows(text, []).text
}

function isJunkLetterOption(opt) {
  const bare = String(opt ?? '')
    .trim()
    .replace(/\$/g, '')
    .trim()
  return /^[a-z]$/i.test(bare)
}

/**
 * Pull A–D mapping rows out of a match stem without dropping List-II.
 * OCR often mixes \\item[(A)] into List-I and \\item[(B)] into List-II.
 */
function isFalseMatchOptionLetter(text, index) {
  const before = String(text ?? '').slice(Math.max(0, index - 12), index)
  const ch = before.replace(/\\mathrm\s*\{?\s*$/i, '').slice(-1)
  return /[A-Za-z|]/.test(ch)
}

function peelMatchMappingRows(text, options) {
  const raw = rewriteLatexItemLabels(String(text ?? ''))
  let opts = (Array.isArray(options) ? options : []).map((o) => String(o ?? ''))
  const re = /\(\s*([A-D])\s*\)\s*/gi
  const starts = []
  let m
  while ((m = re.exec(raw))) {
    if (isFalseMatchOptionLetter(raw, m.index)) continue
    starts.push({ idx: m.index, letter: m[1].toUpperCase(), len: m[0].length })
  }
  if (!starts.length) return { text: raw, options: opts, leaked: [] }

  let out = ''
  let last = 0
  const leaked = []
  for (let i = 0; i < starts.length; i += 1) {
    const s = starts[i]
    const nextIdx = starts[i + 1]?.idx ?? raw.length
    const bodyFull = raw.slice(s.idx + s.len, nextIdx)
    const cutRel = bodyFull.search(
      /(?:^|\n)\s*(?:List|Column)\s*[-–]?\s*I{1,2}\b|(?:^|\n)\s*\(\s*[PQRS]\s*\)\s+(?![\s$]*(?:\\rightarrow|→|->))|(?:^|\n)\s*\(\s*[1-5]\s*\)\s+|\\section\*?\{[^}]*SECTION|\\section\*?\{?\s*SECTION|(?:^|\n)\s*SECTION\s+\d+|This section contains|Maximum Marks/i,
    )
    const mappingBody = (cutRel >= 0 ? bodyFull.slice(0, cutRel) : bodyFull)
      .replace(/^\s*The correct option is\s*/i, '')
      .trim()
    if (!looksLikeMatchMappingOption(mappingBody)) continue
    leaked.push({ letter: s.letter, text: tidyMappingOption(mappingBody) })
    out += raw.slice(last, s.idx)
    last = cutRel >= 0 ? s.idx + s.len + cutRel : nextIdx
  }
  out += raw.slice(last)
  const cleaned = out
    .replace(/\bThe correct option is\s*$/i, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const filled = opts.filter((o) => String(o).trim().length > 3 && !isJunkLetterOption(o)).length
  const junk = opts.filter((o) => o.trim()).every((o) => isJunkLetterOption(o) || o.trim().length < 4)
  if (leaked.length >= 2 && (filled < 2 || junk)) {
    const cleared = junk ? opts.map((o) => (isJunkLetterOption(o) ? '' : o)) : opts
    opts = applyLeakedOptions(cleared, leaked)
  }
  return { text: cleaned || raw, options: opts, leaked }
}

function peelBarePqrsMappingLines(text, options) {
  const raw = String(text ?? '')
  const opts = (Array.isArray(options) ? options : []).map((o) => String(o ?? ''))
  const re =
    /(?:^|\n)[ \t]*P\s*[-–]\s*[1-5]\s*[,;]\s*Q\s*[-–]\s*[1-5]\s*[,;]\s*R\s*[-–]\s*[1-5]\s*[,;]\s*S\s*[-–]\s*[1-5][^\n]*/gi
  const rows = [...raw.matchAll(re)].map((m) => String(m[0]).trim()).filter(Boolean)
  if (rows.length < 2) return { text: raw, options: opts }
  const next = raw.replace(re, '\n').replace(/\n{3,}/g, '\n\n').trim()
  const steal = optionsLookLikeSmilesNotMappings(opts) || opts.filter((o) => o.trim()).length < 2
  if (!steal) return { text: next, options: opts }
  const promoted = rows.slice(0, 4)
  return {
    text: next,
    options: [0, 1, 2, 3].map((i) => promoted[i] || ''),
  }
}

function peelStemAnswerKey(text, options) {
  const peeled = peelMatchMappingRows(text, options)
  const bare = peelBarePqrsMappingLines(peeled.text, peeled.options)
  const head = stripCompactMappingTail(bare.text)
  if (!/(?:List|Column)\s*[-–]?\s*I{1,2}\b/i.test(head) && !/match\s+(?:the|each)\b/i.test(head)) {
    return { text: String(text ?? ''), options: (Array.isArray(options) ? options : []).map((o) => String(o ?? '')) }
  }
  return { text: head, options: bare.options }
}

function stripCompactMappingTail(text) {
  return String(text ?? '')
    .replace(/\n+\s*The correct option is[\s\S]*$/i, '')
    .replace(/\n+\s*\(\s*[A-D]\s*\)\s*P\s*[-–]\s*[1-5][\s\S]*$/i, '')
    .replace(/\n+\s*P\s*[-–]\s*[1-5]\s*[,;]\s*Q\s*[-–]\s*[1-5][\s\S]*$/i, '')
    .trim()
}

function tidyMappingOption(text) {
  return stripTrailingPyqSectionHeader(
    unwrapMathrmListLabels(String(text ?? ''))
      .replace(/^\s*\$+\s*/, '')
      .replace(/\s*\$+\s*$/g, '')
      .replace(/^\\quad\s*/, '')
      .trim(),
  )
}

function looksLikeMatchMappingOption(text) {
  const t = tidyMappingOption(text)
  const hasPArrow =
    /\bP\s*(?:\\rightarrow|→|->)/i.test(t) ||
    /\(\s*P\s*\)\s*(?:\\rightarrow|→|->)/i.test(t)
  if (hasPArrow && /(?:\\rightarrow|→|->)\s*\$?\s*\(?[1-5]/i.test(t)) return true
  return /\bP\s*[-–]\s*[1-5]\b/i.test(t) && /\bQ\s*[-–]\s*[1-5]\b/i.test(t)
}

function optionsLookLikeSmilesNotMappings(options) {
  const opts = (Array.isArray(options) ? options : [])
    .map((o) => String(o ?? '').trim())
    .filter(Boolean)
  if (opts.length < 2) return false
  const smiles = opts.filter((o) => /<smiles>/i.test(o)).length
  const maps = opts.filter((o) => looksLikeMatchMappingOption(o)).length
  return smiles >= 2 && maps < 2
}

/**
 * Copy A–D mapping choices from stored OCR. Never invents arrows or numbers.
 * @param {unknown} stem
 * @param {unknown} options
 * @param {unknown} source
 */
function plainMatchOption(opt) {
  return unwrapMathrmListLabels(String(opt ?? '')).replace(/\$+/g, ' ')
}

/** A matching-list choice that starts (P)→ but never reaches (R) and (S). */
export function matchMappingOptionIsCutOff(opt) {
  const t = plainMatchOption(opt)
  if (['P', 'Q', 'R', 'S'].every((letter) => new RegExp(`\\b${letter}\\s*[-–]\\s*[1-5]`).test(t))) {
    return false
  }
  if (
    ['P', 'Q', 'R', 'S'].every((letter) =>
      new RegExp(`\\(\\s*${letter}\\s*\\)\\s*(?:\\\\rightarrow|→|->)\\s*\\(?\\s*[1-5]`).test(t),
    )
  ) {
    return false
  }
  if (
    ['I', 'II', 'III', 'IV'].every((roman) =>
      new RegExp(`(?:^|[^A-Za-z])${roman}\\s*\\)?\\s*(?:\\\\rightarrow|→|->)`).test(t),
    )
  ) {
    return false
  }
  if (
    ['I', 'II', 'III', 'IV'].every((roman) =>
      new RegExp(`(?:^|[^A-Za-z])${roman}\\s*\\)?\\s*(?:\\\\rightarrow|→|->)`).test(t),
    )
  ) {
    return false
  }
  return /\(\s*P\s*\)/.test(t) && /(?:\\rightarrow|→|->)/.test(t)
}

/** Two or more options are cut-off arrow scraps, not four full P–Q–R–S rows. */
export function storedMatchOptionsAreCutOff(options) {
  const opts = (Array.isArray(options) ? options : [])
    .map((opt) => String(opt ?? '').trim())
    .filter(Boolean)
  if (opts.length < 2) return false
  return opts.filter((opt) => matchMappingOptionIsCutOff(opt)).length >= 2
}

export function restoreMissingMatchOptionsFromSource(stem, options, source) {
  const text = String(stem ?? '').trim()
  const opts = (Array.isArray(options) ? options : []).map((o) => String(o ?? ''))
  const stealSmiles =
    optionsLookLikeSmilesNotMappings(opts) &&
    (/match\s+(?:the|each)\b/i.test(text) || /(?:List|Column)\s*[-–]?\s*I/i.test(text))
  const cutOff = storedMatchOptionsAreCutOff(opts)
  const filled = opts.filter((o) => String(o).trim() && !isJunkLetterOption(o)).length
  if (filled >= 2 && !stealSmiles && !cutOff) return { text, options: opts }
  const src = String(source ?? '')
  if (!text || src.length < 40) return { text, options: opts }
  if (
    !/match\s+(?:each|the)|(?:List|Column)\s*[-–]?\s*I/i.test(text) &&
    !looksLikeMatchingListStem(text)
  ) {
    return { text, options: opts }
  }
  const probes = uniqueStemProbes(text)
  const cleared = stealSmiles || cutOff
    ? ['', '', '', '']
    : opts.map((o) => (isJunkLetterOption(o) ? '' : o))
  for (const probe of probes) {
    const short = String(probe).replace(/\$+/g, '').replace(/\s+/g, ' ').trim()
    if (short.length < 12) continue
    let from = 0
    for (let n = 0; n < 4; n += 1) {
      const idx = findProbeInSource(src.slice(from), short)
      if (idx < 0) break
      const abs = from + idx
      const winStart = Math.max(0, abs - 200)
      const window = clipOcrWindowToQuestion(src.slice(winStart, abs + 2800), abs - winStart)
      const peeled = peelMatchMappingRows(window, [])
      let leaked = peeled.leaked.filter((row) => looksLikeMatchMappingOption(row.text))
      if (leaked.length < 2) {
        const at = rewriteLatexItemLabels(window).search(
          /\bThe correct option is\b|\(\s*A\s*\)[\s\S]{0,40}?(?:P|\(\s*P\s*\))\s*(?:\\rightarrow|→|->)/i,
        )
        if (at >= 0) {
          leaked = parseLeakedOptionChunks(
            window.slice(at).replace(/^\s*The correct option is\s*/i, ''),
          ).filter((row) => looksLikeMatchMappingOption(row.text))
        }
      }
      if (leaked.length >= 2 && matchWindowOwnsStem(window, text)) {
        return { text, options: applyLeakedOptions(cleared, leaked) }
      }
      from = abs + Math.max(1, short.length)
      if (from >= src.length) break
    }
  }
  return { text, options: opts }
}

function bareOptionLetter(opt) {
  const bare = String(opt ?? '')
    .trim()
    .replace(/\$/g, '')
    .trim()
  return /^[a-z]$/i.test(bare) ? bare.toUpperCase() : ''
}

/**
 * Single-letter bodies are junk only when they are slot markers echoed as text
 * (“(A) A (B) B (C) C”) or one letter repeated across slots (List-II “$h$”
 * leaking into every option). Distinct non-marker letters are real content —
 * blood groups A/B/AB/O, set labels, interval endpoints — and must survive.
 */
function isJunkLetterOptionSet(options) {
  const letters = []
  ;(Array.isArray(options) ? options : []).forEach((opt, i) => {
    const bare = bareOptionLetter(opt)
    if (bare) letters.push({ bare, i })
  })
  if (letters.length < 3) return false
  if (new Set(letters.map((l) => l.bare)).size < letters.length) return true
  return letters.every((l) => l.bare === String.fromCharCode(65 + l.i))
}

function dropJunkLetterOptions(options, stem) {
  const t = String(stem ?? '')
  const list = Array.isArray(options) ? options : []
  const dropAllLetters = isJunkLetterOptionSet(list)
  return list.map((opt) => {
    const o = String(opt ?? '').trim()
    if (isJunkLetterOption(o) && (dropAllLetters || new RegExp(`\\b${o.replace(/\$/g, '')}\\s*\\(`, 'i').test(t))) {
      return ''
    }
    return String(opt ?? '')
  })
}

function isJunkOfficialPyqRow(q) {
  const t = String(q?.text ?? '').trim()
  if (!t) return true
  if (looksLikeAnswerKeyMappingBlob(t)) return true
  if (looksLikePyqSectionInstructionStem(t)) return true
  return false
}

function isLeftoverMatchFragment(q) {
  const t = String(q?.text ?? '').trim()
  if (!t) return true
  if (looksLikeMatchInstructionOnly(t) && optionCount(q) < 2) return true
  if (looksLikeOrphanListTwo(q) && optionCount(q) < 2) return true
  if (/^\[?\s*en\s*=/i.test(t) && t.length < 220) return true
  if (/^Answer\.?\s*$/i.test(t)) return true
  if (/^Answer\.\s/i.test(t) && t.length < 160) return true
  return false
}

/** Metadata leak — “(key)” is not option text. */
export function stripKeyLeakFromOption(opt) {
  return String(opt ?? '')
    .replace(/\(\s*key\s*\)/gi, '')
    .replace(/^\s*key\s*$/i, '')
    .trim()
}

function parseLeakedOptionChunks(text) {
  const t = rewriteLatexItemLabels(String(text ?? ''))
  const starts = []
  const re = /\(\s*([A-D])\s*\)\s*/gi
  let m
  while ((m = re.exec(t))) {
    if (isFalseMatchOptionLetter(t, m.index)) continue
    starts.push({ idx: m.index, letter: m[1].toUpperCase(), len: m[0].length })
  }
  return starts.map((s, i) => ({
    letter: s.letter,
    text: tidyMappingOption(
      t
        .slice(s.idx + s.len, starts[i + 1]?.idx ?? t.length)
        .trim()
        .replace(/,\s*$/, ''),
    ),
  }))
}

function splitContinuationAndLeakedOptions(text) {
  const t = String(text ?? '').trim()
  const optAt = t.search(/\(\s*[A-D]\s*\)\s+\S/)
  if (optAt < 0) return { stemPart: t, leaked: [] }
  if (optAt === 0) return { stemPart: '', leaked: parseLeakedOptionChunks(t) }
  return {
    stemPart: t.slice(0, optAt).trim(),
    leaked: parseLeakedOptionChunks(t.slice(optAt)),
  }
}

function applyLeakedOptions(prevOpts, leaked) {
  const opts = (Array.isArray(prevOpts) ? prevOpts.slice() : []).map((o) => String(o ?? ''))
  while (opts.length < 4) opts.push('')
  for (const row of leaked) {
    const i = row.letter.charCodeAt(0) - 65
    if (i >= 0 && i < 4 && row.text && !String(opts[i] ?? '').trim()) opts[i] = row.text
  }
  return opts
}

function ensureOptionMathDelimiters(opt) {
  let s = stripEmptyImageMarkdown(stripKeyLeakFromOption(opt))
    .replace(/^\s*\]\s*/, '')
    .replace(/\\text\s*\{\s*frac\s*\}/gi, '\\frac')
  s = unwrapProseTabular(s)
  s = repairArrayBodiesMissingRowBreaks(s)
  s = restoreGatheredEquationBreaks(s)
  s = normalizeFracLatex(s)
  if (!s.replace(/[\s$\\]/g, '')) return ''
  if (!s) return s
  if (
    /\\text\s*\{/.test(s) ||
    /\\(?:frac|sqrt|rightarrow|circ|mathrm|ce)\b/.test(s)
  ) {
    s = wrapBareLatexRuns(s)
  }
  if (!s.includes('$') && /\\(?:frac|sqrt|text|rightarrow|circ|mathrm)\b/.test(s)) {
    return `$${s}$`
  }
  return s
}

function ensureStemMathDelimiters(text) {
  let s = flattenTabularMatchLists(normalizeFracLatex(normalizeBrokenMathpixGraphics(text))).trim()
  if (!s) return s
  s = stripRepeatedQuestionNumberPrefix(s)
  s = rewriteLatexItemLabels(s)
  s = s.replace(/---\s*page\s*---/gi, '\n')
  s = repairMatchListOcrGlitches(s)
  s = repairSmashedProseVmatrixOcr(s)
  s = repairFlattenedSetMatrixOcr(s)
  s = repairBrokenLeftRightSetOcr(s)
  s = repairSmashedXyzColumnOcr(s)
  s = s.replace(/(\d)\s+(\d)\s*\^\s*\\circ/g, '$$$1$2^{\\circ}$')
  s = s.replace(/(?<!\$)(\d+)\s*\^\s*\\circ/g, '$$$1^{\\circ}$')
  s = s.replace(/(?:\\_){3,}/g, '____')
  s = wrapBareLatexRuns(s)
  s = normalizeSmashedChemDollars(s)
  s = stripBareNumericListTwoDump(s)
  s = stripTrailingPyqSectionHeader(s)
  // Empty "$ $" only; a display closer "$$" then "\n$x$" on the next line is not empty math.
  return stripAnswerDotTail(s.replace(/(?<!\$)\$\s+\$(?!\$)/g, ' '))
}

/** Duplicate unlabeled 0 / 2 / 4 dump before a real labeled List-II. */
function stripBareNumericListTwoDump(text) {
  return stripUnlabeledListTwoDump(
    String(text ?? '').replace(
      /(?:^|\n)\s*List-II\s*(?:\n\s*(?:\$?\s*)?\d+\s*){3,12}(?=\n\s*List-II\b)/gi,
      '\n',
    ),
  )
}

function optionIsPlaceholder(opt) {
  const s = String(opt ?? '').trim()
  if (!s) return true
  if (/^and$/i.test(s)) return true
  if (/^!\[[^\]]*\]\(\s*\)$/.test(s)) return true
  return false
}

/**
 * Put a reaction-sequence stem back together from the stored scan.
 * Numbered reagent steps stay in the question. A real (A)–(D) table is not folded.
 * @param {unknown} stem
 * @param {unknown} source
 */
function freshReactionSequenceStem(stem, source) {
  const src = String(source ?? '')
  const probe = String(stem ?? '').replace(/\$+/g, ' ').replace(/\s+/g, ' ').trim()
  const start = probe.search(/reaction\s+sequence/i)
  if (start < 0 || !/major\s+products/i.test(probe)) return ''
  const needle = probe.slice(start, start + 48).trim()
  if (needle.length < 24) return ''
  const idx = src.toLowerCase().indexOf(needle.toLowerCase())
  if (idx < 0) return ''
  const sentence = src.lastIndexOf('In the following', idx)
  const from = sentence >= 0 && idx - sentence < 80 ? sentence : idx
  const window = src.slice(from, from + 2200)
  const cut = window.search(/\n\\item\s*\[\s*Q\s*\.?\s*(?:\d{1,3}\s*\]|\]\s*\$?\s*\d)|\n\\section\*?\s*\{[^}]*SECTION|\nQ\s*\.\s*\d{1,3}\b/i)
  const slice = cut > 80 ? window.slice(0, cut) : window
  const peeled = extractLatexItemizeMcq(slice)
  if (!peeled?.reactionStepsInStem || String(peeled.stem ?? '').length < 40) return ''
  return peeled.stem
}

function choicesAreNotReactionSteps(options, stem) {
  const filled = (Array.isArray(options) ? options : []).map((o) => String(o ?? '').trim()).filter(Boolean)
  if (!filled.length) return false
  if (filled.some((o) => /completely reacts|in grams is|500 mol/i.test(o))) return false
  const flat = String(stem ?? '').replace(/\$+/g, '')
  return filled.some((o) => {
    const bare = o.replace(/\$+/g, '').replace(/\s+/g, ' ').trim()
    return bare.length > 40 && !flat.includes(bare.slice(0, 24))
  })
}

/** If A–D were wiped to "and" or a blank image mark, put the OCR option table back. */
function restoreTabularOptionsFromOcr(stem, options, source) {
  const opts = (Array.isArray(options) ? options : []).map((o) => String(o ?? ''))
  if (opts.filter((o) => !optionIsPlaceholder(o)).length >= 2) return opts
  const src = String(source ?? '')
  const probe = String(stem ?? '')
    .replace(/\$+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48)
  if (probe.length < 20 || src.length < 40) return opts
  const idx = src.indexOf(probe.slice(0, 32))
  if (idx < 0) return opts
  const start = Math.max(0, idx - 40)
  const window = clipOcrWindowToQuestion(src.slice(start, idx + 2200), idx - start)
  if (!matchWindowOwnsStem(window, stem)) return opts
  const tab = extractLatexTabularMcq(window)
  if (!tab || tab.options.length < 2) return opts
  const next = tab.options.slice(0, 4).map((o) => String(o ?? ''))
  // "options (A), (B), (C) and (D)" in a section instruction leaves only commas and "and".
  if (next.filter((o) => /[\p{L}\d\\<]/u.test(o.replace(/^\s*(?:and|or)\s*$/i, ''))).length < 2) return opts
  while (next.length < 4) next.push('')
  return next
}

function mathHasUnpairedLeftRight(text) {
  const segments = String(text ?? '').match(/\$\$[\s\S]*?\$\$|\$[^$]*\$/g) || []
  return segments.some((seg) => {
    const lefts = (seg.match(/\\left(?![a-zA-Z])/g) || []).length
    const rights = (seg.match(/\\right(?![a-zA-Z])/g) || []).length
    return lefts !== rights
  })
}

/**
 * A card that draws cleanly can still need the full heal: match questions carry list,
 * key and option fixes; other cards may be missing a figure or paragraph the scan has.
 */
function cardNeedsFullHeal(q, text, passage, options, source, map) {
  if (/(?:List|Column)\s*[-–]?\s*I{1,2}\b|match\s+(?:the|each)\b/i.test(text)) return true
  if (options.some((opt) => /^\s*[\]\)}]/.test(opt))) return true
  if (/\\begin\{/.test(text) || mathHasUnpairedLeftRight(text)) return true
  if (/PARAGRAPH|\\section\*?\{|\\item\[/i.test(text)) return true
  if (options.some((opt) => opt.trim().length >= 8 && text.includes(opt.trim()))) return true
  if (
    options.filter((opt) => opt.trim()).length < 4 &&
    peelGluedMcqOptions(text, options, source).text.trim() !== text.trim()
  ) {
    return true
  }
  const figures = extractMathpixImageUrls(text)
  if ((text.match(/\\includegraphics|!\[[^\]]*\]\(/g) || []).length > figures.length) return true
  const src = String(source ?? '')
  if (src.length < 40) return false
  const hasFigure = figures.length > 0
  if (!hasFigure && stemMentionsFigure(text) && /\\includegraphics|cdn\.mathpix/i.test(src)) return true
  if (hasFigure && dropStolenFigures(text, src, printedQuestionNumber(q), map) !== text) return true
  if (!/PARAGRAPH/i.test(src)) return false
  return passage.trim()
    ? officialPyqPassageNeedsOcrRefresh(passage, q, src)
    : officialPyqCardAllowsPassage(q, src, map)
}

/**
 * Per-card heal: wrap math, restore List-I / Mathpix figures from OCR.
 * Does not drop or merge cards — safe for bank persist of one row.
 * @param {object} q
 * @param {unknown} source
 */
export function healUploadQuestionCard(q, source, map) {
  if (!q || typeof q !== 'object' || q.placeholder === true || isMatrixGridCard(q)) return q
  q = restoreLabelledFigureOptions(q, source)
  const textFixed = repairScanStructureCodes(restoreDroppedMsOnGivenLine(String(q.text ?? '')))
  const passageFixed = restoreDroppedMsOnGivenLine(String(q.passageText ?? ''))
  if (textFixed !== String(q.text ?? '') || (q.passageText != null && passageFixed !== String(q.passageText))) {
    q = {
      ...q,
      text: textFixed,
      ...(q.passageText != null ? { passageText: passageFixed } : {}),
    }
  }
  const storedText = String(q.text ?? '')
  const storedPassage = String(q.passageText ?? '')
  const storedOpts = Array.isArray(q.options) ? q.options.map((opt) => String(opt ?? '')) : []
  const alreadyClean =
    !storedMatchOptionsAreCutOff(storedOpts) &&
    !storedOpts.some((opt) => visibleLatexSourceHits(opt).length > 0) &&
    !stemLooksIncompleteOnDisplay(storedText, storedOpts) &&
    !stemLooksIncompleteOnDisplay(storedPassage) &&
    ![storedText, storedPassage, ...storedOpts].some((part) => visibleLatexSourceHits(part).length > 0) &&
    peelForeignComprehensionFromStem(storedText, q) === storedText &&
    repairSmashedWeightSubscripts(storedText, source) === storedText &&
    !cardNeedsFullHeal(q, storedText, storedPassage, storedOpts, source, map)
  if (alreadyClean) {
    const unnumbered = stripRepeatedQuestionNumberPrefix(storedText)
    const peeled = peelPrintedAnswerFromStem(unnumbered === storedText.trim() ? storedText : unnumbered)
    return peeled === storedText ? q : { ...q, text: peeled }
  }
  const src = String(source ?? '')
  const unglued = replaceConflictingStemFromOcr(
    { ...q, text: peelForeignComprehensionFromStem(String(q.text ?? ''), q) },
    src,
  )
  let text = String(unglued.text ?? '')
  text = repairSmashedWeightSubscripts(text, src)
  const printedN = printedQuestionNumber(q)
  text = dropStolenFigures(text, src, printedN, map)
  text = stripChemistryLeakFromPhysicsStem(text, String(q.subject || ''))
  text = restoreMissingListIFromSource(text, q.options, src)
  text = stripForeignListTwo(text)
  {
    const folded = foldListIIFromOptionsIntoStem(text, q.options)
    text = folded.text
    if (Array.isArray(folded.options)) q = { ...q, options: folded.options }
  }
  if (matchingListMissingListTwo({ text, options: q.options })) {
    text = restoreMissingListIIFromSource(text, q.options, src)
  }
  text = restoreMissingFiguresFromSource(text, src, printedN, map)
  text = restoreTruncatedMathpixCropsFromSource(text, src)
  text = restoreListTwoSmilesFromSource(text, src)
  text = restoreSmashedTabularFromSource(text, src)
  text = ensureStemMathDelimiters(text)
  text = restoreGivenBracketFromSource(text, src)
  text = fillEmptyPqrsFromSource(text, src)
  const peeled = peelStemAnswerKey(text, Array.isArray(q.options) ? q.options : [])
  text = peeled.text
  let options = Array.isArray(peeled.options)
    ? peeled.options.map((o) => stripTrailingPyqSectionHeader(ensureOptionMathDelimiters(o)))
    : q.options
  const fromOcr = restoreMissingMatchOptionsFromSource(text, options, src)
  text = fromOcr.text
  options = fromOcr.options.map((o) => stripTrailingPyqSectionHeader(String(o ?? '')))
  options = dropStemRepeatOptions(options, text)
  options = dropJunkLetterOptions(options, text)
  text = stripDuplicateOptionSmilesFromStem(text, options)
  const glued = peelGluedMcqOptions(text, options, src)
  text = glued.text
  options = (Array.isArray(glued.options) ? glued.options : []).map((o) =>
    stripTrailingPyqSectionHeader(ensureOptionMathDelimiters(o)),
  )
  if (!/^(?:integer|numerical)$/.test(String(q.questionType ?? ''))) options = restoreTabularOptionsFromOcr(text, options, src)
  options = dropForeignOptionFigures(options, text, src)
  options = dropLoneMatchArrowDebris(options, text, src)
  options = dropSmilesFragmentsFromMatchOptions(options, text)
  options = options.map((o) => normalizeMatchAnswerKey(String(o ?? '')))
  while (options.length < 4) options.push('')
  options = options.slice(0, 4)
  const peeledCard = recoverOfficialPyqPassageFromSource(
    peelOfficialPyqCardForDisplay(
      {
        ...q,
        text,
        options,
        passageText: unglued.passageText || q.passageText,
        passageId: unglued.passageId || q.passageId,
        passageGroup: unglued.passageGroup || q.passageGroup,
      },
      src,
    ),
    src,
  )
  text = sanitizeStemForDisplay(peeledCard.text, options)
  options = restoreMissingOptionGridGraphs(peeledCard.options)
  const freshSteps = freshReactionSequenceStem(text, src)
  if (freshSteps) {
    text = freshSteps
    if (!choicesAreNotReactionSteps(options, freshSteps)) options = ['', '', '', '']
  }
  let passageText = peeledCard.passageText
  if (passageText) {
    passageText = restoreMissingFiguresFromSource(passageText, src, printedN, map)
    passageText = dropStolenFigures(passageText, src, printedN, map, { passage: true })
    passageText = sanitizeStemForDisplay(passageText)
  }
  const samePass = String(passageText ?? '') === String(q.passageText ?? '')
  const healed =
    text === q.text && options === q.options && samePass
      ? q
      : {
          ...q,
          text,
          options,
          passageText,
          passageRole: peeledCard.passageRole,
          passageId: peeledCard.passageId,
          passageGroup: peeledCard.passageGroup,
        }
  const rawSolution = String(healed.solution ?? '')
  const solution = stripEmptyFigureShells(stripEmptyImageMarkdown(rawSolution)).replace(/[ \t]{2,}/g, ' ').trim()
  const withSolution = solution === rawSolution ? healed : { ...healed, solution }
  return stampOneQuestionTypeFromSectionMap(withSolution, src, map)
}

function stripDuplicateOptionSmilesFromStem(text, options) {
  const opts = (Array.isArray(options) ? options : []).map((o) => String(o ?? '')).join('\n')
  let t = String(text ?? '').replace(/<smiles>\s*([\s\S]*?)\s*<\/smiles>/gi, (full, body) => {
    const smi = String(body ?? '').trim()
    if (smi && opts.includes(smi)) return ''
    return full
  })
  return t
    .replace(/(?:^|\n)\s*\(\s*[A-D]\s*\)[ \t]*(?=\n(?:\s*\(\s*[A-D]\s*\)|\s*(?:\\includegraphics|!\[)|$))/gi, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function listTwoFingerprint(text) {
  const t = String(text ?? '')
  const at = t.search(/(?:List|Column)\s*[-–]?\s*II\b/i)
  if (at < 0) return ''
  return t
    .slice(at, at + 280)
    .replace(/\$+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 160)
}

function dropDuplicateListTwoOnLaterCards(questions) {
  const seen = new Set()
  return (Array.isArray(questions) ? questions : []).map((q) => {
    if (!q || typeof q !== 'object') return q
    const fp = listTwoFingerprint(q.text)
    if (!fp || fp.length < 24) return q
    if (!seen.has(fp)) {
      seen.add(fp)
      return q
    }
    const t = String(q.text ?? '')
    const at = t.search(/(?:List|Column)\s*[-–]?\s*II\b/i)
    if (at < 12) return q
    if (!looksLikeMatchingListStem(t) && !hasListIEntries(t)) return q
    return { ...q, text: t.slice(0, at).trim() }
  })
}

/**
 * Cheap heal used by every import, re-parse, preview, approve, and Mathpix split.
 * Instruction map is read from RAW Mathpix first, then cards are cleaned, then
 * types are stamped. All years / Main / Advanced / NEET.
 * @param {unknown[]} questions
 * @param {unknown} source
 * @param {{ ranges?: Array<{ from: number, to: number, type: string }> }} [map]
 */
/**
 * Shared match instructions are not a question identity.
 * "Match each entry in List-I…" is copied on every matching-list set.
 */
function cardOpenDedupeKey(text) {
  return String(text ?? '')
    .replace(
      /match\s+each\s+entry\s+in\s+list-i\s+to\s+the\s+correct\s+entry\s+in\s+list-ii\s+and\s+choose\s+the\s+correct\s+option\.?/gi,
      ' ',
    )
    .replace(/\$+/g, '')
    .replace(/\\[A-Za-z]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
    .toLowerCase()
}

export function applyUploadQualityGuards(questions, source, map) {
  const src = String(source ?? '')
  const sectionMap = map && Array.isArray(map.ranges) ? map : parsePaperSectionMap(src)
  const list = Array.isArray(questions) ? questions : []
  const restored = list.map((q) => healUploadQuestionCard(q, src, sectionMap))
  const unglued = dropDuplicateListTwoOnLaterCards(healPaperItemCards(restored))
  const orphans = mergeOrphanStemContinuations(unglued)
  const merged = mergeAdjacentOptionTails(orphans)
  const out = []
  for (const q of merged) {
    if (!q || typeof q !== 'object') continue
    const healed = healUploadQuestionCard(q, src, sectionMap)
    const prev = out[out.length - 1]
    const fp = cardOpenDedupeKey(healed.text)
    const prevFp = cardOpenDedupeKey(prev?.text)
    // Identical stems drop. A shared "Match each entry…" opener is not identity —
    // cardOpenDedupeKey ignores that sentence, so different List-I sets both stay.
    // Paired match questions share one stem ("…considering List-I and List-II?")
    // and differ only in A–D, so different filled options keep both.
    if (prev && prevFp && prevFp === fp && prevFp.length >= 80) {
      const filled = (c) => (Array.isArray(c?.options) ? c.options : []).map((o) => String(o ?? '').trim())
      const a = filled(prev)
      const b = filled(healed)
      const thin = a.filter(Boolean).length < 2 || b.filter(Boolean).length < 2
      if (thin || a.join('\n') === b.join('\n')) continue
    }
    out.push(healed)
  }
  const stamped = stampQuestionTypesFromSectionMap(out, src, sectionMap)
  const numbered = assignUniqueOfficialPyqNumbers(
    fillOfficialPyqPairPassages(stamped, src, sectionMap),
  )
  return annotateMathpixCleanStatus(stampSubjectsFromPaper(numbered, src, sectionMap))
}

/** Same heal — Official PYQ and every other upload path. */
export function applyOfficialPyqQualityGuards(questions, source, map) {
  return applyUploadQualityGuards(questions, source, map)
}

/** @deprecated same as applyUploadQualityGuards */
export function lightRepairOfficialPyqQuestions(questions, source) {
  return applyUploadQualityGuards(questions, source)
}

export function looksLikeOptionTailFragment(text) {
  const body = stripLeadingQuestionNumberPrefix(text)
  return /^(?:if and only if|and only if|where\s+\$?i\b)/i.test(body)
}

function optionLooksCompleteEnough(opt) {
  const s = String(opt ?? '').trim()
  if (!s) return false
  if (optionLooksTruncated(s)) return false
  if (s.length <= 12) return true
  if (/[.?!)]$/.test(s)) return true
  if (/if and only|such that|where\s*$/i.test(s)) return false
  return s.length < 40
}

function mergeOptionTailOntoPrevious(prev, next) {
  const tail = stripLeadingQuestionNumberPrefix(next?.text)
  if (!looksLikeOptionTailFragment(next?.text)) return null
  const opts = (Array.isArray(prev?.options) ? prev.options.slice() : []).map((o) => String(o ?? ''))
  while (opts.length < 4) opts.push('')
  const filled = opts.map((o, i) => ({ o, i })).filter((x) => x.o.trim())
  const last = filled[filled.length - 1]
  if (!String(opts[3] ?? '').trim() && filled.length >= 1) {
    opts[3] = tail
    return { ...prev, options: opts }
  }
  if (last) {
    opts[last.i] = `${last.o.trim()} ${tail}`
    return { ...prev, options: opts }
  }
  return null
}

/**
 * Display/load heal: only glue “if and only if…” / numbered leftover cards
 * onto the previous option D. Does not invent questions or wipe the bank.
 * @param {unknown[]} questions
 */
function isDisplayLeftoverCard(q) {
  const t = String(q?.text ?? '').trim()
  if (!t) return true
  if (looksLikeOptionTailFragment(t)) return true
  if (looksLikeMatchInstructionOnly(t) && optionCount(q) < 2) return true
  if (looksLikeOrphanListTwo(q) && optionCount(q) < 2) return true
  if (isLeftoverMatchFragment(q)) return true
  if (isJunkOfficialPyqRow(q)) return true
  const tornTable = /\\end\{tabular\}/i.test(t) && !/\\begin\{tabular\}/i.test(t)
  // A full A–D set of its own means a real question whose first letter OCR lost ("he reactivity").
  const midSentence = /^[a-z]/.test(t) && !/^(?:sin|cos|tan|log|lim)\b/.test(t) && optionCount(q) < 4
  if (looksLikeOrphanFragment(t) && (optionCount(q) < 2 || tornTable || midSentence)) return true
  return false
}

export function mergeAdjacentOptionTails(questions) {
  const list = Array.isArray(questions) ? questions : []
  const out = []
  for (let i = 0; i < list.length; i += 1) {
    const q = list[i]
    const next = list[i + 1]
    if (q && next && looksLikeOptionTailFragment(next?.text)) {
      let joined = mergeOptionTailOntoPrevious(q, next)
      if (!joined && optionCount(q) < 2) {
        joined = mergeTwoQuestionCards(q, next)
      }
      if (joined) {
        out.push(joined)
        i += 1
        continue
      }
    }
    if (q && next && isDisplayLeftoverCard(next) && !looksLikeFullPaperItem(next?.text)) {
      const nextStem = String(next?.text ?? '')
      const prevComplete =
        optionCount(q) >= 2 &&
        (hasListTwoEntries(q?.text) || !looksLikeMatchingListStem(q?.text))
      if (
        prevComplete &&
        (looksLikeMatchInstructionOnly(nextStem) || looksLikeOrphanListTwo(next))
      ) {
        out.push(q)
        i += 1
        continue
      }
      const joined = mergeTwoQuestionCards(q, next)
      if (joined) {
        out.push(joined)
        i += 1
        continue
      }
      out.push(q)
      i += 1
      continue
    }
    if (q) out.push(q)
  }
  return out
    .filter((q) => {
      if (!q || typeof q !== 'object') return false
      const n = Number(q.printedNumber ?? q.questionNumber ?? q.pyqSlot)
      const t = String(q.text ?? '').trim()
      // Never drop a numbered paper item with a real stem — only true leftovers.
      if (Number.isFinite(n) && n > 0 && t.length >= 40 && looksLikeFullPaperItem(t)) return true
      if (
        Number.isFinite(n) &&
        n > 0 &&
        t.length >= 48 &&
        !looksLikeOptionTailFragment(t) &&
        !isDisplayLeftoverCard(q)
      ) {
        return true
      }
      return !isDisplayLeftoverCard(q) || looksLikeFullPaperItem(q?.text)
    })
    .map((q) => {
    if (!q || typeof q !== 'object') return q
    const options = dropStemRepeatOptions(q.options, q.text)
    const filled = options.filter((o) => String(o).trim()).length
    const textNow = String(q.text ?? '')
    const maybeSteps = /reaction\s+sequence/i.test(textNow) && /\\item\s*\[\s*\d+/.test(textNow)
    if (filled < 2 || maybeSteps) {
      const rec = recoverOptionsFromStem(q.text, q.options)
      const recFilled = (rec.options || []).filter((o) => String(o).trim()).length
      if (rec.reactionStepsInStem) {
        return { ...q, text: rec.stem || q.text, options: rec.options }
      }
      if (filled < 2 && recFilled > filled) {
        return { ...q, text: rec.stem || q.text, options: rec.options }
      }
    }
    return { ...q, options }
  })
}

function mergeTwoQuestionCards(prev, next) {
  const optionJoin = mergeOptionTailOntoPrevious(prev, next)
  if (optionJoin) return optionJoin
  const nextStem = String(next?.text ?? '').trim()
  const split = splitContinuationAndLeakedOptions(nextStem)
  const nextIsDupListTwo =
    looksLikeOrphanListTwo(next) && hasListTwoEntries(prev?.text) && foldStem(nextStem).length < 400
  const joinedStem = nextIsDupListTwo && hasListTwoEntries(prev?.text)
    ? appendStemPart(prev?.text, '')
    : appendStemPart(prev?.text, split.stemPart)
  let options = pickMergedOptions(prev?.options, next?.options)
  if (split.leaked.length) options = applyLeakedOptions(options, split.leaked)
  return {
    ...prev,
    text: joinedStem,
    options,
    questionType: matchingListQuestionType(prev, next, joinedStem, options),
  }
}

function matchingListQuestionType(prev, next, joinedStem, options) {
  const n = (Array.isArray(options) ? options : []).filter((o) => String(o ?? '').trim()).length
  if (prev?.typeSource === 'admin_facts') return prev.questionType
  if (n >= 2 && hasListIEntries(joinedStem)) {
    const prevType = String(prev?.questionType || next?.questionType || 'single_correct')
    return prevType === 'matrix_match' ? 'single_correct' : prevType
  }
  if (prev?.questionType === 'matrix_match' || next?.questionType === 'matrix_match') return 'matrix_match'
  return prev?.questionType
}

/**
 * Re-join a display-math / “is equal to” / List-II block that a split tore off.
 * @param {unknown[]} questions
 */
function mergeOrphanStemContinuationsOnce(list) {
  const out = []
  for (let i = 0; i < list.length; i += 1) {
    const q = list[i]
    const next = list[i + 1]
    if (!q || !next) {
      if (q) out.push(q)
      continue
    }
    const nextStem = String(next?.text ?? '').trim()
    const prevStem = String(q?.text ?? '')
    const optionTail = mergeOptionTailOntoPrevious(q, next)
    if (optionTail) {
      out.push(optionTail)
      i += 1
      continue
    }
    const tornListIRowsEarly =
      (/\(\s*[QRS]\s*\)\s*(?:If|Let)\b/i.test(nextStem) ||
        ((nextStem.match(/\bIf\s+/gi) || []).length >= 2 &&
          /(?:\\theta|θ|\\alpha|α|\\phi|φ)/i.test(nextStem) &&
          /\bIf\s+\$?n\s*=/i.test(nextStem))) &&
      /match\s+(?:the\s+)?(?:quantities|entries)|match\s+each\s+entry|(?:List|Column)\s*[-–]?\s*I\b/i.test(
        prevStem,
      ) &&
      countListMarkers(prevStem, ['P', 'Q', 'R', 'S']) < 2
    if (tornListIRowsEarly) {
      out.push(mergeTwoQuestionCards(q, next))
      i += 1
      continue
    }
    const twoCompleteMcqs =
      optionCount(q) >= 2 &&
      optionCount(next) >= 2 &&
      !looksLikeOptionTailFragment(nextStem) &&
      !looksLikeOrphanFragment(nextStem)
    if (twoCompleteMcqs) {
      out.push(q)
      continue
    }
    const shortEquals = /^(?:is equal to|then)\b/i.test(nextStem)
    const nextIsDisplayMathTail =
      /^\$\$/.test(nextStem) ||
      /^\\left\b/.test(nextStem) ||
      (/\\left\s*\(\s*\\sin/.test(nextStem) && /11x|6x/.test(nextStem) && nextStem.length < 900)
    const prevWantsCloser =
      stemLooksCutOff(q.text) ||
      (/\bcot\b/i.test(prevStem) && hasIncompleteFrac(prevStem))
    const listTwoOrphan = matchingListMissingListTwo(q) && looksLikeOrphanListTwo(next)
    const instructionThenMatch =
      looksLikeMatchInstructionOnly(prevStem) &&
      (looksLikeMatchingListStem(nextStem) || hasListIEntries(nextStem))
    const reverseListTwoThenBody =
      looksLikeOrphanListTwo(q) &&
      hasListIEntries(nextStem) &&
      !hasListTwoEntries(nextStem) &&
      !looksLikeOrphanListTwo(next)
    const incompleteThenComplete =
      hasListIEntries(nextStem) &&
      hasListTwoEntries(nextStem) &&
      (looksLikeMatchInstructionOnly(prevStem) ||
        (looksLikeOrphanListTwo(q) && matchingListMissingListTwo(next)) ||
        (hasListIEntries(prevStem) &&
          !hasListTwoEntries(prevStem) &&
          matchTwinKey(q) &&
          matchTwinKey(q) === matchTwinKey(next)))
    const matchThenListTwoTail =
      prevAcceptsMatchContinuation(q) &&
      looksLikeOrphanListTwo(next) &&
      !hasListIEntries(nextStem) &&
      (matchingListMissingListTwo(q) || optionCount(q) < 2)
    const enOrAnswerTail =
      optionCount(next) < 2 &&
      (/^\[?\s*en\s*=/i.test(nextStem) || /^Answer\./i.test(nextStem)) &&
      (prevAcceptsMatchContinuation(q) || optionCount(q) >= 2)
    const orphanTail =
      looksLikeOrphanFragment(nextStem) &&
      !looksLikeFullPaperItem(nextStem) &&
      (optionCount(next) < 2 || nextIsDisplayMathTail) &&
      !(looksLikeMatchInstructionOnly(nextStem) && !prevAcceptsMatchContinuation(q))
    const formulaOrphan =
      prevWantsCloser &&
      looksLikeStemContinuation(next.text) &&
      (optionCount(next) < 2 || shortEquals || nextIsDisplayMathTail)
    const needsEqualsCloser =
      shortEquals && /\bThen\b/i.test(prevStem) && !/\bis equal to\b/i.test(prevStem)

    const extraMatchAlreadyComplete =
      hasListIEntries(prevStem) &&
      hasListTwoEntries(prevStem) &&
      optionCount(q) >= 2 &&
      !looksLikeMatchInstructionOnly(prevStem) &&
      (looksLikeMatchInstructionOnly(nextStem) ||
        looksLikeOrphanListTwo(next) ||
        (hasListIEntries(nextStem) &&
          !hasListTwoEntries(nextStem) &&
          matchTwinKey(q) &&
          matchTwinKey(q) === matchTwinKey(next)))

    const prevN = Number(q?.questionNumber ?? q?.pyqSlot)
    const nextN = Number(next?.questionNumber ?? next?.pyqSlot)
    const differentPrinted =
      Number.isFinite(prevN) &&
      Number.isFinite(nextN) &&
      prevN > 0 &&
      nextN > 0 &&
      prevN !== nextN
    const nextBody = stripLeadingQuestionNumberPrefix(nextStem)
    const nextIsNewQuestion =
      NEXT_QUESTION_OPENER_RE.test(nextBody) &&
      !/^(?:also|and)\s+let\b/i.test(nextBody) &&
      !/^\(\s*[PQRS]\s*\)/i.test(nextBody) &&
      !/\(\s*Q\s*\)\s*(?:If|Let)\b/i.test(nextStem) &&
      !/^(?:is equal to|then|and only if|where)\b/i.test(nextBody) &&
      nextBody.length >= 16 &&
      !shortEquals &&
      !nextIsDisplayMathTail

    if (incompleteThenComplete && !differentPrinted) {
      out.push(mergeTwoQuestionCards(next, q))
      i += 1
      continue
    }
    if (reverseListTwoThenBody && !differentPrinted) {
      const body = mergeTwoQuestionCards(next, q)
      out.push(body)
      i += 1
      continue
    }
    if (extraMatchAlreadyComplete && !nextIsNewQuestion && !differentPrinted) {
      out.push(q)
      i += 1
      continue
    }
    const tornListIRows =
      /\(\s*[QRS]\s*\)\s*(?:If|Let)\b/i.test(nextStem) &&
      /match\s+(?:the\s+)?(?:quantities|entries)|match\s+each\s+entry|(?:List|Column)\s*[-–]?\s*I\b/i.test(
        prevStem,
      ) &&
      countListMarkers(prevStem, ['P', 'Q', 'R', 'S']) < 2
    if (tornListIRows) {
      out.push(mergeTwoQuestionCards(q, next))
      i += 1
      continue
    }
    if (
      !differentPrinted &&
      (listTwoOrphan ||
        instructionThenMatch ||
        matchThenListTwoTail ||
        (!nextIsNewQuestion &&
          (enOrAnswerTail || formulaOrphan || needsEqualsCloser || orphanTail)))
    ) {
      out.push(mergeTwoQuestionCards(q, next))
      i += 1
      continue
    }
    out.push(q)
  }
  return out
}

function matchTwinKey(q) {
  // Figure URLs share one long CDN prefix per paper, so they cannot tell two questions apart.
  const t = foldStem(
    String(q?.text ?? '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\\includegraphics(?:\[[^\]]*\])?\{[^}]*\}/g, ' '),
  )
  const p = t.match(/\(p\)\s*(.{16,80})/)
  if (p) return `p:${p[1].slice(0, 64)}`
  return ''
}

function completenessScore(q) {
  const t = String(q?.text ?? '')
  let s = t.length
  if (hasListIEntries(t)) s += 800
  if (hasListTwoEntries(t)) s += 400
  s += optionCount(q) * 100
  return s
}

function mergeMatchPair(a, b) {
  const merged = completenessScore(b) > completenessScore(a) ? mergeTwoQuestionCards(b, a) : mergeTwoQuestionCards(a, b)
  return merged
}

function dedupeSplitMatchTwins(questions) {
  const kept = []
  const byKey = new Map()
  for (const q of questions) {
    const t = String(q?.text ?? '')
    const isMatch =
      looksLikeMatchingListStem(t) ||
      looksLikeOrphanListTwo(q) ||
      looksLikeMatchInstructionOnly(t)
    const key = isMatch ? matchTwinKey(q) : ''
    if (!key) {
      kept.push(q)
      continue
    }
    const idx = byKey.get(key)
    if (idx == null) {
      byKey.set(key, kept.length)
      kept.push(q)
      continue
    }
    const prev = kept[idx]
    const prevT = String(prev?.text ?? '')
    const prevN = Number(prev?.printedNumber ?? prev?.questionNumber)
    const nextN = Number(q?.printedNumber ?? q?.questionNumber)
    // Two full match cards with different printed Q numbers stay separate
    // (Chem Q.16 “possible products” vs Q.17 “phenolic”).
    const bothFull =
      hasListIEntries(prevT) &&
      hasListIEntries(t) &&
      !looksLikeMatchInstructionOnly(prevT) &&
      !looksLikeMatchInstructionOnly(t) &&
      foldStem(prevT).slice(0, 72) !== foldStem(t).slice(0, 72)
    if (
      bothFull &&
      Number.isFinite(prevN) &&
      Number.isFinite(nextN) &&
      prevN > 0 &&
      nextN > 0 &&
      prevN !== nextN
    ) {
      kept.push(q)
      continue
    }
    kept[idx] = mergeMatchPair(kept[idx], q)
  }
  return kept
}

function attachStrayListTwoToPrevious(list) {
  const out = []
  for (const q of list) {
    if (!looksLikeOrphanListTwo(q)) {
      out.push(q)
      continue
    }
    const prev = out[out.length - 1]
    const prevNeedsTail =
      prev &&
      !listTwoHasOwnStem(q) &&
      prevAcceptsMatchContinuation(prev) &&
      (matchingListMissingListTwo(prev) || optionCount(prev) < 2)
    if (prevNeedsTail) {
      out[out.length - 1] = mergeTwoQuestionCards(prev, q)
      continue
    }
    const prevAlreadyComplete =
      prev &&
      hasListIEntries(prev.text) &&
      hasListTwoEntries(prev.text) &&
      optionCount(prev) >= 2
    if (prevAlreadyComplete) {
      if (looksLikeMatchInstructionOnly(String(q?.text ?? ''))) continue
      if (looksLikeOrphanListTwo(q) && !listTwoHasOwnStem(q)) continue
      if (
        optionCount(q) >= 2 ||
        looksLikeFullPaperItem(q?.text) ||
        looksLikeMatchingListStem(q?.text) ||
        listTwoHasOwnStem(q)
      ) {
        out.push(q)
      }
      continue
    }
    if (optionCount(q) >= 2 || looksLikeFullPaperItem(q?.text)) out.push(q)
  }
  return out
}

export function mergeOrphanStemContinuations(questions) {
  let list = Array.isArray(questions) ? questions.slice() : []
  for (let n = 0; n < 8; n += 1) {
    const next = mergeOrphanStemContinuationsOnce(list)
    if (next.length === list.length) break
    list = next
  }
  list = attachStrayListTwoToPrevious(list)
  return dedupeSplitMatchTwins(list)
}

/**
 * Concatenate paper OCR / notes / stems (not option letters) for splice search.
 * @param {any} paper
 */
export function officialPyqPaperSourceText(paper) {
  if (!paper || typeof paper !== 'object') return ''
  const notes = String(paper.notes ?? '')
  const prepared = String(paper.preparedText ?? '')
  const stored = stripHindiOcr(`${notes}\n\n${prepared}`.trim())
  // Stored OCR / notes are the paper. Do not concatenate every other card —
  // that steals chemistry figures into a physics List-II and can freeze Q17
  // while scanning 51 figure-heavy stems (Approve shows 0 stored OCR chars).
  if (stored.length >= 80) return stored
  return stored
}

/**
 * Live heal for preview / approve — does not write the pending queue.
 * @param {any} paper
 */
function copyAnswersOntoCanonical(canonical, existing) {
  const prev = Array.isArray(existing) ? existing : []
  const byNum = new Map()
  for (const q of prev) {
    const n = Number(q?.questionNumber)
    if (Number.isFinite(n) && n > 0) byNum.set(n, q)
  }
  return canonical.map((q, i) => {
    const old = byNum.get(Number(q.questionNumber)) || prev[i]
    if (!old) return q
    return {
      ...q,
      id: q.id || old.id,
      correctIndex: q.correctIndex ?? old.correctIndex,
      correctIndices: q.correctIndices || old.correctIndices,
      correctInteger: q.correctInteger ?? old.correctInteger,
      correctNumerical: q.correctNumerical ?? old.correctNumerical,
      solution: q.solution || old.solution,
      answerSource: old.answerSource || q.answerSource,
      solutionSource: old.solutionSource || q.solutionSource,
    }
  })
}

/**
 * Paper-level prep only (junk filter / orphan glue). Per-card regex lives in
 * extendOfficialPyqHealCard so Approve can yield between cards.
 * @param {object} paper
 * @param {{ skipOcrRebuild?: boolean }} [opts]
 */
export function prepareOfficialPyqHealContext(paper, opts = {}) {
  const skipOcrRebuild = Boolean(opts?.skipOcrRebuild)
  const rawQs = Array.isArray(paper?.questions) ? paper.questions : []
  const reserved = rawQs.filter((q) => q && q.placeholder === true)
  const workingPaper = reserved.length
    ? { ...paper, questions: rawQs.filter((q) => q?.placeholder !== true) }
    : paper
  const ocr = pendingPaperMathpixOcr(workingPaper)
  const existingCount = Array.isArray(workingPaper?.questions) ? workingPaper.questions.length : 0
  const examId = String(paper?.exam || paper?.examPatternId || '')
  const catalog =
    examId === 'jee-advanced' ? 51 : examId === 'jee-main' ? 30 : examId === 'neet' ? 180 : 0
  const markers = countMathpixQuestionMarkers(ocr)
  const expected = markers >= 8 ? markers : catalog
  const workingQs = Array.isArray(workingPaper?.questions) ? workingPaper.questions : []
  const leaked = officialPyqQuestionsHaveMistakenPassages(workingQs, ocr)
  const canRebuildFromOcr =
    looksLikeMathpixLatexPaper(ocr) && markers >= Math.max(8, expected >= 40 ? 40 : 8)
  const rebuilt =
    !skipOcrRebuild &&
    (shouldRebuildFromMathpixOcr(ocr, existingCount, expected) || (leaked && canRebuildFromOcr))
      ? copyAnswersOntoCanonical(
          paperItemsFromMathpixOcr(ocr, {
            paperMeta: {
              exam: paper.exam || paper.examPatternId,
              year: paper.year || paper.pyqYear,
              session: paper.session,
              paperLabel: paper.paperLabel,
              sourceLabel: paper.sourceLabel,
            },
          }),
          workingQs,
        )
      : null
  const qs = stripMistakenOfficialPyqPassages(rebuilt || workingQs, ocr)
  const cleaned = qs
    .map((q) => ({
      ...q,
      text: stripPageBreakAndSectionGlue(q.text),
      passageText: q.passageText ? stripPageBreakAndSectionGlue(q.passageText) : q.passageText,
    }))
    .filter((q) => !isJunkOfficialPyqRow(q))
  const cards = healPaperItemCards(mergeOrphanStemContinuations(cleaned))
  const source = officialPyqPaperSourceText({ ...paper, questions: cards })
  const minKeep =
    examId === 'jee-advanced' ? 40 : examId === 'jee-main' ? 20 : examId === 'neet' ? 30 : 8
  return {
    cards,
    source,
    reserved,
    pickTarget: expected,
    minKeep,
    rebuilt,
    qs,
    workingQs,
    gridCards: (rebuilt || workingQs).filter(isMatrixGridCard),
  }
}

/** One card: restore List-I, wrap math, recover options. Never invents rows. */
export function extendOfficialPyqHealCard(q, source) {
  if (isMatrixGridCard(q)) return q
  let text = restoreMissingListIFromSource(
    stripPageBreakAndSectionGlue(extendStemFromSource(q.text, source)),
    q.options,
    source,
  )
  text = ensureStemMathDelimiters(stripPageBreakAndSectionGlue(text))
  let options = joinBleedingOptions(Array.isArray(q.options) ? q.options : []).map(stripKeyLeakFromOption)
  options = dropStemRepeatOptions(options, text)
  const recovered = recoverOptionsFromStem(text, options)
  const recFilled = (recovered.options || []).filter((o) => String(o).trim()).length
  const curFilled = options.filter((o) => String(o).trim()).length
  if (recovered.reactionStepsInStem) {
    const freshSteps = freshReactionSequenceStem(text, source)
    text = freshSteps || recovered.stem || text
    options = choicesAreNotReactionSteps(recovered.options, text)
      ? recovered.options
      : ['', '', '', '']
  } else if (recFilled > curFilled || (curFilled >= 1 && recFilled >= 2 && recovered.stem)) {
    text = recovered.stem || text
    options = dropStemRepeatOptions(recovered.options || options, text)
  }
  options = options.map(ensureOptionMathDelimiters)
  if (options.some((o) => !String(o).trim()) && hasListIEntries(text)) {
    const mappingLike = (row) => /\(\s*P\s*\)|P\s*→|P\s*\\rightarrow/i.test(String(row.text ?? ''))
    let leaked = parseLeakedOptionChunks(text).filter(mappingLike)
    if (leaked.length < 2) {
      const mapAt = String(source ?? '').search(/\(\s*A\s*\)\s*\(\s*P\s*\)/)
      const window = mapAt >= 0 ? String(source).slice(mapAt, mapAt + 2500) : ''
      leaked = parseLeakedOptionChunks(window).filter(mappingLike)
    }
    if (leaked.length) {
      options = applyLeakedOptions(options, leaked).map(stripKeyLeakFromOption).map(ensureOptionMathDelimiters)
    }
  }
  const nOpts = options.filter((o) => String(o).trim()).length
  return {
    ...q,
    text,
    options,
    questionType:
      nOpts >= 2 &&
      q.typeSource !== 'admin_facts' &&
      hasListIEntries(text) &&
      q.questionType === 'matrix_match'
        ? 'single_correct'
        : q.questionType,
  }
}

/**
 * @param {object[]} extended
 * @param {ReturnType<typeof prepareOfficialPyqHealContext>} ctx
 * @param {{ skipGuards?: boolean }} [opts]
 */
export function finalizeOfficialPyqHealCards(extended, ctx, opts = {}) {
  const final = mergeAdjacentOptionTails(extended).filter(
    (q) => !isJunkOfficialPyqRow(q) && !looksLikeOrphanFragment(q.text) && !isLeftoverMatchFragment(q),
  )
  const picked = pickQuestionListCloserToExpected(
    [final, ctx.rebuilt, ctx.qs, ctx.workingQs],
    ctx.pickTarget,
    ctx.minKeep,
  )
  const guarded = opts.skipGuards
    ? assignUniqueOfficialPyqNumbers(picked || final)
    : applyUploadQualityGuards(picked || final, ctx.source)
  const healed = keepMatrixGridCards(ctx.gridCards, guarded)
  if (!ctx.reserved.length) return healed
  return mergeReservedOfficialPyqSlots(ctx.reserved, healed)
}

export function healOfficialPyqPaperQuestions(paper, opts = {}) {
  try {
    const ctx = prepareOfficialPyqHealContext(paper, opts)
    const extended = ctx.cards.map((q) => extendOfficialPyqHealCard(q, ctx.source))
    return finalizeOfficialPyqHealCards(extended, ctx)
  } catch {
    return Array.isArray(paper?.questions) ? paper.questions : []
  }
}

/** Keep empty reserved slots after heal drops blank rows. */
function mergeReservedOfficialPyqSlots(reserved, healed) {
  const bySlot = new Map()
  const slotOf = (q, i) => {
    const n = Number(q?.pyqSlot ?? q?.questionNumber)
    return Number.isFinite(n) && n > 0 ? n : i + 1
  }
  ;(Array.isArray(healed) ? healed : []).forEach((q, i) => {
    bySlot.set(slotOf(q, i), q)
  })
  for (const row of reserved) {
    const n = slotOf(row, 0)
    if (n > 0 && !bySlot.has(n)) bySlot.set(n, row)
  }
  return Array.from(bySlot.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, q]) => q)
}

/** Prefer the list whose length is closest to the OCR/catalog target. */
export function pickQuestionListCloserToExpected(lists, expected, minKeep = 0) {
  const valid = (Array.isArray(lists) ? lists : []).filter(
    (l) => Array.isArray(l) && l.length >= minKeep,
  )
  if (!valid.length) {
    const nonempty = (Array.isArray(lists) ? lists : []).filter((l) => Array.isArray(l) && l.length)
    return nonempty[0] || null
  }
  const target = Number(expected) || 0
  if (!(target > 0)) return valid[0]
  const exact = valid.find((l) => l.length === target)
  if (exact) return exact
  return valid.reduce((best, cur) => {
    const db = Math.abs(best.length - target)
    const dc = Math.abs(cur.length - target)
    if (dc !== db) return dc < db ? cur : best
    return best
  })
}
