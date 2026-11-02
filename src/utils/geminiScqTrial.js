/**
 * Curriculum trial helpers — question generation now uses Hybrid AI (hybridAiClient.js).
 * Gemini prompts below remain for legacy tooling only; do not call /vision/scq-trial from new UI.
 * Metatags come only from CURRICULUM_TREE (no invented chapter names).
 * Always draft. Never publish.
 */

import { CURRICULUM_TREE } from '../data/curriculum.js'
import {
  CANONICAL_QUESTION_TYPE_IDS,
  TRUE_FALSE_OPTIONS,
  getQuestionType,
} from '../data/questionTypes.js'
import {
  attachDuplicateReviewFields,
  findDuplicateQuestions,
} from './detectDuplicateQuestion.js'
import {
  clampToughnessLevel,
  enforceTrialToughnessMix,
  plannedToughnessLevels,
  toughnessMixHint,
  toughnessQuotaForCount,
} from './bankToughnessMix.js'
import {
  PYQ_STYLE_AI_BANK_SOURCE,
  PYQ_STYLE_AI_SOURCE,
  SIMILAR_TO_PYQ_BANK_SOURCE,
  SIMILAR_TO_PYQ_SOURCE,
  AI_SIMILAR_BANK_SOURCE,
  AI_SIMILAR_SOURCE,
} from './pyqDetect.js'
import { assignAiSimilarChildId } from './questionFamily.js'
import { PYQ_GEMINI_JSON_SCHEMA_HINT, validateGeminiPyqGenerateItem } from './pyqGeminiExtract.js'
import { jsonParseWithLatexSalvage } from './repairJsonLatexEscapes.js'
import { buildGeminiPyqStyleFields } from './pyqSlotMeta.js'
import { DEFAULT_MSQ_MARKING } from './msqMarking.js'
import { validateNumericalAnswer } from './numericalAnswer.js'
import { defaultMatrixColLabels, MATRIX_ROW_COUNT } from './matrixMatch.js'
import { latexExtractionIncomplete } from './healTruncatedLatex.js'
import { repairSmashedProseVmatrixOcr } from './repairSmashedProseVmatrixOcr.js'
import { wrapBareLatexRuns } from './wrapBareLatexRuns.js'
import { finalizeStemForBank } from './stemBankGuard.js'

export const GEMINI_TRIAL_SOURCE = 'Gemini trial'
/** @deprecated Use GEMINI_TRIAL_SOURCE */
export const SCQ_TRIAL_SOURCE = GEMINI_TRIAL_SOURCE
export const SCQ_TRIAL_COUNT = 10
export const TRIAL_DEFAULT_COUNT = 10
export const TRIAL_COUNT_MIN = 1
export const TRIAL_COUNT_MAX = 50
export const TRIAL_COUNT_OPTIONS = [5, 10, 15, 20, 25]
export const TRIAL_COUNT_CUSTOM = 'custom'
export const TRIAL_GENERATABLE_TYPE_IDS = [...CANONICAL_QUESTION_TYPE_IDS]
/** Staff pick 3 or 5 similar-from-PYQ drafts per click. Default 3. */
export const SIMILAR_FROM_PYQ_COUNTS = [3, 5]
export const SIMILAR_FROM_PYQ_DEFAULT_COUNT = 3
export { enforceTrialToughnessMix, plannedToughnessLevels, toughnessMixHint, toughnessQuotaForCount }
export const SCQ_TRIAL_PROGRESS_FILENAME = 'gemini-scq-trial-progress.json'
export const SCQ_TRIAL_DRAFTS_FILENAME = 'gemini-scq-trial-drafts.json'
export const SCQ_TRIAL_LIVE_FILENAME = 'gemini-scq-trial-live.json'
export const SCQ_TRIAL_LOCK_FILENAME = 'gemini-scq-trial.lock'

/** ~10 RPM free-tier spacing (ms) after each chapter call. */
export const SCQ_TRIAL_GAP_MS = 6500

export const SCQ_TRIAL_MARKING = { correct: 4, wrong: -1, unattempted: 0 }

/**
 * JEE Main = PCM. NEET = PCB (Biology from CURRICULUM_TREE.biology).
 * Do not invent Biology chapters for JEE.
 */
export const SCQ_TRIAL_PLANS = [
  { examId: 'jee-main', subject: 'mathematics', examLabel: 'JEE Main' },
  { examId: 'jee-main', subject: 'physics', examLabel: 'JEE Main' },
  { examId: 'jee-main', subject: 'chemistry', examLabel: 'JEE Main' },
  { examId: 'jee-advanced', subject: 'mathematics', examLabel: 'JEE Advanced' },
  { examId: 'jee-advanced', subject: 'physics', examLabel: 'JEE Advanced' },
  { examId: 'jee-advanced', subject: 'chemistry', examLabel: 'JEE Advanced' },
  { examId: 'neet', subject: 'physics', examLabel: 'NEET UG' },
  { examId: 'neet', subject: 'chemistry', examLabel: 'NEET UG' },
  { examId: 'neet', subject: 'biology', examLabel: 'NEET UG' },
]

/** Years offered for PYQ-style (AI) generation — tag only, not official papers. */
export const PYQ_STYLE_YEARS = Array.from({ length: 12 }, (_, i) => 2015 + i)

/**
 * JEEE Main (typo) and everyday aliases → jee-main / jee-advanced / neet.
 * @param {unknown} raw
 * @returns {'jee-main' | 'jee-advanced' | 'neet'}
 */
export function normalizeTrialExamId(raw) {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
  if (s === 'neet' || s === 'neet-ug' || s === 'neetug') return 'neet'
  if (
    s === 'jee-advanced' ||
    s === 'jee-adv' ||
    s === 'advanced' ||
    s === 'iit-jee' ||
    s === 'iitjee'
  ) {
    return 'jee-advanced'
  }
  return 'jee-main'
}

/** @param {unknown} examId */
export function trialExamLabel(examId) {
  const id = normalizeTrialExamId(examId)
  if (id === 'neet') return 'NEET'
  if (id === 'jee-advanced') return 'JEE Advanced'
  return 'JEE Main'
}

/** @param {unknown} raw */
export function normalizePyqYear(raw) {
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  const y = Math.round(n)
  if (y < 1990 || y > 2100) return null
  return y
}

const SUBJECT_LABEL = {
  mathematics: 'Mathematics',
  physics: 'Physics',
  chemistry: 'Chemistry',
  biology: 'Biology',
}

export const SCQ_TRIAL_MODEL_CANDIDATES = [
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-3.5-flash',
  'gemini-flash-latest',
]

export function trialSubjectAllowed(examId, subject) {
  const id = normalizeTrialExamId(examId)
  const sub = String(subject ?? '').trim()
  if (id === 'jee-main' || id === 'jee-advanced') {
    return sub === 'mathematics' || sub === 'physics' || sub === 'chemistry'
  }
  if (id === 'neet') return sub === 'physics' || sub === 'chemistry' || sub === 'biology'
  return false
}

export function listBuiltInChapters(subject) {
  const tree = CURRICULUM_TREE[subject]
  if (!tree) return []
  const out = []
  for (const [section, chapters] of Object.entries(tree)) {
    if (!chapters || typeof chapters !== 'object') continue
    for (const [chapter, topics] of Object.entries(chapters)) {
      out.push({
        subject,
        section,
        chapter,
        topics: Array.isArray(topics) ? topics.map(String) : [],
      })
    }
  }
  return out
}

export function listTrialChapters(examId, subject) {
  const id = normalizeTrialExamId(examId)
  if (!trialSubjectAllowed(id, subject)) return []
  return listBuiltInChapters(subject).map((row) => ({
    ...row,
    examId: id,
    examLabel: trialExamLabel(id),
  }))
}

/**
 * Resolve trial chapter jobs from Subject → Unit → Chapter(s) selection.
 * - No unit → whole subject (all units/chapters).
 * - Unit, no chapters → whole unit.
 * - Chapters picked → only those chapters (must match built-in syllabus jobs).
 * @param {unknown} examId
 * @param {unknown} subject
 * @param {{ section?: string, chapters?: string[] }} [scope]
 */
