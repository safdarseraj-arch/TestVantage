/**
 * Generic flat / pipe / broken vmatrix → proper \begin{vmatrix} repair.
 * Used for any determinant question when OCR loses matrix structure.
 */
import { repairMatrixRowBreaks } from './repairMatrixStem.js'
import { looksLikeExpRationalIntegralMcq } from './repairExpRationalIntegralMcqOcr.js'
import { looksLikeEcosxIntegralMcq } from './repairEcosxIntegralMcqOcr.js'
import { looksLikeGxIntegralOriginMcq } from './repairGxIntegralOriginMcqOcr.js'
import { looksLikeXxPowerLnIntegralMcq } from './repairXxPowerLnIntegralMcqOcr.js'
import { looksLikeExSinxCosxIntegralMcq } from './repairExSinxCosxIntegralMcqOcr.js'
import { looksLikeTanCscGxIntegralMcq } from './repairTanCscGxIntegralMcqOcr.js'
import { looksLikeExpXPlusInvXIntegralMcq } from './repairExpXPlusInvXIntegralMcqOcr.js'

/** @param {string} t */
function vmatrixBlockLocal(t) {
  return (String(t ?? '').match(/\\begin\{vmatrix\}[\s\S]*?\\end\{vmatrix\}/i) ?? [''])[0]
}

/** @param {string} t */
function vmatrixBrokenLocal(t) {
  const block = vmatrixBlockLocal(t)
  if (!block) return true
  if (!/\\\\/.test(block)) return true
  return block.split('\\\\').filter((r) => r.trim()).length < 2
}

/** @param {string} text */
function ensureVmatrixDelimiters(text) {
  let out = String(text ?? '')
  if (!/\\begin\{vmatrix\}/i.test(out)) return out
  if (/\$\$[\s\S]*\\begin\{vmatrix\}/i.test(out)) return out
  out = out.replace(
    /(?<!\$)\$?\s*\\begin\{vmatrix\}([\s\S]*?)\\end\{vmatrix\}\s*(=?\s*[^$\n]{0,80})?\$?(?!\$)/gi,
    (_, body, tail = '') => {
      const inner = repairVmatrixBody(body, 3)
      const rhs = String(tail ?? '').trim()
      return `$$\\begin{vmatrix}${inner}\\end{vmatrix}${rhs ? ` ${rhs}` : ''}$$`
    },
  )
  return out.replace(/\$\$\$+/g, '$$')
}

