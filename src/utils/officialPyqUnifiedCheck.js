import { buildPaperFacts } from './officialPyqPaperFacts.js'
import { mathDrawFailure } from './mathDrawCheck.js'
import { prepareTextForMathTextDisplay } from './prepareMathForRender.js'
import { looksLikeMatchingListStem, parseMatchingListForDisplay } from './parseMatchingListDisplay.js'

const OPENING = /^Then\b/

function filled(options) {
  return (Array.isArray(options) ? options : []).map((o) => String(o ?? '').trim()).filter(Boolean)
}

function norm(text) {
  return String(text ?? '').replace(/\s+/g, '').toLowerCase()
}

function cardBlob(q) {
  return [q?.text, q?.passageText, ...(Array.isArray(q?.options) ? q.options : [])].join('\n')
}

/** An image, a saved question image, or a diagram the display draws from the text. */
function cardHasFigure(q) {
  if (String(q?.questionImage ?? '').trim()) return true
  const blob = `${cardBlob(q)}\n${String(q?.passageText ?? '')}`
  if (/\\includegraphics|!\[[^\]]*\]\([^)]+\)|cdn\.mathpix/i.test(blob)) return true
  try {
    return /sheet-config|data-sheet|<svg\b/i.test(prepareTextForMathTextDisplay(String(q?.text ?? '')))
  } catch {
    return false
  }
}

function nothingLost(q, ocr) {
  const src = String(ocr ?? '')
  const stem = String(q?.text ?? '').replace(/\s+/g, ' ').trim()
  if (src.length < 80 || stem.length < 24) return ''
  const probe = stem.slice(0, 40)
  const at = src.replace(/\s+/g, ' ').indexOf(probe)
  if (at < 0) return ''
  const flat = src.replace(/\s+/g, ' ')
  const next = flat.slice(at + probe.length).search(/\bQ\s*\.?\s*\d{1,2}\b|\\item\s*\[\s*Q/i)
  const span = flat.slice(at, next > 20 ? at + probe.length + next : at + 900)
  const card = norm(cardBlob(q))
  const missing = []
  for (const num of span.match(/\d+\.\d+/g) || []) {
    if (!card.includes(num.replace(/\s+/g, ''))) missing.push(num)
  }
  const optionLetters = new Set((span.match(/\(\s*[A-D]\s*\)/g) || []).map((l) => l.replace(/\s+/g, '')))
  if (optionLetters.size > filled(q?.options).length) missing.push(`${optionLetters.size} options in the scan`)
  const labels = span.match(/\(\s*[PQRS]\s*\)|\(\s*[1-5]\s*\)/g) || []
  for (const label of labels) {
    const compact = label.replace(/\s+/g, '')
    if (!card.includes(compact.toLowerCase()) && !card.includes(compact.toLowerCase().replace(/[()]/g, ''))) {
      missing.push(compact)
    }
  }
  if (!missing.length) return ''
  return `OCR text is missing from the card (${missing.slice(0, 4).join(', ')})`
}

function optionLabelMissing(q) {
  if (!looksLikeMatchingListStem(q?.text)) return ''
  const parsed = parseMatchingListForDisplay(q.text, q.options)
  const have = new Set([
    ...(parsed?.listI || []).map((row) => String(row.label || row.letter || '').replace(/[()]/g, '')),
    ...(parsed?.listII || []).map((row) => String(row.label || row.letter || '').replace(/[()]/g, '')),
  ])
  const used = new Set()
  for (const opt of filled(q.options)) {
    for (const m of opt.matchAll(/\(\s*([PQRS1-5])\s*\)/gi)) used.add(m[1].toUpperCase())
  }
  const missing = [...used].filter((label) => !have.has(label))
  if (!missing.length) return ''
  return `Option label ${missing.join(', ')} is not in the lists`
}

function answerNotInOptions(q) {
  const opts = filled(q?.options)
  if (!opts.length) return ''
  const idx = Number(q?.correctIndex)
  if (!Number.isFinite(idx)) return ''
  if (idx < 0 || idx >= (Array.isArray(q.options) ? q.options.length : 0)) return 'The answer is not one of the options'
  if (!String(q.options[idx] ?? '').trim()) return 'The answer is not one of the options'
  return ''
}

const SUBJECT_NAME = { physics: 'Physics', chemistry: 'Chemistry', mathematics: 'Mathematics' }
const MCQ_TYPES = new Set(['single_correct', 'multiple_correct', 'matrix_match'])
const PASSAGE_ONLY = /^(?:\\section\*?\{[^}]*\})?\s*(?:Paragraph|PARAGRAPH|Passage|Question\s+Stem)\b/i

/** Reasons a card breaks the paper facts the admin confirmed. */
function adminFactReasons(q, slot) {
  const reasons = []
  const opts = filled(q?.options)
  if (PASSAGE_ONLY.test(String(q?.text ?? '').trim()) && opts.length < 2) {
    reasons.push('This card is a passage, not a question')
  }
  if (!slot) return reasons
  if (slot.subject && String(q?.subject || '') !== slot.subject) {
    reasons.push('The subject does not match the paper facts')
  }
  if (slot.type && String(q?.questionType || '') !== slot.type) {
    reasons.push('The question type does not match the paper facts')
  }
  if (MCQ_TYPES.has(slot.type) && slot.options > 0 && opts.length !== slot.options) {
    reasons.push(`The number of options does not match the paper facts (${slot.options})`)
  }
  if ((slot.type === 'integer' || slot.type === 'numerical') && opts.length > 0) {
    reasons.push('An integer or numerical question should have no options')
  }
  if (slot.passage && !String(q?.passageText ?? '').trim()) {
    reasons.push('The paper facts say this question has a passage, and the card has none')
  }
  if (slot.type === 'matrix_match' && (slot.listI > 0 || slot.listII > 0)) {
    const parsed = parseMatchingListForDisplay(q?.text, q?.options)
    const nI = (parsed?.listI || []).length
    const nII = (parsed?.listII || []).length
    if ((slot.listI > 0 && nI !== slot.listI) || (slot.listII > 0 && nII !== slot.listII)) {
      reasons.push('List-I or List-II has a different number of rows than the paper facts')
    }
  }
  return reasons
}