export function resolveTrialJobs(examId, subject, scope = {}) {
  const all = listTrialChapters(examId, subject)
  const unit = String(scope.section ?? '').trim()
  if (!unit) return all
  const inUnit = all.filter((j) => j.section === unit)
  const picked = (scope.chapters ?? []).map(String).filter(Boolean)
  if (!picked.length) return inUnit
  const want = new Set(picked)
  return inUnit.filter((j) => want.has(j.chapter))
}

/**
 * Human label for generate buttons / logs.
 * @param {{ section?: string, chapters?: string[] }} scope
 * @param {ReturnType<typeof resolveTrialJobs>} jobs
 * @param {string} [subjectId]
 */
export function trialSelectionScopeLabel(scope, jobs, subjectId = '') {
  const n = jobs.length
  const sub = subjectLabel(subjectId)
  const picked = (scope.chapters ?? []).filter(Boolean)
  const unit = String(scope.section ?? '').trim()
  if (picked.length === 1) {
    return `1 selected chapter (${picked[0]})`
  }
  if (picked.length > 1) {
    return `${picked.length} selected chapters`
  }
  if (unit) {
    return `whole unit “${unit}” (${n} chapter${n === 1 ? '' : 's'})`
  }
  return `whole ${sub || 'subject'} (${n} chapter${n === 1 ? '' : 's'})`
}

let allTrialJobsCache = null

export function listAllTrialJobs() {
  if (allTrialJobsCache) return allTrialJobsCache
  const jobs = []
  for (const plan of SCQ_TRIAL_PLANS) {
    jobs.push(...listTrialChapters(plan.examId, plan.subject))
  }
  allTrialJobsCache = jobs
  return jobs
}

export function pickSmokeChapter() {
  const maths = listTrialChapters('jee-main', 'mathematics')
  const integ = maths.find((c) => /integration/i.test(c.chapter))
  return integ ?? maths[0] ?? null
}

export function trialJobKey(job) {
  return `${job.examId}::${job.subject}::${job.section}::${job.chapter}`
}

export function subjectLabel(subject) {
  return SUBJECT_LABEL[subject] ?? String(subject ?? '')
}

export function clampTrialCount(raw) {
  const n = Math.round(Number(raw))
  if (!Number.isFinite(n)) return TRIAL_DEFAULT_COUNT
  return Math.min(TRIAL_COUNT_MAX, Math.max(TRIAL_COUNT_MIN, n))
}

/**
 * Validate staff-entered count (preset or custom).
 * @param {unknown} raw
 * @returns {{ ok: true, count: number } | { ok: false, error: string }}
 */
export function validateTrialCount(raw) {
  const n = Math.round(Number(raw))
  if (!Number.isFinite(n) || String(raw ?? '').trim() === '') {
    return { ok: false, error: `Enter how many questions per chapter (${TRIAL_COUNT_MIN}–${TRIAL_COUNT_MAX}).` }
  }
  if (n < TRIAL_COUNT_MIN) {
    return { ok: false, error: `Minimum is ${TRIAL_COUNT_MIN} question per chapter.` }
  }
  if (n > TRIAL_COUNT_MAX) {
    return { ok: false, error: `Maximum is ${TRIAL_COUNT_MAX} questions per chapter.` }
  }
  return { ok: true, count: n }
}

/**
 * Resolve preset dropdown or custom input to a validated count.
 * @param {unknown} picker — preset number string or TRIAL_COUNT_CUSTOM
 * @param {unknown} [customRaw]
 */
export function resolveTrialCount(picker, customRaw) {
  if (String(picker ?? '') === TRIAL_COUNT_CUSTOM) {
    return validateTrialCount(customRaw)
  }
  const preset = Number(picker)
  if (TRIAL_COUNT_OPTIONS.includes(preset)) {
    return { ok: true, count: preset }
  }
  return validateTrialCount(picker)
}

/**
 * @param {unknown} raw
 * @returns {'all' | string[]}
 */