/** @param {string} s */
function normalizeOcrExponents(s) {
  return String(s ?? '')
    .replace(/(\d+)x'/gi, '$1x^2')
    .replace(/\bx'/gi, 'x^2')
    .replace(/(\d+)x\s*°/gi, '$1x^2')
    .replace(/x\s*°/gi, 'x^2')
    .replace(/(\d+)x\s*\*\s*2\b/gi, '$1x^2')
    .replace(/x\s*\*\s*2\b/gi, 'x^2')
    .replace(/bx\?>/gi, 'bx^2 +')
    .replace(/=\s*ax'/gi, '= ax^3 +')
}

/** @param {string} c */
function normalizeCell(c) {
  return normalizeOcrExponents(String(c ?? '').trim())
    .replace(/(\d+)x\s*-\s*(\d+)/g, '$1x - $2')
    .replace(/(\d+)x\s*\+\s*(\d+)/g, '$1x + $2')
    .replace(/x\s*-\s*(\d+)/g, 'x - $1')
    .replace(/x\s*\+\s*(\d+)/g, 'x + $1')
    .replace(/\s+/g, ' ')
}

/** @param {string} flat */
export function tokenizeVmatrixCells(flat) {
  let s = normalizeOcrExponents(flat)
    .replace(/\]/g, ' ')
    .replace(/[|{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Known glued-cell patterns
  s = s.replace(/x\s*\^?\s*2\s*-\s*29x\s*\+\s*313\b/gi, 'x^2 - 29 & x + 31 & 3')

  if (s.includes('&')) {
    const cells = s.split('&').map(normalizeCell).filter(Boolean)
    if (cells.length >= 4) return cells
  }

  // Include 1+x / 1+2y / 1+3z style cells BEFORE bare digits (otherwise 1+x → 1 only).
  const re =
    /\\(?:sec|cos|sin|csc|cot)\^?\{?2\}?\s*x|\([^)]{1,28}\)\^?\{?2\}?|\d+\s*[+\-−]\s*\d*[a-zA-Z](?:\s*\^\s*\{?-?\d+\}?)?|\d*[a-zA-Z]\s*[+\-−]\s*\d+(?:\s*\^\s*\{?-?\d+\}?)?|\d+x\s*(?:\^2|²)?\s*[+\-−]\s*\d+|\d+x\s*[+\-−]\s*\d+|x\s*(?:\^2|²)?\s*[+\-−]\s*\d+|x\s*[+\-−]\s*\d+|\d+x\s*(?:\^2|²)?|\d+x|x\s*\^2|[a-zA-Z]|-?\d+/gi
  const tokens = []
  let m
  while ((m = re.exec(s))) tokens.push(normalizeCell(m[0]))
  return tokens
}

/** @param {string[]} cells @param {number} cols */
export function cellsToVmatrixBody(cells, cols = 3) {
  if (!cells?.length || cells.length < cols) return null
  // Determinants must be square — never emit 2×3 / 3×2 artifacts.
  const n = Math.min(cells.length, cols * cols)
  const slice = cells.slice(0, n - (n % cols))
  if (slice.length < cols * cols) return null
  const rows = []
  for (let i = 0; i < slice.length; i += cols) {
    rows.push(slice.slice(i, i + cols).join(' & '))
  }
  if (rows.length !== cols) return null
  return rows.join(' \\\\ ')
}

/** @param {string} body @param {number} [cols] */
export function repairVmatrixBody(body, cols = 3) {
  let inner = String(body ?? '').trim()
  if (!inner) return inner

  inner = inner.replace(/\s*\\\\\s*/g, ' \\\\ ')
  if (/\\\\/.test(inner)) {
    const rowCount = inner.split('\\\\').filter((r) => r.trim()).length
    if (rowCount >= cols) return inner
  }

  const byAmp = inner.split('&').map((c) => normalizeCell(c)).filter(Boolean)
  if (byAmp.length >= cols * cols && byAmp.length % cols === 0) {
    return cellsToVmatrixBody(byAmp, cols) ?? inner
  }

  const tokens = tokenizeVmatrixCells(inner.replace(/&/g, ' '))
  const built = cellsToVmatrixBody(tokens, cols)
  if (built) return built

  const generic = repairMatrixRowBreaks(inner, cols)
  return generic.includes('\\\\') ? generic : inner
}

/** Fix every vmatrix block in text (row breaks, glued cells). */
export function repairExistingVmatrixBlocks(text) {
  return String(text ?? '').replace(
    /\\begin\{vmatrix\}([\s\S]*?)\\end\{vmatrix\}/gi,
    (_, body) => `\\begin{vmatrix}${repairVmatrixBody(body, 3)}\\end{vmatrix}`,
  )
}

/** @param {string} text */
function extractStemTail(text) {
  const s = String(text ?? '')
  const tails = [
    s.match(/(=\s*ax\s*[\^'³3][\s\S]*?then\s+value\s+of\s+[a-d]\s+is)/i)?.[1],
    s.match(/(=\s*ax\s*[\^'³3][\s\S]*?,\s*then\s+value\s+of\s+[a-d]\s+is)/i)?.[1],
    s.match(/(,\s*then\s+value\s+of\s+[a-d]\s+is)/i)?.[1],
    s.match(/(then\s+range\s+of\s+f\s*\(\s*x\s*\)\s+is[^\n(]*)/i)?.[1],
    s.match(/(then\s+value\s+of\s+determinant[^\n(]*)/i)?.[1],
    s.match(/(\bis\s+equal\s+to\s*)$/i)?.[1],
  ].filter(Boolean)
  return tails[0]?.trim() ?? ''
}

/** Build vmatrix from flat OCR before = or | */
export function buildVmatrixFromFlatSection(text, cols = 3) {
  const s = String(text ?? '')

  const detOf = s.match(/\bdeterminant\s+of\s+([\d\s]{4,80}?)\s+is\s+equal\s+to/i)
  if (detOf) {
    const cells = tokenizeVmatrixCells(detOf[1])
    const body = cellsToVmatrixBody(cells, cols)
    if (body) {
      return `$$\\begin{vmatrix} ${body} \\end{vmatrix} \\text{ is equal to}$$`
    }
  }

  let flatEnd = s.search(
    /=\s*ax(?!\s*\+\s*B\b)|=\s*a\s*x(?!\s*\+\s*B\b)|=\s*\\frac|=ax|,\s*then\s+value|\bthen\s+value|\bthen\s+range|\bis\s+equal\s+to|\(\s*A\s*\)/i,
  )
  if (flatEnd < 0) flatEnd = s.search(/\]\s*=|=/)
  if (flatEnd < 0) return null

  let flatPart = s.slice(0, flatEnd).replace(/^[\s\S]*?f\s*\(\s*x\s*\)\s*=\s*\|?\s*/i, '')
  flatPart = flatPart.replace(/^[\s\S]*?\|\s*/, '').trim()

  const cells = tokenizeVmatrixCells(flatPart)
  const body = cellsToVmatrixBody(cells, cols)
  if (!body) return null

  const tail = extractStemTail(s) || s.slice(flatEnd).replace(/^\s*=\s*/, '= ').trim()
  const rhs = tail.startsWith('=') ? tail : tail ? ` ${tail}` : ''
  return `$$\\begin{vmatrix} ${body} \\end{vmatrix}${rhs}$$`
}

/** Convert f(x)=|…| pipe rows to vmatrix when cells are recognizable. */
function repairPipeVmatrix(text) {
  const s = String(text ?? '')
  if (!/f\s*\(\s*x\s*\)\s*=\s*\|/i.test(s) || /\\begin\{vmatrix\}/i.test(s)) return text

  const pipeMatch = s.match(/f\s*\(\s*x\s*\)\s*=\s*\|([^|]+)\|([^|]*)\|([^|]*)\|/i)
  if (pipeMatch) {
    const rows = pipeMatch.slice(1, 4).map((r) => tokenizeVmatrixCells(r).join(' & '))
    if (rows.filter((r) => r).length >= 2) {
      const body = rows.join(' \\\\ ')
      const tail = s.slice(pipeMatch.index + pipeMatch[0].length).replace(/^[\s,]*/, '')
      return s.replace(
        pipeMatch[0],
        `$$f(x) = \\begin{vmatrix} ${body} \\end{vmatrix}$$${tail ? ` ${tail}` : ''}`,
      )
    }
  }
  return text
}

/** @param {string} t */
function isNonDeterminantGeometry(t) {
  const s = String(t ?? '')
  return (
    /triangle formed by the points|locus of\s*P|identify the correct statement/i.test(s) ||
    (/area of the triangle|sq\.?\s*units/i.test(s) && !/\\begin\{vmatrix\}/i.test(s)) ||
    /Column-I|Column-II|match the following/i.test(s) ||
    (/A\s*\(\s*\d+\s*,\s*\d+\s*\)/i.test(s) &&
      /B\s*\(\s*\d+\s*,\s*\d+\s*\)/i.test(s) &&
      !/\bdeterminant\b|\\begin\{vmatrix\}|\\det\s*\(/i.test(s))
  )
}

/** @param {string} t */
export function looksLikeFlatDeterminant(t) {
  const s = String(t ?? '')
  if (looksLikeExpRationalIntegralMcq(s)) return false
  if (looksLikeEcosxIntegralMcq(s)) return false
  if (looksLikeGxIntegralOriginMcq(s)) return false
  if (looksLikeXxPowerLnIntegralMcq(s)) return false
  if (looksLikeExSinxCosxIntegralMcq(s)) return false
  if (looksLikeTanCscGxIntegralMcq(s)) return false
  if (looksLikeExpXPlusInvXIntegralMcq(s)) return false
  if (isNonDeterminantGeometry(s)) return false
  if (/\\begin\{vmatrix\}/i.test(s)) return true
  if (/f\s*\(\s*x\s*\)\s*=\s*\|/i.test(s)) return true
  if (/\bdeterminant\b|\\det\s*\(|\\operatorname\s*\{\s*det/i.test(s)) return true
  if (/\]\s*=\s*ax|=\s*ax\s*[\^'³]|=\s*a\s*x\s*[\^'³]/i.test(s)) return true
  if (
    (s.match(/\d+x\s*(?:\^2|²|'|°)?\s*[+\-−]\s*\d+/gi) ?? []).length >= 2 &&
    (s.match(/\b\d\b/g) ?? []).length >= 2 &&
    (/=\s*ax|then\s+value\s+of\s+[a-d]\s+is/i.test(s))
  ) {
    return true
  }
  if (tokenizeVmatrixCells(s).length >= 9 && /\bdeterminant\b|=\s*ax|\]\s*=/i.test(s)) return true
  return false
}

/** Main generic flat/pipe/broken vmatrix OCR repair. */
export function repairFlatVmatrixOcr(text) {
  let t = normalizeOcrExponents(String(text ?? '').replace(/\r\n/g, '\n').trim())
  if (!t || looksLikeExpRationalIntegralMcq(t) || looksLikeEcosxIntegralMcq(t) || looksLikeGxIntegralOriginMcq(t) || looksLikeXxPowerLnIntegralMcq(t) || looksLikeExSinxCosxIntegralMcq(t) || looksLikeTanCscGxIntegralMcq(t) || looksLikeExpXPlusInvXIntegralMcq(t) || !looksLikeFlatDeterminant(t)) return text

  if (/\\begin\{vmatrix\}/i.test(t)) {
    t = repairExistingVmatrixBlocks(t)
    if (!vmatrixBrokenLocal(t)) return ensureVmatrixDelimiters(t)
  }

  t = repairPipeVmatrix(t)
  if (/\\begin\{vmatrix\}/i.test(t) && !vmatrixBrokenLocal(t)) {
    return ensureVmatrixDelimiters(t)
  }

  const built = buildVmatrixFromFlatSection(t)
  if (built && /\\\\/.test(built)) return built

  if (/\\begin\{vmatrix\}/i.test(t)) {
    return ensureVmatrixDelimiters(repairExistingVmatrixBlocks(t))
  }

  return t
}

/**
 * Final parse pass — always restore vmatrix when determinant detected.
 * @param {{ text?: string, options?: string[], _ocrSource?: string }} parsed
 */
export function repairFlatVmatrixParse(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed
  const blob = `${parsed.text ?? ''}\n${(parsed.options ?? []).join('\n')}\n${parsed._ocrSource ?? ''}`
  if (!looksLikeFlatDeterminant(blob)) return parsed

  let text = repairFlatVmatrixOcr(parsed.text ?? '')
  if (!/\\begin\{vmatrix\}/i.test(text) || vmatrixBrokenLocal(text)) {
    text = repairFlatVmatrixOcr(blob)
  }
  if (/\\begin\{vmatrix\}/i.test(text)) {
    text = repairExistingVmatrixBlocks(text)
    text = ensureVmatrixDelimiters(text)
    if (!vmatrixBrokenLocal(text)) parsed.text = text
  }
  return parsed
}
