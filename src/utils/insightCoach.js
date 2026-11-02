/**
 * Insight Coach — AI-assisted analysis for Form Forecast, Exam Fit, Precision Map, Analytics.
 * Numbers stay rule-based; Gemini (when ready) polishes priorities into plain language.
 * Always falls back to local coaching — never crashes without a key.
 */

import { runAiAssistWithFallback } from './aiProviderAssist.js'

/**
 * Build rule-based coach pack from standing insights (real attempt-derived inputs).
 * @param {{
 *   forecast?: object | null
 *   examFit?: object | null
 *   precision?: object | null
 *   analytics?: { avgAccuracy?: number, avgPercentile?: number, weakChapters?: { chapter: string, accuracy: number }[] } | null
 * }} pack
 */
export function buildInsightCoachLocal(pack = {}) {
  const forecast = pack.forecast ?? null
  const examFit = pack.examFit ?? null
  const precision = pack.precision ?? null
  const analytics = pack.analytics ?? null

  /** @type {string[]} */
  const priorities = []
  /** @type {string[]} */
  const why = []
  /** @type {string[]} */
  const revisionOrder = []
  /** @type {{ label: string, to: string, icon?: string }[]} */
  const actions = []

  if (examFit?.ladder?.length) {
    for (const rung of examFit.ladder.slice(0, 5)) {
      revisionOrder.push(
        `${rung.rank}. ${rung.chapter} — ${rung.accuracy}% acc · ${rung.wrong} wrong (${rung.reason})`,
      )
      if (rung.rank <= 3) {
        priorities.push(`Climb Revision Ladder #${rung.rank}: ${rung.chapter}`)
      }
    }
    actions.push({
      label: 'Open Revision Ladder',
      to: '/form-forecast#revision-ladder',
      icon: '🪜',
    })
  } else if (analytics?.weakChapters?.length) {
    for (const [i, c] of analytics.weakChapters.slice(0, 5).entries()) {
      revisionOrder.push(`${i + 1}. ${c.chapter} — ${c.accuracy}% accuracy`)
      if (i < 3) priorities.push(`Drill ${c.chapter} (${c.accuracy}% accuracy)`)
    }
  }

  if (precision?.topAlerts?.length) {
    for (const a of precision.topAlerts.slice(0, 4)) {
      why.push(
        `${a.chapter} · ${a.typeLabel}: ${a.tagLabel} — ${a.detail}`,
      )
      if (a.tag === 'under_pressure' || a.tag === 'fast_wrong') {
        priorities.push(`Fix ${a.tagLabel.toLowerCase()} in ${a.chapter} (${a.typeLabel})`)
      }
    }
    actions.push({
      label: 'Open Precision Map',
      to: '/form-forecast#precision-map',
      icon: '🗺️',
    })
  } else if (precision?.insights?.length) {
    for (const ins of precision.insights.slice(0, 3)) {
      why.push(`${ins.title}: ${ins.detail}`)
    }
  }

  let formVsExamDay =
    'Take timed mocks to unlock Form Forecast, then compare practice marks with Career Compass for exam-day colleges.'

  if (forecast?.ready) {
    formVsExamDay = [
      `Practice form (${forecast.examLabel}): ~${forecast.practiceMarks}/${forecast.marksMax} marks → AIR ~${Number(forecast.air).toLocaleString('en-IN')}`,
      `(confidence ${forecast.confidenceLabel} · ${forecast.confidence}%; band ${Number(forecast.airLow).toLocaleString('en-IN')}–${Number(forecast.airHigh).toLocaleString('en-IN')}).`,
      forecast.formNote || '',
      'Career Compass uses the same marks style for NTA AIR, colleges, and choice filling — practice form vs projected exam day.',
    ]
      .filter(Boolean)
      .join(' ')
    actions.push({
      label: 'Career Compass with these marks',
      to: `/career-compass?exam=${forecast.examId}&marks=${forecast.practiceMarks}`,
      icon: '🧭',
    })
    if (forecast.trend === 'down') {
      priorities.unshift('Practice AIR softened — climb Revision Ladder before the next full mock')
    } else if (forecast.trend === 'up') {
      priorities.unshift('Practice form is improving — keep timed mocks like exam day')
    }
  }

  if (examFit && examFit.score > 0) {
    priorities.push(`Exam Fit ${examFit.score}/100 (${examFit.label})`)
    if (examFit.score < 55) {
      why.push('Exam Fit is below target — fundamentals and wrongs first, then full mocks.')
    }
  }

  if (analytics?.avgAccuracy != null) {
    why.push(
      `Across attempts: ~${analytics.avgAccuracy}% accuracy` +
        (analytics.avgPercentile != null ? `, avg percentile ~${analytics.avgPercentile}` : ''),
    )
  }

  if (!priorities.length) {
    priorities.push('Complete a timed mock to unlock Insight Coach priorities')
  }
  if (!why.length) {
    why.push('Needs review — not enough timed question data yet for Precision Map why-notes.')
  }
  if (!revisionOrder.length) {
    revisionOrder.push('Needs review — no weak chapters yet. Finish a mock with chapter tags.')
  }

  actions.push({ label: 'Syllabus practice', to: '/practice', icon: '📖' })
  actions.push({ label: 'AI Mock Builder', to: '/mock-test', icon: '🎯' })

  const uniqueActions = []
  const seen = new Set()
  for (const a of actions) {
    if (seen.has(a.to)) continue
    seen.add(a.to)
    uniqueActions.push(a)
  }

  const summary = [
    examFit?.score ? `Exam Fit ${examFit.score}/100.` : null,
    forecast?.ready
      ? `Practice AIR ~${Number(forecast.air).toLocaleString('en-IN')} (${forecast.examLabel}).`
      : null,
    priorities[0] ? `Top focus: ${priorities[0]}.` : null,
  ]
    .filter(Boolean)
    .join(' ')

  const localText = [
    summary || 'Insight Coach is ready once you have attempt data.',
    '',
    'Priorities:',
    ...priorities.slice(0, 5).map((p, i) => `${i + 1}. ${p}`),
    '',
    'Why (from your data):',
    ...why.slice(0, 4).map((w) => `- ${w}`),
    '',
    'Revision order:',
    ...revisionOrder.slice(0, 5).map((r) => `- ${r}`),
    '',
    `Practice form vs exam day: ${formVsExamDay}`,
  ].join('\n')

  return {
    summary: summary || 'Take a mock to unlock Insight Coach.',
    priorities: priorities.slice(0, 6),
    why: why.slice(0, 6),
    revisionOrder: revisionOrder.slice(0, 6),
    formVsExamDay,
    actions: uniqueActions.slice(0, 5),
    localText,
    needsReview: !forecast?.ready && !(examFit?.score > 0),
    disclaimer:
      'Insight Coach uses your real attempts. AIR/marks stay from Form Forecast / Career Compass curves — AI only explains priorities. Not a seat guarantee.',
  }
}

