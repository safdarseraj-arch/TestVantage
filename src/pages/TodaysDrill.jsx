import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ExamPatternCard from '../components/ExamPatternCard'
import { EXAM_PATTERNS } from '../data/examPatterns'
import { useAuth } from '../context/AuthContext'
import { getOwnerKey } from '../utils/attemptHistory'
import {
  buildDrillStanding,
  createOrResumeTodaysDrill,
  getTodaysDrillProgress,
} from '../utils/todaysDrillStore'
import { getOrCreateSparCode } from '../utils/peerPulseStore'

export default function TodaysDrill() {
  const { session } = useAuth()
  const ownerKey = getOwnerKey(session?.userId)
  const navigate = useNavigate()
  const [examPatternId, setExamPatternId] = useState('jee-main')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [bankNote, setBankNote] = useState('')

  useEffect(() => {
    try {
      const note = sessionStorage.getItem('tv-drill-bank-note')
      if (note) {
        setBankNote(note)
        sessionStorage.removeItem('tv-drill-bank-note')
      }
    } catch {
      /* ignore */
    }
  }, [])

  const progress = useMemo(
    () => getTodaysDrillProgress(ownerKey, examPatternId),
    [ownerKey, examPatternId],
  )

  const standing = useMemo(() => {
    if (!progress?.completed || progress.score == null) return null
    return buildDrillStanding({
      score: progress.score,
      maxScore: progress.maxScore || 1,
      userName: session?.name ?? 'You',
      ownerKey,
    })
  }, [progress, session?.name, ownerKey])

  const start = () => {
    setError('')
    setBankNote('')
    setBusy(true)
    try {
      getOrCreateSparCode(ownerKey, { name: session?.name ?? 'Student' })
      const result = createOrResumeTodaysDrill({
        examPatternId,
        userId: session?.userId,
        questionCount: 10,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      if (result.usedFallback) {
        try {
          sessionStorage.setItem(
            'tv-drill-bank-note',
            'Starter pack in use — publish questions in Question Bank for drills from your live bank.',
          )
        } catch {
          /* ignore */
        }
      }
      navigate(`/exam/${result.test.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start Today’s Drill.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page student-portal-page tv-compete-page">
      <header className="tv-compete-hero" style={{ '--tv-accent': '#c2410c' }}>
        <Link to="/prepare" className="insight-page-back">
          ← Prepare centre
        </Link>
        <p className="insight-page-eyebrow">Today’s Drill</p>
        <h1>One mixed set. Every day.</h1>
        <p className="insight-page-lead">
          A short JEE or NEET mix from your published bank — finish it to earn Merit Points and see
          where you stand on today’s board.
        </p>
      </header>

      <section className="card create-section">
        <h2>1. Pick exam</h2>
        <div className="pattern-grid">
          {EXAM_PATTERNS.map((p) => (
            <ExamPatternCard
              key={p.id}
              patternId={p.id}
              selected={examPatternId === p.id}
              onSelect={setExamPatternId}
            />
          ))}
        </div>
      </section>

      <section className="card create-section">
        <h2>2. Start the drill</h2>
        {progress?.completed ? (
          <p className="form-hint">
            Done for today on this exam — score{' '}
            <strong>
              {progress.score}/{progress.maxScore}
            </strong>
            {progress.accuracy != null ? ` · ${progress.accuracy}% accuracy` : ''}. You can still
            re-open Prepare centre for more practice.
          </p>
        ) : progress?.testId ? (
          <p className="form-hint">You have an unfinished drill for today — resume below.</p>
        ) : (
          <p className="form-hint">About 10 mixed questions · timed like a light practice paper.</p>
        )}
        {!progress?.completed && (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={start}>
            {busy ? 'Building…' : progress?.testId ? 'Resume Today’s Drill →' : 'Start Today’s Drill →'}
          </button>
        )}
        {error && <p className="form-error">{error}</p>}
        {bankNote && <p className="form-hint">{bankNote}</p>}
      </section>

      {standing && (
        <section className="card create-section">
          <h2>Today’s standing</h2>
          <p className="form-hint">
            Real finishers of Today’s Drill today
            {standing.total <= 1 ? ' — invite friends via Peer Pulse to fill the board.' : '.'}
          </p>
          <p>
            Rank <strong>#{standing.rank}</strong> of {standing.total}
          </p>
          <ol className="tv-standing-list">
            {standing.board.map((row, i) => (
              <li key={`${row.name}-${i}`} className={row.you ? 'is-you' : undefined}>
                <span>
                  #{i + 1} {row.name}
                  {row.you ? ' (you)' : ''}
                </span>
                <strong>{row.pct}%</strong>
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="form-hint">
        Prefer full control? Use <Link to="/practice">Syllabus Practice</Link> or{' '}
        <Link to="/prepare">Prepare centre</Link>.
      </p>
    </div>
  )
}
