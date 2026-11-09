/**
 * Paper facts the admin confirms (per subject: question numbers, types, options,
 * passages, match-list sizes). Once confirmed they replace the facts read from
 * the OCR instructions for splitting, the quality check and the Approve lock.
 * Pure functions only — no store access.
 */

import { buildPaperFacts, shapeOfficialPyqDrafts } from './officialPyqPaperFacts.js'
import {
  MATRIX_GRID_DEFAULT_COLS,
  MATRIX_GRID_DEFAULT_ROWS,
  MATRIX_GRID_FACT_TYPE,
  withFactType,
} from './matrixGridPyq.js'
import { stripHindiOcr } from './stripHindiOcr.js'
import { labelNumberedQuestions } from './numberedQuestionMarkers.js'

export const ADMIN_FACTS_VERSION = 1

export const FACT_SUBJECTS = [
  { id: 'physics', label: 'Physics' },
  { id: 'chemistry', label: 'Chemistry' },
  { id: 'mathematics', label: 'Mathematics' },
]

export const FACT_TYPES = [
  { id: 'single_correct', label: 'Only one correct', options: 4 },
  { id: 'multiple_correct', label: 'One or more correct', options: 4 },
  { id: 'integer', label: 'Integer', options: 0 },
  { id: 'numerical', label: 'Numerical (decimal)', options: 0 },
  { id: 'matrix_match', label: 'Match the lists', options: 4 },
  { id: MATRIX_GRID_FACT_TYPE, label: 'Matrix match (grid)', options: 0, listI: MATRIX_GRID_DEFAULT_ROWS, listII: MATRIX_GRID_DEFAULT_COLS },
]

/** A type whose answer is ticked on the paper, not picked from options. */
export function typeHasNoOptions(type) {
  return type === 'integer' || type === 'numerical' || type === MATRIX_GRID_FACT_TYPE
}

const TYPE_IDS = new Set(FACT_TYPES.map((t) => t.id))
const SUBJECT_IDS = FACT_SUBJECTS.map((s) => s.id)

export function subjectLabel(id) {
  return FACT_SUBJECTS.find((s) => s.id === id)?.label || String(id || '')
}

export function defaultOptionsFor(type) {
  return FACT_TYPES.find((t) => t.id === type)?.options ?? 4
}

/** Default Column I / Column II sizes for a type ('' when the type has none). */
export function defaultListSizesFor(type) {
  const t = FACT_TYPES.find((row) => row.id === type)
  return { listI: t?.listI ?? '', listII: t?.listII ?? '' }
}

/** @returns {{ from: number|'', to: number|'', type: string, options: number|'', listI: number|'', listII: number|'' }} */
export function emptyFactRow(from = '') {
  return { from, to: '', type: 'single_correct', options: 4, listI: '', listII: '' }
}

function int(value) {
  const n = Number(String(value ?? '').trim())
  return Number.isInteger(n) ? n : NaN
}

/**
 * "13-14, 15-16" → [[13, 14], [15, 16]]. Bad pieces are returned in `bad`.
 * @param {unknown} text
 */
export function parsePassageGroups(text) {
  /** @type {number[][]} */
  const groups = []
  /** @type {string[]} */
  const bad = []
  for (const piece of String(text ?? '').split(/[,;]+/)) {
    const t = piece.trim()
    if (!t) continue
    const m = t.match(/^Q?\s*(\d{1,3})\s*(?:-|–|to|and)\s*Q?\s*(\d{1,3})$/i)
    if (!m) {
      bad.push(t)
      continue
    }
    groups.push([Number(m[1]), Number(m[2])])
  }
  return { groups, bad }
}

export function formatPassageGroups(groups) {
  return (Array.isArray(groups) ? groups : []).map(([a, b]) => `${a}-${b}`).join(', ')
}

function rowsSignature(rows) {
  return rows.map((r) => `${r.to - r.from + 1}:${r.type}`).join('|')
}

