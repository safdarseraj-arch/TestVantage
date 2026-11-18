/**
 * When Compare crops are loose (stem text / hatch inside the box) but the scan still has
 * clean SMILES for that option, prefer the SMILES. Also rebuild ranking chains that lost
 * a leading (C)/(A) after slot-label strip.
 */

import { isOriginalCropUrl } from './mathpixMedia.js'
import { originalCropLooksClubbedOrWatermarkSlab } from './officialPyqCardTidy.js'

const SMILES_OPT_RE =
  /(?:^|\n)\s*(?:\\item\s*\[\s*)?\(?\s*([1-4A-E])\s*\)?\s*\]?\s*\n?\s*<smiles>\s*([\s\S]*?)\s*<\/smiles>/gi
const CDN_OPT_RE =
  /(?:^|\n)\s*(?:\\item\s*\[\s*)?\(?\s*([1-4A-E])\s*\)?\s*\]?\s*\n?\s*(?:!\[([^\]]*)\]\((https?:\/\/cdn\.mathpix\.com\/[^)\s]+)\)|\\includegraphics(?:\[[^\]]*\])?\{(https?:\/\/cdn\.mathpix\.com\/[^}\s]+)\})/gi
const RANK_OPT_RE =
  /(?:^|\n)\s*(?:\\item\s*\[\s*)?\(?\s*([1-4])\s*\)?\s*\]?\s*((?:\(\s*[A-E]\s*\)\s*[<>]\s*)+\(\s*[A-E]\s*\))/gi

/** @param {unknown} url */
function looksLikeBadOptionCrop(url) {
  const u = String(url ?? '')
  if (!isOriginalCropUrl(u)) return false
  if (originalCropLooksClubbedOrWatermarkSlab(u)) return true
  const h = Number((u.match(/[?&]y0=([\d.]+)/i) || [])[1])
  const h1 = Number((u.match(/[?&]y1=([\d.]+)/i) || [])[1])
  if (Number.isFinite(h) && Number.isFinite(h1) && Math.abs(h1 - h) >= 0.12) return true
  return false
}

/** @param {unknown} opt */
function optionCropUrl(opt) {
  const m = String(opt ?? '').match(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}|!\[[^\]]*\]\(([^)]+)\)/)
  return m ? m[1] || m[2] : ''
}

