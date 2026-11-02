/**
 * AI chapter-strength model from attempt history.
 * Powers practice picks, analytics, result coach, and paper tuning (local, no cloud API).
 */

/** @typedef {{ chapter: string, subject?: string, correct: number, wrong: number, unattempted: number, attempts: number, accuracy: number, masteryScore: number, trend: 'up' | 'down' | 'flat' }} ChapterMastery */

/** @typedef {{ chapters: Record<string, ChapterMastery>, overallMastery: number, totalQuestions: number, weakCount: number }} MasteryGraph */

/**
 * @param {import('./attemptHistory.js').Attempt[]} attempts newest first
 * @returns {MasteryGraph}
 */
export function buildMasteryGraph(attempts = []) {
  /** @type {Record<string, { correct: number, wrong: number, unattempted: number, tests: number, subject?: string, recent: number[], older: number[] }>} */
  const raw = {}

  for (const [ai, a] of attempts.entries()) {
    const chapters = a.byChapter ?? a.resultSnapshot?.result?.byChapter ?? {}
    for (const [chapter, stats] of Object.entries(chapters)) {
      const key = String(chapter).trim().toLowerCase()
      if (!key) continue
      if (!raw[key]) {
        raw[key] = { correct: 0, wrong: 0, unattempted: 0, tests: 0, recent: [], older: [] }
      }
      const c = stats.correct ?? 0
      const w = stats.wrong ?? 0
      const u = stats.unattempted ?? 0
      raw[key].correct += c
      raw[key].wrong += w
      raw[key].unattempted += u
      raw[key].tests += 1
      const att = c + w
      const acc = att > 0 ? Math.round((c / att) * 100) : 0
      if (ai < 4) raw[key].recent.push(acc)
      else raw[key].older.push(acc)
      if (!raw[key].subject && a.bySubject) {
        const sub = Object.keys(a.bySubject)[0]
        if (sub) raw[key].subject = sub
      }
    }
  }

  /** @type {Record<string, ChapterMastery>} */
  const chapters = {}
  let masterySum = 0
  let masteryN = 0
  let weakCount = 0
  let totalQuestions = 0

  for (const [key, s] of Object.entries(raw)) {
    const att = s.correct + s.wrong
    totalQuestions += att + s.unattempted
    const accuracy = att > 0 ? Math.round((s.correct / att) * 100) : 0
    const volumeBoost = Math.min(12, s.tests * 2)
    const masteryScore = Math.min(100, Math.max(0, Math.round(accuracy * 0.85 + volumeBoost)))
    const recentAvg =
      s.recent.length > 0 ? s.recent.reduce((a, b) => a + b, 0) / s.recent.length : accuracy
    const olderAvg =
      s.older.length > 0 ? s.older.reduce((a, b) => a + b, 0) / s.older.length : recentAvg
    let trend = 'flat'
    if (s.recent.length && s.older.length) {
      if (recentAvg - olderAvg >= 8) trend = 'up'
      else if (olderAvg - recentAvg >= 8) trend = 'down'
    }
    if (masteryScore < 55 && s.wrong > 0) weakCount += 1
    masterySum += masteryScore
    masteryN += 1
    chapters[key] = {
      chapter: key.replace(/\b\w/g, (c) => c.toUpperCase()),
      subject: s.subject,
      correct: s.correct,
      wrong: s.wrong,
      unattempted: s.unattempted,
      attempts: s.tests,
      accuracy,
      masteryScore,
      trend,
    }
  }

  return {
    chapters,
    overallMastery: masteryN > 0 ? Math.round(masterySum / masteryN) : 50,
    totalQuestions,
    weakCount,
  }
}

/**
 * @param {MasteryGraph} graph
 * @param {number} [limit]
 */
export function pickWeakChaptersForStudy(graph, limit = 5) {
  return Object.values(graph.chapters ?? {})
    .filter((c) => c.wrong > 0 || c.masteryScore < 60)
    .sort((a, b) => a.masteryScore - b.masteryScore || b.wrong - a.wrong)
    .slice(0, limit)
}

/**
 * @param {MasteryGraph} graph
 */
export function recommendedToughnessFromMastery(graph) {
  const m = graph?.overallMastery ?? 50
  if (m >= 78) return 7
  if (m >= 65) return 6
  if (m >= 50) return 5
  if (m >= 35) return 4
  return 3.5
}

