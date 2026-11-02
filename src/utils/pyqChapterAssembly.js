import { getAssemblyBlueprint, getBlueprintTotal } from './patternResolver.js'
import { JEE_ADV_MSQ_MARKING } from './msqMarking.js'
import { enforce_parent_child_exclusion } from './parentChildExclusion.js'

/**
 * @template T
 * @param {T[]} arr
 */
function shuffleArray(arr) {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = copy[i]
    copy[i] = copy[j]
    copy[j] = tmp
  }
  return copy
}

/** @param {import('../data/tests').Question} q */
function questionTypeOf(q) {
  return q.questionType ?? 'single_correct'
}

/**
 * @param {import('../data/tests').Question[]} questions
 */
function groupByType(questions) {
  /** @type {Record<string, import('../data/tests').Question[]>} */
  const pools = {}
  for (const q of questions) {
    const t = questionTypeOf(q)
    if (!pools[t]) pools[t] = []
    pools[t].push(q)
  }
  for (const key of Object.keys(pools)) {
    pools[key] = shuffleArray(pools[key])
  }
  return pools
}

/**
 * @param {import('../data/tests').Question} q
 * @param {import('../data/pyqChapterPatterns').PyqChapterPatternSlot} slot
 */
function adaptQuestionToSlot(q, slot) {
  const type = slot.questionTypeId
  const base = {
    ...q,
    questionType: type,
    marking: slot.marking }

  if (type === 'passage' || type === 'passage_integer' || type === 'passage_scq') {
    return {
      ...base,
      passageText:
        q.passageText ??
        `Passage (PYQ ${q.chapter ?? 'chapter'}): study the concepts below, then answer.`,
      options: q.options ?? ['A', 'B', 'C', 'D'],
      correctIndex: q.correctIndex ?? 0 }
  }

  if (type === 'single_correct') {
    return {
      ...base,
      options: q.options ?? ['A', 'B', 'C', 'D'],
      correctIndex: q.correctIndex ?? 0 }
  }

  if (type === 'multiple_correct') {
    const ci = q.correctIndex ?? 0
    const opts = q.options ?? ['A', 'B', 'C', 'D']
    const second = (ci + 1) % Math.max(opts.length, 1)
    const m = slot.marking
    const msqMarking = m.partial != null
      ? {
          full: m.correct,
          partial1: m.partial,
          partial2: m.partial + 1,
          partial3: m.partial + 2,
          wrongAny: m.wrong,
          unattempted: m.unattempted ?? 0 }
      : (q.msqMarking ?? JEE_ADV_MSQ_MARKING)
    return {
      ...base,
      options: opts,
      correctIndices: q.correctIndices?.length ? q.correctIndices : [ci, second],
      msqMarking }
  }

  if (type === 'integer') {
    return {
      ...base,
      correctInteger:
        q.correctInteger != null ? q.correctInteger : (q.correctIndex ?? 0) + 1 }
  }

  if (type === 'numerical') {
    const fromNum = q.correctNumerical
    const fromOpt =
      q.options?.[q.correctIndex ?? 0] != null
        ? parseFloat(String(q.options[q.correctIndex ?? 0]).replace(/[^\d.-]/g, ''))
        : NaN
    const val = fromNum != null && !Number.isNaN(fromNum) ? fromNum : !Number.isNaN(fromOpt) ? fromOpt : (q.correctIndex ?? 0) + 1
    return {
      ...base,
      correctNumerical: val,
      numericalTolerance: q.numericalTolerance ?? 0 }
  }

  if (type === 'matrix_match') {
    return {
      ...base,
      matrixRows: q.matrixRows ?? ['P', 'Q', 'R', 'S'],
      matrixCols: q.matrixCols ?? ['1', '2', '3', '4'],
      matrixAnswerKey: q.matrixAnswerKey ?? { 0: 0, 1: 1, 2: 2, 3: 3 } }
  }

  return base
}

/**
 * @param {import('../data/tests').Question} q
 * @param {import('../data/pyqChapterPatterns').PyqChapterPatternSlot} slot
 */
function applySlotToQuestion(q, slot) {
  const adapted = adaptQuestionToSlot(q, slot)
  return {
    ...adapted,
    pyqPatternSection: slot.section }
}

/**
 * Build test questions matching a slot blueprint (random within each type).
 * @param {import('../data/tests').Question[]} questions
 * @param {import('./patternResolver').AssemblyBlueprint} pattern
 */
export function assembleQuestionsByBlueprint(questions, pattern) {
  const targetTotal = pattern.totalCap
  const totalAvailable = questions.length
  const pools = groupByType(questions)
  const usedIds = new Set()
  /** @type {import('../data/tests').Question[]} */
  const assembled = []
  /** @type {{ typeId: string, requested: number, picked: number, section?: string }[]} */
  const slotReport = []

  const takeUnused = (/** @type {import('../data/tests').Question[]} */ pool, /** @type {number} */ n) => {
    const out = []
    for (const q of pool ?? []) {
      if (out.length >= n) break
      if (usedIds.has(q.id)) continue
      usedIds.add(q.id)
      out.push(q)
    }
    return out
  }

  for (const slot of pattern.slots) {
    const pool = pools[slot.questionTypeId] ?? []
    let picked = takeUnused(pool, slot.count)

    if (picked.length < slot.count) {
      const remaining = shuffleArray(questions.filter((q) => !usedIds.has(q.id)))
      for (const q of remaining) {
        if (picked.length >= slot.count) break
        usedIds.add(q.id)
        picked.push(q)
      }
    }

    slotReport.push({
      typeId: slot.questionTypeId,
      section: slot.section,
      requested: slot.count,
      picked: picked.length })

    for (const q of picked) {
      assembled.push(applySlotToQuestion(q, slot))
    }
  }

  if (assembled.length < targetTotal) {
    const filler = shuffleArray(questions.filter((q) => !usedIds.has(q.id))).slice(
      0,
      targetTotal - assembled.length,
    )
    const defaultSlot = pattern.slots[0]
    for (const q of filler) {
      assembled.push(applySlotToQuestion(q, defaultSlot))
    }
  }

  const shuffled = enforce_parent_child_exclusion(shuffleArray(assembled).slice(0, targetTotal))

  return {
    questions: shuffled,
    pattern,
    limit: targetTotal,
    totalAvailable,
    capped: totalAvailable > targetTotal,
    slotReport,
    patternFilled: shuffled.length === getBlueprintTotal(pattern) }
}

/**
 * Build chapter PYQ test questions matching exam or custom paper pattern.
 * @param {import('../data/tests').Question[]} questions
 * @param {string} examPatternId
 * @param {string} [paperPatternId]
 */
export function assembleChapterPyqByPattern(questions, examPatternId, paperPatternId) {
  const pattern = getAssemblyBlueprint(examPatternId, paperPatternId)
  return assembleQuestionsByBlueprint(questions, pattern)
}
