/**
 * Detect expected paper size vs stored cards, and hold empty slots to fill later.
 */

import { expectedPyqTargetFromOcrLite, quickOcrQuestionCount } from './pyqOcrCountLite.js'
import { buildPaperFacts } from './officialPyqPaperFacts.js'

/** @param {unknown} q @param {number} index */
export function officialPyqSlotNumber(q, index = 0) {
  const slot = Number(q?.pyqSlot)
  if (Number.isFinite(slot) && slot > 0) return slot
  const qn = Number(q?.questionNumber)
  if (Number.isFinite(qn) && qn > 0) return qn
  return index + 1
}

export function isOfficialPyqPlaceholder(q) {
  if (!q || typeof q !== 'object') return false
  if (q.placeholder === true) return true
  return !String(q.text ?? q.stem ?? '').trim()
}

/** @param {unknown} paper */
export function officialPyqExpectedTotal(paper) {
  const storedFacts = paper?.paperFacts
  if (storedFacts?.known && Number(storedFacts.expectedQuestionCount) >= 8) {
    return Number(storedFacts.expectedQuestionCount)
  }
  const ocr = String(paper?.preparedText ?? '').trim()
  if (ocr.length >= 80) {
    const facts = buildPaperFacts(ocr)
    if (facts.known && Number(facts.expectedQuestionCount) >= 8) return Number(facts.expectedQuestionCount)
    return 0
  }
  const exam = String(paper?.exam || '')
  const markers = ocr.length >= 80 ? quickOcrQuestionCount(ocr) : 0
  if (markers >= 8) return markers
  const stored = Number(paper?.expectedQuestionCount)
  if (Number.isFinite(stored) && stored >= 8 && storedFacts?.known) return stored
  if (ocr.length >= 80) return expectedPyqTargetFromOcrLite(exam, ocr)
  return 0
}

/**
 * Slot numbers in 1..expected that have no real (non-placeholder) card.
 * @param {unknown[]} questions
 * @param {number} expected
 */
export function listOfficialPyqMissingSlots(questions, expected) {
  const target = Number(expected) || 0
  if (target < 2) return []
  const list = Array.isArray(questions) ? questions : []
  const filled = new Set()
  list.forEach((q, i) => {
    if (isOfficialPyqPlaceholder(q) && !String(q?.text ?? '').trim()) return
    const n = officialPyqSlotNumber(q, i)
    if (n >= 1 && n <= Math.max(target, list.length)) filled.add(n)
  })
  if (filled.size >= target) return []
  const missing = []
  for (let n = 1; n <= target; n += 1) {
    if (!filled.has(n)) missing.push(n)
  }
  return missing
}

/** @param {number} slot @param {string} [paperId] */
export function makeOfficialPyqPlaceholder(slot, paperId = '') {
  const n = Number(slot) || 0
  return {
    id: `opyq-later-${paperId || 'paper'}-${n}`,
    text: '',
    options: ['', '', '', ''],
    questionType: 'single_correct',
    questionNumber: n,
    pyqSlot: n,
    printedNumber: n,
    placeholder: true,
    bankStatus: 'draft',
    answerSource: 'unknown',
    chapter: 'General',
  }
}

/**
 * Insert empty cards for missing slots so they can be filled later on this paper.
 * @param {unknown[]} questions
 * @param {number} expected
 * @param {string} [paperId]
 */
export function reserveOfficialPyqMissingSlots(questions, expected, paperId = '') {
  const list = Array.isArray(questions) ? questions.slice() : []
  const missing = listOfficialPyqMissingSlots(list, expected)
  if (!missing.length) return list
  const have = new Set(list.map((q, i) => officialPyqSlotNumber(q, i)))
  for (const slot of missing) {
    if (!have.has(slot)) {
      list.push(makeOfficialPyqPlaceholder(slot, paperId))
      have.add(slot)
    }
  }
  return list.sort((a, b) => officialPyqSlotNumber(a) - officialPyqSlotNumber(b))
}

/**
 * Merge incoming questions onto existing cards by slot (fill placeholders, keep others).
 * @param {unknown[]} existing
 * @param {unknown[]} incoming
 */