/**
 * Pre-fill from the printed instructions. The admin checks and confirms it.
 * @param {unknown} ocr
 * @param {unknown[]} [questions]
 */
export function draftAdminFacts(ocr, questions = []) {
  const read = buildPaperFacts(ocr)
  /** @type {Map<number, { subject: string, sections: any[] }>} */
  const parts = new Map()
  for (const s of read.sections || []) {
    const key = Number(s.part) || 0
    if (!parts.has(key)) parts.set(key, { subject: s.subject || '', sections: [] })
    const part = parts.get(key)
    if (!part.subject && s.subject) part.subject = s.subject
    part.sections.push(s)
  }
  const order = []
  for (const part of parts.values()) {
    if (part.subject && !order.includes(part.subject)) order.push(part.subject)
  }
  for (const id of SUBJECT_IDS) if (order.length < 3 && !order.includes(id)) order.push(id)

  const toRows = (sections) => {
    const rows = []
    const passages = []
    let next = 1
    for (const s of sections) {
      const count = Number(s.count) || 0
      if (!count) continue
      const type = TYPE_IDS.has(s.type) ? s.type : 'single_correct'
      rows.push({
        from: next,
        to: next + count - 1,
        type,
        options: defaultOptionsFor(type),
        listI: Number(s.listI) > 0 ? Number(s.listI) : '',
        listII: Number(s.listII) > 0 ? Number(s.listII) : '',
      })
      const stems = Number(s.stems) || 0
      const each = stems > 0 ? count / stems : 0
      if (Number.isInteger(each) && each >= 2) {
        for (let a = next; a + each - 1 <= next + count - 1; a += each) passages.push([a, a + each - 1])
      }
      next += count
    }
    return { rows, passages: formatPassageGroups(passages) }
  }

  const partList = [...parts.values()]
  const first = partList.length ? toRows(partList[0].sections) : { rows: [], passages: '' }
  const shaped = partList.map((p) => toRows(p.sections))
  const samePattern =
    shaped.length <= 1 ||
    shaped.every((p) => rowsSignature(p.rows) === rowsSignature(first.rows) && p.passages === first.passages)
  const perSubject = first.rows.length ? first.rows[first.rows.length - 1].to : 0
  const maxPrinted = Math.max(
    0,
    ...(Array.isArray(questions) ? questions : []).map((q) => Number(q?.printedNumber) || 0),
  )
  const numbering =
    numberingPrintedInOcr(ocr, perSubject) ||
    (perSubject && maxPrinted > perSubject + 2 ? 'continuous' : 'restart')

  /** @type {Record<string, { rows: any[], passages: string }>} */
  const bySubject = {}
  order.forEach((id, k) => {
    bySubject[id] = shaped[k] ? shaped[k] : { rows: [emptyFactRow(1)], passages: '' }
  })

  return {
    version: ADMIN_FACTS_VERSION,
    totalQuestions: read.expectedQuestionCount || '',
    subjectOrder: order.slice(0, 3),
    numbering,
    samePattern,
    pattern: first.rows.length ? first : { rows: [emptyFactRow(1)], passages: '' },
    bySubject,
    readFromPaper: read.sections?.length > 0,
    readNotes: read.notes || [],
  }
}

function cleanRow(r) {
  return {
    from: int(r?.from),
    to: int(r?.to),
    type: String(r?.type || ''),
    options: r?.options === '' || r?.options == null ? NaN : int(r.options),
    listI: r?.listI === '' || r?.listI == null ? 0 : int(r.listI),
    listII: r?.listII === '' || r?.listII == null ? 0 : int(r.listII),
  }
}

/**
 * Check the form and build one slot per question in paper order.
 * @param {any} admin
 * @returns {{ errors: string[], slots: Array<{ subject: string, part: number, printed: number, type: string, options: number, listI: number, listII: number, passage: string }> }}
 */
