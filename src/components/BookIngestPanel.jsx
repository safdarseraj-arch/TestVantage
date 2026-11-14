import { useCallback, useEffect, useRef, useState } from 'react'
import { OFFICIAL_PYQ_EXAMS } from '../data/officialPyqSources'
import {
  deleteBook,
  getBook,
  importBookRange,
  importSolutionsRange,
  listBooks,
  saveBookRanges,
  uploadBook,
} from '../utils/bookRangeImport.js'
import { describePages, MAX_RANGE_PAGES, parsePageList, planBookRanges } from '../utils/bookPagePlan.js'
import { solutionWaitingNote } from '../utils/bookSolutions.js'
import { formatOfficialPyqUploadError } from '../utils/pyqGeminiExtract.js'

const RANGE_SIZES = [10, 15, 20, 25, 30, 40]
const MAX_RANGE = MAX_RANGE_PAGES
const OUTAGE_RE = /not running|failed to fetch|network|timed?\s*out|timeout|\b(?:429|502|503|504)\b|unavailable|overloaded|resource_exhausted|econn/i
const STORAGE_FULL_RE = /storage may be full|quota/i

/** Range titles made from page numbers are renamed when the range is cut or joined. */
const isPageTitle = (title) => !String(title || '').trim() || /^Pages \d+-\d+( \([ab]\))*$/.test(String(title).trim())
const STATUS_LABEL = { new: 'Not read', reading: 'Reading…', done: 'Read', skipped: 'Skipped', failed: 'Failed' }

/** @param {number} n */
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** @typedef {import('../utils/bookRangeImport.js').StoredBook} StoredBook */
/** @typedef {import('../utils/bookRangeImport.js').BookRange} BookRange */
/**
 * @typedef {(args: {
 *   book: StoredBook
 *   range: BookRange
 *   before: BookRange | null the range read just before, when it ends on the page before this one
 *   signal: AbortSignal
 *   onProgress: (pct: number, label?: string) => void
 *   inRun: boolean
 * }) => Promise<{ patch: Partial<BookRange>, message: string, stop?: string, paperIds?: string[] }>} ReadOne
 */

/**
 * Book / question bank PDF: upload the whole file once, choose the pages to read ("1-100,
 * 151-175" or all of it), then read range by range, or all in a row. Each exercise found
 * becomes a paper in the list below this panel. Answers printed later in the book, or in a
 * separate solutions PDF, go on the exercises whichever is read first.
 * @param {{ onImported?: (paperIds: string[]) => void }} props
 */
