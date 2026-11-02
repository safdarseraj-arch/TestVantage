/**
 * Ask Gemini to re-check JEE Main year-column marks vs percentile against
 * published NTA compiled tables. Unknown stays unknown -- never invent.
 *
 *   node scripts/fill-nta-percentile-marks.mjs
 *
 * Writes src/data/generated/ntaPercentileMarksFill.js
 * Does not touch counsellingFill.js placements.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeUtf8RepairUtf16 } from './readJsonFile.js'
import { getVisionEnv } from './vision.js'
import { PERCENTILE_GRID_YEARS } from '../src/data/counsellingConstants.js'
import { JEE_MAIN_2024_MODERATE_PCT_TO_MARKS } from '../src/data/jeeMain2024PdfCurves.js'
import { JEE_MAIN_2025_PUBLISHED_PCT_TO_MARKS } from '../src/data/jeeMain2025SessionCurves.js'
import { NTA_PERCENTILE_MARKS_FILL as PREVIOUS } from '../src/data/generated/ntaPercentileMarksFill.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const outFile = path.join(root, 'src', 'data', 'generated', 'ntaPercentileMarksFill.js')

const GAP_MS = 2500
const VERIFY_YEARS = ['2022', '2023', '2025', '2026']

function extractJsonObject(text) {
  const raw = String(text ?? '').trim()
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = fence ? fence[1] : raw
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(body.slice(start, end + 1))
  } catch {
    return null
  }
}

const SYSTEM = `You re-check official NTA JEE Main (B.E./B.Tech, Paper 1) MARKS vs PERCENTILE tables.
Return ONLY JSON. Do not invent a live NTA API.

Rules:
- Use compiled NTA-style tables from official scorecards or public NTA percentile-vs-marks shift reports for THAT year and session only.
- Cite year + session (January / April / both-median) in "session" and a public https sourceUrl when you used one.
- NEVER guess "typical" marks, round to a coaching rule of thumb, copy another year, or interpolate a missing year as if it were official.
- If that year/session is not published as a compiled table you can cite, set published=false, complete=false, points=[], and explain in reason.
- 2026: only published=true if a COMPLETE compiled table exists (both sessions, or a full session-median table of actual result data -- not "expected 2026" ranges). If only January is compiled and April is expected/estimated, complete=false.
- Percentile 99 in JEE Main is typically 150-230 marks, NEVER ~280-290 (that is 99.9 / 100 territory).
- Points must be monotonic: higher percentile => higher or equal marks.
- Marks are out of 300.
- Do not copy 2024 numbers into 2025 or 2026.
- Label kind "nta" only for published compiled points. Omit unpublished percentiles rather than filling a guess.`

async function geminiJson(system, userText) {
  const { geminiKey, geminiTextModel } = getVisionEnv()
  if (!geminiKey) {
    const err = new Error('GEMINI_API_KEY missing in onlinetest/.env')
    err.code = 'NO_KEY'
    throw err
  }
  const preferred = geminiTextModel || 'gemini-3.5-flash-lite'
  const models = [...new Set([preferred, 'gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-2.5-flash'])]
  let lastErr = null
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiKey)}`
    const attempts = [
      {
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
      },
      {
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
        },
      },
    ]
    for (const extra of attempts) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `${system}\n\n${userText}` }] }],
            ...extra,
          }),
          signal: AbortSignal.timeout(70_000),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          const msg = data?.error?.message || `Gemini HTTP ${res.status}`
          lastErr = new Error(`${model}: ${msg}`)
          lastErr.status = res.status
          lastErr.model = model
          if (/not found|NOT_FOUND|does not support/i.test(msg)) break
          if (/spend cap|RESOURCE_EXHAUSTED|quota|429/i.test(msg)) throw lastErr
          continue
        }
        const text =
          data?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('\n') ?? ''
        const parsed = extractJsonObject(text)
        if (!parsed) {
          lastErr = new Error(`${model}: Gemini returned no JSON object`)
          continue
        }
        parsed.__model = model
        return parsed
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err))
        if (/spend cap|RESOURCE_EXHAUSTED|quota|429/i.test(lastErr.message)) throw lastErr
      }
    }
  }
  throw lastErr || new Error('Gemini returned no JSON object')
}

function userPromptForYear(year) {
  const suspect = {
    2022: { 97.5: 191.9, 99.0: 285.7, 99.5: 292.9 },
    2023: { 97.5: 182.1, 99.0: 280, 99.5: 290 },
    2025: { 97.5: 166.8, 99.0: 198.6, 99.5: 224.6 },
    2026: { 97.5: 165.3, 99.0: 195.9, 99.5: 217.5 },
  }
  return (
    `Re-check JEE Main ${year} compiled NTA marks-vs-percentile (General, Paper 1, out of 300).\n` +
    `Known grounded tables in our app (do not overwrite these years' published 90-99 bands):\n` +
    `2024 moderate (Jan+Apr PDF medians) 97.5=${JEE_MAIN_2024_MODERATE_PCT_TO_MARKS[97.5]}, 99=${JEE_MAIN_2024_MODERATE_PCT_TO_MARKS[99]}, 99.5=${JEE_MAIN_2024_MODERATE_PCT_TO_MARKS[99.5]}.\n` +
    `2025 moderate (Jan+Apr NTA scorecard shift medians) 97.5=${JEE_MAIN_2025_PUBLISHED_PCT_TO_MARKS[97.5]}, 99=${JEE_MAIN_2025_PUBLISHED_PCT_TO_MARKS[99]}.\n` +
    `SUSPECT invented numbers currently shown in our UI (REJECT / replace with real table or unknown): ${JSON.stringify(suspect[year] ?? {})}.\n` +
    `If ${year} is 2025, confirm the Vedantu/NTA shift medians and add 99.5 and 99.9 ONLY if a published shift table has those bands; otherwise omit them.\n` +
    `If ${year} is 2026, do not copy 2024. If April 2026 is only expected ranges, complete=false.\n` +
    `Return JSON: { "year": "${year}", "examId": "jee-main", "published": true|false, "complete": true|false, "session": "jan+apr median | jan only | ...", "sourceYear": "${year}", "sourceNote": "...", "sourceUrl": "https://...", "reason": "if unpublished", "points": [ { "percentile": 90, "marks": 0 } ] }\n` +
    `Include published points at 90,91,92,93,94,95,95.5,96,96.5,97,97.5,98,98.5,99,99.5,99.9,100 when those bands exist in the cited table. Omit missing bands.`
  )
}

function serializeFill(overlay) {
  return `/**
 * Persisted Gemini re-check of NTA marks-vs-percentile year columns.
 * Refresh: node scripts/fill-nta-percentile-marks.mjs
 * Runtime prediction does NOT call Gemini.
 */