export function normalizeTrialTypeMix(raw) {
  if (raw === 'all' || raw == null || raw === '') return 'all'
  if (Array.isArray(raw)) {
    const list = raw.map(String).filter((t) => TRIAL_GENERATABLE_TYPE_IDS.includes(t))
    return list.length ? list : 'all'
  }
  if (typeof raw === 'string' && raw !== 'all') {
    const parts = raw
      .split(/[,|]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    const list = parts.filter((t) => TRIAL_GENERATABLE_TYPE_IDS.includes(t))
    return list.length ? list : 'all'
  }
  return 'all'
}

/** @typedef {{ type: string, subCount?: number, slotIndex?: number }} TrialTypeSlot */

const EXAM_TYPE_TEMPLATE_10 = {
  'jee-main': [
    ...Array(8).fill('single_correct'),
    ...Array(2).fill('numerical'),
  ],
  neet: [...Array(8).fill('single_correct'), { type: 'passage_scq', subCount: 2 }],
  'jee-advanced': [
    'single_correct',
    'single_correct',
    'multiple_correct',
    'multiple_correct',
    'matrix_match',
    'integer',
    'numerical',
    'true_false',
    { type: 'passage_scq', subCount: 2 },
  ],
}

/** @param {unknown} entry @returns {TrialTypeSlot} */
function normalizeTypeTemplateEntry(entry, slotIndex = 0) {
  if (entry && typeof entry === 'object' && entry.type) {
    return {
      type: String(entry.type),
      subCount: Math.max(2, Number(entry.subCount) || 2),
      slotIndex,
    }
  }
  return { type: String(entry ?? 'single_correct'), slotIndex }
}

/** @param {TrialTypeSlot[]} slots @param {number} count */
function trimTypePlanToCount(slots, count) {
  const out = []
  let total = 0
  for (const slot of slots) {
    const add = slot.subCount ?? 1
    if (total + add > count) {
      if (slot.subCount && count - total >= 2) {
        out.push({ ...slot, subCount: count - total })
        total = count
      } else if (!slot.subCount && total < count) {
        out.push(slot)
        total += 1
      }
      break
    }
    out.push(slot)
    total += add
  }
  while (total < count) {
    out.push({ type: 'single_correct', slotIndex: out.length })
    total += 1
  }
  return out
}

/**
 * Expand an exam template to exactly `count` question-equivalents (passage slots count subs).
 * @param {'jee-main' | 'jee-advanced' | 'neet'} examId
 * @param {number} count
 * @param {'all' | string[]} [typeMix]
 * @returns {TrialTypeSlot[]}
 */
export function planTrialQuestionTypes(examId, count, typeMix = 'all') {
  const n = clampTrialCount(count)
  const mix = normalizeTrialTypeMix(typeMix)
  if (mix !== 'all') {
    const slots = []
    let total = 0
    let i = 0
    while (total < n && i < n * 4) {
      const type = mix[i % mix.length]
      if (type === 'passage_scq' || type === 'passage_integer') {
        const room = n - total
        if (room >= 2) {
          slots.push({ type, subCount: Math.min(3, room), slotIndex: slots.length })
          total += Math.min(3, room)
        } else {
          slots.push({ type: 'single_correct', slotIndex: slots.length })
          total += 1
        }
      } else {
        slots.push({ type, slotIndex: slots.length })
        total += 1
      }
      i += 1
    }
    return trimTypePlanToCount(slots, n)
  }

  const id = normalizeTrialExamId(examId)
  const template = EXAM_TYPE_TEMPLATE_10[id] ?? EXAM_TYPE_TEMPLATE_10['jee-main']
  const normalized = template.map((entry, idx) => normalizeTypeTemplateEntry(entry, idx))
  const baseTotal = normalized.reduce((sum, s) => sum + (s.subCount ?? 1), 0)
  if (n === baseTotal) return normalized

  const expanded = []
  let total = 0
  let idx = 0
  while (total < n && idx < n * 3) {
    const entry = normalized[idx % normalized.length]
    const slot = normalizeTypeTemplateEntry(entry, expanded.length)
    const add = slot.subCount ?? 1
    if (total + add > n) {
      if (slot.subCount && n - total >= 2) {
        expanded.push({ ...slot, subCount: n - total })
        total = n
      } else if (!slot.subCount) {
        expanded.push({ ...slot, slotIndex: expanded.length })
        total += 1
      } else {
        expanded.push({ type: 'single_correct', slotIndex: expanded.length })
        total += 1
      }
    } else {
      expanded.push({ ...slot, slotIndex: expanded.length })
      total += add
    }
    idx += 1
  }
  return trimTypePlanToCount(expanded, n)
}

export function trialTypeMixLabel(examId, typeMix = 'all') {
  const mix = normalizeTrialTypeMix(typeMix)
  if (mix === 'all') {
    const id = normalizeTrialExamId(examId)
    if (id === 'jee-main') return 'All types mix — JEE Main style (SCQ + numerical)'
    if (id === 'neet') return 'All types mix — NEET style (SCQ + passage SCQ)'
    return 'All types mix — JEE Advanced style (SCQ, MSQ, MTC, IVQ, NVQ, T/F, passage)'
  }
  return `Selected types: ${mix.join(', ')}`
}

export const GEMINI_TRIAL_JSON_SCHEMA_HINT = `Return ONLY this JSON (no markdown fences):
{
  "questions": [
    {
      "questionType": "single_correct",
      "stem": "complete question, LaTeX in $...$",
      "options": ["A", "B", "C", "D"],
      "correctIndex": 0,
      "solution": "short working",
      "toughness": 5,
      "topic": "allowed topic"
    }
  ]
}
Type-specific fields (set questionType on every item):
- single_correct / passage_scq sub: stem, options[4], correctIndex 0-3, solution
- true_false: stem, options ["TRUE","FALSE"], correctIndex 0 or 1, solution
- multiple_correct: stem, options[4], correctIndices (array, 2+ indices), solution, msqMarking optional
- integer: stem only (no options), correctInteger 0-9999, solution
- numerical: stem only, correctNumerical number, optional numericalTolerance, solution
- matrix_match: stem, matrixRows[4], matrixCols[4 or 5], matrixAnswerKey {"0":[1],"1":[0],...}, matrixResponseMode "grid", solution
- passage_scq / passage_integer: passageText, subQuestions[{text, options?, correctIndex?, correctInteger?, correctNumerical?}] (2-3 subs), toughness, topic
Each item MUST match its assigned questionType. LaTeX in $...$. Double-escape backslashes in JSON.`

export const GEMINI_TRIAL_SYSTEM = `You write original-ish JEE Main / JEE Advanced / NEET practice questions for Classes 11-12.
Return ONLY valid JSON (no markdown fences). Never publish. Never copy a famous PYQ stem word-for-word.
Supported questionType values: single_correct, true_false, multiple_correct, matrix_match, integer, numerical, passage_scq, passage_integer.
Math and chemistry must use LaTeX inside $...$ (example: $\\frac{1}{2}$). Piecewise functions use \\begin{cases} row1 \\\\ row2 \\end{cases} and \\operatorname{sgn}.
Every item needs a COMPLETE stem (closed fractions, closed vmatrix/bmatrix, no leftover $$). Never invent a missing denominator or matrix entries. Never smash English words such as "Let" into vmatrix cells. If math is unknown, omit the item rather than emitting a partial extract.
Every item needs a complete stem (or passageText for passage types), valid answers for its type, and a real solution.
Practice batches follow Easy / Moderate / Tough mix (Easy = T1-T3, Moderate = T4-T7, Tough = T8-T10).
PYQ-style requests imitate that sitting's wording and actual difficulty only — they are NOT licensed official NTA or IIT papers. Do not force a 40/30/30 mix on PYQ-style items. Do not invent official paper dumps.
Similar-from-PYQ requests write NEW original items inspired by ONE seed. Never copy the official stem. Never label them Official PYQ. Toughness is the seed's T-band or one step higher — never easier, never a 40/30/30 mix.`

export const SCQ_TRIAL_SYSTEM = GEMINI_TRIAL_SYSTEM

export function clampSimilarFromPyqCount(raw) {
  return Number(raw) === 5 ? 5 : SIMILAR_FROM_PYQ_DEFAULT_COUNT
}

/** @param {unknown} raw @param {unknown} [examId] */
export function normalizeTrialSubject(raw, examId) {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
  if (/^math/.test(s)) return 'mathematics'
  if (/^phys/.test(s)) return 'physics'
  if (/^chem/.test(s)) return 'chemistry'
  if (/^bio/.test(s)) return 'biology'
  const id = normalizeTrialExamId(examId)
  if (trialSubjectAllowed(id, s)) return s
  return id === 'neet' ? 'biology' : 'mathematics'
}

function chapterNameScore(want, chapter) {
  const a = String(want ?? '')
    .trim()
    .toLowerCase()
  const b = String(chapter ?? '')
    .trim()
    .toLowerCase()
  if (!a || a === 'general') return 0
  if (a === b) return 3
  if (a.includes(b) || b.includes(a)) return 2
  return 0
}

export function clampSimilarToPyqToughness(level, seedLevel, maxOverride) {
  const seed = clampToughnessLevel(seedLevel, 5)
  const got = clampToughnessLevel(level, seed)
  const maxAllowed = maxOverride != null ? Math.min(10, maxOverride) : Math.min(10, seed + 1)
  if (got < seed) return seed
  if (got > maxAllowed) return maxAllowed
  return got
}

export function seedQuestionTypePromptLabel(raw) {
  const s = String(raw ?? '').toLowerCase()
  if (/matrix|match/.test(s)) {
    return 'match-column / matrix match — write SCQ variants of the same idea (same concepts, new numbers)'
  }
  if (/integer|numerical/.test(s)) {
    return 'integer/numerical — write SCQ variants of the same idea (same concepts, new numbers)'
  }
  return 'single-correct (SCQ) — keep SCQ'
}

export function stemCopiesSeed(stem, seedStem) {
  const a = String(stem ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  const b = String(seedStem ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  if (!a || !b) return false
  if (a === b) return true
  const clipLen = Math.min(80, b.length)
  const clip = b.slice(0, clipLen)
  return clip.length >= 40 && a.includes(clip)
}

/**
 * Map one official/bank PYQ onto a Gemini trial job (exam + chapter + seed).
 * @param {object} seed
 * @param {object} [paper]
 */
export function resolveTrialJobFromSeed(seed, paper = {}) {
  const examId = normalizeTrialExamId(
    seed?.examPatternId || seed?.examIds?.[0] || paper?.exam || paper?.examPatternId,
  )
  const subject = normalizeTrialSubject(seed?.subject || paper?.subject, examId)
  const chapters = listTrialChapters(examId, subject)
  const wantChapter = String(seed?.chapter ?? paper?.chapter ?? '').trim()
  const wantTopic = String(seed?.topic ?? '').trim()
  const found =
    chapters.find((c) => chapterNameScore(wantChapter, c.chapter) === 3) ||
    chapters.find((c) => chapterNameScore(wantChapter, c.chapter) >= 2) ||
    chapters.find((c) =>
      (c.topics ?? []).some((t) => t.toLowerCase() === wantTopic.toLowerCase()),
    ) ||
    chapters[0] ||
    pickSmokeChapter()
  const topics = []
  if (wantTopic) topics.push(wantTopic)
  for (const t of found?.topics ?? []) {
    if (!topics.includes(t)) topics.push(t)
  }
  const seedToughness = clampToughnessLevel(seed?.toughnessLevel ?? seed?.toughness, 5)
  const seedType = String(seed?.questionType ?? 'single_correct').trim() || 'single_correct'
  const seedStem = String(seed?.text ?? seed?.stem ?? '').trim()
  return {
    examId,
    examLabel: trialExamLabel(examId),
    subject: found?.subject || subject,
    section: String(seed?.section || found?.section || 'General').trim() || 'General',
    chapter: found?.chapter || wantChapter || 'General',
    topics,
    similarFromPyq: true,
    pyqStyle: false,
    seedStem,
    seedQuestionType: seedType,
    seedToughness,
    seedId: seed?.id,
    pyqYear: seed?.pyqYear ?? paper?.year ?? paper?.pyqYear,
    pyqDate: seed?.pyqDate ?? paper?.pyqDate,
    pyqShift: seed?.pyqShift ?? paper?.pyqShift,
    pyqSession: seed?.pyqSession ?? paper?.session ?? paper?.pyqSession,
  }
}

export function buildSimilarFromPyqPrompt(job) {
  const count = clampSimilarFromPyqCount(job.count)
  const examId = normalizeTrialExamId(job.examId)
  const examLabel = job.examLabel || trialExamLabel(examId)
  const topics = (job.topics ?? []).filter(Boolean)
  const topicLine = topics.length
    ? `Allowed topic tags (pick one per question, do not invent names):\n${topics.map((t) => `- ${t}`).join('\n')}`
    : 'Topic may be the chapter name.'
  const seedT = clampToughnessLevel(job.seedToughness, 5)
  const plusOne = Math.min(10, seedT + 1)
  const plusTwo = Math.min(10, seedT + 2)
  const seedStem = String(job.seedStem ?? '')
    .trim()
    .slice(0, 4000)
  const typeLine = seedQuestionTypePromptLabel(job.seedQuestionType)
  const replicaPaper = Boolean(job.replicaPaper)
  const label = replicaPaper ? 'AI replica paper' : 'AI similar'
  const toughLine = replicaPaper
    ? `Toughness: T${seedT}, T${plusOne}, or T${plusTwo} only (same as seed, or up to ~20% harder). Do NOT make them easier.`
    : `Toughness: T${seedT} or T${plusOne} only (same as the seed, or one step harder). Do NOT make them easier.`

  return `Write exactly ${count} NEW original ${examLabel} questions similar to ONE seed PYQ.

These are **${label}** practice items. NEVER label them Official PYQ. NEVER copy the seed stem, options, or numbers verbatim. Use original numbers, names, and wording. Staff will review drafts — do not publish.

Keep:
- Exam: ${examLabel}
- Subject: ${subjectLabel(job.subject)}
- Unit / section: ${job.section}
- Chapter (use this exact name in metadata): ${job.chapter}
${topicLine}
- Question type: ${typeLine}
- ${toughLine} Do NOT use a 40/30/30 practice mix.

Seed PYQ (inspiration only — rewrite completely; do not quote it):
"""
${seedStem || '(no stem — stay on the chapter/topic above)'}
"""

Stay on the seed's concept even if the chapter tag is General.

Rules:
- questionType is single_correct
- stem: complete question text, LaTeX in $...$
- options: exactly 4 distinct strings (A-D)
- correctIndex: 0, 1, 2, or 3 (0 = first option)
- solution: short working (4-8 sentences or equivalent steps), LaTeX in $...$
- toughness: integer ${replicaPaper ? `${seedT}, ${plusOne}, or ${plusTwo}` : `${seedT} or ${plusOne}`} only
- Stay inside this chapter/topic. Do not invent a different chapter name.

${PYQ_GEMINI_JSON_SCHEMA_HINT}
Topic field must be one of the allowed tags, default "${topics[0] || job.chapter}".`
}

function buildTrialTypeAssignmentLines(typePlan) {
  if (!Array.isArray(typePlan) || !typePlan.length) return ''
  const lines = typePlan.map((slot, i) => {
    const type = slot.type ?? 'single_correct'
    if (type === 'passage_scq') {
      const subs = slot.subCount ?? 2
      return `Q${i + 1}: passage_scq — one shared passageText with exactly ${subs} SCQ sub-questions (A-D each)`
    }
    if (type === 'passage_integer') {
      const subs = slot.subCount ?? 2
      return `Q${i + 1}: passage_integer — one shared passageText with exactly ${subs} integer sub-questions (no options)`
    }
    return `Q${i + 1}: ${type}`
  })
  return `Assigned questionType per JSON object (follow exactly):\n${lines.join('\n')}`
}

export function buildScqTrialPrompt(job) {
  if (job?.similarFromPyq) return buildSimilarFromPyqPrompt(job)
  const count = clampTrialCount(job.count)
  const examId = normalizeTrialExamId(job.examId)
  const examLabel = job.examLabel || trialExamLabel(examId)
  const typeMix = job.typeMix ?? 'all'
  const typePlan =
    Array.isArray(job.typePlan) && job.typePlan.length
      ? job.typePlan
      : planTrialQuestionTypes(examId, count, typeMix)
  const jsonObjects = typePlan.length
  const quota = toughnessQuotaForCount(count)
  const plan = plannedToughnessLevels(count)
  const topics = (job.topics ?? []).filter(Boolean)
  const topicLine = topics.length
    ? `Allowed topic tags (pick one per question, do not invent names):\n${topics.map((t) => `- ${t}`).join('\n')}`
    : 'Topic may be the chapter name.'
  const typeMixLine = trialTypeMixLabel(examId, typeMix)
  const typeAssignLine = buildTrialTypeAssignmentLines(typePlan)
  const style =
    examId === 'neet'
      ? 'NEET style: NCERT-aligned, clear language, mix of recall and application. Biology must stay within the given chapter.'
      : examId === 'jee-advanced'
        ? 'JEE Advanced style: deeper reasoning, multi-concept, varied question types as assigned.'
        : 'JEE Main style: mostly single-correct plus numerical value questions as assigned.'

  const pyqYear = normalizePyqYear(job.pyqYear)
  const pyqStyle = Boolean(job.pyqStyle) && pyqYear != null
  const pyqBlock = pyqStyle
    ? (() => {
        const exam = examId
        const slot =
          exam === 'jee-main'
            ? `${job.pyqDate || ''} Shift ${job.pyqShift || ''}`.trim()
            : exam === 'jee-advanced'
              ? job.pyqSession || 'Paper 1'
              : String(pyqYear)
        return `PYQ-style (AI) inspired by ${examLabel} ${slot}.
Imitate the wording and difficulty of that sitting. Do NOT reproduce any copyrighted official NTA / IIT / NEET question.
These are original-ish practice items with slot tags, not a licensed paper dump.
Never label them official PYQ. Tag metadata: exam ${examLabel}, ${
          exam === 'jee-main'
            ? `date ${job.pyqDate}, shift ${job.pyqShift}`
            : exam === 'jee-advanced'
              ? `year ${pyqYear}, ${job.pyqSession || 'Paper 1'}`
              : `year ${pyqYear}`
        }.`
      })()
    : 'Write original-ish practice items. Do not copy a famous PYQ stem word-for-word.'

  const mixLine = plan
    .map((t, i) => `Q${i + 1}=${t}`)
    .join(', ')

  const schemaHint = pyqStyle ? PYQ_GEMINI_JSON_SCHEMA_HINT : GEMINI_TRIAL_JSON_SCHEMA_HINT

  return `Write exactly ${jsonObjects} JSON objects (${count} scored questions total — passage bundles count their sub-questions).

Subject: ${subjectLabel(job.subject)}
Unit / section: ${job.section}
Chapter (use this exact name in metadata): ${job.chapter}
${topicLine}

Type mix: ${typeMixLine}
${typeAssignLine}

${style}
${pyqBlock}

${
  pyqStyle
    ? `Toughness: estimate the actual difficulty of each item for this paper (T1 easiest ... T10 hardest). Easy = T1-T3, Moderate = T4-T7, Tough = T8-T10. Do NOT force a 40/30/30 mix — match the real sitting's spread.
Do not write "Official NTA" or paste a copyrighted paper. Tag only via metadata already given (exam / year / date / shift / paper).`
    : `Toughness mix (required for practice only): Easy 40% · Moderate 30% · Tough 30%.
For ${count} questions that is ${quota.easy} Easy (T1-T3), ${quota.moderate} Moderate (T4-T7), ${quota.tough} Tough (T8-T10).
Assign toughness in this order: ${mixLine}. Rotate T1/T2/T3 inside Easy, T4-T7 inside Moderate, T8-T10 inside Tough.`
}

Rules:
- Set questionType on every object to match the assignment above
- stem: complete question text, LaTeX in $...$ (passage types use passageText + subQuestions)
- solution: short working (4-8 sentences or equivalent steps), LaTeX in $...$
- toughness: integer 1-10 (${pyqStyle ? 'actual difficulty for that item' : 'matching the mix above'})
- Stay inside this chapter. Do not invent a different chapter name.

${schemaHint}
Topic field must be one of the allowed tags, default "${topics[0] || job.chapter}".`
}

export function extractJsonValue(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return null
  const direct = jsonParseWithLatexSalvage(text)
  if (direct) return direct
  const fence = /`{3}(?:json)?\s*([\s\S]*?)`{3}/i.exec(text)
  if (fence) {
    const fenced = jsonParseWithLatexSalvage(fence[1].trim())
    if (fenced) return fenced
  }
  const objStart = text.indexOf('{')
  const arrStart = text.indexOf('[')
  const starts = [objStart, arrStart].filter((i) => i >= 0)
  if (!starts.length) return null
  const start = Math.min(...starts)
  const open = text[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === open) depth += 1
    else if (ch === close) {
      depth -= 1
      if (depth === 0) {
        const sliced = jsonParseWithLatexSalvage(text.slice(start, i + 1))
        if (sliced) return sliced
        break
      }
    }
  }
  const end = text.lastIndexOf(close)
  if (end > start) {
    const tail = jsonParseWithLatexSalvage(text.slice(start, end + 1))
    if (tail) return tail
  }
  return parseRepairedTruncatedJson(text.slice(start))
}

/** Close dangling { [ and quotes so a cut-off Gemini payload can still parse. */
export function parseRepairedTruncatedJson(raw) {
  let s = String(raw ?? '').trim()
  if (!s) return null
  let inString = false
  let escape = false
  let braces = 0
  let brackets = 0
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inString) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') braces += 1
    else if (ch === '}') braces -= 1
    else if (ch === '[') brackets += 1
    else if (ch === ']') brackets -= 1
  }
  if (inString) s += '"'
  s = s.replace(/,\s*$/, '')
  while (brackets > 0) {
    s += ']'
    brackets -= 1
  }
  while (braces > 0) {
    s += '}'
    braces -= 1
  }
  try {
    return jsonParseWithLatexSalvage(s)
  } catch {
    return null
  }
}

