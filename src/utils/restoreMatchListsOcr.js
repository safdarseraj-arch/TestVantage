/**
 * Extra List-I / List-II restore via parseMatchColumnUpload.
 * Kept off extendTruncatedStem so Convert (parseBulkQuestions) does not
 * circular-load JEE_Q_OPENER.
 */

import { parseMatchColumnUpload, looksLikeMatchColumnUpload } from './parseMatchColumnUpload.js'
import { hasOriginalPageCrop } from './mathpixMedia.js'
import { isMatrixGridCard } from './matrixGridPyq.js'

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
  return (
    /(?:List|Column)\s*[-–]?\s*II\b/i.test(t) &&
    (/\(\s*[1-5]\s*\)/.test(t) || /\(\s*[PQRS]\s*\)/.test(t) || (/\\begin\{tabular\}/.test(t) && TABLE_ROW_RE('1-5').test(t)))
  )
}

/** The next part / section heading ends the window: its words are never list rows. */
const PAPER_HEADING_RE = /\n\s*(?:\\section\*?\{\s*)?(?:PART|SECTION)\s*[-–]?\s*(?:\d|[IVX]+)\b/i

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
