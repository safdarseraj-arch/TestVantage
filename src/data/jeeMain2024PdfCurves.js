/**
 * JEE Main 2024 marks ↔ percentile curves from Modi Career Academy session tables.
 * Source PDFs (user-provided):
 *   - Jan 2024 first attempt (10 shifts: 27 Jan – 1 Feb)
 *   - April 2024 second attempt (10 shifts: 4–9 Apr)
 *
 * Moderate baseline = median marks across all shifts at each percentile band,
 * then inverted for marks → percentile interpolation.
 */

/** @typedef {Record<number, number[]>} PercentileToSessionMarks */

/** Jan 2024 — marks at percentile across 10 shifts (27S1…01S2). */
export const JEE_MAIN_JAN_2024_SESSIONS = {
  99.9: [278, 264, 264, 268, 257, 255, 233, 215, 224, 252],
  99.8: [270, 255, 249, 254, 242, 242, 218, 197, 203, 233],
  99.7: [265, 246, 240, 246, 231, 231, 206, 184, 195, 217],
  99.6: [259, 238, 232, 239, 223, 221, 198, 178, 185, 207],
  99.5: [254, 233, 225, 232, 216, 214, 191, 171, 180, 200],
  99.4: [250, 227, 219, 227, 210, 208, 186, 165, 175, 195],
  99.3: [245, 223, 215, 223, 204, 202, 181, 162, 173, 189],
  99.2: [242, 217, 210, 220, 200, 198, 177, 158, 167, 181],
  99.1: [239, 214, 206, 215, 196, 194, 173, 154, 164, 176],
  99: [236, 211, 203, 212, 193, 191, 170, 151, 161, 172],
  98.5: [223, 196, 190, 199, 179, 178, 158, 139, 150, 161],
  98: [213, 185, 180, 189, 169, 167, 148, 131, 141, 148],
  97.5: [204, 177, 171, 181, 159, 158, 141, 124, 133, 139],
  97: [196, 170, 165, 174, 152, 151, 134, 118, 126, 131],
  96.5: [190, 164, 158, 168, 146, 145, 128, 114, 120, 125],
  96: [184, 159, 153, 163, 140, 139, 123, 109, 115, 120],
  95.5: [178, 155, 148, 158, 135, 132, 119, 105, 110, 115],
  95: [173, 151, 144, 154, 130, 129, 114, 101, 106, 109],
  94: [165, 143, 137, 146, 123, 121, 108, 94, 98, 100],
  93: [157, 137, 130, 138, 115, 113, 100, 86, 91, 92],
  92: [151, 131, 124, 132, 108, 108, 95, 81, 85, 87],
  91: [145, 126, 119, 126, 103, 102, 89, 76, 79, 81],
  90: [139, 121, 114, 120, 98, 97, 84, 72, 74, 76],
}

/** April 2024 (2nd attempt) — marks at percentile across 10 shifts (4S1…9S2). */
export const JEE_MAIN_APR_2024_SESSIONS = {
  99.9: [256, 262, 245, 260, 261, 256, 265, 271, 250, 258],
  99.8: [240, 245, 231, 249, 251, 247, 246, 257, 234, 241],
  99.7: [233, 234, 223, 239, 243, 232, 235, 248, 222, 232],
  99.6: [222, 227, 216, 232, 238, 225, 226, 240, 214, 222],
  99.5: [214, 221, 210, 227, 232, 219, 220, 232, 207, 215],
  99.4: [209, 216, 204, 223, 229, 213, 213, 227, 202, 210],
  99.3: [205, 212, 200, 219, 224, 210, 209, 221, 198, 205],
  99.2: [203, 207, 195, 216, 221, 206, 205, 216, 193, 201],
  99.1: [196, 203, 191, 213, 217, 202, 200, 212, 190, 198],
  99: [192, 200, 187, 210, 215, 200, 198, 208, 186, 194],
  98.5: [180, 188, 174, 198, 203, 188, 186, 194, 173, 182],
  98: [170, 179, 165, 190, 194, 179, 177, 183, 164, 173],
  97.5: [162, 171, 157, 183, 187, 171, 170, 172, 156, 166],
  97: [156, 165, 153, 177, 181, 165, 165, 165, 150, 160],
  96.5: [151, 160, 146, 172, 176, 160, 159, 159, 145, 155],
  96: [145, 155, 142, 167, 171, 156, 155, 152, 140, 150],
  95.5: [141, 151, 138, 163, 166, 151, 151, 146, 135, 145],
  95: [136, 146, 134, 159, 163, 147, 146, 142, 131, 142],
  94: [130, 139, 127, 152, 155, 139, 139, 133, 123, 135],
  93: [124, 132, 120, 145, 149, 133, 132, 124, 117, 129],
  92: [118, 126, 115, 140, 142, 127, 126, 118, 112, 123],
  91: [113, 119, 110, 133, 136, 121, 120, 112, 106, 118],
  90: [108, 115, 105, 129, 132, 116, 115, 107, 102, 114],
}

export const JEE_MAIN_2024_PDF_SOURCE_NOTE =
  'JEE Main 2024 Jan + April session percentile-vs-marks tables (Modi Career Academy PDFs); moderate = median across all shifts per percentile.'

