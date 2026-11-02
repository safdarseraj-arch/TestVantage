/**
 * Tell the same stored question apart from a new row.
 * Used so publish, delete, and Hybrid sync do not leave a second copy.
 */
import { effectiveBankStatus } from './questionUploadFilter.js'
import { stemsAreSameQuestion, uniqueStemFingerprint } from './detectDuplicateQuestion.js'

const SUPPRESS_KEY = 'testvantage-hybrid-sync-suppress'

function identityIds(q) {
  return [q?.id, q?.aiTempId, q?.hybridPostgresId, q?.postgresId]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
}

/** Same id, old temp id, postgres id, or the exact same stem. */
export function isSameStoredQuestion(a, b) {
  if (!a || !b) return false
  const known = new Set(identityIds(a))
  for (const id of identityIds(b)) {
    if (known.has(id)) return true
  }
  return stemsAreSameQuestion(a.text, b.text)
}

/**
 * Every bank id that is a copy of the seeded rows.
 * @param {import('../data/tests').Question[]} questions
 * @param {Array<string | number>} seedIds
 */
export function collectCopyIds(questions, seedIds) {
  const drop = new Set((seedIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean))
  if (!drop.size) return []
  let grew = true
  while (grew) {
    grew = false
    const targets = (questions ?? []).filter((q) => drop.has(String(q.id)))
    for (const target of targets) {
      for (const row of questions ?? []) {
        const id = String(row?.id ?? '')
        if (!id || drop.has(id)) continue
        if (isSameStoredQuestion(target, row)) {
          drop.add(id)
          grew = true
        }
      }
    }
  }
  return [...drop]
}

/** First bank row that is the same stored question as this sync draft. */
export function findHybridBankMatch(bank, draft) {
  if (!draft) return null
  for (const row of bank ?? []) {
    if (isSameStoredQuestion(row, draft)) return row
  }
  return null
}

/**
 * Update a row sync already has. Never mint a second id.
 * A published row stays published.
 */
export function mergeHybridSyncIntoExisting(existing, draft) {
  const published = effectiveBankStatus(existing) === 'published'
  const tempId = String(draft?.id ?? '').trim()
  /** @type {Record<string, string>} */
  const link = {}
  if (tempId && /^tv-ai-/i.test(tempId)) {
    if (!existing?.aiTempId) link.aiTempId = tempId
    if (!existing?.hybridPostgresId) link.hybridPostgresId = tempId
  } else if (tempId && !existing?.hybridPostgresId) {
    link.hybridPostgresId = tempId
  }
  if (published) {
    return { ...existing, ...link, bankStatus: existing.bankStatus || 'published', id: existing.id }
  }
  return {
    ...existing,
    text: draft?.text || existing?.text,
    options: Array.isArray(draft?.options) && draft.options.length ? draft.options : existing?.options,
    solution: draft?.solution || existing?.solution,
    correctIndex: draft?.correctIndex ?? existing?.correctIndex,
    id: existing.id,
    bankStatus: existing?.bankStatus || 'draft',
    ...link,
    hybridSyncedFromPostgres: true,
  }
}

/**
 * Drafts that already live in the bank are updates. The rest are new inserts.
 * Suppressed (deleted) rows are skipped.
 * @param {import('../data/tests').Question[]} existing
 * @param {import('../data/tests').Question[]} drafts
 */
export function splitHybridSyncDrafts(existing, drafts) {
  /** @type {{ existing: import('../data/tests').Question, draft: import('../data/tests').Question }[]} */
  const toUpdate = []
  /** @type {import('../data/tests').Question[]} */
  const toAdd = []
  for (const draft of drafts ?? []) {
    if (!draft) continue
    if (isSuppressedHybridDraft(draft)) continue
    const match = findHybridBankMatch(existing, draft)
    if (match) toUpdate.push({ existing: match, draft })
    else toAdd.push(draft)
  }
  return { toUpdate, toAdd }
}

function readSuppress() {
  const empty = { ids: new Set(), stems: new Set() }
  if (typeof localStorage === 'undefined') return empty
  try {
    const raw = localStorage.getItem(SUPPRESS_KEY)
    if (!raw) return empty
    const parsed = JSON.parse(raw)
    return {
      ids: new Set(Array.isArray(parsed?.ids) ? parsed.ids.map(String) : []),
      stems: new Set(Array.isArray(parsed?.stems) ? parsed.stems.map(String) : []),
    }
  } catch {
    return empty
  }
}

function writeSuppress(bag) {
  if (typeof localStorage === 'undefined') return
  const ids = [...bag.ids].slice(-2000)
  const stems = [...bag.stems].slice(-2000)
  localStorage.setItem(SUPPRESS_KEY, JSON.stringify({ ids, stems }))
}

/** Remember a deleted question so Hybrid sync does not put it back. */
export function rememberSuppressedHybridQuestion(q) {
  if (!q) return
  const bag = readSuppress()
  for (const id of identityIds(q)) bag.ids.add(id)
  const fp = uniqueStemFingerprint(q.text)
  if (fp) bag.stems.add(fp)
  writeSuppress(bag)
}

/** @param {import('../data/tests').Question} draft */
export function isSuppressedHybridDraft(draft) {
  const bag = readSuppress()
  for (const id of identityIds(draft)) {
    if (bag.ids.has(id)) return true
  }
  const fp = uniqueStemFingerprint(draft?.text)
  return Boolean(fp) && bag.stems.has(fp)
}