/**
 * Local coaching + optional Cloud (Gemini) plain-language polish.
 * @param {Parameters<typeof buildInsightCoachLocal>[0]} pack
 */
export async function runInsightCoach(pack = {}) {
  const local = buildInsightCoachLocal(pack)
  const forecast = pack.forecast ?? null

  try {
    const assist = await runAiAssistWithFallback({
      task: 'insight-coach',
      localText: local.localText,
      localDisclaimer: local.disclaimer,
      learningStem: `insight-coach:${forecast?.examId || 'na'}:${forecast?.air ?? ''}:${pack.examFit?.score ?? ''}:${(local.priorities[0] || '').slice(0, 40)}`,
      recordLearning: true,
      context: {
        instruction:
          'You are TestVantages Insight Coach for JEE/NEET. Write 3–5 short student-friendly sentences. Use ONLY the given numbers and chapter names. Do NOT invent scores, AIR, percentiles, or cut-offs. Cover: (1) top priorities, (2) why from time×chapter×type if given, (3) revision order tip, (4) practice form vs Career Compass exam-day note. Plain language.',
        summary: local.summary,
        priorities: local.priorities,
        why: local.why,
        revisionOrder: local.revisionOrder,
        formVsExamDay: local.formVsExamDay,
        examFit: pack.examFit
          ? { score: pack.examFit.score, label: pack.examFit.label }
          : null,
        forecast: forecast?.ready
          ? {
              examLabel: forecast.examLabel,
              practiceMarks: forecast.practiceMarks,
              marksMax: forecast.marksMax,
              air: forecast.air,
              confidence: forecast.confidence,
              confidenceLabel: forecast.confidenceLabel,
              trend: forecast.trend,
            }
          : null,
        precisionAlerts: (pack.precision?.topAlerts ?? []).slice(0, 4).map((a) => ({
          chapter: a.chapter,
          type: a.typeLabel,
          tag: a.tagLabel,
        })),
      },
    })

    return {
      ...local,
      narrative: assist.text || local.localText,
      badge: assist.badge || 'Local AI',
      provider: assist.provider || 'local',
      cloudAttempted: !!assist.cloudAttempted,
      cloudError: assist.cloudError,
      disclaimer: assist.disclaimer || local.disclaimer,
    }
  } catch {
    return {
      ...local,
      narrative: local.localText,
      badge: 'Local AI',
      provider: 'local',
      cloudAttempted: false,
      disclaimer: local.disclaimer,
    }
  }
}
