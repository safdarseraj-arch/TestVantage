/**
 * Turn Mathpix \begin{tabular} chemistry tables into KaTeX \begin{array}.
 * KaTeX cannot render tabular; array + $$ is the permanent display path.
 */
import katex from 'katex'

/** Read one `{...}` group. Nested braces and `\{` stay inside. */
function readBraceGroup(s, i) {
  if (s[i] !== '{') return null
  let depth = 0
  for (let j = i; j < s.length; j += 1) {
    if (s[j] === '\\') {
      j += 1
      continue
    }
    if (s[j] === '{') depth += 1
    else if (s[j] === '}') {
      depth -= 1
      if (depth === 0) return { inner: s.slice(i + 1, j), end: j + 1 }
    }
  }
  return null
}

/**
 * KaTeX prints \multirow and \multicolumn as the command name.
 * Keep the cell text (NaNO3, Readings) and drop the command.
 * @param {unknown} text
 */
export function expandUnsupportedTableCommands(text) {
  const s = String(text ?? '')
  if (!/\\(?:multirow|multicolumn)\b/.test(s)) return s
  let out = ''
  let last = 0
  const re = /\\(?:multirow|multicolumn)\b/g
  for (const m of s.matchAll(re)) {
    let i = m.index + m[0].length
    const groups = []
    for (let g = 0; g < 3; g += 1) {
      while (i < s.length && /\s/.test(s[i])) i += 1
      const grp = readBraceGroup(s, i)
      if (!grp) break
      groups.push(grp)
      i = grp.end
    }
    if (groups.length < 3) continue
    out += s.slice(last, m.index) + groups[2].inner
    last = i
  }
  if (!last) return s
  return out + s.slice(last)
}

/** \left( and \right) inside a table cell clip the header. Plain parentheses stay. */
function softenLeftRightInTables(text) {
  return String(text ?? '').replace(
    /\\begin\{(?:tabular|array)\}[\s\S]*?\\end\{(?:tabular|array)\}/gi,
    (block) =>
      block
        .replace(/\\left\s*(?=[([|./])/g, '')
        .replace(/\\right\s*(?=[)\]|./])/g, ''),
  )
}

/** Cells are already in math once wrapped in $$ — leftover $…$ breaks KaTeX. */
export function stripDollarsInsideLatexEnvs(text) {
  return String(text ?? '').replace(
    /(\\begin\{(?:array|cases|tabular|bmatrix|pmatrix|vmatrix|matrix)\}[\s\S]*?\\end\{(?:array|cases|tabular|bmatrix|pmatrix|vmatrix|matrix)\})/gi,
    (block) => block.replace(/\$+/g, ''),
  )
}

function arrayFromTabularBody(spec, body) {
  const cols = spec && /\{/.test(spec) ? spec : '{c}'
  const cells = String(body ?? '').replace(/\$+/g, '')
  return `$$\\begin{array}${cols}${cells}\\end{array}$$`
}

const SUPER_DIGIT = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻', '+': '⁺' }
const SUB_DIGIT = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' }

function scriptDigits(token, map) {
  return [...String(token ?? '')].map((ch) => map[ch] || ch).join('')
}

const CELL_SYMBOLS = {
  equiv: '≡',
  rightarrow: '→',
  longrightarrow: '⟶',
  leftarrow: '←',
  rightleftharpoons: '⇌',
  times: '×',
  cdot: '·',
  circ: '°',
  bullet: '•',
  pm: '±',
  leq: '≤',
  geq: '≥',
  neq: '≠',
  approx: '≈',
  infty: '∞',
  degree: '°',
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  varepsilon: 'ε',
  eta: 'η',
  theta: 'θ',
  kappa: 'κ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  pi: 'π',
  rho: 'ρ',
  sigma: 'σ',
  tau: 'τ',
  phi: 'φ',
  varphi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',
  Gamma: 'Γ',
  Delta: 'Δ',
  Theta: 'Θ',
  Lambda: 'Λ',
  Pi: 'Π',
  Sigma: 'Σ',
  Phi: 'Φ',
  Psi: 'Ψ',
  Omega: 'Ω',
}

/**
 * A tabular inside a tabular cell (Mathpix two-line headers: "Column J \\ Molecule")
 * ends the outer table at the inner \end{tabular}. Fold each inner one into its cell text.
 * @param {unknown} text
 */
export function flattenNestedTabulars(text) {
  let s = String(text ?? '')
  const innermost = /\\begin\{tabular\}(?:\[[^\]]*\])?(?:\{[^}]*\})?((?:(?!\\begin\{tabular\})[\s\S])*?)\\end\{tabular\}/g
  for (let guard = 0; guard < 20; guard += 1) {
    let changed = false
    s = s.replace(innermost, (full, body, offset, whole) => {
      const before = whole.slice(0, offset)
      const opens = (before.match(/\\begin\{tabular\}/g) || []).length
      const closes = (before.match(/\\end\{tabular\}/g) || []).length
      if (opens <= closes) return full
      changed = true
      return String(body)
        .replace(/\\hline\b/g, ' ')
        .replace(/\\\\/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    })
    if (!changed) break
  }
  return s
}

