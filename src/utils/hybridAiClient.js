/**
 * Thin client for TestVantages Hybrid AI — same-origin `/api/*` via Vite (127.0.0.1:5173).
 * Use instead of direct Gemini /vision/scq-trial for question generation and clones.
 */
import { API_BASE } from '../config/platform.js'
import {
  mapExamSlugToHybridLabel,
  mapSubjectSlugToHybridLabel,
  mapTrialTypeMixToHybridCode,
  resolveHybridCurriculumTags,
} from './hybridMetadata.js'
import { isOfficialPyq } from './pyqDetect.js'

export class HybridAiError extends Error {
  /** @param {string} message @param {{ status?: number, body?: unknown }} [meta] */
  constructor(message, meta = {}) {
    super(message)
    this.name = 'HybridAiError'
    this.status = meta.status
    this.body = meta.body
  }
}

/**
 * @param {string} path e.g. `/generate/batch`
 * @param {Record<string, unknown>} body
 * @param {{ timeoutMs?: number }} [opts]
 */
async function postHybridJson(path, body, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : 120_000
  const offline =
    'TestVantages Hybrid AI is not running (port 8000). Press F5 and keep the bottom terminal open.'
  let res
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    if (err instanceof HybridAiError) throw err
    const name = err && typeof err === 'object' && 'name' in err ? String(err.name) : ''
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new HybridAiError(
        'Hybrid AI did not answer in time. Press F5 and keep the bottom terminal open.',
      )
    }
    throw new HybridAiError(offline)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail =
      (typeof data.detail === 'string' && data.detail) ||
      (Array.isArray(data.detail) && data.detail[0]?.msg) ||
      (typeof data.error === 'string' && data.error) ||
      (typeof data.message === 'string' && data.message) ||
      (res.status === 503
        ? 'TestVantages Hybrid AI is not running (port 8000). Press F5 and keep the bottom terminal open.'
        : `Hybrid AI request failed (${res.status})`)
    throw new HybridAiError(String(detail), { status: res.status, body: data })
  }
  return data
}

/** Queue new AI questions (ai sub_bank). */
export function queueBatch(payload) {
  return postHybridJson('/generate/batch', payload)
}

/** Persist the pattern flag on a Hybrid pool row. Local bank update is separate. */
export function markHybridQuestionPattern(questionId, isPattern = true) {
  const id = encodeURIComponent(String(questionId ?? '').trim())
  return postHybridJson(`/questions/${id}/pattern`, { is_pattern: Boolean(isPattern) })
}

/** Queue scaled similar / duplicate clones from a parent question. */
export function queueCloneScaled(payload) {
  return postHybridJson('/questions/clone-scaled', payload)
}

/** Suggested bank tags, answer, and solution. Does not save the question. */
export function fillOfficialPyqTags(body) {
  return postHybridJson('/official-pyq/fill-tags', body, { timeoutMs: 90_000 })
}

/** One similar question for a pending replica. Does not approve or publish. */
export function requestOfficialPyqReplicaQuestion(body) {
  return postHybridJson('/official-pyq/replica-question', body, { timeoutMs: 120_000 })
}

/** Four difficulties of one parent question. Does not approve or publish. */
export function requestOfficialPyqReplicaSet(body) {
  return postHybridJson('/official-pyq/replica-set', body, { timeoutMs: 180_000 })
}

/** Live token estimate for clone batches (FastAPI /api/clones/estimate-tokens). */
export function estimateCloneTokens(body) {
  return postHybridJson('/clones/estimate-tokens', body, { timeoutMs: 45_000 })
}

/** @param {Record<string, unknown>} payload @param {{ includeSyllabus?: boolean, eligibleForCaching?: boolean }} opts */
export function withCloneCachingOptions(payload, opts = {}) {
  const includeSyllabus = Boolean(opts.includeSyllabus)
  const eligibleForCaching = Boolean(opts.eligibleForCaching)
  const use_caching_optimizer = eligibleForCaching || includeSyllabus
  return use_caching_optimizer ? { ...payload, use_caching_optimizer: true } : payload
}

/**
 * Upload a textbook PDF for cached-context ingestion.
 * @param {File} file
 * @param {{ signal?: AbortSignal }} [opts]
 */
