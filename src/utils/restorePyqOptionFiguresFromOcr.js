/**
 * When Compare crops are loose (stem text / hatch inside the box) but the scan still has
 * clean SMILES for that option, prefer the SMILES. Also rebuild ranking chains that lost
 * a leading (C)/(A) after slot-label strip.
 */

import { isOriginalCropUrl } from './mathpixMedia.js'
import { originalCropLooksClubbedOrWatermarkSlab } from './officialPyqCardTidy.js'
import { normalizeNumberedStemSmiles } from './smilesDisplay.js'

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
 * Four OCR option bodies are useful only when at least two differ.
 * FIITJEE bond-line MCQs (Q75) often OCR every option as the same SMILES while the
 * page crops are the real distinct drawings — swapping then makes "two options the same".
 * @param {Map<string, string>} bodies
 * @param {number} count
 */
function ocrOptionBodiesAreDistinct(bodies, count = 4) {
  const vals = []
  for (let i = 0; i < count; i += 1) {
    const v = bodies.get(String(i + 1)) || bodies.get(String.fromCharCode(65 + i))
    if (v) vals.push(String(v).replace(/\s+/g, ''))
  }
  // Every option body must differ. Size >= 2 still lets Q63's paired rings
  // (iodo / hydroxy twice each) wipe four good page crops with duplicate SMILES.
  return vals.length >= count && new Set(vals).size === vals.length
}

/**
 * Replace clubbed / tall original option crops with SMILES (or Mathpix CDN crops) from OCR.
 * When every option is an original crop and OCR still has four *distinct* numbered SMILES
 * (Q63/Q71/Q79) or four numbered CDN figures (Q39 circuits), prefer those — loose Gemini
 * boxes often glue stem text / hatch into the crop. Identical OCR SMILES never win over
 * page crops (washed FIITJEE structure options).
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
    [1, 2, 3, 4].every((n) => bodies.has(String(n))) &&
    ocrOptionBodiesAreDistinct(bodies, opts.length)
  const distinctOcr = ocrOptionBodiesAreDistinct(bodies, opts.length)
  let changed = false
  const next = opts.map((opt, i) => {
    const url = optionCropUrl(opt)
    const fromNum = bodies.get(String(i + 1))
    const fromLetter = bodies.get(String.fromCharCode(65 + i))
    const body = fromNum || fromLetter
    if (!body) return opt
    // Identical OCR SMILES/CDN bodies never beat a page crop — even a slightly wide
    // option box — or every FIITJEE structure option collapses to one drawing.
    if (!distinctOcr && isOriginalCropUrl(url)) return opt
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
  if (next === text) return q
  return { ...q, text: normalizeNumberedStemSmiles(next) }
}

/** Ranking choice rows: "(C) < (A) < (D) < (B) < (E)" (JEE Main Q77). */
export function optionLooksLikeRankingChain(option) {
  const s = String(option ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return false
  if (!/^\(\s*[A-E]\s*\)\s*[<>]/i.test(s)) return false
  const letters = [...s.matchAll(/\(\s*[A-E]\s*\)/gi)]
  return letters.length >= 3 && /[<>]/.test(s)
}

/** @param {unknown} options */
export function optionsLookLikeRankingChains(options) {
  const opts = (Array.isArray(options) ? options : []).map((o) => String(o ?? '').trim()).filter(Boolean)
  if (opts.length < 2) return false
  const hits = opts.filter(optionLooksLikeRankingChain).length
  return hits >= 2 && hits >= Math.ceil(opts.length * 0.5)
}

/**
 * Stem lists compounds as "(A) … (B) <smiles>/crop … (E) …" — not MCQ answer choices.
 * Peeling those as an (A)–(D) option band drops the drawings students need (Q77).
 * @param {unknown} text
 */
export function stemHasLabelledCompoundDrawings(text) {
  const t = String(text ?? '')
  if (!t.trim()) return false
  // Structures only (SMILES / figure crops). Do not treat ordinary math MCQ
  // rows like "(A) $\\tan\\theta=…$" as compound drawings — those must peel.
  const hits = [
    ...t.matchAll(
      /(?:^|\n)\s*\(\s*([A-E])\s*\)\s*(?:\n\s*)?(?:<smiles>|\\includegraphics|!\[[^\]]*\]\()/gi,
    ),
  ]
  if (hits.length >= 3) return true
  // Glued after a prior smiles: </smiles>(C)\n<smiles>
  const glued = [
    ...t.matchAll(
      /<\/smiles>\s*\(\s*([A-E])\s*\)\s*(?:\n\s*)?<smiles>/gi,
    ),
  ]
  return glued.length >= 2 && /(?:^|\n)\s*\(\s*A\s*\)/i.test(t)
}

/** Keep lettered stem drawings when options are ranking chains or the stem holds (A)–(E) structures. */
export function keepLabelledStemStructures(text, options) {
  return optionsLookLikeRankingChains(options) || stemHasLabelledCompoundDrawings(text)
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
