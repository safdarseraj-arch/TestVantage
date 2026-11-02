/**
 * Read paper section instructions from RAW Mathpix / OCR FIRST.
 * Then extract/clean. Then stamp each card type by printed Q number.
 *
 * Never invent questions, options, or passage text. Shared for Official PYQ
 * and any-paper upload -- no paper-year special cases.
 */

const WORD_COUNT = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
}

const NVQ_TYPES = new Set(['numerical', 'integer', 'passage_integer'])
const MCQ_TYPES = new Set(['single_correct', 'multiple_correct', 'passage_scq'])

/** Section headers only — never “This section contains” (that sits inside the same block). */
const SECTION_ANCHOR_RE =
  /\\section\*?\{[^}\n]*SECTION[^}]*\}|(?:^|\n)\s*SECTION\s+\d+\b/gi

const PARA_ANCHOR_RE =
  /\\section\*?\{[^}\n]*PARAGRAPH[^}]*\}|(?:^|\n)\s*PARAGRAPH\s*["']?[IVXL\d]|(?:^|\n)\s*Paragraph\s+for\s+(?:Questions?|Q\.?)\s*\d|(?:^|\n)\s*(?:Passage|Comprehension)\s*:|(?:\\section\*?\{\s*)?Question\s+Stem\s+for\s+Question\s+Nos?\.?\s*\d{1,3}/gi

const Q_ITEM_RE = /\\item\s*\[\s*Q[^\]]*\]\s*(\d{1,3})\b|(?:^|\n)\s*Q\s*\.?\s*(\d{1,3})\b(?!\s*[,;])/gi

const EMPTY_OPTS = ['', '', '', '']

/** @param {unknown} text */
export function looksLikeNumericalFillBlank(text) {
  const t = String(text ?? '')
  if (!t.trim()) return false
  // OCR blanks: ____  or  \_\_\_\_  or \fillin / empty \underline
  if (/_{2,}|\\_{2,}|(?:\\_){2,}|\\fillin\b|\\underline\{\s*\}/.test(t)) return true
  // Need a real answer blank — not prose “the value of x … it is at rest”.
  if (/(\(\s*[A-D]\s*\)){2,}/i.test(t)) return false
  if (
    /\bthe value of\b/i.test(t) &&
    /\bis\s*(?:_{2,}|\\_+|\\fillin\b|\.{3,}|…|$)/i.test(t.replace(/\s+/g, ' '))
  ) {
    return true
  }
  if (/\bis\s*_{2,}/i.test(t) || /\bis\s*\\fillin\b/i.test(t)) return true
  return false
}

/** @param {unknown} text */
export function inferInstructionQuestionType(text) {
  const t = String(text ?? '')
  if (!t.trim()) return null
  if (
    /\bmatch(?:ing)?\s+(?:the\s+)?(?:following|list|column)s?\b|\bmatrix\s+match\b|\bmatching list\b/i.test(
      t,
    )
  ) {
    return 'matrix_match'
  }
  if (/\bone\s+or\s+more(?:\s+than\s+one)?\b/i.test(t) && /\b(?:option|correct)\b/i.test(t)) {
    return 'multiple_correct'
  }
  if (
    /\b(?:only\s+one|single\s+correct|one\s+correct)\b/i.test(t) &&
    /\b(?:option|correct|answer)\b/i.test(t)
  ) {
    return 'single_correct'
  }
  if (/\bnumerical\s+value\b/i.test(t)) return 'numerical'
  if (/\bsingle\s+digit\s+integer\b/i.test(t)) return 'integer'
  // JEE Advanced Paper 2 §3: “NON-NEGATIVE INTEGER” (not matching-list).
  if (/\bnon[-\s]?negative\s+integers?\b/i.test(t)) return 'integer'
  if (/\bthe answer to each question is a\s+(?:non[-\s]?negative\s+)?integer\b/i.test(t)) {
    return 'integer'
  }
  if (/\binteger\s+answer\b/i.test(t)) return 'numerical'
  if (/\b(?:paragraph|comprehension)\b/i.test(t) && /\b(?:numerical|integer|fill)\b/i.test(t)) {
    return 'numerical'
  }
  return null
}

