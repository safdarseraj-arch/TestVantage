/**
 * Published NTA-compiled marks at percentile for Form Forecast year columns.
 * 2024: in-repo Jan+Apr session PDFs.
 * 2025: Jan+Apr shift tables compiled from NTA scorecards.
 * Other years: Gemini-verified overlay only when a real table is cited.
 * Unknown stays unknown -- never invent a year column.
 */

import { PERCENTILE_GRID_YEARS } from './counsellingConstants.js'
import {
  JEE_MAIN_2024_MODERATE_PCT_TO_MARKS,
  JEE_MAIN_2024_PDF_SOURCE_NOTE,
} from './jeeMain2024PdfCurves.js'
import {
  JEE_MAIN_2025_PUBLISHED_PCT_TO_MARKS,
  JEE_MAIN_2025_HIGH_TAIL_PCTS,
  JEE_MAIN_2025_SESSION_SOURCE_NOTE,
  scaleHighTailFrom2024,
} from './jeeMain2025SessionCurves.js'
import { NTA_PERCENTILE_MARKS_FILL } from './generated/ntaPercentileMarksFill.js'

const JEE_MAIN = 'jee-main'
const JEE_MAIN_MAX = 300

function roundMarks(n) {
  return Math.round(Number(n) * 10) / 10
}

function lerp(a, b, t) {
  return a + t * (b - a)
}

/** @param {Record<number, number>} map @param {{ kind: string, session: string, sourceNote: string }} meta */
function pctMapToPoints(map, meta) {
  return Object.entries(map)
    .map(([p, m]) => ({
      percentile: Number(p),
      marks: Number(m),
      kind: meta.kind,
      session: meta.session,
      sourceNote: meta.sourceNote,
    }))
    .filter((p) => Number.isFinite(p.percentile) && Number.isFinite(p.marks))
    .sort((a, b) => a.percentile - b.percentile)
}

function localJeeMainYears() {
  const published2025 = pctMapToPoints(JEE_MAIN_2025_PUBLISHED_PCT_TO_MARKS, {
    kind: 'nta',
    session: 'jan+apr-session',
    sourceNote: JEE_MAIN_2025_SESSION_SOURCE_NOTE,
  })
  const tail2025 = pctMapToPoints(JEE_MAIN_2025_HIGH_TAIL_PCTS, {
    kind: 'interpolated',
    session: 'jan+apr-session+2024-high-tail',
    sourceNote: JEE_MAIN_2025_SESSION_SOURCE_NOTE,
  })
  return {
    2024: {
      published: true,
      complete: true,
      session: 'jan+apr-pdf',
      sourceYear: '2024',
      sourceNote: JEE_MAIN_2024_PDF_SOURCE_NOTE,
      kind: 'nta',
      points: pctMapToPoints(JEE_MAIN_2024_MODERATE_PCT_TO_MARKS, {
        kind: 'nta',
        session: 'jan+apr-pdf',
        sourceNote: JEE_MAIN_2024_PDF_SOURCE_NOTE,
      }),
    },
    2025: {
      published: true,
      complete: true,
      session: 'jan+apr-session',
      sourceYear: '2025',
      sourceNote: JEE_MAIN_2025_SESSION_SOURCE_NOTE,
      kind: 'nta',
      points: [...published2025, ...tail2025].sort((a, b) => a.percentile - b.percentile),
    },
  }
}

