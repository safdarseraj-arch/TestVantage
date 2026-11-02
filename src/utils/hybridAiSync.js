/**
 * Pull Hybrid AI rows from Postgres (FastAPI /api/questions/pool) into the browser question bank.
 */
import { API_BASE } from '../config/platform.js'
import { getQuestionType } from '../data/questionTypes.js'
import {
  applyHybridCurriculumTags,
  curriculumTopicsForChapter,
  mapHybridExamLabelToSlug,
  mapHybridPoolQuestionTypeToBankId,
  mapHybridSubjectLabelToSlug,
} from './hybridMetadata.js'
import {
  HYBRID_AI_SOURCE_LABEL,
  healQuestionLatexForBank,
  normalizeHybridSourceLabel,
  sanitizeHybridLatexText,
  sanitizeHybridOption,
} from './hybridLatexSanitize.js'
import { bumpMasterPoolCache } from './masterPool.js'
import { addUploadedQuestionsBulk, loadQuestionBank, peekUploadedQuestions, saveQuestionBank } from './questionBank.js'
import { mergeHybridSyncIntoExisting, splitHybridSyncDrafts } from './hybridBankIdentity.js'
import { isHybridAiBankQuestion } from './questionBankSubBank.js'
import {
  SUB_BANK_TYPE_AI,
  SUB_BANK_TYPE_SIMILAR_PYQ,
  normalizeSubBankType,
} from './subBankType.js'

const HYBRID_AI_SOURCE = HYBRID_AI_SOURCE_LABEL

/** Browser event when background Hybrid sync fails or Postgres has no AI rows. */
export const HYBRID_AI_SYNC_STATUS_EVENT = 'testvantage-hybrid-ai-sync'

const HYBRID_JOB_PENDING_STORAGE_KEY = 'tv-hybrid-ai-job-pending'
const HYBRID_JOB_PENDING_TTL_MS = 12 * 60 * 1000

/**
 * Mark an in-flight Hybrid batch/clone so background sync does not show "queue Generate" errors.
 * @param {{ baselinePoolAiCount?: number, questionsQueued?: number }} [meta]
 */
export function markHybridAiJobPending(meta = {}) {
  if (typeof sessionStorage === 'undefined') return
  try {
    const baseline = Number(meta.baselinePoolAiCount)
    sessionStorage.setItem(
      HYBRID_JOB_PENDING_STORAGE_KEY,
      JSON.stringify({
        since: Date.now(),
        baselinePoolAiCount: Number.isFinite(baseline) ? baseline : null,
        questionsQueued: Math.max(1, Number(meta.questionsQueued) || 1),
      }),
    )
  } catch {
    /* private mode */
  }
}

export function clearHybridAiJobPending() {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.removeItem(HYBRID_JOB_PENDING_STORAGE_KEY)
  } catch {
    /* private mode */
  }
}

/** @returns {{ since: number, baselinePoolAiCount: number | null, questionsQueued: number } | null} */
export function peekHybridAiJobPending() {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(HYBRID_JOB_PENDING_STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    const since = Number(data?.since)
    if (!Number.isFinite(since) || Date.now() - since > HYBRID_JOB_PENDING_TTL_MS) {
      sessionStorage.removeItem(HYBRID_JOB_PENDING_STORAGE_KEY)
      return null
    }
    const baseline = Number(data?.baselinePoolAiCount)
    return {
      since,
      baselinePoolAiCount: Number.isFinite(baseline) ? baseline : null,
      questionsQueued: Math.max(1, Number(data?.questionsQueued) || 1),
    }
  } catch {
    return null
  }
}

export function isHybridAiJobPending() {
  return peekHybridAiJobPending() != null
}

function sleepMs(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/** @param {{ type: 'error' | 'info' | 'success', message: string }} detail */
export function broadcastHybridSyncStatus(detail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(HYBRID_AI_SYNC_STATUS_EVENT, { detail }))
}

/**
 * True when Postgres pool fetch succeeded but has no AI sub_bank rows.
 * @param {{ poolCount?: number, poolAiCount?: number }} result
 */
export function postgresHasNoHybridAiRows(result) {
  if (result?.pending === true) return false
  const poolAi = Number(result?.poolAiCount)
  if (Number.isFinite(poolAi)) return poolAi === 0
  const poolCount = Number(result?.poolCount)
  return Number.isFinite(poolCount) && poolCount === 0
}

