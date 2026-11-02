/**
 * Verify Career Compass placement % / package stats via Gemini against published sources.
 * Does NOT touch JoSAA round cutoffs or NTA percentile curves.
 *
 *   node scripts/verify-placement-data.mjs
 *   node scripts/verify-placement-data.mjs --limit=6
 *   node scripts/verify-placement-data.mjs --force
 *
 * Writes src/data/generated/counsellingFill.js (placement fields only).
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import '../server/loadEnv.js'
import { writeUtf8RepairUtf16 } from '../server/readJsonFile.js'
import { CAREER_COMPASS_BASELINE } from '../src/data/careerCompassCatalog.js'
import {
  KNOWN_COLLEGE_FACTS,
  PLACEMENT_OFFICIAL_NOTE,
  PLACEMENT_UNVERIFIED_NOTE,
} from '../src/data/counsellingConstants.js'
import { COUNSELLING_FILL as PREVIOUS_FILL } from '../src/data/generated/counsellingFill.js'
import { emptyUnverifiedPlacement, isOfficialPlacement } from '../src/utils/counsellingPredictor.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const outFile = path.join(root, 'src', 'data', 'generated', 'counsellingFill.js')

const force = process.argv.includes('--force')
const retryUnknown = process.argv.includes('--retry-unknown')
const sanitizeOnly = process.argv.includes('--sanitize-only')
const limitArg = process.argv.find((a) => a.startsWith('--limit='))
const LIMIT = limitArg ? Math.max(1, Number(limitArg.slice('--limit='.length)) || 0) : 0
const idsArg = process.argv.find((a) => a.startsWith('--ids='))
const IDS = idsArg
  ? idsArg
      .slice('--ids='.length)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  : []
const BATCH = 2
const GAP_MS = 2800
const SAMPLE_IDS = ['iit-madras', 'iit-bombay', 'iit-delhi', 'nit-trichy', 'iiit-hyderabad', 'aiims-delhi']
/** Independently copied from institute PDFs during this verify pass — not Gemini guesses. */
const CURATED_OFFICIAL = {
  'iit-madras': {
    sourceUrl: 'https://placement.iitm.ac.in/downloads/CPC_REPORT_2024_25.pdf',
    sourceYear: '2024-25',
    placementPageUrl: 'https://placement.iitm.ac.in',
    branches: {
      cse: { avgLpa: 53.2, medianLpa: 46 },
      ee: { avgLpa: 28.8, medianLpa: 22.5 },
      me: { avgLpa: 16.9, medianLpa: 15 },
      ae: { avgLpa: 17.1, medianLpa: 16.2 },
    },
  },
}

function officialFromFields(fields, meta) {
  const avgLpa = fields.avgLpa ?? null
  const medianLpa = fields.medianLpa ?? null
  const lowestLpa = fields.lowestLpa ?? null
  const highestLpa = fields.highestLpa ?? null
  const pctPlaced = fields.pctPlaced ?? null
  return {
    pctPlaced,
    avgLpa,
    medianLpa,
    lowestLpa,
    highestLpa,
    highestDomesticLpa: highestLpa,
    highestIntlLpa: null,
    indicative: false,
    placementSource: 'official',
    sourceNote: PLACEMENT_OFFICIAL_NOTE,
    sourceUrl: meta.sourceUrl,
    sourceYear: meta.sourceYear,
    scope: fields.scope ?? 'branch',
  }
}

function applyCuratedOfficial(overlay) {
  for (const [id, row] of Object.entries(CURATED_OFFICIAL)) {
    const local = overlay.colleges[id]
    if (!local) continue
    const branches = { ...(local.branches ?? {}) }
    for (const [bid, fields] of Object.entries(row.branches ?? {})) {
      if (!branches[bid]) continue
      branches[bid] = {
        ...branches[bid],
        placement: officialFromFields(fields, row),
      }
    }
    overlay.colleges[id] = {
      ...local,
      placementPageUrl: row.placementPageUrl || local.placementPageUrl,
      placement: officialFromFields(
        { scope: 'institute', ...((Object.values(row.branches ?? {})[0] && {}) || {}) },
        row,
      ),
      branches,
      placementVerifiedAt: Date.now(),
      placementVerified: true,
    }
    // Institute row should not copy CSE numbers. Keep institute unverified unless provided.
    overlay.colleges[id].placement = emptyUnverifiedPlacement()
    overlay.colleges[id].placementVerified = true
  }
}

