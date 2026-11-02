/**
 * Convert Word Office Math (OMML) XML fragments to compact LaTeX for bank upload.
 * Mammoth's raw text drops equations as � — we rewrite OMML to $...$ first.
 * Also remaps Symbol-font <w:sym> / U+F0xx tofu boxes (see wordSymbolFont.js).
 */

import {
  countSymbolPuaChars,
  rewriteWordSymInDocumentXml,
  repairWordSymbolFontText,
} from './wordSymbolFont.js'
import { extractBodyTextFromDocumentXml } from './docxXmlExtract.js'

/** @param {string} s */
function xmlUnescape(s) {
  return String(s ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

/** @param {string} s */
export function xmlEscapeText(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Map common unicode math / greek to LaTeX. */
const UNICODE_TO_TEX = {
  '×': '\\times',
  '·': '\\cdot',
  '÷': '\\div',
  '−': '-',
  '–': '-',
  '—': '-',
  '≤': '\\le',
  '≥': '\\ge',
  '≠': '\\ne',
  '≈': '\\approx',
  '±': '\\pm',
  '∞': '\\infty',
  '√': '\\sqrt',
  '∫': '\\int',
  '∑': '\\sum',
  '∏': '\\prod',
  '∈': '\\in',
  '∉': '\\notin',
  '⊂': '\\subset',
  '⊆': '\\subseteq',
  '∪': '\\cup',
  '∩': '\\cap',
  '→': '\\to',
  '⇒': '\\Rightarrow',
  '⇔': '\\Leftrightarrow',
  '∀': '\\forall',
  '∃': '\\exists',
  '°': '^\\circ',
  'α': '\\alpha',
  'β': '\\beta',
  'γ': '\\gamma',
  'δ': '\\delta',
  'ε': '\\varepsilon',
  'θ': '\\theta',
  'λ': '\\lambda',
  'μ': '\\mu',
  'π': '\\pi',
  'ρ': '\\rho',
  'σ': '\\sigma',
  'τ': '\\tau',
  'φ': '\\phi',
  'ω': '\\omega',
  'Δ': '\\Delta',
  'Σ': '\\Sigma',
  'Π': '\\Pi',
  'Ω': '\\Omega',
  'ℝ': '\\mathbb{R}',
  'ℕ': '\\mathbb{N}',
  'ℤ': '\\mathbb{Z}',
  'ℚ': '\\mathbb{Q}',
  '′': "'",
  '″': "''",
}

/** @param {string} text */
export function unicodeMathToLatex(text) {
  let out = ''
  for (const ch of String(text ?? '')) {
    out += UNICODE_TO_TEX[ch] ?? ch
  }
  return out
}

/**
 * First matching child element inner XML by local name.
 * @param {string} xml
 * @param {string} localName
 */
function findChildXml(xml, localName) {
  const re = new RegExp(
    `<(?:[\\w-]+:)?${localName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${localName}>`,
    'i',
  )
  const m = String(xml ?? '').match(re)
  return m ? m[1] : ''
}

/**
 * Replace innermost known OMML structures repeatedly, then gather remaining m:t text.
 * @param {string} xml
 */
export function ommlFragmentToLatex(xml) {
  let src = String(xml ?? '')
  if (!src.trim()) return ''

  for (let pass = 0; pass < 40; pass += 1) {
    let changed = false

    src = src.replace(
      /<(?:[\w-]+:)?f\b[^>]*>\s*<(?:[\w-]+:)?num\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?num>\s*<(?:[\w-]+:)?den\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?den>\s*<\/(?:[\w-]+:)?f>/gi,
      (_, num, den) => {
        changed = true
        return `<m:t>\\frac{${ommlFragmentToLatex(num)}}{${ommlFragmentToLatex(den)}}</m:t>`
      },
    )

    src = src.replace(
      /<(?:[\w-]+:)?rad\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?rad>/gi,
      (full) => {
        if (/<(?:[\w-]+:)?rad\b/i.test(findChildXml(full, 'e'))) return full
        changed = true
        const deg = findChildXml(full, 'deg')
        const e = findChildXml(full, 'e')
        const body = ommlFragmentToLatex(e)
        const latex = deg ? `\\sqrt[${ommlFragmentToLatex(deg)}]{${body}}` : `\\sqrt{${body}}`
        return `<m:t>${latex}</m:t>`
      },
    )

    src = src.replace(
      /<(?:[\w-]+:)?sSup\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?sSup>/gi,
      (full) => {
        if (/<(?:[\w-]+:)?sSup\b/i.test(findChildXml(full, 'e'))) return full
        changed = true
        const base = ommlFragmentToLatex(findChildXml(full, 'e'))
        const sup = ommlFragmentToLatex(findChildXml(full, 'sup'))
        return `<m:t>{${base}}^{${sup}}</m:t>`
      },
    )

    src = src.replace(
      /<(?:[\w-]+:)?sSubSup\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?sSubSup>/gi,
      (full) => {
        changed = true
        const base = ommlFragmentToLatex(findChildXml(full, 'e'))
        const sub = ommlFragmentToLatex(findChildXml(full, 'sub'))
        const sup = ommlFragmentToLatex(findChildXml(full, 'sup'))
        return `<m:t>{${base}}_{${sub}}^{${sup}}</m:t>`
      },
    )

    src = src.replace(
      /<(?:[\w-]+:)?sSub\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?sSub>/gi,
      (full) => {
        if (/sSubSup/i.test(full)) return full
        if (/<(?:[\w-]+:)?sSub\b/i.test(findChildXml(full, 'e'))) return full
        changed = true
        const base = ommlFragmentToLatex(findChildXml(full, 'e'))
        const sub = ommlFragmentToLatex(findChildXml(full, 'sub'))
        return `<m:t>{${base}}_{${sub}}</m:t>`
      },
    )

    src = src.replace(
      /<(?:[\w-]+:)?d\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?d>/gi,
      (full) => {
        if (/<(?:[\w-]+:)?d\b/i.test(findChildXml(full, 'e'))) return full
        changed = true
        const e = ommlFragmentToLatex(findChildXml(full, 'e'))
        return `<m:t>\\left(${e}\\right)</m:t>`
      },
    )

    src = src.replace(
      /<(?:[\w-]+:)?func\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?func>/gi,
      (full) => {
        changed = true
        const name = ommlFragmentToLatex(findChildXml(full, 'fName')).replace(/\\/g, '').trim()
        const e = ommlFragmentToLatex(findChildXml(full, 'e'))
        const latex = /^(sin|cos|tan|log|ln|lim|max|min|det|exp)$/i.test(name)
          ? `\\${name.toLowerCase()} ${e}`
          : `${name} ${e}`.trim()
        return `<m:t>${latex}</m:t>`
      },
    )

    src = src.replace(
      /<(?:[\w-]+:)?nary\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?nary>/gi,
      (full) => {
        changed = true
        const chrRaw = findChildXml(full, 'chr').replace(/<[^>]+>/g, '').trim() || '∑'
        const op = unicodeMathToLatex(xmlUnescape(chrRaw)) || '\\sum'
        const sub = ommlFragmentToLatex(findChildXml(full, 'sub'))
        const sup = ommlFragmentToLatex(findChildXml(full, 'sup'))
        const e = ommlFragmentToLatex(findChildXml(full, 'e'))
        let out = op
        if (sub) out += `_{${sub}}`
        if (sup) out += `^{${sup}}`
        return `<m:t>${`${out} ${e}`.trim()}</m:t>`
      },
    )

    if (!changed) break
  }

  const texts = []
  const re = /<(?:[\w-]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?t>/gi
  let m
  while ((m = re.exec(src))) {
    texts.push(xmlUnescape(m[1]))
  }
  if (texts.length) return unicodeMathToLatex(texts.join(''))
  return unicodeMathToLatex(xmlUnescape(src.replace(/<[^>]+>/g, '')))
}

/**
 * Replace Word OMML blocks in document.xml with literal $latex$ text runs.
 * @param {string} documentXml
 */
export function rewriteOmmlInDocumentXml(documentXml) {
  let xml = String(documentXml ?? '')

  const replaceBlock = (_full, inner) => {
    const latex = ommlFragmentToLatex(inner).trim()
    if (!latex) return ' '
    const body = xmlEscapeText(`$${latex}$`)
    return `<w:r><w:t xml:space="preserve">${body}</w:t></w:r>`
  }

  xml = xml.replace(
    /<(?:[\w-]+:)?oMathPara\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?oMathPara>/gi,
    replaceBlock,
  )
  xml = xml.replace(
    /<(?:[\w-]+:)?oMath\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?oMath>/gi,
    replaceBlock,
  )
  return xml
}

/** @param {string} text */
export function countReplacementChars(text) {
  const m = String(text ?? '').match(/\uFFFD/g)
  return m ? m.length : 0
}

/** @param {string} text */
export function wordExtractLooksBroken(text) {
  const s = String(text ?? '')
  const bad = countReplacementChars(s) + countSymbolPuaChars(s)
  if (bad >= 8) return true
  if (bad >= 3 && bad / Math.max(s.replace(/\s+/g, '').length, 1) > 0.04) return true
  return false
}

/**
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Promise<string>}
 */
export async function extractDocxTextWithMath(arrayBuffer) {
  const JSZipMod = await import('jszip')
  const JSZip = JSZipMod.default ?? JSZipMod
  const zip = await JSZip.loadAsync(arrayBuffer)
  const entry = zip.file('word/document.xml')
  if (!entry) throw new Error('Invalid Word file (missing document.xml).')

  const documentXml = await entry.async('string')

  // Primary: walk document.xml (w:t, w:sym, m:oMath, superscript runs).
  let text = extractBodyTextFromDocumentXml(documentXml)
  if (text.trim() && !wordExtractLooksBroken(text)) {
    return text.trim()
  }

  // Fallback: rewrite sym/OMML then mammoth raw text.
  let rewritten = rewriteWordSymInDocumentXml(documentXml)
  rewritten = rewriteOmmlInDocumentXml(rewritten)
  zip.file('word/document.xml', rewritten)
  const buf = await zip.generateAsync({ type: 'arraybuffer' })
  const mammothMod = await import('mammoth')
  const mammoth = mammothMod.default ?? mammothMod
  const { value } = await mammoth.extractRawText({ arrayBuffer: buf })
  const mammothText = repairWordSymbolFontText(String(value ?? '').trim())
  if (mammothText.length > text.length) text = mammothText
  return text.trim()
}
