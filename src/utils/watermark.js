/** Branding applied to every file downloaded from TestVantages. */

export const WATERMARK_BRAND = 'TestVantages'
export const WATERMARK_NOTICE =
  '© TestVantages — Licensed for personal study only. Not for resale or redistribution.'
export const WATERMARK_URL = 'https://www.testvantages.com'

export function watermarkMeta(extra = {}) {
  return {
    brand: WATERMARK_BRAND,
    notice: WATERMARK_NOTICE,
    url: WATERMARK_URL,
    downloadedAt: new Date().toISOString(),
    ...extra,
  }
}

/** @param {string} content */
export function watermarkCsv(content) {
  const header = [
    `# ${WATERMARK_BRAND} — ${WATERMARK_NOTICE}`,
    `# Downloaded: ${new Date().toLocaleString()} · ${WATERMARK_URL}`,
    `# Do not remove this header. Redistribution prohibited.`,
    '#',
  ].join('\n')
  return `${header}\n${content}`
}

/** Strip TestVantages watermark comment rows before CSV import. */
export function stripCsvWatermarkLines(csvText) {
  return csvText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n')
}

/**
 * @param {unknown} data
 * @param {Record<string, unknown>} [extra]
 */
export function watermarkJsonPayload(data, extra = {}) {
  if (Array.isArray(data)) {
    return {
      _watermark: watermarkMeta(extra),
      questions: data,
    }
  }
  if (data && typeof data === 'object') {
    return {
      _watermark: watermarkMeta(extra),
      ...(/** @type {Record<string, unknown>} */ (data)),
    }
  }
  return { _watermark: watermarkMeta(extra), data }
}

/** @param {string} content @param {string} [title] */
export function watermarkPlainText(content, title = 'Export') {
  const bar = '═'.repeat(60)
  const header = [
    bar,
    `  ${WATERMARK_BRAND} — ${title}`,
    `  ${WATERMARK_NOTICE}`,
    `  Downloaded: ${new Date().toLocaleString()}`,
    bar,
    '',
  ].join('\n')
  const footer = [
    '',
    bar,
    `  ${WATERMARK_BRAND} · ${WATERMARK_URL}`,
    bar,
  ].join('\n')
  return `${header}${content}${footer}`
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * @param {{
 *   title: string
 *   subtitle?: string
 *   questions: Array<{ text: string, options?: string[], subject?: string, solution?: string, chapter?: string }>
 *   showSolutions?: boolean
 * }} opts
 */
export function buildWatermarkedPaperHtml(opts) {
  const { title, subtitle = '', questions, showSolutions = false } = opts
  const wm = `${WATERMARK_BRAND} · ${WATERMARK_NOTICE}`
  const tiles = Array.from({ length: 28 }, () => `<span>${escapeHtml(WATERMARK_BRAND)}</span>`).join('')

  const body = questions
    .map((q, i) => {
      const opts = (q.options ?? [])
        .map((o, j) => `<li>(${String.fromCharCode(65 + j)}) ${escapeHtml(o)}</li>`)
        .join('')
      const sol =
        showSolutions && q.solution
          ? `<div class="solution"><strong>Solution:</strong> ${escapeHtml(q.solution)}</div>`
          : ''
      return `
      <article class="q">
        <h3>Q${i + 1}. ${escapeHtml(q.subject ?? '')} ${q.chapter ? `· ${escapeHtml(q.chapter)}` : ''}</h3>
        <p class="q-text">${escapeHtml(q.text)}</p>
        ${opts ? `<ol class="opts">${opts}</ol>` : ''}
        ${sol}
      </article>`
    })
    .join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(title)} — ${WATERMARK_BRAND}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", system-ui, sans-serif;
      margin: 0;
      color: #0f172a;
      line-height: 1.5;
    }
    .wm-layer {
      position: fixed;
      inset: -20%;
      display: flex;
      flex-wrap: wrap;
      align-content: center;
      justify-content: center;
      gap: 3rem 5rem;
      pointer-events: none;
      z-index: 0;
      opacity: 0.14;
    }
    .wm-layer span {
      font-size: 1.1rem;
      font-weight: 800;
      color: #4338ca;
      transform: rotate(-32deg);
      white-space: nowrap;
    }
    .content {
      position: relative;
      z-index: 1;
      max-width: 820px;
      margin: 0 auto;
      padding: 2rem 2rem 4rem;
      background: rgba(255,255,255,0.92);
    }
    .banner {
      border: 2px solid #6366f1;
      border-radius: 8px;
      padding: 1rem 1.25rem;
      margin-bottom: 1.5rem;
      background: #eef2ff;
    }
    .banner strong { color: #4338ca; }
    h1 { margin: 0 0 0.25rem; font-size: 1.5rem; }
    .sub { color: #64748b; margin: 0; }
    .q { margin-bottom: 1.5rem; page-break-inside: avoid; }
    .q h3 { font-size: 0.95rem; margin: 0 0 0.35rem; color: #475569; }
    .q-text { margin: 0 0 0.5rem; }
    .opts { margin: 0; padding-left: 1.25rem; }
    .solution { margin-top: 0.5rem; padding: 0.5rem; background: #f0fdf4; border-radius: 6px; font-size: 0.9rem; }
    footer {
      margin-top: 2rem;
      padding-top: 1rem;
      border-top: 1px dashed #94a3b8;
      font-size: 0.8rem;
      color: #64748b;
      text-align: center;
    }
    @media print {
      .content { background: white; }
      .wm-layer { opacity: 0.18; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="wm-layer" aria-hidden="true">${tiles}</div>
  <div class="content">
    <div class="banner">
      <strong>${escapeHtml(WATERMARK_BRAND)}</strong> — ${escapeHtml(WATERMARK_NOTICE)}
      <br/><small>${escapeHtml(wm)}</small>
    </div>
    <h1>${escapeHtml(title)}</h1>
    ${subtitle ? `<p class="sub">${escapeHtml(subtitle)}</p>` : ''}
    <p class="no-print" style="margin-top:1rem;font-size:0.85rem;color:#64748b">
      Use browser <strong>Print → Save as PDF</strong> to keep the watermark on every page.
    </p>
    ${body}
    <footer>
      Downloaded from ${escapeHtml(WATERMARK_BRAND)} · ${new Date().toLocaleString()} · ${escapeHtml(WATERMARK_URL)}
    </footer>
  </div>
</body>
</html>`
}

/**
 * Apply watermark by MIME / extension before download.
 * @param {string} content
 * @param {string} mime
 * @param {string} [label]
 */
export function applyDownloadWatermark(content, mime, label = 'Export') {
  if (mime.includes('json')) {
    try {
      const parsed = JSON.parse(content)
      return JSON.stringify(watermarkJsonPayload(parsed, { label }), null, 2)
    } catch {
      return watermarkPlainText(content, label)
    }
  }
  if (mime.includes('csv')) return watermarkCsv(content)
  if (mime.includes('html')) return content
  return watermarkPlainText(content, label)
}
