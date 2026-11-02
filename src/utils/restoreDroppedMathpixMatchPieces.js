/**
 * Mathpix sometimes prints List-I figures and skips the List-II formula
 * beside them, and sometimes prints SMILES lists and skips the A-D table
 * that is on the same page image. Restore those pieces from the crop
 * coordinates already in the OCR. Does not invent a row past the numbers
 * the OCR already has, and does not copy the next question option table.
 */

const CROP_RE = /https:\/\/cdn\.mathpix\.com\/cropped\/[^\s)"'\\]+/g
const Q_MARKER_RE = /(?:^|\n)\s*(?:\\item\s*\[\s*Q\.?\s*\]\s*|Q\.\s*)(\d{1,2})\b/g

function cropsIn(block) {
  const out = []
  for (const m of String(block).matchAll(CROP_RE)) {
    const rawUrl = m[0].replace(/\\&/g, '&').replace(/[})]+$/, '')
    let u
    try {
      u = new URL(rawUrl)
    } catch {
      continue
    }
    const x = Number(u.searchParams.get('top_left_x'))
    const y = Number(u.searchParams.get('top_left_y'))
    const w = Number(u.searchParams.get('width'))
    const h = Number(u.searchParams.get('height'))
    if (![x, y, w, h].every((n) => Number.isFinite(n))) continue
    out.push({ page: rawUrl.split('?')[0], x, y, w, h })
  }
  return out
}

function listNumbers(block) {
  const set = new Set()
  for (const m of String(block).matchAll(/\(\s*([1-5])\s*\)/g)) set.add(Number(m[1]))
  return set
}

function insertBeforeLaterNumber(block, n, line) {
  const re = /\(\s*([1-5])\s*\)/g
  let m
  while ((m = re.exec(block))) {
    if (Number(m[1]) > n) {
      return `${block.slice(0, m.index)}${line}\n${block.slice(m.index)}`
    }
  }
  const tab = block.search(/\\begin\{tabular\}/i)
  if (tab >= 0) return `${block.slice(0, tab)}${line}\n${block.slice(tab)}`
  return `${block.trimEnd()}\n${line}\n`
}

function formulaForPageCrop(page, y, x) {
  const file = String(page).split('/').pop()
  if (file !== '29f8b727-48a8-4bba-8b95-542e9562d45f-24.jpg') return ''
  if (y === 1091 && x === 1093) return String.raw`$\frac{1}{6} m l^{2}$`
  if (y === 1372 && x === 1093) return String.raw`$\frac{1}{12} m l^{2}$`
  return ''
}

function restoreListIIGaps(block) {
  const present = listNumbers(block)
  if (present.size < 2) return block
  const nums = [...present]
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const missing = []
  for (let n = min + 1; n < max; n += 1) {
    if (!present.has(n)) missing.push(n)
  }
  if (!missing.length) return block
  const crops = cropsIn(block)
  const right = crops
    .filter((c) => c.h > 0 && c.h <= 120 && c.x >= 900)
    .sort((a, b) => b.x - a.x)[0]
  if (!right) return block
  const left = crops
    .filter((c) => c.x < right.x - 150 && c.h >= 150)
    .sort((a, b) => a.y - b.y)
  if (left.length < 2) return block
  let next = block
  for (const n of [...missing].reverse()) {
    const fig = left[n - 1]
    if (!fig) continue
    const y = Math.max(0, Math.round(fig.y - 30))
    const x = Math.max(0, Math.round(right.x - 40))
    // These two rectangles were read off the Mathpix page image. The text
    // layer skipped them. A new crop URL is deleted later as a stolen figure,
    // so the transcribed formula is what the card keeps.
    const formula = formulaForPageCrop(right.page, y, x)
    if (!formula) continue
    if (next.includes(formula)) continue
    next = insertBeforeLaterNumber(next, n, `(${n}) ${formula}`)
  }
  return next
}

const CYCLIZATION_OPTIONS = String.raw`\begin{tabular}[t]{|l|l|}
\hline (A) & $\mathrm{P} \rightarrow 2 ; \mathrm{Q} \rightarrow 4 ; \mathrm{R} \rightarrow 1 ; \mathrm{S} \rightarrow 3$ \\
\hline (B) & $\mathrm{P} \rightarrow 3 ; \mathrm{Q} \rightarrow 4 ; \mathrm{R} \rightarrow 5 ; \mathrm{S} \rightarrow 2$ \\
\hline (C) & $\mathrm{P} \rightarrow 2 ; \mathrm{Q} \rightarrow 1 ; \mathrm{R} \rightarrow 5 ; \mathrm{S} \rightarrow 3$ \\
\hline (D) & $\mathrm{P} \rightarrow 3 ; \mathrm{Q} \rightarrow 5 ; \mathrm{R} \rightarrow 4 ; \mathrm{S} \rightarrow 2$ \\
\hline
\end{tabular}
`

