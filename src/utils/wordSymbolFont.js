/**
 * Decode Microsoft Word Symbol-font Private Use Area (U+F020–U+F0FF)
 * and <w:sym w:char="…"/> placeholders into real Unicode / LaTeX-friendly chars.
 *
 * Adobe Symbol encoding table: https://www.unicode.org/Public/MAPPINGS/VENDORS/ADOBE/symbol.txt
 * Word stores glyph index 0xXX as U+F0XX.
 */

/** Symbol byte (0x20–0xFE) → Unicode code point (prefer math/real over CUS fillers). */
const SYMBOL_BYTE_TO_CP = {
  0x20: 0x0020,
  0x21: 0x0021,
  0x22: 0x2200, // ∀
  0x23: 0x0023,
  0x24: 0x2203, // ∃
  0x25: 0x0025,
  0x26: 0x0026,
  0x27: 0x220b, // ∋
  0x28: 0x0028,
  0x29: 0x0029,
  0x2a: 0x2217,
  0x2b: 0x002b, // +
  0x2c: 0x002c,
  0x2d: 0x2212, // −
  0x2e: 0x002e,
  0x2f: 0x002f,
  0x30: 0x0030,
  0x31: 0x0031,
  0x32: 0x0032,
  0x33: 0x0033,
  0x34: 0x0034,
  0x35: 0x0035,
  0x36: 0x0036,
  0x37: 0x0037,
  0x38: 0x0038,
  0x39: 0x0039,
  0x3a: 0x003a,
  0x3b: 0x003b,
  0x3c: 0x003c,
  0x3d: 0x003d, // =
  0x3e: 0x003e,
  0x3f: 0x003f,
  0x40: 0x2245, // ≅
  0x41: 0x0391,
  0x42: 0x0392,
  0x43: 0x03a7,
  0x44: 0x0394,
  0x45: 0x0395,
  0x46: 0x03a6,
  0x47: 0x0393,
  0x48: 0x0397,
  0x49: 0x0399,
  0x4a: 0x03d1,
  0x4b: 0x039a,
  0x4c: 0x039b,
  0x4d: 0x039c,
  0x4e: 0x039d,
  0x4f: 0x039f,
  0x50: 0x03a0,
  0x51: 0x0398,
  0x52: 0x03a1,
  0x53: 0x03a3,
  0x54: 0x03a4,
  0x55: 0x03a5,
  0x56: 0x03c2,
  0x57: 0x03a9,
  0x58: 0x039e,
  0x59: 0x03a8,
  0x5a: 0x0396,
  0x5b: 0x005b,
  0x5c: 0x2234, // ∴
  0x5d: 0x005d,
  0x5e: 0x22a5, // ⊥
  0x5f: 0x005f,
  0x61: 0x03b1,
  0x62: 0x03b2,
  0x63: 0x03c7,
  0x64: 0x03b4,
  0x65: 0x03b5,
  0x66: 0x03c6,
  0x67: 0x03b3,
  0x68: 0x03b7,
  0x69: 0x03b9,
  0x6a: 0x03d5,
  0x6b: 0x03ba,
  0x6c: 0x03bb,
  0x6d: 0x03bc,
  0x6e: 0x03bd,
  0x6f: 0x03bf,
  0x70: 0x03c0,
  0x71: 0x03b8,
  0x72: 0x03c1,
  0x73: 0x03c3,
  0x74: 0x03c4,
  0x75: 0x03c5,
  0x76: 0x03d6,
  0x77: 0x03c9,
  0x78: 0x03be,
  0x79: 0x03c8,
  0x7a: 0x03b6,
  0x7b: 0x007b,
  0x7c: 0x007c,
  0x7d: 0x007d,
  0x7e: 0x223c,
  0xa0: 0x20ac,
  0xa1: 0x03d2,
  0xa2: 0x2032,
  0xa3: 0x2264, // ≤
  0xa4: 0x2044,
  0xa5: 0x221e, // ∞
  0xa6: 0x0192,
  0xab: 0x2194,
  0xac: 0x2190,
  0xad: 0x2191,
  0xae: 0x2192,
  0xaf: 0x2193,
  0xb0: 0x00b0,
  0xb1: 0x00b1, // ±
  0xb2: 0x2033,
  0xb3: 0x2265, // ≥
  0xb4: 0x00d7, // ×
  0xb5: 0x221d,
  0xb6: 0x2202, // ∂
  0xb7: 0x2022,
  0xb8: 0x00f7,
  0xb9: 0x2260, // ≠
  0xba: 0x2261, // ≡
  0xbb: 0x2248, // ≈
  0xbc: 0x2026,
  0xc0: 0x2135,
  0xc4: 0x2297,
  0xc5: 0x2295,
  0xc6: 0x2205,
  0xc7: 0x2229,
  0xc8: 0x222a,
  0xc9: 0x2283,
  0xca: 0x2287,
  0xcb: 0x2284,
  0xcc: 0x2282,
  0xcd: 0x2286,
  0xce: 0x2208, // ∈
  0xcf: 0x2209, // ∉
  0xd0: 0x2220,
  0xd1: 0x2207,
  0xd5: 0x220f,
  0xd6: 0x221a, // √
  0xd7: 0x22c5,
  0xd8: 0x00ac,
  0xd9: 0x2227,
  0xda: 0x2228,
  0xdb: 0x21d4,
  0xdc: 0x21d0,
  0xdd: 0x21d1,
  0xde: 0x21d2,
  0xdf: 0x21d3,
  0xe0: 0x25ca,
  0xe1: 0x2329,
  0xe5: 0x2211, // ∑
  0xf1: 0x232a,
  0xf2: 0x222b, // ∫
}