/** @param {unknown} text */
export function parseQuestionCountFromInstruction(text) {
  const t = String(text ?? '')
  const word = t.match(
    /\bcontains\s+(TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|\d+)\s*(?:\(\s*0?(\d+)\s*\))?\s*(?:questions?|matching)/i,
  )
  if (word) {
    const named = WORD_COUNT[String(word[1]).toLowerCase()]
    const digits = Number(word[2] || word[1])
    if (named > 0) return named
    if (Number.isFinite(digits) && digits > 0) return digits
  }
  const six = t.match(/\b(TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|\d+)\s+questions?\b/i)
  if (six) {
    const named = WORD_COUNT[String(six[1]).toLowerCase()]
    const n = named || Number(six[1])
    if (n > 0 && n <= 20) return n
  }
  return 0
}

/** @param {unknown} text */
export function parseExplicitQuestionRange(text) {
  const t = String(text ?? '')
  const span = t.match(
    /\b(?:questions?|Q\.?)\s*(\d{1,3})\s*(?:to|through|-)\s*(?:questions?|Q\.?)?\s*(\d{1,3})\b/i,
  )
  if (span) {
    const from = Number(span[1])
    const to = Number(span[2])
    if (from > 0 && to >= from && to - from < 40) return { from, to }
  }
  const listed = [
    ...t.matchAll(/\b(?:questions?|Q\.?)\s*((?:\d{1,3}\s*(?:,|and|&)\s*)+\d{1,3})\b/gi),
  ]
  for (const row of listed) {
    const nums = String(row[1])
      .split(/\s*(?:,|and|&)\s*/i)
      .map((x) => Number(x))
      .filter((n) => n > 0)
    if (nums.length >= 2) {
      return { from: Math.min(...nums), to: Math.max(...nums) }
    }
  }
  const pair = t.match(
    /\b(?:Paragraph\s+for\s+(?:Questions?|Q\.?)|Question\s+Stem\s+for\s+Question\s+Nos?\.?)\s*(\d{1,3})\s+and\s+(\d{1,3})\b/i,
  )
  if (pair) {
    const a = Number(pair[1])
    const b = Number(pair[2])
    if (a > 0 && b >= a) return { from: a, to: b }
  }
  return null
}

/** @param {string} text */
function firstQuestionItemIndex(text) {
  const t = String(text ?? '')
  const item = t.search(/\\item\s*\[\s*Q[^\]]*\]\s*\d{1,3}\b/i)
  const line = t.search(
    /(?:^|\n)\s*Q\s*\.?\s*\d{1,3}\s+(?:If|Let|Which|Consider|Suppose|In\s|Among\s|Based\s|A\s|The\s|For\s|List-I\b)/i,
  )
  const hits = [item, line].filter((n) => n >= 0)
  return hits.length ? Math.min(...hits) : -1
}

/** @param {string} text */
function qNumbersInText(text) {
  const out = []
  const re = new RegExp(Q_ITEM_RE.source, 'gi')
  let m
  while ((m = re.exec(String(text ?? '')))) {
    const n = Number(m[1] || m[2])
    if (n > 0 && !out.includes(n)) out.push(n)
  }
  return out
}

function qBodyAfterNumber(window, n) {
  const t = String(window ?? '')
  const re = new RegExp(
    `(?:\\\\item\\s*\\[\\s*Q[^\\]]*\\]\\s*|Q\\s*\\.?\\s*)${Number(n)}\\b`,
    'i',
  )
  const m = t.match(re)
  if (!m || m.index == null) return ''
  const from = m.index + m[0].length
  const rest = t.slice(from)
  const next = rest.search(/(?:\\item\s*\[\s*Q[^\]]*\]\s*|Q\s*\.?\s*)\d{1,3}\b/i)
  return next >= 0 ? rest.slice(0, next) : rest
}

function qBodyLooksLikeMcq(body) {
  return /(\(\s*A\s*\))[\s\S]{4,}(\(\s*B\s*\))/.test(String(body ?? ''))
}

