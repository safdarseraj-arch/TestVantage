/**
 * Admin "Edit question" on a PENDING Official PYQ card.
 * Saves into the same pending store the preview reads, marks the card as
 * edited by admin (re-parse / heal / quality fix then leave it alone), and
 * re-runs the shared local quality check for that card. Never publishes.
 */

import {
  getOfficialPyqPendingOcrText,
  getOfficialPyqPendingPaper,
  officialPyqCardIsAdminEdited,
  updateOfficialPyqPendingPaper,
} from './officialPyqPendingStore.js'
import {
  LOCAL_QUALITY_REVISION,
  localOfficialPyqQualityCheck,
  officialPyqCardDamageReason,
  persistOfficialPyqQualityRun,
} from './officialPyqLocalQuality.js'
import { officialPyqCardAsShown } from './officialPyqCardAsShown.js'
import { ORIGINAL_CROP_URL_PREFIX, consumeIncludeGraphics, isOriginalCropUrl } from './mathpixMedia.js'
import { textWithOriginalFigureCrops } from './officialPyqCardTidy.js'
import { paperItemsFromMathpixOcr } from './mathpixQuestionSplit.js'
import { gridColLabels, gridFieldsOf, isMatrixGridCard } from './matrixGridPyq.js'
import {
  formatLetterChoice,
  formatNumericChoice,
  isZeroMarksToAllKey,
  letterAlternativesOf,
  numericChoiceFields,
  numericalAlternativesOf,
  parseLetterAnswerChoices,
  parseNumericAnswerChoices,
} from './answerAlternatives.js'
import { detectAnswerFromPaper } from './answerProvenance.js'
import { dropOptionFigureRepeatingStem } from './optionRepeatsStemFigure.js'

export const OFFICIAL_PYQ_CARD_CHANGED_EVENT = 'testvantage:official-pyq-card-changed'

const BONUS_KEY_TEXT = 'Bonus (marks to all)'
const ZERO_KEY_TEXT = 'Zero marks to all'

const LETTERS = 'ABCDEFGH'

/** Earlier versions kept on each card for "Undo last edit". Kept small: browser storage is shared. */
export const OFFICIAL_PYQ_EDIT_HISTORY_MAX = 5

const SNAPSHOT_FIELDS = [
  'text',
  'stem',
  'passageText',
  'passageSource',
  'options',
  'correctIndex',
  'correctIndices',
  'correctInteger',
  'correctNumerical',
  'numericalTolerance',
  'numericalAlternatives',
  'correctIndicesAlternatives',
  'bonusMarksToAll',
  'zeroMarksToAll',
  'matrixRows',
  'matrixCols',
  'matrixAnswerKey',
  'matrixAnswerAlternates',
  'answerSource',
  'answerFromOriginalPage',
  'questionImage',
  'adminEdited',
  'adminEditedAt',
  'adminApproved',
  'adminApprovedAt',
  'editSource',
]
/** Not changed by the Edit box; a later Hybrid AI fill must survive an undo, so these are kept only when they differ. */
const SNAPSHOT_FIELDS_IF_CHANGED = ['solution', 'solutionSource']

/** @param {any} before @param {any} after */
function cardSnapshot(before, after) {
  /** @type {Record<string, unknown>} */
  const card = {}
  for (const field of SNAPSHOT_FIELDS) {
    if (before?.[field] !== undefined) card[field] = before[field]
  }
  for (const field of SNAPSHOT_FIELDS_IF_CHANGED) {
    if (JSON.stringify(before?.[field]) !== JSON.stringify(after?.[field])) card[field] = before?.[field] ?? null
  }
  return { savedAt: Date.now(), card }
}

/**
 * `after` with `before` pushed onto its edit history (newest first).
 * @param {any} before @param {any} after
 */
export function withOfficialPyqEditHistory(before, after) {
  const prior = Array.isArray(before?.editHistory) ? before.editHistory : []
  return {
    ...after,
    editHistory: [cardSnapshot(before, after), ...prior].slice(0, OFFICIAL_PYQ_EDIT_HISTORY_MAX),
  }
}

/** @param {any} card @param {Record<string, unknown>} snap */
function cardFromSnapshot(card, snap) {
  const next = { ...card }
  for (const field of SNAPSHOT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(snap, field)) next[field] = snap[field]
    else delete next[field]
  }
  for (const field of SNAPSHOT_FIELDS_IF_CHANGED) {
    if (!Object.prototype.hasOwnProperty.call(snap, field)) continue
    if (snap[field] == null) delete next[field]
    else next[field] = snap[field]
  }
  return next
}

const CROP_FILE_RE = /^[A-Za-z0-9_.-]{1,160}\.png(?:\?[A-Za-z0-9_.=&-]*)?$/

/** @param {string} url */
function figureUrlProblem(url) {
  const u = String(url ?? '').trim()
  if (/^https?:\/\/\S+$/i.test(u)) return ''
  if (isOriginalCropUrl(u) && CROP_FILE_RE.test(u.slice(ORIGINAL_CROP_URL_PREFIX.length))) return ''
  return `the picture address "${u.slice(0, 60)}${u.length > 60 ? '…' : ''}" is cut off or wrong`
}

/**
 * Why the figure lines in this text would show as code instead of a picture, or ''.
 * @param {unknown} text
 */
export function officialPyqFigureMarkupProblem(text) {
  const t = String(text ?? '')
  let at = t.indexOf('\\includegraphics')
  while (at >= 0) {
    const g = consumeIncludeGraphics(t, at)
    if (!g?.url || t[g.end - 1] !== '}') return 'a picture line (\\includegraphics{…}) is cut off — it has no closing }'
    const bad = figureUrlProblem(g.url)
    if (bad) return bad
    at = t.indexOf('\\includegraphics', g.end)
  }
  for (const m of t.matchAll(/!\[[^\]]*\]\(([^)]*)(\)?)/g)) {
    if (!m[2]) return 'a picture line (![](…)) is cut off — it has no closing )'
    const bad = figureUrlProblem(m[1])
    if (bad) return bad
  }
  return ''
}

