/**
 * Lay paper pictures out the way the original page does.
 * Mathpix crop URLs carry where the picture sat on its page
 * (`…-01.jpg?height=&width=&top_left_y=&top_left_x=`); admin crops of the
 * original carry `?page=&x0=&y0=&x1=&y1=` (page fractions). Pictures on the
 * same page whose heights overlap were printed side by side.
 */

import { cleanMathpixImageUrl, isOriginalCropUrl, ORIGINAL_CROP_URL_PREFIX } from './mathpixMedia.js'

/** @typedef {{ page: string, x: number, y: number, w: number, h: number }} FigureBox */

/** @param {string} query */
function numbers(query) {
  const out = /** @type {Record<string, number>} */ ({})
  for (const part of String(query ?? '').split('&')) {
    const [k, v] = part.split('=')
    const n = Number(v)
    if (k && Number.isFinite(n)) out[k] = n
  }
  return out
}

/**
 * Where this picture sat on its original page, or null when the URL does not say.
 * Boxes from different sources use different units, so their page keys never match.
 * @param {unknown} url
 * @returns {FigureBox | null}
 */
export function paperFigureBox(url) {
  const u = cleanMathpixImageUrl(url)
  const at = u.indexOf('?')
  if (at < 0) return null
  const path = u.slice(0, at)
  const p = numbers(u.slice(at + 1))
  const mathpix = path.match(/cdn\.mathpix\.com\/cropped\/(.+)$/i)
  if (mathpix) {
    if (![p.top_left_x, p.top_left_y, p.width, p.height].every(Number.isFinite) || p.width <= 0 || p.height <= 0) {
      return null
    }
    return { page: `mathpix:${mathpix[1]}`, x: p.top_left_x, y: p.top_left_y, w: p.width, h: p.height }
  }
  if (isOriginalCropUrl(path)) {
    if (![p.page, p.x0, p.y0, p.x1, p.y1].every(Number.isFinite) || p.x1 <= p.x0 || p.y1 <= p.y0) return null
    const paper = path.slice(ORIGINAL_CROP_URL_PREFIX.length).replace(/-p\d+-[0-9a-f]+\.png$/i, '')
    return { page: `crop:${paper}:${p.page}`, x: p.x0, y: p.y0, w: p.x1 - p.x0, h: p.y1 - p.y0 }
  }
  return null
}

/**
 * Printed on one line: same page, heights overlap by at least half the smaller
 * picture, and the pictures do not cover each other left to right.
 * @param {FigureBox | null} a @param {FigureBox | null} b
 */
export function sameFigureLine(a, b) {
  if (!a || !b || a.page !== b.page) return false
  const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  if (overlapY < 0.5 * Math.min(a.h, b.h)) return false
  const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  return overlapX < 0.25 * Math.min(a.w, b.w)
}

/**
 * Split pictures that follow each other in the text into rows, as printed.
 * A row keeps the left-to-right order of the page.
 * @param {string[]} urls
 * @returns {{ url: string, box: FigureBox | null }[][]}
 */
export function figureRows(urls) {
  /** @type {{ url: string, box: FigureBox | null }[][]} */
  const rows = []
  for (const url of urls) {
    const item = { url, box: paperFigureBox(url) }
    const row = rows[rows.length - 1]
    if (row && row.every((other) => sameFigureLine(other.box, item.box))) row.push(item)
    else rows.push([item])
  }
  return rows.map((row) => (row.length > 1 ? row.slice().sort((a, b) => a.box.x - b.box.x) : row))
}

/**
 * Turn runs of adjacent picture segments into side-by-side rows.
 * Text that is only figure chrome / whitespace does not break a run.
 * @param {{ kind: string, value: any }[]} segments from splitMathpixMediaSegments
 * @param {(text: string) => string} [visible] text as it will be shown
 */
export function groupSideBySideFigureSegments(segments, visible = (t) => t) {
  const out = []
  let run = /** @type {string[]} */ ([])
  const flush = () => {
    for (const row of figureRows(run)) {
      if (row.length === 1) out.push({ kind: 'img', value: row[0].url })
      else out.push({ kind: 'row', value: row.map((item) => ({ url: item.url, w: item.box.w })) })
    }
    run = []
  }
  for (const seg of segments) {
    if (seg.kind === 'img') {
      run.push(seg.value)
      continue
    }
    if (run.length && seg.kind === 'text' && !String(visible(seg.value) ?? '').trim()) continue
    flush()
    out.push(seg)
  }
  flush()
  return out
}

/**
 * Share of the row width (percent) for picture j, in proportion to the printed widths.
 * @param {{ w: number }[]} row @param {number} j
 */
export function figureRowShare(row, j) {
  const total = row.reduce((sum, fig) => sum + (fig.w > 0 ? fig.w : 0), 0)
  const share = total > 0 ? (row[j].w / total) * 100 : 100 / row.length
  return Math.round(share * 10) / 10
}

/** @param {unknown} option */
function onlyFigureUrl(option) {
  const t = String(option ?? '').trim()
  const m = t.match(/^\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}$/) || t.match(/^!\[[^\]]*\]\(([^)\s]+)\)$/)
  return m ? m[1] : ''
}

/**
 * Option layout from the option pictures themselves, when every option is one
 * picture with a known place: 'row' (A B C D), 'grid' (A B / C D), 'list', or ''.
 * @param {unknown[]} options
 */
export function optionLayoutFromFigures(options) {
  const list = Array.isArray(options) ? options : []
  if (list.length !== 4) return ''
  const boxes = list.map((o) => paperFigureBox(onlyFigureUrl(o)))
  if (boxes.some((b) => !b)) return ''
  const [a, b, c, d] = boxes
  if (sameFigureLine(a, b) && sameFigureLine(b, c) && sameFigureLine(c, d)) return 'row'
  if (sameFigureLine(a, b) && sameFigureLine(c, d)) return 'grid'
  if (boxes.every((box) => box.page === a.page)) return 'list'
  return ''
}

const LAYOUTS = new Set(['row', 'grid', 'list'])

/**
 * Layout the original paper used for this question's options.
 * @param {any} q card with optional `optionLayout` read from the original PDF
 * @param {unknown[]} [options] options as shown
 */
export function questionOptionLayout(q, options = q?.options) {
  const stored = String(q?.optionLayout ?? '')
  if (LAYOUTS.has(stored)) return stored
  return optionLayoutFromFigures(options)
}
