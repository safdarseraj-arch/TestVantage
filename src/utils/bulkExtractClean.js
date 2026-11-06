import { fixOcrMathSymbols } from './fixOcrMathSymbols.js'
import { repairWordSymbolFontText } from './wordSymbolFont.js'
import { repairTriangleLocusMcqOcr } from './repairTriangleLocusMcqOcr.js'
import { repairDeterminantOcr } from './repairDeterminantOcr.js'
import { findOptionsBlockStart, normalizeOptionMarkersInText } from './mcqOptionMarkers.js'
import { stripTrailingOptionMarkerFromStem } from './optionStemLeak.js'
import { repairFxIntegralMaxMinStemOcr } from './repairFxIntegralMaxMinMcqOcr.js'
import { repairLambdaSinCubicExtremaStemOcr } from './repairLambdaSinCubicExtremaMcqOcr.js'
import { looksLikeMatchingListStem } from './parseMatchingListDisplay.js'
import { normalizeMathpixQuestionMarkers } from './mathpixQuestionSplit.js'

const ANSWER_KEY_HEADING =
  /\b(?:answer\s*key|answers?\s*(?:&|and)\s*(?:hints?|solutions?)|solution\s*key|hints?\s*(?:&|and)\s*answers?)\b/i

const ANSWER_KEY_LINE = /^\d{1,3}[\.\)\:\-\s]+[A-D](?:\s*[,;|]\s*[A-D])*\s*$/i
const ANSWER_KEY_COMPACT = /^\d{1,3}\s*[-–:]\s*[A-D]\s*$/i

const MCQ_STEM_HINT =
  /\b(?:which of the following|which one of the following|choose the correct|select the correct|best suits the graph|suits the graph|graph of|graphs? of)\b/i

const OCR_GARBAGE_TAIL = /\s+(?:[a-z])\1{2,}(?:\s+[a-z]\^?\d+)?(?:\s+\d{3,})?\s*$/i

/**
 * Drop trailing answer-key / hint sections before splitting questions.
 * @param {string} text
 */
export function stripAnswerKeySection(text) {
  let raw = String(text ?? '').replace(/\r\n/g, '\n')
  raw = raw.replace(/\bMATHEMATICS\s*\/\s*A\s*#\s*\d+[\s\S]*$/i, '').trim()
  const heading = raw.search(ANSWER_KEY_HEADING)
  if (heading > 80) return raw.slice(0, heading).trim()

  const lines = raw.split('\n')
  let denseStart = -1
  for (let i = 0; i < lines.length; i++) {
    const window = lines.slice(i, Math.min(i + 12, lines.length))
    const hits = window.filter((line) => {
      const t = line.trim()
      return ANSWER_KEY_LINE.test(t) || ANSWER_KEY_COMPACT.test(t)
    }).length
    if (hits >= 6) {
      denseStart = i
      break
    }
  }
  if (denseStart > 0 && denseStart >= Math.floor(lines.length * 0.35)) {
    return lines.slice(0, denseStart).join('\n').trim()
  }
  return raw.trim()
}

/** @param {string} block */
export function isAnswerKeyOnlyBlock(block) {
  const t = String(block ?? '')
    .replace(/^\d{1,3}[\.\)\:\-\s]+/, '')
    .trim()
  if (!t) return true
  if (looksLikeAnswerKeyMappingBlob(t)) return true
  if (ANSWER_KEY_LINE.test(t) || ANSWER_KEY_COMPACT.test(t)) return true
  if (t.length < 28 && /^[A-D](?:\s*[,;]\s*[A-D])*\s*$/i.test(t)) return true
  return false
}

/** @param {string} text */
export function stripBareOptionMarkers(text) {
  let s = String(text ?? '').trim()
  if (!s) return s

  s = s.replace(/\$([^$]*?)(\(\s*[A-D]\s*\)\s*){2,4}\s*\$/gi, (_, inner) => {
    const cleaned = inner.replace(/(\(\s*[A-D]\s*\)\s*)+/gi, ' ').replace(/\s+/g, ' ').trim()
    return cleaned ? `$${cleaned}$` : ''
  })

  s = s.replace(/\s*(\(\s*[A-D]\s*\)\s*){2,4}\s*$/gi, '')
  s = s.replace(/\s*\(\s*[A-D]\s*\)\s*$/gi, '')
  s = s.replace(/\s+is\s*:\s*$/i, ' is')

  return s.replace(/\s{2,}/g, ' ').trim()
}

