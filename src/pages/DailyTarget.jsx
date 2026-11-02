import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import PreparePageHero from '../components/PreparePageHero'
import { useAuth } from '../context/AuthContext'
import { EXAM_PATTERNS } from '../data/examPatterns'
import { getOwnerKey } from '../utils/attemptHistory'
import { savePracticePrefill } from '../utils/aiMastery.js'
import {
  DAILY_GOAL_CHOICES,
  dailyTargetProgress,
  saveDailyTarget,
  suggestBacklogChapters,
} from '../utils/meritStrideStore'

export default function DailyTarget() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const ownerKey = getOwnerKey(session?.userId)
  const [tick, setTick] = useState(0)

  const suggested = useMemo(() => suggestBacklogChapters(ownerKey), [ownerKey, tick])
  const progress = useMemo(() => dailyTargetProgress(ownerKey), [ownerKey, tick])
  const { target, done, goal, remaining, pct, hit } = progress

  const applySuggested = () => {
    saveDailyTarget(ownerKey, {
      examId: target.examId,
      goalQuestions: target.goalQuestions,
      chapters: suggested,
    })
    setTick((t) => t + 1)
  }

  const startPractice = () => {
    const chapters = (target.chapters ?? []).map((c) => c.chapter).filter(Boolean)
    savePracticePrefill({ chapters, examPatternId: target.examId })
    navigate('/practice')
  }

  return (
    <div className="page prepare-mode-page daily-target-page">
      <PreparePageHero
        modeId="daily-target"
        lead="Pick up to three weak chapters from your attempts, set a question count, and drill them in Syllabus Practice. Today’s Drill stays a mixed habit set — this page is the backlog clearer."
        actions={
          <>
            <Link to="/todays-drill" className="btn btn-ghost btn-sm">
              Today’s Drill
            </Link>
            <Link to="/form-forecast" className="btn btn-ghost btn-sm">
              Revision Ladder
            </Link>
          </>
        }
      />

      <section className="card create-section">
        <h2>Today’s progress</h2>
        <p className="tv-merit-stat" style={{ marginBottom: '0.75rem' }}>
          <span>Questions on target chapters</span>
          <strong>
            {done} / {goal}
          </strong>
        </p>
        <div className="tv-focus-bar" aria-hidden>
          <span style={{ width: `${pct}%` }} />
        </div>
        <p className="form-hint">
          {hit
            ? 'Target hit — nice work. Keep a light CDF or formula pin if you like.'
            : remaining
              ? `${remaining} questions left on your chosen chapters.`
              : 'Set chapters below, then start practice.'}
        </p>
      </section>

      <section className="card create-section">
        <h2>Exam &amp; count</h2>
        <div className="qr-subject-row" style={{ marginBottom: '1rem' }}>
          {EXAM_PATTERNS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`qr-chip${target.examId === p.id ? ' is-active' : ''}`}
              onClick={() => {
                saveDailyTarget(ownerKey, { examId: p.id })
                setTick((t) => t + 1)
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
        <p className="form-hint">How many questions on those chapters today?</p>
        <div className="qr-subject-row">
          {DAILY_GOAL_CHOICES.map((n) => (
            <button
              key={n}
              type="button"
              className={`qr-chip${target.goalQuestions === n ? ' is-active' : ''}`}
              onClick={() => {
                saveDailyTarget(ownerKey, { goalQuestions: n })
                setTick((t) => t + 1)
              }}
            >
              {n} questions
            </button>
          ))}
        </div>
      </section>

      <section className="card create-section">
        <h2>Backlog chapters</h2>
        {suggested.length === 0 ? (
          <p className="form-hint">
            Finish a mock or practice first so we can see weak chapters.{' '}
            <Link to="/mock-test">Build a mock</Link> or open{' '}
            <Link to="/form-forecast">Form Forecast</Link>.
          </p>
        ) : (
          <>
            <ul className="tv-stat-list">
              {suggested.map((c) => (
                <li key={c.chapter}>
                  <span>{c.chapter}</span>
                  <strong>{c.accuracy}%</strong>
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn-ghost" onClick={applySuggested}>
              Use these 3 as today’s backlog
            </button>
          </>
        )}
        {target.chapters?.length > 0 && (
          <p className="form-hint" style={{ marginTop: '0.75rem' }}>
            Locked in: {target.chapters.map((c) => c.chapter).join(' · ')}
          </p>
        )}
      </section>

      <div className="qr-toolbar-actions" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!target.chapters?.length}
          onClick={startPractice}
        >
          Start syllabus practice →
        </button>
        <Link to="/cdf-test" className="btn btn-ghost">
          CDF sprint
        </Link>
        <Link to="/quick-revision" className="btn btn-ghost">
          Quick Revision
        </Link>
      </div>
    </div>
  )
}