function optionListFromUnknown(raw) {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x ?? '').trim()).filter(Boolean)
  }
  if (raw && typeof raw === 'object') {
    const o = raw
    const letters = ['A', 'B', 'C', 'D', 'a', 'b', 'c', 'd']
    const fromLetters = letters
      .map((k) => String(o[k] ?? o[`option${k}`] ?? o[`Option${k}`] ?? '').trim())
      .filter(Boolean)
    if (fromLetters.length >= 4) return fromLetters.slice(0, 4)
    const numbered = [1, 2, 3, 4]
      .map((n) => String(o[n] ?? o[`option${n}`] ?? '').trim())
      .filter(Boolean)
    if (numbered.length >= 4) return numbered.slice(0, 4)
  }
  return []
}

export function parseCorrectIndex(raw, optionCount = 4) {
  if (raw == null || raw === '') return null
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const n = Math.trunc(raw)
    if (n >= 0 && n < optionCount) return n
    if (n >= 1 && n <= optionCount) return n - 1
    return null
  }
  const s = String(raw).trim()
  if (/^[A-Da-d]$/.test(s)) return s.toUpperCase().charCodeAt(0) - 65
  if (/^[A-Da-d][).:-]/.test(s)) return s[0].toUpperCase().charCodeAt(0) - 65
  const n = Number(s)
  if (Number.isFinite(n)) return parseCorrectIndex(n, optionCount)
  return null
}

