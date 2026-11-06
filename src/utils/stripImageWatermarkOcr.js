/**
 * Strip watermark / branding noise from OCR of scanned or downloaded question images/PDFs.
 * Keeps the actual question stem, math, and A–D options.
 *
 * Rules are conservative: never delete normal question prose that merely
 * contains words like "resonance", "allen", or "brilliant".
 */

import { WATERMARK_URL } from './watermark.js'

/** Start-of-line cues only (avoid mid-sentence "the"/"when"/"find"). */
const QUESTION_START_LINE =
  /(?:^|\n)\s*(?:Let|If|Given|Consider|Match\s+the|Read\s+the|Answer\s+the|Calculate|Compute|Determine|Which|Q\.?\s*\d+|Question\s+\d+|\d{1,3}\.\s+[A-Z])/i

/** Whole line is ONLY a watermark / site brand (not a sentence containing a brand word). */
const WATERMARK_LINE =
  /^(?:www\.|https?:\/\/|(?:[a-z0-9-]+\.)+(?:com|in|org|net|co\.in)\b|downloaded\s+from|scanned\s+(?:with|by)|camscanner|instapdf|pdf\s*drive|ilovepdf|smallpdf|telegram|whatsapp|join\s+our|subscribe|free\s+pdf|do\s+not\s+(?:copy|share|redistribute)|not\s+for\s+(?:resale|sale)|personal\s+use\s+only|all\s+rights\s+reserved|copyright|©|®|™|watermark|sample\s+copy|demo\s+copy|preview\s+only|unauthorized|visit\s+us|follow\s+us|confidential|for\s+internal\s+use|draft\s+only|@(?:[a-z0-9_]{3,}))$/i

