import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getOwnerKey } from '../utils/attemptHistory'
import {
  STRIDE_BADGES,
  refreshStrideBadges,
  setFocusGoal,
} from '../utils/meritStrideStore'
import { getOrCreateSparCode } from '../utils/peerPulseStore'

export default function MeritStride() {
  const { session } = useAuth()
  const ownerKey = getOwnerKey(session?.userId)
  const [goalDraft, setGoalDraft] = useState(null)
  const [tick, setTick] = useState(0)

  const state = useMemo(() => {
    void tick
    getOrCreateSparCode(ownerKey, { name: session?.name ?? 'Student' })
    return refreshStrideBadges(ownerKey)
  }, [ownerKey, session?.name, tick])

  const focusPct = Math.min(
    100,
    Math.round((state.focusEarnedToday / Math.max(1, state.focusGoal)) * 100),
  )

  return (
    <div className="page student-portal-page tv-compete-page">
      <header className="tv-compete-hero" style={{ '--tv-accent': '#7c3aed' }}>
        <Link to="/prepare" className="insight-page-back">
          ← Prepare centre
        </Link>
        <p className="insight-page-eyebrow">Merit Stride</p>
        <h1>Merit Points · Stride Badges · Focus Goals</h1>
        <p className="insight-page-lead">
          Earn Merit Points from practice and tests, unlock Stride Badges, and hit a daily Focus
          Goal — steady progress beyond a simple streak.
        </p>
      </header>

      <section className="card create-section tv-merit-hero-card">
        <div className="tv-merit-stat">
          <span>Merit Points</span>
          <strong>{state.meritPoints}</strong>
        </div>
        <div className="tv-merit-stat">
          <span>Focus today</span>
          <strong>
            {state.focusEarnedToday} / {state.focusGoal}
          </strong>
        </div>
        <div className="tv-focus-bar" aria-hidden>
          <span style={{ width: `${focusPct}%` }} />
        </div>
        <p className="form-hint">
          {state.focusEarnedToday >= state.focusGoal
            ? 'Focus Goal hit — nice work. Keep a light drill going if you like.'
            : `${state.focusGoal - state.focusEarnedToday} Merit Points left for today’s Focus Goal.`}
        </p>
      </section>

      <section className="card create-section">
        <h2>Focus Goal</h2>
        <form
          className="tv-inline-form"
          onSubmit={(e) => {
            e.preventDefault()
            const next = Number(goalDraft ?? state.focusGoal)
            setFocusGoal(ownerKey, next)
            setGoalDraft(null)
            setTick((t) => t + 1)
          }}
        >
          <label>
            Daily target (Merit Points)
            <input
              type="number"
              min={10}
              max={100}
              value={goalDraft ?? state.focusGoal}
              onChange={(e) => setGoalDraft(e.target.value)}
            />
          </label>
          <button type="submit" className="btn btn-primary">
            Save goal
          </button>
        </form>
      </section>

      <section className="card create-section">
        <h2>Stride Badges</h2>
        <div className="tv-badge-grid">
          {STRIDE_BADGES.map((badge) => {
            const earned = state.badges.includes(badge.id)
            return (
              <div key={badge.id} className={`tv-badge-card ${earned ? 'is-earned' : ''}`}>
                <strong>{badge.title}</strong>
                <p>{badge.desc}</p>
                <span>{earned ? 'Earned' : 'Locked'}</span>
              </div>
            )
          })}
        </div>
      </section>

      <section className="card create-section">
        <h2>Recent Merit</h2>
        {state.history.length === 0 ? (
          <p className="form-hint">
            Finish <Link to="/todays-drill">Today’s Drill</Link> or any practice/test to start earning.
          </p>
        ) : (
          <ul className="tv-stat-list">
            {state.history.slice(0, 8).map((h, i) => (
              <li key={`${h.at}-${i}`}>
                <span>{h.reason}</span>
                <strong>+{h.points}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