function optionalGenerationConfidence(item) {
  const raw = item?.generationConfidence ?? item?.confidence ?? item?.confidenceScore
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  const pct = n <= 1 ? Math.round(n * 100) : Math.round(n)
  return Math.max(1, Math.min(100, pct))
}

function clampToughness(raw) {
  return clampToughnessLevel(raw, 5)
}

function pickTopic(raw, allowed, fallback) {
  const want = String(raw ?? '').trim()
  if (want && allowed.includes(want)) return want
  const lower = want.toLowerCase()
  const hit = allowed.find((t) => t.toLowerCase() === lower)
  if (hit) return hit
  return allowed[0] || fallback
}

function parseCorrectIndices(raw, optionCount = 4) {
  if (Array.isArray(raw)) {
    const out = raw
      .map((x) => parseCorrectIndex(x, optionCount))
      .filter((x) => x != null)
    return [...new Set(out)].sort((a, b) => a - b)
  }
  const one = parseCorrectIndex(raw, optionCount)
  return one == null ? [] : [one]
}

function normalizeMatrixAnswerKey(raw) {
  if (!raw || typeof raw !== 'object') return null
  /** @type {Record<number, number[]>} */
  const out = {}
  for (const [rowStr, val] of Object.entries(raw)) {
    const row = Number(rowStr)
    if (!Number.isInteger(row) || row < 0 || row >= MATRIX_ROW_COUNT) continue
    const cols = Array.isArray(val)
      ? val.map(Number).filter((n) => Number.isInteger(n))
      : [Number(val)].filter((n) => Number.isInteger(n))
    if (cols.length) out[row] = [...new Set(cols)].sort((a, b) => a - b)
  }
  if (Object.keys(out).length < MATRIX_ROW_COUNT) return null
  return out
}

function validatePassageSubQuestion(sq, passageType, i) {
  const text = String(sq?.text ?? sq?.stem ?? '').trim()
  if (!text) return { ok: false, error: `Passage sub Q${i + 1}: empty stem` }
  if (passageType === 'passage_integer') {
    const n = Number(sq?.correctInteger ?? sq?.answer)
    if (!Number.isInteger(n) || n < 0 || n > 9999) {
      return { ok: false, error: `Passage sub Q${i + 1}: correctInteger 0-9999 required` }
    }
    return { ok: true, item: { text, correctInteger: n } }
  }
  const options = optionListFromUnknown(sq?.options ?? sq?.choices)
  if (options.length !== 4) {
    return { ok: false, error: `Passage sub Q${i + 1}: need 4 options, got ${options.length}` }
  }
  const correctIndex = parseCorrectIndex(
    sq?.correctIndex ?? sq?.correct ?? sq?.answer,
    4,
  )
  if (correctIndex == null) {
    return { ok: false, error: `Passage sub Q${i + 1}: correctIndex 0-3 required` }
  }
  return { ok: true, item: { text, options, correctIndex } }
}

const INCOMPLETE_TRIAL_STEM =
  'Incomplete extraction (cut math or broken vmatrix). Not saved as a full question.'

/** Heal leaked $$ / Let-smashed vmatrix. Never invents missing math. */
export function healTrialExtractedStem(text) {
  return finalizeStemForBank(
    wrapBareLatexRuns(repairSmashedProseVmatrixOcr(String(text ?? ''))),
  )
}

/** True when a trial/upload card must stay draft and must not Publish. */
export function trialDraftIsIncomplete(entry) {
  if (!entry || typeof entry !== 'object') return false
  if (latexExtractionIncomplete(healTrialExtractedStem(entry.text))) return true
  if (latexExtractionIncomplete(healTrialExtractedStem(entry.passageText))) return true
  return false
}

