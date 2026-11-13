/**
 * Book / question bank PDFs: the whole file stays on the server (data/books); the admin reads
 * it one page range at a time. A range is read once by Mathpix (the same read as an official
 * PYQ upload), cut into exercises by {@link splitBookRangeText}, and every exercise becomes a
 * pending paper through {@link pendingPaperFromExtract}, the same step every paper upload uses.
 * The range's own PDF is stored as each part's original, so Compare and Auto-fix work as for
 * a paper.
 */

import { pendingPaperFromExtract } from './officialPyqImportFile.js'
import { extractPyqFileWithGemini } from './pyqGeminiExtract.js'
import { bookExerciseKey, normalizeBookAnswerKey, splitBookRangeText } from './bookRangeSplit.js'
import { loadOfficialPyqPendingPapers, isBookPaper } from './officialPyqPendingStore.js'

const API = '/api/ingest/books'

/** @param {Response} res */
async function readJson(res) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = data?.detail
    const message = typeof detail === 'string' ? detail : detail?.message
    throw new Error(message || `Book server error (${res.status}). Press F5 to restart the app, then try again.`)
  }
  return data
}

/**
 * @typedef {{ start: number, end: number, title: string, chapter: string, status: 'new' | 'reading' | 'done' | 'skipped' | 'failed', paperIds: string[], note?: string }} BookRange
 * @typedef {{ id: string, name: string, fileName: string, pages: number, textLayer: boolean, chapterSource: string, chapters: Array<{ title: string, page: number }>, ranges: BookRange[], existing?: boolean }} StoredBook
 */

/** @param {File} file @param {string} name @param {number} [rangePages] @returns {Promise<StoredBook>} */
export async function uploadBook(file, name, rangePages = 20) {
  const form = new FormData()
  form.append('file', file, file.name || 'book.pdf')
  form.append('name', name || '')
  form.append('range_pages', String(rangePages))
  return (await readJson(await fetch(API, { method: 'POST', body: form }))).book
}

/** @returns {Promise<StoredBook[]>} */
export async function listBooks() {
  return (await readJson(await fetch(API))).books || []
}

/** @param {string} bookId @returns {Promise<StoredBook>} */
export async function getBook(bookId) {
  return (await readJson(await fetch(`${API}/${encodeURIComponent(bookId)}`))).book
}

/** @param {string} bookId @param {BookRange[]} ranges @param {string} [name] @returns {Promise<StoredBook>} */
export async function saveBookRanges(bookId, ranges, name) {
  const res = await fetch(`${API}/${encodeURIComponent(bookId)}/ranges`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ranges, ...(name ? { name } : {}) }),
  })
  return (await readJson(res)).book
}

/** @param {string} bookId */
export async function deleteBook(bookId) {
  await readJson(await fetch(`${API}/${encodeURIComponent(bookId)}`, { method: 'DELETE' }))
}

/** Pages start..end of the stored book as a PDF file of their own. */
export async function fetchBookSlice(book, start, end) {
  const res = await fetch(`${API}/${encodeURIComponent(book.id)}/slice?start=${start}&end=${end}`)
  if (!res.ok) await readJson(res)
  const blob = await res.blob()
  const base = String(book.name || 'book').replace(/[^\w\- ]+/g, '').trim() || 'book'
  return new File([blob], `${base} p${start}-${end}.pdf`, { type: 'application/pdf' })
}

/** "Book – Chapter – Exercise", without repeating a part that is already in the name. */
export function bookPartPaperName(bookName, chapter, title) {
  const parts = []
  for (const raw of [bookName, chapter, title]) {
    const s = String(raw ?? '').replace(/\s+/g, ' ').trim()
    if (s && !parts.some((p) => p.toLowerCase() === s.toLowerCase())) parts.push(s)
  }
  return parts.join(' – ')
}

/** Pending book papers of this book, for answer keys printed in a later range. */
function bookPapersFor(bookId) {
  return loadOfficialPyqPendingPapers().filter((p) => isBookPaper(p) && p.bookId === bookId && p.status !== 'published')
}

/**
 * The scan of one part, shaped like a whole upload so the shared build step reads it the
 * same way. The range's structured questions belong to the whole range, so they are not passed.
 * @param {any} extracted
 * @param {string} text
 */
function partExtract(extracted, text) {
  return {
    ...extracted,
    text,
    visionText: text,
    pdfText: '',
    localOcrText: '',
    questions: [],
    printedAnswerKey: undefined,
    structuredQuestionCount: 0,
  }
}

/**
 * Read one page range and save each exercise in it as a pending paper.
 * @param {{
 *   book: StoredBook
 *   range: BookRange
 *   exam: 'jee-main' | 'jee-advanced' | 'neet'
 *   continues?: string the exercise the previous range ended in
 *   file?: File the range's PDF (fetched from the server when omitted)
 *   extracted?: any an already-read scan (tests)
 *   storeOriginal?: (paperId: string, file: File) => Promise<unknown>
 *   onProgress?: (pct: number, label?: string) => void
 *   signal?: AbortSignal
 * }} args
 */
