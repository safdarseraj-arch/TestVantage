/**
 * Read plain text straight from word/document.xml (more reliable than mammoth for math).
 */

import { ommlFragmentToLatex, unicodeMathToLatex } from './wordOmmlExtract.js'
import {
  repairWordSymbolFontText,
  symbolCharHexToText,
} from './wordSymbolFont.js'

/** @param {string} s */
function xmlUnescape(s) {
  return String(s ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

const SUPER_DIGIT = {
  '⁰': '^0',
  '¹': '^1',
  '²': '^2',
  '³': '^3',
  '⁴': '^4',
  '⁵': '^5',
  '⁶': '^6',
  '⁷': '^7',
  '⁸': '^8',
  '⁹': '^9',
  '⁺': '^+',
  '⁻': '^-',
  '⁼': '^=',
  '⁽': '^(',
  '⁾': '^)',
  'ⁿ': '^n',
}

const SUB_DIGIT = {
  '₀': '_0',
  '₁': '_1',
  '₂': '_2',
  '₃': '_3',
  '₄': '_4',
  '₅': '_5',
  '₆': '_6',
  '₇': '_7',
  '₈': '_8',
  '₉': '_9',
  '₊': '_+',
  '₋': '_-',
  '₌': '_=',
  '₍': '_(',
  '₎': '_)',
}

/** @param {string} text */
function normalizeSupSubDigits(text) {
  let out = ''
  for (const ch of String(text ?? '')) {
    out += SUPER_DIGIT[ch] ?? SUB_DIGIT[ch] ?? ch
  }
  return out
}

/**
 * @param {string} attrs
 * @returns {string}
 */
function symCharFromAttrs(attrs) {
  const m =
    String(attrs).match(/\bw:char\s*=\s*["']([^"']+)["']/i) ??
    String(attrs).match(/\bchar\s*=\s*["']([^"']+)["']/i)
  return symbolCharHexToText(m?.[1] ?? '')
}

/** @param {string} runXml inner of w:r */
function extractRunInnerText(runXml) {
  const superScript = /<(?:[\w-]+:)?vertAlign\b[^>]*\bval\s*=\s*["']superscript["']/i.test(runXml)
  const subScript = /<(?:[\w-]+:)?vertAlign\b[^>]*\bval\s*=\s*["']subscript["']/i.test(runXml)

  /** @type {string[]} */
  const chunks = []
  const src = String(runXml ?? '')

  const symRe = /<(?:[\w-]+:)?sym\b([^>]*?)\/?>/gi
  let sm
  while ((sm = symRe.exec(src))) {
    const ch = symCharFromAttrs(sm[1])
    if (ch) chunks.push(ch)
  }

  const tRe = /<(?:[\w-]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?t>/gi
  let tm
  while ((tm = tRe.exec(src))) {
    chunks.push(xmlUnescape(tm[1]))
  }

  let joined = normalizeSupSubDigits(chunks.join(''))
  joined = repairWordSymbolFontText(joined)
  if (!joined) return ''
  if (superScript) return `^{${joined}}`
  if (subScript) return `_{${joined}}`
  return joined
}

/** @param {string} mathInner */
function mathInnerToText(mathInner) {
  const latex = ommlFragmentToLatex(mathInner).trim()
  if (!latex) return ''
  return `$${latex}$`
}

/**
 * @param {string} pXml inner of w:p (or table cell)
 */
export function extractParagraphXmlText(pXml) {
  const src = String(pXml ?? '')
  if (!src.trim()) return ''

  /** @type {string[]} */
  const parts = []

  const tokenRe =
    /<(?:[\w-]+:)?r\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?r>|<(?:[\w-]+:)?oMathPara\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?oMathPara>|<(?:[\w-]+:)?oMath\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?oMath>|<(?:[\w-]+:)?tab\b[^>]*\/?>|<(?:[\w-]+:)?br\b[^>]*\/?>/gi

  let m
  let last = 0
  while ((m = tokenRe.exec(src))) {
    if (m.index > last) {
      const gap = src.slice(last, m.index).replace(/<[^>]+>/g, '')
      if (gap.trim()) parts.push(repairWordSymbolFontText(xmlUnescape(gap)))
    }
    last = m.index + m[0].length

    if (m[1] != null) {
      const t = extractRunInnerText(m[1])
      if (t) parts.push(t)
    } else if (m[2] != null) {
      const t = mathInnerToText(m[2])
      if (t) parts.push(t)
    } else if (m[3] != null) {
      const t = mathInnerToText(m[3])
      if (t) parts.push(t)
    } else if (/br\b/i.test(m[0])) {
      parts.push('\n')
    } else {
      parts.push(' ')
    }
  }

  if (last < src.length) {
    const tail = src.slice(last).replace(/<[^>]+>/g, '')
    if (tail.trim()) parts.push(repairWordSymbolFontText(xmlUnescape(tail)))
  }

  return parts.join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * @param {string} documentXml
 */
export function extractBodyTextFromDocumentXml(documentXml) {
  const bodyMatch = String(documentXml ?? '').match(
    /<(?:[\w-]+:)?body\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?body>/i,
  )
  const body = bodyMatch?.[1] ?? documentXml
  const paragraphs = []

  const pRe = /<(?:[\w-]+:)?p\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?p>/gi
  let pm
  while ((pm = pRe.exec(body))) {
    const line = extractParagraphXmlText(pm[1])
    if (line) paragraphs.push(line)
  }

  if (!paragraphs.length) {
    return repairWordSymbolFontText(
      unicodeMathToLatex(xmlUnescape(body.replace(/<[^>]+>/g, ' '))),
    )
  }

  return paragraphs.join('\n\n')
}

/**
 * Full pipeline: sym + OMML rewrite, then walk XML (no mammoth).
 * @param {string} documentXml
 */
export function documentXmlToPlainText(documentXml) {
  let xml = String(documentXml ?? '')
  // Import rewrite helpers lazily to avoid circular deps at module init
  return extractBodyTextFromDocumentXml(xml)
}

/** @param {string} documentXml */
export function countDocxSymElements(documentXml) {
  const sym = (String(documentXml ?? '').match(/<(?:[\w-]+:)?sym\b/gi) ?? []).length
  const omath = (String(documentXml ?? '').match(/<(?:[\w-]+:)?oMath\b/gi) ?? []).length
  return { sym, omath }
}