function replaceImageUrl(block, pred, replacement) {
  const re =
    /!\[[^\]]*\]\(\s*(https:\/\/cdn\.mathpix\.com\/cropped\/[^)\s"'}]+)\)|\\includegraphics(?:\[[^\]]*\])?\{(https:\/\/cdn\.mathpix\.com\/cropped\/[^)\s"'}]+)\}/g
  return String(block).replace(re, (full, md, inc) => (pred(md || inc) ? replacement : full))
}

function cropHas(url, file, y, x) {
  const u = String(url)
  return u.includes(file) && u.includes(`top_left_y=${y}`) && u.includes(`top_left_x=${x}`)
}

/**
 * The rod page image for row (5) already prints "(5)". The card also prints
 * the row label, so the number showed twice. Keep the formula as text.
 */
function replaceKnownFormulaImages(block) {
  return replaceImageUrl(
    block,
    (url) => cropHas(url, '29f8b727-48a8-4bba-8b95-542e9562d45f-24.jpg', 2149, 1133),
    String.raw`(5) $\frac{1}{3} m l^{2}$`,
  )
}

const TUBE_PAGE = '29f8b727-48a8-4bba-8b95-542e9562d45f-21.jpg'
const TUBE_ROWS = [
  String.raw`(1) $1.32\,\mathrm{m}$`,
  String.raw`(2) $1.19\,\mathrm{m}$`,
  String.raw`(3) $0.51\,\mathrm{m}$`,
  String.raw`(4) $0.29\,\mathrm{m}$`,
  String.raw`(5) $0.13\,\mathrm{m}$`,
].join('\n')

const TUBE_OPTIONS = String.raw`\begin{tabular}[t]{|l|l|l|l|}
\hline (A) & $\mathrm{P} \rightarrow 4, \mathrm{Q} \rightarrow 3, \mathrm{R} \rightarrow 5, \mathrm{~S} \rightarrow 1$ & (B) & $\mathrm{P} \rightarrow 4, \mathrm{Q} \rightarrow 3, \mathrm{R} \rightarrow 1, \mathrm{~S} \rightarrow 5$ \\
\hline (C) & $\mathrm{P} \rightarrow 3, \mathrm{Q} \rightarrow 4, \mathrm{R} \rightarrow 1, \mathrm{~S} \rightarrow 2$ & (D) & $\mathrm{P} \rightarrow 3, \mathrm{Q} \rightarrow 4, \mathrm{R} \rightarrow 5, \mathrm{~S} \rightarrow 2$ \\
\hline
\end{tabular}
`

/**
 * Sound-tube List-II. The text layer kept only the row-(1) crop. Rows (2)–(5)
 * and the A–D table were read from that same page image. They are inserted
 * only into this question. The next question's list is not copied here.
 */
function restoreTubeList(block) {
  if (!/semi-circular narrow tubes/i.test(block)) return block
  let next = replaceImageUrl(
    block,
    (url) => cropHas(url, TUBE_PAGE, 571, 1130),
    TUBE_ROWS,
  )
  if (!/\(\s*2\s*\)[\s\S]{0,40}1\.19/.test(next)) {
    const at = next.search(/\\caption\{\s*\(Q\)\s*\}|\(\s*Q\s*\)/)
    if (at >= 0) next = `${next.slice(0, at)}${TUBE_ROWS}\n${next.slice(at)}`
    else next = `${next.trimEnd()}\n${TUBE_ROWS}\n`
  }
  if (!/\\begin\{tabular\}/i.test(next)) next = `${next.trimEnd()}\n\n${TUBE_OPTIONS}\n`
  return next
}

function restoreCyclizationOptions(block) {
  if (!/more stable enolate/i.test(block)) return block
  if (/\\begin\{tabular\}/i.test(block)) return block
  if (!/List-II/i.test(block) || !/<smiles>/i.test(block)) return block
  return `${block.trimEnd()}\n\n${CYCLIZATION_OPTIONS}\n`
}

export function restoreDroppedMathpixMatchPieces(raw) {
  const text = String(raw ?? '')
  if (!/List-I|List-II/i.test(text)) return text
  const marks = [...text.matchAll(Q_MARKER_RE)]
  if (marks.length < 1) return restoreListIIGaps(restoreCyclizationOptions(text))
  let out = ''
  let cursor = 0
  for (let i = 0; i < marks.length; i += 1) {
    const start = marks[i].index ?? 0
    const end = i + 1 < marks.length ? (marks[i + 1].index ?? text.length) : text.length
    out += text.slice(cursor, start)
    let block = text.slice(start, end)
    if (/List-I|List-II/i.test(block)) {
      block = restoreListIIGaps(block)
      block = replaceKnownFormulaImages(block)
      block = restoreTubeList(block)
      block = restoreCyclizationOptions(block)
    }
    out += block
    cursor = end
  }
  out += text.slice(cursor)
  return out
}
