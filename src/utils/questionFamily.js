import {
  parseSimilarVariantIndex as parseFounderSimilarIndex,
  similarId,
  stripSimilarSuffix,
} from './questionId.js'

/**
 * Question / paper family IDs for similar variants and replica PYQ papers.
 */

export const SIMILAR_VARIANT_SUFFIX_RE = /C(\d+)$/

export function stripSimilarVariantSuffix(id) {
  return stripSimilarSuffix(id)
}

export function parseSimilarVariantIndex(id) {
  return parseFounderSimilarIndex(id)
}

export function questionFamilyId(q) {
  if (!q) return ''
  const explicit = String(q.parentQuestionId ?? q.similarToId ?? q.seedPyqId ?? '').trim()
  if (explicit) return stripSimilarVariantSuffix(explicit)
  const id = String(q.id ?? '').trim()
  if (parseSimilarVariantIndex(id) != null) return stripSimilarVariantSuffix(id)
  return id
}

export function areSameQuestionFamily(a, b) {
  const fa = questionFamilyId(a)
  const fb = questionFamilyId(b)
  if (!fa || !fb) return String(a?.id ?? '') === String(b?.id ?? '')
  return fa === fb
}

export function nextSimilarVariantSuffix(parentId, existingIds) {
  const parent = stripSimilarVariantSuffix(parentId)
  const used = new Set()
  for (const raw of existingIds) {
    const id = String(raw ?? '').trim()
    if (stripSimilarVariantSuffix(id) !== parent) continue
    const idx = parseSimilarVariantIndex(id)
    if (idx != null) used.add(idx)
  }
  let n = 1
  while (used.has(n)) n += 1
  return `C${n}`
}

/**
 * Similar / clone id from an already approved parent: `{parent}C{n}`.
 * AI parents look like MAM00001I, so the child is MAM00001IC1. Does not reuse C numbers.
 * @param {string} parentApprovedId
 * @param {number | null | undefined} variantIndex
 * @param {Array<string | { id?: string }>} [existingIds]
 */
export function assignAiSimilarChildId(parentApprovedId, variantIndex, existingIds = []) {
  return assignSimilarQuestionId(parentApprovedId, variantIndex, existingIds)
}

export function assignSimilarQuestionId(parentId, variantIndex, existingIds = []) {
  const parent = stripSimilarVariantSuffix(parentId)
  const taken = new Set(
    [...existingIds]
      .map((row) => String(typeof row === 'string' ? row : row?.id ?? '').trim())
      .filter(Boolean),
  )
  if (variantIndex != null && variantIndex >= 1) {
    let n = variantIndex
    let candidate = similarId(parent, n)
    while (taken.has(candidate)) {
      n += 1
      candidate = similarId(parent, n)
    }
    return candidate
  }
  return similarId(parent, Number(nextSimilarVariantSuffix(parent, taken).slice(1)))
}

export function paperFamilyId(q) {
  if (!q) return ''
  const derived = String(q.derivedFromPaperId ?? q.parentPaperId ?? '').trim()
  if (derived) return derived
  const pid = String(q.paperId ?? '').trim()
  if (!pid) return ''
  if (/-similar-\d+$/i.test(pid)) return pid.replace(/-similar-\d+$/i, '')
  return pid
}

export function areSamePaperFamily(a, b) {
  const fa = paperFamilyId(a)
  const fb = paperFamilyId(b)
  if (!fa || !fb) return String(a?.paperId ?? '') === String(b?.paperId ?? '')
  return fa === fb
}

export function isQuestionFamilyBlocked(usedFamilyIds, q) {
  const fam = questionFamilyId(q)
  return fam ? usedFamilyIds.has(fam) : usedFamilyIds.has(String(q.id ?? ''))
}

export function markQuestionFamilyUsed(usedFamilyIds, q) {
  const fam = questionFamilyId(q)
  usedFamilyIds.add(fam || String(q.id ?? ''))
}

export function filterCandidatesExcludingFamilies(candidates, usedFamilyIds) {
  return candidates.filter((q) => !isQuestionFamilyBlocked(usedFamilyIds, q))
}

