/**
 * Daily Practice Sheet — one dated chapter/subject sheet from your bank.
 * Printable. Not Today’s Drill (mixed compete) and not Today’s Target (weak-chapter count).
 */
import { getExamPattern } from '../data/examPatterns.js'
import { loadPublishedUploadedQuestions } from './questionBank.js'
import { filterQuestionsForNonCdfUse } from './cdfOnlyQuestions.js'
import { filterQuestionsByExam } from './practiceFilters.js'
import { getAnswerableQuestions } from './passage.js'
import { prepareQuestionsForTest } from './testQuestionClone.js'
import { loadDynamicTestMap, saveDynamicTestMap } from './dynamicTestStorage.js'
import { getOwnerKey } from './attemptHistory.js'
import { hierarchyFields } from './bankListFilters.js'
import { DRILL_FALLBACK_QUESTIONS } from './todaysDrillStore.js'
import { enforce_parent_child_exclusion } from './enforceParentChildExclusion.js'
import { publicSiteUrl } from '../config/platform.js'

const SESSIONS_KEY = 'testvantage-daily-sheet-sessions'
const PROGRESS_KEY = 'testvantage-daily-sheet-progress'

function dayStamp() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY)
    return raw ? JSON.parse(raw) : { byKey: {} }
  } catch {
    return { byKey: {} }
  }
}

function saveProgress(data) {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(data))
}

function progressKey(ownerKey, examPatternId, subject, chapter) {
  return `${ownerKey}::${examPatternId}::${subject || 'all'}::${chapter || 'all'}::${dayStamp()}`
}

export function getSheetTestById(testId) {
  if (!testId?.startsWith('sheet-')) return null
  return loadDynamicTestMap(SESSIONS_KEY)[testId] ?? null
}

/**
 * @param {string} examPatternId
 * @param {string} [subject]
 */
