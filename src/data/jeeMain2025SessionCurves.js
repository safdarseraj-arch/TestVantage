/**
 * JEE Main 2025 marks vs percentile from published shift-wise session tables
 * compiled from NTA result scorecards (Vedantu Jan + April 2025 shift reports).
 * Moderate baseline = median marks across shifts at each percentile, then
 * Jan/Apr medians averaged when both sessions published that band.
 *
 * 99.5 / 99.9 are not in the 90-99 shift tables. Those bands scale the 2024
 * PDF high tail so 2025's published 99th percentile is the anchor.
 */

import { JEE_MAIN_2024_MODERATE_PCT_TO_MARKS } from './jeeMain2024PdfCurves.js'
import { NTA_PERCENTILE_MARKS_FILL } from './generated/ntaPercentileMarksFill.js'

/**
 * NTA-compiled 2025 bands above 99 (99.5 → 202, 99.9 → 240). The shift tables
 * stop at 99, so without these the tail falls back to the scaled 2024 shape,
 * which credits 99.9 at 233 marks and inflates every rank above ~230.
 * @type {Record<number, number>}
 */
export const JEE_MAIN_2025_NTA_HIGH_TAIL = (() => {
  const points = NTA_PERCENTILE_MARKS_FILL?.exams?.['jee-main']?.['2025']?.points ?? []
  /** @type {Record<number, number>} */
  const out = {}
  for (const p of points) {
    const pct = Number(p?.percentile)
    const marks = Number(p?.marks)
    if (pct > 99 && pct < 100 && Number.isFinite(marks)) out[pct] = marks
  }
  return out
})()

/** Jan 2025 Session 1 -- 10 shifts (22S1...29S2). */
export const JEE_MAIN_JAN_2025_SESSIONS = {
  99: [158, 186, 178, 188, 183, 200, 148, 170, 174, 176],
  98.5: [143, 173, 167, 175, 168, 186, 136, 158, 162, 165],
  98: [133, 163, 154, 165, 158, 177, 126, 149, 153, 154],
  97.5: [128, 155, 145, 158, 150, 166, 120, 142, 145, 149],
  97: [120, 149, 140, 152, 144, 162, 114, 136, 140, 144],
  96.5: [115, 143, 134, 147, 137, 156, 110, 131, 135, 140],
  96: [110, 138, 129, 140, 131, 151, 105, 127, 130, 136],
  95.5: [105, 134, 124, 136, 126, 148, 100, 121, 126, 129],
  95: [101, 129, 120, 132, 121, 142, 96, 118, 123, 127],
  94: [94, 122, 112, 124, 111, 133, 90, 111, 116, 120],
  93: [88, 115, 106, 120, 104, 127, 85, 105, 110, 115],
  92: [85, 108, 101, 111, 97, 121, 85, 104, 109, 113],
  91: [78, 102, 95, 104, 91, 115, 76, 99, 95, 109],
  90: [74, 98, 89, 101, 85, 112, 70, 90, 94, 101],
}

/** April 2025 Session 2 -- 9 shifts (2S1...8S2). 90/91 not in this table. */
export const JEE_MAIN_APR_2025_SESSIONS = {
  99: [173, 203, 174, 201, 175, 177, 177, 183, 185],
  98.5: [159, 190, 162, 186, 166, 163, 169, 173, 172],
  98: [150, 182, 152, 174, 155, 156, 161, 165, 162],
  97.5: [142, 174, 145, 168, 146, 151, 154, 158, 159],
  97: [137, 169, 141, 163, 145, 141, 147, 151, 150],
  96.5: [130, 162, 135, 158, 138, 138, 142, 145, 147],
  96: [126, 157, 133, 151, 135, 134, 139, 142, 140],
  95.5: [123, 152, 128, 144, 130, 129, 133, 138, 135],
  95: [117, 147, 127, 142, 126, 125, 128, 134, 133],
  94: [111, 140, 120, 134, 120, 118, 122, 125, 125],
  93.1: [107, 135, 116, 127, 115, 113, 118, 122, 119],
  93: [105, 132, 115, 127, 114, 112, 116, 122, 118],
  92: [100, 125, 111, 121, 109, 107, 111, 117, 113],
}

export const JEE_MAIN_2025_SESSION_SOURCE_NOTE =
  'JEE Main 2025 Jan (10 shifts) + April (9 shifts) percentile-vs-marks tables compiled from NTA result scorecards (Vedantu shift reports); moderate = Jan/Apr session medians. 99.5-99.9 interpolated from the 2024 PDF high-tail shape, anchored at 2025 published 99th percentile.'