const SUP_OPEN = '\u0004'
const SUP_CLOSE = '\u0005'
const SUB_OPEN = '\u0006'
const SUB_CLOSE = '\u0007'

/** Unicode has no raised "n", so `Z^{n+}` would read "Zn⁺" (zinc). HTML cells raise the whole script. */
function scriptText(token, map, open, close, html) {
  const t = String(token ?? '').trim()
  if (!html || [...t].every((ch) => map[ch])) return scriptDigits(t, map)
  return `${open}${t.replace(/-/g, '−')}${close}`
}

/** Table cell as upright words, with the spaces and subscripts the paper shows. */
function cellPlain(raw, { html = false } = {}) {
  let s = String(raw ?? '')
  s = s.replace(/\\(?:mathrm|mathbf|text|operatorname)\s*\{([^{}]*)\}/g, '$1')
  s = s.replace(/\\([a-zA-Z]+)/g, (m, name) => (CELL_SYMBOLS[name] ? CELL_SYMBOLS[name] : m))
  s = s.replace(/\s*≡\s*/g, '≡')
  s = s.replace(/\\,/g, ' ').replace(/~/g, ' ')
  s = s.replace(/\^\{([^{}]+)\}/g, (_, n) => scriptText(n, SUPER_DIGIT, SUP_OPEN, SUP_CLOSE, html))
  s = s.replace(/\^([\d+-])/g, (_, n) => SUPER_DIGIT[n] || n)
  s = s.replace(/_\{([^{}]+)\}/g, (_, n) => scriptText(n, SUB_DIGIT, SUB_OPEN, SUB_CLOSE, html))
  s = s.replace(/_(\d)/g, (_, n) => SUB_DIGIT[n] || n)
  s = s.replace(/\\[a-zA-Z]+/g, '')
  s = s.replace(/[{}$]/g, '')
  return s.replace(/\s+/g, ' ').trim()
}

