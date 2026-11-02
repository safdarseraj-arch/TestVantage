/**
 * AI Mock Builder assist — narrate paper tune report; local fallback + Gemini polish.
 */

import { runAiAssistWithFallback } from './aiProviderAssist.js'

/**
 * @param {{
 *   profileLabel?: string
 *   questionCount?: number
 *   syllabusCoverage?: number
 *   difficultyFit?: number
 *   qualityScore?: number
 *   chapterHints?: string[]
 *   pyqShare?: number
 *   notes?: string[]
 * }} report
 */
export function buildMockBuilderNarrativeLocal(report = {}) {
  const lines = []
  lines.push('**Mock paper plan** (built on your device from your question bank):')
  if (report.profileLabel) lines.push(`- Profile: **${report.profileLabel}**`)
  if (report.questionCount != null) lines.push(`- Questions: **${report.questionCount}**`)
  if (report.syllabusCoverage != null) {
    lines.push(`- Syllabus coverage score: **${report.syllabusCoverage}%**`)
  }
  if (report.difficultyFit != null) {
    lines.push(`- Difficulty fit: **${report.difficultyFit}%**`)
  }
  if (report.qualityScore != null) lines.push(`- Overall quality: **${report.qualityScore}**`)
  if (report.pyqShare != null) lines.push(`- PYQ-style share (approx): **${report.pyqShare}%**`)

  const chapters = (report.chapterHints ?? []).filter(Boolean).slice(0, 8)
  if (chapters.length) {
    lines.push('')
    lines.push('**Chapters emphasised:**')
    for (const c of chapters) lines.push(`- ${c}`)
  }

  const notes = (report.notes ?? []).filter(Boolean).slice(0, 6)
  if (notes.length) {
    lines.push('')
    lines.push('**Notes:**')
    for (const n of notes) lines.push(`- ${n}`)
  }

  lines.push('')
  lines.push(
    'Cloud (Gemini) can rephrase this plan when enabled. Question picks stay from your bank — AI does not invent new items here.',
  )

  return {
    text: lines.join('\n'),
    disclaimer: 'Local assembly from your bank. Cloud AI = wording only unless you later enable generation.',
  }
}

/**
 * @param {Parameters<typeof buildMockBuilderNarrativeLocal>[0] & { examId?: string }} report
 */
export async function narrateMockBuilderPlan(report = {}) {
  const local = buildMockBuilderNarrativeLocal(report)
  return runAiAssistWithFallback({
    task: 'mock_builder_narrative',
    context: {
      task: 'mock_builder_narrative',
      examId: report.examId,
      profileLabel: report.profileLabel,
      questionCount: report.questionCount,
      syllabusCoverage: report.syllabusCoverage,
      difficultyFit: report.difficultyFit,
      qualityScore: report.qualityScore,
      pyqShare: report.pyqShare,
      chapterHints: (report.chapterHints ?? []).slice(0, 10),
      notes: (report.notes ?? []).slice(0, 8),
      rule: 'Do not invent question text. Explain the given plan only.',
    },
    localText: local.text,
    localDisclaimer: local.disclaimer,
    learningStem: `mock:${report.examId || 'exam'}:${report.profileLabel || ''}:${report.questionCount ?? ''}`,
    recordLearning: true,
  })
}