export function validateAdminFacts(admin) {
  const errors = []
  const slots = []
  const order = (Array.isArray(admin?.subjectOrder) ? admin.subjectOrder : []).filter(Boolean)
  if (!order.length) errors.push('Pick the subject order.')
  if (new Set(order).size !== order.length) errors.push('A subject is listed twice in the subject order.')
  const total = int(admin?.totalQuestions)
  if (!(total > 0)) errors.push('Enter the total number of questions printed on the paper.')
  const same = admin?.samePattern !== false
  const continuous = admin?.numbering === 'continuous'
  let offset = 0

  order.forEach((subject, part) => {
    const name = subjectLabel(subject)
    const block = same ? admin?.pattern : admin?.bySubject?.[subject]
    const where = same ? 'Section pattern' : name
    const rows = (Array.isArray(block?.rows) ? block.rows : []).map(cleanRow)
    if (!rows.length) {
      errors.push(`${where}: add at least one section.`)
      return
    }
    const shift = same && continuous ? offset : 0
    let expectFrom = same ? 1 : rows[0].from
    rows.forEach((r, i) => {
      const label = `${where}, section ${i + 1}`
      if (!(r.from > 0) || !(r.to > 0)) {
        errors.push(`${label}: enter both question numbers.`)
        return
      }
      if (r.from > r.to) errors.push(`${label}: "from" Q${r.from} is after "to" Q${r.to}.`)
      if (r.from !== expectFrom) {
        errors.push(
          r.from > expectFrom
            ? `${where}: Q${expectFrom}–Q${r.from - 1} are in no section.`
            : `${label}: Q${r.from} overlaps the section before it.`,
        )
      }
      expectFrom = r.to + 1
      if (!TYPE_IDS.has(r.type)) errors.push(`${label}: pick the question type.`)
      const isMcq = r.type === 'single_correct' || r.type === 'multiple_correct' || r.type === 'matrix_match'
      if (isMcq && !(r.options >= 2)) errors.push(`${label}: enter how many options (usually 4).`)
      if (r.type === MATRIX_GRID_FACT_TYPE && (!(r.listI >= 1) || !(r.listII >= 1))) {
        errors.push(`${label}: enter how many Column I rows and Column II rows (usually 4 and 5).`)
      }
    })
    const { groups, bad } = parsePassageGroups(block?.passages)
    for (const piece of bad) errors.push(`${where}: passage "${piece}" — write it like 13-14.`)
    const first = rows[0].from
    const last = rows[rows.length - 1].to
    /** @type {Map<number, string>} */
    const passageOf = new Map()
    for (const [a, b] of groups) {
      if (a > b || a < first || b > last) {
        errors.push(`${where}: passage ${a}-${b} is outside Q${first}–Q${last}.`)
        continue
      }
      for (let n = a; n <= b; n += 1) {
        if (passageOf.has(n)) errors.push(`${where}: Q${n} is in two passages.`)
        passageOf.set(n, `${subject}:${a + shift}-${b + shift}`)
      }
    }
    for (const r of rows) {
      if (!(r.from > 0 && r.to >= r.from)) continue
      for (let n = r.from; n <= r.to; n += 1) {
        slots.push({
          subject,
          part,
          printed: n + shift,
          type: r.type,
          options: typeHasNoOptions(r.type) ? 0 : r.options || 0,
          listI: r.listI || 0,
          listII: r.listII || 0,
          passage: passageOf.get(n) || '',
        })
      }
    }
    offset += Math.max(0, last - first + 1)
  })

  if (total > 0 && slots.length && slots.length !== total) {
    errors.push(`The sections add up to ${slots.length} questions, and the total says ${total}.`)
  }
  return { errors: [...new Set(errors)], slots }
}

/** Questions in one subject, from the admin's section rows. */
function questionsPerSubject(admin) {
  const blocks = admin?.samePattern !== false ? [admin?.pattern] : Object.values(admin?.bySubject || {})
  const ends = blocks.flatMap((b) => (Array.isArray(b?.rows) ? b.rows : []).map((r) => int(r?.to)))
  return Math.max(0, ...ends.filter((n) => n > 0))
}