function escapeCell(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

const BOLD_OPEN = '\u0001'
const BOLD_CLOSE = '\u0002'
const BOND_DASH = '\u0003'

/**
 * Cell HTML: bold atoms stay bold ("C–H bonds shown in bold"), formulas stay unbroken.
 * The bond dash is an entity: later OCR clean folds a literal en dash back to "-".
 */
function cellHtml(raw) {
  let s = String(raw ?? '')
  s = s.replace(/(\}|[A-Za-z])\s*-\s*(?=\\math(?:rm|bf)\s*\{|[A-Z])/g, `$1${BOND_DASH}`)
  s = s.replace(/(_\{[^{}]*\}|_\d)\s+(?=\\math(?:rm|bf)\s*\{[A-Z])/g, '$1')
  s = s.replace(/\\mathbf\s*\{([^{}]*)\}/g, `${BOLD_OPEN}$1${BOLD_CLOSE}`)
  const plain = cellPlain(s, { html: true }).replace(/\(\s+/g, '(').replace(/\s+\)/g, ')')
  return escapeCell(plain)
    .replace(new RegExp(`${BOLD_CLOSE}(\\s*${BOND_DASH}\\s*)${BOLD_OPEN}`, 'g'), '$1')
    .replace(new RegExp(BOLD_OPEN, 'g'), '<b>')
    .replace(new RegExp(BOLD_CLOSE, 'g'), '</b>')
    .replace(new RegExp(BOND_DASH, 'g'), '&ndash;')
    .replace(new RegExp(SUP_OPEN, 'g'), '<sup>')
    .replace(new RegExp(SUP_CLOSE, 'g'), '</sup>')
    .replace(new RegExp(SUB_OPEN, 'g'), '<sub>')
    .replace(new RegExp(SUB_CLOSE, 'g'), '</sub>')
}

/** "Column J Molecule" is two printed lines: the column name, then what it lists. */
function headerCellHtml(raw) {
  const html = cellHtml(raw).replace(/([A-Za-z]{2,})\((?=[a-z])/g, '$1 (')
  const m = html.match(
    /^((?:Column|List)\s*(?:-|–|&ndash;)?\s*(?:<b>\s*(?:I{1,3}|IV|[A-Z])\s*<\/b>|(?:I{1,3}|IV|[A-Z])\b))\s+(\S[\s\S]*)$/,
  )
  return m ? `${m[1]}<br>${m[2]}` : html
}

function isColumnHeaderRow(row) {
  return row.filter((cell) => /^(?:Column|List)\b/i.test(cellPlain(cell.text))).length >= 2
}

function columnAligns(spec) {
  return (String(spec || '').match(/[lcr]/gi) || []).map((ch) =>
    ch.toLowerCase() === 'l' ? 'left' : ch.toLowerCase() === 'r' ? 'right' : 'center',
  )
}

function splitRowCells(line) {
  /** @type {string[]} */
  const parts = []
  let buf = ''
  let depth = 0
  const raw = String(line ?? '')
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]
    if (ch === '\\' && raw[i + 1] === '&') {
      buf += '&'
      i += 1
      continue
    }
    if (ch === '{') depth += 1
    else if (ch === '}') depth = Math.max(0, depth - 1)
    else if (ch === '&' && depth === 0) {
      parts.push(buf)
      buf = ''
      continue
    }
    buf += ch
  }
  parts.push(buf)
  return parts.map(parseTableCell)
}

function parseTableCell(raw) {
  const text = String(raw ?? '').replace(/\\hline\b/g, ' ').trim()
  const multi = text.match(/^\\multicolumn\s*\{(\d+)\}/)
  if (multi) {
    let i = multi.index + multi[0].length
    while (/\s/.test(text[i] || '')) i += 1
    const align = readBraceGroup(text, i)
    if (align) {
      i = align.end
      while (/\s/.test(text[i] || '')) i += 1
      const inner = readBraceGroup(text, i)
      if (inner) {
        return { text: inner.inner, colspan: Number(multi[1]) || 1, rowspan: 1, omit: false }
      }
    }
  }
  const rowm = text.match(/^\\multirow\s*\{(\d+)\}/)
  if (rowm) {
    let i = rowm.index + rowm[0].length
    while (/\s/.test(text[i] || '')) i += 1
    const width = readBraceGroup(text, i)
    if (width) {
      i = width.end
      while (/\s/.test(text[i] || '')) i += 1
      const inner = readBraceGroup(text, i)
      if (inner) {
        return { text: inner.inner, colspan: 1, rowspan: Number(rowm[1]) || 1, omit: false }
      }
    }
  }
  return { text, colspan: 1, rowspan: 1, omit: false }
}

function parseTabularRows(body) {
  /** @type {{ text: string, colspan: number, rowspan: number, omit: boolean }[][]} */
  const rows = []
  for (const part of String(body ?? '').split(/\\\\/)) {
    const line = part.replace(/\\hline\b/g, ' ').trim()
    if (!line) continue
    rows.push(splitRowCells(line))
  }
  return rows
}

function columnCountOf(spec, rows) {
  const fromSpec = (String(spec || '').match(/[lcr]/gi) || []).length
  const fromRows = rows.reduce(
    (max, row) => Math.max(max, row.reduce((sum, cell) => sum + (cell.colspan || 1), 0)),
    0,
  )
  return Math.max(fromSpec, fromRows, 1)
}

function looksNumericCell(text) {
  return /^\d+(\.\d+)?$/.test(String(text ?? '').trim())
}

/**
 * Paper layout: a short "Readings" header covers both measurement columns,
 * and a salt name covers the blank continuation row already in the scan.
 * @param {{ text: string, colspan: number, rowspan: number, omit: boolean }[][]} rows
 * @param {number} colCount
 */
function layoutPaperDataRows(rows, colCount) {
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]
    const used = row.reduce((sum, cell) => sum + (cell.colspan || 1), 0)
    const readings = row.find((cell) => /^readings$/i.test(cellPlain(cell.text)) && (cell.colspan || 1) === 1)
    const next = rows[i + 1] || []
    const nextPlain = next.map((cell) => cellPlain(cell.text))
    const hasSubheads = nextPlain.some((t) => /^LS\b/i.test(t)) && nextPlain.some((t) => /^CS\b/i.test(t))
    if (readings && hasSubheads && used < colCount) {
      readings.colspan = (readings.colspan || 1) + (colCount - used)
    }
  }
  for (let i = 0; i < rows.length - 1; i += 1) {
    const row = rows[i]
    const next = rows[i + 1]
    if (!row[0] || (row[0].rowspan || 1) > 1 || !next?.[0]) continue
    const name = cellPlain(row[0].text)
    if (!name || /^(salt|readings|concentration)$/i.test(name)) continue
    if (cellPlain(next[0].text)) continue
    const rowRest = row.slice(1).map((cell) => cellPlain(cell.text))
    const nextRest = next.slice(1).map((cell) => cellPlain(cell.text))
    if (!rowRest.some(looksNumericCell) || !nextRest.some(looksNumericCell)) continue
    row[0].rowspan = 2
    next[0].omit = true
  }
  return rows
}

