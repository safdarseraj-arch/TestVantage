/**
 * Last-five-years marks at every 0.5 percentile.
 * JEE Main year columns use published NTA compiled tables (2024 PDFs, 2025 sessions,
 * Gemini-verified other years). Unknown years stay empty -- never invent.
 * Easy/tough marks use 2024 session spread (Indicative).
 */

import { MARKS_RANK_HISTORY, airFromPercentileAndPool, getExamPoolForYear } from './careerCompassHistory.js'
import {
  JEE_MAIN_JAN_2024_SESSIONS,
  JEE_MAIN_APR_2024_SESSIONS,
} from './jeeMain2024PdfCurves.js'
import {
  interpolatePublishedMarks,
  yearColumnKind,
} from './ntaPublishedMarks.js'
import {
  PERCENTILE_GRID_MAX,
  PERCENTILE_GRID_MIN,
  PERCENTILE_GRID_STEP,
  PERCENTILE_GRID_YEARS,
} from './counsellingConstants.js'

const EXAMS = ['jee-main', 'jee-advanced', 'neet']

function lerp(a, b, t) {
  return a + t * (b - a)
}

/** @param {{ marks: number, percentile: number, air?: number }[]} curve */
function invertAtPercentile(curve, percentile) {
  const pts = [...(curve ?? [])].sort((a, b) => a.percentile - b.percentile)
  if (!pts.length) return null
  if (percentile <= pts[0].percentile) {
    return { marks: pts[0].marks, air: pts[0].air ?? null }
  }
  const last = pts[pts.length - 1]
  if (percentile >= last.percentile) {
    return { marks: last.marks, air: last.air ?? null }
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    if (percentile >= a.percentile && percentile <= b.percentile) {
      const t = (percentile - a.percentile) / Math.max(1e-9, b.percentile - a.percentile)
      const marks = lerp(a.marks, b.marks, t)
      const airA = Math.max(1, a.air ?? 1)
      const airB = Math.max(1, b.air ?? 1)
      const air = 10 ** lerp(Math.log10(airA), Math.log10(airB), t)
      return { marks, air }
    }
  }
  return { marks: last.marks, air: last.air ?? null }
}

/** Session-spread at a percentile from 2024 JEE Main PDFs (easy = high marks, tough = low marks). */
function pdfSpreadAtPercentile(percentile) {
  const keys = new Set([
    ...Object.keys(JEE_MAIN_JAN_2024_SESSIONS),
    ...Object.keys(JEE_MAIN_APR_2024_SESSIONS),
  ])
  const pts = [...keys]
    .map((k) => Number(k))
    .sort((a, b) => a - b)
    .map((pct) => {
      const vals = [
        ...(JEE_MAIN_JAN_2024_SESSIONS[pct] ?? []),
        ...(JEE_MAIN_APR_2024_SESSIONS[pct] ?? []),
      ].filter((n) => Number.isFinite(n))
      if (!vals.length) return null
      const sorted = [...vals].sort((a, b) => a - b)
      return {
        percentile: pct,
        tough: sorted[0],
        moderate: sorted[Math.floor(sorted.length / 2)],
        easy: sorted[sorted.length - 1],
      }
    })
    .filter(Boolean)
  if (!pts.length) return null
  if (percentile <= pts[0].percentile) return pts[0]
  if (percentile >= pts[pts.length - 1].percentile) return pts[pts.length - 1]
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    if (percentile >= a.percentile && percentile <= b.percentile) {
      const t = (percentile - a.percentile) / Math.max(1e-9, b.percentile - a.percentile)
      return {
        percentile,
        tough: lerp(a.tough, b.tough, t),
        moderate: lerp(a.moderate, b.moderate, t),
        easy: lerp(a.easy, b.easy, t),
      }
    }
  }
  return pts[pts.length - 1]
}

function roundMarks(n) {
  if (n == null || !Number.isFinite(Number(n))) return null
  return Math.round(Number(n) * 10) / 10
}

function roundPct(n) {
  return Math.round(Number(n) * 10) / 10
}

function easyToughFromSpread(marks, percentile, examId) {
  if (marks == null || !Number.isFinite(marks)) return { marksEasy: null, marksTough: null }
  const spread = examId === 'jee-main' ? pdfSpreadAtPercentile(Math.min(99.9, percentile)) : null
  let marksEasy = marks * 1.08
  let marksTough = marks * 0.92
  if (spread?.moderate) {
    const easyRatio = spread.easy / Math.max(1, spread.moderate)
    const toughRatio = spread.tough / Math.max(1, spread.moderate)
    marksEasy = marks * easyRatio
    marksTough = marks * toughRatio
  }
  return { marksEasy: roundMarks(marksEasy), marksTough: roundMarks(marksTough) }
}

function buildPercentileGrids() {
  const out = {}
  for (const examId of EXAMS) {
    out[examId] = {}
    for (const year of PERCENTILE_GRID_YEARS) {
      const curve = MARKS_RANK_HISTORY[examId]?.[year] ?? []
      const pool = getExamPoolForYear(examId, year)
      const colKind = yearColumnKind(examId, year)
      const rows = []
      for (let p = PERCENTILE_GRID_MIN; p <= PERCENTILE_GRID_MAX + 1e-9; p += PERCENTILE_GRID_STEP) {
        const percentile = roundPct(p)
        if (examId === 'jee-main') {
          const pub = interpolatePublishedMarks(examId, year, percentile)
          if (!pub) {
            rows.push({
              percentile,
              marks: null,
              air: percentile >= 100 ? 1 : Math.max(1, Math.round(airFromPercentileAndPool(pool, percentile))),
              marksEasy: null,
              marksTough: null,
              published: false,
              kind: 'unknown',
              session: '',
              sourceYear: year,
            })
            continue
          }
          const air =
            percentile >= 100 ? 1 : Math.max(1, Math.round(airFromPercentileAndPool(pool, percentile)))
          const spread = easyToughFromSpread(pub.marks, percentile, examId)
          rows.push({
            percentile,
            marks: roundMarks(pub.marks),
            air,
            ...spread,
            published: true,
            kind: pub.kind || colKind,
            session: pub.session || '',
            sourceYear: pub.sourceYear || year,
          })
          continue
        }
        const inv = invertAtPercentile(curve, Math.min(99.99, percentile === 100 ? 99.99 : percentile))
        if (!inv) continue
        const marks = percentile >= 100 ? (curve[curve.length - 1]?.marks ?? inv.marks) : inv.marks
        const air =
          percentile >= 100
            ? 1
            : Math.max(1, Math.round(inv.air ?? airFromPercentileAndPool(pool, percentile)))
        const spread = easyToughFromSpread(marks, percentile, examId)
        rows.push({
          percentile,
          marks: roundMarks(marks),
          air,
          ...spread,
          published: true,
          kind: 'indicative',
          sourceYear: year,
        })
      }
      out[examId][year] = rows
    }
  }
  return out
}

/** Dense 0.5-pt grids. JEE Main year marks are published NTA compiled tables or unknown. */
export const COUNSELLING_PERCENTILE_GRIDS = buildPercentileGrids()

export const PERCENTILE_GRID_BUILT_FROM =
  'JEE Main year columns: compiled NTA session tables (2024 Jan+Apr PDFs, 2025 Jan+Apr scorecard shifts, Gemini-verified other years). Unknown years are blank. Easy/tough marks use 2024 session spread (Indicative).'
