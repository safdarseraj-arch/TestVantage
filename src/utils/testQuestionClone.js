/**
 * Clone bank questions into a test paper while keeping passage parent ↔ child links.
 */

import { questionStemFingerprint, stemSimilarity } from './detectDuplicateQuestion.js'
import { filterPublishedQuestions } from './questionUploadFilter.js'
/** @param {string} [text] */
function passageBodyKey(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 96)
    .toLowerCase()
}

/**
 * Ensure passage parent rows are present when sub-questions are selected.
 * @param {import('../data/tests').Question[]} pool
 * @param {import('../data/tests').Question[]} selected
 */
export function ensurePassageParentsIncluded(pool, selected) {
  const byId = new Map(pool.map((q) => [q.id, q]))
  const ordered = []
  const seen = new Set()

  for (const q of selected) {
    const pid = q.passageId
    if (pid && byId.has(pid) && !seen.has(pid)) {
      ordered.push(byId.get(pid))
      seen.add(pid)
    }
    if (q.id && !seen.has(q.id)) {
      ordered.push(q)
      seen.add(q.id)
    }
  }

  return ordered
}

/**
 * Drop duplicate rows in a paper — same id, or same stem (and same passage when linked).
 * @param {import('../data/tests').Question[]} questions
 */
export function dedupeQuestionsForExam(questions) {
  const seenIds = new Set()
  const seenKeys = new Set()
  /** @type {import('../data/tests').Question[]} */
  const out = []

  for (const q of questions ?? []) {
    if (!q) continue
    const id = String(q.id ?? '')
    if (id && seenIds.has(id)) continue

    const fp = questionStemFingerprint(q.text)
    const stemKey =
      fp.length >= 24
        ? q.passageId
          ? `${q.passageId}::${fp}`
          : fp
        : id || `row-${out.length}`

    if (fp.length >= 24 && seenKeys.has(stemKey)) continue

    if (id) seenIds.add(id)
    if (fp.length >= 24) seenKeys.add(stemKey)
    out.push(q)
  }

  return out
}

/** @param {import('../data/tests').Question} q */
function bankMatchFingerprint(q) {
  const stemFp = questionStemFingerprint(q.text)
  if (stemFp.length >= 24) return stemFp
  const rows = (q.matrixRows ?? [])
    .map((r) => questionStemFingerprint(r))
    .filter((r) => r.length >= 12)
    .join('\n')
  if (rows.length >= 24) return `mtx::${rows}`
  return stemFp.length >= 12 ? stemFp : ''
}

/**
 * @param {import('../data/tests').Question} q
 * @param {Map<string, import('../data/tests').Question>} bankById
 * @param {Map<string, import('../data/tests').Question>} bankByFp
 * @param {import('../data/tests').Question[]} bankPool
 */
export function resolveBankQuestionForTestRow(q, bankById, bankByFp, bankPool) {
  const byId = bankById.get(q.id)
  if (byId) return byId

  const fp = bankMatchFingerprint(q)
  if (fp && bankByFp.has(fp)) return bankByFp.get(fp)

  if (fp.length >= 12) {
    let best = null
    let bestScore = 0
    for (const b of bankPool) {
      const score = stemSimilarity(fp, bankMatchFingerprint(b) || questionStemFingerprint(b.text))
      if (score > bestScore) {
        bestScore = score
        best = b
      }
    }
    if (best && bestScore >= 0.9) return best
  }

  return null
}

/** Fields copied from bank when a test row is refreshed. */
const BANK_REFRESH_FIELDS = [
  'text',
  'questionType',
  'options',
  'correctIndex',
  'correctIndices',
  'correctInteger',
  'correctNumerical',
  'numericalTolerance',
  'matrixRows',
  'matrixCols',
  'matrixColLabels',
  'matrixResponseMode',
  'matrixAnswerKey',
  'passageText',
  'passageImage',
  'passageImageCrop',
  'questionImage',
  'stemImageCrop',
  'stemTextInImage',
  'optionsImage',
  'optionImages',
  'solution',
  'solutionImage',
  'marking',
  'msqMarking',
  'contentMode',
]

/**
 * Pull latest bank edits into a saved test paper (keeps test-local ids + passage links).
 * @param {import('../data/tests').Question[]} questions
 * @param {import('../data/tests').Question[]} [bankPool]
 */