function isPaperDataTabular(block) {
  const raw = String(block ?? '')
  if (!/\\hline\b/.test(raw)) return false
  if (/!\[/.test(raw) || /\\includegraphics\b/.test(raw)) return false
  if (/List-I{1,2}/i.test(raw)) return false
  return true
}

function tabularToPaperTableHtml(spec, body) {
  const rows = layoutPaperDataRows(parseTabularRows(body), columnCountOf(spec, parseTabularRows(body)))
  if (rows.length < 2) return ''
  const aligns = columnAligns(spec)
  let html =
    '<table class="paper-data-table" style="border-collapse:collapse;margin:0.75rem auto;font-style:normal;color:inherit">'
  rows.forEach((row, rowIndex) => {
    const header = rowIndex === 0 && isColumnHeaderRow(row)
    html += '<tr>'
    let col = 0
    for (const cell of row) {
      if (cell.omit) {
        col += cell.colspan || 1
        continue
      }
      const text = header ? headerCellHtml(cell.text) : cellHtml(cell.text)
      const align = header || (cell.colspan || 1) > 1 ? 'center' : aligns[col] || 'center'
      col += cell.colspan || 1
      const style = [
        'border:1px solid #4b5563',
        'padding:0.4rem 0.75rem',
        `text-align:${align}`,
        'vertical-align:middle',
        'font-style:normal',
        text.replace(/<[^>]+>/g, '').length > 28 && !header
          ? 'max-width:11rem;white-space:normal'
          : 'white-space:nowrap',
      ].join(';')
      const span = [
        cell.colspan > 1 ? ` colspan="${cell.colspan}"` : '',
        cell.rowspan > 1 ? ` rowspan="${cell.rowspan}"` : '',
      ].join('')
      html += `<td${span} style="${style}">${text}</td>`
    }
    html += '</tr>'
  })
  html += '</table>'
  return html
}

const TABULAR_WITH_CLOSER_RE = /\\begin\{tabular\}(\[[^\]]*\])?(\{[^}]*\})?([\s\S]*?)\\end\{tabular\}(\s*\$+)?/gi

/**
 * Dollars after \end{tabular} close a `$…tabular…$` wrapper only when the table opened inside math.
 * In "\end{tabular}\n$\lambda^{0}$ is …" the dollar opens the next line's math and must stay.
 */