export function mergeOfficialPyqQuestionsBySlot(existing, incoming, expected = 0) {
  const bySlot = new Map()
  ;(Array.isArray(existing) ? existing : []).forEach((q, i) => {
    bySlot.set(officialPyqSlotNumber(q, i), q)
  })
  ;(Array.isArray(incoming) ? incoming : []).forEach((q, i) => {
    const slot = officialPyqSlotNumber(q, i)
    if (!(slot > 0)) return
    const prev = bySlot.get(slot)
    const next = {
      ...q,
      pyqSlot: slot,
      questionNumber: slot,
      placeholder: false,
    }
    if (prev && !isOfficialPyqPlaceholder(prev) && String(prev.text ?? '').trim()) {
      const merged = {
        ...prev,
        ...next,
        id: prev.id || next.id,
      }
      if (prev.passageSource === 'admin_edit' && String(prev.passageText ?? '').trim()) {
        merged.passageText = prev.passageText
        merged.passageSource = 'admin_edit'
      } else if (!String(next.passageText ?? '').trim() && !next.passageId) {
        delete merged.passageText
        delete merged.passageId
        delete merged.passageGroup
        if (next.passageRole !== 'comprehension_child') delete merged.passageRole
      }
      bySlot.set(slot, merged)
    } else {
      bySlot.set(slot, { ...(prev || {}), ...next, id: next.id || prev?.id })
    }
  })
  let rows = Array.from(bySlot.entries()).sort((a, b) => a[0] - b[0])
  const target = Number(expected) || 0
  const incomingFilled = (Array.isArray(incoming) ? incoming : []).filter(
    (q) => !isOfficialPyqPlaceholder(q) && String(q?.text ?? '').trim(),
  ).length
  if (target >= 40 && incomingFilled >= target - 2 && incomingFilled <= target + 2) {
    const maxKeep = Math.max(target, incomingFilled)
    rows = rows.filter(([slot]) => slot <= maxKeep)
  }
  return rows.map(([, q]) => q)
}

function slotFingerprint(text) {
  return String(text ?? '')
    .replace(/\$+/g, '')
    .replace(/\\[A-Za-z]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .toLowerCase()
}

/**
 * Drop a consecutive reprint of the same printed number + same stem.
 * @param {unknown[]} questions
 */
export function dedupeUploadQuestionSlots(questions) {
  const list = Array.isArray(questions) ? questions : []
  const out = []
  for (const q of list) {
    if (!q || typeof q !== 'object') continue
    const prev = out[out.length - 1]
    const prevN = Number(prev?.printedNumber ?? prev?.questionNumber ?? prev?.pyqSlot)
    const nextN = Number(q?.printedNumber ?? q?.questionNumber ?? q?.pyqSlot)
    const sameNum = prev && prevN > 0 && prevN === nextN
    const sameStem =
      prev && slotFingerprint(prev.text) && slotFingerprint(prev.text) === slotFingerprint(q.text)
    if (sameNum && sameStem) continue
    out.push(q)
  }
  return assignUniqueOfficialPyqNumbers(out)
}

/**
 * Sequential paper numbers 1..N. Two real cards that OCR both labelled "6"
 * stay two cards — only the label is rewritten so 7 is not skipped.
 * @param {unknown[]} questions
 */
export function assignUniqueOfficialPyqNumbers(questions) {
  const list = Array.isArray(questions) ? questions : []
  return list.map((q, i) => {
    const printed = Number(q?.printedNumber ?? q?.questionNumber ?? q?.pyqSlot)
    return {
      ...q,
      pyqSlot: i + 1,
      questionNumber: i + 1,
      printedNumber: Number.isFinite(printed) && printed > 0 ? printed : i + 1,
    }
  })
}

/**
 * Write one filled question into a reserved slot.
 * @param {unknown[]} questions
 * @param {number} slot
 * @param {{ text?: string, options?: unknown[], questionType?: string }} draft
 */
export function fillOfficialPyqPlaceholder(questions, slot, draft) {
  const n = Number(slot) || 0
  const text = String(draft?.text ?? '').trim()
  const options = Array.isArray(draft?.options)
    ? draft.options.map((o) => String(o ?? ''))
    : ['', '', '', '']
  while (options.length < 4) options.push('')
  const list = Array.isArray(questions) ? questions.slice() : []
  const idx = list.findIndex((q, i) => officialPyqSlotNumber(q, i) === n)
  const row = {
    ...(idx >= 0 ? list[idx] : makeOfficialPyqPlaceholder(n)),
    text,
    options: options.slice(0, 4),
    questionType: draft?.questionType || 'single_correct',
    questionNumber: n,
    pyqSlot: n,
    placeholder: !text,
  }
  if (idx >= 0) list[idx] = row
  else list.push(row)
  return list.sort((a, b) => officialPyqSlotNumber(a) - officialPyqSlotNumber(b))
}