/** @param {unknown} stem @param {unknown} source */
function ocrWindowForCard(stem, source) {
  const src = String(source ?? '')
  const plain = String(stem ?? '')
    .replace(/\\includegraphics[\s\S]*?(?:\}|$)/gi, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/<smiles>[\s\S]*?<\/smiles>/gi, ' ')
    .replace(/\$[^$]*\$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const probes = [
    plain.slice(0, 48),
    plain.split(/\bis\b/i)[0].trim().slice(0, 40),
    plain.match(/[A-Za-z][A-Za-z0-9\-]{5,}/)?.[0],
  ].filter((p) => String(p || '').length >= 8)
  let at = -1
  for (const probe of probes) {
    const needle = String(probe).slice(0, Math.min(28, probe.length))
    at = src.indexOf(needle)
    if (at < 0) at = src.toLowerCase().indexOf(needle.toLowerCase())
    if (at >= 0) break
  }
  if (at < 0) return ''
  const slice = src.slice(at, at + 2200)
  const cut = slice.search(
    /\n\s*(?:\\item\s*\[\s*(?:\*?Q\.?|\*?)\s*\]?\s*\*?|(?:\*|Q\s*\.?)\s*)\d{1,3}\b|Ans\.\s*\(/i,
  )
  return cut > 40 ? slice.slice(0, cut) : slice
}

/**
 * @param {string} source
 * @returns {Map<string, string>}
 */
function smilesByMarker(source) {
  /** @type {Map<string, string>} */
  const map = new Map()
  for (const m of String(source ?? '').matchAll(SMILES_OPT_RE)) {
    const key = String(m[1] || '').toUpperCase()
    const smiles = String(m[2] ?? '').replace(/\s+/g, '').trim()
    if (key && smiles.length >= 4) map.set(key, `<smiles>${smiles}</smiles>`)
  }
  return map
}

/**
 * @param {string} source
 * @returns {Map<string, string>}
 */
function cdnFiguresByMarker(source) {
  /** @type {Map<string, string>} */
  const map = new Map()
  for (const m of String(source ?? '').matchAll(CDN_OPT_RE)) {
    const key = String(m[1] || '').toUpperCase()
    const url = String(m[3] || m[4] || '').trim()
    if (key && /cdn\.mathpix\.com/i.test(url)) map.set(key, `\\includegraphics{${url}}`)
  }
  return map
}

/**
 * Replace clubbed / tall original option crops with SMILES (or Mathpix CDN crops) from OCR.
 * When every option is an original crop and OCR still has four numbered SMILES (Q63/Q71/Q79)
 * or four numbered CDN figures (Q39 circuits), prefer those — loose Gemini boxes often glue
 * stem text / hatch into the crop.
 * @template {Record<string, any>} T
 * @param {T} q
 * @param {unknown} source
 * @returns {T}
 */
export function preferOcrSmilesOverBadOptionCrops(q, source) {
  if (!q || typeof q !== 'object') return q
  const opts = Array.isArray(q.options) ? q.options.map((o) => String(o ?? '')) : []
  if (opts.length < 2) return q
  const window = ocrWindowForCard(q.text, source)
  if (!window) return q
  const smiles = smilesByMarker(window)
  const cdn = smiles.size ? new Map() : cdnFiguresByMarker(window)
  const bodies = smiles.size ? smiles : cdn
  if (!bodies.size) return q
  const allOriginalCrops = opts.every((opt) => isOriginalCropUrl(optionCropUrl(opt)))
  const fourNumbered =
    allOriginalCrops &&
    opts.length >= 4 &&
    [1, 2, 3, 4].every((n) => bodies.has(String(n)))
  let changed = false
  const next = opts.map((opt, i) => {
    const url = optionCropUrl(opt)
    const fromNum = bodies.get(String(i + 1))
    const fromLetter = bodies.get(String.fromCharCode(65 + i))
    const body = fromNum || fromLetter
    if (!body) return opt
    if (fourNumbered || looksLikeBadOptionCrop(url)) {
      changed = true
      return body
    }
    return opt
  })
  return changed ? { ...q, options: next } : q
}

/**
 * Stem figures that are tall original crops while OCR still has SMILES for (A)–(E) / (1)–(4).
 * @template {Record<string, any>} T
 * @param {T} q
 * @param {unknown} source
 * @returns {T}
 */
export function preferOcrSmilesOverBadStemCrops(q, source) {
  if (!q || typeof q !== 'object') return q
  const text = String(q.text ?? '')
  if (!/\\includegraphics|!\[[^\]]*\]\(/.test(text)) return q
  const window = ocrWindowForCard(text, source)
  if (!window) return q
  const smiles = smilesByMarker(window)
  const bareSmiles = [...window.matchAll(/<smiles>\s*([\s\S]*?)\s*<\/smiles>/gi)]
    .map((m) => String(m[1] ?? '').replace(/\s+/g, '').trim())
    .filter((s) => s.length >= 4)
  if (!smiles.size && !bareSmiles.length) return q
  let next = text
  // Labelled rows: (B)\nincludegraphics{…crop…} → SMILES when the crop is a slab.
  if (smiles.size) {
    next = next.replace(
      /(?:^|\n)([ \t]*\(\s*([A-E1-4])\s*\)[ \t]*\n+)(\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}|!\[[^\]]*\]\(([^)]+)\))/g,
      (full, lead, marker, _fig, urlA, urlB) => {
        const url = urlA || urlB || ''
        const body = smiles.get(String(marker).toUpperCase())
        if (!body) return full
        if (looksLikeBadOptionCrop(url) || /<smiles>/i.test(window)) {
          return `${lead}${body}`
        }
        return full
      },
    )
  }
  // Bare stem figure with no label (Q78 Cyclohexene crop) — OCR often has `<smiles>` right after the name.
  const figCount = (text.match(/\\includegraphics|!\[[^\]]*\]\(/g) || []).length
  if (next === text && figCount === 1 && (smiles.size === 1 || bareSmiles.length >= 1)) {
    const only = smiles.size === 1 ? [...smiles.values()][0] : `<smiles>${bareSmiles[0]}</smiles>`
    next = next.replace(
      /\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}|!\[[^\]]*\]\(([^)]+)\)/g,
      (full, a, b) => (looksLikeBadOptionCrop(a || b) || isOriginalCropUrl(a || b) ? only : full),
    )
  }
  return next !== text ? { ...q, text: next } : q
}

/**
 * Rebuild "(C) < (A) < …" ranking options when a prior strip left "< (A) < …".
 * @template {Record<string, any>} T
 * @param {T} q
 * @param {unknown} source
 * @returns {T}
 */
export function restoreRankingOptionsFromSource(q, source) {
  if (!q || typeof q !== 'object') return q
  const opts = Array.isArray(q.options) ? q.options.map((o) => String(o ?? '').trim()) : []
  if (opts.length < 2) return q
  const damaged = opts.some((o) => /^</.test(o) || (/</.test(o) && !/^\(\s*[A-E]\s*\)/.test(o)))
  if (!damaged && !opts.every((o) => /\(\s*[A-E]\s*\)\s*</.test(o))) return q
  const src = String(source ?? '')
  if (src.length < 40) return q
  const head = String(q.text ?? '')
    .replace(/\$[^$]*\$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48)
  let at = head.length >= 20 ? src.indexOf(head.slice(0, 32)) : -1
  if (at < 0) at = src.search(/ascending order of acidity|Choose the correct answer from the options given below/i)
  if (at < 0) return q
  const window = src.slice(at, at + 1800)
  /** @type {Record<string, string>} */
  const byNum = { 1: '', 2: '', 3: '', 4: '' }
  for (const m of window.matchAll(RANK_OPT_RE)) {
    byNum[m[1]] = String(m[2] ?? '').replace(/\s+/g, ' ').trim()
  }
  const fromOcr = [byNum[1], byNum[2], byNum[3], byNum[4]]
  if (fromOcr.filter(Boolean).length < 2) return q
  return {
    ...q,
    options: fromOcr.map((o, i) => o || opts[i] || ''),
  }
}