function collectAnchors(raw, re) {
  const t = String(raw ?? '')
  const starts = []
  const rx = new RegExp(re.source, re.flags)
  let m
  while ((m = rx.exec(t))) {
    const at = m.index
    if (starts.some((s) => Math.abs(s - at) < 8)) continue
    starts.push(at)
  }
  return starts.sort((a, b) => a - b)
}

/**
 * How many scored children sit under this paragraph block.
 * Used only when the header has no "Questions N and M" and the window
 * somehow still has extra Q numbers — prefer the printed Q list in-window.
 * @param {string} text
 */
function paragraphChildCount(text) {
  const t = String(text ?? '')
  const word = t.match(
    /\b(?:contains|has|based on)\s+(?:the\s+)?(?:following\s+)?(TWO|THREE|FOUR|2|3|4)\s+questions?\b|(TWO|THREE|FOUR|2|3|4)\s+questions?\s+based\s+on\b/i,
  )
  if (word) {
    const named = WORD_COUNT[String(word[1] || word[2] || '').toLowerCase()]
    const n = named || Number(word[1] || word[2])
    if (n >= 2 && n <= 8) return n
  }
  return 0
}

const SUBJECT_HEADER_RE =
  /(?:\\(?:section|textbf|textit|large)\*?\{)?\s*\b(PHYSICS|CHEMISTRY|MATHEMATICS|MATHS|BIOLOGY|BOTANY|ZOOLOGY)\b/gi

const SECTION_ONE_RE =
  /\\section\*?\{[^}\n]*SECTION\s*1\b|(?:^|\n)\s*SECTION\s+1\b/gi

const PHYS_HINT =
  /\b(?:angular velocit|moment of inertia|magnetic|capacitor|inductor|resistor|coulomb|electric field|photon|diffraction|interference|young.?s|focal length|lens|prism|torque|friction|momentum|kinetic energy|simple harmonic|wavelength|current I\b|charge q\b|disk of radius|roll without slipping)\b/gi
const CHEM_HINT =
  /\b(?:mol\b|reagent|phenol|alkene|alkyne|SN1|SN2|hybridiz|orbital|titration|pH\b|electrode|organic|inorganic|compound|rate constant|equilibrium constant|ideal gas|NaOH|H2SO4|KMnO4|carbonyl|amine)\b/gi
const MATH_HINT =
  /\b(?:matrix|parabola|ellipse|hyperbola|permutation|combinat|differentiable|logarithm|inverse trigonometric|polynomial|gcd|integer n\b|function f\b|latus rectum|common tangent|determinant)\b/gi

/** @param {unknown} name */
export function normalizePaperSubject(name) {
  const s = String(name ?? '').trim().toLowerCase()
  if (!s) return ''
  if (s.startsWith('phys')) return 'physics'
  if (s.startsWith('chem')) return 'chemistry'
  if (s.startsWith('math')) return 'mathematics'
  if (s.startsWith('bio')) return 'biology'
  if (s.startsWith('bot')) return 'botany'
  if (s.startsWith('zoo')) return 'zoology'
  return ''
}

/** @param {unknown} text */
function firstSubjectHeader(text) {
  const m = String(text ?? '').match(new RegExp(SUBJECT_HEADER_RE.source, 'i'))
  return normalizePaperSubject(m?.[1] || m?.[0])
}

/** @param {unknown} blob */
export function inferSubjectFromPaperBlob(blob) {
  const t = String(blob ?? '')
  if (t.length < 40) return ''
  const qAt = firstQuestionItemIndex(t)
  const lead = qAt > 12 ? t.slice(0, qAt) : t.slice(0, 180)
  const named = firstSubjectHeader(lead)
  if (named) return named
  let phys = (t.match(new RegExp(PHYS_HINT.source, 'gi')) || []).length
  let chem = (t.match(new RegExp(CHEM_HINT.source, 'gi')) || []).length
  let math = (t.match(new RegExp(MATH_HINT.source, 'gi')) || []).length
  if (/\b(?:Let|Consider(?:ing)?)\s+(?:the\s+)?function\b/i.test(t)) math += 2
  if (/\bideal gas\b/i.test(t) && /\bmol\b/i.test(t)) chem += 2
  const ranked = [
    ['physics', phys],
    ['chemistry', chem],
    ['mathematics', math],
  ].sort((a, b) => b[1] - a[1])
  if (ranked[0][1] < 2) return ''
  if (ranked[0][1] === ranked[1][1]) return ''
  return ranked[0][0]
}

function subjectRangesFromHeaders(text) {
  /** @type {Array<{ from: number, to: number, subject: string, source: string }>} */
  const out = []
  const hits = []
  const re = new RegExp(SUBJECT_HEADER_RE.source, 'gi')
  let m
  while ((m = re.exec(text))) {
    const subject = normalizePaperSubject(m[1] || m[0])
    if (!subject) continue
    hits.push({ at: m.index, subject })
  }
  for (let i = 0; i < hits.length; i += 1) {
    const start = hits[i].at
    const end = i + 1 < hits.length ? hits[i + 1].at : text.length
    const nums = qNumbersInText(text.slice(start, end))
    if (!nums.length) continue
    out.push({
      from: nums[0],
      to: nums[nums.length - 1],
      subject: hits[i].subject,
      source: 'paper_header',
    })
  }
  return out
}

function subjectRangesFromSectionCycles(text) {
  const starts = collectAnchors(text, SECTION_ONE_RE)
  if (starts.length < 2) return []
  /** @type {Array<{ from: number, to: number, subject: string, source: string }>} */
  const out = []
  let cursor = 1
  const cycles = starts.length >= 3 ? starts.slice(0, 3) : starts
  for (let i = 0; i < cycles.length; i += 1) {
    const fromAt = cycles[i]
    const toAt = i + 1 < starts.length ? starts[i + 1] : text.length
    const window = text.slice(fromAt, toAt)
    const nums = qNumbersInText(window)
    const count = nums.length || 0
    if (count < 2) continue
    const subject =
      firstSubjectHeader(text.slice(Math.max(0, fromAt - 240), fromAt + 80)) ||
      inferSubjectFromPaperBlob(window)
    const from = cursor
    const to = cursor + count - 1
    if (subject) out.push({ from, to, subject, source: 'section_cycle' })
    else out.push({ from, to, subject: '', source: 'section_cycle' })
    cursor = to + 1
  }
  const tagged = out.filter((r) => r.subject)
  const pcm = ['physics', 'chemistry', 'mathematics']
  if (out.length === 3 && tagged.length === 2) {
    const leftover = pcm.find((s) => !tagged.some((r) => r.subject === s))
    const weak = out.find((r) => !r.subject)
    if (leftover && weak) {
      weak.subject = leftover
      weak.source = 'section_cycle_remainder'
    }
  }
  return out.filter((r) => r.subject)
}

/**
 * Sequential subject ranges (1..N after unique numbering), from printed
 * PHYSICS/CHEMISTRY/MATHEMATICS headers or repeating SECTION 1 cycles.
 * @param {unknown} raw
 * @returns {Array<{ from: number, to: number, subject: string, source: string }>}
 */
export function parsePaperSubjectRanges(raw) {
  const text = String(raw ?? '').replace(/\r\n/g, '\n')
  if (text.length < 40) return []
  const headers = subjectRangesFromHeaders(text)
  const distinctHeaders = new Set(headers.map((r) => r.subject))
  if (headers.length >= 2 && distinctHeaders.size >= 2) {
    const restart = (text.match(/\\item\s*\[\s*Q[^\]]*\]\s*1\b/gi) || []).length >= 2
    if (!restart) return headers
  }
  const cycles = subjectRangesFromSectionCycles(text)
  if (cycles.length >= 2) return cycles
  return headers
}

