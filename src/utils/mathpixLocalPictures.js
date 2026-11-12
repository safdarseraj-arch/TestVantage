/**
 * Mathpix deletes its cdn.mathpix.com/cropped/… picture links about a month after an upload.
 * The Hybrid AI helper keeps a local copy of each picture: cut from the stored original PDF
 * (Official PYQ), or downloaded while the link still loads (Question Bank and any upload without
 * an original). A picture whose Mathpix link no longer loads is then shown from that copy.
 * Stored card text keeps the Mathpix links (checks read the page and box from them).
 */

import { cleanMathpixImageUrl } from './mathpixMedia.js'

const LOCAL_PICTURE_ROUTE = '/api/official-pyq/original/mathpix-picture?u='
const KEEP_PICTURES_ROUTE = '/api/official-pyq/original/mathpix-picture/keep'
const MATHPIX_CROP_LINK = /^https?:\/\/cdn\.mathpix\.com\/cropped\/[A-Za-z0-9._~\-/?=&%]+$/i
const MATHPIX_CROP_LINKS_RE = /https?:\/\/cdn\.mathpix\.com\/cropped\/[^\s)}"'<>\]]+/gi
const LINKS_PER_REQUEST = 200
/** Links the helper already answered for in this session (kept, saved, or gone). */
const keptThisSession = new Set()
let storedSweepDone = false

/** The helper's local copy of a Mathpix picture link; '' for any other picture. @param {unknown} url */
export function mathpixLocalPictureUrl(url) {
  const clean = cleanMathpixImageUrl(url)
  return MATHPIX_CROP_LINK.test(clean) ? `${LOCAL_PICTURE_ROUTE}${encodeURIComponent(clean)}` : ''
}

/** <img onError>: swap a dead Mathpix link for the local copy, once. @param {{ currentTarget?: any }} event */
export function showLocalPictureOnError(event) {
  const img = event?.currentTarget
  if (!img || img.dataset?.localPicture) return
  const local = mathpixLocalPictureUrl(img.getAttribute('src'))
  if (!local) return
  img.dataset.localPicture = '1'
  img.src = local
}

/** The same swap for pictures written as HTML strings. @param {unknown} url */
export function localPictureOnErrorAttr(url) {
  const local = mathpixLocalPictureUrl(url)
  return local ? ` onerror="this.onerror=null;this.src='${local}'"` : ''
}

/** Every Mathpix picture link in a value: text, or cards with any text field. @param {...unknown} values */
export function mathpixPictureLinksIn(...values) {
  const found = new Set()
  const take = (value, depth) => {
    if (typeof value === 'string') {
      if (!value.includes('cdn.mathpix.com')) return
      for (const m of value.matchAll(MATHPIX_CROP_LINKS_RE)) {
        const clean = cleanMathpixImageUrl(m[0])
        if (MATHPIX_CROP_LINK.test(clean)) found.add(clean)
      }
    } else if (value && typeof value === 'object' && depth < 8) {
      for (const v of Array.isArray(value) ? value : Object.values(value)) take(v, depth + 1)
    }
  }
  for (const value of values) take(value, 0)
  return [...found]
}

/** Every Mathpix picture link in the cards (any text field) and the stored OCR. @param {any} paper @param {string} [ocrText] */
export function mathpixPictureLinksOfPaper(paper, ocrText = '') {
  return mathpixPictureLinksIn(paper?.questions, String(ocrText ?? ''))
}

/**
 * Ask the helper to download these Mathpix pictures now, while the links still load. Links with a
 * local copy already are skipped there; each link is sent once per session.
 * @param {string[]} links
 * @returns {Promise<{ ok: boolean, saved: number, kept: number, failed: number, error?: string }>}
 */
export async function keepMathpixPicturesLocal(links) {
  const todo = [...new Set(Array.isArray(links) ? links : [])].filter((link) => !keptThisSession.has(link))
  let saved = 0
  let kept = 0
  let failed = 0
  for (let i = 0; i < todo.length; i += LINKS_PER_REQUEST) {
    const part = todo.slice(i, i + LINKS_PER_REQUEST)
    let data = null
    try {
      const res = await fetch(KEEP_PICTURES_ROUTE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: part }),
      })
      if (!res.ok) return { ok: false, saved, kept, failed, error: `Could not keep the pictures (${res.status}).` }
      data = await res.json()
    } catch {
      return { ok: false, saved, kept, failed, error: 'Hybrid AI (port 8000) is not running.' }
    }
    for (const link of part) keptThisSession.add(link)
    saved += Number(data?.saved) || 0
    kept += Number(data?.kept) || 0
    failed += Array.isArray(data?.failed) ? data.failed.length : 0
  }
  return { ok: true, saved, kept, failed }
}