/**
 * How the scan numbers its questions: 'restart' when Q.1 is printed again in each
 * subject and no number goes past one subject, 'continuous' when the numbers run
 * past one subject. '' when the scan has too few numbers to tell.
 * @param {unknown} ocr
 * @param {number} perSubject
 */
export function numberingPrintedInOcr(ocr, perSubject) {
  const src = labelNumberedQuestions(stripHindiOcr(ocr))
  if (!(perSubject > 0) || !src) return ''
  const nums = allMatches(ANY_Q_MARKER_RE, src).map(({ index, end }) => Number(src.slice(index, end).match(/(\d{1,3})\s*\]?$/)?.[1]))
  const seen = nums.filter((n) => n > 0)
  if (seen.length < perSubject) return ''
  if (Math.max(...seen) > perSubject + 2) return 'continuous'
  return seen.filter((n) => n === 1).length >= 2 ? 'restart' : ''
}

/**
 * The printed numbers are on the page, so the scan settles "restart" vs "continuous".
 * A confirmed choice the scan contradicts would put Chemistry Q.3 on the card as Q39.
 * @param {any} admin
 * @param {unknown} ocr
 */
export function adminFactsMatchingScan(admin, ocr) {
  if (!admin || typeof admin !== 'object') return admin
  const printed = numberingPrintedInOcr(ocr, questionsPerSubject(admin))
  const chosen = admin.numbering === 'continuous' ? 'continuous' : 'restart'
  if (!printed || printed === chosen) return admin
  return { ...admin, numbering: printed, numberingFromScan: true }
}

/**
 * Facts in the shape the splitter and the quality check read.
 * Returns null when the admin facts are missing or invalid.
 * @param {any} admin
 */
export function adminFactsToPaperFacts(admin) {
  if (!admin || typeof admin !== 'object') return null
  const { errors, slots } = validateAdminFacts(admin)
  if (errors.length || !slots.length) return null
  return {
    known: true,
    source: 'admin',
    expectedQuestionCount: slots.length,
    sections: [],
    slots,
    notes: [],
  }
}

/**
 * Confirmed sections whose question type differs from the type the scan prints
 * in its "This section contains …" lines (Q1–10 confirmed "One or more correct"
 * on a paper that prints "Only One Option Correct Type"). Confirmed facts are
 * not changed; the admin is told. Empty when the scan does not settle it.
 * @param {any} admin
 * @param {unknown} ocr
 * @returns {string[]}
 */
export function adminFactsDisagreeWithScan(admin, ocr) {
  if (!admin?.confirmedAt) return []
  const read = buildPaperFacts(ocr)
  if (!read.known || !Array.isArray(read.sections)) return []
  const { errors, slots } = validateAdminFacts(adminFactsMatchingScan(admin, ocr))
  if (errors.length || slots.length !== read.expectedQuestionCount) return []
  const scanOrder = [...new Set(read.sections.map((s) => s.subject).filter(Boolean))]
  const slotOrder = [...new Set(slots.map((s) => s.subject))]
  if (scanOrder.join('|') !== slotOrder.join('|')) return []
  /** @type {string[]} */
  const scanTypes = []
  for (const s of read.sections) for (let k = 0; k < s.count; k += 1) scanTypes.push(s.type)
  if (scanTypes.length !== slots.length) return []
  const label = (id) => FACT_TYPES.find((t) => t.id === id)?.label || id
  /** @type {Array<{ subject: string, from: number, to: number, mine: string, scan: string }>} */
  const runs = []
  slots.forEach((slot, i) => {
    const scan = scanTypes[i]
    if (!scan || scan === slot.type) return
    // Match-the-lists questions with four choices are printed under "Only one option correct".
    if (slot.type === 'matrix_match' && scan === 'single_correct') return
    const last = runs[runs.length - 1]
    if (last && last.subject === slot.subject && last.mine === slot.type && last.scan === scan && last.to === slot.printed - 1) {
      last.to = slot.printed
    } else {
      runs.push({ subject: slot.subject, from: slot.printed, to: slot.printed, mine: slot.type, scan })
    }
  })
  return runs.map(
    (r) =>
      `Paper facts: ${subjectLabel(r.subject)} Q${r.from}–Q${r.to} are confirmed as “${label(r.mine)}”, and the scan prints “${label(r.scan)}” for that section. Please check the facts card.`,
  )
}

