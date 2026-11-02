/**
 * Lecture Planner — local plan from the teacher's bank + AI polish (Gemini when on).
 * Questions are never invented; picks stay from the bank.
 */

import { runAiAssistWithFallback } from './aiProviderAssist.js'
import { hierarchyFields, filterBankQuestions } from './bankListFilters.js'
import { effectiveBankStatus } from './questionUploadFilter.js'
import { getQuestionType } from '../data/questionTypes.js'
import { formatToughnessLabel } from './questionMetadata.js'

/** Teacher-facing badge — always "AI", never Gemini/Local names. */
export function lecturePlannerAiBadge(_provider) {
  return 'AI'
}

/**
 * @param {string} text
 * @param {number} [max]
 */
function stemSnippet(text, max = 90) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return '(Image / empty stem)'
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

/**
 * Score how well a bank question fits the lecture filters.
 * @param {import('../data/tests').Question} q
 * @param {{ subject?: string, chapter?: string, topic?: string }} filters
 */
export function lectureFitScore(q, filters = {}) {
  let score = 0
  const sub = String(filters.subject ?? '').trim().toLowerCase()
  const ch = String(filters.chapter ?? '').trim().toLowerCase()
  const top = String(filters.topic ?? '').trim().toLowerCase()
  const h = hierarchyFields(q)
  const rawChapter = String(q?.chapter ?? '').toLowerCase()
  const rawTopic = String(q?.topic ?? '').toLowerCase()

  if (sub && String(q.subject ?? '').toLowerCase() === sub) score += 40
  if (ch) {
    const have = String(h.chapter ?? '').toLowerCase()
    if (have === ch || rawChapter === ch) score += 35
    else if (
      have.includes(ch) ||
      ch.includes(have) ||
      rawChapter.includes(ch) ||
      ch.includes(rawChapter)
    ) {
      score += 18
    }
  }
  if (top) {
    const have = String(h.topic ?? '').toLowerCase()
    if (have === top || rawTopic === top || rawChapter === top || String(h.chapter ?? '').toLowerCase() === top) {
      score += 25
    } else if (
      have.includes(top) ||
      top.includes(have) ||
      rawTopic.includes(top) ||
      top.includes(rawTopic)
    ) {
      score += 12
    }
  }
  if (effectiveBankStatus(q) === 'published') score += 5
  return score
}

/**
 * How many classroom questions to suggest from duration (minutes).
 * @param {number} durationMinutes
 */
export function suggestedQuestionCount(durationMinutes) {
  const d = Number(durationMinutes)
  if (!Number.isFinite(d) || d <= 0) return 8
  if (d <= 30) return 5
  if (d <= 45) return 8
  if (d <= 60) return 10
  return 12
}

/**
 * Build a local lecture plan (deterministic; AI only polishes wording later).
 * @param {{
 *   pool: import('../data/tests').Question[]
 *   subject?: string
 *   chapter?: string
 *   topic?: string
 *   durationMinutes?: number
 *   classNote?: string
 *   maxQuestions?: number
 * }} opts
 */