function stampTrialStemHeal(result) {
  if (!result?.ok || !result.item) return result
  const item = result.item
  if (item.passageText) {
    const healed = healTrialExtractedStem(item.passageText)
    if (latexExtractionIncomplete(healed)) return { ok: false, error: INCOMPLETE_TRIAL_STEM }
    item.passageText = healed
  }
  if (item.stem) {
    const healed = healTrialExtractedStem(item.stem)
    if (latexExtractionIncomplete(healed)) return { ok: false, error: INCOMPLETE_TRIAL_STEM }
    item.stem = healed
  }
  if (Array.isArray(item.subQuestions)) {
    for (const sq of item.subQuestions) {
      if (!sq?.text) continue
      const healed = healTrialExtractedStem(sq.text)
      if (latexExtractionIncomplete(healed)) return { ok: false, error: INCOMPLETE_TRIAL_STEM }
      sq.text = healed
    }
  }
  return result
}

export function validateScqTrialItem(item, job, expectedType) {
  return stampTrialStemHeal(validateScqTrialItemShape(item, job, expectedType))
}

function validateScqTrialItemShape(item, job, expectedType) {
  if (job?.pyqStyle || job?.similarFromPyq) {
    return validateGeminiPyqGenerateItem(item, job)
  }
  if (!item || typeof item !== 'object') {
    return { ok: false, error: 'Item is not an object' }
  }
  const type = String(
    expectedType ?? item.questionType ?? item.type ?? 'single_correct',
  ).trim()
  const topics = job?.topics ?? []
  const topic = pickTopic(item.topic, topics, job?.chapter)
  const toughness = clampToughness(item.toughness ?? item.difficulty ?? item.toughnessLevel)
  const solution = String(item.solution ?? item.explanation ?? item.working ?? '').trim()
  const base = {
    questionType: type,
    toughness,
    topic,
    solution,
    generationConfidence: optionalGenerationConfidence(item) ?? undefined,
  }

  if (type === 'passage_scq' || type === 'passage_integer') {
    const passageText = String(item.passageText ?? item.passage ?? item.stem ?? '').trim()
    if (!passageText) return { ok: false, error: 'passageText required' }
    const subs = Array.isArray(item.subQuestions)
      ? item.subQuestions
      : Array.isArray(item.questions)
        ? item.questions
        : []
    if (subs.length < 2) {
      return { ok: false, error: 'Passage needs at least 2 subQuestions' }
    }
    const subQuestions = []
    for (let i = 0; i < subs.length; i++) {
      const v = validatePassageSubQuestion(subs[i], type, i)
      if (!v.ok) return v
      subQuestions.push(v.item)
    }
    return {
      ok: true,
      item: { ...base, questionType: type, passageText, subQuestions },
    }
  }

  const stem = String(item.stem ?? item.text ?? item.question ?? '').trim()
  if (!stem) return { ok: false, error: 'Empty stem' }

  if (type === 'integer') {
    const n = Number(item.correctInteger ?? item.answer ?? item.integerAnswer)
    if (!Number.isInteger(n) || n < 0 || n > 9999) {
      return { ok: false, error: 'correctInteger must be 0-9999' }
    }
    return { ok: true, item: { ...base, questionType: 'integer', stem, correctInteger: n } }
  }

  if (type === 'numerical') {
    const num = validateNumericalAnswer(
      String(item.correctNumerical ?? item.answer ?? item.numericalAnswer ?? ''),
    )
    if (!num.ok) return { ok: false, error: num.error || 'Invalid correctNumerical' }
    const tol = Number(item.numericalTolerance)
    return {
      ok: true,
      item: {
        ...base,
        questionType: 'numerical',
        stem,
        correctNumerical: num.value,
        ...(Number.isFinite(tol) && tol > 0 ? { numericalTolerance: tol } : {}),
      },
    }
  }

  if (type === 'matrix_match') {
    const matrixRows = (item.matrixRows ?? [])
      .map((r) => String(r ?? '').trim())
      .filter(Boolean)
    const matrixCols = (item.matrixCols ?? item.columns ?? [])
      .map((c) => String(c ?? '').trim())
      .filter(Boolean)
    if (matrixRows.length !== MATRIX_ROW_COUNT) {
      return { ok: false, error: `matrixRows need ${MATRIX_ROW_COUNT} entries` }
    }
    if (matrixCols.length < 4 || matrixCols.length > 5) {
      return { ok: false, error: 'matrixCols need 4 or 5 entries' }
    }
    const matrixAnswerKey = normalizeMatrixAnswerKey(item.matrixAnswerKey ?? item.answerKey)
    if (!matrixAnswerKey) {
      return { ok: false, error: 'matrixAnswerKey must map rows 0-3 to column indices' }
    }
    return {
      ok: true,
      item: {
        ...base,
        questionType: 'matrix_match',
        stem,
        matrixRows,
        matrixCols,
        matrixColLabels: defaultMatrixColLabels(matrixCols.length),
        matrixColCount: matrixCols.length,
        matrixResponseMode: 'grid',
        matrixAnswerKey,
      },
    }
  }

  const options =
    type === 'true_false'
      ? (optionListFromUnknown(item.options ?? item.choices).length >= 2
          ? optionListFromUnknown(item.options ?? item.choices).slice(0, 2)
          : [...TRUE_FALSE_OPTIONS])
      : optionListFromUnknown(item.options ?? item.choices)
  const optionCount = type === 'true_false' ? 2 : 4
  if (options.length !== optionCount) {
    return { ok: false, error: `Need exactly ${optionCount} options, got ${options.length}` }
  }
  if (type !== 'true_false' && new Set(options.map((o) => o.toLowerCase())).size < 2) {
    return { ok: false, error: 'Options are not distinct' }
  }

  if (type === 'multiple_correct') {
    const correctIndices = parseCorrectIndices(
      item.correctIndices ?? item.correctIndex ?? item.correct,
      optionCount,
    )
    if (correctIndices.length < 2) {
      return { ok: false, error: 'multiple_correct needs correctIndices with 2+ entries' }
    }
    return {
      ok: true,
      item: {
        ...base,
        questionType: 'multiple_correct',
        stem,
        options,
        correctIndices,
        msqMarking: { ...DEFAULT_MSQ_MARKING },
      },
    }
  }

  const correctIndex = parseCorrectIndex(
    item.correctIndex ?? item.correct ?? item.answer ?? item.answerIndex ?? item.correctOption,
    optionCount,
  )
  if (correctIndex == null) {
    return { ok: false, error: 'correctIndex must be valid for the option count' }
  }
  return {
    ok: true,
    item: {
      ...base,
      questionType: type === 'true_false' ? 'true_false' : 'single_correct',
      stem,
      options,
      correctIndex,
    },
  }
}