/**
 * First broken picture line in a draft, e.g. "Question text: the picture address … is cut off".
 * @param {{ text?: string, passageText?: string, options?: string[] }} draft
 */
export function officialPyqDraftFigureProblem(draft) {
  const parts = [
    ['Question text', draft?.text],
    ['Passage', draft?.passageText],
    ...(Array.isArray(draft?.options) ? draft.options : []).map((o, i) => [`Option ${LETTERS[i] ?? i + 1}`, o]),
  ]
  for (const [where, value] of parts) {
    const bad = officialPyqFigureMarkupProblem(value)
    if (bad) return `${where}: ${bad}`
  }
  return ''
}

/**
 * Put a picture cropped from the original page into the draft. An option picture
 * replaces that option; question / passage pictures go on a new line at the end.
 * @param {{ text: string, passageText: string, options: string[] }} draft
 * @param {string} target 'text' | 'passage' | option index
 * @param {string} url
 */
export function insertOfficialPyqCropFigure(draft, target, url) {
  const bad = figureUrlProblem(url)
  if (bad) throw new Error(`The helper returned a bad picture address: ${bad}.`)
  const fig = `\\includegraphics{${String(url).trim()}}`
  if (target === 'text') return { ...draft, text: `${String(draft.text ?? '').trimEnd()}\n${fig}`.trim() }
  if (target === 'passage') {
    return { ...draft, passageText: `${String(draft.passageText ?? '').trimEnd()}\n${fig}`.trim() }
  }
  const options = (draft.options || []).slice()
  options[Number(target)] = fig
  return { ...draft, options }
}

const FIGURE_MARKUP = /\\includegraphics(?:\[[^\]]*\])?\{[^}]+\}|!\[[^\]]*\]\([^)]+\)/g
const SMILES_MARKUP = /<smiles>[\s\S]*?<\/smiles>/gi
const FIGURE_PLACEHOLDER = /\[\s*figure\s*\d*\s*\]/gi
const OPTION_LABEL = /^\s*(?:\(\s*[A-Da-d1-4]\s*\)|[A-Da-d][.)])\s*/

/** @param {unknown} text */
function withoutFigurePlaceholders(text) {
  return String(text ?? '').replace(FIGURE_PLACEHOLDER, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** @param {unknown} option */
export function officialPyqOptionHasContent(option) {
  return Boolean(withoutFigurePlaceholders(String(option ?? '').replace(OPTION_LABEL, '')))
}

/** @param {unknown} urls */
function cropUrls(urls) {
  return (Array.isArray(urls) ? urls : []).map((u) => String(u ?? '').trim()).filter((u) => u && isOriginalCropUrl(u) && !figureUrlProblem(u))
}

/**
 * Pictures Compare cut out of the original page, by place. Only crop addresses are kept.
 * @param {any} raw
 * @returns {{ text: string[], passage: string[], options: string[][] }}
 */
export function officialPyqSuggestedFigures(raw) {
  const options = (Array.isArray(raw?.options) ? raw.options : []).map(cropUrls)
  while (options.length && !options[options.length - 1].length) options.pop()
  return { text: cropUrls(raw?.text), passage: cropUrls(raw?.passage), options }
}

/** @param {{ text: string[], passage: string[], options: string[][] }} figures */
function figureCount(figures) {
  return figures.text.length + figures.passage.length + figures.options.reduce((n, o) => n + o.length, 0)
}

/**
 * Does this compare result carry anything "Fix it now" can save?
 * @param {any} compare card.originalCompare
 */
export function officialPyqCompareHasSuggestion(compare) {
  return (
    Boolean(withoutFigurePlaceholders(compare?.suggestedText)) ||
    Boolean(withoutFigurePlaceholders(compare?.suggestedPassage)) ||
    (Array.isArray(compare?.suggestedOptions) ? compare.suggestedOptions : []).some(officialPyqOptionHasContent) ||
    figureCount(officialPyqSuggestedFigures(compare?.suggestedFigures)) > 0
  )
}

/** @param {any} card */
export function officialPyqDraftFromCard(card) {
  const draft = {
    text: String(card?.text ?? card?.stem ?? ''),
    passageText: String(card?.passageText ?? ''),
    options: Array.isArray(card?.options) ? card.options.map((o) => String(o ?? '')) : [],
    answerKey: formatOfficialPyqAnswerKey(card),
    removeFigure: false,
  }
  if (!isMatrixGridCard(card)) return draft
  return {
    ...draft,
    options: [],
    grid: true,
    matrixRows: (card.matrixRows || []).map((r) => String(r ?? '')),
    matrixCols: (card.matrixCols || []).map((c) => String(c ?? '')),
    matrixAnswerKey: gridKeyCopy(card.matrixAnswerKey),
  }
}

/** @param {unknown} key */
function gridKeyCopy(key) {
  /** @type {Record<number, number[]>} */
  const out = {}
  if (!key || typeof key !== 'object') return out
  for (const [row, cols] of Object.entries(key)) {
    const list = (Array.isArray(cols) ? cols : [cols]).map(Number).filter(Number.isInteger)
    if (list.length) out[Number(row)] = [...new Set(list)].sort((a, b) => a - b)
  }
  return out
}

/** "A-R; B-P,S" for a grid key. @param {any} q @param {unknown} key */
function gridKeyText(q, key) {
  const labels = gridColLabels(q)
  const map = gridKeyCopy(key)
  return Object.keys(map)
    .map(Number)
    .sort((a, b) => a - b)
    .map((r) => `${String.fromCharCode(65 + r)}-${map[r].map((c) => labels[c] ?? String(c + 1)).join(',')}`)
    .join('; ')
}

/** A text-only correction must not lose a picture the card already shows. */
function keepCardFigures(before, after) {
  const next = withoutFigurePlaceholders(after)
  const lost = (String(before ?? '').match(FIGURE_MARKUP) || []).filter((fig) => {
    const url = fig.match(/https?:\/\/[^\s)}]+/)?.[0]
    return !next.includes(url || fig)
  })
  return lost.length ? `${next}\n${lost.join('\n')}` : next
}

