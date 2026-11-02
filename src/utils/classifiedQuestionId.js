import { hierarchyFields } from './bankListFilters.js'
import {
  isFounderQuestionId,
  parseSimilarVariantIndex,
  similarId,
  stripFounderIdSuffixes,
} from './questionId.js'

/** Built-in + legacy subject labels for id prefix letters (matches subjects.js). */
const KNOWN_SUBJECTS = [
  { id: 'mathematics', label: 'Mathematics' },
  { id: 'physics', label: 'Physics' },
  { id: 'chemistry', label: 'Chemistry' },
  { id: 'botany', label: 'Botany' },
  { id: 'zoology', label: 'Zoology' },
  { id: 'biology', label: 'Biology' },
]

/** @type {RegExp} */
export const CLASSIFIED_QUESTION_ID_PATTERN = /^[A-Z]{3}\d{5}$/

/**
 * Approved Hybrid AI parent: Subject/Unit/Chapter letters + 5-digit chapter serial + I.
 * Example: Mathematics, Algebra, Matrices → MAM00001I.
 * @type {RegExp}
 */
export const AI_PARENT_ID_PATTERN = /^[A-Z]{3}\d{5}I$/

/** Approved AI parent, or a similar child of that parent (MAM00001IC1). */
export const AI_FAMILY_ID_PATTERN = /^[A-Z]{3}\d{5}I(?:C\d+)?$/

/**
 * First A–Z letter from a curriculum label (skips "Unit 3 - " style prefixes).
 * @param {string} name
 */
export function firstMetaLetter(name) {
  const cleaned = String(name ?? '')
    .replace(/^unit\s+\d+\s*[-–:.]\s*/i, '')
    .replace(/^chapter\s+\d+\s*[-–:.]\s*/i, '')
    .trim()
  const m = cleaned.match(/[A-Za-z]/)
  return m ? m[0].toUpperCase() : 'X'
}

/**
 * @param {string} subjectId
 */
export function resolveSubjectLabel(subjectId) {
  const id = String(subjectId ?? '').trim()
  if (!id) return ''
  const known = KNOWN_SUBJECTS.find((s) => s.id === id)
  if (known) return known.label
  return id.replace(/[-_]/g, ' ')
}

/**
 * Three-letter prefix: Subject + Unit + Chapter first letters (e.g. MAQ).
 * @param {import('../data/tests').Question} q
 */
export function classifiedIdPrefix(q) {
  const h = hierarchyFields(q)
  return (
    firstMetaLetter(resolveSubjectLabel(q?.subject)) +
    firstMetaLetter(h.section) +
    firstMetaLetter(h.chapter)
  )
}

/**
 * Stable bucket for sequential numbering within one chapter.
 * @param {import('../data/tests').Question} q
 */
export function chapterBucketKey(q) {
  const h = hierarchyFields(q)
  return [String(q?.subject ?? '').trim(), h.section, h.chapter]
    .map((s) => String(s ?? '').trim().toLowerCase())
    .join('\0')
}

/** Classified rows with Subject + Unit + Chapter can receive a structured id. */
export function canAssignClassifiedId(q) {
  const h = hierarchyFields(q)
  return !!(String(q?.subject ?? '').trim() && h.section && h.chapter)
}

/** @param {string} id */
export function isClassifiedQuestionId(id) {
  return CLASSIFIED_QUESTION_ID_PATTERN.test(String(id ?? ''))
}

/** @param {string} id */
export function isAiParentQuestionId(id) {
  return AI_PARENT_ID_PATTERN.test(String(id ?? '').trim())
}

/** @param {string} id */
export function isAiFamilyQuestionId(id) {
  return AI_FAMILY_ID_PATTERN.test(String(id ?? '').trim())
}

/** @param {string} value */
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Draft ids minted before approval. Final AI ids replace these on publish. */
export function isTemporaryQuestionId(id) {
  const s = String(id ?? '').trim()
  if (!s) return true
  if (/^(uq-|tv-ai-|opyq-)/i.test(s)) return true
  return false
}