/** Confirmed admin facts win; otherwise the facts read from the OCR. */
export function factsForPaper(paper) {
  if (paper?.adminFacts?.confirmedAt) {
    const facts = adminFactsToPaperFacts(adminFactsMatchingScan(paper.adminFacts, paper.preparedText))
    if (facts) return facts
  }
  return paper?.paperFacts || null
}

const PASSAGE_HEADER_RE =
  /\\section\*?\{\s*(?:Question\s+Stem|Paragraph|Passage|Comprehension)[^}]*\}|(?:^|\n)[ \t]*(?:Question\s+Stem(?:\s+for\s+Question\s+Nos?\.?\s*\d{1,3}\s*(?:and|&|to|-|–|,)\s*\d{1,3})?|PARAGRAPH\b[^\n]{0,30}|Paragraph[ \t]*[A-Z0-9'"“”‘’]{0,6}|Passage[ \t]*[A-Z0-9'"“”‘’]{0,6}|Comprehension[ \t]*[A-Z0-9'"“”‘’]{0,6})[ \t]*(?=\n|$)/g

const ANY_Q_MARKER_RE = /\\item\s*\[\s*Q\.?\s*\]\s*\d{1,3}(?!\d)|\\item\s*\[\s*Q\.?\s*\d{1,3}\s*\]|(?<![A-Za-z\\])Q\s*\.\s*\d{1,3}(?!\d)/g

/** @param {number} n */
function questionMarkerRe(n) {
  return new RegExp(
    String.raw`\\item\s*\[\s*Q\.?\s*\]\s*${n}(?!\d)|\\item\s*\[\s*Q\.?\s*${n}\s*\]|(?<![A-Za-z\\])Q\s*\.\s*${n}(?!\d)`,
    'g',
  )
}

/** @param {RegExp} re @param {string} src */
function allMatches(re, src) {
  re.lastIndex = 0
  return [...src.matchAll(re)].map((m) => ({ index: m.index ?? 0, end: (m.index ?? 0) + m[0].length }))
}

