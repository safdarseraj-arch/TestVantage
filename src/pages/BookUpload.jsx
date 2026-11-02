import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { uploadBookCached, HYBRID_AI_ROUTE } from '../utils/hybridAiClient.js'

const INGEST_SUBJECTS = [
  'General',
  'Physics',
  'Chemistry',
  'Mathematics',
  'Physical Chemistry',
  'Botany',
  'Zoology',
]

const PROGRESS_STEPS = [
  'Uploading',
  'Caching Context',
  'Processing 5-page window',
  'Cropping Diagrams',
  'Cleared Google Storage Cache',
]

/**
 * Textbook PDF ingest via Hybrid AI cached context (`/api/ingest/book-cached` on 5173).
 */
export default function BookUpload() {
  const [subject, setSubject] = useState('General')
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fileName, setFileName] = useState('')
  const [stepIndex, setStepIndex] = useState(-1)
  const [windowLabel, setWindowLabel] = useState('')
  const [error, setError] = useState('')
  const [doneMessage, setDoneMessage] = useState('')
  const timerRef = useRef(null)

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  useEffect(() => () => clearTimer(), [])

  const simulateProgress = useCallback(() => {
    clearTimer()
    setStepIndex(0)
    setWindowLabel('')
    let tick = 0
    timerRef.current = setInterval(() => {
      tick += 1
      if (tick <= 2) {
        setStepIndex(0)
      } else if (tick === 3) {
        setStepIndex(1)
      } else if (tick >= 4 && tick <= 12) {
        setStepIndex(2)
        const win = Math.min(8, Math.floor((tick - 3) / 2))
        setWindowLabel(`${win}/8`)
      } else if (tick === 13) {
        setStepIndex(3)
      } else if (tick >= 14) {
        setStepIndex(4)
        clearTimer()
      }
    }, 900)
  }, [])

  const ingestFile = async (file) => {
    if (!file || busy) return
    if (!/\.pdf$/i.test(file.name || '')) {
      setError('Please choose a PDF file.')
      return
    }
    setError('')
    setDoneMessage('')
    setBusy(true)
    setFileName(file.name)
    simulateProgress()
    try {
      const data = await uploadBookCached(file, { subject })
      setDoneMessage(
        data.status
          ? `${data.status} — ${data.file_name ?? file.name} (subject: ${data.subject ?? subject}). Processing continues in the background.`
          : 'Ingestion started.',
      )
    } catch (e) {
      clearTimer()
      setStepIndex(-1)
      setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setBusy(false)
    }
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer?.files?.[0]
    if (file) ingestFile(file)
  }

  const progressLine = () => {
    if (stepIndex < 0) return null
    const parts = PROGRESS_STEPS.map((label, i) => {
      if (i < stepIndex) return `${label} ✓`
      if (i === stepIndex) {
        if (i === 2 && windowLabel) return `${label} (${windowLabel})`
        return `${label}…`
      }
      return label
    })
    return parts.join(' → ')
  }

  return (
    <div className="page book-upload-page">
      <header>
        <h1>Book ingest</h1>
        <p className="form-hint">
          TestVantages <strong>Hybrid AI</strong> — upload a textbook PDF for cached-context extraction (
          <code>/api/ingest/book-cached</code>). Diagrams save under <code>static/diagrams/</code>. Also see{' '}
          <Link to={HYBRID_AI_ROUTE}>Hybrid AI batch queue</Link>.
        </p>
      </header>

      <section className="card book-upload-card">
        <label className="metadata-field">
          <span className="metadata-label">Subject (for code-exec routing)</span>
          <select value={subject} disabled={busy} onChange={(e) => setSubject(e.target.value)}>
            {INGEST_SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <div
          className={`book-upload-dropzone${dragOver ? ' drag-over' : ''}${busy ? ' busy' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <p>
            <strong>Drag and drop</strong> a PDF here, or{' '}
            <label className="book-upload-file-label">
              browse
              <input
                type="file"
                accept="application/pdf,.pdf"
                hidden
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) ingestFile(file)
                  e.target.value = ''
                }}
              />
            </label>
          </p>
          <p className="form-hint">Max practical size: under ~50 MB for smooth upload on localhost.</p>
        </div>

        {fileName ? (
          <p className="form-hint">
            File: <strong>{fileName}</strong>
          </p>
        ) : null}

        {progressLine() ? (
          <p className="book-upload-progress form-hint" aria-live="polite">
            {progressLine()}
          </p>
        ) : null}

        {error ? <p className="form-hint parse-status partial">{error}</p> : null}
        {doneMessage ? <p className="form-hint parse-status complete">{doneMessage}</p> : null}
      </section>
    </div>
  )
}