function subjectCountLine(cards, slots) {
  const want = new Map()
  const have = new Map()
  for (const s of slots) want.set(s.subject, (want.get(s.subject) || 0) + 1)
  for (const q of cards) {
    const key = String(q?.subject || '')
    have.set(key, (have.get(key) || 0) + 1)
  }
  const differs = [...want].some(([k, n]) => (have.get(k) || 0) !== n)
  if (!differs) return ''
  const fmt = (map) =>
    [...want.keys()].map((k) => `${SUBJECT_NAME[k] || k} ${map.get(k) || 0}`).join(', ')
  return `Paper facts: ${fmt(want)}. This paper has ${fmt(have)}. Do not approve.`
}

/** @returns {string[]} */
function paperLevelMessages(list, factCard, adminSlots) {
  const messages = []
  const cards = list.filter((q) => q && q.placeholder !== true)
  if (!factCard.known) {
    messages.push(
      factCard.notes?.[0] ||
        'The facts card is unknown because the OCR instructions do not give every section count. Do not approve.',
    )
  } else if (cards.length !== factCard.expectedQuestionCount) {
    const who = factCard.source === 'admin' ? 'Paper facts (confirmed by you) say' : 'Facts card says'
    messages.push(
      `${who} ${factCard.expectedQuestionCount} questions. This paper has ${list.length}. Do not approve.`,
    )
  } else if (adminSlots) {
    const line = subjectCountLine(cards, adminSlots)
    if (line) messages.push(line)
  }
  for (const note of factCard.notes || []) {
    if (!messages.includes(note)) messages.push(note)
  }
  return messages
}

/**
 * One check for the list status and the red banner.
 * `cardsOnly` skips the paper-level count lines (used when checking one card or a slice).
 * @param {unknown[]} questions
 * @param {unknown} [ocr]
 * @param {ReturnType<typeof buildPaperFacts> | null} [facts]
 * @param {{ cardsOnly?: boolean, indexOf?: (q: object, index: number) => number }} [checkOpts]
 */
export function reviewOfficialPyqCards(questions, ocr = '', facts = null, checkOpts = {}) {
  const list = Array.isArray(questions) ? questions : []
  const cardsOnly = checkOpts?.cardsOnly === true
  const factCard =
    facts && typeof facts === 'object' ? facts : cardsOnly ? null : buildPaperFacts(ocr)
  const adminSlots =
    !cardsOnly && factCard?.source === 'admin' && Array.isArray(factCard.slots) ? factCard.slots : null
  const slotsLineUp = adminSlots && adminSlots.length === list.length
  /** @type {{ n: number, reason: string }[]} */
  const fails = []
  list.forEach((q, index) => {
    if (!q || q.placeholder === true) return
    const n =
      typeof checkOpts?.indexOf === 'function' ? Number(checkOpts.indexOf(q, index)) + 1 || index + 1 : index + 1
    const text = String(q.text ?? '')
    const passage = String(q.passageText ?? '').trim()
    const opts = filled(q.options)
    const type = String(q.questionType || '')
    const reasons = []
    for (const part of [text, passage, ...opts]) {
      const draw = mathDrawFailure(part)
      if (draw) {
        reasons.push(draw === 'draw failure' ? 'The math did not draw' : draw === 'leftover TeX' ? 'TeX is still showing after drawing' : draw)
        break
      }
    }
    const lost = nothingLost(q, ocr)
    if (lost) reasons.push(lost)
    if (/single_correct|multiple_correct|matrix_match/.test(type)) {
      if (opts.length < 2) reasons.push('An MCQ option is empty')
      const seen = new Set()
      for (const opt of opts) {
        const key = norm(opt)
        if (seen.has(key)) reasons.push('Two options are the same')
        seen.add(key)
      }
    }
    const label = optionLabelMissing(q)
    if (label) reasons.push(label)
    if (!adminSlots && OPENING.test(text.trim()) && !passage) reasons.push('This question has no passage')
    if (/shown in the figure/i.test(text) && !cardHasFigure(q)) {
      reasons.push('The question says shown in the figure, and there is no figure')
    }
    const answer = answerNotInOptions(q)
    if (answer) reasons.push(answer)
    if (adminSlots) reasons.push(...adminFactReasons(q, slotsLineUp ? adminSlots[index] : null))
    if (reasons.length) fails.push({ n, reason: reasons[0] })
  })
  const messages = cardsOnly ? [] : paperLevelMessages(list, factCard, adminSlots)
  const byReason = new Map()
  for (const fail of fails) {
    const nums = byReason.get(fail.reason) || []
    nums.push(fail.n)
    byReason.set(fail.reason, nums)
  }
  for (const [reason, nums] of byReason) {
    messages.push(`Go to Q ${nums.join(', ')}. ${reason}.`)
  }
  const failedGoTo = fails.map((fail) => fail.n)
  const passed = failedGoTo.length === 0 && messages.length === 0 && list.length > 0
  return { passed, failedGoTo, messages, facts: factCard }
}
