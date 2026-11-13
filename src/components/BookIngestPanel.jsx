import { useCallback, useEffect, useRef, useState } from 'react'
import { OFFICIAL_PYQ_EXAMS } from '../data/officialPyqSources'
import {
  deleteBook,
  getBook,
  importBookRange,
  listBooks,
  saveBookRanges,
  uploadBook,
} from '../utils/bookRangeImport.js'
import { formatOfficialPyqUploadError } from '../utils/pyqGeminiExtract.js'

const RANGE_SIZES = [10, 15, 20, 25, 30]
const MAX_RANGE = 40

/** Range titles made from page numbers are renamed when the range is cut or joined. */
const isPageTitle = (title) => !String(title || '').trim() || /^Pages \d+-\d+( \([ab]\))*$/.test(String(title).trim())
const STATUS_LABEL = { new: 'Not read', reading: 'Reading…', done: 'Read', skipped: 'Skipped', failed: 'Failed' }

/** @param {number} n */
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/**
 * Book / question bank PDF: upload the whole file once, check the page ranges, then read one
 * range at a time. Each exercise found becomes a paper in the list below this panel.
 * @param {{ onImported?: (paperIds: string[]) => void }} props
 */
export default function BookIngestPanel({ onImported }) {
  const [books, setBooks] = useState(/** @type {import('../utils/bookRangeImport.js').StoredBook[]} */ ([]))
  const [book, setBook] = useState(/** @type {import('../utils/bookRangeImport.js').StoredBook | null} */ (null))
  const [ranges, setRanges] = useState(/** @type {import('../utils/bookRangeImport.js').BookRange[]} */ ([]))
  const [dirty, setDirty] = useState(false)
  const [name, setName] = useState('')
  const [rangePages, setRangePages] = useState(20)
  const [exam, setExam] = useState(/** @type {'jee-main' | 'jee-advanced' | 'neet'} */ ('jee-main'))
  const [busy, setBusy] = useState('')
  const [pct, setPct] = useState(0)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [lastRun, setLastRun] = useState(/** @type {any} */ (null))
  const abortRef = useRef(/** @type {AbortController | null} */ (null))

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

  const openBook = useCallback((b) => {
    setBook(b)
    setRanges(b?.ranges || [])
    setDirty(false)
    setLastRun(null)
    setName(b?.name || '')
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
      openBook(b)
      await refreshBooks()
      setMessage(
        b.existing
          ? `“${b.name}” was uploaded before. Its page ranges and progress are kept.`
          : `“${b.name}” is stored (${plural(b.pages, 'page')}). Check the page ranges below, then read them one at a time.`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setBusy('')
    }
  }

  /** @param {number} index @param {Partial<import('../utils/bookRangeImport.js').BookRange>} patch */
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

  /** @param {import('../utils/bookRangeImport.js').BookRange[]} next */
  async function persist(next) {
    if (!book) return null
    const saved = await saveBookRanges(book.id, next, name.trim() && name.trim() !== book.name ? name.trim() : undefined)
    setBook(saved)
    setRanges(saved.ranges)
    setDirty(false)
    return saved
  }

  async function onSaveRanges() {
    setError('')
    try {
      await persist(ranges)
      setMessage('Page ranges saved.')
      void refreshBooks()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the page ranges.')
    }
  }

  /** @param {number} index */
  async function readRange(index) {
    if (!book || busy) return
    let list = ranges
    const r = list[index]
    if (!r) return
    if (r.end - r.start + 1 > MAX_RANGE) {
      setError(`Pages ${r.start}-${r.end} is more than ${MAX_RANGE} pages. Press “Cut in two” first.`)
      return
    }
    const ctl = new AbortController()
    abortRef.current = ctl
    setError('')
    setMessage('')
    setLastRun(null)
    setBusy(`Reading pages ${r.start}-${r.end}…`)
    setPct(2)
    try {
      list = list.map((x, i) => (i === index ? { ...x, status: 'reading' } : x))
      const saved = await persist(list)
      const live = saved?.ranges?.find((x) => x.start === r.start && x.end === r.end) || r
      const before = (saved?.ranges || list).filter((x) => x.end < r.start && x.status === 'done').pop()
      const { uploadOfficialPyqOriginal } = await import('../utils/officialPyqOriginalCompare.js')
      const result = await importBookRange({
        book: saved || book,
        range: live,
        exam,
        continues: before && before.end === r.start - 1 ? before.lastExercise : undefined,
        storeOriginal: (paperId, file) => uploadOfficialPyqOriginal(paperId, file),
        signal: ctl.signal,
        onProgress: (p, label) => {
          if (Number.isFinite(p)) setPct(Math.max(2, Math.min(99, Number(p))))
          if (label) setBusy(`Pages ${r.start}-${r.end}: ${label}`)
        },
      })
      const ids = result.parts.map((p) => p.paperId).filter(Boolean)
      const latest = (await getBook(book.id)).ranges
      await persist(
        latest.map((x) =>
          x.start === r.start && x.end === r.end
            ? {
                ...x,
                status: ids.length || result.lateAnswers.length ? 'done' : 'skipped',
                paperIds: ids,
                found: result.parts.reduce((n, p) => n + p.count, 0),
                lastExercise: result.lastExercise || (before && before.end === r.start - 1 ? before.lastExercise : ''),
                note: ids.length ? '' : 'No exercise found (theory pages)',
              }
            : x,
        ),
      )
      setLastRun({ range: r, ...result })
      if (ids.length) onImported?.(ids)
      setMessage(
        ids.length
          ? `Pages ${r.start}-${r.end}: ${plural(ids.length, 'part')} added to the list below (${plural(result.parts.reduce((n, p) => n + p.count, 0), 'question')}). Review each one like a paper.`
          : `Pages ${r.start}-${r.end}: no exercise found, only theory. Nothing was added.`,
      )
    } catch (e) {
      const latest = await getBook(book.id).catch(() => null)
      if (latest) {
        await persist(
          latest.ranges.map((x) => (x.start === r.start && x.end === r.end ? { ...x, status: 'failed', note: 'Try again' } : x)),
        ).catch(() => {})
      }
      setError(ctl.signal.aborted ? 'Stopped. Nothing from this range was saved.' : formatOfficialPyqUploadError(e, {}))
    } finally {
      abortRef.current = null
      setBusy('')
      setPct(0)
    }
  }

  const nextIndex = ranges.findIndex((r) => r.status === 'new' || r.status === 'failed')
  const doneCount = ranges.filter((r) => r.status === 'done').length

  async function onDeleteBook() {
    if (!book) return
    if (typeof window !== 'undefined' && !window.confirm(`Remove “${book.name}” from this computer? Papers already made from it stay in the list.`)) return
    try {
      await deleteBook(book.id)
      openBook(null)
      await refreshBooks()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove the book.')
    }
  }

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
            onChange={(e) => {
              setName(e.target.value)
              if (book) setDirty(true)
            }}
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
          <select value={rangePages} onChange={(e) => setRangePages(Number(e.target.value))} disabled={Boolean(book)}>
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
        {books.length ? (
          <label>
            Or open a stored book{' '}
            <select
              value={book?.id || ''}
              onChange={(e) => openBook(books.find((b) => b.id === e.target.value) || null)}
              disabled={Boolean(busy)}
              data-testid="book-select"
            >
              <option value="">— choose —</option>
              {books.map((b) => (
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
        <div className="book-ingest-ranges" data-testid="book-ranges">
          <h3>
            {book.name} · {plural(book.pages, 'page')} · {doneCount} of {plural(ranges.length, 'range')} read
          </h3>
          <p className="form-hint">
            {book.chapterSource === 'bookmarks'
              ? 'Chapters were found from the PDF bookmarks. Long chapters are cut into parts.'
              : book.chapterSource === 'headings'
                ? 'Chapters were found from the “Chapter …” headings on the pages. Long chapters are cut into parts.'
                : `No chapter list in this PDF, so it is cut into ranges of about ${rangePages} pages. Type the chapter name for a range if you know it.`}
            {book.textLayer ? '' : ' (Scanned book: page text is read by Mathpix.)'} At most {MAX_RANGE} pages per range.
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
                <tr key={`${r.start}-${r.end}-${i}`} data-testid="book-range-row">
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
                    {r.status === 'done' && r.found ? ` · ${plural(r.paperIds?.length || 0, 'part')}, ${plural(r.found, 'question')}` : ''}
                    {r.note ? <span className="cc-sub"> · {r.note}</span> : null}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={Boolean(busy) || dirty}
                      title={dirty ? 'Save the page ranges first' : ''}
                      onClick={() => void readRange(i)}
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
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={Boolean(busy)}
                        onClick={() => editRange(i, { status: 'skipped' })}
                      >
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
              onClick={() => void readRange(nextIndex)}
              data-testid="book-read-next"
            >
              {nextIndex < 0 ? 'All ranges read' : `Read next range (pages ${ranges[nextIndex].start}-${ranges[nextIndex].end})`}
            </button>{' '}
            <button type="button" className="btn btn-ghost btn-sm" disabled={!dirty || Boolean(busy)} onClick={() => void onSaveRanges()}>
              Save page ranges
            </button>{' '}
            {busy && abortRef.current ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => abortRef.current?.abort()}>
                Stop
              </button>
            ) : null}{' '}
            <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(busy)} onClick={() => void onDeleteBook()}>
              Remove book file
            </button>
          </div>
          {busy ? (
            <p className="official-pyq-progress" role="status">
              {busy} {Math.round(pct)}%
            </p>
          ) : null}
          {lastRun ? <BookRangeResult run={lastRun} /> : null}
        </div>
      ) : null}
    </section>
  )
}

/** @param {{ run: any }} props */
function BookRangeResult({ run }) {
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
      {run.lateAnswers.length ? (
        <p className="form-hint">
          Answer keys for exercises read earlier:{' '}
          {run.lateAnswers
            .map((a) => (a.applied ? `${a.title} → put on “${a.paperLabel}”` : `${a.title} (no matching exercise yet)`))
            .join('; ')}
          .
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
