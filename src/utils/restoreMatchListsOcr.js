/**
 * Extra List-I / List-II restore via parseMatchColumnUpload.
 * Kept off extendTruncatedStem so Convert (parseBulkQuestions) does not
 * circular-load JEE_Q_OPENER.
 */

import { parseMatchColumnUpload, looksLikeMatchColumnUpload } from './parseMatchColumnUpload.js'
import { hasOriginalPageCrop } from './mathpixMedia.js'
import { isMatrixGridCard } from './matrixGridPyq.js'
import {
  flattenTabularMatchLists,
  parseMatchingListForDisplay,
  rewriteLatexItemLabels,
} from './parseMatchingListDisplay.js'
import { tidyMatchListText } from './matchListTidy.js'

/** Whole words only: "blister copper" is not a List question. */
const MATCH_WORD_RE = /\b(?:match|list|column)/i

/** A table row "P. Lift is accelerating" / "& 1. $d=1.2 m$" (2014 P2 Q20 keeps its lists in a tabular). */
const TABLE_ROW_RE = (labels) => new RegExp(`(?:^|[&\\n]|\\\\\\\\)\\s*[${labels}]\\s*\\.\\s+\\S`, 'm')

function matchQuestionMissingListI(q) {
  const t = String(q?.text ?? '')
  if (!MATCH_WORD_RE.test(t)) return false
  if (/\\begin\{tabular\}/.test(t) && TABLE_ROW_RE('PQRS').test(t)) return false
  return !/\(\s*[PQRSABCD]\s*\)\s+(?!\(\s*[PQRSABCD1-5]\s*\))\S/.test(t)
}

function formatListIFromMatchParse(parsed) {
  if (!parsed?.matrixRows) return ''
  const rows = parsed.matrixRows
    .map((r, i) => {
      const body = String(r ?? '').trim()
      if (!body) return ''
      return `(${['A', 'B', 'C', 'D'][i] || i + 1}) ${body}`
    })
    .filter(Boolean)
  if (rows.length < 2) return ''
  return `List-I\n${rows.join('\n')}`
}

function formatListIIFromMatchParse(parsed) {
  if (!parsed?.matrixCols) return ''
  const labels = Array.isArray(parsed.matrixColLabels) ? parsed.matrixColLabels : []
  const rows = parsed.matrixCols
    .map((c, i) => {
      const body = String(c ?? '').trim()
      if (!body) return ''
      return `${labels[i] || `(${i + 1})`} ${body}`.trim()
    })
    .filter(Boolean)
  if (rows.length < 2) return ''
  return `List-II\n${rows.join('\n')}`
}

function hasListTwo(text) {
  const t = String(text ?? '')
  const firstRow = t.search(/(?:^|\n)[ \t]*\(\s*P\s*\)/)
  if (firstRow >= 0 && new Set([...t.slice(firstRow).matchAll(/\n[ \t]*\(\s*([1-5])\s*\)/g)].map((m) => m[1])).size >= 2) {
    return true
  }
  const romanII = new Set(
    [...t.matchAll(/(?:^|\n)[ \t]*\(\s*(I{1,3}|IV)\s*\)/g)].map((m) => m[1]),
  ).size
  if (romanII >= 2 && /(?:List|Column)\s*[-–]?\s*II\b/i.test(t)) return true
  return (
    /(?:List|Column)\s*[-–]?\s*II\b/i.test(t) &&
    (/\(\s*[1-5]\s*\)/.test(t) ||
      /\(\s*[PQRS]\s*\)/.test(t) ||
      /\(\s*(?:I{1,3}|IV)\s*\)/.test(t) ||
      (/\\begin\{tabular\}/.test(t) && TABLE_ROW_RE('1-5').test(t)))
  )
}