/**
 * Daily learning path from chapter strength + attempts.
 * @param {import('./attemptHistory.js').Attempt[]} attempts
 */
export function buildAiStudyPlan(attempts = []) {
  const mastery = buildMasteryGraph(attempts)
  const weak = pickWeakChaptersForStudy(mastery, 6)
  /** @type {{ priority: number, title: string, detail: string, to: string, chapter?: string, subject?: string, icon: string }[]} */
  const steps = []

  if (weak.length) {
    const top = weak[0]
    steps.push({
      priority: 1,
      title: `Drill ${top.chapter}`,
      detail: `${top.masteryScore}% chapter strength · ${top.wrong} wrong across ${top.attempts} test(s)`,
      to: '/practice',
      chapter: top.chapter,
      subject: top.subject,
      icon: '🎯',
    })
  }

  if (mastery.overallMastery < 55) {
    steps.push({
      priority: 2,
      title: 'Easy revision set',
      detail: 'AI picks medium-easy questions to rebuild fundamentals',
      to: '/practice',
      icon: '📖',
    })
  } else if (mastery.overallMastery >= 75) {
    steps.push({
      priority: 2,
      title: 'Challenge mock',
      detail: 'You are ready for harder papers — start a comprehensive mock',
      to: '/mock-test',
      icon: '🏆',
    })
  }

  const declining = weak.filter((c) => c.trend === 'down').slice(0, 2)
  for (const d of declining) {
    steps.push({
      priority: 3,
      title: `Review ${d.chapter}`,
      detail: `Accuracy dropping — revisit concepts before next mock`,
      to: '/practice',
      chapter: d.chapter,
      subject: d.subject,
      icon: '📉',
    })
  }

  steps.push({
    priority: 4,
    title: 'Calibrated adaptive test',
    detail: 'GRE-style test that finds your true level question-by-question',
    to: '/mock-test',
    icon: '⚡',
  })

  const unique = []
  const seen = new Set()
  for (const s of steps.sort((a, b) => a.priority - b.priority)) {
    const k = `${s.title}:${s.chapter ?? ''}`
    if (seen.has(k)) continue
    seen.add(k)
    unique.push(s)
  }

  let summary = 'Complete a few mocks to unlock personalised AI learning paths.'
  if (attempts.length >= 1 && weak.length) {
    summary = `Focus on **${weak[0].chapter}** first — AI will prioritize weak chapters in practice.`
  } else if (attempts.length >= 1 && mastery.overallMastery >= 70) {
    summary = 'Strong foundation — push with harder mocks and calibrated adaptive tests.'
  }

  return {
    mastery,
    weakChapters: weak,
    steps: unique.slice(0, 5),
    summary,
    recommendedToughness: recommendedToughnessFromMastery(mastery),
  }
}

const PRACTICE_PREFILL_KEY = 'testvantage-practice-prefill'

/**
 * Store syllabus prefill for Practice page (from analytics / result coach links).
 * @param {{ subjects?: string[], chapters?: string[], topics?: string[], examPatternId?: string }} prefill
 */
export function savePracticePrefill(prefill) {
  try {
    sessionStorage.setItem(PRACTICE_PREFILL_KEY, JSON.stringify(prefill))
  } catch {
    /* ignore */
  }
}

/** @returns {{ subjects?: string[], chapters?: string[], topics?: string[], examPatternId?: string } | null} */
export function loadPracticePrefill() {
  try {
    const raw = sessionStorage.getItem(PRACTICE_PREFILL_KEY)
    if (!raw) return null
    sessionStorage.removeItem(PRACTICE_PREFILL_KEY)
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * Skill bonus for question pick scoring (weaker chapters → higher priority).
 * @param {import('../data/tests').Question} q
 * @param {MasteryGraph | null | undefined} graph
 */
export function masteryPickBonus(q, graph) {
  if (!graph?.chapters) return 0
  const ch = String(q.chapter ?? q.section ?? '').trim().toLowerCase()
  if (!ch) return 0
  const entry = graph.chapters[ch]
  if (!entry) return 0
  if (entry.masteryScore >= 70) return -2
  return Math.round((70 - entry.masteryScore) * 0.2)
}
