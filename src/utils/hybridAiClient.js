/**
 * Thin client for TestVantage Hybrid AI (FastAPI on port 8000, proxied via /api).
 * Use instead of direct Gemini /vision/scq-trial for question generation and clones.
 */
import { API_BASE } from '../config/platform.js'
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
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail =
      (typeof data.detail === 'string' && data.detail) ||
      (Array.isArray(data.detail) && data.detail[0]?.msg) ||
      data.error ||
      `Hybrid AI request failed (${res.status})`
    throw new HybridAiError(String(detail), { status: res.status, body: data })
  }
  return data
}

/** Queue new AI questions (ai sub_bank). */
export function queueBatch(payload) {
  return postHybridJson('/generate/batch', payload)
}

/** Queue scaled similar / duplicate clones from a parent question. */
export function queueCloneScaled(payload) {
  return postHybridJson('/questions/clone-scaled', payload)
}

const EXAM_SLUG_TO_HYBRID = {
  'jee-main': 'JEE Main',
  'jee-advanced': 'JEE Advanced',
  neet: 'NEET',
}

const SUBJECT_SLUG_TO_HYBRID = {
  mathematics: 'Mathematics',
  physics: 'Physics',
  chemistry: 'Chemistry',
}

const TRIAL_TYPE_TO_HYBRID = {
  single_correct: 'Single Choice',
  multiple_correct: 'Multiple Choice',
  numerical: 'Numerical',
  integer: 'Numerical',
  true_false: 'Single Choice',
  matrix_match: 'Single Choice',
  passage_scq: 'Single Choice',
  passage_mcq: 'Multiple Choice',
}

/** @param {unknown} examId */
export function mapExamSlugToHybrid(examId) {
  const key = String(examId ?? 'jee-main').trim().toLowerCase()
  return EXAM_SLUG_TO_HYBRID[key] || 'JEE Main'
}

/** @param {unknown} subjectSlug @param {unknown} [chapter] */
export function mapSubjectSlugToHybrid(subjectSlug, chapter) {
  const key = String(subjectSlug ?? '').trim().toLowerCase()
  if (SUBJECT_SLUG_TO_HYBRID[key]) return SUBJECT_SLUG_TO_HYBRID[key]
  if (key === 'biology') {
    const c = String(chapter ?? '')
    if (/zoology|human|animal|reproduction|health|biotechnology/i.test(c)) return 'Zoology'
    return 'Botany'
  }
  const raw = String(subjectSlug ?? 'General').trim()
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : 'General'
}

/** @param {unknown} toughness 1 10 */
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
  if (typeMix === 'all' || typeMix == null) return 'Single Choice'
  const list = Array.isArray(typeMix) ? typeMix : [typeMix]
  for (const raw of list) {
    const id = String(raw ?? '').trim()
    if (TRIAL_TYPE_TO_HYBRID[id]) return TRIAL_TYPE_TO_HYBRID[id]
  }
  return 'Single Choice'
}

/**
 * @param {object} job trial / curriculum job
 * @param {number} count
 * @param {unknown} typeMix
 */
export function buildBatchPayloadFromTrialJob(job, count, typeMix) {
  const chapter = String(job.chapter ?? job.section ?? 'General').trim() || 'General'
  return {
    exam: mapExamSlugToHybrid(job.examId),
    subject: mapSubjectSlugToHybrid(job.subject, chapter),
    chapter,
    difficulty: mapToughnessToHybridDifficulty(job.seedToughness),
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
  return {
    parent_question_id: String(seed.id ?? '').trim(),
    source_question_text: formatQuestionSourceText(seed),
    count,
    difficulty_offset: offset,
    parent_is_pyq: isOfficialPyq(seed) || seed?.officialPyq === true,
  }
}

export const HYBRID_AI_ROUTE = '/question-bank/ai-generate'