/** @param {string} text */
export function repairBulkStemLatex(text) {
  return fixOcrMathSymbols(
    String(text ?? '')
      .replace(/\\circledR/gi, '\\to')
      .replace(/\\text\{\s*Sgn\s*\}/gi, '\\operatorname{sgn}')
      .replace(/\\text\{\s*sgn\s*\}/gi, '\\operatorname{sgn}')
      .replace(/\\operatorname\s*\{\s*sgn\s*\}\s*\|/gi, '\\operatorname{sgn}|')
      .replace(/\\text\{\s*\\?["']\s*\}/g, '\\forall')
      .replace(/\\text\{\s*"\s*\}/g, '\\forall')
      .replace(/\\text\{\s*\\?\s*"\s*\}/g, '\\forall')
      .replace(/\\text\{\s*hat\s*\}\s*\\\{\s*i\s*\\\}/gi, '\\hat{i}')
      .replace(/\\text\{\s*hat\s*\}\s*\{\s*i\s*\}/gi, '\\hat{i}')
      .replace(/\\hat\{\s*I\s*\}\s*(?:\\in\s*)?(?:\\mathbb\{R\}|R)\b/gi, '\\in \\mathbb{R}')
      .replace(/\\hat\{\s*I\s*\}/g, '\\in')
      .replace(/([xX])\s*\\in\s*(?:\\mathbb\{R\}|R)\b/g, '$1 \\in \\mathbb{R}')
      .replace(/:\s*(?:\\mathbb\{R\}|R)\s*\\to\s*(?:\\mathbb\{R\}|R)\b/g, ': \\mathbb{R} \\to \\mathbb{R}')
      .replace(/\|\s*x\s*\|/g, '|x|'),
  )
}

/** Break "(A) option…(B)" glued onto the question line after polish. */
function splitGluedMcqOptions(text) {
  let out = String(text ?? '')
  out = out.replace(
    /(?<=[a-z\)\]\$])\s*\(\s*A\s*\)\s*(?=\s*(?:\$|\\|\d|\())/gi,
    '\n(A) ',
  )
  out = out.replace(
    /(?<=[a-z\)\]\$])\s*\(\s*([B-D])\s*\)\s*(?=\s*(?:\$|\\|\d|\())/gi,
    '\n($1) ',
  )
  return out
}

/** @param {string} text @param {string[]} [options] */
export function trimStemAtOptionBlock(text, options = []) {
  const hasOpts = options.some((o) => String(o ?? '').trim())
  if (hasOpts) {
    const start = findOptionsBlockStart(text)
    if (start > 24) return text.slice(0, start).trim()
  }
  return text.replace(/\s*\(\s*A\s*\)\s*[\s\S]*$/i, '').trim()
}

function stripOcrGarbageChunk(chunk) {
  return String(chunk ?? '')
    .replace(/\|x\|\^\{?[01]{3,}\}?/g, '|x|')
    .replace(/\^\{?([0-9])\1{2,}\}?/g, '')
    .replace(/\b([a-z])\1{2,}\b/gi, '')
    .replace(/\s+[a-z]\^?\d+\b/gi, '')
    .replace(/\s+\d{3,}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** @param {string} text */
export function cleanBulkStem(text, options = []) {
  let s = trimStemAtOptionBlock(
    repairBulkStemLatex(
      stripBareOptionMarkers(
        repairDeterminantOcr(repairTriangleLocusMcqOcr(repairWordSymbolFontText(text))),
      ),
    ),
    options,
  )
  s = s.replace(/\$([^$]+)\$/g, (_, inner) => {
    const cleaned = stripOcrGarbageChunk(inner)
    return cleaned ? `$${cleaned}$` : ''
  })
  s = stripTrailingOptionMarkerFromStem(s, options)
  s = stripOcrGarbageChunk(s.replace(OCR_GARBAGE_TAIL, ''))
  s = repairFxIntegralMaxMinStemOcr(s)
  s = repairLambdaSinCubicExtremaStemOcr(s)
  s = stripPageBreakAndSectionGlue(s)
  return s
}

const GLUED_ANSWER_TYPE_HEADING =
  /(?:Single Correct|Multiple Correct|Numerical Value|Match (?:the )?Following)\s*(?:Answer\s*)?Type\b/gi

/** Shortest stem that may precede a glued type heading (`\S` plus twelve more). */
const MIN_STEM_BEFORE_TYPE_HEADING = 13

/**
 * "… could be\n\nSingle Correct Answer Type." — the next section's type heading
 * glued onto a real stem. Without this the whole card reads as an instruction
 * row and a genuine question is dropped. Only strip it when a stem already
 * precedes it, so a real instruction row is still detected.
 *
 * Finds the heading and walks back across the blank line instead of letting a
 * lazy "twelve or more of anything" group grow a character at a time: on a long
 * stem with no heading, that form retries every group length at every start
 * position and cost seconds per card on a full paper.
 * @param {string} s
 */
function stripGluedAnswerTypeHeading(s) {
  const start = s.search(/\S/)
  if (start < 0) return s
  GLUED_ANSWER_TYPE_HEADING.lastIndex = 0
  for (let m = GLUED_ANSWER_TYPE_HEADING.exec(s); m; m = GLUED_ANSWER_TYPE_HEADING.exec(s)) {
    let stemEnd = m.index
    while (stemEnd > start && /\s/.test(s[stemEnd - 1])) stemEnd -= 1
    if (!s.slice(stemEnd, m.index).includes('\n')) continue
    if (stemEnd - start < MIN_STEM_BEFORE_TYPE_HEADING) continue
    return s.slice(start, stemEnd)
  }
  return s
}

/** Drop a glued SECTION header that OCR left on the previous stem. */
export function stripTrailingPyqSectionHeader(text) {
  const s = String(text ?? '')
    .replace(/\\end\{itemize\}\s*(?=\\section|\\begin\{itemize\}\s*\\item\[-\]|SECTION\s+\d+)/i, '')
    .replace(/\\section\*?\{[^}]*SECTION[\s\S]*$/i, '')
    .replace(/\\section\*?\{?\s*SECTION[\s\S]*$/i, '')
    .replace(/\n+\s*SECTION\s+[A-Z0-9()][\s\S]*$/i, '')
    // $\$$\$ PART-II: the next part's heading, with OCR dollar junk, glued under the last stem.
    .replace(/\n+[ \t]*[$\\]*[ \t]*PART\s*[-\u2013\u2014]?\s*(?:IV|I{1,3}|[1-3])\b[^\n]*$/i, '')
    // "JEE (ADVANCED) 2019 PAPER 2 PART-II CHEMISTRY": the next part's page heading glued onto option D.
    .replace(/\s*(?:\\section\*?\{\s*)?JEE\s*\(\s*ADVANCED\s*\)\s*\d{4}\s*PAPER\s*[12]\b[^\n]*$/i, '')
    .replace(/\s+SECTION\s+\d+\s*(?:\(Maximum Marks:[^)]*\))?[\s\S]*$/i, '')
    .replace(/\bThis section contains\s+(?:TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|\d+)[\s\S]*$/i, '')
    // Trailing marking-scheme chrome glued after a real stem (OCR option leak).
    .replace(
      /[\s,]*\.?\s*(?:ONLY\s+ONE|ONE\s+OR\s+MORE(?:\s+THAN\s+ONE)?)\s+of\s+these\s+four[\s\S]*$/i,
      '',
    )
    .replace(/[\s,]*\.?\s*Answer\s+to\s+each\s+question[\s\S]*$/i, '')
    .replace(/[\s,]*\.?\s*For\s+each\s+question,\s+(?:enter|choose)[\s\S]*$/i, '')
    .replace(/\s*,\s*,\s*and\s*\.?\s*$/i, '')
  return stripGluedAnswerTypeHeading(s).trim()
}

/** True when the next page is a new paper/section header, not more of the same stem. */
export function pageBreakStartsNewSection(after) {
  return /^\s*(?:JEE\s*\(?\s*Advanced|SECTION\s+[A-Z0-9()]|PAPER\s*[12]\b|PHYSICS|CHEMISTRY|MATHEMATICS)\b/i.test(
    String(after ?? ''),
  )
}

/**
 * Matching-list printed key: "The correct option is (A) (P)→(4)(Q)→(3)…"
 * Never a question stem.
 */
export function looksLikeAnswerKeyMappingBlob(text) {
  const t = String(text ?? '').trim()
  if (!t) return false
  if (/^the correct option is\b/i.test(t)) return true
  if (/\bthe correct option is\b/i.test(t.slice(0, 80)) && /\(\s*P\s*\)\s*→/.test(t)) return true
  const arrows = (t.match(/\(\s*[PQRS]\s*\)\s*[→\->]+\s*\(\s*\d+\s*\)/g) || []).length
  if (
    arrows >= 4 &&
    /\(\s*A\s*\)/.test(t) &&
    !/^\s*(?:\d{1,2}[\.\)]\s+)?(?:Let|If|Match each|Which|Consider|Suppose|Given)\b/i.test(t)
  ) {
    return true
  }
  return false
}

/**
 * Cut glued `--- page ---` + SECTION / paper header off a stem.
 * Keep formula that continues after a page break.
 */
export function stripPageBreakAndSectionGlue(text) {
  let s = String(text ?? '')
  const pageAt = s.search(/\n*--- page ---/i)
  if (pageAt >= 0) {
    const after = s.slice(pageAt).replace(/\n*--- page ---\n*/i, '')
    if (looksLikeAnswerKeyMappingBlob(s.slice(0, pageAt))) {
      s = s.slice(0, pageAt)
    } else if (pageBreakStartsNewSection(after)) {
      s = s.slice(0, pageAt)
    } else {
      s = `${s.slice(0, pageAt).trim()}\n${after}`
    }
  }
  s = s.replace(/\n*--- page ---\n*/gi, '\n')
  if (looksLikeAnswerKeyMappingBlob(s)) {
    const sec = s.search(/\bSECTION\s+[A-Z0-9()]/i)
    if (sec > 8) s = s.slice(0, sec)
  }
  return stripTrailingPyqSectionHeader(s).trim()
}

/** @param {string} text @param {{ optionsFound?: number }} [parsed] */
export function inferBulkQuestionType(text, parsed = {}) {
  const t = String(text ?? '')
  if (looksLikeMatchingListStem(t)) {
    return (parsed.optionsFound ?? 0) >= 2 ? 'single_correct' : 'matrix_match'
  }
  if ((parsed.optionsFound ?? 0) >= 2) return 'single_correct'
  if (MCQ_STEM_HINT.test(t)) return 'single_correct'
  if (/(\(\s*[A-D]\s*\)\s*){2,}/i.test(t)) return 'single_correct'
  if (/_{2,}|\\_{2,}|\\fillin\b|\\underline\{\s*\}/.test(t)) return 'numerical'
  if (/\bthe value of\b/i.test(t) && /\bis\b/i.test(t)) return 'numerical'
  if (/\binteger\b/i.test(t) || /\b(?:0\s*to\s*9|0-9)\b/i.test(t)) return 'integer'
  if (/\bnumerical\b/i.test(t) || /\bdecimal\b/i.test(t)) return 'numerical'
  return undefined
}

/**
 * Normalize markers + trim answer key before bulk split.
 * @param {string} text
 */
/** Words/phrases that usually start a JEE question stem after "N." */
export const JEE_Q_OPENER =
  'If|Let|Which|Given|Suppose|Consider|For\\s+the|The\\s+number|Period\\s+of|Number\\s+of|Match\\s+(?:the|each|List)|Paragraph|In\\s+which|Another|Then\\s+which|Given\\s+the|Then\\s+find|If\\s+the|If\\s+function|If\\s+A\\s+and|A\\s+function|Let\\s+us|On\\s+the\\s+basis|The\\s+value|Range\\s+of|Domain\\s+of|Minimum\\s+value|Maximum\\s+value|Prove\\s+that|Find\\s+the|Statement|The\\s+set|Let\\s+f|Let\\s+g|Let\\s+h|Let\\s+A|Let\\s+S|Let\\s+the|When|Where|An\\s+|The\\s+|Two\\s+|Three\\s+|Four\\s+|A\\s+(?:particle|thin|square|wire|block|gas|cell|beam)|How\\s+many|What\\s+is|Evaluate|Calculate|Determine'

/** Lookahead for splitting glued "(D)… 5. …" — opener words or any letter/math. */
export const JEE_QUESTION_STEM_LOOKAHEAD = `(?:${JEE_Q_OPENER}|[A-Za-z$\\\\(])`

/** After option (D), signals the next question — excludes "Given" (matches "is given by" in options). */
export const AFTER_OPTION_D_NEXT_STEM =
  '(?:Q\\s*\\.\\s*\\d|JEE\\s*\\(|(?:Let|If|Which|Two|An|Consider|Suppose|Match|For\\s+the|How\\s+many|What\\s+is|The\\s+value|The\\s+probability|An\\s+integer|A\\s+(?:particle|function|student))\\b)'

/** @param {string} text */
export function normalizeJeeSheetText(text) {
  return String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/ƒ/g, 'f')
    .replace(/®/g, ' \\to ')
    .replace(/Î/g, '\\in ')
    .replace(/\s+"\s*x\s/gi, ' \\forall x ')
    .replace(/\^(\d{1,2})\.\s+/g, '\n$1. ')
    .replace(
      new RegExp(
        `(\\(\\s*D\\s*\\)[^\\n]{0,400}?)\\s+(\\d{1,2})[\\.\\)]\\s+(?=${JEE_QUESTION_STEM_LOOKAHEAD})`,
        'gi',
      ),
      '$1\n\n$2. ',
    )
    .replace(
      /(?<=\n)\s*(Q(?:uestion)?\s*\.?\s*(?:No\.?\s*)?(\d{1,3}))[\.\)\:\-\s]+(?=[A-Za-z$\\(])/gi,
      '\n$1. ',
    )
    .replace(/(?:^|\n)([^\n]{0,72}\b)Q\s*\.\s*(\d{1,3})\b(?!\s*[\.\)])/gi, '\n$1Q.$2 ')
    .replace(
      new RegExp(
        `(\\(\\s*D\\s*\\)[^\\n]{0,600}?)(?=\\s*${AFTER_OPTION_D_NEXT_STEM})`,
        'gi',
      ),
      '$1\n\n',
    )
    .replace(/(?:^|\n)\s*(SECTION\s+[A-Z0-9()])/gi, '\n\n$1')
}

/**
 * Parse trailing ANSWER KEY section: { 1: { correctIndex: 0 }, 21: { correctIndices: [1,2,3] } }
 * @param {string} text
 */
export function parseGlobalAnswerKeyMap(text) {
  const raw = String(text ?? '')
  const heading = raw.search(ANSWER_KEY_HEADING)
  // Also accept trailing dense keys without a heading (last 35% of doc)
  const section = heading >= 0 ? raw.slice(heading) : raw
  const map = {}
  const patterns = [
    /(?:^|[\s^])(\d{1,3})\s*[\.\^\)\:\-\–]\s*\(?([A-D](?:\s*[,;\/&]\s*[A-D])*)\)?/gi,
    /(?:^|[\s^])(\d{1,3})\s*[\)\.]\s*Ans(?:wer)?\s*[\:\-]?\s*([A-D](?:\s*[,;]\s*[A-D])*)/gi,
  ]
  for (const re of patterns) {
    let match
    while ((match = re.exec(section)) !== null) {
      const num = Number(match[1])
      const letters = match[2].match(/[A-D]/gi) ?? []
      if (!letters.length) continue
      // Without a heading, only trust keys that look like answer rows (short)
      if (heading < 0) {
        const lineStart = section.lastIndexOf('\n', match.index) + 1
        const lineEnd = section.indexOf('\n', match.index)
        const line = section.slice(lineStart, lineEnd < 0 ? undefined : lineEnd).trim()
        if (line.length > 28) continue
      }
      if (letters.length > 1) {
        map[num] = { correctIndices: letters.map((l) => l.charCodeAt(0) - 65) }
      } else {
        map[num] = { correctIndex: letters[0].toUpperCase().charCodeAt(0) - 65 }
      }
    }
  }
  return map
}

/** @param {string} block */
export function extractQuestionNumber(block) {
  const t = String(block ?? '').trim()
  let m = t.match(/^(\d{1,2})[\.\)]\s+/)
  if (m) return Number(m[1])
  m = t.match(/\\item\s*\[\s*Q\s*\.?\s*\]\s*(\d{1,3})\b/i)
  if (m) return Number(m[1])
  m = t.match(/\\item\s*\[\s*Q\s*\.?\s*(\d{1,3})\s*\]/i)
  if (m) return Number(m[1])
  m = t.match(/^Q\s*\.\s*(\d{1,3})\b/i)
  if (m) return Number(m[1])
  m = t.match(/^Q(?:uestion)?\s*\.?\s*(\d{1,3})[\.\)\:\-\s]/i)
  if (m) return Number(m[1])
  m = t.match(/^Q\.?\s*No\.?\s*(\d{1,3})\b/i)
  if (m) return Number(m[1])
  m = t.match(/^[^\n]{0,160}\bQ\s*\.\s*(\d{1,3})\b/i)
  if (m) return Number(m[1])
  m = t.match(/^[^\n]{0,160}\bPaper\s+\d+\s+Q\s*\.\s*(\d{1,3})\b/i)
  if (m) return Number(m[1])
  return undefined
}

/** @param {string} opt @param {string} [stem] */
export function isGraphAxisGarbageOption(opt, stem = '') {
  const o = String(opt ?? '').trim()
  if (!o || o.length < 40) return false
  if (!/\b(?:graph|suits the graph|which of the following best)\b/i.test(stem)) return false
  return (
    /x\s*-?\s*1\s*0\s*1\s*x/i.test(o) ||
    /\\times\s*0\s*x/i.test(o) ||
    /f\s*-\s*1\s*\(\s*0\s*\)/i.test(o) ||
    /^[\d\s\\times x+-]+$/i.test(o.replace(/\$+/g, ''))
  )
}

/** @param {string[]} options @param {string} stem */
export function cleanBulkOptions(options, stem) {
  return (options ?? []).map((o) => {
    if (isGraphAxisGarbageOption(o, stem)) return ''
    let s = String(o ?? '').trim().replace(/\\text\s*\{\s*frac\s*\}/gi, '\\frac')
    if (s && !s.includes('$') && /\\(?:frac|sqrt|text)\b/.test(s)) s = `$${s}$`
    return s
  })
}

export function prepareBulkExtractText(text) {
  const stripped = stripAnswerKeySection(
    repairWordSymbolFontText(normalizeMathpixQuestionMarkers(text)),
  )
  return splitGluedMcqOptions(
    normalizeOptionMarkersInText(normalizeJeeSheetText(stripped)),
  )
}

const INSTRUCTION_HEAD =
  /^(?:instructions?|general instructions?|important instructions?|read the following|time allotted|maximum marks|note\s*:|candidate[s']?\s+(?:must|should|are)|section\s+[a-z0-9])/im

const INSTRUCTION_BODY =
  /\b(?:all questions are compulsory|attempt any|use of calculator|rough work|do not write|omr sheet|bubble|negative marking|marks for each|duration of|time limit|read carefully|answer all|do not turn|break the seal|use blue|use black|ball point|this section contains|only one of these four options|one or more than one|partial marking|full marks if|zero marks if|marking scheme)\b/i

/** @param {string} opt */
export function isGarbageInstructionOption(opt) {
  const s = String(opt ?? '').trim()
  if (!s) return true
  if (/^[,.\-–—&:;]+$/.test(s)) return true
  if (/^(?:and|or|the|a|an|is|are|was|were|to|of|in|for|on|at|by|with|from|as|if|not|no|yes)$/i.test(s)) {
    return true
  }
  if (/^(?:only one|one or more|one or more than one|more than one)/i.test(s)) return true
  if (/^(?:correct|incorrect)\s+option/i.test(s)) return true
  if (/\b(?:marks will be|awarded|deducted|no negative|partial marks)\b/i.test(s) && s.length < 160) {
    return true
  }
  if (
    /\b(?:partial marking|negative marking|marks? for|full marks|zero marks|no marks|unattempted)\b/i.test(
      s,
    ) &&
    s.length < 140
  ) {
    return true
  }
  if (
    /\b(?:correct answer|wrong answer|incorrect answer)\b/i.test(s) &&
    s.length < 120
  ) {
    return true
  }
  return false
}

/** 2024+ JEE Advanced section / marking blurb — not an exam question. */
const PYQ_SECTION_INSTRUCTION_PAYLOAD =
  /\b(?:this section contains|maximum marks|marking scheme|only one of these four options|one or more than one of these four|matching list sets?|for each question,\s+(?:enter|choose)|evaluated according to the following marking|full marks\s*:|zero marks\s*:|negative marks\s*:|the answer to each question is a (?:numerical value|single digit integer))\b/i

/** True when the opening lines are a SECTION / marks page, even if Gemini prefixed Let/If or 1. */
export function hasPyqSectionInstructionPayload(text) {
  const t = String(text ?? '').trim()
  if (!t) return false
  const head = t.slice(0, 280)
  if (PYQ_SECTION_INSTRUCTION_PAYLOAD.test(head)) return true
  if (/^\s*(?:Q\s*\.?\s*\d{1,2}[\.\):\s-]+)?section\s+[a-z0-9()]/i.test(t)) return true
  if (/\bsection\s+\d+\s*\(\s*maximum marks/i.test(head)) return true
  if (/\bcontains\s+(?:TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|\d+)\s*(?:\(\d+\))?\s*(?:questions?|matching list)/i.test(head)) {
    return true
  }
  if (
    /^JEE\s*\(?\s*Advanced/i.test(t) &&
    t.length < 220 &&
    !/\bQ\s*\.?\s*\d{1,2}\b/i.test(t) &&
    !looksLikeQuestionBlock(t)
  ) {
    return true
  }
  if (/^PAPER\s*[12]\b/i.test(t) && t.length < 100) return true
  if (/^(?:PHYSICS|CHEMISTRY|MATHEMATICS)\s*(?:SECTION|$)/i.test(t) && t.length < 280) return true
  return false
}

/** JEE/NEET section header or marking blurb — not an exam question. */
export function looksLikePyqSectionInstructionStem(stem) {
  const t = String(stem ?? '').trim()
  if (!t || t.length < 12) return false
  if (looksLikeAnswerKeyMappingBlob(t)) return true
  const glued = stripPageBreakAndSectionGlue(t)
  if (looksLikeAnswerKeyMappingBlob(glued)) return true
  if (looksLikeMatchingListStem(glued) && looksLikeQuestionBlock(glued)) return false
  const inspect = glued.length >= 40 ? glued : t
  // Real stem + trailing marking chrome is still a question — strip first.
  if (looksLikeQuestionBlock(inspect) && !hasPyqSectionInstructionPayload(inspect.slice(0, 160))) {
    return false
  }
  // Instruction payload wins over Gemini "1." / "Let …" prefixes (2024 P1 mix-in).
  if (hasPyqSectionInstructionPayload(inspect.slice(0, 160))) return true
  if (/^\d{1,2}[\.\)]\s+\S/.test(t) && looksLikeQuestionBlock(t) && !/\bthis section contains\b/i.test(t.slice(0, 160))) {
    return false
  }
  const firstLine = t.split(/\n/)[0] ?? t
  if (
    /^(?:If|Let|Which|Given|Suppose|Consider(?:ing)?|The\s|A\s|An\s|Match\s+each|Find|Sum\s+of|Among)\b/i.test(
      firstLine,
    ) &&
    !/^The correct option is\b/i.test(firstLine) &&
    !hasPyqSectionInstructionPayload(t.slice(0, 160)) &&
    !looksLikeAnswerKeyMappingBlob(t)
  ) {
    return false
  }
  if (/^\s*section\s+[a-z0-9()]/i.test(t)) return true
  // "Area of the cross-section of a wire" is a question, not a SECTION header.
  if (
    /(?<![\w-])section\s*[-–]?\s*(?:\d+\b|[A-D]\b|\(\s*[A-D0-9]+\s*\)|[IVX]+\b)/i.test(t.slice(0, 80)) &&
    !/^\d{1,2}[\.\)]/.test(t)
  ) {
    return true
  }
  if (/\bmaximum marks\b/i.test(t) && !looksLikeQuestionBlock(t)) return true
  if (/\bthis section contains\b/i.test(inspect) && !looksLikeQuestionBlock(inspect)) return true
  if (/\bcontains\s+(?:TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|\d+)\s*(?:\(\d+\))?\s*(?:questions?|matching list)/i.test(t)) {
    return true
  }
  if (/\bonly one of these four options\b/i.test(inspect.slice(0, 160))) return true
  if (/\bONLY ONE (?:CORRECT )?OPTION\b/i.test(inspect.slice(0, 160)) && !/^\d{1,2}[\.\)]/.test(t)) {
    return true
  }
  if (/\bSINGLE DIGIT INTEGER\b/i.test(t) && !/^\d{1,2}[\.\)]/.test(t)) return true
  if (/\bNUMERICAL VALUE\b/i.test(t) && /\b(?:answer to each question|this section)\b/i.test(t)) return true
  if (/\bFor each question, enter\b/i.test(t)) return true
  if (/\bmarking scheme\b/i.test(t) && !looksLikeQuestionBlock(t)) return true
  if (/\b(?:Single Correct|Multiple Correct|Numerical Value|Match (?:the )?Following) (?:Answer )?Type\b/i.test(t) && t.length < 360) {
    return true
  }
  if (
    /\b(?:one or more|one or more than one) (?:of )?(?:the )?(?:correct )?options?\b/i.test(t) &&
    !/(\(\s*[A-D]\s*\)[\s\S]*){2,}/i.test(t)
  ) {
    return true
  }
  if (
    /\b(?:\+?\d+\s*(?:marks?|mark)|-\s*\d+\s*(?:marks?|mark))\b/i.test(t) &&
    !/(\(\s*[A-D]\s*\)[\s\S]*){2,}/i.test(t) &&
    t.length < 420
  ) {
    return true
  }
  if (
    /^[A-Z0-9\s().,:;-]{20,}$/.test(t) &&
    !/\$/.test(t) &&
    !/^\d{1,2}[\.\)]/.test(t) &&
    /\b(?:SECTION|MARKS|QUESTIONS|INSTRUCTIONS|PAPER)\b/.test(t)
  ) {
    return true
  }
  return false
}

/** @param {string[]} options */
export function instructionLikeOptions(options) {
  const filled = (options ?? []).map((o) => String(o ?? '').trim()).filter(Boolean)
  if (!filled.length) return false
  const garbage = filled.filter(isGarbageInstructionOption).length
  return garbage >= Math.max(2, filled.length - 1)
}
const INSTRUCTION_CHOOSE_CORRECT =
  /\b(?:please\s+)?choose\s+the\s+correct\s+(?:answer|option)?\s*(?:from|in)\b/i

/** @param {string} block */
export function looksLikeQuestionBlock(block) {
  const t = String(block ?? '').trim()
  if (t.length < 20) return false
  if (looksLikeAnswerKeyMappingBlob(t)) return false
  if (/^\d{1,2}[\.\)]\s+/.test(t)) return true
  if (/\\item\s*\[\s*Q/i.test(t)) return true
  if (/^Q\s*\.?\s*(?:No\.?\s*)?\d{1,3}\b/i.test(t)) return true
  if (/\bQ\s*\.\s*\d{1,3}\b/i.test(t) && (/\$/.test(t) || /\(\s*[A-D]\s*\)/.test(t))) return true
  if (/(\(\s*[A-D]\s*\)[\s\S]*){2,}/i.test(t)) return true
  if (looksLikeMatchingListStem(t)) return true
  if (
    /\b(?:which of the following|let \$|if \$|suppose|consider the|probability that|is equal to|then find|then which|two tangents|ellipse|match each|match the (?:column|list))\b/i.test(
      t,
    )
  ) {
    return true
  }
  if (/\$[^$]{3,}\$/.test(t) && /\?/.test(t)) return true
  if (/\b(?:find|calculate|evaluate|determine|prove|show that)\b/i.test(t) && t.length >= 40) {
    return true
  }
  return false
}

/** @param {string} block — PYQ paper instruction page/section (not a question). */
export function isPyqInstructionBlock(block) {
  const t = String(block ?? '').trim()
  if (t.length < 25) return false
  if (looksLikeAnswerKeyMappingBlob(t)) return true
  if (looksLikePyqSectionInstructionStem(t)) return true
  if (looksLikeQuestionBlock(t)) return false
  if (INSTRUCTION_HEAD.test(t)) return true
  if (INSTRUCTION_CHOOSE_CORRECT.test(t)) return true
  if (INSTRUCTION_BODY.test(t) && !/^\d{1,2}[\.\)]/.test(t)) return true
  if (
    /^(?:part|section|paper)\s+[a-z0-9]/i.test(t) &&
    !/^\d{1,2}[\.\)]/.test(t) &&
    !/^Q\s*\./i.test(t) &&
    t.length < 500
  ) {
    return true
  }
  return false
}
