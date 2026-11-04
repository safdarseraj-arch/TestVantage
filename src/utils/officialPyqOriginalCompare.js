/**
 * Compare Official PYQ cards with the original paper page (Gemini vision on
 * the FastAPI side, gemini-3.7-flash, max_output_tokens=1500).
 * Results are stored on the card as `originalCompare`. Nothing here rewrites
 * question text; a suggested correction only opens in the admin Edit
 * question box. The "Show original page" picture is local (no Gemini).
 */

import katex from 'katex'
import {
  getOfficialPyqPendingPaper,
  updateOfficialPyqPendingPaper,
} from './officialPyqPendingStore.js'
import { isOfficialPyqPlaceholder } from './officialPyqMissingSlots.js'
import {
  formatOfficialPyqAnswerKey,
  notifyOfficialPyqCardChanged,
  officialPyqCardForAdmin,
} from './officialPyqCardEdit.js'

export const ORIGINAL_MISSING_MESSAGE = 'Original paper not available for this paper'
export const GEMINI_KEY_MISSING_MESSAGE = 'Gemini key missing'
const MAX_RETRIES = 1
/** Above the server's own Gemini limits (90 s per call, 150 s for the one-time page map). */
const COMPARE_TIMEOUT_MS = 170_000
const NO_ANSWER_MESSAGE = 'Gemini did not answer in time. Click Compare this question again.'
/** The server already retried these; another round only keeps the card on "Comparing" for minutes. */
const SERVER_ALREADY_RETRIED = new Set(['gemini_timeout', 'gemini_connection'])

class CompareStopError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

/** @param {Response} res */
async function readError(res) {
  let detail = null
  try {
    const data = await res.json()
    detail = data?.detail ?? data
  } catch {
    detail = null
  }
  const code = String(detail?.code ?? '')
  const message = String(detail?.message ?? (typeof detail === 'string' ? detail : '') ?? '')
  if (code === 'original_missing') return new CompareStopError(code, ORIGINAL_MISSING_MESSAGE)
  if (code === 'gemini_key_missing') return new CompareStopError(code, GEMINI_KEY_MISSING_MESSAGE)
  if (code === 'gemini_quota') return new CompareStopError(code, message || 'Gemini credits are used up.')
  if (res.status === 404 && !code) {
    return new CompareStopError(
      'api_old',
      'Compare service is not loaded yet. Press F5 to restart the app, then try again.',
    )
  }
  if (res.status === 503 && !code) {
    return new CompareStopError('api_down', 'Hybrid AI (port 8000) is not running. Press F5, then try again.')
  }
  const err = new Error(message || `Compare failed (${res.status}).`)
  if (SERVER_ALREADY_RETRIED.has(code)) err.noRetry = true
  return err
}