/**
 * Import only after the AI pool has grown past the pre-queue count.
 * A job that is still drafting, or an API that never answered, is not ready.
 * @param {{ ready?: boolean, poolAiCount?: number } | null | undefined} wait
 * @param {number | null} [baseline]
 */
export function hybridPoolReadyForImport(wait, baseline = null) {
  if (!wait || wait.ready !== true) return false
  const count = Number(wait.poolAiCount)
  if (!Number.isFinite(count) || count <= 0) return false
  if (baseline != null && Number.isFinite(Number(baseline)) && count <= Number(baseline)) return false
  return true
}

const HYBRID_API_DOWN_MESSAGE =
  'TestVantages Hybrid AI is not running (port 8000). Press F5 and keep the bottom terminal open.'

/** @param {string} url @param {{ signal?: AbortSignal }} [opts] */
async function fetchHybridApi(url, opts = {}) {
  try {
    return await fetch(url, { signal: opts.signal })
  } catch (err) {
    if (opts.signal?.aborted) throw err
    const msg = err instanceof Error ? err.message : String(err ?? '')
    if (/abort/i.test(msg)) throw err instanceof Error ? err : new Error(msg)
    throw new Error(HYBRID_API_DOWN_MESSAGE)
  }
}

/**
 * @param {{ added?: number, poolCount?: number, poolAiCount?: number }} result
 * @param {{ localHybridDraftCount?: number, jobPending?: boolean }} [opts]
 * @returns {string | null}
 */
export function hybridSyncUserMessage(result, opts = {}) {
  const added = Number(result?.added) || 0
  const poolCount = Number(result?.poolCount)
  const poolAi = Number(result?.poolAiCount)
  const local = Number(opts.localHybridDraftCount)
  const localHybrid = Number.isFinite(local) && local > 0 ? local : 0
  const jobPending = opts.jobPending === true || isHybridAiJobPending()

  if (added > 0) {
    return `Added ${added} new Hybrid AI draft(s) from Postgres.`
  }
  if (result?.pending === true) {
    return (
      'Hybrid AI is still drafting in Postgres — wait up to a couple of minutes, then use ' +
      'Sync from Hybrid AI (do not re-queue yet).'
    )
  }
  if (postgresHasNoHybridAiRows(result)) {
    if (jobPending) {
      return (
        'Hybrid AI is still drafting in Postgres — wait up to a couple of minutes, then use ' +
        'Sync from Hybrid AI (do not re-queue yet).'
      )
    }
    if (localHybrid > 0) {
      return (
        `Postgres has 0 Hybrid AI rows — nothing new to pull (Sync copies FROM Postgres only). ` +
        `You already have ${localHybrid} Hybrid AI draft(s) in this browser — open ` +
        `Saved → Draft → Hybrid AI sub-bank (not PYQ). Clear the upload-date filter if the list shows 0.`
      )
    }
    return (
      'Postgres has 0 Hybrid AI questions — nothing to sync. Queue Generate on Hybrid AI, ' +
      'check GEMINI_API_KEY in .env, press F5, and watch the bottom terminal for errors.'
    )
  }
  if (Number.isFinite(poolAi) && poolAi > 0 && added === 0) {
    return `Postgres has ${poolAi} AI row(s) — your bank already has them (0 new).`
  }
  if (Number.isFinite(poolCount) && poolCount > 0 && Number.isFinite(poolAi) && poolAi === 0) {
    return (
      'Postgres has questions but 0 in the AI sub_bank — Hybrid generation may have failed. ' +
      'Check GEMINI_API_KEY and the bottom terminal (.hybrid-api.log).'
    )
  }
  return 'No new Hybrid AI rows — bank is up to date with Postgres.'
}

/** User-facing message when a queued job timed out without new Postgres rows. */
export function hybridJobFailedAfterQueueMessage(lastError) {
  if (lastError instanceof Error && String(lastError.message ?? '').trim()) {
    return lastError.message
  }
  return (
    'Hybrid AI finished queueing but Postgres still has no new AI rows. Check GEMINI_API_KEY in .env, ' +
    'press F5, and read .hybrid-api.log in the project folder (bottom terminal).'
  )
}