/** @param {number[]} vals */
function median(vals) {
  const s = [...vals].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** @param {Record<number, number[]>} sessions */
export function percentileToMarksMedian(sessions) {
  /** @type {Record<number, number>} */
  const out = {}
  for (const [pct, vals] of Object.entries(sessions)) {
    out[Number(pct)] = median(vals)
  }
  return out
}

export const JEE_MAIN_JAN_2025_MEDIAN = percentileToMarksMedian(JEE_MAIN_JAN_2025_SESSIONS)
export const JEE_MAIN_APR_2025_MEDIAN = percentileToMarksMedian(JEE_MAIN_APR_2025_SESSIONS)

/** Published 90-99 bands only (no invented 99.5). */
export const JEE_MAIN_2025_PUBLISHED_PCT_TO_MARKS = (() => {
  const keys = new Set([
    ...Object.keys(JEE_MAIN_JAN_2025_MEDIAN),
    ...Object.keys(JEE_MAIN_APR_2025_MEDIAN),
  ])
  /** @type {Record<number, number>} */
  const out = {}
  for (const k of keys) {
    const pct = Number(k)
    if (pct > 99) continue
    const jan = JEE_MAIN_JAN_2025_MEDIAN[pct]
    const apr = JEE_MAIN_APR_2025_MEDIAN[pct]
    if (Number.isFinite(jan) && Number.isFinite(apr)) out[pct] = (jan + apr) / 2
    else if (Number.isFinite(jan)) out[pct] = jan
    else if (Number.isFinite(apr)) out[pct] = apr
  }
  out[100] = 300
  return out
})()

/**
 * Scale 2024 PDF bands above 99 so the published 2025 99th percentile stays the anchor.
 * @param {Record<number, number>} publishedPctToMarks
 */
export function scaleHighTailFrom2024(publishedPctToMarks) {
  const y99 = publishedPctToMarks[99]
  const b99 = JEE_MAIN_2024_MODERATE_PCT_TO_MARKS[99]
  if (!Number.isFinite(y99) || !Number.isFinite(b99) || b99 <= 0) {
    return { ...publishedPctToMarks }
  }
  const scale = y99 / b99
  /** @type {Record<number, number>} */
  const out = { ...publishedPctToMarks }
  for (const [k, marks] of Object.entries(JEE_MAIN_2024_MODERATE_PCT_TO_MARKS)) {
    const pct = Number(k)
    if (pct <= 99 || pct >= 100) continue
    if (out[pct] == null && Number.isFinite(marks)) {
      out[pct] = Math.round(marks * scale * 10) / 10
    }
  }
  out[100] = 300
  return out
}

export const JEE_MAIN_2025_HIGH_TAIL_PCTS = (() => {
  const full = scaleHighTailFrom2024(JEE_MAIN_2025_PUBLISHED_PCT_TO_MARKS)
  /** @type {Record<number, number>} */
  const tail = {}
  for (const [k, marks] of Object.entries(full)) {
    const pct = Number(k)
    if (pct > 99 && pct < 100) tail[pct] = marks
  }
  return tail
})()

// NTA-compiled bands win above 99; the scaled 2024 shape only fills what is left.
export const JEE_MAIN_2025_MODERATE_PCT_TO_MARKS = scaleHighTailFrom2024({
  ...JEE_MAIN_2025_PUBLISHED_PCT_TO_MARKS,
  ...JEE_MAIN_2025_NTA_HIGH_TAIL,
})

/** @param {Record<number, number>} pctToMarks @param {number} marks */
function invertPctToMarksCurve(pctToMarks, marks) {
  const pts = Object.entries(pctToMarks)
    .map(([p, m]) => ({ percentile: Number(p), marks: m }))
    .sort((a, b) => a.marks - b.marks)
  if (!pts.length) return 0.01
  if (marks >= pts[pts.length - 1].marks) return pts[pts.length - 1].percentile
  if (marks <= pts[0].marks) {
    const a = pts[0]
    const b = pts[1] ?? pts[0]
    const slope = (b.percentile - a.percentile) / Math.max(1, b.marks - a.marks)
    return Math.max(0.01, a.percentile + (marks - a.marks) * slope)
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    if (marks >= a.marks && marks <= b.marks) {
      const t = (marks - a.marks) / Math.max(1e-9, b.marks - a.marks)
      return a.percentile + t * (b.percentile - a.percentile)
    }
  }
  return pts[pts.length - 1].percentile
}

/**
 * Dense marks -> percentile anchors for the rank predictor (same sampling as 2024).
 * @type {{ marks: number, percentile: number }[]}
 */
export const JEE_MAIN_2025_MODERATE_MARKS_CURVE = (() => {
  const pctToMarks = JEE_MAIN_2025_MODERATE_PCT_TO_MARKS
  /** @type {{ marks: number, percentile: number }[]} */
  const samples = []
  for (let m = 40; m <= 300; m += 5) {
    const pct = invertPctToMarksCurve(pctToMarks, m)
    samples.push({ marks: m, percentile: Math.round(pct * 100) / 100 })
  }
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].percentile < samples[i - 1].percentile) {
      samples[i].percentile = samples[i - 1].percentile
    }
  }
  const top = samples[samples.length - 1]
  top.percentile = 100
  if (samples.length > 2) {
    const prev = samples[samples.length - 2]
    if (top.marks - prev.marks < 50) {
      prev.percentile = Math.min(prev.percentile, 99.97)
    }
  }
  const keep = new Set([
    40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 210, 220,
    230, 240, 250, 260, 270, 280, 300,
  ])
  const out = samples.filter((p) => keep.has(p.marks))
  const m280 = out.find((p) => p.marks === 280)
  if (m280 && m280.percentile < 99.95) m280.percentile = 99.95
  return out
})()
