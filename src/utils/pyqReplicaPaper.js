/**
 * Full-paper PYQ replica metadata — generation uses Hybrid AI clone-scaled (see PyqReplicaPaperPanel).
 */
import { assignAiSimilarChildId, paperFamilyId } from './questionFamily.js'
import {
  AI_REPLICA_PAPER_BANK_SOURCE,
  AI_REPLICA_PAPER_SOURCE,
  AI_SIMILAR_BANK_SOURCE,
  AI_SIMILAR_SOURCE,
} from './pyqDetect.js'
import { normalizePyqExamId, normalizeAdvPaper } from './pyqSlotMeta.js'
import { clampSimilarToPyqToughness } from './geminiScqTrial.js'

export const REPLICA_PAPER_COUNTS = [3, 5]
export const REPLICA_PAPER_DEFAULT_COUNT = 3

export function clampReplicaPaperCount(raw) {
  return Number(raw) === 5 ? 5 : REPLICA_PAPER_DEFAULT_COUNT
}

export function shortParentPaperLabel(paper) {
  const year = Number(paper?.pyqYear) || ''
  const exam = normalizePyqExamId(paper?.examPatternId)
  const session = normalizeAdvPaper(paper?.pyqSession) || normalizeAdvPaper(paper?.paperLabel)
  if (exam === 'jee-advanced' && session) {
    const p = /paper\s*2/i.test(session) ? 'P-2' : 'P-1'
    return `${year} JEE ADV ${p}`.trim()
  }
  if (exam === 'jee-main') return `${year} JEE MAIN`.trim()
  if (exam === 'neet') return `${year} NEET`.trim()
  const fallback = String(paper?.paperLabel ?? '').trim()
  return fallback || `${year} PYQ`.trim()
}

export function replicaPaperLabel(parentPaper, replicaIndex) {
  return `${shortParentPaperLabel(parentPaper)} Similar${replicaIndex}`
}

export function replicaPaperId(parentPaperId, replicaIndex) {
  const root = String(parentPaperId ?? '').trim().replace(/-similar-\d+$/i, '')
  return `${root}-similar-${replicaIndex}`
}

export function maxExistingReplicaIndex(parentPaperId, pool) {
  const root = paperFamilyId({ paperId: parentPaperId })
  let max = 0
  for (const q of pool ?? []) {
    if (paperFamilyId(q) !== root) continue
    const m = String(q.paperId ?? '').match(/-similar-(\d+)$/i)
    if (m) max = Math.max(max, Number(m[1]))
    const lm = String(q.paperLabel ?? '').match(/Similar(\d+)$/i)
    if (lm) max = Math.max(max, Number(lm[1]))
  }
  return max
}

export function nextReplicaIndices(parentPaperId, pool, count) {
  const start = maxExistingReplicaIndex(parentPaperId, pool) + 1
  return Array.from({ length: count }, (_, i) => start + i)
}

export function buildReplicaPaperMeta(parentPaper, replicaIndex) {
  const parentId = String(parentPaper.paperId ?? '').trim()
  return {
    paperId: replicaPaperId(parentId, replicaIndex),
    paperLabel: replicaPaperLabel(parentPaper, replicaIndex),
    derivedFromPaperId: parentId,
    parentPaperId: parentId,
    replicaIndex,
    pyqYear: parentPaper.pyqYear,
    examPatternId: parentPaper.examPatternId,
    pyqDate: parentPaper.pyqDate,
    pyqShift: parentPaper.pyqShift,
    pyqSession: parentPaper.pyqSession,
    aiReplicaPaper: true,
    officialPyq: false,
    imported: false,
    pyqStyle: false,
    bankSource: AI_REPLICA_PAPER_BANK_SOURCE,
    source: AI_REPLICA_PAPER_SOURCE,
    bankStatus: 'draft',
  }
}

