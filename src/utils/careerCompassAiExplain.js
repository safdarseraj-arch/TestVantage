/**
 * Career Compass AI explain layer.
 * Rank / percentile / cutoffs stay Official (NTA curves). AI only narrates.
 */

import { runAiAssistWithFallback } from './aiProviderAssist.js'

/**
 * Local (no cloud) explanation from already-computed prediction + matches.
 * @param {{
 *   examLabel?: string
 *   prediction?: {
 *     rank?: number | null
 *     percentile?: number | null
 *     marks?: number | null
 *     bandHint?: string
 *     category?: string
 *   }
 *   topMatches?: { name?: string, branch?: string, chance?: string, reason?: string }[]
 * }} input
 */
export function buildCareerCompassExplainLocal(input = {}) {
  const p = input.prediction ?? {}
  const lines = []
  lines.push('**Official numbers** (from NTA-style marks↔rank curves — not invented by AI):')
  if (p.marks != null) lines.push(`- Marks used: **${p.marks}**`)
  if (p.percentile != null) lines.push(`- Approx percentile: **${p.percentile}**`)
  if (p.rank != null) lines.push(`- Approx All-India rank band mid: **${p.rank}**`)
  if (p.bandHint) lines.push(`- Band note: ${p.bandHint}`)
  if (p.category) lines.push(`- Category: ${p.category}`)

  const matches = (input.topMatches ?? []).slice(0, 5)
  if (matches.length) {
    lines.push('')
    lines.push('**College matches** (indicative from stored cutoffs + your rank band):')
    for (const m of matches) {
      const bits = [m.name, m.branch, m.chance].filter(Boolean).join(' · ')
      lines.push(`- ${bits}${m.reason ? ` — ${m.reason}` : ''}`)
    }
  } else {
    lines.push('')
    lines.push('Enter marks (or percentile/rank) to see indicative college matches.')
  }

  lines.push('')
  lines.push(
    'AI may polish this wording when Cloud (Gemini) is on — it must **not** change the Official rank numbers.',
  )

  return {
    text: lines.join('\n'),
    disclaimer:
      'Official = NTA-curve ranks/cutoffs. AI = wording help only. Not counselling or seat guarantee.',
  }
}

/**
 * Gemini-first explain; always keeps Official numbers from `prediction`.
 * @param {Parameters<typeof buildCareerCompassExplainLocal>[0] & { examId?: string }} input
 */
export async function explainCareerCompassPrediction(input = {}) {
  const local = buildCareerCompassExplainLocal(input)
  const context = {
    task: 'career_compass_explain',
    examId: input.examId,
    examLabel: input.examLabel,
    official: {
      marks: input.prediction?.marks ?? null,
      percentile: input.prediction?.percentile ?? null,
      rank: input.prediction?.rank ?? null,
      bandHint: input.prediction?.bandHint ?? null,
      category: input.prediction?.category ?? null,
    },
    topMatches: (input.topMatches ?? []).slice(0, 6).map((m) => ({
      name: m.name,
      branch: m.branch,
      chance: m.chance,
      reason: m.reason,
    })),
    rule: 'Do not invent or change official.marks / percentile / rank. Only explain.',
  }

  return runAiAssistWithFallback({
    task: 'career_compass_explain',
    context,
    localText: local.text,
    localDisclaimer: local.disclaimer,
    learningStem: `career:${input.examId || 'exam'}:${input.prediction?.rank ?? ''}:${input.prediction?.marks ?? ''}`,
    recordLearning: true,
  })
}
