/**
 * Passage / sub-question text hygiene — single source of truth.
 * Rules: `.cursor/rules/question-upload-pipeline.mdc` · Tests: `npm run test:regression`
 *
 * Official PYQ attach: default is NO passage. A card receives a paragraph
 * only when its printed number sits in a parsed child range (section map
 * or "Paragraph for Questions N and M"). Leftover passageId is not permission.
 */

import {
  looksLikeNumericalFillBlank,
  parsePaperSectionMap,
  passageRangeContains,
} from './parsePaperSectionMap.js'

/** First line that starts a sub-question stem (shared by trim + OCR preprocess). */
export const SUB_QUESTION_STEM_OPENER_RE =
  /(?:^|\n)\s*(?:(?:\d{1,2}[\.\)]\s+)|(?:Q\.?\s*\d{1,2}[\.\)\:\-\s]+))?(?:Consider\s+the\s+(?:quadratic\s+)?(?:expression|following|circuit|data|graph|figure|passage|arrangement)|Let\s+|If\s+(?:Distance|wind|the\s+mass|both\s+)|Partial\s+pressure\s+of|In\s+final\s+conditions|The\s+(?:value|number)\s+of|What\s+is\s+the|How\s+(?:many|much)\s+|Which\s+of\s+the\s+following|At\s+what|Find\s+the(?:\s+value)?|Calculate\s+the|Determine\s+the|Compute\s+the|Estimate\s+the|Value\s+of)\b/i

/** Remove OCR tail that repeats the passage opening after "Answer the following questions". */
function stripTrailingPassageRepeat(p) {
  const answers = [...p.matchAll(/\banswer\s+the\s+following\s+questions?\s*:?\s*/gi)]
  if (answers.length >= 2 && answers[1].index != null) {
    return p.slice(0, answers[1].index).trim()
  }
  const answer = answers[0]
  if (!answer || answer.index == null) return p
  const head = p.slice(0, answer.index + answer[0].length).trim()
  const tail = p.slice(answer.index + answer[0].length).trim()
  if (!tail || head.length < 50) return p
  const opener = head.slice(0, Math.min(72, head.length)).replace(/\s+/g, ' ')
  const tailNorm = tail.replace(/\s+/g, ' ')
  if (tailNorm.includes(opener.slice(0, Math.min(48, opener.length)))) return head
  return p
}

/** Inline stems when OCR has no newline before "What is the…" / "Find the…". */
const INLINE_SUB_STEM_RE =
  /\b(?:What\s+is\s+the|Find\s+the(?:\s+value)?|Calculate\s+the|Determine\s+the|Compute\s+the|Estimate\s+the|Value\s+of)\b/gi

/** @param {string} text */
export function findFirstSubQuestionStemIndex(text) {
  const t = String(text ?? '')
  const answer = t.match(/\banswer\s+the\s+following\s+questions?\s*:?\s*/i)
  const afterAnswer = answer?.index != null ? answer.index + answer[0].length : 0
  const tail = t.slice(afterAnswer)
  const valueInTail = tail.search(/\bValue\s+of\b/i)
  if (valueInTail >= 0) return afterAnswer + valueInTail

  const lineStart = t.search(SUB_QUESTION_STEM_OPENER_RE)
  let inline = -1
  INLINE_SUB_STEM_RE.lastIndex = 0
  let m
  while ((m = INLINE_SUB_STEM_RE.exec(t)) !== null) {
    if (m.index >= Math.max(40, afterAnswer)) {
      inline = m.index
      break
    }
  }
  const considerAtStart =
    lineStart === 0 && /^\s*Consider\s+the\s+(?:quadratic\s+)?(?:expression|following|circuit|data|graph|figure|passage|arrangement)\b/i.test(t)
  const effectiveLineStart = considerAtStart ? -1 : lineStart
  if (effectiveLineStart >= 0 && inline >= 0) return Math.min(effectiveLineStart, inline)
  if (effectiveLineStart >= 0) return effectiveLineStart
  return inline
}