/**
 * Crops replace the old pictures and SMILES of one place. Each [figure] in the corrected text takes
 * the next crop (the last one takes the rest); without corrected text the crops go where the
 * first old picture / SMILES was, else at the end.
 * @param {string} before @param {string} suggested @param {string[]} urls
 */
function placeCropFigures(before, suggested, urls) {
  const figs = urls.map((u) => `\\includegraphics{${u}}`)
  let text = String(suggested ?? '').trim()
  if (text) text = text.replace(FIGURE_MARKUP, '').replace(SMILES_MARKUP, '')
  else {
    let first = true
    text = String(before ?? '').replace(new RegExp(`${FIGURE_MARKUP.source}|${SMILES_MARKUP.source}`, 'gi'), () => {
      const mark = first ? '[figure]' : ''
      first = false
      return mark
    })
  }
  const marks = (text.match(FIGURE_PLACEHOLDER) || []).length
  if (!marks) text = `${text}\n[figure]`
  let used = 0
  let seen = 0
  text = text.replace(/\s*\[\s*figure\s*\d*\s*\]\s*/gi, () => {
    seen += 1
    const take = seen === Math.max(marks, 1) ? figs.slice(used) : figs.slice(used, used + 1)
    used += take.length
    return take.length ? `\n${take.join('\n')}\n` : ' '
  })
  return text.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Compare rewrote a match-the-list card as a code table (2014 P2 Q37). The lists already on the
 * card are kept; only the pictures cut from the original page are used.
 * @param {string} before
 * @param {string} suggested
 */
function suggestionDropsTheLists(before, suggested) {
  const cardHasLists = /(?:List|Column)[ \t]*[-–]?[ \t]*I\b/i.test(before) && /(?:^|\n)[ \t]*\(\s*P\s*\)/.test(before)
  const addsTable = /\\begin\{tabular\}/i.test(suggested) && !/\\begin\{tabular\}/i.test(before)
  const addsCodes = /(?:^|\n)[ \t]*Codes?[ \t]*:/i.test(suggested) && !/(?:^|\n)[ \t]*Codes?[ \t]*:/i.test(before)
  return cardHasLists && (addsTable || addsCodes)
}

/**
 * Draft from a Compare suggestion: corrected words from the page, and pictures cut out of the
 * original page where the card had broken SMILES / pictures. Nothing is drawn by Gemini.
 * A suggestion that turns a match list into a code table is not used; the pictures still are.
 * @param {any} card
 * @param {{ suggestedText?: string, suggestedOptions?: string[], suggestedPassage?: string, suggestedFigures?: any }} compare
 */
export function officialPyqDraftFromSuggestion(card, compare) {
  const base = officialPyqDraftFromCard(card)
  const figures = officialPyqSuggestedFigures(compare?.suggestedFigures)
  const text = String(compare?.suggestedText ?? '').trim()
  const passage = String(compare?.suggestedPassage ?? '').trim()
  const opts = Array.isArray(compare?.suggestedOptions) ? compare.suggestedOptions : []
  if (figures.text.length && suggestionDropsTheLists(base.text, text)) {
    const kept = textWithOriginalFigureCrops(base.text, figures.text)
    if (kept) return { ...base, text: kept }
  }
  const count = Math.max(base.options.length, opts.length, figures.options.length)
  /** Gemini sends "(A)" or "" for a drawing it cannot write; the card's own option stays then. */
  const options = Array.from({ length: count }, (_, i) => {
    const suggested = String(opts[i] ?? '').replace(OPTION_LABEL, '')
    const crops = figures.options[i] || []
    if (crops.length) return placeCropFigures('', officialPyqOptionHasContent(suggested) ? suggested : '[figure]', crops)
    return officialPyqOptionHasContent(suggested) ? keepCardFigures(base.options[i], suggested) : String(base.options[i] ?? '')
  })
  const fix = (before, suggested, crops) => {
    if (crops.length) return placeCropFigures(before, withoutFigurePlaceholders(suggested) ? suggested : '', crops)
    return withoutFigurePlaceholders(suggested) ? keepCardFigures(before, suggested) : before
  }
  const printed = officialPyqPrintedAnswerPatch(card, compare)
  /** A kept card picture must not come back on an option when it is the question's own figure (2013 P1 Q15). */
  return dropOptionFigureRepeatingStem({
    ...base,
    text: fix(base.text, text, figures.text),
    passageText: fix(base.passageText, passage, figures.passage),
    options,
    ...(printed ? { answerKey: formatOfficialPyqAnswerKey(printed), answerFromPage: true } : {}),
  })
}

const PRINTED_ANSWER_FIELDS = [
  'correctIndex',
  'correctIndices',
  'correctInteger',
  'correctNumerical',
  'numericalTolerance',
  'numericalAlternatives',
  'correctIndicesAlternatives',
  'bonusMarksToAll',
  'zeroMarksToAll',
]

/**
 * The answer key Compare read printed on the original page, as answer fields; null when the page
 * prints none. The scan often loses an "ANSWER : A" line at the foot of a page (2013 P1 Q2, Q8).
 * @param {unknown} printed
 * @param {any} [card]
 */
export function officialPyqPrintedAnswerFields(printed, card) {
  const raw = String(printed ?? '').trim().replace(/^(?:ANSWER|Ans(?:wer)?|Key)\s*[:.\-=]?\s*/i, '').replace(/[.;]\s*$/, '')
  if (!raw) return null
  const type = String(card?.questionType ?? '')
  const multi = /multiple/i.test(type) || Array.isArray(card?.correctIndices)
  /** Either of two option sets scores only on a one-or-more-correct card; "A or C" on a one-answer card needs a person. */
  if (/\bor\b/i.test(raw) && /\b[A-D]{1,4}\b/.test(raw.replace(/\bor\b/gi, '')) && !(multi && parseLetterAnswerChoices(raw))) return null
  const hint = multi
    ? { correctIndices: [] }
    : /integer/i.test(type) || card?.correctInteger != null
      ? { correctInteger: 0 }
      : card
  const typed = parseOfficialPyqAnswerKey(raw.replace(/^\(?([A-H])\)?$/i, '$1'), hint)
  /** @type {Record<string, unknown>} */
  const fields = {}
  const read = typed.ok ? typed.patch : detectAnswerFromPaper(`ANSWER : ${raw}`)
  if (!typed.ok && read.answerSource !== 'from_paper') return null
  for (const key of PRINTED_ANSWER_FIELDS) if (read[key] != null) fields[key] = read[key]
  return Object.keys(fields).length ? fields : null
}

/**
 * Answer fields to save when the key printed on the page is missing from the card or differs
 * from it; null when it matches or the page prints none.
 * @param {any} card @param {any} compare card.originalCompare (or a raw Compare result)
 */
export function officialPyqPrintedAnswerPatch(card, compare) {
  if (!card || isMatrixGridCard(card)) return null
  const fields = officialPyqPrintedAnswerFields(compare?.printedAnswer ?? compare?.printed_answer, card)
  if (!fields) return null
  const options = Array.isArray(card.options) ? card.options : []
  const optionCount = options.some((o) => String(o ?? '').trim()) ? options.length : 0
  const letters = [
    fields.correctIndex,
    ...(Array.isArray(fields.correctIndices) ? fields.correctIndices : []),
    ...letterAlternativesOf(fields).flat(),
  ].filter((i) => i != null)
  if (letters.length && letters.some((i) => Number(i) >= Math.max(optionCount, 1))) return null
  if (!letters.length && fields.bonusMarksToAll !== true && fields.zeroMarksToAll !== true && optionCount >= 2) return null
  return formatOfficialPyqAnswerKey(fields) === formatOfficialPyqAnswerKey(card) ? null : fields
}

/** @param {any} q */
export function officialPyqCardHasAnswerKey(q) {
  if (!q || typeof q !== 'object') return false
  if (q.bonusMarksToAll === true || q.zeroMarksToAll === true) return true
  if (isMatrixGridCard(q)) return Object.keys(gridKeyCopy(q.matrixAnswerKey)).length > 0
  if (Array.isArray(q.correctIndices) && q.correctIndices.length) return true
  return [q.correctIndex, q.correctInteger, q.correctNumerical].some(
    (v) => v != null && String(v).trim() !== '' && Number.isFinite(Number(v)),
  )
}

/** @param {any} q */
export function formatOfficialPyqAnswerKey(q) {
  if (!q || typeof q !== 'object') return ''
  if (q.bonusMarksToAll === true) return BONUS_KEY_TEXT
  if (q.zeroMarksToAll === true) return ZERO_KEY_TEXT
  if (isMatrixGridCard(q)) return gridKeyText(q, q.matrixAnswerKey)
  const alternatives = numericalAlternativesOf(q)
  if (alternatives.length && (q.correctNumerical != null || q.correctInteger != null)) {
    const main = { value: Number(q.correctNumerical ?? q.correctInteger), tolerance: q.numericalTolerance }
    return [main, ...alternatives].map(formatNumericChoice).join(' OR ')
  }
  if (Array.isArray(q.correctIndices) && q.correctIndices.length) {
    const main = q.correctIndices.map((i) => LETTERS[Number(i)] ?? String(i)).join(', ')
    return [main, ...letterAlternativesOf(q).map(formatLetterChoice)].join(' OR ')
  }
  if (q.correctIndex != null && Number.isFinite(Number(q.correctIndex))) {
    return LETTERS[Number(q.correctIndex)] ?? String(q.correctIndex)
  }
  if (q.correctNumerical != null && String(q.correctNumerical).trim() !== '') {
    const mid = Number(q.correctNumerical)
    const tol = Number(q.numericalTolerance)
    if (Number.isFinite(mid) && Number.isFinite(tol) && tol > 0) {
      return `${Number((mid - tol).toFixed(6))} to ${Number((mid + tol).toFixed(6))}`
    }
    return String(q.correctNumerical)
  }
  if (q.correctInteger != null && String(q.correctInteger).trim() !== '') return String(q.correctInteger)
  return ''
}

/**
 * Letters (A / A, C) for option questions, a number for numeric ones.
 * @param {string} raw
 * @param {any} card
 * @returns {{ ok: true, patch: Record<string, unknown> } | { ok: false, error: string }}
 */
export function parseOfficialPyqAnswerKey(raw, card) {
  const text = String(raw ?? '').trim()
  const cleared = {
    correctIndex: undefined,
    correctIndices: undefined,
    correctInteger: undefined,
    correctNumerical: undefined,
    numericalTolerance: undefined,
    numericalAlternatives: undefined,
    correctIndicesAlternatives: undefined,
    bonusMarksToAll: undefined,
    zeroMarksToAll: undefined,
  }
  if (!text) return { ok: true, patch: cleared }
  if (isZeroMarksToAllKey(text)) return { ok: true, patch: { ...cleared, zeroMarksToAll: true } }
  const letterSets = parseLetterAnswerChoices(text)
  if (letterSets) {
    const multi = Array.isArray(card?.correctIndices) || /multiple/i.test(String(card?.questionType ?? ''))
    if (!multi) return { ok: false, error: 'Answer key: two option answers joined by OR fit only a one-or-more-correct question.' }
    const [first, ...rest] = letterSets
    return { ok: true, patch: { ...cleared, correctIndices: first, correctIndicesAlternatives: rest } }
  }
  if (/^(?:bonus|marks\s+to\s+all)\b/i.test(text)) return { ok: true, patch: { ...cleared, bonusMarksToAll: true } }
  const choices = parseNumericAnswerChoices(text)
  if (choices) return { ok: true, patch: { ...cleared, ...numericChoiceFields(choices) } }
  const band = text.match(/^\[?\s*(-?\d+(?:\.\d+)?)\s*(?:to|–|—)\s*(-?\d+(?:\.\d+)?)\s*\]?$/i)
  if (band && Number(band[2]) > Number(band[1])) {
    const low = Number(band[1])
    const high = Number(band[2])
    return {
      ok: true,
      patch: {
        ...cleared,
        correctNumerical: Number(((low + high) / 2).toFixed(6)),
        numericalTolerance: Number(((high - low) / 2).toFixed(6)),
      },
    }
  }
  const letters = text.toUpperCase().match(/^[A-H](?:\s*[,/&\s]\s*[A-H])*$/)
  if (letters) {
    const idx = Array.from(new Set(text.toUpperCase().match(/[A-H]/g) || [])).map((l) => LETTERS.indexOf(l))
    const multi = idx.length > 1 || Array.isArray(card?.correctIndices)
    return {
      ok: true,
      patch: multi
        ? { ...cleared, correctIndices: idx.sort((a, b) => a - b) }
        : { ...cleared, correctIndex: idx[0] },
    }
  }
  const num = Number(text)
  if (Number.isFinite(num)) {
    const integerCard = card?.correctInteger != null && card?.correctNumerical == null
    return {
      ok: true,
      patch: integerCard && Number.isInteger(num)
        ? { ...cleared, correctInteger: num }
        : { ...cleared, correctNumerical: num },
    }
  }
  return {
    ok: false,
    error: 'Answer key: use option letters (A or A, C), a number, a range (0.27 to 0.33), two answers (0.5 OR 0.75), or Bonus.',
  }
}

/** An integer / numerical card has no options; all-blank option boxes only trip the quality check. @param {any} card */
function dropBlankNumericOptions(card) {
  const type = String(card?.questionType ?? '').toLowerCase()
  if (!['integer', 'numerical'].includes(type) || !Array.isArray(card.options)) return card
  if (!card.options.length || card.options.some((o) => String(o ?? '').trim())) return card
  return { ...card, options: [] }
}

/** @param {Record<string, unknown>} obj */
function dropUndefined(obj) {
  const out = { ...obj }
  for (const key of Object.keys(out)) if (out[key] === undefined) delete out[key]
  return out
}

/**
 * Card with the draft applied — used for the live preview and for Save.
 * @param {any} card
 * @param {{ text: string, options: string[], answerKey?: string, removeFigure?: boolean, passageText?: string }} draft
 */
export function applyOfficialPyqCardDraft(card, draft) {
  const base = card && typeof card === 'object' ? card : {}
  const next = { ...base, text: String(draft.text ?? '') }
  if (Object.prototype.hasOwnProperty.call(base, 'stem')) next.stem = next.text
  if (Array.isArray(draft.options)) next.options = draft.options.map((o) => String(o ?? ''))
  if (draft.grid && isMatrixGridCard(base)) {
    next.options = []
    if (Array.isArray(draft.matrixRows)) next.matrixRows = draft.matrixRows.map((r) => String(r ?? ''))
    if (Array.isArray(draft.matrixCols)) {
      next.matrixCols = draft.matrixCols.map((c) => String(c ?? ''))
      next.matrixColCount = next.matrixCols.length
    }
    if (draft.matrixAnswerKey) next.matrixAnswerKey = gridKeyCopy(draft.matrixAnswerKey)
  }
  if (draft.removeFigure) delete next.questionImage
  if (typeof draft.passageText === 'string') {
    const passage = draft.passageText.trim()
    if (passage) next.passageText = passage
    else delete next.passageText
  }
  return next
}

/**
 * 0-based indexes of the cards that share this card's passage (itself included).
 * @param {any[]} questions
 * @param {number} index
 */
export function officialPyqPassageGroupIndexes(questions, index) {
  const list = Array.isArray(questions) ? questions : []
  const card = list[index]
  const id = String(card?.passageId || card?.passageGroup || '').trim()
  if (!id) return [index]
  const out = []
  list.forEach((q, i) => {
    if (String(q?.passageId || q?.passageGroup || '').trim() === id) out.push(i)
  })
  return out.includes(index) ? out : [index]
}

/**
 * @param {string} paperId
 * @param {number} index 0-based card index on the paper
 * @param {{ text: string, options: string[], answerKey?: string, answerFromPage?: boolean, removeFigure?: boolean }} draft
 */
export function saveOfficialPyqCardEdit(paperId, index, draft) {
  const paper = getOfficialPyqPendingPaper(paperId)
  if (!paper) return { ok: false, error: 'Paper not found.' }
  if (String(paper.status) !== 'pending_review') {
    return { ok: false, error: 'Only a pending paper can be edited here. Published questions stay locked.' }
  }
  const questions = Array.isArray(paper.questions) ? paper.questions.slice() : []
  const card = questions[index]
  if (!card) return { ok: false, error: 'Question not found on this paper.' }
  if (!String(draft.text ?? '').trim()) return { ok: false, error: 'Question text cannot be empty.' }
  const figureProblem = officialPyqDraftFigureProblem(draft)
  if (figureProblem) {
    return {
      ok: false,
      error: `Not saved. ${figureProblem}. Put the picture in again with "Crop a picture from this page", or delete that whole line.`,
    }
  }
  let next = dropBlankNumericOptions(applyOfficialPyqCardDraft(card, draft))
  if (isMatrixGridCard(card)) {
    const rows = (next.matrixRows || []).filter((r) => String(r ?? '').trim()).length
    const cols = (next.matrixCols || []).filter((c) => String(c ?? '').trim()).length
    if (!rows || !cols) return { ok: false, error: 'Column I and Column II each need at least one row.' }
    if (gridKeyText(next, next.matrixAnswerKey) !== gridKeyText(card, card.matrixAnswerKey)) {
      next.answerSource = 'admin_edit'
      next.matrixAnswerAlternates = undefined
      if (!Object.keys(next.matrixAnswerKey || {}).length) next.matrixAnswerKey = undefined
    }
  } else if (officialPyqCardHasAnswerKey(card) || String(draft.answerKey ?? '').trim()) {
    const parsed = parseOfficialPyqAnswerKey(draft.answerKey ?? '', card)
    if (!parsed.ok) return parsed
    next = { ...next, ...parsed.patch }
    if (String(draft.answerKey ?? '').trim() !== formatOfficialPyqAnswerKey(card)) {
      next.answerSource = draft.answerFromPage === true ? 'from_paper' : 'admin_edit'
      next.answerFromOriginalPage = draft.answerFromPage === true ? true : undefined
    }
  }
  const prevAt = Number(card.adminEditedAt) || 0
  const editedAt = Math.max(Date.now(), prevAt + 1)
  const passageChanged =
    typeof draft.passageText === 'string' &&
    draft.passageText.trim() !== String(card.passageText ?? '').trim()
  next = dropUndefined({
    ...next,
    ...(passageChanged ? { passageSource: 'admin_edit' } : {}),
    pyqSlot: card.pyqSlot ?? index + 1,
    adminEdited: true,
    adminEditedAt: editedAt,
    adminApproved: undefined,
    adminApprovedAt: undefined,
    originalCompare: undefined,
    editSource: draft.source ? String(draft.source) : undefined,
  })
  questions[index] = withOfficialPyqEditHistory(card, next)
  if (passageChanged) {
    for (const i of officialPyqPassageGroupIndexes(questions, index)) {
      if (i === index || !questions[i]) continue
      const mate = { ...questions[i], passageSource: 'admin_edit', adminEdited: true }
      delete mate.adminApproved
      delete mate.adminApprovedAt
      if (next.passageText) mate.passageText = next.passageText
      else delete mate.passageText
      mate.adminEditedAt = Math.max(editedAt, (Number(questions[i].adminEditedAt) || 0) + 1)
      questions[i] = withOfficialPyqEditHistory(questions[i], mate)
    }
  }
  const saved = updateOfficialPyqPendingPaper(paper.id, { questions })
  if (!saved) return { ok: false, error: 'Could not save — browser storage may be full.' }
  const mates = passageChanged ? officialPyqPassageGroupIndexes(questions, index).filter((i) => i !== index) : []
  for (const i of mates) recheckOfficialPyqCardQuality(paper.id, i)
  const checked = recheckOfficialPyqCardQuality(paper.id, index) || saved
  const card2 = (checked.questions || saved.questions || [])[index] || next
  for (const i of mates) notifyOfficialPyqCardChanged(paper.id, i)
  notifyOfficialPyqCardChanged(paper.id, index)
  return { ok: true, paper: checked, card: card2, passageShared: mates.map((i) => i + 1) }
}

/** @param {string} paperId @param {number} index */
function pendingCardFor(paperId, index) {
  const paper = getOfficialPyqPendingPaper(paperId)
  if (!paper) return { error: 'Paper not found.' }
  if (String(paper.status) !== 'pending_review') {
    return { error: 'Only a pending paper can be changed here. Published questions stay locked.' }
  }
  const questions = Array.isArray(paper.questions) ? paper.questions.slice() : []
  const card = questions[index]
  if (!card) return { error: 'Question not found on this paper.' }
  return { paper, questions, card }
}

/** @param {any} paper @param {any[]} questions @param {number} index */
function saveOneCard(paper, questions, index) {
  const saved = updateOfficialPyqPendingPaper(paper.id, { questions })
  if (!saved) return { ok: false, error: 'Could not save — browser storage may be full.' }
  const checked = recheckOfficialPyqCardQuality(paper.id, index) || saved
  notifyOfficialPyqCardChanged(paper.id, index)
  return { ok: true, paper: checked, card: (checked.questions || saved.questions || [])[index] || questions[index] }
}

/**
 * The card with the text, options and passage the review page draws. Edit and
 * Compare start from this, so a stored card that the display heal repairs (e.g.
 * option pictures left in the stem) is not edited or compared in its raw form.
 * @param {string} paperId
 * @param {any} card
 */
export function officialPyqCardForAdmin(paperId, card) {
  if (!card || typeof card !== 'object') return card
  let shown
  try {
    shown = officialPyqCardAsShown(card, getOfficialPyqPendingOcrText(paperId))
  } catch {
    return card
  }
  if (shown.healError || !shown.text.trim()) return card
  return {
    ...card,
    text: shown.text,
    options: shown.options.map((opt) => String(opt ?? '')),
    passageText: shown.passage,
  }
}

/**
 * Admin approves ONE pending card as it is drawn now. The drawn text, options,
 * passage and figure are saved, the card is locked like a hand edit, and the
 * quality checks skip it. Never publishes.
 * @param {string} paperId
 * @param {number} index 0-based card index
 */
export function approveOfficialPyqCard(paperId, index) {
  const found = pendingCardFor(paperId, index)
  if (found.error) return { ok: false, error: found.error }
  const { paper, questions, card } = found
  const shown = officialPyqCardAsShown(card, getOfficialPyqPendingOcrText(paper.id))
  if (shown.healError) {
    return { ok: false, error: 'This question could not be drawn, so it cannot be approved. Edit it first.' }
  }
  if (!shown.text.trim()) return { ok: false, error: 'Question text is empty. Edit it first.' }
  const at = Math.max(Date.now(), (Number(card.adminEditedAt) || 0) + 1)
  const next = {
    ...card,
    text: shown.text,
    options: shown.options.map((opt) => String(opt ?? '')),
    pyqSlot: card.pyqSlot ?? index + 1,
    adminEdited: true,
    adminEditedAt: at,
    adminApproved: true,
    adminApprovedAt: at,
  }
  delete next.originalCompare
  if (Object.prototype.hasOwnProperty.call(card, 'stem')) next.stem = shown.text
  if (shown.passage) next.passageText = shown.passage
  else delete next.passageText
  const figure = String(shown.healed?.questionImage ?? '').trim()
  if (figure) next.questionImage = figure
  questions[index] = withOfficialPyqEditHistory(card, next)
  return saveOneCard(paper, questions, index)
}

/** Save an undo, then re-run the paper's quality check so the red banner updates. */
function saveUndoneCard(paper, questions, index) {
  const saved = updateOfficialPyqPendingPaper(paper.id, { questions, releaseAdminEditIndexes: [index] })
  if (!saved) return { ok: false, error: 'Could not save — browser storage may be full.' }
  let checked = saved
  try {
    checked = persistOfficialPyqQualityRun(saved) || saved
  } catch {
    checked = recheckOfficialPyqCardQuality(paper.id, index) || saved
  }
  notifyOfficialPyqCardChanged(paper.id, index)
  return { ok: true, paper: checked, card: (checked.questions || saved.questions || [])[index] || questions[index] }
}

/**
 * Put back the version of ONE card from before its last admin save
 * (Edit question, crop picture, approve, or Go back to the scanned version).
 * @param {string} paperId
 * @param {number} index 0-based card index
 */
export function undoOfficialPyqCardEdit(paperId, index) {
  const found = pendingCardFor(paperId, index)
  if (found.error) return { ok: false, error: found.error }
  const { paper, questions, card } = found
  const history = Array.isArray(card.editHistory) ? card.editHistory : []
  const last = history[0]
  if (!last?.card || typeof last.card !== 'object') {
    return { ok: false, error: 'There is no earlier version of this question to go back to.' }
  }
  const next = cardFromSnapshot(card, last.card)
  delete next.originalCompare
  if (history.length > 1) next.editHistory = history.slice(1)
  else delete next.editHistory
  if (next.adminEdited === true) {
    next.adminEditedAt = Math.max(Date.now(), (Number(card.adminEditedAt) || 0) + 1)
  }
  questions[index] = next
  return { ...saveUndoneCard(paper, questions, index), restoredScan: next.adminEdited !== true }
}

/** @param {unknown} text */
function scanWords(text) {
  return new Set(
    String(text ?? '')
      .replace(/<smiles>[\s\S]*?<\/smiles>/gi, ' ')
      .replace(/\\[a-zA-Z]+/g, ' ')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3),
  )
}

