/**
 * Mathpix OCR - images (including handwriting) and PDFs (single or multi-page).
 * Keys stay on the API server. Gemini is never used here.
 */
import './loadEnv.js'
import { MATHPIX } from './config.js'

const MATHPIX_TEXT_URL = 'https://api.mathpix.com/v3/text'
const MATHPIX_PDF_URL = 'https://api.mathpix.com/v3/pdf'
const MATHPIX_CONVERTER_URL = 'https://api.mathpix.com/v3/converter'

export const MATHPIX_MISSING_MESSAGE =
  'Mathpix keys were not loaded from onlinetest/.env. Keep the bottom panel open (Ctrl+J then Ctrl+`), then press F5 so port 3001 re-reads the file. Gemini generate still works.'

let mathpixFetch = fetch

/** Test hook - mock HTTP without hitting Mathpix. */
export function setMathpixFetch(fn) {
  mathpixFetch = typeof fn === 'function' ? fn : fetch
}

function firstEnv(...names) {
  for (const name of names) {
    const val = String(process.env[name] ?? '').trim()
    if (val) return val
  }
  return ''
}

export function getMathpixEnv() {
  const appId = firstEnv(
    'MATHPIX_APP_ID',
    'MATHPIX_APPID',
    'MATHPIX_API_ID',
    'MATHPIX_ID',
  )
  const appKey = firstEnv(
    'MATHPIX_APP_KEY',
    'MATHPIX_APPKEY',
    'MATHPIX_API_KEY',
    'MATHPIX_KEY',
  )
  return { appId, appKey }
}

/** @returns {{ configured: boolean, ready: boolean, message: string }} */
export function getMathpixStatus() {
  const { appId, appKey } = getMathpixEnv()
  if (!appId || !appKey) {
    return { configured: false, ready: false, message: MATHPIX_MISSING_MESSAGE }
  }
  return {
    configured: true,
    ready: true,
    message:
      'Mathpix OCR ready (images, handwriting, and PDFs). Gemini fills questions after OCR.',
  }
}

function mathpixNotConfiguredError() {
  const err = new Error(MATHPIX_MISSING_MESSAGE)
  err.code = 'MATHPIX_NOT_CONFIGURED'
  return err
}

function stripDataUrl(raw) {
  return String(raw ?? '')
    .replace(/^data:[^;]+;base64,/, '')
    .trim()
}

function looksLikePdf({ mimeType, fileName, pdfBase64, imageBase64 }) {
  const mime = String(mimeType ?? '').toLowerCase()
  const name = String(fileName ?? '').toLowerCase()
  if (mime.includes('pdf') || name.endsWith('.pdf')) return true
  if (pdfBase64 && !imageBase64) return true
  return false
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error('Mathpix cancelled.'), { name: 'AbortError' }))
      return
    }
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(Object.assign(new Error('Mathpix cancelled.'), { name: 'AbortError' }))
      },
      { once: true },
    )
  })
}

function authHeaders(appId, appKey) {
  return { app_id: appId, app_key: appKey }
}

/**
 * Pick best math string from Mathpix JSON (LaTeX-first).
 * @param {Record<string, unknown>} body
 */
export function pickMathpixTextResult(body) {
  const pick = (key) => {
    const val = body?.[key]
    return typeof val === 'string' && val.trim() ? val.trim() : ''
  }
  const mmd = pick('mmd') || pick('text')
  const latexStyled = pick('latex_styled')
  const latex = pick('latex')
  const brokenSqrt = (s) => /\$\$?1\$|\$\\frac\{1\}\{2\}\s+\$1\$|\$\$1\$1\$/.test(s ?? '')
  if (mmd && /\([A-D]\)/.test(mmd)) {
    if (!latexStyled || brokenSqrt(latexStyled)) return { text: mmd, source: 'mmd' }
  }
  if (latexStyled && !brokenSqrt(latexStyled)) return { text: latexStyled, source: 'latex_styled' }
  if (latex && !brokenSqrt(latex)) return { text: latex, source: 'latex' }
  if (mmd) return { text: mmd, source: 'mmd' }
  return { text: '', source: 'none' }
}

/**
 * Mathpix Markdown delimiters to $...$ for the question bank.
 * @param {string} text
 */
export function normalizeMathpixLatex(text) {
  if (!text?.trim()) return ''
  return String(text)
    .replace(/\\\[/g, '\n$$')
    .replace(/\\\]/g, '$$\n')
    .replace(/\\\(/g, '$')
    .replace(/\\\)/g, '$')
}

function applyOutputFormat(text, format) {
  const raw = String(text ?? '').trim()
  if (!raw) return ''
  if (format === 'word') return raw
  return normalizeMathpixLatex(raw)
}

