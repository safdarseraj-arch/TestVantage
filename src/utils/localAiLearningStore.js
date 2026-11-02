/**
 * Local AI learning from successful Cloud vision (Gemini) extracts.
 * Privacy: stays on this browser/machine only — never sent back to Google.
 *
 * Not a neural fine-tune — a pattern library of OCR → corrected LaTeX pairs
 * plus few-shot examples used when local OCR is weak.
 */

const STORAGE_KEY = 'testvantage-local-ai-learning-v1'
const SETTINGS_KEY = 'testvantage-local-ai-learning-settings'
const MAX_EXAMPLES = 80
const MAX_CORRECTIONS = 120

/**
 * @typedef {{
 *   id: string
 *   savedAt: number
 *   imageFingerprint?: string
 *   localOcrRaw?: string
 *   cloudStem?: string
 *   cloudOptions?: string[]
 *   cloudAnswer?: string
 *   cloudSolution?: string
 *   subject?: string
 *   section?: string
 *   chapter?: string
 *   topic?: string
 *   examIds?: string[]
 *   userEdited?: boolean
 *   provider?: string
 * }} LocalAiLearningExample
 *
 * @typedef {{ from: string, to: string, hits: number, lastAt: number }} LocalAiCorrection
 *
 * @typedef {{
 *   examples: LocalAiLearningExample[]
 *   corrections: LocalAiCorrection[]
 * }} LocalAiLearningStore
 */

/** @returns {{ enabled: boolean }} */
export function loadLocalAiLearningSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { enabled: true }
    const parsed = JSON.parse(raw)
    return { enabled: parsed.enabled !== false }
  } catch {
    return { enabled: true }
  }
}

/** @param {{ enabled?: boolean }} partial */
export function saveLocalAiLearningSettings(partial) {
  const next = { ...loadLocalAiLearningSettings(), ...partial }
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
  return next
}

/** @returns {LocalAiLearningStore} */
export function loadLocalAiLearningStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { examples: [], corrections: [] }
    const parsed = JSON.parse(raw)
    return {
      examples: Array.isArray(parsed.examples) ? parsed.examples.slice(0, MAX_EXAMPLES) : [],
      corrections: Array.isArray(parsed.corrections)
        ? parsed.corrections.slice(0, MAX_CORRECTIONS)
        : [],
    }
  } catch {
    return { examples: [], corrections: [] }
  }
}

/** @param {LocalAiLearningStore} store */
function persistStore(store) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      examples: (store.examples ?? []).slice(0, MAX_EXAMPLES),
      corrections: (store.corrections ?? []).slice(0, MAX_CORRECTIONS),
    }),
  )
}

/**
 * Short fingerprint from image bytes or data-URL (no full image stored).
 * @param {string | ArrayBuffer | Uint8Array | null | undefined} input
 */
export function fingerprintImageInput(input) {
  if (input == null) return ''
  let bytes
  if (typeof input === 'string') {
    const s = input.slice(0, 8000)
    let h = 2166136261
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    return `s${(h >>> 0).toString(16)}:${s.length}`
  }
  if (input instanceof ArrayBuffer) bytes = new Uint8Array(input)
  else if (ArrayBuffer.isView(input)) bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
  else return ''
  const step = Math.max(1, Math.floor(bytes.length / 256))
  let h = 2166136261
  for (let i = 0; i < bytes.length; i += step) {
    h ^= bytes[i]
    h = Math.imul(h, 16777619)
  }
  return `b${(h >>> 0).toString(16)}:${bytes.length}`
}

/**
 * Derive simple OCR→fix phrase pairs from local raw vs cloud stem.
 * @param {string} localRaw
 * @param {string} cloudStem
 * @returns {{ from: string, to: string }[]}
 */