/** @param {string} url @param {RequestInit} init @param {AbortSignal | undefined} signal */
async function fetchWithTimeout(url, init, signal) {
  const ctl = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    ctl.abort()
  }, COMPARE_TIMEOUT_MS)
  const onAbort = () => ctl.abort()
  signal?.addEventListener('abort', onAbort)
  try {
    return await fetch(url, { ...init, signal: ctl.signal })
  } catch (err) {
    if (timedOut && !signal?.aborted) throw new Error(NO_ANSWER_MESSAGE)
    throw err
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/** @param {string} paperId */
export async function getOfficialPyqOriginalStatus(paperId) {
  const res = await fetchWithTimeout(
    `/api/official-pyq/original/${encodeURIComponent(paperId)}`,
    { method: 'GET' },
    undefined,
  )
  if (!res.ok) throw await readError(res)
  return res.json()
}

/** @param {string} paperId @param {File | Blob} file @param {string} [fileName] */
export async function uploadOfficialPyqOriginal(paperId, file, fileName) {
  const form = new FormData()
  form.append('file', file, fileName || /** @type {File} */ (file).name || 'original.pdf')
  const res = await fetchWithTimeout(
    `/api/official-pyq/original/${encodeURIComponent(paperId)}`,
    { method: 'POST', body: form },
    undefined,
  )
  if (!res.ok) throw await readError(res)
  return res.json()
}

/** Printed number on the original paper for this card. @param {any} q @param {number} index */
export function officialPyqPrintedNumber(q, index) {
  const n = Number(q?.printedNumber ?? q?.questionNumber ?? q?.pyqSlot)
  return Number.isFinite(n) && n > 0 ? n : index + 1
}

/**
 * Which of the cards with this printed number this one is. With numbering that
 * restarts per subject, chemistry Q11 is the 2nd of three Q11s.
 * @param {string} paperId @param {number} index @param {any} q
 */
export function officialPyqPrintedNumberPlace(paperId, index, q) {
  const questions = getOfficialPyqPendingPaper(paperId)?.questions
  const n = officialPyqPrintedNumber(q, index)
  let occurrence = 0
  let sameNumberCount = 0
  ;(Array.isArray(questions) ? questions : []).forEach((card, i) => {
    if (!card || isOfficialPyqPlaceholder(card) || officialPyqPrintedNumber(card, i) !== n) return
    sameNumberCount += 1
    if (i < index) occurrence += 1
  })
  return { occurrence, sameNumberCount: Math.max(sameNumberCount, occurrence + 1) }
}

const HTML_ENTITIES = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'" }

/**
 * Card text as students see it: each $…$ drawn by KaTeX and flattened to
 * plain text. KaTeX drops spaces inside math, so `$0.03 \mathrm{M} \mathrm{KMnO}_4$`
 * reads "0.03MKMnO4" here — the stored LaTeX alone hides that.
 * @param {unknown} text
 */
export function officialPyqDrawnText(text) {
  const raw = String(text ?? '')
  if (!raw.includes('$')) return raw
  return raw.replace(/\$\$([\s\S]*?)\$\$|\$([^$\n]*)\$/g, (whole, display, inline) => {
    const latex = String(display ?? inline ?? '').trim()
    if (!latex) return ''
    try {
      const html = katex.renderToString(latex, {
        output: 'html',
        displayMode: display != null,
        throwOnError: false,
        strict: 'ignore',
      })
      if (html.includes('katex-error')) return whole
      return html
        .replace(/<[^>]+>/g, '')
        .replace(/&[a-z#0-9]+;/gi, (m) => HTML_ENTITIES[m.toLowerCase()] ?? ' ')
        .replace(/[\u200b\u2061]/g, '')
    } catch {
      return whole
    }
  })
}

/** @param {any} q */
function cardHasFigure(q) {
  return Boolean(
    String(q?.questionImage ?? '').trim() ||
      /\\includegraphics|!\[[^\]]*\]\(|cdn\.mathpix\.com/i.test(String(q?.text ?? '')),
  )
}

/**
 * One card, up to 2 retries. Stops at once for a missing original / key.
 * @param {string} paperId @param {number} index @param {any} q @param {{ signal?: AbortSignal }} [opts]
 */
export async function compareOfficialPyqCardRemote(paperId, index, stored, { signal } = {}) {
  const q = officialPyqCardForAdmin(paperId, stored)
  const place = officialPyqPrintedNumberPlace(paperId, index, stored)
  const body = {
    paper_id: paperId,
    go_to: index + 1,
    printed_number: officialPyqPrintedNumber(q, index),
    card_text: String(q?.text ?? q?.stem ?? ''),
    passage_text: String(q?.passageText ?? ''),
    subject: String(q?.subject ?? ''),
    occurrence: place.occurrence,
    same_number_count: place.sameNumberCount,
    options: Array.isArray(q?.options) ? q.options.map((o) => String(o ?? '')) : [],
    answer_key: formatOfficialPyqAnswerKey(q) || null,
    has_figure: cardHasFigure(q),
  }
  body.drawn_text = officialPyqDrawnText(body.card_text)
  body.drawn_passage = officialPyqDrawnText(body.passage_text)
  body.drawn_options = body.options.map((o) => officialPyqDrawnText(o))
  let lastError = null
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    try {
      const res = await fetchWithTimeout(
        '/api/official-pyq/compare-question',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
        signal,
      )
      if (!res.ok) throw await readError(res)
      return await res.json()
    } catch (err) {
      if (err instanceof CompareStopError) throw err
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      lastError = err
      if (err?.noRetry || err?.message === NO_ANSWER_MESSAGE) break
    }
  }
  const msg = lastError instanceof Error ? lastError.message : 'Compare failed.'
  return { verdict: 'error', differences: [], error: msg }
}

/**
 * Store a compare result on the card and refresh the list status.
 * Only touches `originalCompare` — question text stays as it is.
 * @param {string} paperId @param {number} index @param {any} result
 */
export function saveOfficialPyqCompareResult(paperId, index, result) {
  const paper = getOfficialPyqPendingPaper(paperId)
  if (!paper || String(paper.status) !== 'pending_review') return null
  const questions = Array.isArray(paper.questions) ? paper.questions.slice() : []
  const card = questions[index]
  if (!card) return null
  const verdict = ['matches', 'differs', 'not_found', 'error'].includes(String(result?.verdict))
    ? String(result.verdict)
    : 'error'
  questions[index] = {
    ...card,
    originalCompare: {
      verdict: verdict === 'not_found' ? 'differs' : verdict,
      notFound: verdict === 'not_found' || undefined,
      differences: (Array.isArray(result?.differences) ? result.differences : [])
        .slice(0, 8)
        .map((d) => ({ kind: String(d?.kind ?? 'other'), detail: String(d?.detail ?? '') })),
      suggestedText: String(result?.suggested_text ?? ''),
      suggestedPassage: String(result?.suggested_passage ?? ''),
      suggestedOptions: Array.isArray(result?.suggested_options)
        ? result.suggested_options.map((o) => String(o ?? ''))
        : [],
      pages: Array.isArray(result?.pages) ? result.pages : [],
      error: result?.error ? String(result.error) : undefined,
      checkedAt: Date.now(),
      model: String(result?.model ?? 'gemini-3.7-flash'),
    },
  }
  const saved = updateOfficialPyqPendingPaper(paper.id, { questions })
  if (!saved) return null
  notifyOfficialPyqCardChanged(paper.id, index)
  return saved
}

/**
 * @param {string} paperId @param {number} index @param {{ signal?: AbortSignal }} [opts]
 */
export async function compareOneOfficialPyqCard(paperId, index, opts = {}) {
  const paper = getOfficialPyqPendingPaper(paperId)
  const card = paper?.questions?.[index]
  if (!card || isOfficialPyqPlaceholder(card)) return { ok: false, error: 'No question on this card.' }
  try {
    const result = await compareOfficialPyqCardRemote(paperId, index, card, opts)
    const saved = saveOfficialPyqCompareResult(paperId, index, result)
    return { ok: true, result, card: saved?.questions?.[index] ?? null }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    return { ok: false, error: err instanceof Error ? err.message : 'Compare failed.', stop: true }
  }
}

/**
 * Go-to numbers (1-based) the local check flagged — the red-banner questions.
 * @param {any} paper
 * @returns {number[]}
 */
export function officialPyqFlaggedGoTo(paper) {
  const questions = Array.isArray(paper?.questions) ? paper.questions : []
  const nums = Array.isArray(paper?.localQuality?.failedGoTo) ? paper.localQuality.failedGoTo : []
  return Array.from(new Set(nums.map(Number)))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= questions.length)
    .filter((n) => questions[n - 1] && !isOfficialPyqPlaceholder(questions[n - 1]))
    .sort((a, b) => a - b)
}

/**
 * Original page numbers for this card, found locally (PDF text layer or a
 * page map already saved). Never calls Gemini.
 * @param {string} paperId @param {number} index @param {any} q
 * @returns {Promise<{ available: boolean, pageCount: number, pages: number[], kind: string, fileName?: string }>}
 */
export async function locateOfficialPyqOriginalPage(paperId, index, q) {
  const place = officialPyqPrintedNumberPlace(paperId, index, q)
  const params = new URLSearchParams({
    printed_number: String(officialPyqPrintedNumber(q, index)),
    card_text: `${String(q?.passageText ?? '')}\n${String(q?.text ?? q?.stem ?? '')}`.trim().slice(0, 1500),
    occurrence: String(place.occurrence),
    same_number_count: String(place.sameNumberCount),
  })
  const res = await fetchWithTimeout(
    `/api/official-pyq/original/${encodeURIComponent(paperId)}/locate?${params}`,
    { method: 'GET' },
    undefined,
  )
  if (!res.ok) throw await readError(res)
  return res.json()
}

/** Picture of one original page, drawn locally on the server. @param {string} paperId @param {number} page 1-based */
export function officialPyqOriginalPageUrl(paperId, page) {
  return `/api/official-pyq/original/${encodeURIComponent(paperId)}/page/${Math.max(1, Math.floor(page))}`
}

/**
 * Cut a box out of one original page; the server copies the pixels (no Gemini).
 * @param {string} paperId
 * @param {number} page 1-based
 * @param {{ x0: number, y0: number, x1: number, y1: number }} box fractions of the page (0..1)
 * @returns {Promise<{ url: string, width: number, height: number }>}
 */
export async function cropOfficialPyqOriginalPage(paperId, page, box) {
  const res = await fetchWithTimeout(
    `/api/official-pyq/original/${encodeURIComponent(paperId)}/crop`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: Math.max(1, Math.floor(page)), ...box }),
    },
    undefined,
  )
  if (!res.ok) throw await readError(res)
  return res.json()
}

