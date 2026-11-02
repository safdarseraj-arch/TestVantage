import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import PreparePageHero from '../components/PreparePageHero'
import { useAuth } from '../context/AuthContext'
import { EXAM_PATTERNS } from '../data/examPatterns'
import { getSubjectsForPattern } from '../data/subjects'
import { getOwnerKey } from '../utils/attemptHistory'
import { downloadTextFile } from '../utils/csvQuestions'
import {
  buildDailySheetHtml,
  createOrResumeDailySheet,
  listSheetChapters,
} from '../utils/dailyPracticeSheet'

const COUNTS = [6, 8, 10, 12]

export default function DailyPracticeSheet() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const ownerKey = getOwnerKey(session?.userId)
  const [examId, setExamId] = useState('jee-main')
  const [subject, setSubject] = useState('')
  const [chapter, setChapter] = useState('')
  const [count, setCount] = useState(8)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const subjects = useMemo(() => getSubjectsForPattern(examId), [examId])
  const chapters = useMemo(() => listSheetChapters(examId, subject), [examId, subject])

  const start = (andPrint) => {
    setError('')
    setNote('')
    setBusy(true)
    try {
      const result = createOrResumeDailySheet({
        examPatternId: examId,
        userId: session?.userId ?? ownerKey,
        subject,
        chapter,
        questionCount: count,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      if (result.usedFallback) {
        setNote('Starter pack in use — publish questions in Question Bank for sheets from your live bank.')
      }
      if (andPrint) {
        const html = buildDailySheetHtml(result.test)
        downloadTextFile('testvantage-daily-sheet.html', html, 'text/html', { skipWatermark: true })
        window.setTimeout(() => window.print(), 120)
        return
      }
      navigate(`/exam/${result.test.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build today’s sheet.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page prepare-mode-page daily-sheet-page">
      <PreparePageHero
        modeId="daily-sheet"
        lead="A dated chapter sheet from your bank — like a class DPP. Print it, or attempt it here. Today’s Drill stays the mixed compete set."
        actions={
          <>
            <Link to="/todays-drill" className="btn btn-ghost btn-sm">
              Today’s Drill
            </Link>
            <Link to="/daily-target" className="btn btn-ghost btn-sm">
              Today’s Target
            </Link>
          </>
        }
      />

      <section className="card create-section">
        <h2>Exam</h2>
        <div className="qr-subject-row">
          {EXAM_PATTERNS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`qr-chip${examId === p.id ? ' is-active' : ''}`}
              onClick={() => {
                setExamId(p.id)
                setSubject('')
                setChapter('')
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
      </section>

      <section className="card create-section">
        <h2>Subject and chapter</h2>
        <p className="form-hint">Leave both on All for a mixed sheet. Pick a chapter after class for a true DPP.</p>
        <div className="qr-subject-row" style={{ marginBottom: '0.75rem' }}>
          <button
            type="button"
            className={`qr-chip${!subject ? ' is-active' : ''}`}
            onClick={() => {
              setSubject('')
              setChapter('')
            }}
          >
            All subjects
          </button>
          {subjects.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`qr-chip${subject === s.id ? ' is-active' : ''}`}
              onClick={() => {
                setSubject(s.id)
                setChapter('')
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="qr-subject-row">
          <button
            type="button"
            className={`qr-chip${!chapter ? ' is-active' : ''}`}
            onClick={() => setChapter('')}
          >
            All chapters
          </button>
          {chapters.map((ch) => (
            <button
              key={ch}
              type="button"
              className={`qr-chip${chapter === ch ? ' is-active' : ''}`}
              onClick={() => setChapter(ch)}
            >
              {ch}
            </button>
          ))}
        </div>
      </section>

      <section className="card create-section">
        <h2>How many questions</h2>
        <div className="qr-subject-row">
          {COUNTS.map((n) => (
            <button
              key={n}
              type="button"
              className={`qr-chip${count === n ? ' is-active' : ''}`}
              onClick={() => setCount(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </section>

      {error ? <p className="form-error">{error}</p> : null}
      {note ? <p className="form-hint">{note}</p> : null}

      <div className="qr-toolbar-actions" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => start(false)}>
          {busy ? 'Building…' : 'Attempt today’s sheet →'}
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => start(true)}>
          Download / print sheet
        </button>
      </div>
      <p className="form-hint">
        Print opens Save as PDF. The TestVantages name is on the sheet. Answers are not printed — take the test here for analysis.
      </p>
    </div>
  )
}