function tabularCloserToKeep(full, closer, offset, whole) {
  if (!closer) return ''
  const src = String(whole)
  const before = src.slice(0, offset)
  const insideMath = /\$\s*$/.test(before) || (before.match(/(?<!\\)\$/g) || []).length % 2 === 1
  if (insideMath) return ''
  const after = src.slice(offset + full.length)
  const run = closer.trim()
  const opensMath = run === '$' ? /^[^\n$]*[^\s$][^\n$]*(?<!\\)\$/.test(after) : run === '$$' && /^[^$]*[^\s$][^$]*\$\$/.test(after)
  return opensMath ? closer : ''
}

function replacePaperDataTabulars(text) {
  return String(text ?? '').replace(TABULAR_WITH_CLOSER_RE, (full, _pos, spec, body, closer, offset, whole) => {
    if (!isPaperDataTabular(full)) return full
    const html = tabularToPaperTableHtml(spec, body)
    return html ? `${html}${tabularCloserToKeep(full, closer, offset, whole)}` : full
  })
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** The scan already wrote micrometer and microcoulomb. Drop the tie that paints "μ m". */
export function tightenScannedMuUnits(text) {
  return String(text ?? '')
    .replace(/(\d)\s*\\mu\s*\\mathrm\s*\{\s*~\s*m\s*\}/g, (_, digit) => `${digit}\\,\\mu\\mathrm{m}`)
    .replace(/(\d)\s*\\mu\s*\\mathrm\s*\{\s*C\s*\}/g, (_, digit) => `${digit}\\,\\mu C`)
    .replace(/(\d)\s*\\mu\s+C(?![a-zA-Z])/g, (_, digit) => `${digit}\\,\\mu C`)
}

function chargeTokens(body) {
  const parts = String(body ?? '')
    .split(/\\quad/)
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length !== 6) return null
  if (!parts.every((part) => /\\sigma_\{0\}/.test(part))) return null
  return parts
}

function renderCharge(token) {
  try {
    const html = katex.renderToString(token, { throwOnError: false, displayMode: false })
    if (!html || /katex-error/.test(html)) return ''
    return html
  } catch {
    return ''
  }
}

function sheetColumn(token, region) {
  const drawn = renderCharge(token)
  if (!drawn) return ''
  const number = region
      ? `<div style="position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);font-size:1rem;line-height:1">${region}</div>`
    : ''
  return `<div data-sheet-charge="${escapeHtml(token)}" style="position:relative;width:2.8rem;height:5.5rem;border-left:2px solid #1f2937;box-sizing:border-box"><div style="position:absolute;bottom:100%;left:0;transform:translateX(-50%);white-space:nowrap;padding-bottom:0.2rem">${drawn}</div>${number}</div>`
}

function oneSheet(charges, label) {
  const cols = charges.map((token, index) => sheetColumn(token, index < 5 ? String(index + 1) : '')).join('')
  if (cols.includes('data-sheet-charge') === false || (cols.match(/data-sheet-charge=/g) || []).length !== 6) {
    return ''
  }
  return `<div data-sheet-label="${escapeHtml(label)}" style="display:flex;flex-direction:column;align-items:center;margin:0 0.4rem"><div style="display:flex;align-items:flex-end;padding-top:1.8rem">${cols}</div><div style="margin-top:0.45rem">${escapeHtml(label)}</div></div>`
}

/**
 * The scan writes Configuration I, then Configuration II, each as a charge
 * row plus a 1–5 region table. The paper draws those two figures side by side.
 * Charges and region numbers are copied from that scan. Nothing is added.
 * @param {unknown} text
 */