/** @param {string} s */
export function normalizeStemCompare(s) {
  return String(s ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\$|\\[()[\]{}^_]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** ONNX / PDF footer junk fused onto the last PIVQ stem after "then find". */
const STEM_TAIL_JUNK_START =
  /(?:\*?\s*\[\d{1,3}\]\s+A\s*\.|##\s*\d+\s+Introduction\b|\bIntroduction\s+The\s+_|\\mathbf\{\\Phi\}|_Fractional\s+State_|\d+\^\\circ\\mathbf)/i

/**
 * Strip citation headers, ONNX garbage, and document tails from a sub-question stem.
 * @param {string} text
 */
export function stripOcrStemTailJunk(text) {
  let t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!t) return t

  t = t.replace(
    /\s+A\s+ah\s+ad\s+\$?\d+\^\\circ\$?\s*[\d]*m?\s*\[[\d\s]+m!?\s*s\^?\d\s*©\s*S\s*=\s*\d+\s*[-–]?/gi,
    '',
  )
  t = t.replace(/\s+[\d]{2,4}m!\s*s\^?\d\s*©\s*S\s*=\s*\d+\s*[-–]?\s*/gi, ' ')

  const junkAt = t.search(STEM_TAIL_JUNK_START)
  if (junkAt > 30) t = t.slice(0, junkAt).trim()

  t = t
    .replace(
      /(\b(?:then\s+find|then\s+the\s+value(?:\s+[^.]{0,120})?)\s*\.?)\s+(?:\d+\^|\\mathrm\{|\\mathbf\{|g\s*\{=|\*?\s*\[).*/is,
      '$1',
    )
    .trim()

  t = t.replace(/\s*[#*]{1,2}\s*\d+\s+Introduction[\s\S]*$/i, '').trim()
  t = t.replace(/\s+The\s+_Fractional\s+State_[\s\S]*$/i, '').trim()

  return t
}

/** True when sub-question wording already appears in the passage block. */
export function stemAlreadyInPassage(subText, passageText) {
  const sub = normalizeStemCompare(subText)
  const pass = normalizeStemCompare(passageText)
  if (!sub || sub.length < 10 || !pass) return false
  if (pass.includes(sub)) return true
  const subCore = sub
    .replace(
      /^(?:what is the|find the|calculate the|determine the|compute the|estimate the|how many|how much|which of the following|at what|value of)\s+/i,
      '',
    )
    .trim()
  if (subCore.length >= 8 && pass.includes(subCore)) return true
  /** Do not treat a full passage block as a duplicate of a sub-stem via token overlap (e.g. shared N_p, S_p). */
  if (pass.length > sub.length * 2.5 && pass.length > 180) {
    return false
  }
  const tokens = subCore.split(/\s+/).filter((w) => w.length > 3)
  if (tokens.length >= 2) {
    const hits = tokens.filter((tok) => pass.includes(tok)).length
    if (hits >= Math.max(2, Math.ceil(tokens.length * 0.75))) return true
  }
  const passCore = pass.replace(
    /^(?:what is the|find the|calculate the|determine the|compute the|estimate the)\s+/i,
    '',
  )
  if (subCore.length >= 8 && subCore === passCore) return true
  return false
}

/**
 * Passage body only — strip sub-question stems that leaked into passageText.
 * @param {string} text
 */
export function trimPassageBodyText(text) {
  let p = stripTrailingPassageRepeat(String(text ?? '').replace(/\r\n/g, '\n').trim())
  if (!p) return p
  p = p.replace(/^\s*(?:XII|XI|VIII|VII|VI|IV|IX|III|II|I|V|X)\s*[”"']\s*/i, '')

  const subStart = findFirstSubQuestionStemIndex(p)
  if (subStart > 40) p = p.slice(0, subStart).trim()

  const answer = p.match(/\banswer\s+the\s+following\s+questions?\s*:?\s*/i)
  if (answer && answer.index != null) {
    p = p.slice(0, answer.index + answer[0].length).trim()
  }
  return p
}

/**
 * Remove sub-question lines that leaked into the passage (uses all sub-stems).
 * @param {string} passageText
 * @param {string[]} [subStems]
 */
export function stripSubStemsFromPassageBody(passageText, subStems = []) {
  let p = trimPassageBodyText(passageText)
  if (!p) return p

  const stems = (subStems ?? []).map((s) => String(s ?? '').trim()).filter((s) => s.length >= 8)
  if (!stems.length) return p

  const lines = p.split(/\n+/)
  const kept = lines.filter((line) => {
    const ln = line.trim()
    if (!ln || ln.length < 8) return !!ln
    return !stems.some((stem) => stemAlreadyInPassage(ln, stem) || stemAlreadyInPassage(stem, ln))
  })
  p = kept.join('\n').trim() || p

  for (const stem of stems) {
    const idx = p.toLowerCase().indexOf(stem.toLowerCase().slice(0, Math.min(40, stem.length)))
    if (idx >= 40) p = p.slice(0, idx).trim()
  }

  const subStart = findFirstSubQuestionStemIndex(p)
  if (subStart > 40) p = p.slice(0, subStart).trim()

  return trimPassageBodyText(p)
}

/**
 * Sub-question stem for display — may return '' when wording is only in the passage.
 * @param {string} subText
 * @param {string} [passageText]
 */
/**
 * @param {string} subText
 * @param {string} [passageText] — use raw parent passage (not getPassageText trimmed) for dup detection
 */
/** Stem has its own equation (summation, fraction, etc.) — always show in preview. */
function stemHasDistinctMath(t) {
  return /\\sum|\\frac|\\infty|_\{|\\left|\\right|\^[\{(]|∑|Σ/.test(String(t ?? ''))
}

export function passageSubQuestionDisplayText(subText, passageText = '') {
  let t = stripOcrStemTailJunk(String(subText ?? '').replace(/\r\n/g, '\n').trim())
  const passageRaw = String(passageText ?? '').replace(/\r\n/g, '\n').trim()
  const passage = passageRaw
  if (!t) return t

  if (passage && t.length > passage.length * 0.85 && t.includes(passage.slice(0, Math.min(60, passage.length)))) {
    t = t.slice(passage.length).trim()
  }
  t = t.replace(/^Answer\s+the\s+following\s+questions?\s*:?\s*/i, '').trim()
  if (passage) {
    const again = t.indexOf(passage.slice(0, Math.min(80, passage.length)))
    if (again === 0) t = t.slice(passage.length).trim()
  }
  if (stemHasDistinctMath(t)) return t

  const passageForDup = passageRaw || passage
  if (passageForDup) {
    const lines = t.split(/\n+/).map((ln) => ln.trim()).filter(Boolean)
    if (lines.length > 1) {
      const kept = lines.filter((ln) => !stemAlreadyInPassage(ln, passageForDup))
      if (kept.length) t = kept.join('\n')
    }
    if (stemAlreadyInPassage(t, passageForDup)) return ''
  }
  return t
}

/**
 * Bank storage: strip passage prefix leaks but keep stem even if it repeats in passage (for editing).
 * @param {string} subText
 * @param {string} [passageText]
 */
export function sanitizePassageSubStemForStorage(subText, passageText = '') {
  const raw = stripOcrStemTailJunk(String(subText ?? '').replace(/\r\n/g, '\n').trim())
  if (!raw) return raw
  const displayed = passageSubQuestionDisplayText(raw, passageText)
  return displayed.trim() ? displayed : raw
}

/**
 * Canonical cleanup after OCR split or before save — passage body + sub-stems never duplicate.
 * @param {{ passageText?: string, subQuestions?: { text?: string, [key: string]: unknown }[] }} bundle
 */
export function sanitizePassageBundle(bundle) {
  if (!bundle?.subQuestions?.length) {
    return {
      ...bundle,
      passageText: trimPassageBodyText(bundle?.passageText ?? ''),
    }
  }
  const subQuestions = bundle.subQuestions.map((sq) => ({
    ...sq,
    text: sanitizePassageSubStemForStorage(sq.text, bundle.passageText),
  }))
  const stems = subQuestions.map((sq) => sq.text).filter(Boolean)
  const passageText = stripSubStemsFromPassageBody(bundle.passageText ?? '', stems)
  return { ...bundle, passageText, subQuestions }
}

/**
 * Full passage + sub-question text for the OCR paste box (editable LaTeX source).
 * @param {{ passageText?: string, subQuestions?: { text?: string }[] }} bundle
 */
export function formatPassageBundleAsText(bundle) {
  if (!bundle) return ''
  const passage = String(bundle.passageText ?? '').trim()
  const subs = (bundle.subQuestions ?? [])
    .map((sq, i) => {
      const stem = String(sq?.text ?? '').trim()
      return stem ? `${i + 1}. ${stem}` : ''
    })
    .filter(Boolean)
  return [passage, ...subs].filter(Boolean).join('\n\n')
}

/** Shared passage needs a diagram (not text-only algebra passages). */
export function passageLikelyNeedsSharedDiagram(text) {
  const p = String(text ?? '').trim()
  if (!p) return false

  if (
    /\b(?:as\s+shown(?:\s+(?:above|below|in\s+(?:the\s+)?(?:figure|diagram|graph)))?|shown\s+in\s+the\s+figure|see\s+(?:the\s+)?(?:graph|figure|diagram)|(?:in\s+the\s+)?(?:figure|diagram)\s+(?:shown|below|above)|circuit\s+shown)\b/i.test(
      p,
    )
  ) {
    return true
  }

  if (/\b(?:the\s+)?plot\s+of\b/i.test(p)) return true
  if (/\b(?:graph|plot|diagram|figure|sketch)\s+of\b/i.test(p)) return true
  if (
    /\b(?:plot|graph|diagram|figure|sketch|curve)\b/i.test(p) &&
    /\b(?:shown\s+below|shown\s+above|is\s+shown|are\s+shown|given\s+below|see\s+below)\b/i.test(
      p,
    )
  ) {
    return true
  }
  if (
    /\b(?:density|pressure|temperature|volume|entropy)\s+vs\.?\s+(?:density|pressure|temperature|volume|entropy)\b/i.test(
      p,
    )
  ) {
    return true
  }

  return false
}

/** Passage body already has a multi-row LaTeX table — skip redundant diagram crop. */
export function passageHasTypesetArrayTable(passageText) {
  const p = String(passageText ?? '')
  if (/\\begin\{array\}/.test(p) && /\\\\/.test(p)) return true
  if ((p.match(/\\frac\{/g) ?? []).length >= 4 && /\b(?:row|I{1,3}(?:st|nd)|and so on)\b/i.test(p)) {
    return true
  }
  return false
}

export function shouldShowPassageImageInViewer(q, passageText = '') {
  if (!q?.passageImage?.trim()) return false
  const body = passageText || q.passageText || ''
  if (!passageLikelyNeedsSharedDiagram(body)) return false
  if (passageHasTypesetArrayTable(body)) return false
  return true
}

/**
 * When false, only the image is shown (legacy: hide text if image already contains OCR).
 * That caused a loop: full-page shots hid the trimmed passage and left duplicate text in the image.
 */
export function shouldShowPassageTextBesideImage(q, passageText = '') {
  if (!q?.passageImage?.trim()) return true
  if (q.passageImageCrop) return true
  const body = String(passageText || q.passageText || '').trim()
  if (passageLikelyNeedsSharedDiagram(body)) return true
  return body.length < 90
}

/** Untrimmed passage from parent row or linked parent id. */
export function getPassageRawText(q, all) {
  if (q.passageText) return q.passageText
  if (q.passageId) {
    const parent = all.find((x) => x.id === q.passageId)
    return parent?.passageText ?? null
  }
  return null
}

/** @param {import('../data/tests').Question} q @param {import('../data/tests').Question[]} all */
function collectPassageSubStems(q, all) {
  const parentId = q.passageText ? q.id : q.passageId
  if (!parentId) return all.filter((x) => x.passageId === q.id).map((x) => x.text).filter(Boolean)
  return all
    .filter((x) => x.passageId === parentId)
    .map((x) => x.text)
    .filter(Boolean)
}

/** Passage for display — never includes sub-question stems. */
export function getPassageText(q, all) {
  const raw = getPassageRawText(q, all)
  if (!raw) return null
  const stems = collectPassageSubStems(q, all)
  return stripSubStemsFromPassageBody(raw, stems)
}

export function getPassageDiagramUrl(q, all) {
  if (q.passageImage) return q.passageImage
  if (!q.passageId) return null
  const parent = all.find((x) => x.id === q.passageId)
  return parent?.passageImage ?? null
}

export function getPassageImage(q, all) {
  if (q.passageImage) return q.passageImage
  if (q.passageText) return q.passageImage ?? null
  if (q.passageId) return getPassageDiagramUrl(q, all)
  return null
}

export function shouldShowPassageDiagram(q) {
  return !!(q?.passageText && q?.passageImage)
}

export function isPassageLinkedQuestion(q) {
  return !!(q?.passageText || q?.passageId)
}

/**
 * Normalize passage rows on load/save — trim passage body, never wipe sub-stems from bank.
 * @param {import('../data/tests').Question} q
 * @param {import('../data/tests').Question[]} [all]
 */
export function normalizePassageQuestionStorage(q, all = []) {
  if (!q) return q
  const bank = all.length ? all : [q]
  const out = { ...q }

  if (out.passageId) {
    delete out.questionImage
    delete out.passageImage
    delete out.optionsImage
    delete out.optionImages
    const parent = bank.find((x) => x.id === out.passageId)
    const parentMeta = parent?.questionType
    if (parentMeta === 'passage_integer') {
      out.questionType = 'passage_integer'
    } else if (parentMeta === 'passage_scq' || parentMeta === 'passage') {
      out.questionType = 'passage_scq'
    }
    if (out.text?.trim() && parent?.passageText) {
      out.text = sanitizePassageSubStemForStorage(out.text, parent.passageText)
    }
    return out
  }

  if (out.passageText) {
    const childStems = bank.filter((x) => x.passageId === out.id).map((x) => x.text).filter(Boolean)
    out.passageText = stripSubStemsFromPassageBody(out.passageText, childStems)
    const diagram = out.passageImage || out.questionImage || undefined
    const needsDiagram = passageLikelyNeedsSharedDiagram(out.passageText)
    delete out.questionImage
    delete out.optionsImage
    delete out.optionImages
    if (diagram && needsDiagram) {
      out.passageImage = diagram
    } else {
      delete out.passageImage
      delete out.passageImageCrop
    }
    if (out.text?.trim()) {
      out.text = sanitizePassageSubStemForStorage(out.text, out.passageText)
    }
    return out
  }

  return q
}

export function getPassageParentId(q) {
  if (q?.passageText) return q.id ?? null
  if (q?.passageId) return q.passageId
  return null
}

export function getPassageSetQuestions(q, all) {
  const parentId = getPassageParentId(q)
  if (!parentId) return null
  const parent = all.find((x) => x.id === parentId)
  if (!parent) return null
  const children = all.filter((x) => x.passageId === parentId)
  const ordered = [parent, ...children].sort(
    (a, b) => all.findIndex((x) => x.id === a.id) - all.findIndex((x) => x.id === b.id),
  )
  return ordered
}

export function getAnswerableQuestions(questions) {
  return questions.filter((q) => !q.isPassageHeader)
}

/** JEE Advanced Paper 2: "Paragraph for Questions 5 and 6" / PARAGRAPH "I" / Passage: */
/** 2026 Paper 2 Section IV: "Question Stem for Question Nos. 17 and 18". */
const PYQ_QUESTION_STEM_HEADER =
  '(?:\\\\section\\*?\\{\\s*)?Question\\s+Stem\\s+for\\s+Question\\s+Nos?\\.?\\s*\\d{1,3}(?:\\s*(?:,|and)\\s*\\d{1,3})*\\}?'

export const PYQ_PARAGRAPH_HEADER_RE =
  new RegExp(
    `(?:^|\\n)\\s*(?:\\\\section\\*?\\{[^}]*PARAGRAPH|[“"'"]*PARAGRAPH\\s*[“"'"]?(?:XII|XI|VIII|VII|VI|IV|IX|III|II|I|V|X|\\d+)|Paragraph\\s+for\\s+(?:Questions?|Q\\.?)\\s*\\d|(?:Passage|Comprehension)\\s*:)|${PYQ_QUESTION_STEM_HEADER}`,
    'i',
  )

const PYQ_PARAGRAPH_HEADER_LINE_RE = new RegExp(
  `^\\s*(?:(?:\\\\item\\s*\\[\\s*Q[^\\]]*\\]\\s*|Q\\s*\\.?\\s*)\\d{1,3}\\s+)?(?:\\\\section\\*?\\{[^}]*PARAGRAPH[^}]*\\}|[“"'"]*PARAGRAPH\\s*[“"'"]?(?:XII|XI|VIII|VII|VI|IV|IX|III|II|I|V|X|\\d+)[”"']?|Paragraph\\s+for\\s+(?:Questions?|Q\\.?)\\s*([\\d,\\s]+(?:and\\s+\\d+)?)|(?:Passage|Comprehension)\\s*:|${PYQ_QUESTION_STEM_HEADER})`,
  'i',
)

const PYQ_PARAGRAPH_CUT_RE = new RegExp(
  `(?:\\n)\\s*(?:\\\\section\\*?\\{[^}]*PARAGRAPH|[“"'"]*PARAGRAPH\\s*[“"'"]?(?:XII|XI|VIII|VII|VI|IV|IX|III|II|I|V|X|\\d+)|Paragraph\\s+for\\s+(?:Questions?|Q\\.?)\\s*\\d|(?:Passage|Comprehension)\\s*:)|${PYQ_QUESTION_STEM_HEADER}`,
  'i',
)

/** JEE Advanced 2024 Paper 2 comprehension pairs (printed numbers). */
export const OFFICIAL_PYQ_PASSAGE_PAIRS = [
  [14, 15],
  [16, 17],
  [31, 32],
  [33, 34],
  [48, 49],
  [50, 51],
]

function lastParagraphHeaderIndex(text) {
  const t = String(text ?? '')
  const re = new RegExp(PYQ_PARAGRAPH_HEADER_RE.source, 'gi')
  let last = -1
  let m
  while ((m = re.exec(t)) !== null) {
    last = m[0].startsWith('\n') ? m.index + 1 : m.index
  }
  return last
}

function questionMarkerIndex(text, n) {
  const t = String(text ?? '')
  const num = Number(n)
  if (!Number.isFinite(num) || num < 1) return -1
  const re = new RegExp(
    `(?:\\\\item\\s*\\[\\s*Q[^\\]]*\\]\\s*|Q\\s*\\.?\\s*)${num}\\b`,
    'i',
  )
  const m = t.match(re)
  return m && m.index != null ? m.index : -1
}

function firstTwoQuestionNums(text) {
  const found = [...String(text ?? '').matchAll(/(?:\\item\s*\[\s*Q[^\]]*\]\s*|Q\s*\.?\s*)(\d{1,3})\b/gi)]
    .map((x) => Number(x[1]))
    .filter((n) => Number.isFinite(n) && n > 0 && n < 200)
  const uniq = []
  for (const n of found) {
    if (!uniq.includes(n)) uniq.push(n)
    if (uniq.length >= 2) break
  }
  return uniq
}

function officialPyqPrintedNumber(q) {
  const n = Number(q?.printedNumber || q?.questionNumber || q?.pyqSlot)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function rangeToNums(range) {
  const from = Number(range?.from)
  const to = Number(range?.to)
  if (!from || !to || to < from || to - from > 20) return []
  const nums = []
  for (let n = from; n <= to; n += 1) nums.push(n)
  return nums
}

/**
 * Child ranges from RAW instructions / paragraph headers. Not a paper-year list.
 * @param {unknown} source
 * @param {{ passageRanges?: Array<{ from: number, to: number }> }} [map]
 */
export function officialPyqPassageRanges(source, map) {
  const src = String(source ?? '')
  const sectionMap =
    map && Array.isArray(map.passageRanges)
      ? map
      : src.length >= 40
        ? parsePaperSectionMap(src)
        : { passageRanges: [] }
  const isTightChildRange = (from, to) =>
    from > 0 && to >= from && to - from <= 3 && to < 80
  const fromMap = (sectionMap.passageRanges || [])
    .map((r) => ({ from: Number(r.from), to: Number(r.to), source: r.source || '' }))
    .filter((r) => isTightChildRange(r.from, r.to))
  const fromOcr = extractOfficialPyqParagraphsFromOcr(src)
    .map((p) => {
      const nums = (p.nums || []).filter((n) => n > 0 && n < 80)
      if (!nums.length) return null
      const from = Math.min(...nums)
      const to = Math.max(...nums)
      if (!isTightChildRange(from, to)) return null
      return { from, to, source: '' }
    })
    .filter(Boolean)
  const merged = []
  for (const row of [...fromMap, ...fromOcr].sort((a, b) => a.from - b.from || a.to - b.to)) {
    if (merged.some((r) => r.from === row.from && r.to === row.to)) continue
    merged.push(row)
  }
  return merged
}

function printedNumberInPassageRange(n, source, map) {
  if (!n) return false
  if (map && passageRangeContains(map, n)) return true
  return officialPyqPassageRanges(source, map).some((r) => n >= r.from && n <= r.to)
}

/** True when the paper itself prints "Paragraph for Questions X and Y" covering n. */
function passageHeadingNamesNumber(n, source) {
  if (!n) return false
  const re = /Paragraph\s+for\s+Q(?:uestions?|\.)?\s*(?:Nos?\.?\s*)?(\d{1,3})\s*(?:and|&|\\&|,|to|-|–)\s*(?:Q\.?\s*)?(\d{1,3})/gi
  for (const m of String(source ?? '').matchAll(re)) {
    const from = Number(m[1])
    const to = Number(m[2])
    if (to >= from && to - from <= 3 && n >= from && n <= to) return true
  }
  return false
}

/**
 * True when a long MCQ reused a comprehension slot number (must not keep a paragraph).
 * Short child stems ("Value of…", "If n(X)…", fill-blanks) stay eligible.
 */
function looksLikeStandaloneMcqOnChildSlot(text, options) {
  const t = String(text ?? '').trim()
  if (!t) return false
  if (looksLikePyqParagraphChildStem(t) || looksLikeNumericalFillBlank(t)) return false
  const filled = (Array.isArray(options) ? options : []).filter((o) => String(o ?? '').trim()).length
  if (/\(\s*A\s*\)[\s\S]{4,}\(\s*B\s*\)/.test(t)) return true
  // Ignore figure URLs when measuring stem length — long Mathpix paths are not MCQ prose.
  const proseLen = t
    .replace(/\\includegraphics\s*(?:\[[^\]]*\])?\s*\{[^}]*\}/gi, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().length
  // Long MCQ stem with A–D choices on a child slot (not a short "Value of…" child).
  if (filled >= 2 && proseLen > 120) return true
  return false
}

/**
 * A passage attaches only when the printed number is in a parsed child range.
 * Default is no. Leftover passageId / passageText is not permission — a full
 * MCQ that reused a child slot number must not keep a foreign paragraph.
 * @param {object} q
 * @param {unknown} [source]
 * @param {{ passageRanges?: Array<{ from: number, to: number }> }} [map]
 */
export function officialPyqCardAllowsPassage(q, source = '', map) {
  if (!q || typeof q !== 'object') return false
  if (q.passageSource === 'ocr-header' && String(q.passageText || '').trim()) return true
  const n = officialPyqPrintedNumber(q)
  if (!n) return false
  if (!printedNumberInPassageRange(n, source, map)) return false
  if (passageHeadingNamesNumber(n, source)) return true
  if (looksLikeStandaloneMcqOnChildSlot(q.text ?? q.stem, q.options)) return false
  return true
}

function clearMistakenPassage(q) {
  if (!q || typeof q !== 'object') return q
  if (passageSetByAdmin(q)) return q
  if (!q.passageText && !q.passageId && !q.passageGroup && q.passageRole !== 'comprehension_child') {
    return q
  }
  const { passageText, passageId, passageGroup, passageRole, ...rest } = q
  return rest
}

/**
 * True when a leftover passage sits on a standalone (Q3 Paragraph I leak).
 * @param {object} q
 * @param {unknown} [source]
 */
export function officialPyqCardHasMistakenPassage(q, source = '') {
  if (!q || typeof q !== 'object') return false
  if (passageSetByAdmin(q)) return false
  if (!String(q.passageText ?? '').trim() && !q.passageId && q.passageRole !== 'comprehension_child') {
    return false
  }
  if (String(source ?? '').length < 40) return false
  if (q.passageSource === 'ocr-header' && String(q.passageText ?? '').trim()) return false
  return !officialPyqCardAllowsPassage(
    {
      ...q,
      passageText: '',
      passageId: undefined,
      passageGroup: undefined,
      passageRole: undefined,
    },
    source,
  )
}

/** @param {unknown[]} questions @param {unknown} [source] */
export function officialPyqQuestionsHaveMistakenPassages(questions, source = '') {
  return (Array.isArray(questions) ? questions : []).some((q) =>
    officialPyqCardHasMistakenPassage(q, source),
  )
}

/** @param {unknown[]} questions @param {unknown} [source] */
export function stripMistakenOfficialPyqPassages(questions, source = '') {
  return (Array.isArray(questions) ? questions : []).map((q) =>
    officialPyqCardHasMistakenPassage(q, source) ? clearMistakenPassage(q) : q,
  )
}

/**
 * Paragraph blocks already in the OCR dump. Never invents sentences.
 * Question numbers come from "Paragraph for Questions N and M" or the two
 * items right after the "question given below" cue — not the first Q.1/Q.2
 * in a 4000-character window.
 * @param {unknown} raw
 * @returns {{ nums: number[], passageText: string, group: string }[]}
 */
export function extractOfficialPyqParagraphsFromOcr(raw) {
  const t = String(raw ?? '')
  if (t.length < 40) return []
  const re = new RegExp(PYQ_PARAGRAPH_HEADER_RE.source, 'gi')
  const starts = []
  let m
  while ((m = re.exec(t)) !== null) {
    starts.push(m[0].startsWith('\n') ? m.index + 1 : m.index)
  }
  const out = []
  for (let i = 0; i < starts.length; i++) {
    const chunk = t.slice(starts[i], starts[i + 1] ?? Math.min(t.length, starts[i] + 4000))
    const peeled = peelOfficialPyqParagraph(chunk)
    if (!peeled.passageText) continue
    const headerNums = Array.isArray(peeled.nums) ? peeled.nums.filter((n) => n > 0) : []
    let nums = headerNums.slice()
    if (!nums.length) {
      // Only the next 2 (or 3) Q markers after this paragraph — never every
      // Q.n in a long window (that glued one math paragraph onto Q8–Q13).
      const childN = /three questions/i.test(chunk.slice(0, 900)) ? 3 : 2
      const cue = chunk.search(
        /\b(?:the question given below is one of them|answer the following questions?)\b/i,
      )
      const from = cue >= 0 ? chunk.slice(cue) : chunk
      const found = [
        ...String(from).matchAll(/(?:\\item\s*\[\s*Q[^\]]*\]\s*|Q\s*\.?\s*)(\d{1,2})\b/gi),
      ]
        .map((x) => Number(x[1]))
        .filter((n) => Number.isFinite(n) && n > 0 && n < 80)
      const uniq = []
      for (const n of found) {
        if (!uniq.includes(n)) uniq.push(n)
        if (uniq.length >= childN) break
      }
      const inferred = uniq.length ? uniq : firstTwoQuestionNums(from).slice(0, childN)
      const bodyOf = (n) => {
        const re = new RegExp(
          `(?:\\\\item\\s*\\[\\s*Q[^\\]]*\\]\\s*|Q\\s*\\.?\\s*)${n}\\b`,
          'i',
        )
        const hit = chunk.match(re)
        if (!hit || hit.index == null) return ''
        const rest = chunk.slice(hit.index + hit[0].length)
        const next = rest.search(/(?:\\item\s*\[\s*Q[^\]]*\]\s*|Q\s*\.?\s*)\d{1,3}\b/i)
        return next >= 0 ? rest.slice(0, next) : rest
      }
      const kept = inferred.filter((n) => !/(\(\s*A\s*\))[\s\S]{4,}(\(\s*B\s*\))/.test(bodyOf(n)))
      const fillOk = kept.some((n) => looksLikeNumericalFillBlank(bodyOf(n)))
      // Keep the short child list when any child is a fill-blank, or when the
      // paragraph cue itself says the answers are numerical values.
      const sectionSaysNumerical = /\bNUMERICAL\s+VALUE\b/i.test(chunk.slice(0, 900))
      nums = fillOk || sectionSaysNumerical || kept.length === childN ? kept.slice(0, childN) : []
      if (nums.length >= 2 && nums[nums.length - 1] - nums[0] > 3) {
        nums = nums.slice(0, 1)
      }
    }
    out.push({
      nums,
      passageText: stripOfficialPyqPaperChrome(peeled.passageText),
      group: peeled.group || passageGroupId(nums, peeled.passageText),
    })
  }
  return out
}

/**
 * If the card lost its paragraph, copy it back from the OCR dump only.
 * @param {object} q
 * @param {unknown} source
 */
export function recoverOfficialPyqPassageFromSource(q, source) {
  if (!q || typeof q !== 'object') return q
  if (passageSetByAdmin(q)) return q
  const stored = stripOfficialPyqPaperChrome(q.passageText)
  if (q.passageSource === 'ocr-header' && stored) {
    return stored === String(q.passageText ?? '').trim() ? q : { ...q, passageText: stored }
  }
  const blob = `${q.text || ''} ${q.subject || ''} ${stored}`
  const src = String(source ?? '')
  const allowsBySlot = officialPyqCardAllowsPassage(
    {
      ...q,
      passageText: '',
      passageId: undefined,
      passageGroup: undefined,
      passageRole: undefined,
    },
    src,
  )
  const needs = officialPyqPassageNeedsOcrRefresh(stored, q, src)
  const n = officialPyqPrintedNumber(q)
  if (!allowsBySlot) {
    if (src.length >= 40) return clearMistakenPassage(q)
    if (stored && passageConflictsCard(blob, stored)) return clearMistakenPassage(q)
    return stored ? (stored === String(q.passageText ?? '').trim() ? q : { ...q, passageText: stored }) : q
  }
  if (stored && !needs) {
    return stored === String(q.passageText ?? '').trim() ? q : { ...q, passageText: stored }
  }
  if (src.length < 40) {
    if (stored && passageConflictsCard(blob, stored)) return clearMistakenPassage(q)
    return stored ? { ...q, passageText: stored } : q
  }

  let hit = pickOcrParagraphForCard(q, src, stored)
  const childLike = looksLikePyqParagraphChildStem(q.text)
  if (!hit && (childLike || needs || allowsBySlot)) {
    let at = questionMarkerIndex(src, n)
    if (at < 0) {
      const needle = String(q.text ?? '')
        .replace(/\$+/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 32)
      if (needle.length >= 12) {
        const folded = src.replace(/\$+/g, '').replace(/\s+/g, ' ')
        const ix = folded.indexOf(needle.slice(0, 24))
        if (ix >= 0) at = Math.min(ix, src.length - 1)
      }
    }
    if (at >= 8) {
      const headerAt = lastParagraphHeaderIndex(src.slice(0, at))
      if (headerAt >= 0) {
        const peeled = peelOfficialPyqParagraph(src.slice(headerAt, at + 4))
        if (
          peeled.passageText &&
          !passageConflictsCard(blob, peeled.passageText) &&
          (!peeled.nums.length || peeled.nums.includes(n))
        ) {
          hit = {
            nums: Number.isFinite(n) ? [n] : [],
            passageText: stripOfficialPyqPaperChrome(peeled.passageText),
            group: peeled.group,
          }
        }
      }
    }
  }
  if (!hit?.passageText) {
    if (stored && passageConflictsCard(blob, stored)) return clearMistakenPassage(q)
    return stored ? { ...q, passageText: stored } : q
  }
  return {
    ...q,
    passageText: stripOfficialPyqPaperChrome(hit.passageText),
    passageRole: q.passageRole || 'comprehension_child',
    passageId: q.passageId || q.passageGroup || hit.group,
    passageGroup: q.passageGroup || hit.group,
  }
}

/** Passage cut by confirmed paper facts or typed in the Edit box — heals leave it. */
function passageSetByAdmin(q) {
  const src = q && typeof q === 'object' ? q.passageSource : ''
  return src === 'admin_facts' || src === 'admin_edit'
}

function copyPassageOnto(from, to) {
  if (!from || !to) return to
  const pt = stripOfficialPyqPaperChrome(from.passageText)
  if (!pt) return to
  const existing = stripOfficialPyqPaperChrome(to.passageText)
  if (existing && !officialPyqPassageNeedsOcrRefresh(existing, to) && !passageConflictsCard(to.text, existing)) {
    return existing === String(to.passageText ?? '').trim() ? to : { ...to, passageText: existing }
  }
  if (passageConflictsCard(to.text, pt) || passageConflictsCard(from.text, to.text)) return to
  return {
    ...to,
    passageText: pt,
    passageRole: to.passageRole || 'comprehension_child',
    passageId: to.passageId || from.passageId || from.passageGroup,
    passageGroup: to.passageGroup || from.passageGroup,
  }
}

/**
 * Empty child copies the paragraph from siblings in the same parsed range.
 * No new sentences. No paper-year pair list.
 * @param {unknown[]} questions
 * @param {unknown} [rawOcr]
 * @param {{ passageRanges?: Array<{ from: number, to: number }> }} [map]
 */
export function fillOfficialPyqPairPassages(questions, rawOcr = '', map) {
  const list = Array.isArray(questions) ? questions.map((q) => (q && typeof q === 'object' ? { ...q } : q)) : []
  // Do not index by printed number alone — Paper 2 reuses 14–17 in each subject.
  // Only fill between consecutive cards that both sit in a child range.
  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i]
    const b = list[i + 1]
    if (passageSetByAdmin(a) || passageSetByAdmin(b)) continue
    if (!officialPyqCardAllowsPassage(a, rawOcr, map) || !officialPyqCardAllowsPassage(b, rawOcr, map)) {
      continue
    }
    if (!looksLikePyqParagraphChildStem(a?.text) || !looksLikePyqParagraphChildStem(b?.text)) continue
    if (passageConflictsCard(a?.text, b?.passageText) || passageConflictsCard(b?.text, a?.passageText)) {
      continue
    }
    list[i + 1] = copyPassageOnto(a, b)
    list[i] = copyPassageOnto(list[i + 1], a)
  }
  return list.map((q) => {
    if (passageSetByAdmin(q)) return q
    if (officialPyqCardAllowsPassage(q, rawOcr, map)) {
      if (q.passageText && passageConflictsCard(q.text, q.passageText)) return clearMistakenPassage(q)
      return q
    }
    if (String(rawOcr).length >= 40) return clearMistakenPassage(q)
    return q
  })
}

/** Preview / test helper: passage heading then the question only. */
export function formatOfficialPyqPassageMarkdown(q) {
  const passage = String(q?.passageText ?? '').trim()
  const stem = String(q?.text ?? '').trim()
  const n = q?.printedNumber || q?.questionNumber || ''
  const parts = []
  if (passage) {
    parts.push('### Passage / Comprehension')
    parts.push(passage)
  }
  if (stem) parts.push(`Q${n ? `${n}. ` : ''}${stem}`.replace(/^Q\.\s/, 'Q'))
  return parts.join('\n\n')
}

/** Drop paper chrome that must never show as red KaTeX / extra options. */
export function stripOfficialPyqPaperChrome(text) {
  return String(text ?? '')
    .replace(/\\section\*?\{([^}]*)\}/gi, '\n$1\n')
    .replace(/\\section\*?/gi, '')
    .replace(/\bJEE\s*\(?\s*Advanced\s*\)?\s*\d{4}\s*Paper\s*[12]\b/gi, '')
    .replace(/\bEND\s+OF\s+THE\s+QUESTION\s+PAPER\b\.?/gi, '')
    // Page footers read "8/32" (page of total). A whole option "7/3" is an answer, not a footer.
    .replace(/(?:^|\n)\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*(?=\n|$)/g, (line, page, total, at, all) => {
      const onlyLine = !(all.slice(0, at) + all.slice(at + line.length)).trim()
      return onlyLine || Number(total) < 10 || Number(page) > Number(total) ? line : '\n'
    })
    .replace(/\n*---\s*page\s*---\n*/gi, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const PASSAGE_HEADING_LINE =
  /^\s*(?:\}\s*)?(?:Question\s+Stem(?:\s+for\s+Question\s+Nos?\.?\s*\d{1,2}\s+and\s+\d{1,2})?|Paragraph(?:\s+[IVX\d]+)?|PARAGRAPH(?:\s+[IVX\d]+)?|Passage|Comprehension)?\s*\}?\s*$/
const PASSAGE_QUESTION_START = /(?:^|\n)[ \t]*(?:\\item\s*\[\s*Q\.?\s*\]|Q\s*\.)\s*\d{1,2}\b/
const PASSAGE_TAIL_LINE = /^\s*(?:\\begin\{(?:itemize|enumerate)\}|\\end\{(?:itemize|enumerate)\})\s*$/
const PASSAGE_ANSWER_LINE = /\\_\s*\\_\s*\\_|_{4,}/

/**
 * Shared passage / question stem body only: no "Question Stem for Question Nos. 5 and 6"
 * heading (or a stray `}` left from it), no question lines after it, no dangling list opener.
 * @param {unknown} text
 */
export function cleanOfficialPyqPassageBody(text) {
  let body = String(text ?? '').replace(/\r\n/g, '\n')
  const cut = body.search(PASSAGE_QUESTION_START)
  if (cut >= 0) body = body.slice(0, cut)
  const lines = body.split('\n')
  while (lines.length && PASSAGE_HEADING_LINE.test(lines[0])) lines.shift()
  while (
    lines.length &&
    (PASSAGE_TAIL_LINE.test(lines[lines.length - 1]) ||
      !lines[lines.length - 1].trim() ||
      (PASSAGE_ANSWER_LINE.test(lines[lines.length - 1]) && lines[lines.length - 1].length < 200))
  ) {
    lines.pop()
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

const PHYS_COMPREHENSION_RE =
  /Young(?:['’]s)?\s+double|double\s+slit|oscil|interferenc|spring(?:-|\s*)mass|amplitud|particles?\s*[123](?:\s*[,–-]\s*[123]){1,2}|as shown in th/i
const MATH_COMPREHENSION_RE =
  /set of all relations\s+R\s+from|Let\s*\$?\s*S\s*=\s*\\?\{?\s*1\s*,\s*2\s*,\s*3|sin\s*\^\s*\{?\s*2\s*\}?\s*x|n\s*\(\s*X\s*\)|n\s*\(\s*Y\s*\)|range of\s+R\s+has exactly/i
const CHEM_ORGANIC_RE =
  /C_?\{?9\}?H_?\{?18\}?O_?\{?2\}?|organic compound\s+P\b|oxygen atoms in\s+S\s+and\s+T/i
const CHEM_INORG_RE =
  /ferricyanide|molecular weight of\s+U|moles of\s+KI|zinc ions|formula of\s+Q/i
const CHEM_COMPREHENSION_RE = new RegExp(
  `${CHEM_ORGANIC_RE.source}|${CHEM_INORG_RE.source}|van'?t\\s*Hoff|boiling point`,
  'i',
)
const CHEM_CHILD_RE =
  /oxygen atoms in\s+S\s+and\s+T|molecular weight of\s+U|moles of\s+KI|zinc ions|formula of\s+Q/i

export function looksLikePhysicsComprehension(text) {
  return PHYS_COMPREHENSION_RE.test(String(text ?? ''))
}

export function looksLikeMathComprehension(text) {
  return MATH_COMPREHENSION_RE.test(String(text ?? ''))
}

export function looksLikeChemistryComprehension(text) {
  return CHEM_COMPREHENSION_RE.test(String(text ?? ''))
}

function foldPassageCompare(text) {
  return String(text ?? '')
    .replace(/\\includegraphics(?:\[[^\]]*\])?\{[^}]+\}/gi, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\$+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Math / physics / chemistry paragraphs must never share a card. */
export function passageConflictsCard(cardBlob, passage) {
  const card = String(cardBlob ?? '')
  const p = String(passage ?? '')
  if (!p) return false
  if (looksLikeMathComprehension(p) && (looksLikePhysicsComprehension(card) || looksLikeChemistryComprehension(card))) {
    return true
  }
  if (looksLikeMathComprehension(card) && (looksLikePhysicsComprehension(p) || looksLikeChemistryComprehension(p))) {
    return true
  }
  if (looksLikeChemistryComprehension(card) && looksLikePhysicsComprehension(p) && !looksLikeChemistryComprehension(p)) {
    return true
  }
  if (looksLikePhysicsComprehension(card) && looksLikeChemistryComprehension(p) && !looksLikePhysicsComprehension(p)) {
    return true
  }
  if (CHEM_ORGANIC_RE.test(card) && CHEM_INORG_RE.test(p) && !CHEM_ORGANIC_RE.test(p)) return true
  if (CHEM_INORG_RE.test(card) && CHEM_ORGANIC_RE.test(p) && !CHEM_INORG_RE.test(p)) return true
  if (CHEM_CHILD_RE.test(card) && looksLikePhysicsComprehension(p) && !CHEM_CHILD_RE.test(p)) return true
  return false
}

/** Mid-word OCR cut or leftover paper footer — complete from Mathpix, never invent. */
export function looksLikeTruncatedPassage(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (!t) return false
  if (/END\s+OF\s+THE\s+QUESTION\s+PAPER/i.test(t)) return true
  const last = (t.split(' ').pop() || '').replace(/[^A-Za-z]/g, '')
  if (/^(?:oscilc|amplititu|th)$/i.test(last)) return true
  if (t.length < 900 && /(?:oscilc|amplititu|as shown in th)\b/i.test(t)) return true
  return false
}

export function officialPyqPassageNeedsOcrRefresh(passage, card, source = '') {
  const p = String(passage ?? '').trim()
  const blob = `${card?.text || ''} ${card?.subject || ''} ${p}`
  if (!p) return true
  if (passageConflictsCard(blob, p)) return true
  if (looksLikeTruncatedPassage(p)) return true
  if (/END\s+OF\s+THE\s+QUESTION\s+PAPER/i.test(p)) return true
  if (
    /\b(?:as shown|shown in the (?:figure|diagram)|figure)\b/i.test(p) &&
    !/includegraphics|cdn\.mathpix/i.test(p) &&
    /includegraphics|cdn\.mathpix/i.test(String(source ?? ''))
  ) {
    return true
  }
  return false
}

/**
 * Chemistry child glued after a physics spring/YDSE block (or the reverse).
 * Keeps the subject that belongs on this card. Never invents sentences.
 */
export function peelForeignComprehensionFromStem(text, q) {
  const t = String(text ?? '')
  if (!t) return t
  const hasPhys = looksLikePhysicsComprehension(t)
  const hasChem = looksLikeChemistryComprehension(t)
  if (!(hasPhys && hasChem)) return t
  const preferChem = CHEM_CHILD_RE.test(t) || /chemistry/i.test(String(q?.subject ?? ''))
  const chemCue = t.search(
    /(?:\\section\*?\{[^}]*PARAGRAPH|PARAGRAPH\s*[“"'"]?(?:XII|XI|VIII|VII|VI|IV|IX|III|II|I|V|X|\d+)|C_?\{?9\}?H_?\{?18\}?O_?\{?2\}?|Sum of number of oxygen atoms|The molecular weight of\s+U|moles of\s+KI|zinc ions)/i,
  )
  const physCue = t.search(
    /(?:Young(?:['’]s)?\s+double|double\s+slit|spring(?:-|\s*)mass|Three particles|particles?\s*1\s*[,–-]\s*2)/i,
  )
  if (preferChem && chemCue >= 0) return t.slice(chemCue).trim()
  if (!preferChem && hasPhys && chemCue > 40) return t.slice(0, chemCue).trim()
  if (preferChem && physCue >= 0 && chemCue > physCue) return t.slice(chemCue).trim()
  return t
}

function pickOcrParagraphForCard(q, source, stored = '') {
  const src = String(source ?? '')
  if (src.length < 40) return null
  const paras = extractOfficialPyqParagraphsFromOcr(src)
  const n = Number(q?.printedNumber || q?.questionNumber || q?.pyqSlot)
  const blob = `${q?.text || ''} ${q?.subject || ''} ${stored}`
  const noConflict = (p) => p?.passageText && !passageConflictsCard(blob, p.passageText)
  // Prefer the paragraph that sits just above this stem in OCR when subjects
  // reuse printed numbers 14–17.
  let hit = null
  const needle = foldPassageCompare(q?.text).slice(0, 28)
  if (needle.length >= 14) {
    const fold = foldPassageCompare(src)
    const at = fold.indexOf(needle)
    if (at > 0) {
      let best = null
      let bestDist = Infinity
      for (const p of paras) {
        if (!noConflict(p)) continue
        const paraFold = foldPassageCompare(p.passageText).slice(0, 28)
        if (paraFold.length < 14) continue
        const pAt = fold.lastIndexOf(paraFold, at)
        if (pAt < 0 || pAt > at) continue
        const dist = at - pAt
        if (dist < bestDist) {
          bestDist = dist
          best = p
        }
      }
      if (best) hit = best
    }
  }
  if (!hit) {
    hit =
      Number.isFinite(n) && n > 0
        ? paras.find((p) => p.nums.includes(n) && p.passageText && noConflict(p))
        : null
  }
  if (!hit && stored && !passageConflictsCard(blob, stored)) {
    const prefix = foldPassageCompare(stored).slice(0, 40)
    if (prefix.length >= 16) {
      hit = paras.find((p) => noConflict(p) && foldPassageCompare(p.passageText).includes(prefix))
    }
  }
  if (!hit) {
    if (needle.length >= 16) {
      hit = paras.find((p) => {
        if (!noConflict(p)) return false
        if (p.nums.length && Number.isFinite(n) && n > 0 && !p.nums.includes(n)) return false
        const at = foldPassageCompare(src).indexOf(needle)
        if (at < 0) return false
        const paraFold = foldPassageCompare(p.passageText).slice(0, 32)
        return paraFold.length >= 16 && foldPassageCompare(src).includes(paraFold)
      })
    }
  }
  // No subject-wide fallback: that glued any chemistry paragraph onto any
  // chemistry-looking card (and the reverse). Number + nearby OCR only.
  return hit
}

function childStemFromOcrNearParagraph(source, n, passageText) {
  const src = String(source ?? '')
  const num = Number(n)
  if (!Number.isFinite(num) || num < 1 || src.length < 40) return ''
  let at = questionMarkerIndex(src, num)
  if (at < 0) {
    const prefix = foldPassageCompare(passageText).slice(0, 32)
    if (prefix.length >= 16) {
      const fold = foldPassageCompare(src)
      const ix = fold.indexOf(prefix)
      if (ix >= 0) {
        const after = src.slice(Math.min(ix, src.length - 1))
        const qAt = after.search(new RegExp(`(?:\\\\item\\s*\\[\\s*Q[^\\]]*\\]\\s*|Q\\s*\\.?\\s*)${num}\\b`, 'i'))
        if (qAt >= 0) at = Math.min(ix, src.length - 1) + qAt
      }
    }
  }
  if (at < 0) return ''
  const tail = src.slice(at)
  const cut = tail.slice(8).search(
    /(?:\\item\s*\[\s*Q\s*\.?\s*(?:\d{1,3}\s*\]|\]\s*\$?\s*\d)|(?:^|\n)Q\s*\.?\s*\d{1,3}\b|(?:^|\n)\s*(?:\\section\*?\{[^}]*PARAGRAPH|PARAGRAPH\s*[“"'"]?(?:XII|XI|VIII|VII|VI|IV|IX|III|II|I|V|X|\d+)))/i,
  )
  const window = (cut >= 0 ? tail.slice(0, cut + 8) : tail.slice(0, 900)).trim()
  const stem = stripOfficialPyqPaperChrome(
    window.replace(/^(?:\\item\s*\[\s*Q[^\]]*\]\s*|Q\s*\.?\s*\d{1,3}\s*)/i, ''),
  )
  return stem.length >= 12 ? stem : ''
}

/**
 * If the stored stem is the other subject's paragraph, take the child stem
 * that sits next to the OCR paragraph. Never invent wording.
 */
export function replaceConflictingStemFromOcr(q, source) {
  if (!q || typeof q !== 'object') return q
  const src = String(source ?? '')
  const stem = peelForeignComprehensionFromStem(String(q.text ?? ''), q)
  const hit = pickOcrParagraphForCard({ ...q, text: stem }, src, q.passageText)
  if (!hit?.passageText) return { ...q, text: stem }
  if (!passageConflictsCard(stem, hit.passageText) && looksLikeChemistryComprehension(stem) === looksLikeChemistryComprehension(hit.passageText)) {
    return stem === q.text ? q : { ...q, text: stem }
  }
  if (
    (looksLikePhysicsComprehension(stem) && looksLikeChemistryComprehension(hit.passageText) && !looksLikeChemistryComprehension(stem)) ||
    (looksLikeChemistryComprehension(stem) && looksLikePhysicsComprehension(hit.passageText) && !looksLikePhysicsComprehension(stem))
  ) {
    const n = Number(q.printedNumber || q.questionNumber || q.pyqSlot)
    const child = childStemFromOcrNearParagraph(src, n, hit.passageText)
    if (child && !passageConflictsCard(child, hit.passageText)) {
      return {
        ...q,
        text: child,
        passageText: stripOfficialPyqPaperChrome(hit.passageText),
        passageRole: q.passageRole || 'comprehension_child',
        passageId: q.passageId || hit.group,
        passageGroup: q.passageGroup || hit.group,
      }
    }
  }
  return stem === q.text ? q : { ...q, text: stem }
}

/**
 * @param {unknown} text
 */
export function looksLikePyqParagraphHeader(text) {
  const t = String(text ?? '').trim()
  if (!t) return false
  const head = t.slice(0, 400)
  return (
    PYQ_PARAGRAPH_HEADER_RE.test(`\n${head}`) ||
    /\\section\*?\{[^}]*PARAGRAPH/i.test(head) ||
    /\bthere are two questions based on\s+PARAGRAPH/i.test(head)
  )
}

/**
 * "Paragraph for Questions 5 and 6" → [5, 6]
 * @param {unknown} header
 */
export function parsePyqParagraphQuestionNums(header) {
  const t = String(header ?? '')
  const m =
    t.match(/Paragraph\s+for\s+(?:Questions?|Q\.?)\s*([\d,\s]+(?:and\s+\d+)?)/i) ||
    t.match(/Question\s+Stem\s+for\s+Question\s+Nos?\.?\s*([\d,\s]+(?:and\s+\d+)?)/i)
  if (!m) return []
  return (m[1].match(/\d{1,3}/g) || [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0 && n < 200)
}

function passageGroupId(nums, passageText) {
  const n = (Array.isArray(nums) ? nums : []).filter((x) => x > 0).join('-') || 'pair'
  const fp = String(passageText ?? '')
    .replace(/\s+/g, ' ')
    .slice(0, 48)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 16)
  return `pyq-para-${n}-${fp}`
}

/**
 * Index where the first child question starts after a paragraph header.
 * Never cuts on Let/If inside the passage (those are setup, not a new card).
 * @param {string} afterHeader
 * @param {number[]} [nums]
 */
export function findChildStemAfterPyqPassage(afterHeader, nums = []) {
  const t = String(afterHeader ?? '')
  if (t.length < 8) return -1

  const qRe = /(?:^|\n)\s*(?:\\item\s*\[\s*Q[^\]]*\]\s*|Q\s*\.?\s*)(\d{1,3})\b/gi
  let m
  while ((m = qRe.exec(t)) !== null) {
    const n = Number(m[1])
    if (!nums.length || nums.includes(n)) {
      return m[0].startsWith('\n') ? m.index + 1 : m.index
    }
  }

  const numRe =
    /(?:^|\n)\s*(\d{1,2})[\.\)]\s+(?=The\s|Let\s|If\s|Which\s|Find\s|What\s|How\s|Consider\s|Suppose\s|A\s)/g
  while ((m = numRe.exec(t)) !== null) {
    const n = Number(m[1])
    if (!nums.length || nums.includes(n)) {
      return m[0].startsWith('\n') ? m.index + 1 : m.index
    }
  }

  const below = t.search(/\bthe question given below is one of them\b/i)
  if (below >= 0) {
    const am = t.slice(below).match(/\bthe question given below is one of them\b\.?\s*\)?\s*/i)
    const after = below + (am ? am[0].length : 0)
    const next = t.slice(after).search(/\S/)
    if (next >= 0 && after + next < t.length - 8) return after + next
    // Cue is the end of the reprinted paragraph — children are later cards.
    return -1
  }

  const ifN = t.search(
    /(?:^|\n)\s*(?:Q\s*\.?\s*\d{1,3}\s+)?If\s+\$?(?:n\s*\(|the\s+value\s+of\s+\$?n\s*\()/i,
  )
  if (ifN >= 8) return ifN + (t[ifN] === '\n' ? 1 : 0)

  const answer = t.search(/\banswer\s+the\s+following\s+questions?\s*:?\s*/i)
  if (answer >= 0) {
    const am = t.slice(answer).match(/\banswer\s+the\s+following\s+questions?\s*:?\s*/i)
    const after = answer + (am ? am[0].length : 0)
    const next = t.slice(after).search(/\S/)
    if (next >= 0 && after + next < t.length - 8) return after + next
  }

  const optA = t.search(/(?:^|\n)\s*\(\s*A\s*\)/)
  if (optA > 48) {
    const before = t.slice(0, optA)
    let br = before.lastIndexOf('\n\n')
    if (br < 20) br = before.lastIndexOf('\n')
    if (br > 20) {
      const last = before.slice(br).trim()
      if (last.length >= 8 && last.length <= 500) return br
    }
  }

  return -1
}

function stripOptionsFromPassageBody(text) {
  const t = String(text ?? '')
  const at = t.search(/\(\s*A\s*\)/)
  if (at > 24) return t.slice(0, at).trim()
  return t.trim()
}

/**
 * Split a "Paragraph for Questions…" block into shared passage + child stem.
 * Does not invent math. Does not emit the passage as the question.
 * @param {unknown} raw
 * @returns {{ stem: string, passageText: string, nums: number[], isPassageOnly: boolean, group: string }}
 */
export function peelOfficialPyqParagraph(raw) {
  const full = String(raw ?? '')
  const t = full.trim()
  const empty = { stem: full, passageText: '', nums: [], isPassageOnly: false, group: '' }
  if (!t || !looksLikePyqParagraphHeader(t)) return empty

  const headerMatch = t.match(PYQ_PARAGRAPH_HEADER_LINE_RE)
  if (!headerMatch) return empty
  const nums = parsePyqParagraphQuestionNums(headerMatch[0])
  const afterHeader = t.slice(headerMatch[0].length).replace(/^\s*[:.\-–—]\s*/, '').trim()
  const childAt = findChildStemAfterPyqPassage(afterHeader, nums)
  const hasOptions = /\(\s*A\s*\)[\s\S]{4,}\(\s*B\s*\)/.test(afterHeader)

  if (childAt >= 8) {
    const passageText = stripOfficialPyqPaperChrome(afterHeader.slice(0, childAt).trim())
    const stem = stripOfficialPyqPaperChrome(afterHeader.slice(childAt).trim())
    return {
      stem,
      passageText,
      nums,
      isPassageOnly: false,
      group: passageGroupId(nums, passageText),
    }
  }

  if (hasOptions) {
    const passageText = stripOptionsFromPassageBody(afterHeader)
    return {
      stem: afterHeader,
      passageText,
      nums,
      isPassageOnly: false,
      group: passageGroupId(nums, passageText),
    }
  }

  const passageText = stripOfficialPyqPaperChrome(
    afterHeader || t.replace(PYQ_PARAGRAPH_HEADER_LINE_RE, '').trim(),
  )
  return {
    stem: '',
    passageText,
    nums,
    isPassageOnly: true,
    group: passageGroupId(nums, passageText),
  }
}

/**
 * Cut a glued "Paragraph for Questions…" off the previous stem.
 * @param {unknown} text
 */
export function stripTrailingPyqParagraph(text) {
  const t = String(text ?? '')
  const sec = t.search(/\\section\*?\{[^}]*PARAGRAPH/i)
  if (sec > 24) {
    return { stem: t.slice(0, sec).trim(), tail: t.slice(sec).trim() }
  }
  const at = t.search(PYQ_PARAGRAPH_CUT_RE)
  if (at > 24) {
    return { stem: t.slice(0, at).trim(), tail: t.slice(at).trim() }
  }
  // Chemistry OCR glues the next header onto the fill-blank stem:
  //   ... is $____$. "PARAGRAPH II" When potassium...
  const inline = t.search(/[“"'']\s*PARAGRAPH\s*[“"'']?(?:XII|XI|VIII|VII|VI|IV|IX|III|II|I|V|X|\d+)/i)
  if (inline > 24) {
    return { stem: t.slice(0, inline).trim(), tail: t.slice(inline).trim() }
  }
  return { stem: t, tail: '' }
}

/**
 * True when this card is only the shared paragraph — not a scored question.
 * @param {unknown} text
 */
export function looksLikeOfficialPyqPassageOnly(text) {
  const peeled = peelOfficialPyqParagraph(text)
  if (peeled.isPassageOnly && peeled.passageText) return true
  const t = String(text ?? '').trim()
  if (!looksLikePyqParagraphHeader(t)) return false
  if (/\(\s*A\s*\)[\s\S]{4,}\(\s*B\s*\)/.test(t)) return false
  if (/(?:^|\n)\s*(?:\\item\s*\[\s*Q\s*\.?\s*(?:\d{1,3}\s*\]|\]\s*\$?\s*\d)|Q\s*\.?\s*\d{1,3}\b)/i.test(t.slice(20))) return false
  return (
    /^Paragraph\s+for\b/i.test(t) ||
    /^(?:\\section\*?\{[^}]*PARAGRAPH|PARAGRAPH\s*[“"'"]?(?:XII|XI|VIII|VII|VI|IV|IX|III|II|I|V|X|\d+))/i.test(t) ||
    /^(?:Passage|Comprehension)\s*:/i.test(t) ||
    /^(?:\\section\*?\{\s*)?Question\s+Stem\s+for\s+Question\s+Nos?\.?\s*\d/i.test(t)
  )
}

/**
 * Preview/heal for one stored card: passage out of the stem, fake A/B gone.
 * Does not invent sentences. Does not merge two questions.
 * @param {object} q
 */
export function peelOfficialPyqCardForDisplay(q, source = '') {
  if (!q || typeof q !== 'object') return q
  if (passageSetByAdmin(q)) return q
  const raw = String(q.text ?? q.stem ?? '')
  const trail = stripTrailingPyqParagraph(peelForeignComprehensionFromStem(raw, q))
  let text = stripOfficialPyqPaperChrome(trail.stem)
  let passageText = stripOfficialPyqPaperChrome(q.passageText)
  if (passageText && passageConflictsCard(text, passageText)) passageText = ''
  const slotCard = {
    ...q,
    text,
    passageText: '',
    passageId: undefined,
    passageGroup: undefined,
    passageRole: undefined,
  }
  const hasOcr = String(source ?? '').length >= 40
  const ownsSlot = hasOcr
    ? officialPyqCardAllowsPassage(slotCard, source)
    : looksLikePyqParagraphChildStem(text) || looksLikePyqParagraphChildStem(raw)
  if (trail.tail) {
    const peeledTail = peelOfficialPyqParagraph(trail.tail)
    const n = officialPyqPrintedNumber(q)
    const tailOwns =
      ownsSlot &&
      peeledTail.passageText &&
      (!peeledTail.nums.length || !n || peeledTail.nums.includes(n) || looksLikePyqParagraphChildStem(text))
    if (tailOwns) passageText = passageText || peeledTail.passageText
  }
  const peeled = peelOfficialPyqParagraph(text)
  if (peeled.passageText) {
    text = stripOfficialPyqPaperChrome(peeled.stem || text)
    const n = officialPyqPrintedNumber(q)
    const ownsPeeled =
      ownsSlot &&
      !peeled.isPassageOnly &&
      (!peeled.nums.length || !n || peeled.nums.includes(n))
    if (ownsPeeled) passageText = passageText || peeled.passageText
    else if (!ownsSlot) passageText = ''
  }
  if (!ownsSlot && /relations\s+R from S|two questions based on\s+PARAGRAPH/i.test(text)) {
    const ownStem = text.search(/\bLet\s+(?:\$?k\b|k\s*[∈\\])/i)
    if (ownStem > 20) text = text.slice(ownStem).trim()
  }
  const options = looksLikeParagraphPropertyOptions(q.options, passageText)
    ? ['', '', '', '']
    : q.options
  let next = {
    ...q,
    text,
    options,
    passageText: passageText || undefined,
    passageRole: passageText ? q.passageRole || 'comprehension_child' : undefined,
    passageId: passageText ? q.passageId || q.passageGroup || undefined : undefined,
    passageGroup: passageText ? q.passageGroup || undefined : undefined,
  }
  if (!passageText) {
    delete next.passageId
    delete next.passageGroup
    delete next.passageRole
    delete next.passageText
  }
  if (
    source &&
    (!String(next.passageText ?? '').trim() || officialPyqPassageNeedsOcrRefresh(next.passageText, next, source))
  ) {
    next = recoverOfficialPyqPassageFromSource(next, source)
  }
  if (String(source ?? '').length >= 40 && !officialPyqCardAllowsPassage(next, source)) {
    next = clearMistakenPassage(next)
  }
  if (next.passageText && passageConflictsCard(next.text, next.passageText)) {
    next = clearMistakenPassage(next)
  }
  if (next.passageText) {
    const body = cleanOfficialPyqPassageBody(next.passageText)
    if (body !== next.passageText) next = body ? { ...next, passageText: body } : clearMistakenPassage(next)
  }
  const sameText = next.text === raw
  const samePass = String(next.passageText ?? '') === stripOfficialPyqPaperChrome(q.passageText)
  const sameOpts = next.options === q.options
  if (sameText && samePass && sameOpts) return q
  return next
}

/** Integer / fill-blank that sits under PARAGRAPH "I" (Q14 style). */
export function looksLikePyqParagraphChildStem(text) {
  const t = String(text ?? '').trim()
  if (!t) return false
  const bare = t.replace(/^Q\s*\.?\s*\d{1,3}\s+/i, '')
  if (/^If\s+\$?(?:n\s*\(|the\s+value\s+of\s+\$?n\s*\()/i.test(bare)) return true
  if (/^If\s+/i.test(bare) && bare.length < 240 && /_{2,}|\\_\\_/.test(bare)) return true
  return false
}

/** Passage i/ii properties must never become A–D options. */
export function looksLikeParagraphPropertyOptions(options, passageText = '') {
  const filled = (Array.isArray(options) ? options : []).map((o) => String(o ?? '').trim()).filter(Boolean)
  if (filled.length < 2) return false
  const blob = filled.join('\n')
  if (/\bthere are two questions based on\s+PARAGRAPH/i.test(blob)) return true
  if (/exactly \d+ elements/i.test(blob) && /for each\s*\(\s*[a-z]\s*,/i.test(blob)) return true
  if (String(passageText ?? '') && /exactly \d+ elements/i.test(blob)) return true
  return false
}

/**
 * Attach paragraph bodies to the child cards that sit under them.
 * Drops passage-only cards so they are not counted as extra questions.
 * A card receives a passage only when its printed number is in that
 * paragraph's child range. Default is no passage.
 * @param {unknown[]} questions
 * @param {unknown} [rawOcr]
 * @param {{ passageRanges?: Array<{ from: number, to: number }> }} [map]
 */
export function attachOfficialPyqPassages(questions, rawOcr = '', map) {
  const list = Array.isArray(questions) ? questions : []
  const out = []
  /** @type {{ passageText: string, left: number, nums: number[], group: string } | null} */
  let pending = null
  const ranges = officialPyqPassageRanges(rawOcr, map)

  const pendingOwnsCard = (q) => {
    if (!pending || !q) return false
    const n = officialPyqPrintedNumber(q)
    return n > 0 && pending.nums.includes(n)
  }

  const resolvePendingNums = (peeled, owner) => {
    const listed = Array.isArray(peeled?.nums) ? peeled.nums.filter((x) => x > 0) : []
    if (listed.length) return listed
    const ownerN = officialPyqPrintedNumber(owner)
    if (ownerN) {
      const hit = ranges.find((r) => ownerN >= r.from && ownerN <= r.to)
      if (hit) return rangeToNums(hit)
      if (looksLikePyqParagraphChildStem(owner?.text || peeled?.stem)) {
        const count = /three questions/i.test(String(peeled?.passageText ?? '')) ? 3 : 2
        const nums = [ownerN]
        for (let i = 1; i < count; i += 1) nums.push(ownerN + i)
        return nums
      }
    }
    const hay = String(peeled?.passageText ?? '')
    const fromOcr = extractOfficialPyqParagraphsFromOcr(rawOcr).find((p) => {
      const a = foldPassageCompare(p.passageText).slice(0, 40)
      const b = foldPassageCompare(hay).slice(0, 40)
      return a && b && (a.includes(b.slice(0, 24)) || b.includes(a.slice(0, 24)))
    })
    if (fromOcr?.nums?.length) return fromOcr.nums.filter((n) => n > 0)
    return []
  }

  const takePending = (q) => {
    if (!pending || !q || !pendingOwnsCard(q)) return q
    const opts = looksLikeParagraphPropertyOptions(q.options, pending.passageText)
      ? ['', '', '', '']
      : q.options
    const next = {
      ...q,
      text: stripOfficialPyqPaperChrome(q.text),
      options: opts,
      passageText: String(q.passageText ?? '').trim() || pending.passageText,
      passageGroup: q.passageGroup || pending.group,
      passageId: q.passageId || pending.group,
      passageRole: 'comprehension_child',
    }
    pending.left -= 1
    if (pending.left <= 0) pending = null
    return next
  }

  const backfillLastChild = () => {
    if (!pending || !out.length) return
    const last = out[out.length - 1]
    if (String(last.passageText ?? '').trim()) return
    if (!pendingOwnsCard(last)) return
    out[out.length - 1] = takePending(last)
  }

  const setPending = (peeled, owner) => {
    const passageText = String(peeled?.passageText ?? '').trim()
    if (!passageText) return
    const n = resolvePendingNums(peeled, owner)
    if (!n.length) {
      pending = null
      return
    }
    pending = {
      passageText,
      left: Math.max(n.length, 1),
      nums: n,
      group: peeled.group || passageGroupId(n, passageText),
    }
  }

  for (const q of list) {
    if (!q || typeof q !== 'object') continue
    const trail = stripTrailingPyqParagraph(q.text ?? q.stem ?? '')
    let text = stripOfficialPyqPaperChrome(trail.stem)
    let passageBelongsToNext = false
    if (trail.tail) {
      setPending(peelOfficialPyqParagraph(trail.tail), { ...q, text })
      passageBelongsToNext = !pendingOwnsCard({ ...q, text })
    }

    const peeled = peelOfficialPyqParagraph(text)
    if (peeled.isPassageOnly) {
      setPending(peeled, q)
      backfillLastChild()
      continue
    }
    if (peeled.passageText) {
      setPending(peeled, { ...q, text: peeled.stem || text })
      text = peeled.stem || text
      passageBelongsToNext = !pendingOwnsCard({ ...q, text })
    }
    if (looksLikeOfficialPyqPassageOnly(text)) {
      setPending(peelOfficialPyqParagraph(text), q)
      backfillLastChild()
      continue
    }
    const row = { ...q, text }
    out.push(passageBelongsToNext ? row : takePending(row))
  }

  const recovered = out.map((q) => recoverOfficialPyqPassageFromSource(q, rawOcr))
  const filled = fillOfficialPyqPairPassages(recovered, rawOcr, map)
  return String(rawOcr).length >= 40 ? stripMistakenOfficialPyqPassages(filled, rawOcr) : filled
}