export default function BookIngestPanel({ onImported }) {
  const [books, setBooks] = useState(/** @type {StoredBook[]} */ ([]))
  const [book, setBook] = useState(/** @type {StoredBook | null} */ (null))
  const [solBook, setSolBook] = useState(/** @type {StoredBook | null} */ (null))
  const [name, setName] = useState('')
  const [rangePages, setRangePages] = useState(20)
  const [exam, setExam] = useState(/** @type {'jee-main' | 'jee-advanced' | 'neet'} */ ('jee-main'))
  const [busy, setBusy] = useState('')
  const [pct, setPct] = useState(0)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [lastRun, setLastRun] = useState(/** @type {any} */ (null))
  const stopRef = useRef(/** @type {{ ctl: AbortController | null, stopAll: boolean }} */ ({ ctl: null, stopAll: false }))

  const refreshBooks = useCallback(async () => {
    try {
      setBooks(await listBooks())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the books.')
    }
  }, [])

  useEffect(() => {
    void refreshBooks()
  }, [refreshBooks])

  const openBook = useCallback(async (b) => {
    setBook(b)
    setLastRun(null)
    setName(b?.name || '')
    setSolBook(null)
    if (b?.solutionsBookId) {
      try {
        setSolBook(await getBook(b.solutionsBookId))
      } catch {
        /* the solutions PDF was removed; the book still works */
      }
    }
  }, [])

  async function onUpload(ev) {
    const file = ev.target.files?.[0]
    ev.target.value = ''
    if (!file) return
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      setError('Upload a PDF file for a book.')
      return
    }
    setBusy('Uploading the book…')
    setError('')
    setMessage('')
    try {
      const b = await uploadBook(file, name.trim(), rangePages)
      if (b.role === 'solutions') {
        setError(`“${b.name}” is stored as the solutions PDF of another book. Open that book instead.`)
        return
      }
      await openBook(b)
      await refreshBooks()
      setMessage(
        b.existing
          ? `“${b.name}” was uploaded before. Its page ranges and progress are kept.`
          : `“${b.name}” is stored (${plural(b.pages, 'page')}). All its pages are listed below in ranges. To read only some pages, type them in “Pages to read”.`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setBusy('')
    }
  }

  async function onUploadSolutions(ev) {
    const file = ev.target.files?.[0]
    ev.target.value = ''
    if (!file || !book) return
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      setError('Upload the solutions as a PDF file.')
      return
    }
    setBusy('Uploading the solutions PDF…')
    setError('')
    setMessage('')
    try {
      const s = await uploadBook(file, `${book.name} – Solutions`, rangePages, book.id)
      setSolBook(s)
      setBook(await getBook(book.id))
      await refreshBooks()
      setMessage(
        `Solutions PDF stored (${plural(s.pages, 'page')}). Read its pages below, before or after the book's pages: each exercise's answers and solutions go on that exercise.`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setBusy('')
    }
  }

  async function onRemoveSolutions() {
    if (!solBook || !book) return
    if (
      typeof window !== 'undefined' &&
      !window.confirm('Remove the solutions PDF from this computer? Answers and solutions already read from it stay.')
    )
      return
    try {
      await deleteBook(solBook.id)
      setSolBook(null)
      setBook(await getBook(book.id))
      await refreshBooks()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove the solutions PDF.')
    }
  }

  async function onDeleteBook() {
    if (!book) return
    const extra = solBook ? ' Its solutions PDF is removed too.' : ''
    if (typeof window !== 'undefined' && !window.confirm(`Remove “${book.name}” from this computer?${extra} Papers already made from it stay in the list.`))
      return
    try {
      await deleteBook(book.id)
      await openBook(null)
      await refreshBooks()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove the book.')
    }
  }

  /** @type {ReadOne} */
  const readQuestionsRange = async ({ book: b, range, before, signal, onProgress, inRun }) => {
    const { uploadOfficialPyqOriginal } = await import('../utils/officialPyqOriginalCompare.js')
    const result = await importBookRange({
      book: b,
      range,
      exam,
      continues: before?.lastExercise || undefined,
      storeOriginal: (paperId, file) => uploadOfficialPyqOriginal(paperId, file),
      signal,
      onProgress,
    })
    const ids = result.parts.map((p) => p.paperId).filter(Boolean)
    const found = result.parts.reduce((n, p) => n + p.count, 0)
    setLastRun({ kind: 'questions', range, ...result })
    if (ids.length && !inRun) onImported?.(ids)
    const full = result.parts.some((p) => p.error && STORAGE_FULL_RE.test(p.error))
    return {
      patch: {
        status: full && !ids.length ? 'failed' : ids.length || result.lateAnswers.length ? 'done' : 'skipped',
        paperIds: ids,
        found,
        lastExercise: result.lastExercise || before?.lastExercise || '',
        note: full ? 'Browser storage full' : ids.length ? '' : 'No exercise found (theory pages)',
      },
      paperIds: ids,
      message: ids.length
        ? `Pages ${range.start}-${range.end}: ${plural(ids.length, 'part')} added to the list below (${plural(found, 'question')}). Review each one like a paper.`
        : `Pages ${range.start}-${range.end}: no exercise found, only theory. Nothing was added.`,
      stop: full
        ? 'Browser storage is full, so some parts could not be saved. Remove parts you no longer need from the list below (or publish and remove them), then read again.'
        : '',
    }
  }

  /** @type {ReadOne} */
  const readSolutionsRange = async ({ book: s, range, before, signal, onProgress, inRun }) => {
    if (!book) throw new Error('Open the book first.')
    const result = await importSolutionsRange({
      book,
      solutionsBook: s,
      range,
      continues: before ? { title: before.lastExercise, chapter: before.lastChapter } : undefined,
      signal,
      onProgress,
    })
    const put = result.blocks.filter((r) => r.applied.some((x) => x.ok)).length
    const waiting = result.blocks.length - put
    setLastRun({ kind: 'solutions', range, ...result })
    const touched = [...new Set(result.blocks.flatMap((r) => r.applied.map((x) => x.paperId)))]
    if (touched.length && !inRun) onImported?.([])
    return {
      patch: {
        status: result.blocks.length ? 'done' : 'skipped',
        paperIds: [],
        found: result.blocks.length,
        lastExercise: result.last.title,
        lastChapter: result.last.chapter,
        note: result.blocks.length ? `${put} put on exercises${waiting ? `, ${waiting} waiting` : ''}` : 'No answers or solutions found',
      },
      paperIds: [],
      message: result.blocks.length
        ? `Solutions pages ${range.start}-${range.end}: ${plural(result.blocks.length, 'exercise')} found, ${put} put on their exercise${waiting ? `, ${waiting} kept until their exercise is read` : ''}.`
        : `Solutions pages ${range.start}-${range.end}: no answers or solutions found.`,
    }
  }

  const tableProps = { rangePages, busy, setBusy, setPct, setError, setMessage, stopRef, onImported }

  return (
    <section className="card official-pyq-import book-ingest-panel" data-testid="book-ingest-panel">
      <h2>1. Upload the book and read it page range by page range</h2>
      {error ? <p className="upload-error">{error}</p> : null}
      {message ? <p className="form-hint upload-success-hint">{message}</p> : null}

      <div className="pyq-paper-setup-grid">
        <label className="pyq-paper-setup-wide">
          Book name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. HC Verma Part 1 (empty = file name)"
          />
        </label>
        <label>
          For exam
          <select value={exam} onChange={(e) => setExam(/** @type {any} */ (e.target.value))}>
            {OFFICIAL_PYQ_EXAMS.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Pages per range
          <select value={rangePages} onChange={(e) => setRangePages(Number(e.target.value))}>
            {RANGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="official-pyq-actions">
        <label className="btn btn-primary btn-sm">
          {busy && !book ? busy : 'Upload book PDF (any number of pages)'}
          <input type="file" accept=".pdf,application/pdf" hidden disabled={Boolean(busy)} onChange={onUpload} data-testid="book-upload-input" />
        </label>
        {books.some((b) => b.role !== 'solutions') ? (
          <label>
            Or open a stored book{' '}
            <select
              value={book?.id || ''}
              onChange={(e) => void openBook(books.find((b) => b.id === e.target.value) || null)}
              disabled={Boolean(busy)}
              data-testid="book-select"
            >
              <option value="">— choose —</option>
              {books
                .filter((b) => b.role !== 'solutions')
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({plural(b.pages, 'page')})
                  </option>
                ))}
            </select>
          </label>
        ) : null}
      </div>
      <p className="form-hint">
        The whole file stays on this computer. Each range is read once by Mathpix (only the pages you read are
        sent). Theory pages are left out; each exercise and the solved examples become papers in the list below,
        with the answer key printed in the book put on their questions.
      </p>

      {book ? (
        <>
          <BookRangeTable
            key={book.id}
            book={book}
            kind="questions"
            saveName={name.trim() && name.trim() !== book.name ? name.trim() : ''}
            onSaved={setBook}
            readOne={readQuestionsRange}
            {...tableProps}
          />
          <div className="official-pyq-actions">
            <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(busy)} onClick={() => void onDeleteBook()}>
              Remove book file
            </button>
          </div>

          <div className="book-ingest-solutions" data-testid="book-solutions">
            <h3>Answers and solutions</h3>
            <p className="form-hint">
              Printed in this book (after each exercise, at the end of the chapter or at the end of the book): nothing
              to do, they are read with the pages. An answer key printed in a later range is kept and goes on its
              exercise, whichever of the two is read first. In a separate solutions PDF: upload it here and read its
              pages; each exercise&apos;s answers and solutions go on that exercise (same chapter, same exercise name,
              same question number).
            </p>
            {solBook ? (
              <>
                <BookRangeTable key={solBook.id} book={solBook} kind="solutions" saveName="" onSaved={setSolBook} readOne={readSolutionsRange} {...tableProps} />
                <div className="official-pyq-actions">
                  <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(busy)} onClick={() => void onRemoveSolutions()}>
                    Remove solutions PDF
                  </button>
                </div>
              </>
            ) : (
              <div className="official-pyq-actions">
                <label className="btn btn-ghost btn-sm">
                  {busy === 'Uploading the solutions PDF…' ? busy : 'Upload separate solutions PDF'}
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    hidden
                    disabled={Boolean(busy)}
                    onChange={onUploadSolutions}
                    data-testid="book-solutions-upload-input"
                  />
                </label>
              </div>
            )}
          </div>

          {busy ? (
            <p className="official-pyq-progress" role="status">
              {busy} {Math.round(pct)}%
            </p>
          ) : null}
          {lastRun?.kind === 'questions' ? <BookRangeResult run={lastRun} /> : null}
          {lastRun?.kind === 'solutions' ? <SolutionsRangeResult run={lastRun} /> : null}
        </>
      ) : null}
    </section>
  )
}

