import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getOwnerKey } from '../utils/attemptHistory'
import { getOrCreateSparCode } from '../utils/peerPulseStore'
import {
  createStudyCircle,
  getCircleLeaderboard,
  joinStudyCircleAsync,
  listMyStudyCircles,
  refreshMyStudyCircles,
} from '../utils/studyCircleStore'

export default function StudyCircle() {
  const { session } = useAuth()
  const ownerKey = getOwnerKey(session?.userId)
  const displayName = session?.name ?? 'Student'
  const [title, setTitle] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [activeCode, setActiveCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      getOrCreateSparCode(ownerKey, { name: displayName })
      await refreshMyStudyCircles(ownerKey)
      if (!cancelled) setTick((t) => t + 1)
    })()
    return () => {
      cancelled = true
    }
  }, [ownerKey, displayName])

  const mine = useMemo(() => {
    void tick
    getOrCreateSparCode(ownerKey, { name: displayName })
    return listMyStudyCircles(ownerKey)
  }, [ownerKey, displayName, tick])

  const board = useMemo(() => {
    void tick
    if (!activeCode) return []
    return getCircleLeaderboard(activeCode)
  }, [activeCode, tick])

  const onCreate = (e) => {
    e.preventDefault()
    setError('')
    const circle = createStudyCircle({
      ownerKey,
      name: displayName,
      title: title || 'Study Circle',
    })
    setActiveCode(circle.code)
    setTitle('')
    setTick((t) => t + 1)
  }

  const onJoin = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const result = await joinStudyCircleAsync({
        code: joinCode,
        ownerKey,
        name: displayName,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setActiveCode(result.circle.code)
      setJoinCode('')
      setTick((t) => t + 1)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page student-portal-page tv-compete-page">
      <header className="tv-compete-hero" style={{ '--tv-accent': '#1d4ed8' }}>
        <Link to="/prepare" className="insight-page-back">
          ← Prepare centre
        </Link>
        <p className="insight-page-eyebrow">Study Circle</p>
        <h1>Peer rooms with a Cohort Code</h1>
        <p className="insight-page-lead">
          Create or join a small competition room — member leaderboard synced across devices when
          the app server is running. School Management stays separate for teachers.
        </p>
      </header>

      <section className="card create-section">
        <h2>Create a circle</h2>
        <form className="tv-inline-form" onSubmit={onCreate}>
          <label>
            Circle name
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. JEE evening squad"
              maxLength={48}
            />
          </label>
          <button type="submit" className="btn btn-primary">
            Create · get Cohort Code
          </button>
        </form>
      </section>

      <section className="card create-section">
        <h2>Join with Cohort Code</h2>
        <form className="tv-inline-form" onSubmit={onJoin}>
          <label>
            Cohort Code
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="6-character code"
              maxLength={8}
              autoComplete="off"
              disabled={busy}
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Joining…' : 'Join circle'}
          </button>
        </form>
        {error && <p className="form-error">{error}</p>}
      </section>

      <section className="card create-section">
        <h2>Your circles</h2>
        {mine.length === 0 ? (
          <p className="form-hint">No circles yet — create one or join a friend’s Cohort Code.</p>
        ) : (
          <ul className="tv-circle-list">
            {mine.map((c) => (
              <li key={c.code}>
                <button
                  type="button"
                  className={activeCode === c.code ? 'is-active' : undefined}
                  onClick={() => setActiveCode(c.code)}
                >
                  <strong>{c.title}</strong>
                  <span>Code {c.code}</span>
                  <span>
                    {c.members.length} member{c.members.length === 1 ? '' : 's'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {activeCode && (
        <section className="card create-section">
          <h2>Member board · {activeCode}</h2>
          <p className="form-hint">
            Ranked by Merit Points, then today’s score. Members should open Peer Pulse or Merit
            Stride once so stats publish.
          </p>
          {board.length === 0 ? (
            <p className="form-hint">No members yet.</p>
          ) : (
            <ol className="tv-standing-list">
              {board.map((row, i) => (
                <li key={`${row.sparCode}-${i}`}>
                  <span>
                    #{i + 1} {row.name}
                  </span>
                  <strong>
                    {row.meritPoints} MP · {row.streak}d · {row.accuracy}%
                  </strong>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </div>
  )
}