/** The next part / section heading ends the window: its words are never list rows. */
const PAPER_HEADING_RE = /\n\s*(?:\\section\*?\{\s*)?(?:PART|SECTION)\s*[-–]?\s*(?:\d|[IVX]+)\b/i

/** Bare `\multicolumn` leftovers after unwrapReactionStepTables (Main Q36 → `2|c|List-I`). */
function looksLikeStrippedMatchShell(text) {
  return /\d+\s*\|\s*[lcr]+\s*\|\s*List/i.test(String(text ?? ''))
}

/**
 * Main Match List stem cut after the List-I heading (or with no A–D / Roman rows).
 * OCR still has the tabular; rebuildMatchListStemFromOcr must run.
 * @param {unknown} text
 */
export function looksLikeTruncatedMainMatchList(text) {
  const t = String(text ?? '')
  if (!/Match\s+List/i.test(t) && !/(?:List|Column)\s*[-–]?\s*I(?!I)\b/i.test(t)) return false
  if (/\\begin\{tabular\}/i.test(t)) return false
  const labeledAbcd =
    (t.match(/(?:^|\n)\s*(?:\(\s*[A-D]\s*\)|[A-D]\.)\s+\S/g) || []).length
  const romanIi = (t.match(/\(\s*(?:I{1,3}|IV)\s*\)/g) || []).length
  const arabicIi = (t.match(/(?:^|\n)\s*\(\s*[1-5]\s*\)\s+\S/g) || []).length
  const pqrs = (t.match(/(?:^|\n)\s*\(\s*[PQRS]\s*\)\s+\S/g) || []).length
  // "Match List I with List II\n\nList-I" has headings but no row bodies.
  return labeledAbcd < 2 && romanIi < 2 && arabicIi < 2 && pqrs < 2
}

/**
 * OCR window for one printed Match List card (`\\item[N.]` / `*N.`).
 * @param {string} src
 * @param {number} printed
 */
function matchListOcrWindow(src, printed) {
  const n = Number(printed)
  if (!(n > 0)) return ''
  const re = new RegExp(
    String.raw`\\item\s*\[\s*${n}\s*\.?\s*\]|(?:^|\n)\s*(?:\\item\s*\[\s*\]\s*)?\*?\s*${n}\s*\.`,
    'gi',
  )
  const m = re.exec(src)
  if (!m || m.index == null) return ''
  const start = m.index
  const tail = src.slice(start + m[0].length)
  // Cut before the next question; keep option rows that sit above Ans./Sol.
  const nextQ = tail.search(
    /\n\s*(?:\\item\s*\[[^\]]*\]\s*)?(?:\*\s*)?\d{1,3}\s*\.|\\item\s*\[\s*\d{1,3}\s*\.?\]/i,
  )
  let chunk = nextQ > 40 ? src.slice(start, start + m[0].length + nextQ) : src.slice(start, start + 3500)
  const ansAt = chunk.search(/\n\s*Ans\.\s*\(/i)
  if (ansAt > 80) chunk = chunk.slice(0, ansAt)
  // Drop the item wrapper so flatten sees the tabular body.
  return chunk.replace(/^[\s\S]*?(?=Match\s+List)/i, '')
}

/**
 * Rebuild a Match List stem from the OCR tabular window (Main Q36/Q65).
 * @param {string} text
 * @param {string} src
 * @param {number} [printed]
 */
function rebuildMatchListStemFromOcr(text, src, printed = 0) {
  let window = matchListOcrWindow(src, printed)
  if (!window) {
    // Fall back: distinctive row text (Ziegler / Maxwell) near Match List.
    const distinctive = String(text).match(
      /Ziegler catalyst|Wilkinson catalyst|Ampere\s*-?\s*Maxwell|Gauss['’]?\s*law for electricity/i,
    )
    if (distinctive) {
      const at = src.indexOf(distinctive[0])
      if (at >= 0) {
        const back = src.lastIndexOf('Match List', at)
        const start = back >= 0 ? back : Math.max(0, at - 200)
        const next = src.slice(start + 40).search(/\n\s*(?:\\item\s*\[[^\]]*\]\s*)?(?:\*\s*)?\d{1,3}\s*\.|Ans\.\s*\(/i)
        window = next > 80 ? src.slice(start, start + 40 + next) : src.slice(start, start + 3200)
      }
    }
  }
  if (!window) return ''
  const flat = tidyMatchListText(rewriteLatexItemLabels(flattenTabularMatchLists(window)))
  const parsed = parseMatchingListForDisplay(flat)
  if (!parsed?.listI?.length || parsed.listI.length < 2) return ''
  if (!parsed.listII?.length || parsed.listII.length < 2) return ''
  const intro = String(parsed.intro || 'Match List I with List II').trim()
  const titleI = parsed.listITitle || 'List-I'
  const titleII = parsed.listIITitle || 'List-II'
  const blockI = parsed.listI.map((r) => `${r.label} ${String(r.text ?? '').trim()}`.trim()).join('\n')
  const blockII = parsed.listII.map((r) => `${r.label} ${String(r.text ?? '').trim()}`.trim()).join('\n')
  let outro = String(parsed.outro || '').trim()
  // Keep the "Choose the correct answer…" line; drop glued (1)(2)(3)(4) option rows from the stem.
  outro = outro
    .replace(/(?:^|\n)\s*\(\s*[1-4]\s*\)\s+[A-D]\s*[-–].*$/gim, '')
    // Main Maxwell style: (1) (A) - (II), (B) - (III), …
    .replace(/(?:^|\n)\s*\(\s*[1-4]\s*\)\s+\(\s*[A-D]\s*\)\s*[-–].*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return [intro, `${titleI}\n${blockI}`, `${titleII}\n${blockII}`, outro].filter(Boolean).join('\n\n').trim()
}

/** Pull "(1) A-IV…" or "(1) (A) - (II)…" rows from the OCR window. */
function matchOptionsFromOcrWindow(src, printed) {
  const window = matchListOcrWindow(src, printed)
  if (!window) return null
  const compact = [...window.matchAll(/(?:^|\n)\s*\(\s*([1-4])\s*\)\s*([A-D]\s*[-–][^\n]+)/gi)]
  const paired = [
    ...window.matchAll(
      /(?:^|\n)\s*\(\s*([1-4])\s*\)\s*((?:\(\s*[A-D]\s*\)\s*[-–]\s*\(\s*(?:I{1,3}|IV)\s*\)\s*,?\s*){2,})/gi,
    ),
  ]
  const rows = compact.length >= 4 ? compact : paired
  if (rows.length < 4) return null
  /** @type {string[]} */
  const opts = ['', '', '', '']
  for (const m of rows) {
    const i = Number(m[1]) - 1
    if (i >= 0 && i < 4 && !opts[i]) opts[i] = String(m[2]).replace(/\s+/g, ' ').trim()
  }
  return opts.every(Boolean) ? opts : null
}

/**
 * If heal still left a match card without List-I or List-II, parse the OCR
 * window with the shared match-column parser. Never invents rows.
 * @param {object} q
 * @param {unknown} source
 */
export function enrichMatchListsFromOcr(q, source) {
  if (!q || typeof q !== 'object' || q.placeholder === true || isMatrixGridCard(q)) return q
  const src = String(source ?? '')
  let text = String(q.text ?? '').trim()
  if (!text || src.length < 40) return q
  if (hasOriginalPageCrop(text) || hasOriginalPageCrop(q.passageText)) return q

  const stripped = looksLikeStrippedMatchShell(text)
  const truncatedMain = looksLikeTruncatedMainMatchList(text)
  const stemRomanII = (text.match(/\(\s*(?:I{1,3}|IV)\s*\)/g) || []).length
  const stemArabicII =
    /(?:List|Column)\s*[-–]?\s*II\b/i.test(text) &&
    (text.match(/(?:^|\n)\s*\(\s*[1-4]\s*\)/g) || []).length >= 2 &&
    stemRomanII < 2
  const printed = Number(q.printedNumber ?? q.questionNumber ?? q.pyqSlot) || 0
  // Truncated Main stems ("Match List…\n\nList-I") never carry Arabic List-II rows in the
  // card text, so stemArabicII alone missed Q36/Q65 — always rebuild from the OCR tabular.
  if (
    stripped ||
    truncatedMain ||
    (MATCH_WORD_RE.test(text) && stemArabicII && /Match\s+List/i.test(text))
  ) {
    const rebuilt = rebuildMatchListStemFromOcr(text, src, printed)
    if (rebuilt && (stripped || truncatedMain || rebuilt.length >= 80)) {
      const fromOcr = matchOptionsFromOcrWindow(src, printed)
      const options = fromOcr || q.options
      return { ...q, text: rebuilt, options, cleanStatus: undefined, cleanNotes: undefined }
    }
  }

  const needI = matchQuestionMissingListI({ text, options: q.options })
  const needII = MATCH_WORD_RE.test(text) && !hasListTwo(text)
  if (!needI && !needII) return q
  const rowP = text.match(/\(\s*P\s*\)\s+[^\n]{8,70}/)
  const distinctive = text.match(
    /(?:One mole of a|Four identical thin|A light ray is incident|The circuit shown in the figure|Let\s+\$\\alpha|Based on VSEPR|List-I contains various reaction sequences and List-II contains the possible|List-I contains various reaction sequences and List-II contains different phenolic|Among the following phenolic|In a conductometric)[^\n]{0,40}/i,
  )
  const probe = String(rowP?.[0] || distinctive?.[0] || text.replace(/\$+/g, '').replace(/\s+/g, ' ').trim().slice(0, 72))
  const idx = probe.length >= 12 ? src.indexOf(probe) : -1
  // List-II lives after this stem. Do not scan the previous item (that
  // glued a gas List-II onto a light-ray card).
  const from = idx >= 0 ? (needII && !needI ? idx : Math.max(0, idx - 3500)) : 0
  const rawWindow = idx >= 0 ? src.slice(from, idx + 2400) : src.slice(0, 8000)
  const nextStem = rawWindow.slice(needII && !needI ? 24 : 0).search(
    /\b(?:Four identical|A light ray is incident|A thin uniform rod|One mole of a|The circuit shown in the figure|Based on VSEPR|List-I contains various reaction sequences and List-II contains the possible|List-I contains various reaction sequences and List-II contains different phenolic|Among the following phenolic|In a conductometric)\b/i,
  )
  let window =
    nextStem > 40 ? rawWindow.slice(0, (needII && !needI ? 24 : 0) + nextStem) : rawWindow
  const heading = idx >= 0 ? window.slice(idx - from).search(PAPER_HEADING_RE) : -1
  if (heading > 0) window = window.slice(0, idx - from + heading)
  if (!looksLikeMatchColumnUpload(window) && !looksLikeMatchColumnUpload(text)) return q
  const parsed = parseMatchColumnUpload(window.length > 80 ? window : text)
  if (!parsed) return q
  if (needI) {
    const block = formatListIFromMatchParse(parsed)
    if (block && !/\(\s*[PQRSABCD]\s*\)\s+(?!\(\s*[PQRSABCD1-5]\s*\))\S/.test(text)) {
      const emptyI = text.search(/(?:^|\n)\s*(?:List|Column)\s*[-–]?\s*I(?!I)\b/i)
      const ii = text.search(/(?:^|\n)\s*(?:List|Column)\s*[-–]?\s*II\b/i)
      if (emptyI >= 0) {
        text = `${text.slice(0, emptyI).trim()}\n\n${block}\n\n${ii > emptyI ? text.slice(ii).trim() : ''}`.trim()
      } else if (ii >= 0) {
        text = `${text.slice(0, ii).trim()}\n\n${block}\n\n${text.slice(ii).trim()}`
      } else {
        text = `${text}\n\n${block}`
      }
    }
  }
  if (needII || !hasListTwo(text)) {
    const blockII = formatListIIFromMatchParse(parsed)
    if (blockII && !hasListTwo(text)) text = `${text.trim()}\n\n${blockII}`
  }
  if (text === q.text) return q
  return { ...q, text }
}