export const NTA_PERCENTILE_MARKS_FILL = ${JSON.stringify(overlay, null, 2)}

export default NTA_PERCENTILE_MARKS_FILL
`
}

function persist(overlay) {
  writeUtf8RepairUtf16(outFile, serializeFill(overlay))
}

/**
 * @param {{ localOnly?: boolean }} [opts]
 */
export async function runNtaPercentileFill(opts = {}) {
  const { geminiKey, geminiTextModel } = getVisionEnv()
  const overlay = {
    filledAt: Date.now(),
    source: PREVIOUS?.source ?? 'local-seed',
    model: null,
    geminiCalled: false,
    hint: PREVIOUS?.hint ?? '',
    exams: {
      'jee-main': { ...(PREVIOUS?.exams?.['jee-main'] ?? {}) },
    },
    yearResults: { ...(PREVIOUS?.yearResults ?? {}) },
  }

  if (opts.localOnly || !geminiKey) {
    overlay.source = 'local-seed'
    overlay.hint = geminiKey
      ? 'Local compiled 2024 PDF + 2025 session tables only (--local-only).'
      : 'No Gemini key -- kept local 2024 PDF + 2025 session tables. Unknown years stay unknown.'
    persist(overlay)
    return overlay
  }

  const modelUsed = geminiTextModel || 'gemini-3.5-flash-lite'
  overlay.geminiCalled = true
  overlay.model = modelUsed
  overlay.source = 'gemini'
  let filled = 0
  let stopped = null

  for (let i = 0; i < VERIFY_YEARS.length; i++) {
    const year = VERIFY_YEARS[i]
    try {
      const parsed = await geminiJson(SYSTEM, userPromptForYear(year))
      if (parsed?.__model) overlay.model = parsed.__model
      delete parsed.__model
      overlay.exams['jee-main'][year] = parsed
      overlay.yearResults[year] = {
        published: parsed.published === true,
        complete: parsed.complete === true,
        pointCount: Array.isArray(parsed.points) ? parsed.points.length : 0,
        session: parsed.session ?? '',
        sourceUrl: parsed.sourceUrl ?? null,
      }
      filled++
      overlay.filledAt = Date.now()
      persist(overlay)
      if (i < VERIFY_YEARS.length - 1) await new Promise((r) => setTimeout(r, GAP_MS))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      stopped = msg
      overlay.yearResults[year] = { error: msg }
      if (/spend cap|RESOURCE_EXHAUSTED|quota|429/i.test(msg)) break
    }
  }

  overlay.hint = stopped
    ? `Gemini re-checked ${filled}/${VERIFY_YEARS.length} years then stopped (${stopped}). Unknown stays unknown. Grid years: ${PERCENTILE_GRID_YEARS.join(', ')}.`
    : `Gemini re-checked ${filled} JEE Main year columns against published NTA compiled tables. Unknown stays unknown.`
  persist(overlay)
  return overlay
}

export { VERIFY_YEARS, outFile }