function sanitizeGeminiYear(raw, year) {
  if (!raw || typeof raw !== 'object') return null
  if (raw.published !== true) {
    return {
      published: false,
      complete: false,
      session: String(raw.session ?? ''),
      sourceYear: String(year),
      sourceNote: String(raw.reason || raw.sourceNote || 'No complete published NTA table cited.'),
      sourceUrl: raw.sourceUrl ? String(raw.sourceUrl) : null,
      kind: 'unknown',
      points: [],
    }
  }
  const points = []
  const list = Array.isArray(raw.points) ? raw.points : []
  for (const row of list) {
    const percentile = Number(row?.percentile)
    const marks = Number(row?.marks)
    if (!Number.isFinite(percentile) || !Number.isFinite(marks)) continue
    if (percentile < 50 || percentile > 100) continue
    if (marks < 0 || marks > JEE_MAIN_MAX) continue
    if (percentile >= 99 && percentile < 99.5 && (marks < 140 || marks > 250)) continue
    if (Math.abs(percentile - 97.5) < 0.05 && (marks < 100 || marks > 220)) continue
    if (Math.abs(percentile - 99) < 0.05 && (marks < 145 || marks > 240)) continue
    points.push({
      percentile,
      marks: roundMarks(marks),
      kind: 'nta',
      session: String(raw.session || row.session || ''),
      sourceNote: String(raw.sourceNote || ''),
    })
  }
  points.sort((a, b) => a.percentile - b.percentile)
  for (let i = 1; i < points.length; i++) {
    if (points[i].marks + 0.05 < points[i - 1].marks) {
      return {
        published: false,
        complete: false,
        session: String(raw.session ?? ''),
        sourceYear: String(year),
        sourceNote: 'Rejected: marks not monotonic with percentile (invented table).',
        sourceUrl: null,
        kind: 'unknown',
        points: [],
      }
    }
  }
  const p99 = points.find((p) => Math.abs(p.percentile - 99) < 0.05)
  if (p99 && p99.marks >= 250) {
    return {
      published: false,
      complete: false,
      session: String(raw.session ?? ''),
      sourceYear: String(year),
      sourceNote: 'Rejected: 99 percentile marks too high to be a real JEE Main table.',
      sourceUrl: null,
      kind: 'unknown',
      points: [],
    }
  }
  const span90 = points.some((p) => p.percentile <= 91)
  const span99 = points.some((p) => p.percentile >= 98.5)
  const complete = raw.complete === true && points.length >= 8 && span90 && span99
  if (!complete && points.length < 6) {
    return {
      published: false,
      complete: false,
      session: String(raw.session ?? ''),
      sourceYear: String(year),
      sourceNote: String(raw.reason || 'Too few published points to treat as an NTA table.'),
      sourceUrl: raw.sourceUrl ? String(raw.sourceUrl) : null,
      kind: 'unknown',
      points: [],
    }
  }
  let mergedPoints = points
  if (complete && !points.some((p) => p.percentile > 99 && p.percentile < 100)) {
    const asMap = Object.fromEntries(points.map((p) => [p.percentile, p.marks]))
    const tail = scaleHighTailFrom2024(asMap)
    for (const [k, marks] of Object.entries(tail)) {
      const pct = Number(k)
      if (pct > 99 && pct < 100 && !asMap[pct]) {
        mergedPoints.push({
          percentile: pct,
          marks,
          kind: 'interpolated',
          session: String(raw.session || ''),
          sourceNote: 'High-tail interpolated from 2024 session shape, anchored at this year published 99.',
        })
      }
    }
    mergedPoints.sort((a, b) => a.percentile - b.percentile)
  }
  return {
    published: true,
    complete,
    session: String(raw.session || ''),
    sourceYear: String(raw.sourceYear || year),
    sourceNote: String(raw.sourceNote || 'Compiled NTA-style session table (Gemini verified).'),
    sourceUrl: raw.sourceUrl ? String(raw.sourceUrl) : null,
    kind: 'nta',
    points: mergedPoints,
  }
}

function mergeExamYears(examId) {
  /** @type {Record<string, ReturnType<typeof sanitizeGeminiYear> | ReturnType<typeof localJeeMainYears>[string]>} */
  const out = {}
  if (examId === JEE_MAIN) {
    Object.assign(out, localJeeMainYears())
  }
  const gem = NTA_PERCENTILE_MARKS_FILL?.exams?.[examId] ?? {}
  for (const year of PERCENTILE_GRID_YEARS) {
    if (examId === JEE_MAIN && (year === '2024' || year === '2025')) {
      const extra = gem[year]
      if (extra?.points && out[year]) {
        const byPct = new Map(out[year].points.map((p) => [p.percentile, p]))
        for (const row of extra.points) {
          const percentile = Number(row.percentile)
          const marks = Number(row.marks)
          if (!Number.isFinite(percentile) || !Number.isFinite(marks)) continue
          if (percentile > 99 && percentile < 100 && marks >= 160 && marks <= 290) {
            const existing = byPct.get(percentile)
            if (!existing || existing.kind === 'interpolated') {
              byPct.set(percentile, {
                percentile,
                marks: roundMarks(marks),
                kind: 'nta',
                session: String(extra.session || row.session || out[year].session),
                sourceNote: String(extra.sourceNote || 'Gemini-cited published high-tail band.'),
              })
            }
          }
        }
        out[year].points = [...byPct.values()].sort((a, b) => a.percentile - b.percentile)
      }
      continue
    }
    const cleaned = sanitizeGeminiYear(gem[year], year)
    if (cleaned) out[year] = cleaned
    else if (!out[year]) {
      out[year] = {
        published: false,
        complete: false,
        session: '',
        sourceYear: year,
        sourceNote: 'No published NTA compiled table stored for this year.',
        sourceUrl: null,
        kind: 'unknown',
        points: [],
      }
    }
  }
  return out
}

const PUBLISHED = {
  [JEE_MAIN]: mergeExamYears(JEE_MAIN),
  'jee-advanced': mergeExamYears('jee-advanced'),
  neet: mergeExamYears('neet'),
}

export function getPublishedYearRecord(examId, year) {
  return PUBLISHED[examId]?.[String(year)] ?? null
}