export function deriveOcrCorrectionPairs(localRaw, cloudStem) {
  const local = String(localRaw ?? '').trim()
  const cloud = String(cloudStem ?? '').trim()
  if (!local || !cloud || local.length < 8 || cloud.length < 8) return []

  /** @type {{ from: string, to: string }[]} */
  const pairs = []

  // Known Gemini-quality patterns local OCR often mangles
  const canned = [
    { bad: /≠\s*\^\s*0|!=\s*\^\s*0|#O\b|≠\^0/gi, good: '\\neq 0' },
    { bad: /\\neq\s*\^\s*\{?0\}?/gi, good: '\\neq 0' },
    { bad: /x\s*#\s*O/gi, good: 'x \\neq 0' },
    { bad: /y\s*#\s*O/gi, good: 'y \\neq 0' },
    { bad: /z\s*#\s*O/gi, good: 'z \\neq 0' },
  ]
  for (const { bad, good } of canned) {
    if (bad.test(local) && cloud.includes(good.replace(/\\\\/g, '\\'))) {
      // reset lastIndex
      bad.lastIndex = 0
      const m = local.match(bad)
      if (m?.[0] && m[0] !== good) pairs.push({ from: m[0], to: good })
    }
  }

  // Variable matrix cells present in cloud but digits-only in local
  if (/1\+x|1\+2y|1\+3z/i.test(cloud) && /1\+x|1\+2y|1\+3z/i.test(local) === false) {
    const cells = cloud.match(/1\+[xyz]|1\+\d+[xyz]/gi) ?? []
    for (const cell of cells.slice(0, 6)) {
      // can't invent a from-token without local evidence — skip
      void cell
    }
  }

  // Shared substrings of length 12–48 that differ only by OCR noise near them
  const cloudFrags = cloud.match(/\\begin\{vmatrix\}[\s\S]{10,220}?\\end\{vmatrix\}/gi) ?? []
  const localFrags = local.match(/\|[^|]{8,120}\|/g) ?? []
  if (cloudFrags[0] && localFrags[0] && localFrags[0].length < cloudFrags[0].length) {
    pairs.push({ from: localFrags[0].slice(0, 80), to: cloudFrags[0].slice(0, 200) })
  }

  return pairs
    .filter((p) => p.from && p.to && p.from !== p.to && p.from.length >= 2 && p.from.length <= 120)
    .slice(0, 8)
}

/**
 * Record a successful Cloud vision example (+ optional user corrections on save).
 * @param {{
 *   imageFingerprint?: string
 *   localOcrRaw?: string
 *   cloudStem?: string
 *   cloudOptions?: string[]
 *   cloudAnswer?: string
 *   cloudSolution?: string
 *   subject?: string
 *   section?: string
 *   chapter?: string
 *   topic?: string
 *   examIds?: string[]
 *   userEdited?: boolean
 *   provider?: string
 * }} example
 */
export function recordLocalAiLearningExample(example) {
  if (!example?.cloudStem?.trim() && !example?.cloudOptions?.some(Boolean)) return null
  const store = loadLocalAiLearningStore()
  const id = `lai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  /** @type {LocalAiLearningExample} */
  const row = {
    id,
    savedAt: Date.now(),
    imageFingerprint: example.imageFingerprint || undefined,
    localOcrRaw: example.localOcrRaw ? String(example.localOcrRaw).slice(0, 4000) : undefined,
    cloudStem: example.cloudStem ? String(example.cloudStem).slice(0, 4000) : undefined,
    cloudOptions: (example.cloudOptions ?? []).map((o) => String(o ?? '').slice(0, 400)).slice(0, 6),
    cloudAnswer: example.cloudAnswer ? String(example.cloudAnswer).slice(0, 200) : undefined,
    cloudSolution: example.cloudSolution ? String(example.cloudSolution).slice(0, 6000) : undefined,
    subject: example.subject,
    section: example.section,
    chapter: example.chapter,
    topic: example.topic,
    examIds: example.examIds?.slice?.(0, 4),
    userEdited: !!example.userEdited,
    provider: example.provider || 'cloud-vision',
  }

  // Dedupe by fingerprint or near-identical stem
  store.examples = store.examples.filter((e) => {
    if (row.imageFingerprint && e.imageFingerprint === row.imageFingerprint) return false
    if (row.cloudStem && e.cloudStem && e.cloudStem.slice(0, 80) === row.cloudStem.slice(0, 80)) {
      return false
    }
    return true
  })
  store.examples.unshift(row)

  if (row.localOcrRaw && row.cloudStem) {
    for (const pair of deriveOcrCorrectionPairs(row.localOcrRaw, row.cloudStem)) {
      upsertCorrection(store, pair.from, pair.to)
    }
  }

  persistStore(store)
  return row
}

/**
 * @param {LocalAiLearningStore} store
 * @param {string} from
 * @param {string} to
 */
function upsertCorrection(store, from, to) {
  const existing = store.corrections.find((c) => c.from === from && c.to === to)
  if (existing) {
    existing.hits += 1
    existing.lastAt = Date.now()
  } else {
    store.corrections.unshift({ from, to, hits: 1, lastAt: Date.now() })
  }
  store.corrections.sort((a, b) => b.hits - a.hits || b.lastAt - a.lastAt)
  store.corrections = store.corrections.slice(0, MAX_CORRECTIONS)
}

/**
 * Apply learned OCR string replacements (longest / highest-hit first).
 * @param {string} text
 * @param {{ enabled?: boolean }} [opts]
 */
export function applyLocalAiLearnedCorrections(text, opts = {}) {
  const enabled = opts.enabled ?? loadLocalAiLearningSettings().enabled
  if (!enabled || !text?.trim()) return text
  const { corrections } = loadLocalAiLearningStore()
  if (!corrections.length) return text
  let out = text
  const ordered = [...corrections].sort(
    (a, b) => b.from.length - a.from.length || b.hits - a.hits,
  )
  for (const c of ordered.slice(0, 40)) {
    if (!c.from || !c.to || c.from === c.to) continue
    if (c.from.length < 2) continue
    if (out.includes(c.from)) out = out.split(c.from).join(c.to)
  }
  return out
}

/**
 * Find a similar past cloud stem to guide local parse (simple token overlap).
 * @param {string} localText
 * @returns {LocalAiLearningExample | null}
 */
export function findSimilarLocalAiExample(localText) {
  const enabled = loadLocalAiLearningSettings().enabled
  if (!enabled) return null
  const q = tokenize(localText)
  if (q.size < 4) return null
  const { examples } = loadLocalAiLearningStore()
  let best = null
  let bestScore = 0
  for (const ex of examples) {
    const blob = `${ex.cloudStem ?? ''}\n${(ex.cloudOptions ?? []).join(' ')}`
    const t = tokenize(blob)
    let overlap = 0
    for (const w of q) if (t.has(w)) overlap++
    const score = overlap / Math.max(q.size, 1)
    if (score > bestScore) {
      bestScore = score
      best = ex
    }
  }
  return bestScore >= 0.35 ? best : null
}

/** @param {string} s */
function tokenize(s) {
  return new Set(
    String(s ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9+\-\\{}]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2)
      .slice(0, 80),
  )
}

export function getLocalAiLearningStats() {
  const store = loadLocalAiLearningStore()
  const settings = loadLocalAiLearningSettings()
  return {
    enabled: settings.enabled,
    exampleCount: store.examples.length,
    correctionCount: store.corrections.length,
  }
}

/** Clear all learned examples (user privacy / reset). */
export function clearLocalAiLearningStore() {
  localStorage.removeItem(STORAGE_KEY)
}