/**
 * @param {unknown} raw
 * @returns {{
 *   ranges: Array<{ from: number, to: number, type: string, source: string, paragraph?: boolean }>,
 *   passageRanges: Array<{ from: number, to: number, source: string }>,
 *   subjectRanges: Array<{ from: number, to: number, subject: string, source: string }>,
 *   warnings: string[]
 * }}
 */
export function parsePaperSectionMap(raw) {
  const text = String(raw ?? '').replace(/\r\n/g, '\n')
  /** @type {Array<{ from: number, to: number, type: string, source: string, paragraph?: boolean }>} */
  const ranges = []
  /** @type {Array<{ from: number, to: number, source: string }>} */
  const passageRanges = []
  /** @type {string[]} */
  const warnings = []
  if (text.length < 20) return { ranges, passageRanges, subjectRanges: [], warnings }

  const sectionStarts = collectAnchors(text, SECTION_ANCHOR_RE)
  const blocks = []
  for (let i = 0; i < sectionStarts.length; i += 1) {
    const start = sectionStarts[i]
    const end =
      i + 1 < sectionStarts.length ? sectionStarts[i + 1] : Math.min(text.length, start + 4000)
    const window = text.slice(start, end)
    const qAt = firstQuestionItemIndex(window)
    const instruct = (qAt > 12 ? window.slice(0, qAt) : window.slice(0, 1400)).trim()
    const type =
      inferInstructionQuestionType(instruct) || inferInstructionQuestionType(window.slice(0, 1400))
    const count =
      parseQuestionCountFromInstruction(instruct) ||
      parseQuestionCountFromInstruction(window.slice(0, 1400))
    const explicit =
      parseExplicitQuestionRange(instruct) || parseExplicitQuestionRange(window.slice(0, 1400))
    const bodyNums = qAt >= 0 ? qNumbersInText(window.slice(qAt)) : qNumbersInText(window)
    if (!type && !count && !explicit) continue
    blocks.push({
      type: type || null,
      count,
      explicit,
      bodyNums,
      source: instruct.slice(0, 220).replace(/\s+/g, ' '),
    })
  }

  let cursor = 0
  for (const b of blocks) {
    let from = 0
    let to = 0
    if (b.explicit) {
      from = b.explicit.from
      to = b.explicit.to
    } else if (b.bodyNums.length) {
      from = b.bodyNums[0]
      to = b.bodyNums[b.bodyNums.length - 1]
      // Trim when the window spilled into the next section (e.g. MSQ 5–7 seeing Q.8).
      if (b.count > 0 && to - from + 1 > b.count) to = from + b.count - 1
      else if (b.count > 0 && to - from + 1 < b.count) to = from + b.count - 1
    } else if (b.count > 0) {
      from = cursor + 1
      to = cursor + b.count
    }
    if (!from || !to || to < from) continue
    if (!b.type) {
      warnings.push('Section Q.' + from + '-Q.' + to + ' had a count but no type words.')
      cursor = to
      continue
    }
    ranges.push({ from, to, type: b.type, source: b.source })
    cursor = to
  }

  const paraStarts = collectAnchors(text, PARA_ANCHOR_RE)
  for (let i = 0; i < paraStarts.length; i += 1) {
    const start = paraStarts[i]
    const nextSec = sectionStarts.find((s) => s > start + 8) ?? text.length
    const nextPara = i + 1 < paraStarts.length ? paraStarts[i + 1] : nextSec
    const end = Math.min(nextPara, nextSec, start + 2500)
    const window = text.slice(start, end)
    const explicit = parseExplicitQuestionRange(window.slice(0, 400))
    const qAt = firstQuestionItemIndex(window)
    const bodyNums = qAt >= 0 ? qNumbersInText(window.slice(qAt)) : []
    const fillNums = bodyNums.filter((n) => {
      const body = qBodyAfterNumber(window, n)
      return looksLikeNumericalFillBlank(body) && !qBodyLooksLikeMcq(body)
    })
    const mcqNums = bodyNums.filter((n) => qBodyLooksLikeMcq(qBodyAfterNumber(window, n)))
    const childN = paragraphChildCount(window.slice(0, 800))
    const childNums = fillNums.length ? fillNums : []
    let from = 0
    let to = 0
    if (explicit) {
      from = explicit.from
      to = explicit.to
    } else if (childNums.length) {
      from = childNums[0]
      to = childNums[childNums.length - 1]
      if (childN > 0 && childNums.length > childN) to = childNums[childN - 1]
    } else if (bodyNums.length && !mcqNums.length) {
      from = bodyNums[0]
      to = bodyNums[bodyNums.length - 1]
      if (childN > 0 && bodyNums.length > childN) to = bodyNums[childN - 1]
    }
    if (childN === 2 && from && from === to) {
      const before = qNumbersInText(text.slice(Math.max(0, start - 400), start)).pop()
      const beforeBody = before ? qBodyAfterNumber(text.slice(Math.max(0, start - 800), start), before) : ''
      if (
        before === from - 1 &&
        looksLikeNumericalFillBlank(beforeBody) &&
        !qBodyLooksLikeMcq(beforeBody)
      ) {
        from = before
      }
    }
    if (!from || !to || to < from || to - from > 3 || to >= 80) continue
    passageRanges.push({
      from,
      to,
      source: window.slice(0, 160).replace(/\s+/g, ' '),
    })
    const parent = ranges.find((r) => from >= r.from && to <= r.to)
    const paraType =
      inferInstructionQuestionType(window.slice(0, 500)) ||
      parent?.type ||
      (bodyNums.length && looksLikeNumericalFillBlank(window.slice(qAt >= 0 ? qAt : 0))
        ? 'numerical'
        : null)
    if (!paraType) continue
    if (parent && parent.type === paraType) continue
    ranges.push({
      from,
      to,
      type: paraType,
      source: window.slice(0, 160).replace(/\s+/g, ' '),
      paragraph: true,
    })
  }

  ranges.sort((a, b) => a.from - b.from || a.to - b.to)
  passageRanges.sort((a, b) => a.from - b.from || a.to - b.to)
  const subjectRanges = parsePaperSubjectRanges(text)
  return { ranges, passageRanges, subjectRanges, warnings }
}