export function isPublishedCompleteYear(examId, year) {
  const rec = getPublishedYearRecord(examId, year)
  return Boolean(rec?.published && rec?.complete && rec.points?.length)
}

/** Complete published years in the Form Forecast grid, oldest first. */
export function getCompletePublishedYears(examId = JEE_MAIN) {
  return PERCENTILE_GRID_YEARS.filter((y) => isPublishedCompleteYear(examId, y))
}

/**
 * Latest two complete published NTA years (not a five-year blend, not an unpublished 2026).
 * @type {string[]}
 */
export const TREND_GRID_YEARS = (() => {
  const complete = getCompletePublishedYears(JEE_MAIN)
  if (complete.length >= 2) return complete.slice(-2)
  if (complete.length === 1) return [complete[0], complete[0]]
  return ['2024', '2025']
})()

export const TREND_NTA_YEARS = TREND_GRID_YEARS

export function yearColumnKind(examId, year) {
  const rec = getPublishedYearRecord(examId, year)
  if (rec?.published && rec.points?.length) return rec.complete ? 'nta' : 'partial'
  return 'unknown'
}

/**
 * Marks at a percentile from that year's published points only.
 * 0.5 steps lerp BETWEEN published points. No extrapolation outside the published span
 * except percentile 100 -> exam max when published.
 */
export function interpolatePublishedMarks(examId, year, percentile) {
  const rec = getPublishedYearRecord(examId, year)
  const pts = [...(rec?.points ?? [])].sort((a, b) => a.percentile - b.percentile)
  if (!pts.length) return null
  const p = Number(percentile)
  if (p >= 100) {
    const top = pts[pts.length - 1]
    return {
      marks: examId === JEE_MAIN ? JEE_MAIN_MAX : top.marks,
      kind: top.kind,
      session: rec.session,
      sourceYear: rec.sourceYear,
      sourceNote: rec.sourceNote,
    }
  }
  if (p <= pts[0].percentile) {
    if (Math.abs(p - pts[0].percentile) < 1e-6) {
      return {
        marks: roundMarks(pts[0].marks),
        kind: pts[0].kind,
        session: rec.session,
        sourceYear: rec.sourceYear,
        sourceNote: rec.sourceNote,
      }
    }
    return null
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    if (p >= a.percentile && p <= b.percentile) {
      const t = (p - a.percentile) / Math.max(1e-9, b.percentile - a.percentile)
      const kind = a.kind === 'nta' && b.kind === 'nta' ? 'nta' : 'interpolated'
      return {
        marks: roundMarks(lerp(a.marks, b.marks, t)),
        kind: Math.abs(p - a.percentile) < 1e-6 ? a.kind : kind,
        session: rec.session,
        sourceYear: rec.sourceYear,
        sourceNote: rec.sourceNote,
      }
    }
  }
  return null
}

export function percentileCurveSourceNote(examId = JEE_MAIN) {
  const trend = getCompletePublishedYears(examId).slice(-2)
  const fill = NTA_PERCENTILE_MARKS_FILL ?? {}
  const gem =
    fill.geminiCalled && fill.model
      ? ` Gemini (${fill.model}) re-checked year columns${fill.filledAt ? ` on ${new Date(fill.filledAt).toLocaleString('en-IN')}` : ''}.`
      : ''
  const years = PERCENTILE_GRID_YEARS.map((y) => {
    const k = yearColumnKind(examId, y)
    if (k === 'nta') return `${y} NTA`
    if (k === 'partial') return `${y} partial`
    return `${y} unknown`
  }).join(', ')
  return (
    `Year columns are compiled NTA session tables (scorecards / public shift reports), not Gemini guesses. ` +
    `${years}. Unknown years show —. Est. AIR, easy/tough marks, and the fitted curve use the latest two complete years` +
    `${trend.length ? ` (${trend.join(' and ')})` : ''}. Easy/tough is Indicative. Not a live NTA API. Always check your scorecard.` +
    gem
  )
}

export function percentileCurveTitle(examId = JEE_MAIN) {
  const trend = getCompletePublishedYears(examId).slice(-2)
  if (trend.length === 2) {
    return `Percentile curve — compiled NTA marks (${trend[0]}-${trend[1]} trend + 0.5 steps + paper toughness)`
  }
  return 'Percentile curve — compiled NTA marks vs percentile (0.5 steps + paper toughness)'
}

export const NTA_PERCENTILE_FILL_META = {
  filledAt: NTA_PERCENTILE_MARKS_FILL?.filledAt ?? 0,
  source: NTA_PERCENTILE_MARKS_FILL?.source ?? 'local-seed',
  model: NTA_PERCENTILE_MARKS_FILL?.model ?? null,
  geminiCalled: Boolean(NTA_PERCENTILE_MARKS_FILL?.geminiCalled),
  hint: NTA_PERCENTILE_MARKS_FILL?.hint ?? '',
}