export async function uploadBookCached(file, opts = {}) {
  const form = new FormData()
  form.append('file', file, file.name || 'upload.pdf')
  const subject = String(opts.subject ?? '').trim()
  if (subject) {
    form.append('subject_form', subject)
  }
  const res = await fetch(`${API_BASE}/ingest/book-cached`, {
    method: 'POST',
    body: form,
    signal: opts.signal,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail =
      (typeof data.detail === 'string' && data.detail) ||
      data.error ||
      `Book upload failed (${res.status})`
    throw new HybridAiError(String(detail), { status: res.status, body: data })
  }
  return data
}

/** @param {unknown} examId */
export function mapExamSlugToHybrid(examId) {
  return mapExamSlugToHybridLabel(examId)
}

/** @param {unknown} subjectSlug @param {unknown} [chapter] */
export function mapSubjectSlugToHybrid(subjectSlug, chapter) {
  return mapSubjectSlugToHybridLabel(subjectSlug, chapter)
}

/** @param {unknown} toughness 1–10 */
export function mapToughnessToHybridDifficulty(toughness) {
  const t = Number(toughness)
  if (Number.isFinite(t)) {
    if (t <= 3) return 'Easy'
    if (t >= 8) return 'Hard'
  }
  return 'Medium'
}

/** @param {unknown} typeMix */
export function mapTrialTypeMixToHybrid(typeMix) {
  return mapTrialTypeMixToHybridCode(typeMix)
}

/**
 * @param {object} job trial / curriculum job
 * @param {number} count
 * @param {unknown} typeMix
 */
export function buildBatchPayloadFromTrialJob(job, count, typeMix) {
  const tags = resolveHybridCurriculumTags(job.subject, {
    section: job.section,
    unit: job.unit,
    chapter: job.chapter,
    topic: job.topic,
  })
  const chapter = tags.mapped
    ? tags.chapter
    : String(job.chapter ?? '').trim() || String(job.section ?? 'General').trim() || 'General'
  return {
    exam: mapExamSlugToHybrid(job.examId),
    subject: mapSubjectSlugToHybrid(job.subject, chapter),
    unit: tags.mapped ? tags.unit : undefined,
    section: tags.mapped ? tags.unit : undefined,
    chapter,
    topic: tags.topic || undefined,
    difficulty: mapToughnessToHybridDifficulty(job.seedToughness),
    toughness_level: Number.isFinite(Number(job.seedToughness))
      ? Math.min(10, Math.max(1, Math.round(Number(job.seedToughness))))
      : undefined,
    question_type: mapTrialTypeMixToHybrid(typeMix),
    count: Math.max(1, Math.min(100, Number(count) || 1)),
  }
}

/**
 * @param {import('../data/tests').Question | null | undefined} question
 */
export function formatQuestionSourceText(question) {
  const stem = String(question?.text ?? question?.stem ?? '').trim()
  const opts = Array.isArray(question?.options) ? question.options : []
  if (!opts.length) return stem
  const lines = opts.map((o, i) => `${String.fromCharCode(65 + i)}) ${String(o ?? '').trim()}`)
  return `${stem}\n\n${lines.join('\n')}`
}

/**
 * @param {import('../data/tests').Question} seed
 * @param {{ count?: number, difficultyOffset?: number }} [opts]
 */
export function similarClonePayloadFromSeed(seed, opts = {}) {
  const count = Math.max(1, Number(opts.count) || 3)
  const difficultyOffset = Number(opts.difficultyOffset)
  const offset = Number.isFinite(difficultyOffset) ? Math.min(2, Math.max(-1, difficultyOffset)) : 1
  const chapter = String(seed.chapter ?? seed.section ?? 'General').trim() || 'General'
  const examSlug = seed.examPatternId || (Array.isArray(seed.examIds) ? seed.examIds[0] : null) || 'jee-main'
  return {
    parent_question_id: String(seed.id ?? '').trim(),
    source_question_text: formatQuestionSourceText(seed),
    count,
    difficulty_offset: offset,
    parent_is_pyq: isOfficialPyq(seed) || seed?.officialPyq === true,
    subject: mapSubjectSlugToHybridLabel(seed.subject, chapter),
    exam: mapExamSlugToHybridLabel(examSlug),
    chapter,
    topic: seed.topic ? String(seed.topic) : undefined,
  }
}

export const HYBRID_AI_ROUTE = '/question-bank/ai-generate'