async function readJsonSafe(res) {
  const text = await res.text()
  if (!text.trim()) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { error: text.slice(0, 400) }
  }
}

async function extractImage(input, format, appId, appKey, signal) {
  const b64 = stripDataUrl(input.imageBase64)
  if (!b64 || b64.length < 40) {
    const err = new Error('imageBase64 is required for Mathpix image OCR.')
    err.code = 'MATHPIX_BAD_INPUT'
    throw err
  }
  const mime =
    input.mimeType && String(input.mimeType).startsWith('image/') ? input.mimeType : 'image/jpeg'
  const src = `data:${mime};base64,${b64}`
  const res = await mathpixFetch(MATHPIX_TEXT_URL, {
    method: 'POST',
    headers: {
      ...authHeaders(appId, appKey),
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      src,
      formats: ['latex_styled', 'latex', 'mmd', 'text'],
      data_options: { include_asciimath: true, include_latex: true },
      math_inline_delimiters: ['$', '$'],
      math_display_delimiters: ['$$', '$$'],
      rm_spaces: true,
      include_line_data: false,
    }),
    signal,
  })
  const body = await readJsonSafe(res)
  if (!res.ok) {
    const msg = body?.error || body?.error_info?.message || `Mathpix image OCR failed (${res.status})`
    const err = new Error(msg)
    err.code = res.status === 401 || res.status === 403 ? 'MATHPIX_AUTH_FAILED' : 'MATHPIX_EXTRACT_FAILED'
    err.status = res.status
    throw err
  }
  const picked = pickMathpixTextResult(body)
  if (!picked.text) {
    const err = new Error('Mathpix returned empty text. Try a clearer scan or crop to one page.')
    err.code = 'MATHPIX_EMPTY'
    throw err
  }
  let docxBase64 = ''
  if (format === 'word') {
    try {
      docxBase64 = await convertMmdToDocx(picked.text, appId, appKey, signal)
    } catch {
      docxBase64 = ''
    }
  }
  return {
    text: applyOutputFormat(picked.text, format),
    source: picked.source,
    docxBase64,
    pdfId: null,
  }
}

async function convertMmdToDocx(mmd, appId, appKey, signal) {
  const submit = await mathpixFetch(MATHPIX_CONVERTER_URL, {
    method: 'POST',
    headers: {
      ...authHeaders(appId, appKey),
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ mmd, conversion_formats: { docx: true } }),
    signal,
  })
  const submitted = await readJsonSafe(submit)
  const converterId = submitted?.conversion_id || submitted?.id
  if (!submit.ok || !converterId) return ''
  const started = Date.now()
  while (Date.now() - started < MATHPIX.pollTimeoutMs) {
    await sleep(1500, signal)
    const poll = await mathpixFetch(`${MATHPIX_CONVERTER_URL}/${encodeURIComponent(converterId)}`, {
      headers: authHeaders(appId, appKey),
      signal,
    })
    const status = await readJsonSafe(poll)
    const conv = status?.conversion_status?.docx || status?.status
    if (conv === 'error') return ''
    if (status?.status === 'completed' || conv === 'completed') {
      const fileRes = await mathpixFetch(
        `${MATHPIX_CONVERTER_URL}/${encodeURIComponent(converterId)}.docx`,
        { headers: authHeaders(appId, appKey), signal },
      )
      if (!fileRes.ok) return ''
      const buf = Buffer.from(await fileRes.arrayBuffer())
      return buf.toString('base64')
    }
  }
  return ''
}

async function pollPdfUntilReady(pdfId, appId, appKey, signal, wantDocx) {
  const started = Date.now()
  let delay = 1500
  while (Date.now() - started < MATHPIX.pollTimeoutMs) {
    const res = await mathpixFetch(`${MATHPIX_PDF_URL}/${encodeURIComponent(pdfId)}`, {
      headers: authHeaders(appId, appKey),
      signal,
    })
    const body = await readJsonSafe(res)
    if (!res.ok) {
      const err = new Error(body?.error || `Mathpix PDF status failed (${res.status})`)
      err.code = 'MATHPIX_EXTRACT_FAILED'
      err.status = res.status
      throw err
    }
    const status = String(body?.status ?? '')
    if (status === 'error') {
      const err = new Error(body?.error || 'Mathpix PDF OCR failed.')
      err.code = 'MATHPIX_EXTRACT_FAILED'
      throw err
    }
    const docxReady =
      !wantDocx ||
      body?.conversion_status?.docx === 'completed' ||
      body?.conversion_status?.docx?.status === 'completed'
    if (status === 'completed' && docxReady) return body
    await sleep(delay, signal)
    delay = Math.min(5000, delay + 400)
  }
  const err = new Error(
    'Mathpix PDF OCR timed out. Try a smaller PDF, keep the bottom panel open, then press F5 and retry.',
  )
  err.code = 'MATHPIX_TIMEOUT'
  throw err
}