/** @param {import('../data/tests').Question} q */
function subBankOf(q) {
  return String(q?.sub_bank_type ?? q?.subBankType ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
}

/** @param {import('../data/tests').Question} q */
function parentRefOf(q) {
  return String(
    q?.parentQuestionId ?? q?.similarToId ?? q?.seedPyqId ?? q?.parent_id ?? q?.parentId ?? '',
  ).trim()
}

/** Official PYQ rows keep founder ids (MAQ00001A2024). */
export function isOfficialPyqQuestion(q) {
  if (!q) return false
  if (q.officialPyq === true) return true
  if (subBankOf(q) === 'pyq') return true
  const bank = String(q.bankSource ?? '').trim()
  return bank === 'official_pyq' || bank === 'pyq'
}

/** similar_pyq or an explicit similar-to-parent link. */
export function isSimilarAiChild(q) {
  if (!q) return false
  if (subBankOf(q) === 'similar_pyq') return true
  if (q.similarToPyq === true) return true
  if (String(q.bankSource ?? '').trim() === 'ai_similar_pyq') return true
  const parent = parentRefOf(q)
  if (parent && (q.is_child === true || q.isChild === true)) return true
  return false
}

/**
 * Hybrid AI original (sub-bank ai / source Hybrid AI), not a similar child and not Official PYQ.
 * @param {import('../data/tests').Question} q
 */
export function isHybridAiParentQuestion(q) {
  if (!q || isOfficialPyqQuestion(q) || isSimilarAiChild(q)) return false
  if (q.hybridSyncedFromPostgres === true) return true
  if (/^Hybrid AI/i.test(String(q.source ?? '').trim())) return true
  if (/^TV-AI-/i.test(String(q.id ?? '').trim())) return true
  if (String(q.bankSource ?? '').trim() === 'ai_hybrid') return true
  if (subBankOf(q) === 'ai') return true
  return false
}

/** Keep a temp id until approve. An id that is already MAM00001I is not temporary. */
function keepsTemporaryHybridId(q) {
  if (isAiFamilyQuestionId(q?.id)) return false
  if (q?.hybridSyncedFromPostgres === true) return true
  if (isHybridAiParentQuestion(q)) return true
  if (isSimilarAiChild(q) && isTemporaryQuestionId(q?.id)) return true
  return false
}

/**
 * Next 5-digit serial for this chapter prefix.
 * Counts AI ids ending in I (MAM00001I). C-children share that serial — they do not add another number.
 * @param {import('../data/tests').Question[]} allQuestions
 * @param {import('../data/tests').Question} q
 * @param {{ excludeIds?: string[] }} [opts]
 */
export function nextAiChapterSerial(allQuestions, q, { excludeIds = [] } = {}) {
  const prefix = classifiedIdPrefix(q)
  const exclude = new Set((excludeIds ?? []).map(String))
  const re = new RegExp(`^${escapeRegExp(prefix)}(\\d{5})I(?:C\\d+)?$`)
  let max = 0
  for (const row of allQuestions ?? []) {
    const id = String(row?.id ?? '').trim()
    if (!id || exclude.has(id)) continue
    const match = id.match(re)
    if (!match) continue
    const seq = parseInt(match[1], 10)
    if (Number.isFinite(seq)) max = Math.max(max, seq)
  }
  return max + 1
}

/**
 * @param {string} prefix
 * @param {number} serial
 */
export function formatAiParentId(prefix, serial) {
  const n = Math.max(1, Math.min(99999, Math.trunc(Number(serial) || 1)))
  return `${prefix}${String(n).padStart(5, '0')}I`
}

/**
 * Next unused C number for a parent id (C1, C2, …).
 * @param {string} parentId
 * @param {Array<string | { id?: string }>} existingIds
 * @param {{ excludeIds?: string[] }} [opts]
 */
export function nextAiSimilarNumber(parentId, existingIds, { excludeIds = [] } = {}) {
  const parent = String(parentId ?? '').trim()
  const exclude = new Set((excludeIds ?? []).map(String))
  const re = new RegExp(`^${escapeRegExp(parent)}C(\\d+)$`)
  /** @type {Set<number>} */
  const used = new Set()
  for (const raw of existingIds ?? []) {
    const id = String(typeof raw === 'string' ? raw : raw?.id ?? '').trim()
    if (!id || exclude.has(id)) continue
    const match = id.match(re)
    if (match) used.add(parseInt(match[1], 10))
  }
  let n = 1
  while (used.has(n)) n += 1
  return n
}

/**
 * `{approvedParentId}C{n}`. preferIndex is kept when that C number is free.
 * @param {string} parentApprovedId
 * @param {Array<string | { id?: string }>} existingIds
 * @param {{ preferIndex?: number | null, excludeIds?: string[] }} [opts]
 */
export function assignAiSimilarChildId(parentApprovedId, existingIds, { preferIndex = null, excludeIds = [] } = {}) {
  const parent = String(parentApprovedId ?? '').trim()
  if (!parent) return ''
  const taken = new Set(
    (existingIds ?? []).map((row) => String(typeof row === 'string' ? row : row?.id ?? '').trim()).filter(Boolean),
  )
  for (const id of excludeIds ?? []) taken.delete(String(id))
  let n =
    preferIndex != null && preferIndex >= 1
      ? Math.trunc(preferIndex)
      : nextAiSimilarNumber(parent, existingIds, { excludeIds })
  let candidate = similarId(parent, n)
  while (taken.has(candidate)) {
    n += 1
    candidate = similarId(parent, n)
  }
  return candidate
}

/** @param {string} parentId @param {string} childId */
function childIndexOnParent(parentId, childId) {
  const parent = String(parentId ?? '').trim()
  if (!parent) return null
  const match = String(childId ?? '').trim().match(new RegExp(`^${escapeRegExp(parent)}C(\\d+)$`))
  return match ? parseInt(match[1], 10) : null
}

/** Parent id that is already final (AI …I, founder PYQ, or plain classified). */
function stableApprovedParentId(parentRef, parentRow) {
  const rowId = String(parentRow?.id ?? '').trim()
  const ref = String(parentRef ?? '').trim()
  if (isAiParentQuestionId(rowId)) return rowId
  if (isAiParentQuestionId(ref)) return ref
  if (rowId && !isTemporaryQuestionId(rowId) && !isHybridAiParentQuestion(parentRow)) {
    if (
      isFounderQuestionId(rowId) ||
      isClassifiedQuestionId(rowId) ||
      isClassifiedQuestionId(stripFounderIdSuffixes(rowId))
    ) {
      return rowId
    }
  }
  if (
    ref &&
    !isTemporaryQuestionId(ref) &&
    (isFounderQuestionId(ref) || isClassifiedQuestionId(ref) || isClassifiedQuestionId(stripFounderIdSuffixes(ref)))
  ) {
    return ref
  }
  return ''
}

/** @param {import('../data/tests').Question[]} allQuestions @param {string} parentRef */
function findParentRow(allQuestions, parentRef) {
  if (!parentRef) return undefined
  return (
    (allQuestions ?? []).find((row) => String(row.id) === parentRef) ||
    (allQuestions ?? []).find((row) => String(row.aiTempId ?? '') === parentRef)
  )
}

/** @param {import('../data/tests').Question[]} allQuestions @param {string} id @param {string[]} excludeIds */
function idTakenByOther(allQuestions, id, excludeIds) {
  return (allQuestions ?? []).some(
    (row) => String(row.id) === id && !excludeIds.includes(String(row.id)),
  )
}

/**
 * On approve of a similar/clone row, copy the parent's approved id and append C{n}.
 * If the parent is still a Hybrid AI draft, keep this row's temporary id until the parent is approved.
 * @param {import('../data/tests').Question} q
 * @param {import('../data/tests').Question[]} allQuestions
 * @param {{ excludeIds?: string[] }} [opts]
 */
export function assignApprovedSimilarId(q, allQuestions, { excludeIds = [] } = {}) {
  const current = String(q?.id ?? '').trim()
  const parentRef = parentRefOf(q)
  const parentRow = findParentRow(allQuestions, parentRef)
  const stem = stableApprovedParentId(parentRef, parentRow)
  if (stem && childIndexOnParent(stem, current) != null && !idTakenByOther(allQuestions, current, excludeIds)) {
    return { ...q, id: current }
  }
  if (!stem) {
    if (
      parentRef &&
      childIndexOnParent(parentRef, current) != null &&
      !idTakenByOther(allQuestions, current, excludeIds)
    ) {
      return { ...q, id: current }
    }
    return q
  }
  const prefer = childIndexOnParent(stem, current) ?? childIndexOnParent(parentRef, current)
  const id = assignAiSimilarChildId(stem, allQuestions ?? [], {
    preferIndex: prefer,
    excludeIds: [...excludeIds, current],
  })
  if (!id || id === current) return { ...q, id: current || id }
  const next = { ...q, id }
  if (stem && parentRef !== stem) {
    next.parentQuestionId = stem
    if (q.similarToId) next.similarToId = stem
    if (q.seedPyqId) next.seedPyqId = stem
    if (q.parent_id) next.parent_id = stem
    if (q.parentId) next.parentId = stem
  } else if (!next.parentQuestionId) {
    next.parentQuestionId = stem
  }
  return next
}

/**
 * Assign MAM00001I when a Hybrid AI draft is approved. Official PYQ rows are unchanged.
 * Similar rows get the parent's approved id plus C{n}.
 * @param {import('../data/tests').Question} q
 * @param {import('../data/tests').Question[]} allQuestions
 * @param {{ excludeIds?: string[] }} [opts]
 */
export function assignApprovedAiQuestionId(q, allQuestions, { excludeIds = [] } = {}) {
  if (!q || isOfficialPyqQuestion(q)) return q
  if (q.needsAction === true) return q
  if (isSimilarAiChild(q)) {
    return assignApprovedSimilarId(q, allQuestions, { excludeIds })
  }
  if (!isHybridAiParentQuestion(q)) return q

  const prefix = classifiedIdPrefix(q)
  const current = String(q.id ?? '').trim()
  // Keep an id that is already MAM00020I. Do not mint MAM00025I for the same row
  // when the chapter letters change between saves.
  if (isAiParentQuestionId(current)) {
    const skip = new Set((excludeIds ?? []).map((value) => String(value)))
    const taken = (allQuestions ?? []).some(
      (row) => String(row.id) === current && !skip.has(String(row.id)),
    )
    if (!taken) return { ...q, id: current }
  }

  const serial = nextAiChapterSerial(allQuestions, q, { excludeIds: [...excludeIds, current] })
  const next = { ...q, id: formatAiParentId(prefix, serial) }
  if (current && isTemporaryQuestionId(current)) next.aiTempId = current
  return next
}

/**
 * When a parent id changes on approve, point family links at the new id.
 * Direct children whose id is `{oldId}C{n}` become `{newId}C{n}` (same C number when free).
 * @param {import('../data/tests').Question[]} questions
 * @param {string} oldId
 * @param {string} newId
 */
export function remapQuestionIdReferences(questions, oldId, newId) {
  if (!oldId || !newId || oldId === newId) return questions
  const childRe = new RegExp(`^${escapeRegExp(String(oldId))}C(\\d+)$`)
  const linkFields = ['passageId', 'parentQuestionId', 'similarToId', 'seedPyqId', 'parent_id', 'parentId']
  const taken = new Set((questions ?? []).map((row) => String(row?.id ?? '')))
  return (questions ?? []).map((q) => {
    let next = q
    const id = String(q?.id ?? '')
    const child = id.match(childRe)
    if (child) {
      let n = parseInt(child[1], 10)
      let candidate = `${newId}C${n}`
      while (taken.has(candidate) && candidate !== id) {
        n += 1
        candidate = `${newId}C${n}`
      }
      taken.delete(id)
      taken.add(candidate)
      next = { ...next, id: candidate }
    }
    for (const field of linkFields) {
      if (next[field] != null && String(next[field]) === String(oldId)) {
        if (next === q) next = { ...next }
        next[field] = newId
      }
    }
    return next
  })
}

/** @param {import('../data/tests').Question} q */
function questionSortTime(q) {
  const updated = Number(q?.updatedAt)
  if (Number.isFinite(updated) && updated > 0) return updated
  const saved = Number(q?.savedAt)
  if (Number.isFinite(saved) && saved > 0) return saved
  return 0
}

/**
 * Next five-digit sequence for this chapter bucket (max existing + 1).
 * @param {import('../data/tests').Question[]} allQuestions
 * @param {import('../data/tests').Question} q
 * @param {{ excludeIds?: string[] }} [opts]
 */
export function nextClassifiedSequence(allQuestions, q, { excludeIds = [] } = {}) {
  const prefix = classifiedIdPrefix(q)
  const bucket = chapterBucketKey(q)
  const exclude = new Set(excludeIds.map(String))
  let max = 0
  for (const row of allQuestions) {
    if (exclude.has(String(row.id))) continue
    if (chapterBucketKey(row) !== bucket) continue
    const m = String(row.id).match(new RegExp(`^${prefix}(\\d{5})(?:[AJN]\\d{4})?(?:C\\d+)?$`))
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return max + 1
}

/**
 * Assign MAQ12345 when Subject + Unit + Chapter are set; otherwise keep or mint uq-* id.
 * Preserves founder PYQ (MAQ12345A2024) and similar (MAQ12345C1) ids on save.
 * @param {import('../data/tests').Question} q
 * @param {import('../data/tests').Question[]} allQuestions
 * @param {{ excludeIds?: string[] }} [opts]
 */
export function assignClassifiedQuestionId(q, allQuestions, { excludeIds = [] } = {}) {
  const earlyId = String(q?.id ?? '').trim()
  // Approved AI ids stay put on later saves. Drafts keep TV-AI- / uq- until publish.
  if (isAiFamilyQuestionId(earlyId)) return { ...q, id: earlyId }
  if (keepsTemporaryHybridId(q) && earlyId) return { ...q, id: earlyId }

  if (!canAssignClassifiedId(q)) {
    const id = String(q?.id ?? '').trim()
    return { ...q, id: id || `uq-${Date.now()}` }
  }

  const prefix = classifiedIdPrefix(q)
  const bucket = chapterBucketKey(q)
  const currentId = String(q?.id ?? '')

  // Keep similar / replica children (parentIdC1) so save does not mint a new classified id.
  if (parseSimilarVariantIndex(currentId) != null) {
    return { ...q, id: currentId }
  }

  const coreId = stripFounderIdSuffixes(currentId)
  if (
    (isClassifiedQuestionId(coreId) || isFounderQuestionId(currentId)) &&
    coreId.startsWith(prefix)
  ) {
    const seq = parseInt(coreId.slice(3), 10)
    const taken = allQuestions.some(
      (row) =>
        String(row.id) === currentId &&
        chapterBucketKey(row) === bucket &&
        !excludeIds.includes(String(row.id)),
    )
    if (!taken && seq >= 1 && seq <= 99999) return { ...q, id: currentId }
  }

  const seq = nextClassifiedSequence(allQuestions, q, { excludeIds })
  return { ...q, id: `${prefix}${String(seq).padStart(5, '0')}` }
}

/**
 * Backfill structured ids for all classified rows, ordered by save time within each chapter.
 * @param {import('../data/tests').Question[]} questions
 */
export function migrateAllClassifiedQuestionIds(questions) {
  if (!Array.isArray(questions) || !questions.length) return questions

  const list = questions.map((q) => ({ ...q }))
  const idRemap = new Map()
  const buckets = new Map()

  for (const q of list) {
    if (!canAssignClassifiedId(q)) continue
    const key = chapterBucketKey(q)
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(q)
  }

  for (const bucketQs of buckets.values()) {
    bucketQs.sort((a, b) => questionSortTime(a) - questionSortTime(b))
    const prefix = classifiedIdPrefix(bucketQs[0])
    let maxSeq = 0
    const needId = []
    for (const q of bucketQs) {
      const oldId = String(q.id ?? '')
      if (isAiFamilyQuestionId(oldId) || keepsTemporaryHybridId(q)) continue
      const core = stripFounderIdSuffixes(oldId)
      if (isFounderQuestionId(oldId) && core.startsWith(prefix)) {
        const seq = parseInt(core.slice(3), 10)
        if (Number.isFinite(seq)) maxSeq = Math.max(maxSeq, seq)
        continue
      }
      needId.push(q)
    }
    needId.forEach((q, i) => {
      const oldId = String(q.id ?? '')
      const newId = `${prefix}${String(maxSeq + i + 1).padStart(5, '0')}`
      if (oldId && oldId !== newId) idRemap.set(oldId, newId)
      q.id = newId
    })
  }

  if (idRemap.size) {
    for (const q of list) {
      const pid = q.passageId
      if (pid && idRemap.has(String(pid))) {
        q.passageId = idRemap.get(String(pid))
      }
    }
  }

  return list
}

/**
 * When a passage parent id changes, update linked sub-rows.
 * @param {import('../data/tests').Question[]} questions
 * @param {string} oldId
 * @param {string} newId
 */
export function remapPassageParentId(questions, oldId, newId) {
  if (!oldId || oldId === newId) return questions
  return questions.map((q) => (q.passageId === oldId ? { ...q, passageId: newId } : q))
}
