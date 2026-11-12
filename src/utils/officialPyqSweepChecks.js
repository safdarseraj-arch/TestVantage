/**
 * Read-only sweep of Official PYQ papers: one detector per error class seen so far.
 * Used by scripts/sweep-official-pyq-store.mjs (exported store file) and in the
 * browser over every saved paper, pending or published. Never edits a card.
 */
import { localOfficialPyqQualityCheck } from './officialPyqLocalQuality.js'
import { officialPyqDrawnRawCode, officialPyqDrawnText } from './officialPyqOriginalCompare.js'
import { officialPyqFigureMarkupProblem } from './officialPyqCardEdit.js'
import { prepareTextForMathTextDisplay } from './prepareMathForRender.js'
import { looksLikeMatchingListStem, parseMatchingListForDisplay } from './parseMatchingListDisplay.js'
import { LATEX_FENCE } from './latexTabularDisplay.js'
import { mathDrawFailure } from './mathDrawCheck.js'
import { sanitizeStemForDisplay } from './sanitizeStemForDisplay.js'
import { factsForPaper } from './officialPyqAdminFacts.js'
import { isOfficialPyqPlaceholder } from './officialPyqMissingSlots.js'

const SMASH = new RegExp(String.raw`\\left\s*${LATEX_FENCE}\s*\$|\$\$\s*\\right\b`)
/** A List-I heading line with its own first row right under it; two of these on one card means two questions were glued. */
const LIST_ONE_BLOCK =
  /(?:^|\n)[ \t]*(?:\\section\*?\{\s*)?(?:\\textbf\{\s*)?(?:List|Column)[ \t]*[-–]*[ \t]*I\b(?![ \t]*I)[^\n]{0,4}\n\s*\(?\s*(?:[PQRSTA-D]|I|1)\s*[.)]/gi
const filled = (opts) => (Array.isArray(opts) ? opts : []).map((o) => String(o ?? '').trim()).filter(Boolean)
const norm = (s) =>
  String(s ?? '')
    .replace(/^\(?[A-D]\)\s*/, '')
    .split(/(<smiles>[\s\S]*?<\/smiles>|\$[^$]*\$)/i)
    .map((part, i) => (i % 2 ? part : part.toLowerCase()))
    .join('')
    .replace(/\s+/g, '')
const isNumeric = (q) => /integer|numerical|numeric|nat|decimal/i.test(String(q?.questionType ?? ''))
const parts = (q) => [q?.passageText, q?.text, ...(Array.isArray(q?.options) ? q.options : [])].map((p) => String(p ?? ''))
const oddDollars = (s) => (String(s ?? '').replace(/\\\$/g, '').match(/\$/g) || []).length % 2 === 1

/** @param {string} text @param {unknown[]} options */
function matchListProblem(text, options) {
  if (!looksLikeMatchingListStem(text)) return ''
  let parsed
  try {
    parsed = parseMatchingListForDisplay(text, options)
  } catch {
    return 'match list does not parse'
  }
  if (!parsed && /\/api\/official-pyq\/original\/crops\//.test(text)) return ''
  const listI = parsed?.listI || []
  const listII = parsed?.listII || []
  if (!listI.length || !listII.length) return 'match list has an empty column'
  const unlabelled = [...listI, ...listII].filter((r) => !String(r?.label ?? '').trim())
  if (unlabelled.length) return 'a match-list row has no label'
  const optionText = filled(options).join(' ')
  const labelsII = new Set(listII.map((r) => String(r.label).replace(/[()\s]/g, '')))
  const labelsI = new Set(listI.map((r) => String(r.label).replace(/[()\s]/g, '')))
  const wanted = [...optionText.matchAll(/\(\s*([A-Z]|[IVX]{1,4}|\d)\s*\)|\b([PQRST]|[IVX]{1,4}|\d)\s*(?:→|->|\\rightarrow)/g)]
    .map((m) => m[1] || m[2])
  const missing = [...new Set(wanted)].filter((l) => !labelsII.has(l) && !labelsI.has(l))
  if (missing.length) return `options name rows the lists do not have: ${missing.join(', ')}`
  const emptyRow = [...listI, ...listII].find((r) => !String(r?.text ?? r?.body ?? '').trim() && !r?.figure)
  if (emptyRow) return `match-list row ${emptyRow.label} is empty`
  const brokenMath = [...listI, ...listII].find((r) => oddDollars(r?.text ?? r?.body))
  if (brokenMath) return `match-list row ${brokenMath.label} opens a $ it does not close`
  return ''
}

/** Printed numbers should run +1 inside a subject (restart) or across the paper (continuous). */
function printedNumberJumps(questions) {
  const bad = []
  let prev = null
  questions.forEach((q, i) => {
    if (!q || q.placeholder) return
    const n = Number(q.printedNumber ?? q.questionNumber ?? q.pyqSlot)
    if (!Number.isFinite(n) || n <= 0) return
    const subject = String(q.subject ?? '')
    if (prev && prev.subject === subject && n !== prev.n + 1) bad.push(i + 1)
    if (prev && prev.subject !== subject && n !== 1 && n !== prev.n + 1) bad.push(i + 1)
    prev = { n, subject }
  })
  return bad
}

/**
 * @param {any} paper
 * @returns {{ summary: Record<string, unknown>, hits: Record<string, number[]>, why: Record<string, string>, qualityLines: string[] }}
 */
export function sweepOfficialPyqPaper(paper) {
  const questions = Array.isArray(paper?.questions) ? paper.questions : []
  const real = questions.filter((q) => q && !isOfficialPyqPlaceholder(q))
  const facts = factsForPaper(paper)
  const expected = Number(facts?.expectedQuestionCount ?? facts?.totalQuestions ?? paper?.adminFacts?.totalQuestions) || 0
  const hits = {
    cardCount: expected && real.length !== expected ? [real.length] : [],
    quality: [],
    rawOnScreen: [],
    leftDollarSmash: [],
    cutPicture: [],
    duplicateOptions: [],
    matchList: [],
    shownMatchList: [],
    twoQuestionsInOne: [],
    numericWithOptions: [],
    printedNumber: printedNumberJumps(questions),
  }
  const why = {}
  if (hits.cardCount.length) why.cardCount = `${real.length} cards, the paper has ${expected} questions`
  let quality = null
  try {
    quality = localOfficialPyqQualityCheck(paper)
    hits.quality = quality.failedGoTo || []
  } catch (err) {
    hits.quality = [-1]
    why.quality = `error: ${err?.message || err}`
  }
  questions.forEach((q, i) => {
    if (!q || q.placeholder) return
    const n = i + 1
    const note = (k, msg) => {
      hits[k].push(n)
      if (msg) why[`${k} Q${n}`] = msg
    }
    const shownParts = parts(q).map((p) => {
      try {
        return prepareTextForMathTextDisplay(p)
      } catch {
        return p
      }
    })
    const raw = officialPyqDrawnRawCode(shownParts.map((p) => officialPyqDrawnText(p)).join('\n'))
    const draw = parts(q).map((p) => mathDrawFailure(p)).find(Boolean)
    if (raw.length || draw) note('rawOnScreen', raw[0] || draw)
    const smashAt = [...parts(q), ...shownParts].find((p) => SMASH.test(p))
    if (smashAt) note('leftDollarSmash', smashAt.match(SMASH)?.[0])
    const pic = parts(q).map((p) => officialPyqFigureMarkupProblem(p)).find(Boolean)
    if (pic) note('cutPicture', pic)
    const opts = filled(q.options)
    const keys = opts.map(norm)
    if (!isNumeric(q) && new Set(keys).size < keys.length) note('duplicateOptions', opts.join(' | ').slice(0, 160))
    const ml = matchListProblem(String(q.text ?? ''), q.options)
    if (ml) note('matchList', ml)
    let shown = String(q.text ?? '')
    try {
      shown = sanitizeStemForDisplay(shown, q.options)
    } catch {
      /* check the stored text */
    }
    const shownMl = matchListProblem(shown, q.options)
    if (shownMl) note('shownMatchList', shownMl)
    const blocks = (shown.match(LIST_ONE_BLOCK) || []).length
    if (blocks > 1) note('twoQuestionsInOne', `${blocks} List-I blocks with rows on one card`)
    if (isNumeric(q) && opts.length) note('numericWithOptions', `${q.questionType} with ${opts.length} options`)
  })
  return {
    summary: {
      paper: `${paper?.year ?? ''} ${paper?.session ?? ''}`.trim(),
      id: paper?.id,
      status: paper?.status,
      cards: real.length,
      expected: expected || '',
      edited: questions.filter((q) => q?.adminEdited).length,
      ...Object.fromEntries(Object.entries(hits).map(([k, v]) => [k, v.length])),
    },
    hits,
    why,
    qualityLines: quality?.lines || [],
  }
}
