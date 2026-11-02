/**
 * Printable paper manifest (PDF via browser Print → Save as PDF).
 */

import { getExamPattern } from '../data/examPatterns.js'
import { getQuestionType } from '../data/questionTypes.js'
import { getAnswerableQuestions } from './passage.js'
import { buildPaperReviewManifest, computeQualityBreakdown } from './paperPublish.js'
import { selectionProgressBySlot } from './paperAssembly.js'
import { examPath } from './examNavigation.js'

/** @param {string} text */
export function stripStemForManifest(text) {
  return String(text ?? '')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$\n]+\$/g, ' ')
    .replace(/\\[a-zA-Z]+\{?[^}]*\}?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * @param {import('../data/tests').Test} test
 */
export function buildPaperManifestData(test) {
  if (!test) return null
  const questions = test.questions ?? []
  const answerable = getAnswerableQuestions(questions)
  const pattern = getExamPattern(test.examPatternId)
  const breakdown = computeQualityBreakdown(answerable, test.paperBlueprint ?? [])
  const review = buildPaperReviewManifest(answerable, test.paperBlueprint ?? [])
  const slotProgress = selectionProgressBySlot(answerable, test.paperBlueprint ?? [])

  return {
    title: test.title,
    description: test.description ?? '',
    patternName: pattern?.name ?? test.examPatternId,
    durationMinutes: test.durationMinutes,
    totalQuestions: test.totalQuestions ?? answerable.length,
    qualityScore: test.qualityScore ?? breakdown.total,
    publishVersion: test.publishVersion ?? 1,
    publishedAt: test.publishedAt,
    examUrl: examPath(test.id),
    breakdown,
    slotProgress: slotProgress.map((r) => ({
      type: r.slot.questionTypeId,
      need: r.need,
      have: r.have,
    })),
    questions: review.map((r) => ({
      index: r.index,
      type: getQuestionType(r.type).shortName,
      subject: r.subject,
      chapter: r.chapter,
      toughness: r.toughness,
      ready: r.ready,
      stem: stripStemForManifest(r.stemPreview),
      issues: r.issues,
    })),
  }
}

/**
 * @param {import('../data/tests').Test} test
 */
export function buildPaperManifestHtml(test) {
  const data = buildPaperManifestData(test)
  if (!data) return '<p>Paper not found.</p>'

  const published = data.publishedAt
    ? new Date(data.publishedAt).toLocaleString()
    : new Date().toLocaleString()

  const slotRows = data.slotProgress
    .map((s) => `<tr><td>${escapeHtml(s.type)}</td><td>${s.have}</td><td>${s.need}</td></tr>`)
    .join('')

  const qRows = data.questions
    .map(
      (q) => `<tr class="${q.ready ? '' : 'bad'}">
        <td>Q${q.index}</td>
        <td>${escapeHtml(q.type)}</td>
        <td>${escapeHtml(q.subject || '—')}</td>
        <td>${q.toughness ?? '—'}</td>
        <td>${q.ready ? 'OK' : escapeHtml(q.issues[0] ?? 'Fix')}</td>
        <td class="stem">${escapeHtml(q.stem)}</td>
      </tr>`,
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(data.title)} — Paper manifest</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; margin: 24px; color: #111; font-size: 11pt; }
    h1 { font-size: 18pt; margin: 0 0 8px; }
    .meta { color: #444; margin-bottom: 20px; font-size: 10pt; }
    .scores { display: flex; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
    .score-box { border: 1px solid #ccc; padding: 10px 14px; border-radius: 8px; min-width: 120px; }
    .score-box strong { display: block; font-size: 16pt; color: #2563eb; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 9.5pt; }
    th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; }
    tr.bad td { background: #fef2f2; }
    td.stem { max-width: 280px; }
    .footer { margin-top: 24px; font-size: 9pt; color: #666; border-top: 1px solid #eee; padding-top: 12px; }
    @media print {
      body { margin: 12mm; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom:16px;padding:12px;background:#eff6ff;border-radius:8px;">
    <strong>Save as PDF:</strong> Press Ctrl+P (or Cmd+P) → choose <em>Save as PDF</em> → Save.
  </div>
  <h1>${escapeHtml(data.title)}</h1>
  <p class="meta">
    ${escapeHtml(data.patternName)} · ${data.totalQuestions} questions · ${data.durationMinutes} min<br />
    Published: ${escapeHtml(published)} · Version ${data.publishVersion} · TQS ${data.qualityScore}/100<br />
    Exam link: ${escapeHtml(data.examUrl)}
  </p>
  <div class="scores">
    <div class="score-box"><strong>${data.qualityScore}</strong>Test Quality Score</div>
    <div class="score-box"><strong>${data.breakdown.completeness}%</strong>Complete</div>
    <div class="score-box"><strong>${data.breakdown.answerKeys}%</strong>Answer keys</div>
    <div class="score-box"><strong>${data.breakdown.blueprint}%</strong>Blueprint</div>
  </div>
  ${
    slotRows
      ? `<h2>Blueprint</h2><table><thead><tr><th>Type</th><th>Selected</th><th>Required</th></tr></thead><tbody>${slotRows}</tbody></table>`
      : ''
  }
  <h2>Question list (${data.questions.length})</h2>
  <table>
    <thead>
      <tr><th>#</th><th>Type</th><th>Subject</th><th>Tough</th><th>Status</th><th>Stem preview</th></tr>
    </thead>
    <tbody>${qRows}</tbody>
  </table>
  <p class="footer">TestVantages paper manifest — for teacher records and QC. Students take the test at the exam link above.</p>
</body>
</html>`
}

/** @param {string} s */
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Open manifest in a new window and trigger print dialog (Save as PDF).
 * @param {import('../data/tests').Test} test
 * @param {{ autoPrint?: boolean }} [opts]
 */
export function openPaperManifestPrint(test, opts = {}) {
  if (typeof window === 'undefined' || !test) return false
  const html = buildPaperManifestHtml(test)
  const win = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700')
  if (!win) {
    window.alert('Allow pop-ups to open the printable manifest, or use the manifest page in the app.')
    return false
  }
  win.document.write(html)
  win.document.close()
  if (opts.autoPrint !== false) {
    win.onload = () => {
      setTimeout(() => {
        try {
          win.focus()
          win.print()
        } catch {
          /* user can print manually */
        }
      }, 400)
    }
  }
  return true
}