export function refreshTestQuestionsFromBank(questions, bankPool = []) {
  if (!questions?.length || !bankPool?.length) return questions

  const bankById = new Map(bankPool.map((q) => [q.id, q]))
  /** @type {Map<string, import('../data/tests').Question>} */
  const bankByFp = new Map()
  for (const b of bankPool) {
    const fp = bankMatchFingerprint(b)
    if (fp && !bankByFp.has(fp)) bankByFp.set(fp, b)
  }

  let changed = false
  const out = questions.map((q) => {
    const bank = resolveBankQuestionForTestRow(q, bankById, bankByFp, bankPool)
    if (!bank) return q

    const differs = BANK_REFRESH_FIELDS.some((field) => {
      const a = q[field]
      const b = bank[field]
      if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a ?? []) !== JSON.stringify(b ?? [])
      return a !== b
    })
    if (!differs) return q

    changed = true
    /** @type {import('../data/tests').Question} */
    const next = { ...q }
    for (const field of BANK_REFRESH_FIELDS) {
      if (bank[field] !== undefined) next[field] = bank[field]
    }
    return next
  })

  return changed ? out : questions
}

/**
 * Assign fresh test-scoped ids; remap passageId to match new parent ids.
 * @param {import('../data/tests').Question[]} questions
 * @param {string} [idPrefix]
 * @param {number} [startIndex]
 */
export function cloneQuestionsForTest(questions, idPrefix = `cq-${Date.now()}`, startIndex = 0) {
  const idMap = new Map()
  questions.forEach((q, i) => {
    const oldId = q.id ?? `row-${i}`
    idMap.set(oldId, `${idPrefix}-${startIndex + i}`)
  })

  return questions.map((q, i) => {
    const next = { ...q, id: `${idPrefix}-${startIndex + i}` }
    if (next.passageId) {
      const mapped = idMap.get(next.passageId)
      if (mapped) next.passageId = mapped
    }
    return next
  })
}

/**
 * Repair broken passageId links in saved tests (e.g. child still points at bank parent id).
 * @param {import('../data/tests').Question[]} questions
 * @param {import('../data/tests').Question[]} [bankPool]
 */
export function repairPassageLinksInQuestions(questions, bankPool = []) {
  if (!questions?.length) return questions

  const bankById = new Map(bankPool.map((q) => [q.id, q]))
  const working = questions.map((q) => ({ ...q }))
  const byId = () => new Map(working.map((q) => [q.id, q]))

  const insertParent = (parentRow) => {
    if (!parentRow?.id) return null
    const ids = byId()
    if (ids.has(parentRow.id)) return parentRow.id
    const copy = { ...parentRow }
    const firstChildIdx = working.findIndex((q) => q.passageId === parentRow.id)
    if (firstChildIdx >= 0) {
      working.splice(firstChildIdx, 0, copy)
    } else {
      working.push(copy)
    }
    return copy.id
  }

  for (const q of working) {
    if (!q.passageId) continue
    if (byId().has(q.passageId)) continue

    const bankParent = bankById.get(q.passageId)
    if (bankParent?.passageText) {
      insertParent(bankParent)
      continue
    }

    const bankChild = bankPool.find(
      (b) =>
        b.passageId &&
        (b.id === q.id ||
          (b.text && q.text && b.text.trim() === q.text.trim()) ||
          (b.text && q.text && passageBodyKey(b.text) === passageBodyKey(q.text))),
    )
    const bankParentViaChild = bankChild?.passageId
      ? bankById.get(bankChild.passageId)
      : null

    if (bankParentViaChild?.passageText) {
      const testParent = working.find(
        (t) =>
          t.passageText &&
          passageBodyKey(t.passageText) === passageBodyKey(bankParentViaChild.passageText),
      )
      if (testParent) {
        q.passageId = testParent.id
      } else {
        insertParent(bankParentViaChild)
        q.passageId = bankParentViaChild.id
      }
    }
  }

  const pool = [...bankPool, ...working]
  const result = ensurePassageParentsIncluded(pool, working)
  if (
    result.length === questions.length &&
    result.every(
      (q, i) =>
        q.id === questions[i].id &&
        q.passageId === questions[i].passageId &&
        q.passageText === questions[i].passageText,
    )
  ) {
    return questions
  }
  return result
}

/**
 * Pick questions for a new test paper — include passage parents, clone ids, keep links.
 * @param {import('../data/tests').Question[]} pool
 * @param {import('../data/tests').Question[]} selected
 * @param {string} [idPrefix]
 */
export function prepareQuestionsForTest(pool, selected, idPrefix = `cq-${Date.now()}`) {
  const publishedPool = filterPublishedQuestions(pool)
  const publishedSelected = filterPublishedQuestions(selected)
  if (!publishedSelected.length) return []

  const uniqueSelected = dedupeQuestionsForExam(publishedSelected)
  const repaired = repairPassageLinksInQuestions(uniqueSelected, publishedPool)
  const withParents = ensurePassageParentsIncluded([...publishedPool, ...repaired], repaired)
  return cloneQuestionsForTest(dedupeQuestionsForExam(withParents), idPrefix)
}