async function downloadPdfFormat(pdfId, ext, appId, appKey, signal) {
  const res = await mathpixFetch(`${MATHPIX_PDF_URL}/${encodeURIComponent(pdfId)}.${ext}`, {
    headers: authHeaders(appId, appKey),
    signal,
  })
  if (!res.ok) {
    const body = await readJsonSafe(res).catch(() => ({}))
    const err = new Error(body?.error || `Mathpix could not download .${ext} (${res.status})`)
    err.code = 'MATHPIX_EXTRACT_FAILED'
    throw err
  }
  if (ext === 'mmd' || ext === 'md' || ext === 'tex') {
    return { text: await res.text(), bytes: null }
  }
  const buf = Buffer.from(await res.arrayBuffer())
  return { text: '', bytes: buf }
}

async function extractPdf(input, format, appId, appKey, signal) {
  const b64 = stripDataUrl(input.pdfBase64 || input.imageBase64)
  if (!b64 || b64.length < 40) {
    const err = new Error('pdfBase64 is required for Mathpix PDF OCR.')
    err.code = 'MATHPIX_BAD_INPUT'
    throw err
  }
  const bytes = Buffer.from(b64, 'base64')
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const form = new FormData()
  form.append('file', blob, input.fileName || 'upload.pdf')
  const conversion_formats = format === 'word' ? { docx: true } : {}
  form.append(
    'options_json',
    JSON.stringify({
      conversion_formats,
      math_inline_delimiters: ['$', '$'],
      math_display_delimiters: ['$$', '$$'],
      rm_spaces: true,
    }),
  )
  const submit = await mathpixFetch(MATHPIX_PDF_URL, {
    method: 'POST',
    headers: authHeaders(appId, appKey),
    body: form,
    signal,
  })
  const submitted = await readJsonSafe(submit)
  if (!submit.ok) {
    const msg =
      submitted?.error || submitted?.error_info?.message || `Mathpix PDF submit failed (${submit.status})`
    const err = new Error(msg)
    err.code =
      submit.status === 401 || submit.status === 403 ? 'MATHPIX_AUTH_FAILED' : 'MATHPIX_EXTRACT_FAILED'
    err.status = submit.status
    throw err
  }
  const pdfId = submitted?.pdf_id
  if (!pdfId) {
    const err = new Error('Mathpix did not return a pdf_id.')
    err.code = 'MATHPIX_EXTRACT_FAILED'
    throw err
  }
  await pollPdfUntilReady(pdfId, appId, appKey, signal, format === 'word')
  const mmd = await downloadPdfFormat(pdfId, 'mmd', appId, appKey, signal)
  if (!String(mmd.text ?? '').trim()) {
    const err = new Error('Mathpix PDF OCR returned empty text.')
    err.code = 'MATHPIX_EMPTY'
    throw err
  }
  let docxBase64 = ''
  if (format === 'word') {
    try {
      const docx = await downloadPdfFormat(pdfId, 'docx', appId, appKey, signal)
      if (docx.bytes) docxBase64 = docx.bytes.toString('base64')
    } catch {
      docxBase64 = ''
    }
  }
  return {
    text: applyOutputFormat(mmd.text, format),
    source: 'pdf-mmd',
    docxBase64,
    pdfId,
  }
}

/**
 * @param {{
 *   imageBase64?: string
 *   pdfBase64?: string
 *   mimeType?: string
 *   fileName?: string
 *   format?: 'latex' | 'word'
 * }} body
 * @param {{ signal?: AbortSignal }} [opts]
 */
export async function extractWithMathpix(body = {}, opts = {}) {
  const status = getMathpixStatus()
  if (!status.configured) throw mathpixNotConfiguredError()
  const { appId, appKey } = getMathpixEnv()
  const format = body.format === 'word' ? 'word' : 'latex'
  const input = {
    imageBase64: stripDataUrl(body.imageBase64),
    pdfBase64: stripDataUrl(body.pdfBase64),
    mimeType: body.mimeType || '',
    fileName: body.fileName || '',
  }
  const result = looksLikePdf(input)
    ? await extractPdf(input, format, appId, appKey, opts.signal)
    : await extractImage(input, format, appId, appKey, opts.signal)
  return {
    ok: true,
    engine: 'mathpix',
    format,
    text: result.text,
    source: result.source,
    docxBase64: result.docxBase64 || '',
    pdfId: result.pdfId,
  }
}
