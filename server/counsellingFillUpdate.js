/**
 * Career Compass counselling fill -- Gemini first, else OpenAI, else local AI.
 * Shared by scripts/fill-counselling-data.mjs and POST /api/career-compass/update-counselling.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeUtf8RepairUtf16 } from './readJsonFile.js'
import { getVisionEnv } from './vision.js'
import { CAREER_COMPASS_BASELINE } from '../src/data/careerCompassCatalog.js'
import {
  COUNSELLING_TREND_YEARS,
  GEMINI_FILL_HINT,
  JOSAA_ROUNDS,
  KNOWN_COLLEGE_FACTS,
  KNOWN_COLLEGE_WEBSITES,
  MCC_ROUNDS,
  PLACEMENT_PACKAGE_NOTE,
  QUOTAS_BY_TYPE,
  TYPE_LABELS,
} from '../src/data/counsellingConstants.js'
import { COUNSELLING_FILL as PREVIOUS_FILL } from '../src/data/generated/counsellingFill.js'
import {
  emptyUnverifiedPlacement,
  enrichCollegeWithCounsellingFill,
  isOfficialPlacement,
} from '../src/utils/counsellingPredictor.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const outFile = path.join(root, 'src', 'data', 'generated', 'counsellingFill.js')

const BATCH = 3
const GAP_MS = 2500
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

/** @type {typeof PREVIOUS_FILL | null} */
let lastWrittenOverlay = null
/** @type {ReturnType<typeof idleJob> | null} */
let currentJob = null
/** @type {Promise<ReturnType<typeof snapshotJob>> | null} */
let runPromise = null

function idleJob() {
  const detected = detectCounsellingUpdateEngine()
  return {
    status: 'idle',
    engine: detected.engine,
    engineLabel: detected.engineLabel,
    model: detected.model,
    cloud: detected.cloud,
    message: 'Ready to update counselling data.',
    startedAt: null,
    finishedAt: null,
    collegeCount: 0,
    cloudFilled: 0,
    source: PREVIOUS_FILL?.source ?? 'local-seed',
    hint: PREVIOUS_FILL?.hint || GEMINI_FILL_HINT,
    error: null,
    batch: null,
  }
}

/**
 * Gemini first (GEMINI_API_KEY / GOOGLE_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY),
 * then OPENAI_API_KEY, else local AI.
 */
export function detectCounsellingUpdateEngine() {
  const { geminiKey, openaiKey, geminiTextModel, openaiModel } = getVisionEnv()
  if (geminiKey) {
    return {
      engine: 'gemini',
      engineLabel: 'Gemini',
      model: geminiTextModel || 'gemini-3.5-flash-lite',
      cloud: true,
    }
  }
  if (openaiKey) {
    return {
      engine: 'openai',
      engineLabel: 'OpenAI',
      model: openaiModel || 'gpt-4o',
      cloud: true,
    }
  }
  return {
    engine: 'local',
    engineLabel: 'local AI',
    model: null,
    cloud: false,
  }
}

function runningMessage(engineLabel, batch) {
  if (batch?.total) {
    return `Updating with ${engineLabel}... batch ${batch.index}/${batch.total}`
  }
  return `Updating with ${engineLabel}...`
}

function doneMessage(engineLabel, extra = '') {
  const base = `Updated with ${engineLabel}. Indicative -- unknown stays Not available.`
  return extra ? `${base} ${extra}` : base
}

function snapshotJob() {
  const job = currentJob ?? idleJob()
  return { ...job, batch: job.batch ? { ...job.batch } : null }
}

currentJob = idleJob()

export function getCounsellingUpdateStatus() {
  const detected = detectCounsellingUpdateEngine()
  const job = snapshotJob()
  if (job.status === 'idle') {
    return {
      ...job,
      engine: detected.engine,
      engineLabel: detected.engineLabel,
      model: detected.model,
      cloud: detected.cloud,
      message: `Ready to update with ${detected.engineLabel}.`,
    }
  }
  return job
}

function roundsForType(type) {
  if (type === 'medical') return MCC_ROUNDS
  return JOSAA_ROUNDS
}