/**
 * AI sub_bank row count in Postgres (pending + approved).
 * @param {{ signal?: AbortSignal }} [opts]
 */
export async function fetchHybridAiPoolCount(opts = {}) {
  const pool = await fetchHybridQuestionPool({
    approvedOnly: false,
    subBankType: SUB_BANK_TYPE_AI,
    limit: 5,
    signal: opts.signal,
  })
  return Number.isFinite(pool.count) ? pool.count : 0
}

/** @param {string} text */
function stripHybridMcqOptionLabel(text) {
  return String(text ?? '')
    .trim()
    .replace(/^\(\s*[A-D]\s*\)\s*/i, '')
    .replace(/^[A-D][\)\.\:]\s+/i, '')
    .trim()
}

/** Failed Hybrid check. These drafts stay untagged in the Needs action tray. */
export function hybridRowNeedsAction(row) {
  if (!row || typeof row !== 'object') return false
  if (row.needsAction === true || row.needs_action === true) return true
  const status = String(row.approval_status ?? row.approvalStatus ?? '').trim().toUpperCase()
  return status === 'NEEDS_ACTION' || status === 'NEEDS_FIX'
}

/**
 * Topic from the row, or the first Main-bank topic under that chapter.
 * @param {unknown} subject
 * @param {string} chapter
 * @param {unknown} topic
 */
function topicForReadyHybridDraft(subject, chapter, topic) {
  const current = String(topic ?? '').trim()
  const allowed = curriculumTopicsForChapter(subject, chapter)
  if (current && (!allowed.length || allowed.includes(current))) return current
  return allowed[0] || current || ''
}

/**
 * Force Hybrid AI sub-bank tags and normalize MCQ shape for bank review badges.
 * Needs action drafts keep every editor metatag empty.
 * A ready draft keeps subject, unit, chapter, topic, type, exam, toughness, source, and marks.
 * @param {import('../data/tests').Question | null | undefined} draft
 */
export function repairHybridDraftForBank(draft) {
  if (!draft || typeof draft !== 'object') return draft
  const subRaw = draft.sub_bank_type ?? draft.subBankType
  const isSimilar =
    subRaw === SUB_BANK_TYPE_SIMILAR_PYQ || draft.bankSource === 'ai_similar_pyq' || draft.similarToPyq === true

  const next = { ...draft }
  const typeBeforeClear = next.questionType
  const needsAction = hybridRowNeedsAction(next)
  if (needsAction) {
    next.needsAction = true
    next.bankStatus = 'draft'
    next.subject = ''
    next.section = ''
    next.chapter = ''
    next.topic = undefined
    next.questionType = ''
    next.examIds = []
    next.examPatternId = undefined
    next.toughnessLevel = undefined
    next.difficulty = undefined
    next.source = undefined
    next.marking = undefined
    delete next.unit
  } else {
    const tags = applyHybridCurriculumTags(next.subject, {
      section: next.section,
      unit: next.unit,
      chapter: next.chapter,
      topic: next.topic,
    })
    next.section = tags.section || ''
    next.chapter = tags.chapter || ''
    const topic = topicForReadyHybridDraft(next.subject, next.chapter, tags.topic || next.topic)
    next.topic = topic || undefined
    delete next.unit
    next.needsAction = false
  }

  if (isSimilar) {
    next.sub_bank_type = SUB_BANK_TYPE_SIMILAR_PYQ
    next.subBankType = SUB_BANK_TYPE_SIMILAR_PYQ
    next.bankSource = 'ai_similar_pyq'
  } else {
    next.sub_bank_type = SUB_BANK_TYPE_AI
    next.subBankType = SUB_BANK_TYPE_AI
    next.bankSource = 'ai_hybrid'
    next.hybridSyncedFromPostgres = true
  }

  const stem = sanitizeHybridLatexText(String(next.text ?? next.question_text ?? '').trim())
  if (stem) next.text = stem

  const shapeType = needsAction ? typeBeforeClear : next.questionType
  if (shapeType === 'single_correct' || shapeType === 'true_false') {
    const options = Array.isArray(next.options)
      ? next.options
          .map((o) => sanitizeHybridOption(stem, stripHybridMcqOptionLabel(o)))
          .filter((o) => o)
          .slice(0, 4)
      : []
    if (options.length) {
      next.options = options
      next.correctIndex = resolveCorrectIndex(next.correctAnswer ?? next.correct_answer, options)
    }
  }

  if (!needsAction) {
    if (next.source) {
      next.source = normalizeHybridSourceLabel(next.source)
    } else if (next.hybridSyncedFromPostgres || next.bankSource === 'ai_hybrid') {
      next.source = HYBRID_AI_SOURCE
    }
    const typeDef = getQuestionType(next.questionType ?? 'single_correct')
    if (typeDef?.defaultMarking && !next.marking) {
      next.marking = { ...typeDef.defaultMarking }
    }
    if (!next.difficulty && next.toughnessLevel != null) {
      const n = Number(next.toughnessLevel)
      next.difficulty = n <= 3 ? 'Easy' : n >= 8 ? 'Hard' : 'Medium'
    }
  }

  const healed = healQuestionLatexForBank(next)
  if (!needsAction) return healed
  return {
    ...healed,
    subject: '',
    section: '',
    chapter: '',
    topic: undefined,
    questionType: '',
    examIds: [],
    examPatternId: undefined,
    toughnessLevel: undefined,
    difficulty: undefined,
    source: undefined,
    marking: undefined,
  }
}