const BLOCKED_SOURCE =
  /shiksha|collegedunia|careers360|getmyuni|universitydunia|quora|reddit|facebook|twitter|youtube|wikipedia|pagalguy|collegepravesh|selzy|byjus|vertexaisearch|grounding-api-redirect|google\.com\/search|googleusercontent/i

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

function numOrNull(v, { min, max } = {}) {
  if (v == null || v === '' || v === 'unknown' || v === 'null') return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  if (min != null && n < min) return null
  if (max != null && n > max) return null
  return Math.round(n * 10) / 10
}

function isAllowedSourceUrl(url) {
  const u = String(url ?? '').trim()
  if (!/^https:\/\//i.test(u)) return false
  if (BLOCKED_SOURCE.test(u)) return false
  if (/\.(jpg|jpeg|png|gif|webp|svg)(\?|#|$)/i.test(u)) return false
  return true
}

function placementLooksPublished(p) {
  if (!p || p.placementSource !== 'official') return false
  if (!isAllowedSourceUrl(p.sourceUrl)) return false
  const year = String(p.sourceYear ?? '')
  if (/^2026/.test(year)) return false
  return ['pctPlaced', 'avgLpa', 'medianLpa', 'lowestLpa', 'highestLpa'].some(
    (f) => p[f] != null && Number.isFinite(Number(p[f])),
  )
}

function demoteUnsourcedOfficial(college) {
  const fix = (p) => (placementLooksPublished(p) ? p : emptyUnverifiedPlacement())
  const branches = { ...(college.branches ?? {}) }
  let any = false
  for (const [id, row] of Object.entries(branches)) {
    const next = fix(row.placement)
    if (isOfficialPlacement(next) || placementLooksPublished(next)) any = true
    branches[id] = { ...row, placement: next }
  }
  const inst = fix(college.placement)
  return {
    ...college,
    placement: inst,
    branches,
    placementVerified: any || placementLooksPublished(inst),
  }
}

function snapshotPlacement(collegeOverlay) {
  const cse = collegeOverlay?.branches?.cse?.placement ?? collegeOverlay?.branches?.mbbs?.placement
  const inst = collegeOverlay?.placement
  const p = cse ?? inst
  if (!p) return null
  return {
    pctPlaced: p.pctPlaced ?? null,
    avgLpa: p.avgLpa ?? null,
    medianLpa: p.medianLpa ?? null,
    lowestLpa: p.lowestLpa ?? null,
    highestLpa: p.highestLpa ?? p.highestDomesticLpa ?? null,
    source: p.placementSource ?? null,
  }
}

function sanitizePlacement(raw, { fallbackUrl } = {}) {
  const empty = emptyUnverifiedPlacement()
  if (!raw || typeof raw !== 'object') return empty
  const sourceUrl = isAllowedSourceUrl(raw.sourceUrl) ? String(raw.sourceUrl).trim() : null
  const sourceYear = raw.sourceYear != null && String(raw.sourceYear).trim() ? String(raw.sourceYear).trim() : null
  const pctPlaced = numOrNull(raw.pctPlaced, { min: 1, max: 100 })
  const avgLpa = numOrNull(raw.avgLpa, { min: 1, max: 250 })
  const medianLpa = numOrNull(raw.medianLpa, { min: 1, max: 250 })
  const lowestLpa = numOrNull(raw.lowestLpa, { min: 0.5, max: 80 })
  let highestLpa = numOrNull(raw.highestLpa ?? raw.highestDomesticLpa, { min: 1, max: 400 })
  if (lowestLpa != null && highestLpa != null && highestLpa < lowestLpa) highestLpa = null
  const hasNum = [pctPlaced, avgLpa, medianLpa, lowestLpa, highestLpa].some((n) => n != null)
  const claimedOfficial = raw.verified === true || raw.placementSource === 'official'
  const url = sourceUrl || (isAllowedSourceUrl(fallbackUrl) ? String(fallbackUrl).trim() : null)
  if (!claimedOfficial || !hasNum || !url) {
    return empty
  }
  const scope = raw.scope === 'branch' ? 'branch' : 'institute'
  return {
    pctPlaced,
    avgLpa,
    medianLpa,
    lowestLpa,
    highestLpa,
    highestDomesticLpa: highestLpa,
    highestIntlLpa: numOrNull(raw.highestIntlLpa, { min: 1, max: 800 }),
    indicative: false,
    placementSource: 'official',
    sourceNote: PLACEMENT_OFFICIAL_NOTE,
    sourceUrl: url,
    sourceYear,
    scope,
  }
}

function applyVerifiedCollege(local, gem, catalogCollege) {
  const fallbackUrl = gem?.placementPageUrl || local.placementPageUrl
  const inst = sanitizePlacement(gem?.institutePlacement ?? gem?.placement, { fallbackUrl })
  const gemBranches = gem?.branches
  const byId = new Map()
  if (Array.isArray(gemBranches)) {
    for (const b of gemBranches) {
      const id = String(b.id ?? b.branchId ?? '').toLowerCase()
      if (id) byId.set(id, b)
    }
  } else if (gemBranches && typeof gemBranches === 'object') {
    for (const [id, b] of Object.entries(gemBranches)) byId.set(String(id).toLowerCase(), b)
  }

  const branches = { ...(local.branches ?? {}) }
  const branchIds = Object.keys(branches)
  if (!branchIds.length && catalogCollege?.branches) {
    for (const b of catalogCollege.branches) {
      branches[b.id] = { placement: emptyUnverifiedPlacement(), roundClosing: {} }
    }
  }

  let anyOfficial = isOfficialPlacement(inst)
  for (const [bid, row] of Object.entries(branches)) {
    const incoming = byId.get(bid)?.placement
    let placement = sanitizePlacement(incoming, { fallbackUrl })
    if (!isOfficialPlacement(placement) && isOfficialPlacement(inst)) {
      placement = { ...inst, scope: 'institute' }
    }
    if (isOfficialPlacement(placement)) anyOfficial = true
    branches[bid] = {
      ...row,
      placement,
      roundClosing: row.roundClosing ?? {},
    }
  }

  return {
    ...local,
    placementPageUrl: gem?.placementPageUrl || local.placementPageUrl,
    placement: anyOfficial ? inst : emptyUnverifiedPlacement(),
    branches,
    placementVerifiedAt: Date.now(),
    placementVerified: anyOfficial,
  }
}

function stripInventedPlacement(college) {
  if (college.placementVerified && isOfficialPlacement(college.placement)) return college
  const branches = { ...(college.branches ?? {}) }
  for (const [id, row] of Object.entries(branches)) {
    if (isOfficialPlacement(row.placement) && college.placementVerified) continue
    branches[id] = {
      ...row,
      placement: emptyUnverifiedPlacement(),
      roundClosing: row.roundClosing ?? {},
    }
  }
  return {
    ...college,
    placement: emptyUnverifiedPlacement(),
    branches,
  }
}

async function geminiJson(system, userText) {
  const key =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!key) {
    const err = new Error('GEMINI_API_KEY missing in onlinetest/.env')
    err.code = 'NO_KEY'
    throw err
  }
  const preferred =
    String(process.env.GEMINI_TEXT_MODEL ?? 'gemini-3.5-flash-lite').trim() || 'gemini-3.5-flash-lite'
  const models = [
    ...new Set([
      preferred,
      'gemini-3.5-flash-lite',
      'gemini-3.5-flash',
      'gemini-2.5-flash',
    ]),
  ]
  let lastErr = null
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`
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
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
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
          if (/not found|NOT_FOUND|does not support/i.test(msg)) break
          if (/spend cap|RESOURCE_EXHAUSTED|quota|429/i.test(msg)) throw lastErr
          continue
        }
        const text =
          data?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('\n') ?? ''
        const parsed = extractJsonObject(text)
        if (!parsed) {
          lastErr = new Error(`${model}: no JSON object`)
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
  throw lastErr ?? new Error('Gemini returned no JSON object')
}

function serializeFill(overlay) {
  return `/**
 * Persisted counselling fill (Gemini and/or local seed).
 * Refresh: node scripts/fill-counselling-data.mjs
 * Placement verify: node scripts/verify-placement-data.mjs
 * Runtime prediction does NOT call Gemini.
 */
export const COUNSELLING_FILL = ${JSON.stringify(overlay, null, 2)}

export default COUNSELLING_FILL
`
}

function persistOverlay(overlay) {
  writeUtf8RepairUtf16(outFile, serializeFill(overlay))
}

const overlay = structuredClone(PREVIOUS_FILL ?? { colleges: {} })
if (!overlay.colleges) overlay.colleges = {}

const beforeSample = {}
for (const id of SAMPLE_IDS) {
  if (overlay.colleges[id]) beforeSample[id] = snapshotPlacement(overlay.colleges[id])
}

let stripped = 0
const catalogById = new Map(CAREER_COMPASS_BASELINE.map((c) => [c.id, c]))
let work = CAREER_COMPASS_BASELINE.filter((c) => overlay.colleges[c.id])
if (sanitizeOnly) work = []
else if (IDS.length) work = work.filter((c) => IDS.includes(c.id))
else if (!force && !retryUnknown) {
  work = work.filter((c) => !overlay.colleges[c.id]?.placementVerified)
}
if (LIMIT) work = work.slice(0, LIMIT)

for (const c of work) {
  overlay.colleges[c.id] = stripInventedPlacement(overlay.colleges[c.id])
  stripped++
}
persistOverlay(overlay)
console.log(`verify-placement-data: clearing invented packages on ${stripped} colleges in this run (cutoffs kept)`)

const system = `You VERIFY published Indian college placement statistics for a counselling predictor.
Return ONLY JSON. Never estimate, interpolate, or invent a "typical" package.
Allowed sources: official institute T&P / placement report PDFs or pages, and NIRF graduate-outcome tables (nirfindia.org).
Forbidden: Shiksha, Collegedunia, Careers360, Wikipedia, Reddit, coaching blogs, memory, round numbers that "look right".
If a figure is not in an allowed source, it is unknown — set null and verified=false.
Medical UG (MBBS/BDS) almost never publishes engineering-style LPA packages. Return unverified nulls unless an official placement report exists. Do not treat intern stipend as avgLpa.
Prefer the latest published year (2024 or 2025 season). Institute-level is OK when branch-wise is unpublished.
sourceUrl must be https.`

const batches = []
for (let i = 0; i < work.length; i += BATCH) batches.push(work.slice(i, i + BATCH))

let verified = 0
let unknown = 0
let stopped = null
let usedModel = null

for (let i = 0; i < batches.length; i++) {
  const batch = batches[i]
  const payload = batch.map((c) => {
    const local = overlay.colleges[c.id]
    return {
      id: c.id,
      name: c.name,
      shortName: c.shortName,
      type: c.type,
      city: c.city,
      website: local?.website || c.website,
      placementPageUrl:
        KNOWN_COLLEGE_FACTS[c.id]?.placementPageUrl || local?.placementPageUrl || c.placementPageUrl,
      branches: (c.branches ?? []).map((b) => ({ id: b.id, name: b.name })),
    }
  })
  const userText = `Verify placement % and packages (avg/median/lowest/highest LPA) for these colleges from published official/NIRF sources only.
Return JSON:
{ "colleges": [ {
  "id": "",
  "placementPageUrl": "https://...",
  "institutePlacement": {
    "verified": true,
    "sourceUrl": "https://...",
    "sourceYear": "2025",
    "scope": "institute",
    "pctPlaced": null,
    "avgLpa": null,
    "medianLpa": null,
    "lowestLpa": null,
    "highestLpa": null
  },
  "branches": [ { "id": "cse", "placement": { "verified": false, "sourceUrl": null, "sourceYear": null, "scope": "branch", "pctPlaced": null, "avgLpa": null, "medianLpa": null, "lowestLpa": null, "highestLpa": null } } ]
} ] }

Colleges:
${JSON.stringify(payload)}`

  try {
    const parsed = await geminiJson(system, userText)
    usedModel = parsed.__model || usedModel
    const list = Array.isArray(parsed?.colleges) ? parsed.colleges : Array.isArray(parsed) ? parsed : []
    for (const gem of list) {
      const id = gem?.id
      if (!id || !overlay.colleges[id]) continue
      overlay.colleges[id] = applyVerifiedCollege(overlay.colleges[id], gem, catalogById.get(id))
      if (overlay.colleges[id].placementVerified) verified++
      else unknown++
    }
    for (const c of batch) {
      if (!overlay.colleges[c.id]?.placementVerifiedAt) {
        overlay.colleges[c.id] = {
          ...overlay.colleges[c.id],
          placement: emptyUnverifiedPlacement(),
          placementVerifiedAt: Date.now(),
          placementVerified: false,
          branches: Object.fromEntries(
            Object.entries(overlay.colleges[c.id].branches ?? {}).map(([bid, row]) => [
              bid,
              { ...row, placement: emptyUnverifiedPlacement() },
            ]),
          ),
        }
        unknown++
      }
    }
    overlay.source = overlay.source || 'gemini'
    overlay.filledAt = overlay.filledAt || Date.now()
    persistOverlay(overlay)
    console.log(
      `  verify batch ${i + 1}/${batches.length}: +official ${verified} / unknown ${unknown} (model ${usedModel ?? 'n/a'})`,
    )
    if (i < batches.length - 1) await new Promise((r) => setTimeout(r, GAP_MS))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`  verify batch ${i + 1}/${batches.length} failed: ${msg}`)
    stopped = msg
    for (const c of batch) {
      if (!overlay.colleges[c.id]?.placementVerifiedAt) {
        overlay.colleges[c.id] = {
          ...stripInventedPlacement(overlay.colleges[c.id]),
          placementVerifiedAt: Date.now(),
          placementVerified: false,
        }
        unknown++
      }
    }
    persistOverlay(overlay)
    if (/spend cap|RESOURCE_EXHAUSTED|quota|429|NO_KEY/i.test(msg)) break
  }
}

applyCuratedOfficial(overlay)
for (const [id, row] of Object.entries(overlay.colleges)) {
  overlay.colleges[id] = demoteUnsourcedOfficial(row)
}

const all = Object.values(overlay.colleges)
const nOfficial = all.filter(
  (c) =>
    c.placementVerified ||
    isOfficialPlacement(c.placement) ||
    Object.values(c.branches ?? {}).some((b) => isOfficialPlacement(b.placement)),
).length
const nUnknown = all.length - nOfficial
overlay.placementAudit = {
  verifiedAt: Date.now(),
  model: usedModel,
  officialColleges: nOfficial,
  unknownColleges: nUnknown,
  thisRunOfficial: verified,
  thisRunUnknown: unknown,
  stopped: stopped || null,
  note: 'Placement % / packages verified against published TPO/NIRF where possible. Unknown stays Not available — not a guessed typical package.',
}
overlay.hint = `Placement verified: ${nOfficial} colleges with published figures, ${nUnknown} unknown/unverified. ${overlay.placementAudit.note} Rank/percentile trend is local (latest two years). ${PREVIOUS_FILL?.hint ?? ''}`
persistOverlay(overlay)

console.log('')
console.log(`verify-placement-data: wrote ${all.length} colleges 뿯↽ ${path.relative(root, outFile)}`)
console.log(`  official/published: ${nOfficial}  unknown: ${nUnknown}  model: ${usedModel ?? 'none'}`)
if (stopped) console.log(`  stopped: ${stopped}`)
console.log('  sample before 뿯↽ after (CSE/MBBS or institute):')
for (const id of SAMPLE_IDS) {
  const after = snapshotPlacement(overlay.colleges[id])
  const before = beforeSample[id]
  if (!before && !after) continue
  console.log(`    ${id}: ${JSON.stringify(before)} 뿯↽ ${JSON.stringify(after)}`)
}

await fs.access(outFile)
