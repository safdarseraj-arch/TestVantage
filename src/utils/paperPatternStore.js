import { DEFAULT_PAPER_PATTERNS, validatePaperPattern } from '../data/paperPatterns.js'

const STORAGE_KEY = 'testvantage-paper-patterns'

function loadAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed?.patterns) ? parsed.patterns : null
  } catch {
    return null
  }
}

function saveAll(/** @type {import('../data/paperPatterns').PaperPattern[]} */ patterns) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ patterns, updatedAt: Date.now() }))
}

function seedIfEmpty() {
  const existing = loadAll()
  if (existing?.length) return existing
  saveAll([...DEFAULT_PAPER_PATTERNS])
  return [...DEFAULT_PAPER_PATTERNS]
}

/** @returns {import('../data/paperPatterns').PaperPattern[]} */
export function listPaperPatterns(/** @type {string} [baseExamPatternId] */ baseExamPatternId) {
  const all = seedIfEmpty()
  if (!baseExamPatternId) return all
  return all.filter((p) => p.baseExamPatternId === baseExamPatternId)
}

/** @param {string} id */
export function getPaperPattern(id) {
  if (!id) return null
  return seedIfEmpty().find((p) => p.id === id) ?? null
}

/** @param {import('../data/paperPatterns').PaperPattern} pattern */
export function upsertPaperPattern(pattern) {
  const check = validatePaperPattern(pattern)
  if (!check.ok) return check

  const all = seedIfEmpty()
  const idx = all.findIndex((p) => p.id === pattern.id)
  const next = { ...pattern, isBuiltIn: pattern.isBuiltIn ?? false }
  if (idx >= 0) all[idx] = next
  else all.push(next)
  saveAll(all)
  return { ok: true, pattern: next }
}

/** @param {string} id */
export function deletePaperPattern(id) {
  const all = seedIfEmpty()
  const target = all.find((p) => p.id === id)
  if (!target) return { ok: false, error: 'Pattern not found.' }
  if (target.isBuiltIn) {
    return { ok: false, error: 'Built-in templates cannot be deleted. Clone and edit instead.' }
  }
  saveAll(all.filter((p) => p.id !== id))
  return { ok: true }
}

/** @param {string} id */
export function clonePaperPattern(id) {
  const src = getPaperPattern(id)
  if (!src) return { ok: false, error: 'Pattern not found.' }
  const copy = {
    ...src,
    id: `${src.id}-copy-${Date.now()}`,
    name: `${src.name} (copy)`,
    isBuiltIn: false,
    slots: src.slots.map((s) => ({ ...s, marking: { ...s.marking } })),
  }
  return upsertPaperPattern(copy)
}

export function resetPaperPatternsToDefaults() {
  saveAll([...DEFAULT_PAPER_PATTERNS])
  return { ok: true }
}