/**
 * Only the questions the local check flagged, one at a time.
 * Unflagged questions are never sent to Gemini.
 * @param {string} paperId
 * @param {{ signal?: AbortSignal, onProgress?: (done: number, total: number, label: string) => void }} [opts]
 */
export async function compareWholeOfficialPyqPaper(paperId, { signal, onProgress } = {}) {
  const paper = getOfficialPyqPendingPaper(paperId)
  if (!paper) return { ok: false, error: 'Paper not found.' }
  const questions = Array.isArray(paper.questions) ? paper.questions : []
  const order = officialPyqFlaggedGoTo(paper).map((go) => ({ q: questions[go - 1], index: go - 1 }))
  if (!order.length) {
    return { ok: true, tally: { matches: 0, differs: 0, error: 0 }, differsGoTo: [], failedGoTo: [], flagged: 0 }
  }
  onProgress?.(0, order.length, `Comparing ${order.length} flagged question${order.length === 1 ? '' : 's'}`)
  const count = null
  const tally = { matches: 0, differs: 0, error: 0 }
  /** @type {number[]} */
  const differsGoTo = []
  /** @type {number[]} */
  const failedGoTo = []
  for (let i = 0; i < order.length; i += 1) {
    if (signal?.aborted) return { ok: false, error: 'Stopped.', aborted: true, tally, count }
    const { index } = order[i]
    onProgress?.(
      i,
      order.length,
      `Comparing ${order.length} flagged question${order.length === 1 ? '' : 's'} · Question ${i + 1} of ${order.length} (Q ${index + 1})`,
    )
    const fresh = getOfficialPyqPendingPaper(paperId)?.questions?.[index]
    if (!fresh) continue
    let result
    try {
      result = await compareOfficialPyqCardRemote(paperId, index, fresh, { signal })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { ok: false, error: 'Stopped.', aborted: true, tally, count }
      }
      if (err instanceof CompareStopError) return { ok: false, error: err.message, code: err.code, tally, count }
      result = { verdict: 'error', error: err instanceof Error ? err.message : 'Compare failed.' }
    }
    saveOfficialPyqCompareResult(paperId, index, result)
    if (result.verdict === 'matches') tally.matches += 1
    else if (result.verdict === 'error') {
      tally.error += 1
      failedGoTo.push(index + 1)
    } else {
      tally.differs += 1
      differsGoTo.push(index + 1)
    }
  }
  onProgress?.(order.length, order.length, 'Done')
  return { ok: true, tally, differsGoTo, failedGoTo, count, flagged: order.length }
}