export function renderSideBySideSheetConfigs(text) {
  const src = tightenScannedMuUnits(text)
  const re =
    /\$([^$\n]*\\sigma_\{0\}[^$\n]*)\$\s*\\begin\{tabular\}(?:\[[^\]]*\])?\{[^}]*\}[\s\S]*?1\s*&\s*2\s*&\s*3\s*&\s*4\s*&\s*5[\s\S]*?\\end\{tabular\}(?:\s*\$+)?\s*(Configuration\s+[IVX]+)/g
  const hits = [...src.matchAll(re)]
  if (hits.length < 2) return src
  const first = hits[0]
  const second = hits[1]
  if (second.index !== first.index + first[0].length && !/^\s*$/.test(src.slice(first.index + first[0].length, second.index))) {
    return src
  }
  if (!/^Configuration I$/.test(first[2].trim()) || !/^Configuration II$/.test(second[2].trim())) return src
  const leftCharges = chargeTokens(first[1])
  const rightCharges = chargeTokens(second[1])
  if (!leftCharges || !rightCharges) return src
  const left = oneSheet(leftCharges, 'Configuration I')
  const right = oneSheet(rightCharges, 'Configuration II')
  if (!left || !right) return src
  const figure = `<div class="sheet-config-pair" style="display:flex;justify-content:center;align-items:flex-end;gap:2.75rem;flex-wrap:nowrap;margin:0.75rem 0">${left}${right}</div>`
  return src.slice(0, first.index) + figure + src.slice(second.index + second[0].length)
}

function drawnHtmlEnd(text, at) {
  const opener = String(text).startsWith('<table', at) ? 'table' : 'div'
  let depth = 0
  let j = at
  while (j < text.length) {
    if (text.startsWith(`<${opener}`, j)) {
      depth += 1
      j += opener.length + 1
      continue
    }
    if (text.startsWith(`</${opener}>`, j)) {
      depth -= 1
      j += opener.length + 3
      if (depth === 0) return j
      continue
    }
    j += 1
  }
  return -1
}

function nextDrawnBlockAt(src, from) {
  const sheet = src.indexOf('<div class="sheet-config-pair"', from)
  const reaction = src.indexOf('<div class="reaction-align"', from)
  if (sheet < 0) return reaction
  if (reaction < 0) return sheet
  return Math.min(sheet, reaction)
}

/** Pull a drawn figure out so later dollar repairs cannot wrap commands inside it. */
export function stashSheetConfigHtml(text) {
  const src = String(text ?? '')
  const blocks = []
  let out = ''
  let i = 0
  while (i < src.length) {
    const at = nextDrawnBlockAt(src, i)
    if (at < 0) {
      out += src.slice(i)
      break
    }
    out += src.slice(i, at)
    const end = drawnHtmlEnd(src, at)
    if (end < 0) {
      out += src.slice(at)
      break
    }
    blocks.push(src.slice(at, end))
    out += `SHEETBLOCK${blocks.length - 1}END`
    i = end
  }
  return { text: out, blocks }
}

export function restoreSheetConfigHtml(text, blocks) {
  return String(text ?? '').replace(/SHEETBLOCK(\d+)END/g, (_, n) => blocks[Number(n)] || '')
}

/** A drawn sheet figure is not raw TeX, even though KaTeX keeps the command in an annotation. */
export function stripSheetConfigHtml(text) {
  return stashSheetConfigHtml(text).text.replace(/SHEETBLOCK\d+END/g, ' ')
}

/** Table commands KaTeX would paint as source, healed before save and before display. */
export function healVisibleTableCommands(text) {
  return expandUnsupportedTableCommands(softenLeftRightInTables(String(text ?? '')))
}

function isReactionStepLine(line) {
  return /^\s*\$?\s*\(\s*[ivx]+\s*\)/i.test(String(line ?? '').replace(/\$/g, ' '))
}