function localCollegeFill(college) {
  const facts = KNOWN_COLLEGE_FACTS[college.id] ?? {}
  const enriched = enrichCollegeWithCounsellingFill(college, {})
  const branches = {}
  for (const b of enriched.branches ?? []) {
    const placement = isOfficialPlacement(b.placement)
      ? { ...b.placement }
      : emptyUnverifiedPlacement()
    const roundClosing = {}
    for (const y of COUNSELLING_TREND_YEARS) {
      if (b.roundCutoffs?.[y]) roundClosing[y] = { ...b.roundCutoffs[y] }
    }
    branches[b.id] = { placement, roundClosing }
  }
  return {
    website: enriched.website || KNOWN_COLLEGE_WEBSITES[college.id] || college.website,
    city: college.city,
    state: college.state,
    type: college.type,
    typeLabel: TYPE_LABELS[college.type],
    quotas: QUOTAS_BY_TYPE[college.type] ?? [],
    counsellingBody: enriched.counsellingBody,
    feeAnnualLakh: college.feeAnnualLakh,
    hostelFeeLakh: facts.hostelFeeLakh ?? enriched.hostelFeeLakh,
    establishedYear: facts.establishedYear ?? enriched.establishedYear,
    affiliation: facts.affiliation ?? enriched.affiliation,
    placementPageUrl: facts.placementPageUrl ?? enriched.placementPageUrl,
    branches,
  }
}

function buildLocalOverlay(colleges) {
  const map = {}
  for (const c of colleges) {
    map[c.id] = localCollegeFill(c)
  }
  return {
    filledAt: Date.now(),
    source: 'local-seed',
    hint: GEMINI_FILL_HINT,
    colleges: map,
  }
}

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

async function geminiJson(system, userText) {
  const { geminiKey, geminiTextModel } = getVisionEnv()
  if (!geminiKey) {
    const err = new Error('GEMINI_API_KEY missing in onlinetest/.env')
    err.code = 'NO_KEY'
    throw err
  }
  const model = geminiTextModel || 'gemini-3.5-flash-lite'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiKey)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `${system}\n\n${userText}` }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    }),
    signal: AbortSignal.timeout(45_000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data?.error?.message || `Gemini HTTP ${res.status}`
    const err = new Error(msg)
    err.status = res.status
    throw err
  }
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('\n') ?? ''
  const parsed = extractJsonObject(text)
  if (!parsed) {
    throw new Error('Gemini returned no JSON object')
  }
  return parsed
}

async function openaiJson(system, userText) {
  const { openaiKey, openaiModel } = getVisionEnv()
  if (!openaiKey) {
    const err = new Error('OPENAI_API_KEY missing in onlinetest/.env')
    err.code = 'NO_KEY'
    throw err
  }
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: openaiModel || 'gpt-4o',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userText },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data?.error?.message || `OpenAI HTTP ${res.status}`
    const err = new Error(msg)
    err.status = res.status
    throw err
  }
  const text = data?.choices?.[0]?.message?.content ?? ''
  const parsed = extractJsonObject(text)
  if (!parsed) {
    throw new Error('OpenAI returned no JSON object')
  }
  return parsed
}

function cloudJson(engine, system, userText) {
  if (engine === 'openai') return openaiJson(system, userText)
  return geminiJson(system, userText)
}