export function parseAndValidateScqTrialResponse(raw, job) {
  const parsed = typeof raw === 'string' || raw == null ? extractJsonValue(raw) : raw
  let list = []
  if (Array.isArray(parsed)) list = parsed
  else if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed.questions)) list = parsed.questions
    else if (Array.isArray(parsed.items)) list = parsed.items
    else if (Array.isArray(parsed.scqs)) list = parsed.scqs
    else if (Array.isArray(parsed.mcqs)) list = parsed.mcqs
    else if (Array.isArray(parsed.question_list)) list = parsed.question_list
    else if (Array.isArray(parsed.data)) list = parsed.data
    else if (Array.isArray(parsed.result)) list = parsed.result
    else if (Array.isArray(parsed.output)) list = parsed.output
    else if (Array.isArray(parsed?.data?.questions)) list = parsed.data.questions
    else if (parsed.stem || parsed.text || parsed.passageText) list = [parsed]
    else if (typeof parsed.text === 'string' && parsed.text.includes('{')) {
      return parseAndValidateScqTrialResponse(parsed.text, job)
    } else {
      const vals = Object.values(parsed).filter(
        (v) =>
          v &&
          typeof v === 'object' &&
          !Array.isArray(v) &&
          (v.stem || v.text || v.question || v.passageText),
      )
      if (vals.length >= 1) list = vals
    }
  }
  const questions = []
  const errors = []
  if (!list.length) {
    return { ok: false, questions: [], errors: ['No questions array in model JSON'], rawCount: 0 }
  }
  const pyqStyle = Boolean(job?.pyqStyle)
  const similarFromPyq = Boolean(job?.similarFromPyq)
  const count = clampTrialCount(job?.count)
  const typePlan =
    !pyqStyle && !similarFromPyq
      ? Array.isArray(job?.typePlan) && job.typePlan.length
        ? job.typePlan
        : planTrialQuestionTypes(job?.examId, count, job?.typeMix ?? 'all')
      : []
  list.forEach((item, i) => {
    const expectedType =
      typePlan[i]?.type ??
      (pyqStyle || similarFromPyq ? 'single_correct' : undefined)
    const v = validateScqTrialItem(item, job, expectedType)
    if (v.ok) questions.push(v.item)
    else errors.push(`Q${i + 1}: ${v.error}`)
  })
  let mixed =
    questions.length && !pyqStyle && !similarFromPyq
      ? enforceTrialToughnessMix(questions, count)
      : questions
  if (similarFromPyq) {
    const seedStem = String(job?.seedStem ?? '')
    const replicaPaper = Boolean(job?.replicaPaper)
    const seedT = clampToughnessLevel(job?.seedToughness, 5)
    const maxT = replicaPaper ? Math.min(10, seedT + 2) : Math.min(10, seedT + 1)
    mixed = mixed
      .filter((q) => !stemCopiesSeed(q.stem ?? q.passageText, seedStem))
      .map((q) => ({
        ...q,
        toughness: clampSimilarToPyqToughness(q.toughness, job?.seedToughness, maxT),
      }))
    if (!mixed.length && questions.length) {
      errors.push('Gemini copied the seed stem — drafts were rejected. Try again.')
    }
  }
  return {
    ok: mixed.length > 0,
    questions: mixed,
    errors,
    rawCount: list.length,
  }
}

/**
 * Always re-validate Gemini API JSON so PYQ-style never skips stem/options/solution checks.
 * @param {any} data
 * @param {object} job
 */
export function finalizeGeminiTrialQuestions(data, job) {
  const payload =
    Array.isArray(data?.questions) && data.questions.length
      ? { questions: data.questions }
      : (data?.raw ?? data)
  return parseAndValidateScqTrialResponse(payload, job)
}

export function trialItemToBankDraft(item, job, opts = {}) {
  const now = opts.now ?? Date.now()
  const index = opts.index ?? 0
  const examId = normalizeTrialExamId(job.examId)
  const pyqYear = normalizePyqYear(job.pyqYear)
  const similarFromPyq = Boolean(job.similarFromPyq)
  const pyqStyle = Boolean(job.pyqStyle) && pyqYear != null && !similarFromPyq
  const existingIds = opts.existingIds ?? []
  const variantIndex = opts.variantIndex ?? index + 1
  const parentId = job.seedId ? String(job.seedId) : ''
  const qType = String(item.questionType ?? 'single_correct')
  const typeDef = getQuestionType(qType)
  const similarChildId = similarFromPyq && parentId
    ? assignAiSimilarChildId(parentId, variantIndex, existingIds)
    : similarFromPyq
      ? `uq-gemini-similar-${now}-${index}`
      : `uq-gemini-trial-${qType}-${now}-${index}`
  const draft = {
    id: similarChildId,
    questionType: qType,
    bankStatus: 'draft',
    subject: job.subject,
    section: job.section,
    chapter: job.chapter,
    topic: item.topic || job.chapter,
    examIds: [examId],
    examPatternId: examId,
    text: finalizeStemForBank(item.stem ?? item.text ?? '', item.options ?? []),
    solution: item.solution || '',
    toughnessLevel: similarFromPyq
      ? clampSimilarToPyqToughness(item.toughness, job.seedToughness)
      : item.toughness,
    source: similarFromPyq ? AI_SIMILAR_SOURCE : pyqStyle ? PYQ_STYLE_AI_SOURCE : GEMINI_TRIAL_SOURCE,
    marking: { ...(typeDef.defaultMarking ?? SCQ_TRIAL_MARKING) },
    savedAt: now + index,
    ...(item.generationConfidence != null
      ? { generationConfidence: item.generationConfidence }
      : {}),
  }

  if (qType === 'single_correct' || qType === 'true_false' || qType === 'passage_scq') {
    draft.options = [...(item.options ?? [])]
    draft.correctIndex = item.correctIndex
  } else if (qType === 'multiple_correct') {
    draft.options = [...(item.options ?? [])]
    draft.correctIndices = [...(item.correctIndices ?? [])]
    draft.msqMarking = { ...(item.msqMarking ?? DEFAULT_MSQ_MARKING) }
  } else if (qType === 'integer') {
    draft.correctInteger = item.correctInteger
    delete draft.options
  } else if (qType === 'numerical') {
    draft.correctNumerical = item.correctNumerical
    if (item.numericalTolerance != null) draft.numericalTolerance = item.numericalTolerance
    delete draft.options
  } else if (qType === 'matrix_match') {
    draft.matrixRows = [...(item.matrixRows ?? [])]
    draft.matrixCols = [...(item.matrixCols ?? [])]
    draft.matrixColLabels = [...(item.matrixColLabels ?? defaultMatrixColLabels(item.matrixCols?.length))]
    draft.matrixColCount = item.matrixColCount ?? item.matrixCols?.length ?? 4
    draft.matrixResponseMode = item.matrixResponseMode ?? 'grid'
    draft.matrixAnswerKey = { ...(item.matrixAnswerKey ?? {}) }
  }

  if (trialDraftIsIncomplete(draft)) {
    draft.needsReview = true
    draft.lowConfidence = true
    draft.bankStatus = 'draft'
    draft.cloudNote =
      'Extraction incomplete — do not approve. Missing math was not invented.'
  }

  if (similarFromPyq) {
    draft.similarToPyq = true
    draft.sub_bank_type = 'similar_pyq'
    draft.pyqStyle = false
    draft.officialPyq = false
    draft.imported = false
    draft.official = false
    draft.bankSource = AI_SIMILAR_BANK_SOURCE
    draft.source = AI_SIMILAR_SOURCE
    draft.bankStatus = 'draft'
    if (job.seedId) {
      draft.seedPyqId = String(job.seedId)
      draft.parentQuestionId = String(job.seedId)
      draft.similarToId = String(job.seedId)
    }
    if (pyqYear != null) draft.pyqYear = pyqYear
    if (job.pyqDate) draft.pyqDate = job.pyqDate
    if (job.pyqShift != null && job.pyqShift !== '') draft.pyqShift = Number(job.pyqShift)
    if (job.pyqSession) draft.pyqSession = job.pyqSession
    delete draft.publishedAt
    return draft
  }
  if (pyqStyle) {
    const slot = buildGeminiPyqStyleFields({
      examId,
      pyqYear,
      pyqDate: job.pyqDate,
      pyqShift: job.pyqShift,
      pyqSession: job.pyqSession,
      subject: job.subject,
      chapter: job.chapter,
      questionType: 'single_correct',
    })
    if (slot) {
      Object.assign(draft, slot)
      draft.bankStatus = 'draft'
      delete draft.official
    } else {
      draft.pyqYear = pyqYear
      draft.pyqStyle = true
      draft.bankSource = PYQ_STYLE_AI_BANK_SOURCE
      draft.source = PYQ_STYLE_AI_SOURCE
      draft.officialPyq = false
      draft.imported = false
    }
  }
  return draft
}

/**
 * Passage bundle → parent row + linked sub-question rows (draft only).
 * @returns {import('../data/tests').Question[]}
 */