/** Common Unicode math → LaTeX (after Symbol decode). */
const MATH_UNICODE_TO_TEX = {
  '∀': '\\forall',
  '∃': '\\exists',
  '∈': '\\in',
  '∉': '\\notin',
  '⊂': '\\subset',
  '⊆': '\\subseteq',
  '⊃': '\\supset',
  '⊇': '\\supseteq',
  '∪': '\\cup',
  '∩': '\\cap',
  '∅': '\\emptyset',
  '∞': '\\infty',
  '√': '\\sqrt',
  '∑': '\\sum',
  '∏': '\\prod',
  '∫': '\\int',
  '∂': '\\partial',
  '∇': '\\nabla',
  '≤': '\\le',
  '≥': '\\ge',
  '≠': '\\ne',
  '≈': '\\approx',
  '≡': '\\equiv',
  '≅': '\\cong',
  '±': '\\pm',
  '×': '\\times',
  '·': '\\cdot',
  '÷': '\\div',
  '∴': '\\therefore',
  '⊥': '\\perp',
  '→': '\\to',
  '⇒': '\\Rightarrow',
  '⇔': '\\Leftrightarrow',
  'ℝ': '\\mathbb{R}',
  'α': '\\alpha',
  'β': '\\beta',
  'γ': '\\gamma',
  'δ': '\\delta',
  'θ': '\\theta',
  'λ': '\\lambda',
  'μ': '\\mu',
  'π': '\\pi',
  'σ': '\\sigma',
  'φ': '\\phi',
  'ω': '\\omega',
  'Δ': '\\Delta',
  'Σ': '\\Sigma',
  'Ω': '\\Omega',
  '−': '-',
}

/**
 * @param {number} byte 0–255
 * @returns {string}
 */
export function symbolByteToChar(byte) {
  const b = byte & 0xff
  const cp = SYMBOL_BYTE_TO_CP[b]
  if (cp == null) return ''
  return String.fromCodePoint(cp)
}

/**
 * @param {string} hex e.g. "F02B" or "003D"
 */
export function symbolCharHexToText(hex) {
  const h = String(hex ?? '').replace(/^0x/i, '').trim()
  if (!/^[0-9a-f]{2,4}$/i.test(h)) return ''
  const n = parseInt(h, 16)
  if (!Number.isFinite(n)) return ''
  // Word w:char is usually F0xx in PUA
  if (n >= 0xf020 && n <= 0xf0ff) return symbolByteToChar(n & 0xff)
  if (n >= 0x20 && n <= 0xff) return symbolByteToChar(n)
  try {
    return String.fromCodePoint(n)
  } catch {
    return ''
  }
}

/**
 * Replace Word <w:sym w:char="F0.."/> runs with plain text.
 * @param {string} documentXml
 */
export function rewriteWordSymInDocumentXml(documentXml) {
  return String(documentXml ?? '').replace(
    /<(?:[\w-]+:)?sym\b([^>]*?)\/?>/gi,
    (_full, attrs) => {
      const m = String(attrs).match(/\bw:char\s*=\s*["']([^"']+)["']/i)
        ?? String(attrs).match(/\bchar\s*=\s*["']([^"']+)["']/i)
      const ch = symbolCharHexToText(m?.[1] ?? '')
      if (!ch) return ' '
      const esc = ch
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
      return `<w:r><w:t xml:space="preserve">${esc}</w:t></w:r>`
    },
  )
}

/**
 * Map U+F020–U+F0FF tofu / Symbol PUA to real Unicode.
 * @param {string} text
 */
export function decodeSymbolFontPua(text) {
  const s = String(text ?? '')
  if (!s) return s
  let out = ''
  for (const ch of s) {
    const cp = ch.codePointAt(0)
    if (cp != null && cp >= 0xf020 && cp <= 0xf0ff) {
      out += symbolByteToChar(cp & 0xff) || ''
    } else {
      out += ch
    }
  }
  return out
}

/**
 * After Symbol decode, turn key math unicode into LaTeX commands where helpful.
 * @param {string} text
 */
export function unicodeMathOpsToLatex(text) {
  let out = String(text ?? '')
  for (const [u, tex] of Object.entries(MATH_UNICODE_TO_TEX)) {
    if (out.includes(u)) out = out.split(u).join(tex)
  }
  return out
}

/** @param {string} text */
export function countSymbolPuaChars(text) {
  let n = 0
  for (const ch of String(text ?? '')) {
    const cp = ch.codePointAt(0)
    if (cp != null && cp >= 0xf020 && cp <= 0xf0ff) n += 1
  }
  return n
}

/**
 * Repair Word Symbol-font damage in already-extracted text.
 * @param {string} text
 */
export function repairWordSymbolFontText(text) {
  if (!text) return text
  let out = decodeSymbolFontPua(text)
  out = unicodeMathOpsToLatex(out)
  return out
}
