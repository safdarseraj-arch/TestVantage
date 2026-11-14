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
import { bookExerciseKey, splitBookRangeText, splitBookSolutionsText } from './bookRangeSplit.js'
import { applyBookSolutionBlocks } from './bookSolutions.js'

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
 * @typedef {{ start: number, end: number, title: string, chapter: string, status: 'new' | 'reading' | 'done' | 'skipped' | 'failed', paperIds: string[], note?: string, found?: number, lastExercise?: string, lastChapter?: string }} BookRange
 * @typedef {{ id: string, name: string, fileName: string, pages: number, textLayer: boolean, chapterSource: string, chapters: Array<{ title: string, page: number }>, ranges: BookRange[], role?: 'solutions', forBook?: string, solutionsBookId?: string, existing?: boolean }} StoredBook
 * @typedef {import('./bookRangeSplit.js').BookSolutionBlock & { source?: 'book' | 'solutions', start?: number, end?: number }} StoredSolutionBlock
 * @typedef {{
 *   load: (bookId: string) => Promise<StoredSolutionBlock[]>
 *   save: (bookId: string, entry: { source: 'book' | 'solutions', start: number, end: number, blocks: import('./bookRangeSplit.js').BookSolutionBlock[] }) => Promise<unknown>
 * }} BookSolutionStore
 */

/**
 * @param {File} file @param {string} name @param {number} [rangePages]
 * @param {string} [forBook] the PDF is this book's separate solutions PDF
 * @returns {Promise<StoredBook>}
 */
export async function uploadBook(file, name, rangePages = 20, forBook = '') {
  const form = new FormData()
  form.append('file', file, file.name || 'book.pdf')
  form.append('name', name || '')
  form.append('range_pages', String(rangePages))
  if (forBook) form.append('for_book', forBook)
  return (await readJson(await fetch(API, { method: 'POST', body: form }))).book
}

/** Answers / solutions kept on the server per book, so they reach an exercise read later. @type {BookSolutionStore} */
export const serverBookSolutionStore = {
  load: async (bookId) => (await readJson(await fetch(`${API}/${encodeURIComponent(bookId)}/solutions`))).blocks || [],
  save: async (bookId, entry) =>
    readJson(
      await fetch(`${API}/${encodeURIComponent(bookId)}/solutions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      }),
    ),
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
 *   solutionStore?: BookSolutionStore | null where answers for other ranges are kept (the server when omitted; null: none)
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
          bookNumberOffset: part.numberOffset || undefined,
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

  // Answer keys printed here for an exercise of another range: kept, so an exercise read
  // later gets them too; and what was kept from other ranges or the solutions PDF goes on
  // the exercises just read.
  const late = split.unmatchedAnswers.map((a) => ({ title: a.title, chapter: a.chapter, key: bookExerciseKey(a.title), text: a.text }))
  const solutionStore = args.solutionStore === undefined ? serverBookSolutionStore : args.solutionStore
  /** @type {StoredSolutionBlock[]} */
  let stored = []
  let storeError = ''
  if (solutionStore) {
    try {
      await solutionStore.save(book.id, { source: 'book', start: range.start, end: range.end, blocks: late })
      stored = await solutionStore.load(book.id)
    } catch (e) {
      storeError = e instanceof Error ? e.message : String(e)
    }
  }
  const lateAnswers = applyBookSolutionBlocks({ bookId: book.id, blocks: late, fileName: `${book.name} p${range.start}-${range.end}` }).map(
    (r) => ({
      title: r.title,
      chapter: r.chapter,
      applied: r.applied.some((x) => x.ok),
      paperLabel: r.applied.map((x) => x.paperLabel).join(', '),
      ...(r.reason ? { reason: r.reason } : {}),
    }),
  )
  const ids = parts.map((p) => p.paperId).filter(Boolean)
  const fromOtherRanges = stored.filter((b) => !(b.source === 'book' && b.start === range.start && b.end === range.end))
  const keptApplied = ids.length
    ? applyBookSolutionBlocks({
        bookId: book.id,
        blocks: fromOtherRanges.map((b) => ({ ...b, fileName: storedBlockFileName(book, b) })),
        onlyPaperIds: /** @type {string[]} */ (ids),
      })
        .filter((r) => r.applied.some((x) => x.ok))
        .map((r) => ({ title: r.title, paperLabel: r.applied.map((x) => x.paperLabel).join(', ') }))
    : []
  if (keptApplied.length) {
    const { getOfficialPyqPendingPaper } = await import('./officialPyqPendingStore.js')
    for (const p of parts) {
      const cards = p.paperId ? getOfficialPyqPendingPaper(p.paperId)?.questions || [] : []
      if (!cards.length) continue
      p.answered = cards.filter(hasCardAnswer).length
      p.solved = cards.filter((q) => String(q.solution || '').trim()).length
    }
  }

  const lastExercise = [...split.parts].reverse().find((p) => p.kind === 'exercise')?.title || ''
  return { parts, skipped: split.skipped, lateAnswers, keptApplied, storeError, lastExercise }
}

/** @param {Record<string, any>} q */
function hasCardAnswer(q) {
  return q.correctIndex != null || q.correctInteger != null || q.correctNumerical != null || Boolean(q.correctIndices?.length)
}

/** @param {StoredBook} book @param {StoredSolutionBlock} b */
function storedBlockFileName(book, b) {
  return b.source === 'solutions' ? `${book.name} solutions PDF p${b.start}-${b.end}` : `${book.name} p${b.start}-${b.end}`
}

/**
 * Read one page range of the book's separate solutions PDF: each exercise's answers and
 * solutions are kept on the server and put on that exercise's pending paper when it has been
 * read (else when it is read later).
 * @param {{
 *   book: StoredBook the question book
 *   solutionsBook: StoredBook
 *   range: BookRange a range of the solutions PDF
 *   continues?: { title?: string, chapter?: string } where the previous range of the solutions PDF ended
 *   file?: File
 *   text?: string already-read text (tests)
 *   solutionStore?: BookSolutionStore
 *   onProgress?: (pct: number, label?: string) => void
 *   signal?: AbortSignal
 * }} args
 */
export async function importSolutionsRange(args) {
  const { book, solutionsBook, range } = args
  let text = args.text
  if (text == null) {
    const file = args.file || (await fetchBookSlice(solutionsBook, range.start, range.end))
    const { recognizeWithMathpix } = await import('./mathpixOcr.js')
    text = await recognizeWithMathpix(file, (p) => args.onProgress?.(Math.min(90, Number(p) || 0), 'Reading with Mathpix…'), {
      signal: args.signal,
      format: 'latex',
    })
  }
  if (args.signal?.aborted) throw new DOMException('Stopped', 'AbortError')
  const split = splitBookSolutionsText(String(text ?? ''), { chapter: range.chapter, continues: args.continues })
  args.onProgress?.(95, 'Putting the solutions on the exercises…')
  await (args.solutionStore || serverBookSolutionStore).save(book.id, {
    source: 'solutions',
    start: range.start,
    end: range.end,
    blocks: split.blocks,
  })
  const results = applyBookSolutionBlocks({
    bookId: book.id,
    blocks: split.blocks,
    fileName: `${book.name} solutions PDF p${range.start}-${range.end}`,
  })
  return { blocks: results, last: split.last }
}