/** Brand-only lines (whole token / short stamp — not embedded in a real stem). */
const BRAND_ONLY_LINE =
  /^(?:testvantage|physics\s*wallah|unacademy|byju'?s|vedantu|career\s*360|doubtnut|gradeup|toppr|askIITians|fiitjee|aakash|allen|brilliant|jee\s*mains?|jee\s*adv(?:anced)?|nta\s*official|pw\s*live|motion\s*education|esaral|mathongo|youtube|t\.me)$/i

/** Inline URL / download slogans (strip fragments, keep the rest of the line). */
const WATERMARK_INLINE =
  /\b(?:www\.[a-z0-9.-]+\.(?:com|in|org|net)|https?:\/\/[^\s]+|downloaded\s+from\s+[^\n.]{3,40}|scanned\s+with\s+camscanner)\b/gi

const COMMON_ENGLISH =
  /^(?:the|and|then|that|with|from|this|when|which|find|into|onto|over|under|after|before|about|above|below|between|through|during|without|within|there|their|these|those|where|while|since|until|because|although|however|therefore|option|correct|following|statement|value|equal|equals|given|let)$/i

/**
 * True only when the whole string is a watermark stamp, not a question sentence.
 * @param {string} str
 */
export function looksLikeWatermarkPhrase(str) {
  const t = String(str ?? '').trim()
  if (!t) return false
  if (WATERMARK_LINE.test(t)) return true
  if (BRAND_ONLY_LINE.test(t)) return true
  // Short stamp like "Unacademy FREE PDF" / "Join Telegram" with almost no question words
  if (
    t.length <= 48 &&
    /(?:unacademy|physics\s*wallah|byju|vedantu|telegram|camscanner|free\s*pdf|download)/i.test(t) &&
    !/[=+$]|\\frac|\\begin|\(\s*[A-D]\s*\)|\b(?:let|if|find|given|consider|which|value|equal)\b/i.test(t)
  ) {
    return true
  }
  return false
}

/**
 * pdf.js text items: drop clear diagonal stamps + branding only.
 * @param {import('pdfjs-dist').TextItem | { str?: string, transform?: number[] }} item
 */
export function isPdfTextItemWatermark(item) {
  const str = String(item?.str ?? '').trim()
  if (!str) return false
  if (looksLikeWatermarkPhrase(str)) return true

  const t = item?.transform ?? [1, 0, 0, 1, 0, 0]
  const angle = Math.abs(Math.atan2(Number(t[1]) || 0, Number(t[0]) || 1))
  const deg = (angle * 180) / Math.PI
  // Strong diagonal stamps only (~25°–155°), and only if they look like branding/spam
  if (deg > 25 && deg < 155) {
    if (/[=\\$]|\\frac|\\begin|\\vec|\\hat|\(\s*[A-D]\s*\)/.test(str)) return false
    if (str.length > 80) return false
    if (looksLikeWatermarkPhrase(str)) return true
    if (/^(?:www\.|https?:|free\s*pdf|download|telegram|whatsapp)/i.test(str)) return true
    // Short ALL-CAPS / brandy diagonal slogans
    if (str.length <= 40 && /^[A-Z0-9 ._-]{4,}$/.test(str) && !/\d\s*[+\-=]/.test(str)) return true
  }
  return false
}

/**
 * @param {import('pdfjs-dist').TextItem[]} items
 */
export function filterPdfTextItemsDropWatermarks(items) {
  const list = [...(items ?? [])]
  if (!list.length) return list

  const counts = new Map()
  for (const item of list) {
    if (!('str' in item)) continue
    const key = String(item.str ?? '').trim().toLowerCase()
    if (key.length >= 4 && key.length <= 48 && !COMMON_ENGLISH.test(key)) {
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  const repeatedSpam = new Set(
    [...counts.entries()]
      .filter(([, n]) => n >= 5)
      .map(([k]) => k)
      .filter((k) => looksLikeWatermarkPhrase(k) || /www\.|telegram|download|free\s*pdf/i.test(k)),
  )

  return list.filter((item) => {
    if (!('str' in item)) return true
    if (isPdfTextItemWatermark(item)) return false
    const key = String(item.str ?? '').trim().toLowerCase()
    if (repeatedSpam.has(key)) return false
    return true
  })
}

/**
 * Leading OCR debris before the first real question cue.
 * @param {string} text
 */
export function stripLeadingOcrWatermarkNoise(text) {
  const s = String(text ?? '')

  /** @param {string} prefix */
  const prefixIsNoise = (prefix) => {
    const p = prefix.trim()
    if (p.length < 6) return false
    if (/\(\s*[A-D]\s*\)/.test(p)) return false
    if (/\(\s*[PQRS]\s*\)|\\item\s*\[\s*\(?[PQRS]\s*\)?\s*\]/i.test(p)) return false
    if (/(?:List|Column)\s*[-]?\s*I\b|Match\s+(?:the|each)|choose the correct option/i.test(p)) {
      return false
    }
    if (/\\begin\{vmatrix\}|\\frac|\\sqrt|\$[^$]{4,}\$/.test(p)) return false
    if (
      /\b(?:let|if|given|consider|find|which|value|equal|match|list|choose|option|question)\b/i.test(
        p,
      )
    ) {
      return false
    }
    if (/^\s*Q\s*\.?\s*\d{1,3}\b/i.test(p) || /\bQ\s*\.?\s*\d{1,3}\b/i.test(p)) return false
    const words = p.split(/\s+/).filter(Boolean)
    const shortTokens = words.filter((w) => w.length <= 5 && !/^\d+$/.test(w)).length
    return (
      shortTokens / Math.max(words.length, 1) >= 0.55 ||
      /^[a-z_\s°'.-]{8,}$/i.test(p) ||
      (p.length <= 40 && !/[=?]/.test(p) && words.every((w) => w.length <= 5))
    )
  }

  // Start-of-line cue after a noisy header block
  const lineMatch = s.match(QUESTION_START_LINE)
  if (lineMatch && lineMatch.index != null && lineMatch.index >= 6) {
    const prefix = s.slice(0, lineMatch.index)
    if (prefixIsNoise(prefix)) {
      return s.slice(lineMatch.index).replace(/^\n+/, '').trimStart()
    }
  }

  // Same-line garble before Let/If/Given/Consider: "eo elu eld _g Let a, B"
  // Never treat Match List-I "(P) If …" as the start of a new stem.
  const sameLine = s.match(
    /^([\s\S]{6,100}?)((?<!\(\s*[PQRS]\s*\)\s*)\b(?:Let|If|Given|Consider)\b)/i,
  )
  if (sameLine && prefixIsNoise(sameLine[1])) {
    return s.slice(sameLine[1].length).trimStart()
  }

  return s
}

/** Remove lines repeated 4+ times that look like stamps (not common English). */
function dropRepeatedWatermarkLines(text) {
  const lines = text.split('\n')
  const counts = new Map()
  for (const line of lines) {
    const key = line.trim().toLowerCase()
    if (key.length >= 4 && key.length <= 48 && !COMMON_ENGLISH.test(key)) {
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  const repeated = new Set(
    [...counts.entries()]
      .filter(([, n]) => n >= 4)
      .map(([k]) => k)
      .filter((k) => looksLikeWatermarkPhrase(k) || /www\.|telegram|download|camscanner|free\s*pdf/i.test(k)),
  )
  if (!repeated.size) return text
  return lines.filter((line) => !repeated.has(line.trim().toLowerCase())).join('\n')
}

/**
 * @param {string} text
 */
export function stripImageWatermarkOcr(text) {
  if (!text?.trim()) return text ?? ''

  const trimmed = String(text).trim()
  // Single-line MCQ answers (0, 1, $e$, fractions) — not watermark noise.
  if (
    !trimmed.includes('\n') &&
    trimmed.length <= 24 &&
    (/^-?\d+$/.test(trimmed) || /^\$[^$\n]+\$$/.test(trimmed))
  ) {
    return trimmed
  }

  let out = String(text).replace(/\r\n/g, '\n')

  // TestVantages / export headers / footers
  out = out.replace(/^#?\s*TestVantages?\b.*$/gim, '')
  out = out.replace(/^.*Licensed for personal study only.*$/gim, '')
  out = out.replace(/^.*Not for resale or redistribution.*$/gim, '')
  out = out.replace(new RegExp(WATERMARK_URL.replace(/\./g, '\\.'), 'gi'), '')

  out = out.replace(WATERMARK_INLINE, ' ')
  out = dropRepeatedWatermarkLines(out)

  out = out
    .split('\n')
    .filter((line) => {
      const t = line.trim()
      if (!t) return true
      // `$$`, `\[`, `\]` and `}` on their own line open/close display math.
      if (t.length <= 2 && !/[$\\{}&]/.test(t)) return false
      if (looksLikeWatermarkPhrase(t)) return false
      if (/^═+$/.test(t)) return false
      if (/^#{3,}\s*\d*\s*$/.test(t)) return false
      return true
    })
    .join('\n')

  out = stripLeadingOcrWatermarkNoise(out)
  out = out.replace(/\n{3,}/g, '\n\n').trim()
  return out
}

/** Alias — same stripper used after PDF text-layer / OCR merge. */
export const stripPdfExtractWatermarks = stripImageWatermarkOcr

/**
 * True when PDF text layer is too weak to trust without raster OCR.
 * @param {string} text
 */
export function pdfTextLayerLooksIncomplete(text) {
  const t = String(text ?? '').trim()
  if (t.length < 80) return true
  const hasStemCue =
    /\b(?:Let|If|Given|Consider|Find|Which|Match|Calculate|Determine|Q\.?\s*\d+|Question\s+\d+)\b/i.test(
      t,
    ) || /^\s*\d{1,3}\.\s+[A-Za-z]/.test(t)
  const hasOptions = (t.match(/\(\s*[A-D]\s*\)/gi) ?? []).length >= 2
  const hasMath = /[=\\$]|\\frac|\\sqrt|\\vec|\\hat|\^|_/.test(t)
  if (!hasStemCue && hasOptions) return true
  if (!hasStemCue && !hasMath && t.length < 200) return true
  if (hasOptions && !hasStemCue && t.split(/\n/).filter((l) => l.trim()).length <= 5) return true
  return false
}

/**
 * Prefer richer of text-layer vs OCR (options + stem cues beat raw length).
 * @param {string} textLayer
 * @param {string} ocrText
 */
export function pickBetterPdfText(textLayer, ocrText) {
  const a = String(textLayer ?? '').trim()
  const b = String(ocrText ?? '').trim()
  if (!a) return b
  if (!b) return a
  const score = (t) => {
    let s = Math.min(t.length, 800) / 20
    s += (t.match(/\(\s*[A-D]\s*\)/gi) ?? []).length * 25
    if (/\b(?:Let|If|Given|Consider|Find|Which|Match)\b/i.test(t)) s += 40
    if (/\\frac|\\sqrt|\\vec|\\hat|\$/.test(t)) s += 30
    if (pdfTextLayerLooksIncomplete(t)) s -= 50
    return s
  }
  const sa = score(a)
  const sb = score(b)
  if (sb > sa + 8) return b
  if (sa > sb + 8) return a
  return a.length >= b.length ? a : b
}