/** @param {Record<string, unknown>} row */
function hybridPoolRowSavedTimestamp(row) {
  const raw = row.created_at ?? row.createdAt ?? row.saved_at ?? row.savedAt
  if (raw != null && raw !== '') {
    const t = Date.parse(String(raw))
    if (Number.isFinite(t) && t > 0) return t
  }
  return Date.now()
}

/** @param {unknown} answer @param {string[]} options */
function resolveCorrectIndex(answer, options) {
  const opts = Array.isArray(options) ? options : []
  if (!opts.length) return 0
  const raw = String(answer ?? '').trim()
  if (/^[A-D]$/i.test(raw)) return Math.min(opts.length - 1, raw.toUpperCase().charCodeAt(0) - 65)
  const asNum = Number(raw)
  if (Number.isInteger(asNum) && asNum >= 0 && asNum < opts.length) return asNum
  const idx = opts.findIndex((o) => String(o ?? '').trim() === raw)
  return idx >= 0 ? idx : 0
}

/**
 * @param {Record<string, unknown>} row Postgres pool row
 */
export function mapHybridPoolRowToBankDraft(row) {
  const id = String(row.id ?? row.question_id ?? '').trim()
  if (!id) return null
  const options = Array.isArray(row.options) ? row.options.map(String) : []
  const questionType = mapHybridPoolQuestionTypeToBankId(row.question_type, options)
  const typeDef = getQuestionType(questionType)
  const subBank = normalizeSubBankType(row.sub_bank_type) || SUB_BANK_TYPE_AI
  const examPatternId = mapHybridExamLabelToSlug(row.exam)
  const subject = mapHybridSubjectLabelToSlug(row.subject)
  const parentId = row.parent_id ? String(row.parent_id) : undefined
  const needsAction = hybridRowNeedsAction(row)
  const isPattern = row.is_pattern === true || row.isPattern === true || row.patternQuestion === true
  const toughnessRaw = Number(row.toughness_level ?? row.toughnessLevel)
  const toughnessLevel =
    Number.isInteger(toughnessRaw) && toughnessRaw >= 1 && toughnessRaw <= 10
      ? toughnessRaw
      : String(row.difficulty ?? '').toLowerCase() === 'hard'
        ? 8
        : String(row.difficulty ?? '').toLowerCase() === 'easy'
          ? 2
          : 5

  /** @type {import('../data/tests').Question} */
  const draft = {
    id,
    bankStatus: 'draft',
    questionType,
    subject,
    section: needsAction ? '' : String(row.unit ?? row.section ?? '').trim(),
    chapter: needsAction ? '' : String(row.chapter ?? '').trim(),
    topic: needsAction ? undefined : row.topic ? String(row.topic) : undefined,
    examIds: [examPatternId],
    examPatternId,
    text: sanitizeHybridLatexText(String(row.text ?? row.question_text ?? '').trim()),
    solution: sanitizeHybridLatexText(String(row.step_by_step_solution ?? row.solution ?? '').trim()),
    toughnessLevel: needsAction ? undefined : toughnessLevel,
    difficulty: needsAction ? undefined : String(row.difficulty ?? '').trim() || undefined,
    needsAction,
    patternQuestion: isPattern,
    isPattern,
    approval_status: row.approval_status ? String(row.approval_status) : undefined,
    source: HYBRID_AI_SOURCE,
    bankSource: subBank === SUB_BANK_TYPE_SIMILAR_PYQ ? 'ai_similar_pyq' : 'ai_hybrid',
    sub_bank_type: subBank,
    bloomLevel: row.bloom_level ? String(row.bloom_level) : undefined,
    marking: { ...(typeDef.defaultMarking ?? {}) },
    savedAt: hybridPoolRowSavedTimestamp(row),
    hybridSyncedFromPostgres: true,
  }

  if (
    questionType === 'single_correct' ||
    questionType === 'true_false' ||
    questionType === 'matrix_match' ||
    questionType === 'passage_scq'
  ) {
    draft.options = options
    draft.correctIndex = resolveCorrectIndex(row.correct_answer, options)
  } else if (questionType === 'multiple_correct') {
    draft.options = options
    draft.correctIndices = [resolveCorrectIndex(row.correct_answer, options)]
  } else if (questionType === 'numerical') {
    const n = Number(row.correct_answer)
    if (Number.isFinite(n)) draft.correctNumerical = n
  } else if (questionType === 'integer') {
    const n = Number(row.correct_answer)
    if (Number.isInteger(n)) draft.correctInteger = n
  }

  if (subBank === SUB_BANK_TYPE_SIMILAR_PYQ) {
    draft.similarToPyq = true
    if (parentId) {
      draft.parentQuestionId = parentId
      draft.similarToId = parentId
      draft.seedPyqId = parentId
    }
  }
  if (row.is_child === true && parentId) {
    draft.parentQuestionId = parentId
  }

  return repairHybridDraftForBank(draft)
}