/** The scan item for this card: same printed number and subject, else the closest words. */
function scanItemForCard(items, card) {
  const mine = scanWords(`${card?.passageText ?? ''} ${card?.text ?? ''}`)
  const overlap = (item) => {
    const theirs = scanWords(item?.text)
    if (!mine.size || !theirs.size) return 0
    let same = 0
    for (const w of theirs) if (mine.has(w)) same += 1
    return same / Math.max(theirs.size, 1)
  }
  const n = Number(card?.printedNumber)
  const subject = String(card?.subject ?? '')
  const numbered = items.filter(
    (it) => n > 0 && Number(it?.printedNumber) === n && (!subject || !it?.subject || String(it.subject) === subject),
  )
  const pool = numbered.length ? numbered : items
  let best = null
  let bestScore = numbered.length === 1 ? -1 : 0.5
  for (const it of pool) {
    const score = overlap(it)
    if (score > bestScore) {
      best = it
      bestScore = score
    }
  }
  return best
}

/**
 * "Go back to the scanned version": rebuild ONE card from the paper's stored
 * scan text and drop the admin lock, so re-parse / heal / quality fix look
 * after it again. The admin version stays in the edit history (Undo brings it back).
 * @param {string} paperId
 * @param {number} index 0-based card index
 */
export function restoreOfficialPyqCardFromScan(paperId, index) {
  const found = pendingCardFor(paperId, index)
  if (found.error) return { ok: false, error: found.error }
  const { paper, questions, card } = found
  const ocr = getOfficialPyqPendingOcrText(paper.id) || String(paper.preparedText ?? '')
  if (ocr.length < 80) return { ok: false, error: 'This paper has no stored scan text to rebuild the question from.' }
  let items = []
  try {
    items = paperItemsFromMathpixOcr(ocr)
  } catch {
    items = []
  }
  const item = scanItemForCard(Array.isArray(items) ? items : [], card)
  if (!item || !String(item.text ?? '').trim()) {
    return { ok: false, error: 'Could not find this question in the stored scan. Use Edit question instead.' }
  }
  const next = dropBlankNumericOptions({
    ...card,
    text: String(item.text),
    options: Array.isArray(item.options) ? item.options.map((o) => String(o ?? '')) : [],
    ...(isMatrixGridCard(item) || isMatrixGridCard(card) ? gridFieldsOf(item) : {}),
  })
  if (isMatrixGridCard(card) && !isMatrixGridCard(item)) delete next.matrixResponseMode
  for (const field of Object.keys(next)) if (next[field] === undefined) delete next[field]
  if (Object.prototype.hasOwnProperty.call(card, 'stem')) next.stem = next.text
  if (card.passageSource === 'admin_edit') {
    if (String(item.passageText ?? '').trim()) next.passageText = String(item.passageText)
    else delete next.passageText
    delete next.passageSource
  }
  for (const field of ['adminEdited', 'adminEditedAt', 'adminApproved', 'adminApprovedAt', 'originalCompare']) {
    delete next[field]
  }
  questions[index] = withOfficialPyqEditHistory(card, next)
  return saveUndoneCard(paper, questions, index)
}