export function trialPassageToBankDrafts(item, job, opts = {}) {
  const now = opts.now ?? Date.now()
  const baseIndex = opts.index ?? 0
  const passageType = String(item.questionType ?? 'passage_scq')
  const parentId = `uq-gemini-trial-${passageType}-${now}-${baseIndex}`
  const subs = item.subQuestions ?? []
  const rows = []
  subs.forEach((sq, i) => {
    const row = trialItemToBankDraft(
      {
        ...item,
        ...sq,
        questionType: passageType === 'passage_integer' ? 'passage_integer' : 'passage_scq',
        stem: sq.text,
        text: sq.text,
      },
      job,
      { now, index: baseIndex + i },
    )
    row.id = i === 0 ? parentId : `${parentId}-sq-${i + 1}`
    row.toughnessLevel = item.toughness
    row.topic = item.topic || job.chapter
    row.solution = i === 0 ? item.solution || row.solution : row.solution
    if (i === 0) {
      row.passageText = finalizeStemForBank(item.passageText ?? '')
      delete row.passageId
    } else {
      row.passageId = parentId
      delete row.passageText
    }
    if (passageType === 'passage_integer') {
      row.correctInteger = sq.correctInteger
      delete row.options
      delete row.correctIndex
    }
    rows.push(row)
  })
  return rows
}

/** One parsed trial item → one or more bank draft rows. */
export function trialItemToBankDrafts(item, job, opts = {}) {
  const type = String(item.questionType ?? 'single_correct')
  if (type === 'passage_scq' || type === 'passage_integer') {
    return trialPassageToBankDrafts(item, job, opts)
  }
  return [trialItemToBankDraft(item, job, opts)]
}

/**
 * PYQ-style Gemini item for the PYQ bank (paper-wise), not generic drafts.
 * Never marks official / imported.
 */
export function trialItemToPyqBankItem(item, job, opts = {}) {
  const draft = trialItemToBankDraft(item, job, opts)
  const examId = normalizeTrialExamId(job.examId)
  const slot = buildGeminiPyqStyleFields({
    examId,
    pyqYear: job.pyqYear,
    pyqDate: job.pyqDate,
    pyqShift: job.pyqShift,
    pyqSession: job.pyqSession,
    subject: job.subject,
    chapter: job.chapter,
    questionType: 'single_correct',
  })
  return {
    id: String(draft.id).replace('uq-gemini-scq', 'pyq-ai'),
    text: draft.text,
    options: [...(draft.options ?? [])],
    correctIndex: draft.correctIndex,
    solution: draft.solution || '',
    subject: draft.subject,
    section: draft.section,
    chapter: draft.chapter,
    topic: draft.topic,
    questionType: 'single_correct',
    toughnessLevel: draft.toughnessLevel,
    examIds: slot?.examIds ?? draft.examIds,
    examPatternId: slot?.examPatternId ?? examId,
    pyqYear: slot?.pyqYear ?? draft.pyqYear,
    pyqDate: slot?.pyqDate,
    pyqShift: slot?.pyqShift,
    pyqSession: slot?.pyqSession,
    paperId: slot?.paperId ?? draft.paperId,
    paperLabel: slot?.paperLabel ?? draft.paperLabel,
    pyqStyle: true,
    officialPyq: false,
    imported: false,
    official: false,
    bankSource: PYQ_STYLE_AI_BANK_SOURCE,
    source: PYQ_STYLE_AI_SOURCE,
    pyqSlot: (opts.index ?? 0) + 1,
    marking: draft.marking,
    savedAt: draft.savedAt,
    ...(item.generationConfidence != null ? { generationConfidence: item.generationConfidence } : {}),
  }
}

export function applyTrialDuplicatePolicy(entry, bank) {
  const matches = findDuplicateQuestions(entry, bank)
  if (!matches.length) {
    return { entry: { ...entry, bankStatus: 'draft' }, duplicate: false, matches: [] }
  }
  return {
    entry: attachDuplicateReviewFields({ ...entry, bankStatus: 'draft' }, matches),
    duplicate: true,
    matches,
  }
}

export function sleepMs(ms) {
  const n = Math.max(0, Number(ms) || 0)
  return new Promise((resolve) => setTimeout(resolve, n))
}

export function quotaBackoffMs(attempt) {
  const n = Math.max(0, Number(attempt) || 0)
  return Math.min(180000, 20000 * 2 ** n)
}

export function isQuotaError(err) {
  const status = Number(err?.status)
  const code = String(err?.code ?? '')
  const msg = err instanceof Error ? err.message : String(err ?? '')
  return (
    status === 429 ||
    code === 'VISION_QUOTA' ||
    /RESOURCE_EXHAUSTED|quota|rate[- ]?limit|exceeded your current|Too Many Requests/i.test(msg)
  )
}

export function countTrialDraftsBySubject(questions) {
  const bySubject = {}
  let drafts = 0
  let duplicates = 0
  for (const q of questions ?? []) {
    if (String(q?.source ?? '') !== GEMINI_TRIAL_SOURCE) continue
    drafts += 1
    const sub = String(q.subject ?? 'unknown')
    bySubject[sub] = (bySubject[sub] ?? 0) + 1
    if (String(q.duplicateOfId ?? '').trim()) duplicates += 1
  }
  return { drafts, duplicates, bySubject }
}

export function emptyTrialProgress() {
  return { version: 1, updatedAt: 0, running: null, log: [], jobs: {}, questions: [] }
}

export function jobIsComplete(jobState) {
  return jobState?.status === 'done' && Number(jobState?.saved) >= SCQ_TRIAL_COUNT
}

export function stemPreview(text, max = 140) {
  const s = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (s.length <= max) return s
  return `${s.slice(0, Math.max(1, max - 1))}…`
}

/**
 * Small payload for the Manage meta live panel. Never include the full question list.
 * @param {ReturnType<typeof emptyTrialProgress>} [progress]
 * @param {{
 *   running?: object | null,
 *   log?: { t: number, level?: string, text: string }[],
 *   lastStem?: string,
 *   lastChapter?: string,
 *   lastSubject?: string,
 *   updatedAt?: number,
 *   drafts?: number,
 * }} [extra]
 */
export function buildTrialLiveSnapshot(progress, extra = {}) {
  const jobs = Object.entries(progress?.jobs ?? {})
  let done = 0
  let error = 0
  let partial = 0
  let duplicates = 0
  const recentErrors = []
  for (const [key, j] of jobs) {
    const status = j?.status
    if (status === 'done') done += 1
    else if (status === 'error') {
      error += 1
      recentErrors.push({
        key,
        error: String(j?.error ?? 'error'),
        at: Number(j?.at) || 0,
      })
    } else if (status === 'partial') partial += 1
    duplicates += Number(j?.duplicates) || 0
  }
  recentErrors.sort((a, b) => (a.at || 0) - (b.at || 0))
  const questions = Array.isArray(progress?.questions) ? progress.questions : []
  const last = questions.length ? questions[questions.length - 1] : null
  const running = extra.running !== undefined ? extra.running : (progress?.running ?? null)
  const log = Array.isArray(extra.log)
    ? extra.log.slice(-40)
    : Array.isArray(progress?.log)
      ? progress.log.slice(-40)
      : []
  return {
    version: 1,
    updatedAt: extra.updatedAt ?? progress?.updatedAt ?? 0,
    running,
    totals: {
      jobs: jobs.length,
      done,
      error,
      partial,
      drafts: questions.length || Number(extra.drafts) || 0,
      duplicates,
    },
    current: running
      ? {
          examId: running.examId ?? '',
          examLabel: running.examLabel ?? '',
          subject: running.subject ?? '',
          section: running.section ?? '',
          chapter: running.chapter ?? '',
          jobIndex: Number(running.jobIndex) || 0,
          jobCount: Number(running.jobCount) || 0,
          generatingIndex: Number(running.generatingIndex) || 0,
          generatingOf: Number(running.generatingOf) || SCQ_TRIAL_COUNT,
          phase: running.phase ?? 'working',
        }
      : null,
    lastStem: stemPreview(extra.lastStem ?? last?.text ?? last?.stem ?? ''),
    lastChapter: extra.lastChapter ?? last?.chapter ?? running?.chapter ?? '',
    lastSubject: extra.lastSubject ?? last?.subject ?? running?.subject ?? '',
    recentErrors: recentErrors.slice(-10),
    log,
  }
}

export function emptyTrialLiveSnapshot() {
  return buildTrialLiveSnapshot(emptyTrialProgress())
}