/**
 * The page ranges of one stored PDF (the book or its solutions PDF): choose pages, edit,
 * read one range, or read all in a row with Stop.
 * @param {{
 *   book: StoredBook
 *   kind: 'questions' | 'solutions'
 *   saveName: string
 *   onSaved: (book: StoredBook) => void
 *   readOne: ReadOne
 *   rangePages: number
 *   busy: string
 *   setBusy: (s: string) => void
 *   setPct: (n: number) => void
 *   setError: (s: string) => void
 *   setMessage: (s: string) => void
 *   stopRef: { current: { ctl: AbortController | null, stopAll: boolean } }
 *   onImported?: (paperIds: string[]) => void
 * }} props
 */
function BookRangeTable({ book, kind, saveName, onSaved, readOne, rangePages, busy, setBusy, setPct, setError, setMessage, stopRef, onImported }) {
  const [ranges, setRanges] = useState(/** @type {BookRange[]} */ (book.ranges || []))
  const [dirty, setDirty] = useState(false)
  const [pagesText, setPagesText] = useState('')
  const [active, setActive] = useState(false)
  const solutions = kind === 'solutions'

  useEffect(() => {
    setRanges(book.ranges || [])
    setDirty(false)
  }, [book])

  /** @param {number} index @param {Partial<BookRange>} patch */
  function editRange(index, patch) {
    setRanges((list) => list.map((r, i) => (i === index ? { ...r, ...patch } : r)))
    setDirty(true)
  }

  function splitRange(index) {
    setRanges((list) => {
      const r = list[index]
      if (!r || r.end <= r.start) return list
      const mid = Math.floor((r.start + r.end) / 2)
      const plain = isPageTitle(r.title)
      const a = { ...r, end: mid, title: plain ? `Pages ${r.start}-${mid}` : `${r.title} (a)`, status: 'new', paperIds: [] }
      const b = { ...r, start: mid + 1, title: plain ? `Pages ${mid + 1}-${r.end}` : `${r.title} (b)`, status: 'new', paperIds: [] }
      return [...list.slice(0, index), a, b, ...list.slice(index + 1)]
    })
    setDirty(true)
  }

  function joinWithNext(index) {
    setRanges((list) => {
      const a = list[index]
      const b = list[index + 1]
      if (!a || !b || b.end - a.start + 1 > MAX_RANGE) return list
      const title = isPageTitle(a.title) ? `Pages ${a.start}-${b.end}` : a.title
      return [...list.slice(0, index), { ...a, end: b.end, title, status: 'new', paperIds: [] }, ...list.slice(index + 2)]
    })
    setDirty(true)
  }

  /** @param {BookRange[]} next @returns {Promise<StoredBook>} */
  async function persist(next) {
    const saved = await saveBookRanges(book.id, next, saveName || undefined)
    setRanges(saved.ranges)
    setDirty(false)
    onSaved(saved)
    return saved
  }

  async function onSaveRanges() {
    setError('')
    try {
      await persist(ranges)
      setMessage('Page ranges saved.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the page ranges.')
    }
  }

  /** @param {'add' | 'only'} mode */
  async function planPages(mode) {
    setError('')
    setMessage('')
    const { intervals, error } = parsePageList(pagesText, book.pages)
    if (error) {
      setError(error)
      return
    }
    const plan = planBookRanges({ pages: book.pages, chapters: book.chapters, ranges, wanted: intervals, rangePages, mode })
    try {
      await persist(plan.ranges)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the page ranges.')
      return
    }
    const parts = [
      plan.added
        ? `${plural(plan.added, 'range')} added (${plural(plan.addedPages, 'page')}, at most ${rangePages} pages each, cut at chapter starts).`
        : 'Nothing new to add: these pages are already in the list.',
    ]
    if (plan.alreadyRead) parts.push(`${plural(plan.alreadyRead, 'page')} of these were read before and are kept as they are.`)
    if (plan.dropped) parts.push(`${plural(plan.dropped, 'range')} not read yet were taken off the list.`)
    setMessage(parts.join(' '))
  }

  /**
   * @param {number} index
   * @param {BookRange[]} list
   * @param {{ prefix?: string, inRun?: boolean }} [opts]
   */
  async function readAt(index, list, opts = {}) {
    const r = list[index]
    const same = (x) => x.start === r.start && x.end === r.end
    const ctl = new AbortController()
    stopRef.current.ctl = ctl
    const what = solutions ? 'solutions pages' : 'pages'
    setBusy(`${opts.prefix || ''}Reading ${what} ${r.start}-${r.end}…`)
    setPct(2)
    try {
      const saved = await persist(list.map((x, i) => (i === index ? { ...x, status: 'reading' } : x)))
      const live = saved.ranges.find(same) || r
      const prev = saved.ranges.filter((x) => x.end < r.start && x.status === 'done').pop()
      const out = await readOne({
        book: saved,
        range: live,
        before: prev && prev.end === r.start - 1 ? prev : null,
        signal: ctl.signal,
        inRun: Boolean(opts.inRun),
        onProgress: (p, label) => {
          if (Number.isFinite(p)) setPct(Math.max(2, Math.min(99, Number(p))))
          if (label) setBusy(`${opts.prefix || ''}${solutions ? 'Solutions pages' : 'Pages'} ${r.start}-${r.end}: ${label}`)
        },
      })
      const latest = (await getBook(book.id)).ranges
      const done = await persist(latest.map((x) => (same(x) ? { ...x, ...out.patch } : x)))
      return { ...out, saved: done }
    } catch (e) {
      const latest = await getBook(book.id).catch(() => null)
      if (latest) {
        await persist(latest.ranges.map((x) => (same(x) ? { ...x, status: 'failed', note: 'Try again' } : x))).catch(() => {})
      }
      throw e
    } finally {
      stopRef.current.ctl = null
    }
  }

  /** @param {number} index */
  async function onRead(index) {
    if (busy) return
    const r = ranges[index]
    if (!r) return
    if (r.end - r.start + 1 > MAX_RANGE) {
      setError(`Pages ${r.start}-${r.end} is more than ${MAX_RANGE} pages. Press “Cut in two” first.`)
      return
    }
    setError('')
    setMessage('')
    stopRef.current.stopAll = false
    setActive(true)
    try {
      const out = await readAt(index, ranges)
      setMessage(out.message)
      if (out.stop) setError(out.stop)
    } catch (e) {
      setError(isStopped(e, stopRef) ? 'Stopped. Nothing from this range was saved.' : formatOfficialPyqUploadError(e, {}))
    } finally {
      setActive(false)
      setBusy('')
      setPct(0)
    }
  }

  async function onReadAll() {
    if (busy) return
    const todo = ranges.filter((r) => r.status === 'new' || r.status === 'failed')
    if (!todo.length) return
    const tooLong = todo.find((r) => r.end - r.start + 1 > MAX_RANGE)
    if (tooLong) {
      setError(`Pages ${tooLong.start}-${tooLong.end} is more than ${MAX_RANGE} pages. Press “Cut in two” first.`)
      return
    }
    const pages = todo.reduce((n, r) => n + r.end - r.start + 1, 0)
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `Read ${plural(todo.length, 'range')} (${plural(pages, 'page')}) one after another?\n\nEach page is read once by Mathpix. You can press Stop at any time: ranges already read are kept, and “Read all” carries on from where it stopped.`,
      )
    )
      return
    setError('')
    setMessage('')
    stopRef.current.stopAll = false
    let list = ranges
    const tried = new Set()
    /** @type {string[]} */
    const failed = []
    /** @type {string[]} */
    const ids = []
    let read = 0
    let failedInARow = 0
    let stopNote = ''
    setActive(true)
    try {
      for (;;) {
        if (stopRef.current.stopAll) {
          stopNote = 'Stopped. Ranges already read are kept; press “Read all” to carry on.'
          break
        }
        const index = list.findIndex((r) => (r.status === 'new' || r.status === 'failed') && !tried.has(`${r.start}-${r.end}`))
        if (index < 0) break
        const r = list[index]
        tried.add(`${r.start}-${r.end}`)
        try {
          const out = await readAt(index, list, { prefix: `Range ${tried.size} of ${todo.length} · `, inRun: true })
          list = out.saved.ranges
          ids.push(...(out.paperIds || []))
          read += 1
          failedInARow = 0
          if (out.stop) {
            stopNote = `Stopped after pages ${r.start}-${r.end}. ${out.stop}`
            break
          }
        } catch (e) {
          if (isStopped(e, stopRef)) {
            stopNote = `Stopped at pages ${r.start}-${r.end} (nothing from that range was saved). Ranges already read are kept; press “Read all” to carry on.`
            break
          }
          const why = formatOfficialPyqUploadError(e, {})
          failed.push(`${r.start}-${r.end}`)
          failedInARow += 1
          list = (await getBook(book.id).catch(() => null))?.ranges || list
          if (OUTAGE_RE.test(String(e instanceof Error ? e.message : e)) || failedInARow >= 2) {
            stopNote = `Stopped at pages ${r.start}-${r.end}: ${why} Fix that, then press “Read all” again; it carries on from there.`
            break
          }
        }
      }
    } finally {
      setActive(false)
      setBusy('')
      setPct(0)
    }
    if (ids.length || (solutions && read)) onImported?.(ids)
    const summary = `${plural(read, 'range')} read${failed.length ? `; failed: pages ${failed.join(', ')} (press Read on them to try again)` : ''}.`
    if (stopNote) setError(`${stopNote} ${summary}`)
    else setMessage(`All chosen ranges are done: ${summary}`)
  }

  const nextIndex = ranges.findIndex((r) => r.status === 'new' || r.status === 'failed')
  const doneRanges = ranges.filter((r) => r.status === 'done')
  const todoRanges = ranges.filter((r) => r.status === 'new' || r.status === 'failed')
  const todoPages = todoRanges.reduce((n, r) => n + r.end - r.start + 1, 0)
  return (
    <div className="book-ingest-ranges" data-testid={solutions ? 'book-solutions-ranges' : 'book-ranges'}>
      <h3>
        {solutions ? 'Solutions PDF: ' : ''}
        {book.name} · {plural(book.pages, 'page')} · {doneRanges.length} of {plural(ranges.length, 'range')} read
      </h3>
      <p className="form-hint">
        {book.chapterSource === 'bookmarks'
          ? 'Chapters were found from the PDF bookmarks. Long chapters are cut into parts.'
          : book.chapterSource === 'headings'
            ? 'Chapters were found from the “Chapter …” headings on the pages. Long chapters are cut into parts.'
            : `No chapter list in this PDF, so it is cut into ranges of about ${rangePages} pages. Type the chapter name for a range if you know it.`}
        {book.textLayer ? '' : ' (Scanned PDF: page text is read by Mathpix.)'} At most {MAX_RANGE} pages per range.
        {doneRanges.length ? ` Read so far: pages ${describePages(doneRanges)}.` : ''}
      </p>

      <div className="official-pyq-actions">
        <label>
          Pages to read{' '}
          <input
            type="text"
            value={pagesText}
            onChange={(e) => setPagesText(e.target.value)}
            placeholder="e.g. 1-100, 151-175 (or all)"
            disabled={Boolean(busy)}
            style={{ width: '16em' }}
            data-testid={solutions ? 'book-solutions-pages-input' : 'book-pages-input'}
          />
        </label>{' '}
        <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(busy) || !pagesText.trim()} onClick={() => void planPages('add')}>
          Add these pages
        </button>{' '}
        <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(busy) || !pagesText.trim()} onClick={() => void planPages('only')}>
          Read only these pages
        </button>
      </div>
      <p className="form-hint">
        “Add these pages” keeps the ranges already listed; “Read only these pages” takes the not-yet-read ranges off
        first. Pages already read are never read twice. Read a part today and more later, or everything with “Read
        all”: progress is kept.
      </p>

      <table className="official-pyq-facts-table">
        <thead>
          <tr>
            <th>Pages</th>
            <th>Range / chapter</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {ranges.map((r, i) => (
            <tr key={`${r.start}-${r.end}-${i}`} data-testid={solutions ? 'book-solutions-range-row' : 'book-range-row'}>
              <td>
                <input
                  type="number"
                  min={1}
                  max={book.pages}
                  value={r.start}
                  style={{ width: '4.5em' }}
                  disabled={Boolean(busy)}
                  onChange={(e) => editRange(i, { start: Number(e.target.value) || r.start })}
                />
                {' – '}
                <input
                  type="number"
                  min={1}
                  max={book.pages}
                  value={r.end}
                  style={{ width: '4.5em' }}
                  disabled={Boolean(busy)}
                  onChange={(e) => editRange(i, { end: Number(e.target.value) || r.end })}
                />
              </td>
              <td>
                <input
                  type="text"
                  value={r.chapter || ''}
                  placeholder={r.title}
                  disabled={Boolean(busy)}
                  onChange={(e) => editRange(i, { chapter: e.target.value, title: e.target.value || r.title })}
                />
              </td>
              <td>
                {STATUS_LABEL[r.status] || r.status}
                {r.status === 'done' && r.found
                  ? solutions
                    ? ` · ${plural(r.found, 'exercise')}`
                    : ` · ${plural(r.paperIds?.length || 0, 'part')}, ${plural(r.found, 'question')}`
                  : ''}
                {r.note ? <span className="cc-sub"> · {r.note}</span> : null}
              </td>
              <td>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={Boolean(busy) || dirty}
                  title={dirty ? 'Save the page ranges first' : ''}
                  onClick={() => void onRead(i)}
                >
                  {r.status === 'done' ? 'Read again' : 'Read'}
                </button>{' '}
                <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(busy)} onClick={() => splitRange(i)}>
                  Cut in two
                </button>{' '}
                {i + 1 < ranges.length ? (
                  <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(busy)} onClick={() => joinWithNext(i)}>
                    Join with next
                  </button>
                ) : null}{' '}
                {r.status !== 'skipped' ? (
                  <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(busy)} onClick={() => editRange(i, { status: 'skipped' })}>
                    Skip
                  </button>
                ) : (
                  <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(busy)} onClick={() => editRange(i, { status: 'new' })}>
                    Un-skip
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="official-pyq-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={Boolean(busy) || dirty || nextIndex < 0}
          onClick={() => void onRead(nextIndex)}
          data-testid={solutions ? 'book-solutions-read-next' : 'book-read-next'}
        >
          {nextIndex < 0 ? 'All ranges read' : `Read next range (pages ${ranges[nextIndex].start}-${ranges[nextIndex].end})`}
        </button>{' '}
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={Boolean(busy) || dirty || !todoRanges.length}
          title={dirty ? 'Save the page ranges first' : ''}
          onClick={() => void onReadAll()}
          data-testid={solutions ? 'book-solutions-read-all' : 'book-read-all'}
        >
          {todoRanges.length ? `Read all (${plural(todoRanges.length, 'range')}, ${plural(todoPages, 'page')})` : 'Read all'}
        </button>{' '}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={(!dirty && !saveName) || Boolean(busy)}
          onClick={() => void onSaveRanges()}
        >
          Save page ranges
        </button>{' '}
        {active ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              stopRef.current.stopAll = true
              stopRef.current.ctl?.abort()
            }}
          >
            Stop
          </button>
        ) : null}
      </div>
    </div>
  )
}

