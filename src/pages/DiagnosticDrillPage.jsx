import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import PreparePageHero from '../components/PreparePageHero'
import { useAuth } from '../context/AuthContext'
import {
  createDiagnosticDrillSession,
  diagnosticDrillLabel,
  listDiagnosticDrillPool,
} from '../utils/diagnosticDrillSets.js'

/**
 * High-mistake or High-skip category — Practice (self-paced) or Take test (timed).
 * @param {{ kind: 'high_mistake' | 'high_skip' }} props
 */
export function HighMistakeQuestionsPage() {
  return <DiagnosticDrillPage kind="high_mistake" />
}

export function HighSkipQuestionsPage() {
  return <DiagnosticDrillPage kind="high_skip" />
}

export default function DiagnosticDrillPage({ kind }) {
  const drillKind = kind === 'high_skip' ? 'high_skip' : 'high_mistake'
  const modeId = drillKind === 'high_skip' ? 'high-skip' : 'high-mistake'
  const { session } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(/** @type {'' | 'practice' | 'test'} */ (''))
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)

  const pool = useMemo(
    () => listDiagnosticDrillPool(drillKind, { userId: session?.userId }),
    [drillKind, session?.userId, tick],
  )

  const label = diagnosticDrillLabel(drillKind)
  const otherTo = drillKind === 'high_skip' ? '/high-mistake' : '/high-skip'
  const otherLabel = drillKind === 'high_skip' ? 'High mistake' : 'High skip'

  const start = (mode) => {
    if (busy) return
    setError('')
    setBusy(mode)
    try {
      const created = createDiagnosticDrillSession({
        kind: drillKind,
        mode,
        userId: session?.userId,
      })
      if (!created.ok || !created.test?.id) {
        setError(created.error || 'Could not start this set.')
        setBusy('')
        return
      }
      navigate(`/exam/${created.test.id}`)
    } catch {
      setError('Could not start this set. Try again.')
      setBusy('')
    }
  }

  return (
    <div className="page prepare-mode-page diagnostic-drill-page" data-testid={`diagnostic-drill-${modeId}`}>
      <PreparePageHero
        modeId={modeId}
        lead={
          drillKind === 'high_skip'
            ? 'Questions classmates leave blank most often. Practice them calmly, or take a timed test when you want exam pressure.'
            : 'Questions classmates get wrong most often. Practice them calmly, or take a timed test when you want exam pressure.'
        }
        actions={
          <>
            <Link to={otherTo} className="btn btn-ghost btn-sm">
              {otherLabel}
            </Link>
            <Link to="/prepare" className="btn btn-ghost btn-sm">
              Practice Hub
            </Link>
            <Link to="/my-results" className="btn btn-ghost btn-sm">
              My Results
            </Link>
          </>
        }
      />

      <section className="card create-section">
        <h2>
          {label} set · {pool.count} question{pool.count === 1 ? '' : 's'}
        </h2>
        <p className="form-hint" style={{ marginTop: 0 }}>
          {pool.ready
            ? pool.source === 'personal'
              ? 'Built from your own attempts (wrong / skip rates). Classmate lists appear when more people finish the same papers.'
              : 'Built from High-mistake / High-skip signals across finished attempts on this device.'
            : pool.emptyHint}
        </p>
        {!pool.ready ? (
          <div className="official-pyq-actions" style={{ marginTop: '0.75rem' }}>
            <Link to="/tests" className="btn btn-primary btn-sm">
              Take a mock
            </Link>
            <Link to="/practice" className="btn btn-ghost btn-sm">
              Syllabus Practice
            </Link>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTick((n) => n + 1)}>
              Refresh list
            </button>
          </div>
        ) : (
          <>
            <ul className="form-hint" style={{ margin: '0.75rem 0', paddingLeft: '1.15rem' }}>
              {pool.rows.slice(0, 12).map((row) => (
                <li key={row.questionId}>
                  {row.index != null ? `Q${row.index}` : 'Question'}
                  {row.subject ? ` · ${row.subject}` : ''}
                  {row.chapter ? ` · ${row.chapter}` : ''}
                  {drillKind === 'high_skip'
                    ? row.skipPct != null
                      ? ` · skip ${row.skipPct}%`
                      : ''
                    : row.mistakePct != null
                      ? ` · mistake ${row.mistakePct}%`
                      : ''}
                </li>
              ))}
              {pool.rows.length > 12 ? <li>…and {pool.rows.length - 12} more</li> : null}
            </ul>
            <div className="official-pyq-actions" style={{ marginTop: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                data-testid="diagnostic-drill-practice"
                disabled={Boolean(busy)}
                onClick={() => start('practice')}
              >
                {busy === 'practice' ? 'Starting…' : 'Practice'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                data-testid="diagnostic-drill-test"
                disabled={Boolean(busy)}
                onClick={() => start('test')}
              >
                {busy === 'test' ? 'Starting…' : 'Take test'}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTick((n) => n + 1)}>
                Refresh list
              </button>
            </div>
            <p className="form-hint" style={{ marginTop: '0.65rem' }}>
              <strong>Practice</strong> = self-paced · <strong>Take test</strong> = timed paper of the same set.
            </p>
          </>
        )}
        {error ? (
          <p className="upload-error" role="alert" style={{ marginTop: '0.75rem' }}>
            {error}
          </p>
        ) : null}
      </section>
    </div>
  )
}
