import { downloadTextFile } from './csvQuestions.js'
import { buildWatermarkedPaperHtml, WATERMARK_BRAND } from './watermark.js'

function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

/**
 * Download a watermarked question paper (HTML — print to PDF keeps watermark).
 * @param {import('../data/tests').Question[]} questions
 * @param {{ title: string, subtitle?: string, showSolutions?: boolean }} meta
 */
export function downloadWatermarkedPaper(questions, meta) {
  if (!questions.length) {
    throw new Error('No questions in this paper.')
  }
  const html = buildWatermarkedPaperHtml({
    title: meta.title,
    subtitle: meta.subtitle,
    questions,
    showSolutions: meta.showSolutions ?? false,
  })
  const date = new Date().toISOString().slice(0, 10)
  const name = `testvantage-${slug(meta.title)}-${date}.html`
  downloadTextFile(name, html, 'text/html', { skipWatermark: true })
}

export function downloadWatermarkedPaperJson(questions, meta) {
  const date = new Date().toISOString().slice(0, 10)
  downloadTextFile(
    `testvantage-${slug(meta.title)}-${date}.json`,
    JSON.stringify({ questions }, null, 2),
    'application/json',
    { label: meta.title || `${WATERMARK_BRAND} paper` },
  )
}