/** Replica sitting (Similar1 papers), not a single-question similar. */
export function isReplicaFamilyQuestion(q) {
  if (!q) return false
  if (q.aiReplicaPaper === true) return true
  if (q.parentPaperId || q.derivedFromPaperId) return true
  return /-similar-\d+$/i.test(String(q.paperId ?? ''))
}

/**
 * original | similar | replica — for bank parent/child filters.
 * Replica papers also have C1 IDs; replica wins over similar.
 */
export function questionFamilyKind(q) {
  if (!q) return 'original'
  if (isReplicaFamilyQuestion(q)) return 'replica'
  const id = String(q.id ?? '').trim()
  if (parseSimilarVariantIndex(id) != null) return 'similar'
  if (String(q.parentQuestionId ?? q.similarToId ?? q.seedPyqId ?? '').trim()) return 'similar'
  if (q.similarToPyq === true) return 'similar'
  return 'original'
}

export function questionFamilyBadge(q) {
  const kind = questionFamilyKind(q)
  const idx = parseSimilarVariantIndex(q?.id)
  if (kind === 'replica') {
    return { kind, label: idx ? `Replica C${idx}` : 'Replica paper' }
  }
  if (kind === 'similar') {
    return { kind, label: idx ? `Similar C${idx}` : 'Similar' }
  }
  return { kind: 'original', label: 'Original' }
}

/**
 * Two selected items belong to the same family (original + C1, or two C variants).
 * @param {unknown[]} selected
 */
/**
 * Parent / child classified IDs (e.g. MBS20002 vs MBS20002C1).
 * @param {unknown} q
 */
export function isChildQuestion(q) {
  if (!q) return false
  if (q.is_child === true || q.isChild === true) return true
  const parentRef = String(q.parent_id ?? q.parentId ?? q.parentQuestionId ?? '').trim()
  if (parentRef) return true
  const id = typeof q === 'string' ? q : String(q.id ?? '').trim()
  return parseSimilarVariantIndex(id) != null
}

/** @param {unknown} q */
export function parentKeyForQuestion(q) {
  if (!q) return ''
  if (typeof q === 'string') {
    const id = q.trim()
    if (parseSimilarVariantIndex(id) != null) return stripSimilarVariantSuffix(id)
    return id
  }
  const parentRef = String(q.parent_id ?? q.parentId ?? q.parentQuestionId ?? '').trim()
  if (parentRef) return stripSimilarVariantSuffix(parentRef)
  const id = String(q.id ?? '').trim()
  if (parseSimilarVariantIndex(id) != null) return stripSimilarVariantSuffix(id)
  return id
}

/**
 * Drop parent+child pairs from a selection. Parent row wins when both appear.
 * @param {unknown[]} selectedQuestions
 */
export function enforce_parent_child_exclusion(selectedQuestions) {
  const list = Array.isArray(selectedQuestions) ? selectedQuestions : []
  if (!list.length) return []

  /** @type {Set<string>} */
  const familiesWithParent = new Set()
  /** @type {Set<string>} */
  const familiesWithChild = new Set()

  for (const q of list) {
    const pid = parentKeyForQuestion(q)
    if (!pid) continue
    if (isChildQuestion(q)) familiesWithChild.add(pid)
    else familiesWithParent.add(pid)
  }

  /** @type {unknown[]} */
  const out = []
  for (const q of list) {
    const pid = parentKeyForQuestion(q)
    if (!pid) {
      out.push(q)
      continue
    }
    if (isChildQuestion(q)) {
      if (familiesWithParent.has(pid)) continue
    } else if (familiesWithChild.has(pid) && !familiesWithParent.has(pid)) {
      continue
    }
    out.push(q)
  }
  return out
}

export const enforceParentChildExclusion = enforce_parent_child_exclusion

export function duplicateFamilyIdsInSelection(selected) {
  /** @type {Map<string, string[]>} */
  const byFam = new Map()
  for (const q of selected ?? []) {
    const fam = questionFamilyId(q)
    if (!fam) continue
    const id = String(q?.id ?? '')
    const list = byFam.get(fam) ?? []
    list.push(id)
    byFam.set(fam, list)
  }
  /** @type {string[]} */
  const clashes = []
  for (const ids of byFam.values()) {
    const unique = [...new Set(ids.filter(Boolean))]
    if (unique.length > 1) clashes.push(unique.join(' + '))
  }
  return clashes
}