export function listSheetChapters(examPatternId, subject) {
  const bank = filterQuestionsForNonCdfUse(loadPublishedUploadedQuestions())
  const examBank = filterQuestionsByExam(bank, examPatternId)
  const set = new Set()
  for (const q of examBank) {
    if (q.isPassageHeader) continue
    if (subject && (q.subject || q.syllabusSubject) !== subject) continue
    const ch = hierarchyFields(q).chapter
    if (ch) set.add(ch)
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

/**
 * @param {string} ownerKey
 * @param {{ examPatternId: string, subject?: string, chapter?: string }} sel
 */
export function getTodaysSheetProgress(ownerKey, sel) {
  const data = loadProgress()
  return data.byKey[progressKey(ownerKey, sel.examPatternId, sel.subject, sel.chapter)] ?? null
}

/**
 * @param {{
 *   examPatternId: string
 *   userId?: string
 *   subject?: string
 *   chapter?: string
 *   questionCount?: number
 * }} config
 */
export function createOrResumeDailySheet(config) {
  const examId = config.examPatternId || 'jee-main'
  const ownerKey = getOwnerKey(config.userId)
  const subject = config.subject || ''
  const chapter = config.chapter || ''
  const existing = getTodaysSheetProgress(ownerKey, { examPatternId: examId, subject, chapter })
  if (existing?.testId && !existing.completed) {
    const test = getSheetTestById(existing.testId)
    if (test) {
      return { ok: true, test, resumed: true, progress: existing, usedFallback: !!test.sheetMeta?.usedFallback }
    }
  }

  const bank = filterQuestionsForNonCdfUse(loadPublishedUploadedQuestions())
  let examBank = filterQuestionsByExam(bank, examId)
  if (subject) {
    examBank = examBank.filter((q) => (q.subject || q.syllabusSubject) === subject)
  }
  if (chapter) {
    examBank = examBank.filter((q) => hierarchyFields(q).chapter === chapter)
  }
  let answerable = getAnswerableQuestions(examBank)
  let usedFallback = false
  if (answerable.length < 3) {
    let fallback = getAnswerableQuestions(DRILL_FALLBACK_QUESTIONS)
    if (subject) fallback = fallback.filter((q) => (q.subject || q.syllabusSubject) === subject)
    if (chapter) fallback = fallback.filter((q) => hierarchyFields(q).chapter === chapter)
    if (fallback.length >= 3) {
      answerable = fallback
      usedFallback = true
    }
  }
  if (answerable.length < 3) {
    return {
      ok: false,
      error:
        'Not enough published questions for this sheet yet. Pick All chapters, or publish a few in Question Bank.',
    }
  }

  const count = Math.min(config.questionCount ?? 8, answerable.length, 12)
  const shuffled = enforce_parent_child_exclusion(
    [...answerable].sort(() => Math.random() - 0.5).slice(0, count),
  )
  const clonePool = bank.length ? bank : [...DRILL_FALLBACK_QUESTIONS, ...shuffled]
  const prepared = prepareQuestionsForTest(clonePool, shuffled, `sheet-q-${Date.now()}`)
  const exam = getExamPattern(examId)
  const id = `sheet-${dayStamp()}-${examId}-${Date.now()}`
  const minutes = Math.max(20, Math.ceil(prepared.length * 2.5))
  const scope = [exam?.shortName ?? examId, subject || 'all subjects', chapter || 'mixed chapters'].join(' · ')

  /** @type {import('../data/tests').Test} */
  const test = {
    id,
    title: `Daily Practice Sheet — ${dayStamp()}`,
    description: scope,
    examPatternId: examId,
    testTypeId: 'practice',
    durationMinutes: minutes,
    totalQuestions: getAnswerableQuestions(prepared).length,
    questions: prepared,
    sheetMeta: { day: dayStamp(), examPatternId: examId, subject, chapter, usedFallback },
  }

  const map = loadDynamicTestMap(SESSIONS_KEY)
  map[id] = test
  saveDynamicTestMap(SESSIONS_KEY, map)

  const data = loadProgress()
  const key = progressKey(ownerKey, examId, subject, chapter)
  data.byKey[key] = {
    day: dayStamp(),
    examPatternId: examId,
    subject,
    chapter,
    testId: id,
    ownerKey,
    completed: false,
    updatedAt: Date.now(),
  }
  saveProgress(data)

  return { ok: true, test, resumed: false, progress: data.byKey[key], usedFallback }
}

/**
 * Printable HTML — questions only. Answers stay in the exam.
 * @param {import('../data/tests').Test} test
 */
export function buildDailySheetHtml(test) {
  const qs = getAnswerableQuestions(test.questions || [])
  const rows = qs
    .map((q, i) => {
      const opts = (q.options || [])
        .map((o, idx) => `<li>${String.fromCharCode(65 + idx)}. ${escapeHtml(stripMath(o))}</li>`)
        .join('')
      return `<article class="sheet-q"><h3>Q${i + 1}</h3><p>${escapeHtml(stripMath(q.text || ''))}</p>${
        opts ? `<ol class="sheet-opts">${opts}</ol>` : '<p class="sheet-num">Write your numerical / integer answer.</p>'
      }</article>`
    })
    .join('\n')
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>TestVantages Daily Practice Sheet</title>
<style>
  body { font-family: Georgia, serif; max-width: 720px; margin: 24px auto; color: #111; }
  .brand { font-size: 12px; letter-spacing: .12em; text-transform: uppercase; color: #64748b; }
  h1 { font-size: 22px; margin: 6px 0 4px; }
  .meta { color: #475569; margin-bottom: 20px; }
  .sheet-q { border-top: 1px solid #e2e8f0; padding: 12px 0; }
  .sheet-q h3 { margin: 0 0 6px; font-size: 14px; }
  .sheet-opts { margin: 8px 0 0 1.1rem; }
  footer { margin-top: 28px; font-size: 11px; color: #94a3b8; }
</style></head><body>
<p class="brand">TestVantages</p>
<h1>${escapeHtml(test.title || 'Daily Practice Sheet')}</h1>
<p class="meta">${escapeHtml(test.description || '')} · ${qs.length} questions · Attempt in TestVantages for answers and analysis.</p>
${rows}
<footer>TestVantages Daily Practice Sheet · ${escapeHtml(publicSiteUrl())}/daily-sheet · Answers are not printed on this sheet.</footer>
</body></html>`
}

function stripMath(s) {
  return String(s || '')
    .replace(/\$\$[\s\S]*?\$\$/g, ' [math] ')
    .replace(/\$[^$]+\$/g, ' [math] ')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