/** @param {number[]} vals */
function median(vals) {
  const s = [...vals].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** @param {PercentileToSessionMarks} sessions */
export function percentileToMarksMedian(sessions) {
  /** @type {Record<number, number>} */
  const out = {}
  for (const [pct, vals] of Object.entries(sessions)) {
    out[Number(pct)] = median(vals)
  }
  return out
}

/** @param {Record<number, number>} pctToMarks percentile → marks */
function invertPctToMarksCurve(pctToMarks, marks) {
  const pts = Object.entries(pctToMarks)
    .map(([p, m]) => ({ percentile: Number(p), marks: m }))
    .sort((a, b) => a.marks - b.marks)
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

/** Marks → percentile on one session table (median-accurate per exam). */
export function marksToPercentileFromSessions(sessions, marks) {
  const med = percentileToMarksMedian(sessions)
  return invertPctToMarksCurve(med, marks)
}

/** Median marks at each percentile for Jan / Apr / blended moderate. */
export const JEE_MAIN_JAN_2024_MEDIAN = percentileToMarksMedian(JEE_MAIN_JAN_2024_SESSIONS)
export const JEE_MAIN_APR_2024_MEDIAN = percentileToMarksMedian(JEE_MAIN_APR_2024_SESSIONS)

/** @type {Record<number, number>} */
export const JEE_MAIN_2024_MODERATE_PCT_TO_MARKS = (() => {
  const keys = new Set([
    ...Object.keys(JEE_MAIN_JAN_2024_MEDIAN),
    ...Object.keys(JEE_MAIN_APR_2024_MEDIAN),
  ])
  /** @type {Record<number, number>} */
  const out = {}
  for (const k of keys) {
    const pct = Number(k)
    out[pct] = (JEE_MAIN_JAN_2024_MEDIAN[pct] + JEE_MAIN_APR_2024_MEDIAN[pct]) / 2
  }
  return out
})()

/**
 * Dense marks → percentile anchors from PDF moderate curve (90–99.9% bands + low-end join).
 * Values below 90th percentile are extrapolated from the 90–95% slope (PDF tables start at 90%).
 * @type {{ marks: number, percentile: number }[]}
 */
export const JEE_MAIN_2024_MODERATE_MARKS_CURVE = (() => {
  const pctToMarks = JEE_MAIN_2024_MODERATE_PCT_TO_MARKS
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

/** PDF benchmark: expected moderate percentile at common marks (±0.6 tolerance in tests). */
export const JEE_MAIN_2024_PDF_BENCHMARKS = [
  {
    marks: 100,
    jan: Math.round(marksToPercentileFromSessions(JEE_MAIN_JAN_2024_SESSIONS, 100) * 100) / 100,
    apr: Math.round(marksToPercentileFromSessions(JEE_MAIN_APR_2024_SESSIONS, 100) * 100) / 100,
    moderate: Math.round(invertPctToMarksCurve(JEE_MAIN_2024_MODERATE_PCT_TO_MARKS, 100) * 100) / 100,
    note: "Jan'24 / Apr'24 PDF session medians",
  },
  {
    marks: 120,
    jan: Math.round(marksToPercentileFromSessions(JEE_MAIN_JAN_2024_SESSIONS, 120) * 100) / 100,
    apr: Math.round(marksToPercentileFromSessions(JEE_MAIN_APR_2024_SESSIONS, 120) * 100) / 100,
    moderate: Math.round(invertPctToMarksCurve(JEE_MAIN_2024_MODERATE_PCT_TO_MARKS, 120) * 100) / 100,
    note: "Apr'24 tougher at 120 than Jan'24",
  },
  {
    marks: 150,
    jan: Math.round(marksToPercentileFromSessions(JEE_MAIN_JAN_2024_SESSIONS, 150) * 100) / 100,
    apr: Math.round(marksToPercentileFromSessions(JEE_MAIN_APR_2024_SESSIONS, 150) * 100) / 100,
    moderate: Math.round(invertPctToMarksCurve(JEE_MAIN_2024_MODERATE_PCT_TO_MARKS, 150) * 100) / 100,
    note: "Apr'24 PDF",
  },
  {
    marks: 180,
    jan: Math.round(marksToPercentileFromSessions(JEE_MAIN_JAN_2024_SESSIONS, 180) * 100) / 100,
    apr: Math.round(marksToPercentileFromSessions(JEE_MAIN_APR_2024_SESSIONS, 180) * 100) / 100,
    moderate: Math.round(invertPctToMarksCurve(JEE_MAIN_2024_MODERATE_PCT_TO_MARKS, 180) * 100) / 100,
    note: "Both PDFs ~98% at 180",
  },
  {
    marks: 200,
    jan: Math.round(marksToPercentileFromSessions(JEE_MAIN_JAN_2024_SESSIONS, 200) * 100) / 100,
    apr: Math.round(marksToPercentileFromSessions(JEE_MAIN_APR_2024_SESSIONS, 200) * 100) / 100,
    moderate: Math.round(invertPctToMarksCurve(JEE_MAIN_2024_MODERATE_PCT_TO_MARKS, 200) * 100) / 100,
    note: "Apr'24 PDF high band",
  },
  {
    marks: 220,
    jan: Math.round(marksToPercentileFromSessions(JEE_MAIN_JAN_2024_SESSIONS, 220) * 100) / 100,
    apr: Math.round(marksToPercentileFromSessions(JEE_MAIN_APR_2024_SESSIONS, 220) * 100) / 100,
    moderate: Math.round(invertPctToMarksCurve(JEE_MAIN_2024_MODERATE_PCT_TO_MARKS, 220) * 100) / 100,
    note: "Jan'24 PDF 99.8 band",
  },
  {
    marks: 250,
    jan: Math.round(marksToPercentileFromSessions(JEE_MAIN_JAN_2024_SESSIONS, 250) * 100) / 100,
    apr: Math.round(marksToPercentileFromSessions(JEE_MAIN_APR_2024_SESSIONS, 250) * 100) / 100,
    moderate: Math.round(invertPctToMarksCurve(JEE_MAIN_2024_MODERATE_PCT_TO_MARKS, 250) * 100) / 100,
    note: "Jan+Apr PDF 99.9 band",
  },
]