function cleanPassageBody(body) {
  return String(body ?? '')
    .replace(PASSAGE_HEADER_RE, '\n')
    // "\section*{1. $\mathrm{NaNH}_{2}$ (excess)}" is a heading inside the paragraph; keep its words.
    .replace(/\\section\*?\{([^{}]*(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}[^{}]*)*)\}/g, '$1')
    .replace(/\\(?:begin|end)\{itemize\}/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * 1-based place of each card inside its subject. Papers set as continuous
 * (Chemistry Q24) often print per-subject numbers ("Q. 5") on the page.
 * @param {Array<{ subject?: string }>} list
 * @returns {number[]}
 */
export function subjectLocalNumbers(list) {
  /** @type {Map<string, number>} */
  const seen = new Map()
  return (Array.isArray(list) ? list : []).map((row) => {
    const sub = String(row?.subject ?? '')
    const n = (seen.get(sub) || 0) + 1
    seen.set(sub, n)
    return n
  })
}

/**
 * Passage text for each confirmed passage group, cut from the stored OCR:
 * after the passage heading, up to the first question of the group. Only
 * text from the OCR; a group whose place on the paper is not certain is left out.
 * @param {unknown} ocr
 * @param {Array<{ printed: number, passage: string }>} slots
 * @returns {Map<string, string>}
 */
export function cutAdminPassagesFromOcr(ocr, slots) {
  const src = String(ocr ?? '')
  /** @type {Map<string, string>} */
  const out = new Map()
  if (src.length < 80 || !Array.isArray(slots)) return out
  const headers = allMatches(PASSAGE_HEADER_RE, src)
  const anyMarkers = allMatches(ANY_Q_MARKER_RE, src)
  /** @type {Map<number, Array<{ index: number, end: number }>>} */
  const markerCache = new Map()
  const markersFor = (n) => {
    if (!markerCache.has(n)) markerCache.set(n, allMatches(questionMarkerRe(n), src))
    return markerCache.get(n) || []
  }
  const local = subjectLocalNumbers(slots)
  /** Paper slot -> its marker: the confirmed number first, else the number inside its subject. */
  const markerAt = (i) => {
    for (const nums of [slots.map((s) => s.printed), local]) {
      const n = nums[i]
      const sameNumber = nums.filter((x) => x === n).length
      const occurrence = nums.slice(0, i).filter((x) => x === n).length
      const markers = markersFor(n)
      if (markers.length === sameNumber) return markers[occurrence].index
    }
    return -1
  }
  slots.forEach((slot, i) => {
    const key = slot?.passage
    if (!key || out.has(key)) return
    const at = markerAt(i)
    if (at < 0) return
    const prevQuestion = anyMarkers.filter((m) => m.index < at).pop()
    const floor = prevQuestion ? prevQuestion.end : 0
    const header = headers.filter((h) => h.index >= floor && h.index < at).shift()
    if (!header) return
    const body = cleanPassageBody(src.slice(header.end, at))
    if (body.length >= 40) out.set(key, body)
  })
  return out
}

/**
 * Put the confirmed facts on the cards: subject, type, paper part, printed
 * number, and the shared passage of each passage group (cut from the OCR).
 * Cards outside every group lose a leftover passage. A passage the admin typed
 * in the Edit box stays. Does nothing when the card count differs from the facts.
 * @param {unknown[]} questions
 * @param {any} admin
 * @param {unknown} ocr
 */
export function enforceAdminFactsOnQuestions(questions, admin, ocr) {
  const list = Array.isArray(questions) ? questions : []
  if (!admin?.confirmedAt) return list
  const { errors, slots } = validateAdminFacts(adminFactsMatchingScan(admin, ocr))
  if (errors.length || !slots.length || slots.length !== list.length) return list
  const passages = cutAdminPassagesFromOcr(ocr, slots)
  return list.map((q, i) => {
    if (!q || typeof q !== 'object' || q.placeholder === true) return q
    const slot = slots[i]
    const next = {
      ...withFactType(q, slot.type),
      subject: slot.subject,
      subjectSource: 'admin_facts',
      typeSource: 'admin_facts',
      paperPart: slot.part,
      printedNumber: slot.printed,
    }
    if (q.passageSource === 'admin_edit' || q.adminApproved === true) return next
    if (!slot.passage) {
      if (!q.passageText && !q.passageId && !q.passageGroup) return next
      const { passageText: _t, passageId: _i, passageGroup: _g, passageRole: _r, passageSource: _s, ...rest } = next
      return rest
    }
    const id = `admin-${slot.passage.replace(/[^a-z0-9]+/gi, '-')}`
    const cut = passages.get(slot.passage)
    return {
      ...next,
      ...(cut ? { passageText: cut, passageSource: 'admin_facts' } : {}),
      passageId: id,
      passageGroup: id,
      passageRole: 'comprehension_child',
    }
  })
}

/**
 * Re-shape cards with the confirmed facts: drop passage-only and marks-text
 * cards, attach passages, stamp subject / type / printed number when the count
 * matches. Text comes only from the cards and the stored OCR.
 * @param {unknown[]} questions
 * @param {any} admin
 * @param {unknown} ocr
 */
export function applyAdminFactsToQuestions(questions, admin, ocr) {
  const facts = adminFactsToPaperFacts(adminFactsMatchingScan(admin, ocr))
  const list = Array.isArray(questions) ? questions : []
  if (!facts) return { questions: list, facts: null }
  const shaped = shapeOfficialPyqDrafts(list, ocr, { facts })
  return { questions: enforceAdminFactsOnQuestions(shaped.questions, admin, ocr), facts }
}