/**
 * Undo a per-question approval: quality checks look at the card again.
 * The card keeps its saved text and stays locked as edited by admin.
 * @param {string} paperId
 * @param {number} index 0-based card index
 */
export function unapproveOfficialPyqCard(paperId, index) {
  const found = pendingCardFor(paperId, index)
  if (found.error) return { ok: false, error: found.error }
  const { paper, questions, card } = found
  const next = { ...card, adminEditedAt: Math.max(Date.now(), (Number(card.adminEditedAt) || 0) + 1) }
  delete next.adminApproved
  delete next.adminApprovedAt
  questions[index] = next
  return saveOneCard(paper, questions, index)
}

/** "Go to Q 6, 19. Reason." without Q `go`; '' when no question is left on the line. */
function dropGoToFromLine(line, go) {
  const m = line.match(/^Go to Q ([\d,\s]+)\.\s*(.*)$/)
  if (!m) return line
  const nums = m[1].split(',').map((n) => Number(n.trim())).filter((n) => n && n !== go)
  return nums.length ? `Go to Q ${nums.join(', ')}. ${m[2]}` : ''
}

/**
 * Re-run the shared local check for ONE card and update that card's entry in
 * the paper's list mark. Never repairs or rewrites cards. A hand-edited card
 * is checked as typed (no OCR heal).
 * @param {string} paperId
 * @param {number} index 0-based card index
 */