export function buildReplicaPyqQuestion(item, seed, paperMeta, variantIndex, existingIds, opts = {}) {
  const now = opts.now ?? Date.now()
  const parentQid = String(seed.id ?? '').trim()
  const id = assignAiSimilarChildId(parentQid, variantIndex, existingIds)
  const seedT = seed.toughnessLevel ?? seed.toughness ?? 5
  return {
    id,
    text: item.stem ?? item.text ?? '',
    options: [...(item.options ?? [])],
    correctIndex: item.correctIndex,
    solution: item.solution || '',
    subject: seed.subject || item.subject,
    section: seed.section,
    chapter: seed.chapter || item.chapter,
    topic: item.topic || seed.topic,
    questionType: seed.questionType || 'single_correct',
    toughnessLevel: clampSimilarToPyqToughness(item.toughness, seedT),
    examIds: seed.examIds?.length ? [...seed.examIds] : [paperMeta.examPatternId],
    examPatternId: paperMeta.examPatternId,
    pyqYear: paperMeta.pyqYear,
    pyqDate: paperMeta.pyqDate,
    pyqShift: paperMeta.pyqShift,
    pyqSession: paperMeta.pyqSession,
    paperId: paperMeta.paperId,
    paperLabel: paperMeta.paperLabel,
    derivedFromPaperId: paperMeta.derivedFromPaperId,
    parentPaperId: paperMeta.parentPaperId,
    parentQuestionId: parentQid,
    similarToId: parentQid,
    seedPyqId: parentQid,
    similarToPyq: true,
    sub_bank_type: 'similar_pyq',
    aiReplicaPaper: true,
    officialPyq: false,
    imported: false,
    pyqStyle: false,
    bankSource: AI_REPLICA_PAPER_BANK_SOURCE,
    source: AI_REPLICA_PAPER_SOURCE,
    bankStatus: 'draft',
    pyqSlot: opts.slot ?? seed.pyqSlot,
    marking: seed.marking,
    savedAt: now,
  }
}

export function buildSimilarBankDraft(item, seed, variantIndex, existingIds, opts = {}) {
  const now = opts.now ?? Date.now()
  const index = opts.index ?? 0
  const parentQid = String(seed.id ?? '').trim()
  const id = assignAiSimilarChildId(parentQid, variantIndex, existingIds)
  const seedT = seed.toughnessLevel ?? seed.toughness ?? 5
  return {
    id,
    questionType: seed.questionType || 'single_correct',
    bankStatus: 'draft',
    subject: seed.subject,
    section: seed.section,
    chapter: seed.chapter || item.chapter,
    topic: item.topic || seed.topic,
    examIds: seed.examIds?.length ? [...seed.examIds] : [],
    examPatternId: seed.examPatternId,
    text: item.stem ?? item.text ?? '',
    options: [...(item.options ?? [])],
    correctIndex: item.correctIndex,
    solution: item.solution || '',
    toughnessLevel: clampSimilarToPyqToughness(item.toughness, seedT),
    source: AI_SIMILAR_SOURCE,
    bankSource: AI_SIMILAR_BANK_SOURCE,
    similarToPyq: true,
    sub_bank_type: 'similar_pyq',
    parentQuestionId: parentQid,
    similarToId: parentQid,
    seedPyqId: parentQid,
    officialPyq: false,
    pyqStyle: false,
    imported: false,
    pyqYear: seed.pyqYear,
    pyqDate: seed.pyqDate,
    pyqShift: seed.pyqShift,
    pyqSession: seed.pyqSession,
    marking: seed.marking,
    savedAt: now + index,
  }
}

export function canGenerateReplicaFromQuestion(q) {
  if (!q) return false
  if (q.aiReplicaPaper || q.similarToPyq) return false
  const stem = String(q.text ?? q.stem ?? '').trim()
  if (!stem) return false
  return q.officialPyq === true || q.imported === true || q._pendingOfficial === true
}

export function parentPaperFromGroup(parentPaper) {
  const first = parentPaper.questions?.[0]
  return {
    paperId: parentPaper.paperId || first?.paperId,
    paperLabel: parentPaper.paperLabel || first?.paperLabel,
    examPatternId: parentPaper.examPatternId || first?.examPatternId,
    pyqYear: parentPaper.pyqYear ?? first?.pyqYear,
    pyqDate: parentPaper.pyqDate ?? first?.pyqDate,
    pyqShift: parentPaper.pyqShift ?? first?.pyqShift,
    pyqSession: parentPaper.pyqSession ?? first?.pyqSession,
    questions: parentPaper.questions ?? [],
  }
}