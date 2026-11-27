/**
 * Build a printable / emailable student–parent report card from one attempt.
 * No SMTP in this project → mailto + HTML download; optional send if config appears later.
 */

import { scoreToPercentile, estimateAIR } from './percentile.js'
import { buildWeakTopics } from './testAnalysis.js'

/** @returns {{ enabled: boolean, endpoint?: string }} */
export function getMailSendConfig() {
  try {
    const endpoint =
      (typeof import.meta !== 'undefined' && import.meta.env?.VITE_REPORT_EMAIL_URL) ||
      (typeof window !== 'undefined' && window.__TV_REPORT_EMAIL_URL__) ||
      ''
    if (endpoint && String(endpoint).startsWith('http')) {
      return { enabled: true, endpoint: String(endpoint) }
    }
  } catch {
    /* ignore */
  }
  return { enabled: false }
}

/**
 * @param {{
 *   data: object
 *   test?: object | null
 *   studentName?: string
 *   parentEmail?: string
 * }} opts
 */
export function buildReportCardModel(opts = {}) {
  const data = opts.data ?? {}
  const result = data.result ?? {}
  const maxScore = Number(result.maxScore) || 0
  const score = Number(result.score) || 0
  const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0
  const percentile =
    data.percentile != null
      ? Number(data.percentile)
      : scoreToPercentile(score, maxScore)
  const examPatternId = data.examPatternId ?? opts.test?.examPatternId
  const air =
    data.estimatedAIR != null
      ? Number(data.estimatedAIR)
      : estimateAIR(percentile, examPatternId)
  const weak = buildWeakTopics(result.byChapter ?? {}).slice(0, 5)
  const bySubject = Object.entries(result.bySubject ?? {}).map(([id, s]) => {
    const subMax = Number(s.maxScore ?? s.maxMarks ?? 0)
    const subScore = Number(s.score ?? s.totalMarks ?? 0)
    return {
      id,
      label: id.charAt(0).toUpperCase() + id.slice(1),
      score: subScore,
      maxScore: subMax,
      pct: subMax > 0 ? Math.round((subScore / subMax) * 100) : 0,
      accuracy: s.accuracy ?? null,
    }
  })

  return {
    title: data.title || opts.test?.title || 'Test result',
    studentName: opts.studentName || data.userName || 'Student',
    studentEmail: data.userEmail || '',
    parentEmail: opts.parentEmail || '',
    submittedAt: data.submittedAt || null,
    score,
    maxScore,
    pct,
    accuracy: result.accuracy ?? 0,
    correct: result.correct ?? 0,
    wrong: result.wrong ?? 0,
    unattempted: result.unattempted ?? 0,
    percentile: Math.round(percentile * 10) / 10,
    estimatedAIR: air,
    bySubject,
    weakChapters: weak,
    examPatternId,
  }
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * @param {ReturnType<typeof buildReportCardModel>} model
 */
export function buildReportCardHtml(model) {
  const when = model.submittedAt
    ? new Date(model.submittedAt).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '—'
  const subjectRows = model.bySubject.length
    ? model.bySubject
        .map(
          (s) =>
            `<tr><td>${escapeHtml(s.label)}</td><td>${s.score}/${s.maxScore || '—'}</td><td>${s.pct}%</td></tr>`,
        )
        .join('')
    : '<tr><td colspan="3">No subject breakdown</td></tr>'
  const weakRows = model.weakChapters.length
    ? model.weakChapters
        .map(
          (w) =>
            `<tr><td>${escapeHtml(w.chapter)}</td><td>${w.accuracy}%</td><td>${w.wrong} wrong</td></tr>`,
        )
        .join('')
    : '<tr><td colspan="3">No weak chapters flagged</td></tr>'

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Report card — ${escapeHtml(model.title)}</title>
<style>
  body { font-family: "Segoe UI", system-ui, sans-serif; color: #0f172a; max-width: 720px; margin: 1.5rem auto; padding: 0 1rem; line-height: 1.45; }
  h1 { font-size: 1.35rem; margin: 0 0 0.25rem; }
  .eyebrow { color: #64748b; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; }
  .hero { display: flex; flex-wrap: wrap; gap: 1rem; margin: 1rem 0 1.25rem; }
  .kpi { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 0.75rem 1rem; min-width: 100px; }
  .kpi strong { display: block; font-size: 1.35rem; }
  .kpi span { font-size: 0.72rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; }
  table { width: 100%; border-collapse: collapse; margin: 0.5rem 0 1.25rem; }
  th, td { text-align: left; padding: 0.45rem 0.5rem; border-bottom: 1px solid #e2e8f0; font-size: 0.9rem; }
  th { color: #64748b; font-size: 0.75rem; text-transform: uppercase; }
  .note { color: #64748b; font-size: 0.85rem; }
  @media print { body { margin: 0; } .no-print { display: none; } }
</style>
</head>
<body>
  <p class="eyebrow">TestVantages · Parent / student report</p>
  <h1>${escapeHtml(model.title)}</h1>
  <p class="note">${escapeHtml(model.studentName)}${model.studentEmail ? ` · ${escapeHtml(model.studentEmail)}` : ''} · ${escapeHtml(when)}</p>
  <div class="hero">
    <div class="kpi"><strong>${model.score}/${model.maxScore}</strong><span>Marks (${model.pct}%)</span></div>
    <div class="kpi"><strong>${model.accuracy}%</strong><span>Accuracy</span></div>
    <div class="kpi"><strong>~${model.percentile}</strong><span>Percentile (est.)</span></div>
    <div class="kpi"><strong>~${Number(model.estimatedAIR).toLocaleString('en-IN')}</strong><span>Est. AIR</span></div>
    <div class="kpi"><strong>${model.correct} / ${model.wrong} / ${model.unattempted}</strong><span>Right / wrong / skip</span></div>
  </div>
  <h2>Subjects</h2>
  <table><thead><tr><th>Subject</th><th>Marks</th><th>%</th></tr></thead><tbody>${subjectRows}</tbody></table>
  <h2>Focus chapters</h2>
  <table><thead><tr><th>Chapter</th><th>Accuracy</th><th>Detail</th></tr></thead><tbody>${weakRows}</tbody></table>
  <p class="note">Ranks and AIR are estimates from this attempt’s marks curve — not an official NTA rank. Open the full Result page in TestVantages for charts and coaching.</p>
  <p class="no-print note">Tip: use your browser Print → Save as PDF to keep a copy.</p>
</body>
</html>`
}

/**
 * Plain-text body for mailto.
 * @param {ReturnType<typeof buildReportCardModel>} model
 */
export function buildReportCardPlainText(model) {
  const lines = [
    `TestVantages report — ${model.title}`,
    `Student: ${model.studentName}`,
    `Score: ${model.score}/${model.maxScore} (${model.pct}%)`,
    `Accuracy: ${model.accuracy}%`,
    `Est. percentile: ~${model.percentile}`,
    `Est. AIR: ~${Number(model.estimatedAIR).toLocaleString('en-IN')}`,
    `Right / wrong / skip: ${model.correct} / ${model.wrong} / ${model.unattempted}`,
  ]
  if (model.bySubject.length) {
    lines.push('', 'Subjects:')
    for (const s of model.bySubject) {
      lines.push(`  · ${s.label}: ${s.score}/${s.maxScore || '—'} (${s.pct}%)`)
    }
  }
  if (model.weakChapters.length) {
    lines.push('', 'Focus chapters:')
    for (const w of model.weakChapters) {
      lines.push(`  · ${w.chapter}: ${w.accuracy}% accuracy, ${w.wrong} wrong`)
    }
  }
  lines.push('', 'Full charts: open Result in TestVantages (http://127.0.0.1:5173/).')
  return lines.join('\n')
}

/**
 * @param {string} html
 * @param {string} [filename]
 */
export function downloadReportCardHtml(html, filename = 'testvantage-report-card.html') {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

/**
 * @param {ReturnType<typeof buildReportCardModel>} model
 * @param {string} [toEmail]
 */
export function openReportMailto(model, toEmail = '') {
  const to = String(toEmail || model.parentEmail || model.studentEmail || '').trim()
  const subject = encodeURIComponent(`Report card: ${model.title} — ${model.studentName}`)
  const body = encodeURIComponent(buildReportCardPlainText(model))
  const href = `mailto:${encodeURIComponent(to)}?subject=${subject}&body=${body}`
  window.location.href = href
}

/**
 * Try remote send when VITE_REPORT_EMAIL_URL is set; otherwise returns not_configured.
 * @param {ReturnType<typeof buildReportCardModel>} model
 * @param {{ to?: string }} [opts]
 */
export async function trySendReportEmail(model, opts = {}) {
  const cfg = getMailSendConfig()
  if (!cfg.enabled || !cfg.endpoint) {
    return { ok: false, reason: 'not_configured' }
  }
  const to = String(opts.to || model.parentEmail || model.studentEmail || '').trim()
  if (!to) return { ok: false, reason: 'no_recipient' }
  try {
    const res = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to,
        subject: `Report card: ${model.title} — ${model.studentName}`,
        html: buildReportCardHtml(model),
        text: buildReportCardPlainText(model),
        model,
      }),
    })
    if (!res.ok) return { ok: false, reason: 'send_failed', status: res.status }
    return { ok: true }
  } catch {
    return { ok: false, reason: 'network' }
  }
}
