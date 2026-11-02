import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import PreparePageHero from '../components/PreparePageHero'
import { useAuth } from '../context/AuthContext'
import { EXAM_PATTERNS } from '../data/examPatterns'
import { getOwnerKey } from '../utils/attemptHistory'
import {
  createPlacementCheck,
  getLastPlacement,
  lockPlacementAsTodaysTarget,
  summarizePlacementAttempt,
} from '../utils/placementCheck'

export default function PlacementCheck() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const ownerKey = getOwnerKey(session?.userId)
  const [examId, setExamId] = useState('jee-main')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [locked, setLocked] = useState(false)

  const last = useMemo(() => getLastPlacement(ownerKey), [ownerKey])
  const summary = useMemo(
    () => (last?.testId ? summarizePlacementAttempt(ownerKey, last.testId) : null),
    [ownerKey, last?.testId],
  )

  const start = () => {
    setError('')
    setBusy(true)
    try {
      const result = createPlacementCheck({
        examPatternId: examId,
        userId: session?.userId ?? ownerKey,
        questionCount: 15,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      navigate(`/exam/${result.test.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start placement check.')
    } finally {
      setBusy(false)
    }
  }

  const lockTarget = () => {
    if (!summary?.weakChapters?.length) return
    lockPlacementAsTodaysTarget(ownerKey, last?.examPatternId || examId, summary.weakChapters)
    setLocked(true)
  }

  return (
    <div className="page prepare-mode-page placement-check-page">
      <PreparePageHero
        modeId="placement-check"
        lead="A short mixed paper to see where you stand. After you finish, we suggest three weak chapters for Today’s Target. This is not a fee-scholarship test."
        actions={
          <>
            <Link to="/daily-target" className="btn btn-ghost btn-sm">
              Today’s Target
            </Link>
            <Link to="/mock-test" className="btn btn-ghost btn-sm">
              Full mock
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
              onClick={() => setExamId(p.id)}
            >
              {p.name}
            </button>
          ))}
        </div>
        <p className="form-hint">About 15 mixed questions. About 25–30 minutes.</p>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={start}>
          {busy ? 'Building…' : 'Start placement check →'}
        </button>
        {error ? <p className="form-error">{error}</p> : null}
      </section>

      {summary ? (
        <section className="card create-section">
          <h2>Last check</h2>
          <p className="tv-merit-stat">
            <span>Score</span>
            <strong>
              {summary.score ?? '—'} / {summary.maxScore ?? '—'}
            </strong>
          </p>
          {summary.subjects.length ? (
            <ul className="tv-stat-list">
              {summary.subjects.map((s) => (
                <li key={s.subject}>
                  <span>{s.subject}</span>
                  <strong>
                    {s.correct}/{s.total} · {s.accuracy}%
                  </strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="form-hint">Finish the paper and come back here for the subject split.</p>
          )}
          {summary.weakChapters.length ? (
            <>
              <h3 style={{ marginTop: '1rem' }}>Suggested backlog</h3>
              <ul className="tv-stat-list">
                {summary.weakChapters.map((c) => (
                  <li key={c.chapter}>
                    <span>{c.chapter}</span>
                    <strong>{c.accuracy}%</strong>
                  </li>
                ))}
              </ul>
              <button type="button" className="btn btn-ghost" onClick={lockTarget}>
                {locked ? 'Locked into Today’s Target' : 'Use these for Today’s Target'}
              </button>
              {locked ? (
                <p className="form-hint">
                  Open <Link to="/daily-target">Today’s Target</Link> and start the 25-question drill.
                </p>
              ) : null}
            </>
          ) : null}
        </section>
      ) : (
        <p className="form-hint">No finished placement check yet on this login.</p>
      )}
    </div>
  )
}