export async function importBookRange(args) {
  const { book, range, exam } = args
  const year = new Date().getFullYear()
  const file = args.file || (args.extracted ? null : await fetchBookSlice(book, range.start, range.end))
  const extracted =
    args.extracted ||
    (await extractPyqFileWithGemini(file, args.onProgress, {
      signal: args.signal,
      timeoutMs: 600_000,
      exam,
      year,
      paperLabel: `${book.name} pages ${range.start}-${range.end}`,
    }))
  const split = splitBookRangeText(String(extracted?.text ?? ''), { chapter: range.chapter, continues: args.continues })

  /** @type {Array<{ title: string, chapter: string, kind: string, paperId?: string, paperLabel?: string, count: number, answered: number, solved: number, error?: string }>} */
  const parts = []
  const names = new Set()
  for (const part of split.parts) {
    let name = bookPartPaperName(book.name, part.chapter, part.title)
    for (let k = 2; names.has(name.toLowerCase()); k += 1) name = `${bookPartPaperName(book.name, part.chapter, part.title)} (${k})`
    names.add(name.toLowerCase())
    try {
      const { paper } = pendingPaperFromExtract(
        partExtract(extracted, part.text),
        {
          paperKind: 'book',
          paperName: name,
          paperLabel: name,
          exam,
          year,
          session: '',
          sourceUrl: '',
          sourceLabel: book.name,
          bookId: book.id,
          bookName: book.name,
          bookChapter: part.chapter,
          bookExercise: part.title,
          bookPartKind: part.kind,
          bookNoOptions: part.kind === 'examples' || !/\(\s*[A-Da-d]\s*\)/.test(part.text.split(/\\section\*\{(?:ANSWER KEY|HINTS)/)[0]),
          bookPageStart: range.start,
          bookPageEnd: range.end,
        },
        file?.name || `${book.name} p${range.start}-${range.end}.pdf`,
      )
      const cards = paper.questions || []
      parts.push({
        title: part.title,
        chapter: part.chapter,
        kind: part.kind,
        paperId: paper.id,
        paperLabel: paper.paperLabel,
        count: cards.length,
        answered: cards.filter((q) => q.correctIndex != null || q.correctInteger != null || q.correctNumerical != null || q.correctIndices?.length).length,
        solved: cards.filter((q) => String(q.solution || '').trim()).length,
      })
    } catch (e) {
      parts.push({ title: part.title, chapter: part.chapter, kind: part.kind, count: 0, answered: 0, solved: 0, error: e instanceof Error ? e.message : String(e) })
    }
  }

  const store = args.storeOriginal
  if (file && store) {
    args.onProgress?.(97, 'Storing the pages for Compare…')
    for (const p of parts) {
      if (!p.paperId) continue
      await store(p.paperId, file).catch(() => {
        /* Compare can still use "Attach original PDF" later */
      })
    }
  }

  /** An answer key printed in this range for an exercise read in an earlier range. */
  const lateAnswers = []
  if (split.unmatchedAnswers.length) {
    const { applyAnswerFileToOfficialPyqPaper } = await import('./officialPyqAnswerFile.js')
    const earlier = bookPapersFor(book.id)
    for (const ans of split.unmatchedAnswers) {
      const key = bookExerciseKey(ans.title)
      const target =
        earlier.find((p) => key && bookExerciseKey(p.bookExercise) === key && (!ans.chapter || p.bookChapter === ans.chapter)) ||
        earlier.find((p) => key && bookExerciseKey(p.bookExercise) === key)
      if (!target) {
        lateAnswers.push({ title: ans.title, applied: false })
        continue
      }
      try {
        const numericOptions =
          /\(\s*[1-4]\s*\)/.test(ans.text) &&
          !/\(\s*[a-dA-D]\s*\)/.test(ans.text) &&
          (target.questions || []).some((q) => (q.options || []).filter((o) => String(o).trim()).length >= 4)
        const res = applyAnswerFileToOfficialPyqPaper(target.id, normalizeBookAnswerKey(ans.text, { numericOptions }), {
          fileName: `${book.name} p${range.start}-${range.end}`,
        })
        lateAnswers.push({ title: ans.title, applied: res?.ok !== false, paperLabel: target.paperLabel })
      } catch {
        lateAnswers.push({ title: ans.title, applied: false, paperLabel: target.paperLabel })
      }
    }
  }

  const lastExercise = [...split.parts].reverse().find((p) => p.kind === 'exercise')?.title || ''
  return { parts, skipped: split.skipped, lateAnswers, lastExercise }
}
