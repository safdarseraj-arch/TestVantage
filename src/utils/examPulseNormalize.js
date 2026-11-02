/**
 * Shared Exam Pulse helpers — category guess, relevance, badges, dedupe.
 * Used by the API server and unit tests (no DOM / no Gemini).
 */

/** @typedef {import('../data/examPulseCurated.js').ExamPulseCategory} ExamPulseCategory */
/** @typedef {import('../data/examPulseCurated.js').ExamPulseBadge} ExamPulseBadge */
/** @typedef {import('../data/examPulseCurated.js').ExamPulseItem} ExamPulseItem */

/**
 * @param {string} title
 * @param {string} desc
 */
export function isStudentRelevant(title, desc) {
  const text = `${title} ${desc}`.toLowerCase()
  const strong =
    /\b(jee(\s*main|\s*advanced)?|neet|nta|josaa|csab|mcc|iit|nit|iiit|mbbs|cuet|admit\s*card|cut[- ]?off|counsell?ing|rank\s*list)\b/i.test(
      text,
    )
  const soft =
    /\b(admission|entrance\s*exam|board\s*exam|placement|internship|campus\s+hir|engineering\s+aspirant|medical\s+aspirant|scholarship|syllabus)\b/i.test(
      text,
    )
  const noise =
    /\b(horoscope|bollywood|cricket\s+score|stock\s+market|fashion|recipe)\b/i.test(text)
  return (strong || soft) && !noise
}

/**
 * @param {string} title
 * @param {string} desc
 * @param {string} fallback
 * @returns {ExamPulseCategory}
 */
export function guessExamPulseCategory(title, desc, fallback) {
  const t = `${title} ${desc}`.toLowerCase()
  if (/placement|internship|hiring|campus job|career|salary|recruit/i.test(t)) return 'placements'
  if (/motiv|habit|study tip|focus|mental|wellbeing|well-being|stress|discipline/i.test(t))
    return 'motivation'
  if (/josaa|csab|mcc|counsell|admission|seat|college allot|choice filling/i.test(t))
    return 'admissions'
  if (/jee|neet|nta|exam|admit card|result|syllabus|registration|session/i.test(t)) return 'exams'
  return fallback === 'placements' ||
    fallback === 'motivation' ||
    fallback === 'exams' ||
    fallback === 'admissions'
    ? /** @type {ExamPulseCategory} */ (fallback)
    : 'admissions'
}

/**
 * @param {unknown} raw
 * @param {ExamPulseBadge} [fallback]
 * @returns {ExamPulseBadge}
 */
export function normalizeExamPulseBadge(raw, fallback = 'news') {
  const b = String(raw ?? '')
    .toLowerCase()
    .trim()
  if (b === 'official' || b === 'ai' || b === 'curated' || b === 'news') return b
  return fallback
}

/**
 * @param {ExamPulseItem[]} items
 * @returns {ExamPulseItem[]}
 */
export function dedupeExamPulseItems(items) {
  const seen = new Set()
  const out = []
  for (const item of items) {
    const key = String(item.title || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .slice(0, 80)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

/**
 * Student-facing “why it matters” — never invent dates; soft fallback from summary.
 * @param {string} why
 * @param {string} summary
 * @param {ExamPulseCategory} category
 */
export function ensureWhyItMatters(why, summary, category) {
  const w = String(why || '')
    .trim()
    .slice(0, 220)
  if (w.length >= 12) return w
  const s = String(summary || '')
    .trim()
    .slice(0, 160)
  if (s) return `For aspirants: ${s}`
  const hints = {
    exams: 'Confirm dates and downloads only on the official exam portal.',
    admissions: 'Counselling rules change by round — verify on the allotment site.',
    placements: 'Skills and internships compound earlier than last-year panic prep.',
    motivation: 'Small daily improvements beat one exhausting cram session.',
  }
  return hints[category] || 'Useful context for JEE / NEET aspirants — verify on official sites.'
}

/** Human label for provenance badges */
export function examPulseBadgeLabel(badge) {
  switch (normalizeExamPulseBadge(badge)) {
    case 'official':
      return 'Official source'
    case 'ai':
      return 'AI summary'
    case 'curated':
      return 'Curated'
    default:
      return 'Education desk'
  }
}