function sourcedPlacement(p) {
  const url = String(p?.sourceUrl ?? '')
  const hasNum = ['pctPlaced', 'avgLpa', 'medianLpa', 'lowestLpa', 'highestLpa', 'highestDomesticLpa'].some(
    (f) => p?.[f] != null && Number.isFinite(Number(p[f])),
  )
  if (!p || !/^https:\/\//i.test(url) || !hasNum) return false
  if (/vertexaisearch|grounding-api-redirect|shiksha|collegedunia|careers360/i.test(url)) return false
  if (/\.(jpg|jpeg|png|gif|webp|svg)(\?|#|$)/i.test(url)) return false
  if (/^2026/.test(String(p.sourceYear ?? ''))) return false
  return true
}

function mergeBranchFill(base, extra) {
  if (!extra) return base
  let placement = base.placement
  if (extra.placement) {
    const incoming = extra.placement
    const keepOfficial = isOfficialPlacement(base.placement) && !isOfficialPlacement(incoming)
    if (keepOfficial) {
      placement = base.placement
    } else if (incoming.placementSource === 'unverified') {
      placement = emptyUnverifiedPlacement()
    } else if (sourcedPlacement(incoming) || isOfficialPlacement(incoming)) {
      placement = {
        ...(base.placement ?? {}),
        ...incoming,
        indicative: incoming.placementSource !== 'official',
        placementSource: incoming.placementSource === 'official' ? 'official' : 'indicative',
        sourceNote: incoming.sourceNote ?? PLACEMENT_PACKAGE_NOTE,
        sourceUrl: incoming.sourceUrl,
        sourceYear: incoming.sourceYear ?? null,
        highestLpa: incoming.highestLpa ?? incoming.highestDomesticLpa ?? base.placement?.highestLpa,
        highestDomesticLpa:
          incoming.highestDomesticLpa ?? incoming.highestLpa ?? base.placement?.highestDomesticLpa,
      }
    } else {
      placement = base.placement ?? emptyUnverifiedPlacement()
    }
  }
  const roundClosing = { ...(base.roundClosing ?? {}) }
  const incoming = extra.roundClosing ?? extra.roundCutoffs ?? extra.rounds
  if (incoming && typeof incoming === 'object' && !Array.isArray(incoming)) {
    for (const [year, rounds] of Object.entries(incoming)) {
      if (!rounds || typeof rounds !== 'object') continue
      roundClosing[year] = { ...(roundClosing[year] ?? {}), ...rounds }
    }
  }
  if (Array.isArray(incoming)) {
    for (const row of incoming) {
      const year = String(row.year ?? '')
      const round = String(row.round ?? row.id ?? '')
      const closing = Number(row.closingRank ?? row.closing)
      if (!year || !round || !Number.isFinite(closing)) continue
      if (!roundClosing[year]) roundClosing[year] = {}
      roundClosing[year][round] = Math.round(closing)
    }
  }
  return { ...base, placement, roundClosing }
}

function applyGeminiCollege(local, gem) {
  if (!gem || typeof gem !== 'object') return local
  const branches = { ...(local.branches ?? {}) }
  const gemBranches = gem.branches
  if (Array.isArray(gemBranches)) {
    for (const b of gemBranches) {
      const id = String(b.id ?? b.branchId ?? '').toLowerCase()
      if (!id) continue
      branches[id] = mergeBranchFill(branches[id] ?? {}, b)
    }
  } else if (gemBranches && typeof gemBranches === 'object') {
    for (const [id, b] of Object.entries(gemBranches)) {
      branches[id] = mergeBranchFill(branches[id] ?? {}, b)
    }
  }
  return {
    ...local,
    website: gem.website || local.website,
    city: gem.city || local.city,
    state: gem.state || local.state,
    typeLabel: gem.typeLabel || local.typeLabel,
    quotas: Array.isArray(gem.quotas) && gem.quotas.length ? gem.quotas : local.quotas,
    counsellingBody: gem.counsellingBody || local.counsellingBody,
    feeAnnualLakh: gem.feeAnnualLakh ?? local.feeAnnualLakh,
    hostelFeeLakh: gem.hostelFeeLakh ?? local.hostelFeeLakh,
    establishedYear: gem.establishedYear ?? local.establishedYear,
    affiliation: gem.affiliation ?? local.affiliation,
    placementPageUrl: gem.placementPageUrl || local.placementPageUrl,
    placement: gem.placement || local.placement,
    branches,
  }
}

const CLOUD_SYSTEM = `You fill structured Indian counselling DATA for JEE/NEET college predictors.
Return ONLY JSON. Do not invent a live NTA/JoSAA API.
Rules:
- Keep r1 closing rank BETTER (smaller number) than r2 ... r6. CSAB rounds close worse than JoSAA r6.
- Years allowed: 2024, 2025, 2026 only. Rank/percentile TREND is latest TWO years only.
- Placement is STRICT: only pctPlaced / avgLpa / medianLpa / lowestLpa / highestLpa copied from a published official institute T&P report or NIRF graduate-outcome table. Include sourceUrl (https) and sourceYear. NEVER estimate, round to a "typical" package, interpolate CSE vs ME, or invent.
- If a placement field is not published, set it null and placementSource "unverified". Do not fill a guess.
- Medical UG (MBBS/BDS) has no engineering-style campus package -- return unverified nulls unless an official placement report exists.
- Do not overwrite an existing placementSource "official" row with a guess.
- website must be an https URL for that institute.
- Also fill establishedYear, hostelFeeLakh, affiliation, placementPageUrl when known.
- Label numbers Indicative unless they are copied from a published official source.`

async function cloudEnrich(overlay, colleges, persist, opts) {
  const engine = opts.engine
  const engineLabel = opts.engineLabel
  const resume = opts.resume !== false
  const LIMIT = Number(opts.limit) || 0
  const persistEachBatch = opts.persistEachBatch === true

  let work = [...colleges]
  if (resume) {
    work = work.filter((c) => !overlay.colleges[c.id]?.geminiFilledAt)
  }
  if (LIMIT) work = work.slice(0, LIMIT)

  const batches = []
  for (let i = 0; i < work.length; i += BATCH) {
    batches.push(work.slice(i, i + BATCH))
  }

  let filled = 0
  let stopped = null
  if (!batches.length) {
    return { filled, stopped, remaining: 0, skipped: true }
  }

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    currentJob = {
      ...currentJob,
      batch: { index: i + 1, total: batches.length },
      message: runningMessage(engineLabel, { index: i + 1, total: batches.length }),
    }
    const payload = batch.map((c) => {
      const local = overlay.colleges[c.id]
      const roundHint = roundsForType(c.type).map((r) => r.id)
      return {
        id: c.id,
        name: c.name,
        shortName: c.shortName,
        type: c.type,
        city: c.city,
        state: c.state,
        exams: c.exams,
        website: local?.website,
        feeAnnualLakh: c.feeAnnualLakh,
        branches: (c.branches ?? []).map((b) => ({
          id: b.id,
          name: b.name,
          cutoffs: b.cutoffs,
          placement: local?.branches?.[b.id]?.placement ?? null,
          roundIds: roundHint,
        })),
      }
    })
    const userText =
      'Fill missing college facts and round-wise closing ranks for last 2-3 years.\n' +
      'Placement: ONLY published official T&P / NIRF numbers with sourceUrl + sourceYear. If unpublished, placementSource="unverified" and all package fields null. Do not invent typical packages.\n' +
      'Rank/percentile trend uses the latest TWO years only. Label Indicative.\n' +
      'Return JSON: { "colleges": [ { "id", "website", "city", "state", "quotas", "establishedYear", "feeAnnualLakh", "hostelFeeLakh", "placementPageUrl", "affiliation", "branches": [ { "id", "placement": { "pctPlaced", "avgLpa", "medianLpa", "lowestLpa", "highestLpa", "sourceUrl", "sourceYear", "placementSource" }, "roundClosing": { "2024": { "r1": number, "r2": number }, "2025": {}, "2026": {} } } ] } ] } }\n\n' +
      'Input colleges:\n' +
      JSON.stringify(payload)

    try {
      const parsed = await cloudJson(engine, CLOUD_SYSTEM, userText)
      const list = Array.isArray(parsed?.colleges) ? parsed.colleges : Array.isArray(parsed) ? parsed : []
      for (const gem of list) {
        const id = gem?.id
        if (!id || !overlay.colleges[id]) continue
        overlay.colleges[id] = applyGeminiCollege(overlay.colleges[id], gem)
        overlay.colleges[id].geminiFilledAt = Date.now()
        filled++
      }
      overlay.source = filled ? engine : overlay.source
      overlay.filledAt = Date.now()
      if (persistEachBatch) persist(overlay)
      if (i < batches.length - 1) await new Promise((r) => setTimeout(r, GAP_MS))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      stopped = msg
      if (/spend cap|RESOURCE_EXHAUSTED|quota|429/i.test(msg)) break
    }
  }
  return { filled, stopped, remaining: work.length - filled, skipped: false }
}

function serializeFill(overlay) {
  return `/**
 * Persisted counselling fill (Gemini and/or local seed).
 * Refresh: Career Compass admin tab "Update data", or node scripts/fill-counselling-data.mjs
 * Runtime prediction does NOT call Gemini.
 */
export const COUNSELLING_FILL = ${JSON.stringify(overlay, null, 2)}

export default COUNSELLING_FILL
`
}

function persistOverlay(overlay) {
  writeUtf8RepairUtf16(outFile, serializeFill(overlay))
  lastWrittenOverlay = overlay
}

function previousOverlay() {
  return lastWrittenOverlay ?? PREVIOUS_FILL
}

function mergePrevious(overlay) {
  const prev = previousOverlay()
  if (!prev?.colleges || !Object.keys(prev.colleges).length) return overlay
  for (const [id, row] of Object.entries(prev.colleges)) {
    if (!overlay.colleges[id]) {
      overlay.colleges[id] = row
      continue
    }
    overlay.colleges[id] = applyGeminiCollege(overlay.colleges[id], row)
    if (row.geminiFilledAt) overlay.colleges[id].geminiFilledAt = row.geminiFilledAt
  }
  return overlay
}

/**
 * Run a fill. Always writes a local overlay first. Cloud AI runs when a key is present
 * unless localOnly is set.
 */
export async function runCounsellingFillUpdate(opts = {}) {
  const detected = detectCounsellingUpdateEngine()
  const localOnly = opts.localOnly === true || !detected.cloud
  const engine = localOnly ? 'local' : detected.engine
  const engineLabel = localOnly ? 'local AI' : detected.engineLabel
  const startedAt = Date.now()

  currentJob = {
    ...idleJob(),
    status: 'running',
    engine,
    engineLabel,
    model: localOnly ? null : detected.model,
    cloud: !localOnly,
    message: runningMessage(engineLabel),
    startedAt,
    finishedAt: null,
    error: null,
    batch: null,
  }

  await fs.mkdir(path.dirname(outFile), { recursive: true })
  const overlay = mergePrevious(buildLocalOverlay(CAREER_COMPASS_BASELINE))
  overlay.filledAt = Date.now()
  overlay.source = localOnly ? 'local-seed' : overlay.source

  let cloudNote = ''
  if (localOnly) {
    overlay.source = 'local-seed'
    cloudNote = detected.cloud
      ? 'Local compiled seed only (--local-only).'
      : 'No cloud AI key -- used local AI (same predictor tables).'
  } else {
    persistOverlay(overlay)
    const { filled, stopped, skipped } = await cloudEnrich(overlay, CAREER_COMPASS_BASELINE, persistOverlay, {
      engine,
      engineLabel,
      resume: opts.resume !== false,
      limit: opts.limit,
      persistEachBatch: opts.persistEachBatch === true,
    })
    if (filled > 0) {
      overlay.source = engine
      overlay.filledAt = Date.now()
      cloudNote = stopped
        ? `${engineLabel} filled ${filled} colleges then stopped (${stopped.includes('spend') || stopped.includes('quota') ? 'usage limit' : 'error'}). Kept what was saved.`
        : `${engineLabel} filled/merged ${filled} college rows.`
    } else {
      const prev = previousOverlay()
      overlay.source = prev?.source === 'gemini' || prev?.source === 'openai' ? prev.source : engine
      overlay.filledAt = prev?.filledAt || overlay.filledAt
      if (skipped) {
        cloudNote = `${engineLabel} key found. Kept last published placements (unknown stays Not available).`
      } else {
        const short = stopped
          ? /spend cap|RESOURCE_EXHAUSTED|quota|429/i.test(stopped)
            ? `${engineLabel} hit a usage limit.`
            : /API_KEY missing/i.test(stopped)
              ? `${engineLabel} key not found in .env.`
              : `${engineLabel} could not run.`
          : `${engineLabel} did not return new rows.`
        cloudNote = `${short} Showing last compiled tables. ${GEMINI_FILL_HINT}`
      }
    }
  }

  overlay.hint = `${cloudNote} Indicative counselling data - not official NTA live results. ${GEMINI_FILL_HINT}`
  persistOverlay(overlay)

  const nColleges = Object.keys(overlay.colleges).length
  const nCloud = Object.values(overlay.colleges).filter((c) => c.geminiFilledAt).length
  currentJob = {
    ...currentJob,
    status: 'done',
    engine,
    engineLabel,
    model: localOnly ? null : detected.model,
    cloud: !localOnly,
    message: doneMessage(engineLabel, cloudNote),
    finishedAt: Date.now(),
    collegeCount: nColleges,
    cloudFilled: nCloud,
    source: overlay.source,
    hint: overlay.hint,
    error: null,
    batch: null,
  }
  return snapshotJob()
}

/**
 * Start a fill without blocking the HTTP response. If a job is already running, return it.
 */
export function startCounsellingFillUpdate(opts = {}) {
  if (runPromise) {
    return { alreadyRunning: true, started: false, ...snapshotJob() }
  }
  runPromise = runCounsellingFillUpdate({
    ...opts,
    persistEachBatch: false,
  })
    .catch((err) => {
      currentJob = {
        ...currentJob,
        status: 'failed',
        message: `Update failed: ${err instanceof Error ? err.message : String(err)}`,
        error: err instanceof Error ? err.message : String(err),
        finishedAt: Date.now(),
        batch: null,
      }
      return snapshotJob()
    })
    .finally(() => {
      runPromise = null
    })
  return { alreadyRunning: false, started: true, ...snapshotJob() }
}