/** @param {unknown} e @param {{ current: { ctl: AbortController | null, stopAll: boolean } }} stopRef */
function isStopped(e, stopRef) {
  return stopRef.current.stopAll || (e instanceof Error && e.name === 'AbortError')
}

/** @param {{ run: any }} props */
function BookRangeResult({ run }) {
  const kept = run.lateAnswers.filter((a) => !a.applied)
  return (
    <div className="book-ingest-result" data-testid="book-range-result">
      <h3>
        Found in pages {run.range.start}-{run.range.end}
      </h3>
      {run.parts.length ? (
        <ul>
          {run.parts.map((p, i) => (
            <li key={`${p.title}-${i}`}>
              <strong>{p.title}</strong>
              {p.chapter ? <span className="cc-sub"> · {p.chapter}</span> : null}
              {p.error ? (
                <span className="upload-error"> — not saved: {p.error}</span>
              ) : (
                <span>
                  {' '}
                  — {plural(p.count, 'question')}, {p.answered} with the book&apos;s answer
                  {p.kind === 'examples' || p.solved ? `, ${p.solved} with a printed solution` : ''}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="form-hint">No exercise in these pages.</p>
      )}
      {run.lateAnswers.some((a) => a.applied) ? (
        <p className="form-hint">
          Answer keys for exercises read earlier:{' '}
          {run.lateAnswers
            .filter((a) => a.applied)
            .map((a) => `${a.title} → put on “${a.paperLabel}”`)
            .join('; ')}
          .
        </p>
      ) : null}
      {kept.length ? (
        <ul className="form-hint">
          {kept.map((a, i) => (
            <li key={`${a.title}-${i}`}>{solutionWaitingNote(a)}</li>
          ))}
        </ul>
      ) : null}
      {run.keptApplied?.length ? (
        <p className="form-hint">
          Answers and solutions read earlier (later pages or the solutions PDF) put on:{' '}
          {run.keptApplied.map((a) => `${a.title || 'exercise'} → “${a.paperLabel}”`).join('; ')}.
        </p>
      ) : null}
      {run.storeError ? (
        <p className="upload-error">
          Answers for other exercises could not be kept for later ({run.storeError}). Press F5 to restart the app, then read
          these pages again.
        </p>
      ) : null}
      {run.skipped.length ? (
        <p className="form-hint">
          Left out (no questions): {run.skipped.map((s) => s.title).join(', ')}.
        </p>
      ) : null}
    </div>
  )
}

/** @param {{ run: { range: BookRange, blocks: import('../utils/bookSolutions.js').BookSolutionResult[] } }} props */
function SolutionsRangeResult({ run }) {
  return (
    <div className="book-ingest-result" data-testid="book-solutions-result">
      <h3>
        Found in solutions pages {run.range.start}-{run.range.end}
      </h3>
      {run.blocks.length ? (
        <ul>
          {run.blocks.map((b, i) => {
            const ok = b.applied.filter((x) => x.ok)
            const bad = b.applied.filter((x) => !x.ok)
            return (
              <li key={`${b.title}-${i}`}>
                <strong>{b.title || 'No exercise name'}</strong>
                {b.chapter ? <span className="cc-sub"> · {b.chapter}</span> : null}
                {ok.length ? (
                  <span>
                    {' '}
                    — put on {ok.map((x) => `“${x.paperLabel}” (${plural(x.answers, 'answer')}, ${plural(x.solutions, 'solution')})`).join(', ')}
                  </span>
                ) : null}
                {bad.length ? <span className="upload-error"> — {bad.map((x) => `${x.paperLabel}: ${x.error}`).join('; ')}</span> : null}
                {!b.applied.length ? <span className="cc-sub"> — {solutionWaitingNote(b)}</span> : null}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="form-hint">
          No answers or solutions found in these pages. Each one must start with its question number, for example “1. (b)”
          or “Q.1 Sol. …”.
        </p>
      )}
    </div>
  )
}