function isReactionCondition(line) {
  const s = String(line ?? '')
  return /\\mathrm\s*\{\s*~\s*K|~\s*K\b|\(\s*\d{2,3}\s*-/.test(s)
}

function isReactionArrow(line) {
  return /\\xrightarrow\b/.test(String(line ?? ''))
}

function plainReactionLine(line) {
  let s = String(line ?? '')
    .replace(/\\hline\b/g, ' ')
    .replace(/\\multirow\s*\{[^{}]*\}\s*\{[^{}]*\}\s*\{[^{}]*\}/g, ' ')
    .replace(/\$+/g, '')
    .trim()
  if (!s) return ''
  s = s.replace(/\\xrightarrow\s*\{([^{}]*)\}/g, (_, inner) => `→ ${cellPlain(inner)}`.trim())
  s = s.replace(/\\Delta\b/g, 'Δ').replace(/\\nu\b/g, 'ν')
  return cellPlain(s)
}

function reactionLinesFromBody(body) {
  const lines = String(body ?? '')
    .split(/\\\\/)
    .flatMap((row) => row.split('&'))
    .flatMap((cell) => cell.split(/\n+/))
    .map((cell) => cell.replace(/\\hline\b/g, ' ').replace(/\\multirow\s*\{[^{}]*\}\s*\{[^{}]*\}\s*\{[^{}]*\}/g, ' ').trim())
    .filter(Boolean)
  if (lines.filter((line) => /^\(\s*[PQRS]\s*\)/.test(line)).length >= 2) return null
  const steps = lines.filter(isReactionStepLine)
  const reactants = lines.filter((line) => !isReactionStepLine(line) && !isReactionArrow(line) && !isReactionCondition(line))
  if (steps.length < 2 || reactants.length < 1) return null
  const flow = lines.filter((line) => isReactionStepLine(line) || isReactionCondition(line))
  const arrows = lines.filter(isReactionArrow)
  return [...reactants, ...flow, ...arrows].map(plainReactionLine).filter(Boolean)
}

function stepOnlyLines(body) {
  if (String(body ?? '').includes('&')) return null
  const lines = String(body ?? '')
    .split(/\\\\/)
    .map((line) => line.replace(/\\hline\b/g, ' ').trim())
    .filter(Boolean)
  if (lines.filter(isReactionStepLine).length < 2) return null
  return lines.map(plainReactionLine).filter(Boolean)
}

function reactionAlignHtml(reactant, steps) {
  const stepHtml = steps.map((step) => escapeCell(step)).join('<br>')
  return (
    `<div class="reaction-align" style="display:flex;align-items:flex-end;gap:0.65rem;margin:0.35rem 0">` +
    `<span style="white-space:nowrap">${escapeCell(reactant)}</span>` +
    `<span style="display:inline-flex;flex-direction:column;align-items:center;min-width:8rem">` +
    `<span style="display:block;text-align:center;line-height:1.35">${stepHtml}</span>` +
    `<span style="display:block;width:100%;border-bottom:1.5px solid currentColor;text-align:right;line-height:1">→</span>` +
    `</span></div>`
  )
}

/**
 * Reactant on the left. Every (i)/(ii) step stacked above one right arrow.
 * Uses only words already in the item. Does not add a reagent.
 * @param {string} raw
 */
function reactionPartsFromItem(raw) {
  const source = String(raw ?? '')
  if (!source.trim() || source.includes('reaction-align')) return null
  if (/\\(?:frac|includegraphics)\b|<smiles>/i.test(source)) return null
  const arrowInners = []
  let body = source.replace(/\\xrightarrow\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g, (_, inner) => {
    arrowInners.push(inner)
    return '\n'
  })
  body = body.replace(/→+/g, '\n')
  const plainBits = [body, ...arrowInners].map((chunk) => {
    let t = String(chunk).replace(/\\Delta\b/g, 'Δ').replace(/\\nu\b/g, 'ν')
    return cellPlain(t)
  })
  const bits = plainBits
    .join('\n')
    .split(/(?=\([ivx]+\))/i)
    .map((bit) => bit.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const steps = []
  const names = []
  for (const bit of bits) {
    if (/^\([ivx]+\)/i.test(bit)) {
      const peeled = bit.match(/^(.*\S)\s+([A-Z][a-z]{3,}(?:\s+acid)?)\s*$/)
      const reagent = peeled ? peeled[1].replace(/^\([ivx]+\)\s*/i, '').trim() : ''
      if (peeled && reagent && /[0-9₀-₉A-Za-z]/.test(reagent)) {
        steps.push(peeled[1].trim())
        names.push(peeled[2].trim())
      } else {
        steps.push(bit)
      }
    } else if (/^\(\s*\d{2,3}/.test(bit) && steps.length) {
      steps[steps.length - 1] = `${steps[steps.length - 1]} ${bit}`.trim()
    } else if (bit) {
      names.push(bit)
    }
  }
  const reactant = names.join(' ').replace(/\s+/g, ' ').trim()
  const words = reactant.split(' ').filter(Boolean)
  if (!reactant || words.length > 4 || reactant.length > 48) return null
  if (!/^[A-Z]/.test(reactant)) return null
  const reagentLike =
    /\\xrightarrow|→/.test(source) ||
    (steps.length >= 2 && /[0-9₀-₉]/.test(steps.join(' ')))
  if (!reagentLike || steps.length < 1) return null
  return { reactant, steps }
}

/**
 * List-II items stay reactant-left, reagents-above-arrow, so the next
 * re-parse does not flatten them into one sentence.
 * @param {unknown} text
 */
export function alignReactantLeftReactions(text) {
  const src = String(text ?? '')
  if (!src.trim() || !/\(\s*[1-5]\s*\)/.test(src)) return src
  const parts = src.split(/(?=\(\s*[1-5]\s*\))/)
  let changed = false
  const out = parts.map((part) => {
    const marked = part.match(/^(\(\s*[1-5]\s*\)\s*)([\s\S]*)$/)
    if (!marked) return part
    const parsed = reactionPartsFromItem(marked[2])
    if (!parsed) return part
    changed = true
    return `${marked[1].trim()}\n${reactionAlignHtml(parsed.reactant, parsed.steps)}\n`
  })
  return changed ? out.join('') : src
}

/**
 * A List-II reaction table whose left cells are blank and whose right cells
 * are the reagent steps. Draw the reactant with those steps. Empty cells and
 * raw tabular commands are not part of the scan's text.
 * @param {unknown} text
 */
export function unwrapReactionStepTables(text) {
  let s = String(text ?? '')
  for (let pass = 0; pass < 4; pass += 1) {
    const next = s.replace(
      /\\begin\{tabular\}(?:\[[^\]]*\])?\{[^}]*\}((?:(?!\\begin\{tabular\})[\s\S])*?)\\end\{tabular\}/gi,
      (full, body) => {
        const lines = stepOnlyLines(body) || reactionLinesFromBody(body)
        return lines ? lines.join('\n\n') : full
      },
    )
    if (next === s) break
    s = next
  }
  s = alignReactantLeftReactions(s)
  return s.replace(/\$[ \t]*\n?[ \t]*\$\$(?=\s*\([1-5]\))/g, '$ ')
}

export function convertLatexTabularToArray(text) {
  let s = renderSideBySideSheetConfigs(softenLeftRightInTables(flattenNestedTabulars(text)))
  s = unwrapReactionStepTables(s)
  s = replacePaperDataTabulars(s)
  s = expandUnsupportedTableCommands(s)
  if (!/tabular/i.test(s)) return stripDollarsInsideLatexEnvs(s)
  s = s.replace(/\\text\s*\{\s*begin\s*\}\s*\{\s*tabular\s*\}/gi, '\\begin{tabular}')
  s = s.replace(/\\text\s*\{\s*end\s*\}\s*\{\s*tabular\s*\}/gi, '\\end{tabular}')
  s = s.replace(TABULAR_WITH_CLOSER_RE, (full, _pos, spec, body, closer, offset, whole) => {
    const cleaned = String(body ?? '').replace(/\\\\\$+/g, '\\\\')
    if (/\$\$\s*\\begin\{tabular\}/i.test(full)) {
      return stripDollarsInsideLatexEnvs(
        full.replace(body, cleaned).replace(/tabular/gi, 'array').replace(/\$+$/, ''),
      )
    }
    return `${arrayFromTabularBody(spec, cleaned)}${tabularCloserToKeep(full, closer, offset, whole)}`
  })
  // OCR often drops \\end{tabular}. Still show a table, not raw \\begin{tabular}.
  s = s.replace(
    /\\begin\{tabular\}(\[[^\]]*\])?(\{[^}]*\})?([\s\S]*)$/gi,
    (full, _pos, spec, body) => {
      if (/\\end\{tabular\}/i.test(full) || /\\begin\{array\}/i.test(full)) return full
      const cutters = [
        body.search(/\n(?:Q(?:uestion)?\s*\.?\s*)?\d{1,2}[\.\)]\s/),
        body.search(/\n\(\s*[A-D]\s*\)\s/),
      ].filter((n) => n >= 12)
      const use = cutters.length ? body.slice(0, Math.min(...cutters)) : body
      return arrayFromTabularBody(spec, use)
    },
  )
  return stripDollarsInsideLatexEnvs(s)
}