/** Printed Q sits under a parsed paragraph block. Default is no. */
export function passageRangeContains(map, n) {
  const num = Number(n)
  if (!Number.isFinite(num) || num <= 0) return false
  return (map?.passageRanges || []).some((r) => num >= r.from && num <= r.to)
}

/** @param {{ ranges?: Array<{ from: number, to: number, type: string }> }} map @param {number} n */
export function sectionTypeForPrintedNumber(map, n) {
  const num = Number(n)
  if (!Number.isFinite(num) || num <= 0) return null
  const hits = (map?.ranges || []).filter((r) => num >= r.from && num <= r.to)
  if (!hits.length) return null
  const para = hits.find((r) => r.paragraph)
  return (para || hits[hits.length - 1]).type
}

/** @param {object} q */
export function printedQuestionNumber(q) {
  const n = Number(q?.printedNumber ?? q?.questionNumber ?? q?.pyqSlot ?? q?.number)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function optionBodyLooksReal(opt) {
  const t = String(opt ?? '').trim()
  if (!t) return false
  if (/^[,.\s]+$/.test(t)) return false
  if (/^(?:and|or)\.?$/i.test(t)) return false
  if (
    /^(?:ONLY\s+ONE|ONE\s+OR\s+MORE|will get|Answer to each|For each question|are the ONLY|evaluated according)/i.test(
      t,
    )
  ) {
    return false
  }
  if (/includegraphics|cdn\.mathpix|<smiles>|\$|\\frac|\\mathrm|^\d/.test(t)) return true
  return t.length >= 3
}

function filledOptionCount(q) {
  return (Array.isArray(q?.options) ? q.options : []).filter((o) => optionBodyLooksReal(o)).length
}

function looksLikeStolenPassageOptions(q) {
  const blob = (Array.isArray(q?.options) ? q.options : []).map((o) => String(o ?? '')).join('\n')
  if (/\bthere are two questions based on\s+PARAGRAPH/i.test(blob)) return true
  if (/exactly \d+ elements/i.test(blob) && /for each\s*\(\s*[a-z]\s*,/i.test(blob)) return true
  if (String(q?.passageText ?? '') && /exactly \d+ elements/i.test(blob)) return true
  return false
}

/** Real (A)-(D) in Mathpix body -- not passage i/ii bullets. */
export function cardHasRealMcqOptions(q) {
  if (looksLikeStolenPassageOptions(q)) return 0
  const stem = String(q?.text ?? q?.stem ?? '')
  const labels = new Set()
  for (const letter of ['A', 'B', 'C', 'D']) {
    if (new RegExp('\\(\\s*' + letter + '\\s*\\)', 'i').test(stem)) labels.add(letter)
  }
  const filled = filledOptionCount(q)
  if (labels.size >= 2 && filled >= 2) return Math.max(labels.size, filled)
  if (labels.size >= 4) return labels.size
  if (filled >= 2 && labels.size >= 2) return filled
  if (filled >= 2 && /(\(\s*[A-D]\s*\))/.test(stem)) return filled
  if (filled >= 2 && !looksLikeNumericalFillBlank(stem)) return filled
  // Peeled SCQ stems often read “the value of … is” with A–D already in options[].
  // Instruction-first: those boxes are real — never treat them as NVQ blanks.
  if (filled >= 2) return filled
  return labels.size >= 2 ? labels.size : 0
}

function looksLikePassageChildCard(q) {
  return Boolean(
    q?.passageRole === 'comprehension_child' || q?.passageText || q?.passageId || q?.passageGroup,
  )
}

/**
 * Stamp one card from the section map. Instruction NVQ wins over a later SCQ guess
 * unless the Mathpix body has four real (A)-(D). Never invents options.
 * @param {object} q
 * @param {unknown} raw
 * @param {{ ranges?: Array<{ from: number, to: number, type: string }> }} [map]
 */
export function stampOneQuestionTypeFromSectionMap(q, raw, map) {
  if (!q || typeof q !== 'object' || q.placeholder === true) return q
  if (q.typeSource === 'admin_facts') return q
  const sectionMap = map && Array.isArray(map.ranges) ? map : parsePaperSectionMap(raw)
  const n = printedQuestionNumber(q)
  const mapped = n ? sectionTypeForPrintedNumber(sectionMap, n) : null
  const bodyMcq = cardHasRealMcqOptions(q)
  const stem = String(q.text ?? q.stem ?? '')
  const blank = looksLikeNumericalFillBlank(stem)

  let nextType = mapped
  let warning
  // Instruction NVQ / integer + fill-blank body wins over leaked marking-scheme "options".
  if (mapped && NVQ_TYPES.has(mapped) && blank) {
    nextType = mapped
  } else if (mapped && NVQ_TYPES.has(mapped) && bodyMcq >= 2) {
    nextType =
      q.questionType && MCQ_TYPES.has(String(q.questionType)) ? q.questionType : 'single_correct'
    warning =
      'Instruction said ' + mapped + ' for Q.' + n + ' but Mathpix has (A)-(D). Kept the printed options.'
  } else if (mapped && MCQ_TYPES.has(mapped) && bodyMcq >= 2) {
    // Instruction SCQ/MSQ + real options win over a blank-looking stem.
    nextType = mapped
  } else if (mapped && MCQ_TYPES.has(mapped) && bodyMcq < 2 && blank) {
    nextType = 'numerical'
    warning =
      'Instruction said ' + mapped + ' for Q.' + n + ' but Mathpix is a blank. Kept NVQ.'
  } else if (!mapped && looksLikePassageChildCard(q) && bodyMcq < 2 && blank) {
    nextType = 'numerical'
  }

  if (!nextType) return q

  const wipeOpts = NVQ_TYPES.has(nextType) && (blank || bodyMcq < 2)
  const options = wipeOpts ? EMPTY_OPTS.slice() : q.options
  if (q.questionType === nextType && !wipeOpts && !warning) return q
  return {
    ...q,
    questionType: nextType,
    options: Array.isArray(options) ? options : q.options,
    typeSource: mapped ? 'paper_instruction' : q.typeSource || 'passage_blank',
    typeConflictWarning: warning || q.typeConflictWarning,
  }
}

/**
 * @param {unknown[]} questions
 * @param {unknown} raw
 * @param {{ ranges?: Array<{ from: number, to: number, type: string }> }} [map]
 */
export function stampQuestionTypesFromSectionMap(questions, raw, map) {
  const list = Array.isArray(questions) ? questions : []
  const sectionMap = map && Array.isArray(map.ranges) ? map : parsePaperSectionMap(raw)
  return list.map((q) => stampOneQuestionTypeFromSectionMap(q, raw, sectionMap))
}

/**
 * Fill subject meta from the paper (headers or SECTION 1 cycles). Never invent
 * a question. Leaves subject blank when the paper does not support a call.
 * Uses sequential slot (questionNumber / pyqSlot), not repeating printed Q.1.
 * @param {unknown[]} questions
 * @param {unknown} raw
 * @param {{ subjectRanges?: Array<{ from: number, to: number, subject: string, source: string }> }} [map]
 */
export function stampSubjectsFromPaper(questions, raw, map) {
  const list = Array.isArray(questions) ? questions : []
  // Printed Q.1 restarts (each subject) beat OCR unique-count windows, which drop the last card.
  let ranges = stampSubjectRangesFromCardResets(list, '')
  if (ranges.length < 2) {
    const sectionMap = map && Array.isArray(map.subjectRanges) ? map : parsePaperSectionMap(raw)
    ranges = Array.isArray(sectionMap.subjectRanges) ? sectionMap.subjectRanges.slice() : []
  }
  if (!ranges.length) {
    ranges = stampSubjectRangesFromCardResets(list, raw)
  }
  if (!ranges.length) return list
  const last = ranges[ranges.length - 1]
  if (last && last.to < list.length) {
    ranges = ranges.slice(0, -1).concat([{ ...last, to: list.length }])
  }
  return list.map((q, i) => {
    if (!q || typeof q !== 'object' || q.placeholder === true) return q
    if (q.subjectSource === 'admin_facts') return q
    const seq = Number(q.questionNumber ?? q.pyqSlot ?? i + 1)
    const n = Number.isFinite(seq) && seq > 0 ? seq : i + 1
    const hit = ranges.find((r) => r.subject && n >= r.from && n <= r.to)
    if (!hit) return q
    return {
      ...q,
      subject: hit.subject,
      subjectSource: hit.source || 'paper',
    }
  })
}

/** When printed Q numbers restart (Math / Physics / Chem each start at Q.1). */
function stampSubjectRangesFromCardResets(questions, raw) {
  const list = Array.isArray(questions) ? questions : []
  /** @type {Array<{ from: number, to: number, blob: string }>} */
  const groups = []
  let startIdx = 0
  let prevPrinted = 0
  for (let i = 0; i < list.length; i += 1) {
    const p = printedQuestionNumber(list[i])
    if (i > startIdx && p > 0 && prevPrinted >= 2 && p === 1) {
      groups.push({
        from: startIdx + 1,
        to: i,
        blob: list.slice(startIdx, i).map((q) => String(q?.text ?? '')).join('\n'),
      })
      startIdx = i
    }
    if (p > 0) prevPrinted = p
  }
  if (startIdx < list.length) {
    groups.push({
      from: startIdx + 1,
      to: list.length,
      blob: list.slice(startIdx).map((q) => String(q?.text ?? '')).join('\n'),
    })
  }
  if (groups.length < 2) return []
  const tagged = groups.map((g) => ({
    from: g.from,
    to: g.to,
    subject: inferSubjectFromPaperBlob(g.blob),
    source: 'printed_reset',
  }))
  const used = tagged.map((r) => r.subject).filter(Boolean)
  const pcm = ['physics', 'chemistry', 'mathematics']
  if (tagged.length === 3 && used.filter(Boolean).length === 2) {
    const leftover = pcm.find((s) => !used.includes(s))
    const weak = tagged.find((r) => !r.subject)
    if (leftover && weak) {
      weak.subject = leftover
      weak.source = 'section_cycle_remainder'
    }
  }
  return tagged.filter((r) => r.subject)
}