export function buildLecturePlanLocal(opts = {}) {
  const subject = String(opts.subject ?? '').trim()
  const chapter = String(opts.chapter ?? '').trim()
  const topic = String(opts.topic ?? '').trim()
  const durationMinutes = Number(opts.durationMinutes) || 45
  const classNote = String(opts.classNote ?? '').trim()
  const maxQ = opts.maxQuestions ?? suggestedQuestionCount(durationMinutes)

  const baseFilters = {
    subject: subject || undefined,
    chapter: chapter || undefined,
    topic: topic || undefined,
  }

  let candidates = filterBankQuestions(opts.pool ?? [], {
    subject: subject || '',
    chapter: chapter || '',
    topic: topic || '',
  }).filter((q) => !q.isPassageHeader)

  // If hierarchy filters were too strict, fall back to scored pool.
  if (candidates.length < 3) {
    candidates = [...(opts.pool ?? [])]
      .filter((q) => !q.isPassageHeader)
      .map((q) => ({ q, score: lectureFitScore(q, baseFilters) }))
      .filter((row) => row.score > 0 || (!subject && !chapter && !topic))
      .sort((a, b) => b.score - a.score || Number(a.q.toughnessLevel ?? 5) - Number(b.q.toughnessLevel ?? 5))
      .map((row) => row.q)
  } else {
    candidates = [...candidates].sort(
      (a, b) => Number(a.toughnessLevel ?? 5) - Number(b.toughnessLevel ?? 5),
    )
  }

  const picked = candidates.slice(0, maxQ)

  /** @type {{ order: number, id: string, role: string, reason: string, snippet: string, toughness?: number, questionType?: string, chapter?: string, topic?: string }[]} */
  const teachingOrder = picked.map((q, i) => {
    const t = Number(q.toughnessLevel)
    let role = 'Practice'
    if (i === 0) role = 'Warm-up'
    else if (i === 1 && picked.length > 3) role = 'Concept check'
    else if (t >= 7) role = 'Challenge'
    else if (t <= 3) role = 'Foundation'
    else role = 'Application'

    const typeLabel = getQuestionType(q.questionType).shortName
    const h = hierarchyFields(q)
    return {
      order: i + 1,
      id: String(q.id),
      role,
      reason: `${role} · ${typeLabel}${Number.isFinite(t) ? ` · ${formatToughnessLabel(t)}` : ''}`,
      snippet: stemSnippet(q.text),
      toughness: Number.isFinite(t) ? t : undefined,
      questionType: q.questionType,
      chapter: h.chapter || undefined,
      topic: h.topic || undefined,
    }
  })

  const subtopics = [
    ...new Set(
      teachingOrder
        .map((row) => row.topic || row.chapter)
        .filter(Boolean)
        .map(String),
    ),
  ].slice(0, 8)

  const titleParts = [subject, chapter, topic].filter(Boolean)
  const title =
    titleParts.length > 0
      ? `Lecture: ${titleParts.join(' · ')}`
      : 'Lecture plan from your question bank'

  const shortDescription = [
    `Teach ${topic || chapter || subject || 'this topic'} in about ${durationMinutes} minutes.`,
    subtopics.length
      ? `Cover: ${subtopics.slice(0, 4).join('; ')}.`
      : 'Start with a warm-up, then concept checks, then application.',
    teachingOrder.length
      ? `Use ${teachingOrder.length} bank question(s) in the suggested order (easy → harder).`
      : 'Upload or tag questions for this chapter/topic, then rebuild the plan.',
    classNote ? `Class note: ${classNote}` : '',
  ]
    .filter(Boolean)
    .join(' ')

  const detailedNotes = [
    `## ${title}`,
    '',
    '### Learning focus',
    shortDescription,
    '',
    '### Suggested board / note flow',
    '1. Recall prior idea (2–3 min).',
    '2. Define today’s key idea with one clean example.',
    '3. Solve the warm-up question together (show marking keywords).',
    '4. Let students try the next 2–3 in order; discuss common traps.',
    '5. End with a short challenge or exit ticket from the last pick.',
    '',
    '### Question order (from your bank)',
    ...teachingOrder.map(
      (row) =>
        `${row.order}. [${row.role}] \`${row.id}\` — ${row.snippet}${row.reason ? ` (${row.reason})` : ''}`,
    ),
    teachingOrder.length ? '' : '_No matching questions yet._',
    '',
    '### Subtopics to sequence',
    ...(subtopics.length ? subtopics.map((s, i) => `${i + 1}. ${s}`) : ['- Use chapter headings from your syllabus.']),
    '',
    classNote ? `### Your note\n${classNote}\n` : '',
    'Questions stay from your bank — AI only helps plan wording and order, it does not invent new items.',
  ]
    .filter((line) => line !== undefined)
    .join('\n')

  return {
    title,
    subject,
    chapter,
    topic,
    durationMinutes,
    classNote,
    shortDescription,
    detailedNotes,
    subtopics,
    teachingOrder,
    questionIds: teachingOrder.map((r) => r.id),
    poolMatched: candidates.length,
    pickedCount: teachingOrder.length,
  }
}

/**
 * @param {ReturnType<typeof buildLecturePlanLocal>} plan
 */
export function formatLecturePlanForAi(plan) {
  const lines = [
    `**${plan.title}** (${plan.durationMinutes} min)`,
    '',
    plan.shortDescription,
    '',
    '**Teaching order**',
    ...plan.teachingOrder.map((r) => `${r.order}. ${r.role} — ${r.id}: ${r.snippet}`),
    '',
    '**Detailed notes (draft)**',
    plan.detailedNotes,
  ]
  return lines.join('\n')
}

/**
 * Polish the local plan with AI when cloud is on; always returns a usable plan.
 * @param {ReturnType<typeof buildLecturePlanLocal>} plan
 * @param {{ signal?: AbortSignal }} [opts]
 */
export async function narrateLecturePlan(plan, opts = {}) {
  const localText = formatLecturePlanForAi(plan)
  const assist = await runAiAssistWithFallback({
    task: 'lecture_planner',
    context: {
      task: 'lecture_planner',
      title: plan.title,
      subject: plan.subject,
      chapter: plan.chapter,
      topic: plan.topic,
      durationMinutes: plan.durationMinutes,
      shortDescription: plan.shortDescription,
      subtopics: plan.subtopics.slice(0, 10),
      teachingOrder: plan.teachingOrder.slice(0, 14).map((r) => ({
        order: r.order,
        id: r.id,
        role: r.role,
        reason: r.reason,
      })),
      rule:
        'Rewrite shortDescription and detailed teaching notes for the teacher. Keep the same question ids and order. Do not invent new question ids or stems. Prefer clear classroom language. Return JSON with text = polished markdown notes.',
    },
    localText,
    localDisclaimer: 'Local plan from your bank. AI polishes wording when available.',
    learningStem: `lecture:${plan.subject}:${plan.chapter}:${plan.topic}:${plan.pickedCount}`,
    recordLearning: true,
    signal: opts.signal,
  })

  const polished = String(assist.text ?? '').trim()
  const shortFromAi = extractShortFromPolished(polished, plan.shortDescription)

  return {
    plan: {
      ...plan,
      shortDescription: shortFromAi,
      detailedNotes: polished || plan.detailedNotes,
      aiPolished: assist.provider === 'cloud-vision',
    },
    badge: lecturePlannerAiBadge(assist.provider),
    provider: assist.provider,
    disclaimer: assist.disclaimer,
    cloudError: assist.cloudError,
  }
}

/**
 * @param {string} polished
 * @param {string} fallback
 */
function extractShortFromPolished(polished, fallback) {
  const text = String(polished ?? '').trim()
  if (!text) return fallback
  // Prefer first non-heading paragraph
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean)
  for (const line of lines) {
    if (/^#+\s/.test(line)) continue
    if (/^\*\*/.test(line) && line.length < 80) continue
    if (line.length >= 40) return line.replace(/\*\*/g, '').slice(0, 420)
  }
  return fallback
}