export function recheckOfficialPyqCardQuality(paperId, index) {
  const full = getOfficialPyqPendingPaper(paperId)
  if (!full || String(full.status ?? '') !== 'pending_review') return null
  const questions = Array.isArray(full.questions) ? full.questions : []
  const paperOcr = getOfficialPyqPendingOcrText(paperId) || String(full.preparedText ?? '')
  const cardFails = (i) => {
    const q = questions[i]
    if (!q) return false
    const ocr = officialPyqCardIsAdminEdited(q) ? '' : paperOcr
    return (
      localOfficialPyqQualityCheck({ questions: [q], preparedText: ocr }).failedGoTo.length > 0 ||
      Boolean(officialPyqCardDamageReason({ ...full, preparedText: paperOcr }, i))
    )
  }
  let prior = full.localQuality
  // A check made on a different card list (a question lost or added since) cannot be patched one card at a time.
  const countMoved = Number.isFinite(Number(prior?.questionCount)) && Number(prior.questionCount) !== questions.length
  if (!prior || prior.revision !== LOCAL_QUALITY_REVISION || countMoved) {
    prior = localOfficialPyqQualityCheck({ ...full, preparedText: paperOcr })
    const failed = new Set(prior.failedGoTo)
    questions.forEach((q, i) => {
      if (!officialPyqCardIsAdminEdited(q)) return
      if (cardFails(i)) failed.add(i + 1)
      else failed.delete(i + 1)
    })
    prior = { ...prior, failedGoTo: Array.from(failed) }
  }
  const go = index + 1
  const failed = new Set(
    (Array.isArray(prior.failedGoTo) ? prior.failedGoTo : []).filter((n) => n !== go && n <= questions.length),
  )
  const stillFails = cardFails(index)
  if (stillFails) failed.add(go)
  const failedGoTo = Array.from(failed).sort((a, b) => a - b)
  // The card can fail for a new reason after a fix; the old wording would point at damage that is gone.
  const reason = stillFails ? officialPyqCardDamageReason({ ...full, preparedText: paperOcr }, index) : ''
  const lines = (Array.isArray(prior.lines) ? prior.lines : [])
    .map((line) => (stillFails && !reason ? line : dropGoToFromLine(String(line ?? ''), go)))
    .filter(Boolean)
  if (reason) lines.push(`Go to Q ${go}. ${reason}.`)
  /** A paper-wide line ("This paper has 47. Do not approve.") is not cleared by fixing one card. */
  const paperLevelProblem = lines.some((line) => !/^Go to Q\b/.test(String(line)))
  return updateOfficialPyqPendingPaper(full.id, {
    localQuality: {
      ...prior,
      passed: failedGoTo.length === 0 && questions.length > 0 && !paperLevelProblem,
      failedGoTo,
      lines,
      checkedAt: Date.now(),
      questionCount: questions.length,
    },
  })
}

/** @param {string} paperId @param {number} index */
export function notifyOfficialPyqCardChanged(paperId, index) {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(
      new CustomEvent(OFFICIAL_PYQ_CARD_CHANGED_EVENT, { detail: { paperId, index } }),
    )
  } catch {
    /* listeners are optional */
  }
}