/**
 * @param {{ approvedOnly?: boolean, subBankType?: string, limit?: number, signal?: AbortSignal }} [opts]
 */
export async function fetchHybridQuestionPool(opts = {}) {
  const params = new URLSearchParams()
  params.set('limit', String(Math.max(1, Math.min(5000, Number(opts.limit) || 500))))
  const approvedOnly = opts.approvedOnly === true
  params.set('approved_only', approvedOnly ? 'true' : 'false')
  const sub = String(opts.subBankType ?? '').trim()
  if (sub) params.set('sub_bank_type', sub)

  const res = await fetchHybridApi(`${API_BASE}/questions/pool?${params.toString()}`, {
    signal: opts.signal,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const rawDetail =
      (typeof data.detail === 'string' && data.detail) ||
      data.error ||
      ''
    const detail = String(rawDetail).trim()
    if (res.status === 503) {
      throw new Error(
        detail ||
          'TestVantages Hybrid AI is not running (port 8000). Press F5 and keep the bottom terminal open.',
      )
    }
    const generic500 =
      res.status >= 500 &&
      (!detail || /^internal server error$/i.test(detail) || /^hybrid pool fetch failed/i.test(detail))
    const dbLikely =
      generic500 ||
      (res.status >= 500 &&
        /connect|connection|postgres|asyncpg|vector|database|refused|timeout/i.test(detail))
    throw new Error(
      dbLikely
        ? 'Hybrid AI could not reach Postgres. Press F5 once to restart the app (fixes a stale server). If it persists, use POSTGRES-SETUP-SIMPLE.txt.'
        : detail || `Hybrid pool fetch failed (${res.status})`,
    )
  }
  const questions = Array.isArray(data.questions) ? data.questions : []
  const count = Number(data.count)
  return {
    questions,
    count: Number.isFinite(count) ? count : questions.length,
  }
}

/**
 * Fix unit/chapter on Hybrid AI cards already in the browser bank.
 * Does not change question text and does not delete questions.
 * @returns {{ changed: number }}
 */
export function retagLocalHybridCurriculumTags() {
  if (typeof window === 'undefined') return { changed: 0 }
  const bank = loadQuestionBank()
  let changed = 0
  const questions = (bank.questions ?? []).map((q) => {
    if (!isHybridAiBankQuestion(q)) return q
    if (hybridRowNeedsAction(q)) return q
    const applied = applyHybridCurriculumTags(q.subject, {
      section: q.section,
      unit: q.unit,
      chapter: q.chapter,
      topic: q.topic,
    })
    if (!applied.mapped) return q
    const topic = applied.topic || ''
    if (
      String(q.section ?? '') === applied.section &&
      String(q.chapter ?? '') === applied.chapter &&
      String(q.topic ?? '') === topic
    ) {
      return q
    }
    changed += 1
    return {
      ...q,
      section: applied.section,
      chapter: applied.chapter,
      topic: topic || undefined,
    }
  })
  if (changed) saveQuestionBank({ ...bank, questions })
  return { changed }
}

/**
 * Import new Hybrid AI rows into localStorage (drafts — publish from Question Bank).
 * @param {{ approvedOnly?: boolean, limit?: number }} [opts]
 */
export async function syncHybridAiIntoQuestionBank(opts = {}) {
  retagLocalHybridCurriculumTags()
  const existing = peekUploadedQuestions()
  const seen = new Set(existing.map((q) => String(q.id ?? '').trim()).filter(Boolean))
  const pool = await fetchHybridQuestionPool({
    approvedOnly: opts.approvedOnly === true,
    limit: opts.limit ?? 2000,
  })
  const rows = pool.questions
  let poolAiCount = 0
  const candidates = []
  for (const row of rows) {
    const sub = normalizeSubBankType(row.sub_bank_type) || SUB_BANK_TYPE_AI
    if (sub !== SUB_BANK_TYPE_AI && sub !== SUB_BANK_TYPE_SIMILAR_PYQ) continue
    if (sub === SUB_BANK_TYPE_AI) poolAiCount += 1
    const id = String(row.id ?? row.question_id ?? '').trim()
    if (!id || seen.has(id)) continue
    const draft = mapHybridPoolRowToBankDraft(row)
    if (!draft?.text) continue
    seen.add(id)
    candidates.push(draft)
  }
  const { toUpdate, toAdd } = splitHybridSyncDrafts(existing, candidates)
  if (toUpdate.length) {
    const bank = loadQuestionBank()
    const byId = new Map(toUpdate.map((item) => [String(item.existing.id), item.draft]))
    let changed = false
    bank.questions = bank.questions.map((q) => {
      const draft = byId.get(String(q.id))
      if (!draft) return q
      changed = true
      return mergeHybridSyncIntoExisting(q, draft)
    })
    if (changed) saveQuestionBank(bank)
  }
  const base = {
    added: 0,
    ids: [],
    updated: toUpdate.length,
    poolCount: pool.count,
    poolAiCount,
  }
  if (!toAdd.length) return base
  const saved = addUploadedQuestionsBulk(toAdd)
  bumpMasterPoolCache()
  return {
    ...base,
    added: saved.length,
    ids: saved.map((q) => q.id),
  }
}

/**
 * Wait until Postgres AI pool grows past baseline (batch still running) or attempts exhaust.
 * @param {{ baselinePoolAiCount?: number, attempts?: number, intervalMs?: number, signal?: AbortSignal }} opts
 */
export async function waitForHybridAiPoolReady(opts = {}) {
  const attempts = Math.max(1, Number(opts.attempts) || 12)
  const intervalMs = Math.max(2000, Number(opts.intervalMs) || 5000)
  const baselineRaw = Number(opts.baselinePoolAiCount)
  const baseline = Number.isFinite(baselineRaw) ? baselineRaw : null
  /** @type {Error | null} */
  let lastError = null
  for (let i = 0; i < attempts; i++) {
    try {
      const count = await fetchHybridAiPoolCount({ signal: opts.signal })
      const ready = baseline == null ? count > 0 : count > baseline
      if (ready) return { poolAiCount: count, ready: true }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
    if (i < attempts - 1) await sleepMs(intervalMs)
  }
  if (lastError) throw lastError
  let poolAiCount = baseline ?? 0
  try {
    poolAiCount = await fetchHybridAiPoolCount({ signal: opts.signal })
  } catch (err) {
    if (!lastError) lastError = err instanceof Error ? err : new Error(String(err))
    if (lastError) throw lastError
  }
  return { poolAiCount, ready: false }
}

/**
 * Poll Postgres after a background Hybrid job (batch or clone-scaled).
 * Waits for new AI rows before syncing — avoids "0 rows" while Gemini is still running.
 * @param {{ attempts?: number, intervalMs?: number, baselinePoolAiCount?: number, limit?: number, signal?: AbortSignal }} [opts]
 */
/**
 * Poll one queued Hybrid job. Returns null when this server has no job route (older API).
 * @param {string} jobId
 * @param {{ signal?: AbortSignal }} [opts]
 */
export async function fetchHybridGenerationJob(jobId, opts = {}) {
  const res = await fetchHybridApi(`${API_BASE}/generate/jobs/${encodeURIComponent(jobId)}`, {
    signal: opts.signal,
  })
  const data = await res.json().catch(() => ({}))
  if (res.status === 404) return null
  if (!res.ok) {
    const detail =
      (typeof data.detail === 'string' && data.detail) ||
      (typeof data.error === 'string' && data.error) ||
      ''
    if (res.status === 503 || res.status === 502) {
      throw new Error(String(detail).trim() || HYBRID_API_DOWN_MESSAGE)
    }
    throw new Error(String(detail).trim() || `Hybrid AI job check failed (${res.status})`)
  }
  return data
}

/**
 * Wait until the queued job has inserted rows. Does not sync the bank first.
 * @param {string} jobId
 * @param {{ attempts?: number, intervalMs?: number, signal?: AbortSignal }} [opts]
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function waitForHybridGenerationJob(jobId, opts = {}) {
  const attempts = Math.max(1, Number(opts.attempts) || 24)
  const intervalMs = Math.max(2000, Number(opts.intervalMs) || 5000)
  for (let i = 0; i < attempts; i++) {
    const job = await fetchHybridGenerationJob(jobId, { signal: opts.signal })
    if (job == null) return null
    const status = String(job.status || '')
    const inserted = Number(job.inserted) || 0
    if (status === 'error' || (status === 'done' && inserted <= 0)) {
      throw new Error(
        String(job.error || '').trim() || 'Hybrid AI did not save any questions.',
      )
    }
    if (status === 'done' && inserted > 0) return job
    if (i < attempts - 1) await sleepMs(intervalMs)
  }
  throw new Error(
    'Hybrid AI is still drafting. Wait a minute, then use Sync from Hybrid AI (do not re-queue yet).',
  )
}

export async function syncHybridAiAfterJob(opts = {}) {
  const attempts = Math.max(1, Number(opts.attempts) || 12)
  const intervalMs = Math.max(2000, Number(opts.intervalMs) || 5000)
  const baselineRaw = Number(opts.baselinePoolAiCount)
  const baseline = Number.isFinite(baselineRaw) ? baselineRaw : null
  const jobIds = [
    ...(Array.isArray(opts.jobIds) ? opts.jobIds : []),
    opts.jobId,
  ]
    .map((id) => String(id ?? '').trim())
    .filter(Boolean)

  let usedJobApi = false
  if (jobIds.length) {
    const jobErrors = []
    for (const id of jobIds) {
      try {
        const job = await waitForHybridGenerationJob(id, {
          attempts,
          intervalMs,
          signal: opts.signal,
        })
        if (job == null) {
          usedJobApi = false
          break
        }
        usedJobApi = true
      } catch (err) {
        usedJobApi = true
        jobErrors.push(err instanceof Error ? err : new Error(String(err)))
      }
    }
    if (usedJobApi) {
      if (jobErrors.length) throw jobErrors[0]
      return syncHybridAiIntoQuestionBank({
        approvedOnly: false,
        limit: opts.limit ?? 2000,
      })
    }
  }

  const wait = await waitForHybridAiPoolReady({
    baselinePoolAiCount: baseline ?? undefined,
    attempts,
    intervalMs,
    signal: opts.signal,
  })

  if (!hybridPoolReadyForImport(wait, baseline)) {
    return {
      added: 0,
      ids: [],
      poolAiCount: wait.poolAiCount,
      pending: true,
    }
  }

  return syncHybridAiIntoQuestionBank({
    approvedOnly: false,
    limit: opts.limit ?? 2000,
  })
}