/** Keep local copies of the pictures in these cards, in the background (never blocks a save). @param {unknown} questions */
export function keepQuestionPicturesLocalSoon(questions) {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return
  const links = mathpixPictureLinksIn(questions).filter((link) => !keptThisSession.has(link))
  if (!links.length) return
  setTimeout(() => {
    void keepMathpixPicturesLocal(links).catch(() => {})
  }, 0)
}

/**
 * Once per session: every Mathpix link saved anywhere in this browser (Question Bank, Official PYQ,
 * student PYQ tests, other uploads) gets a local copy while it still loads.
 * @param {Storage} [storage]
 */
export async function keepAllStoredMathpixPicturesLocal(storage = typeof localStorage !== 'undefined' ? localStorage : undefined) {
  if (!storage || storedSweepDone) return { ok: false, saved: 0, kept: 0, failed: 0 }
  /** @type {unknown[]} */
  const values = []
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i)
    const raw = key ? storage.getItem(key) : null
    if (!raw || !raw.includes('cdn.mathpix.com')) continue
    try {
      values.push(JSON.parse(raw))
    } catch {
      values.push(raw)
    }
  }
  const result = await keepMathpixPicturesLocal(mathpixPictureLinksIn(...values))
  if (result.ok) storedSweepDone = true
  return result
}

/**
 * Ask the helper to cut local copies of these links from the paper's original PDF.
 * @param {string} paperId @param {string[]} links
 * @returns {Promise<{ ok: true, saved: number, skipped: number } | { ok: false, noOriginal?: boolean, error: string }>}
 */
export async function saveLocalCopiesOfMathpixPictures(paperId, links) {
  let saved = 0
  let skipped = 0
  for (let i = 0; i < links.length; i += LINKS_PER_REQUEST) {
    let res
    try {
      res = await fetch(`/api/official-pyq/original/${encodeURIComponent(paperId)}/mathpix-crops`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: links.slice(i, i + LINKS_PER_REQUEST) }),
      })
    } catch {
      return { ok: false, error: 'Hybrid AI (port 8000) is not running.' }
    }
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      if (data?.detail?.code === 'original_missing') {
        return { ok: false, noOriginal: true, error: 'Attach the original PDF so its pictures can be kept.' }
      }
      return { ok: false, error: `Could not keep the pictures (${res.status}).` }
    }
    const data = await res.json().catch(() => null)
    saved += Object.keys(data?.crops ?? {}).length
    skipped += Array.isArray(data?.skipped) ? data.skipped.length : 0
  }
  return { ok: true, saved, skipped }
}

/**
 * Keep local copies of every stored paper's Mathpix pictures. A paper is done once its
 * current link count was saved; papers without an original PDF are retried next session.
 * @param {{
 *   papers: any[],
 *   ocrTextOf: (id: string) => string,
 *   savePaperMeta: (patchById: Record<string, any>) => void,
 *   onlyPaperId?: string,
 *   force?: boolean,
 * }} deps
 * @returns {Promise<{ kept: number, noOriginal: string[] }>}
 */
export async function keepOfficialPyqPicturesLocal({ papers, ocrTextOf, savePaperMeta, onlyPaperId, force = false }) {
  let kept = 0
  /** @type {string[]} */
  const noOriginal = []
  /** @type {Record<string, any>} */
  const meta = {}
  for (const paper of Array.isArray(papers) ? papers : []) {
    const id = String(paper?.id ?? '')
    if (!id || (onlyPaperId && id !== onlyPaperId)) continue
    const links = mathpixPictureLinksOfPaper(paper, ocrTextOf(id))
    if (!links.length) continue
    const done = paper.localPictures
    if (!force && done?.links === links.length && !done?.noOriginal) continue
    const result = await saveLocalCopiesOfMathpixPictures(id, links)
    if (result.ok) {
      kept += result.saved
      meta[id] = { localPictures: { links: links.length, saved: result.saved, at: Date.now() } }
    } else if (result.noOriginal) {
      noOriginal.push(id)
      const downloaded = await keepMathpixPicturesLocal(links)
      if (downloaded.ok) kept += downloaded.saved
      if (!done?.noOriginal) meta[id] = { localPictures: { links: links.length, noOriginal: true, at: Date.now() } }
    } else {
      break
    }
  }
  if (Object.keys(meta).length) savePaperMeta(meta)
  return { kept, noOriginal }
}
