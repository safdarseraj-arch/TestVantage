import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getOwnerKey } from '../utils/attemptHistory'
import {
  getPeerPulseSnapshot,
  linkPeerByCodeAsync,
  refreshPeerPulseFromServer,
  unlinkPeer,
} from '../utils/peerPulseStore'

export default function PeerPulse() {
  const { session } = useAuth()
  const ownerKey = getOwnerKey(session?.userId)
  const [peerInput, setPeerInput] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [syncNote, setSyncNote] = useState('')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await refreshPeerPulseFromServer(ownerKey, { name: session?.name ?? 'Student' })
        if (!cancelled) {
          setSyncNote('Synced with server when available.')
          setTick((t) => t + 1)
        }
      } catch {
        if (!cancelled) setSyncNote('Working offline — open Peer Pulse again when the app server is running.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ownerKey, session?.name])

  const snap = useMemo(() => {
    void tick
    return getPeerPulseSnapshot(ownerKey, {
      name: session?.name ?? 'Student',
    })
  }, [ownerKey, session?.name, tick])

  const onLink = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const result = await linkPeerByCodeAsync(ownerKey, peerInput)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setPeerInput('')
      setTick((t) => t + 1)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page student-portal-page tv-compete-page">
      <header className="tv-compete-hero" style={{ '--tv-accent': '#0f766e' }}>
        <Link to="/prepare" className="insight-page-back">
          ← Prepare centre
        </Link>
        <p className="insight-page-eyebrow">Peer Pulse</p>
        <h1>Friendly competition that keeps you honest</h1>
        <p className="insight-page-lead">
          Share your Spar Code with a friend. Compare streak, accuracy, Merit Points, and today’s
          score — one real peer, synced when the TestVantages server is running.
        </p>
      </header>

      <section className="card create-section">
        <h2>Your Spar Code</h2>
        <p className="form-hint">Send this to a friend so they can link you in Peer Pulse.</p>
        <div className="tv-code-display" aria-live="polite">
          {snap.myCode}
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            navigator.clipboard?.writeText(snap.myCode).catch(() => {})
          }}
        >
          Copy code
        </button>
        {syncNote ? <p className="form-hint">{syncNote}</p> : null}
      </section>

      <section className="card create-section">
        <h2>Link a peer</h2>
        {snap.peer ? (
          <>
            <p>
              Linked with <strong>{snap.peer.name}</strong> ({snap.peerCode})
            </p>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                unlinkPeer(ownerKey)
                setTick((t) => t + 1)
              }}
            >
              Unlink
            </button>
          </>
        ) : (
          <form className="tv-inline-form" onSubmit={onLink}>
            <label>
              Friend’s Spar Code
              <input
                value={peerInput}
                onChange={(e) => setPeerInput(e.target.value.toUpperCase())}
                placeholder="e.g. K7MP2A"
                maxLength={8}
                autoComplete="off"
                disabled={busy}
              />
            </label>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Linking…' : 'Link peer'}
            </button>
          </form>
        )}
        {error && <p className="form-error">{error}</p>}
        {!snap.peer && (
          <p className="form-hint" style={{ marginTop: '0.75rem' }}>
            Both of you should open Peer Pulse while signed in so Spar Codes publish to the shared
            directory. Keep the bottom terminal panel running (F5 / Start TestVantages).
          </p>
        )}
      </section>

      {snap.nudge && (
        <section className="card create-section tv-nudge-card">
          <h2>Pulse nudge</h2>
          <p>{snap.nudge}</p>
          <Link to="/todays-drill" className="btn btn-primary btn-sm">
            Open Today’s Drill →
          </Link>
        </section>
      )}

      <section className="card create-section">
        <h2>Side-by-side</h2>
        <div className="tv-compare-grid">
          <div className="tv-compare-col">
            <h3>You</h3>
            <ul className="tv-stat-list">
              <li>
                <span>Streak</span>
                <strong>{snap.me?.streak ?? 0}d</strong>
              </li>
              <li>
                <span>Accuracy</span>
                <strong>{snap.me?.accuracy ?? 0}%</strong>
              </li>
              <li>
                <span>Merit Points</span>
                <strong>{snap.me?.meritPoints ?? 0}</strong>
              </li>
              <li>
                <span>Today’s score</span>
                <strong>
                  {snap.me?.dailyScore ?? 0}
                  {snap.me?.dailyMax ? ` / ${snap.me.dailyMax}` : ''}
                </strong>
              </li>
            </ul>
          </div>
          <div className="tv-compare-col">
            <h3>{snap.peer ? snap.peer.name : 'Peer'}</h3>
            {snap.peer ? (
              <ul className="tv-stat-list">
                <li>
                  <span>Streak</span>
                  <strong>{snap.peer.streak ?? 0}d</strong>
                </li>
                <li>
                  <span>Accuracy</span>
                  <strong>{snap.peer.accuracy ?? 0}%</strong>
                </li>
                <li>
                  <span>Merit Points</span>
                  <strong>{snap.peer.meritPoints ?? 0}</strong>
                </li>
                <li>
                  <span>Today’s score</span>
                  <strong>
                    {snap.peer.dailyScore ?? 0}
                    {snap.peer.dailyMax ? ` / ${snap.peer.dailyMax}` : ''}
                  </strong>
                </li>
              </ul>
            ) : (
              <p className="form-hint">Link a Spar Code to see their pulse here.</p>
            )}
          </div>
        </div>
      </section>

      <p className="form-hint">
        Also earn points on <Link to="/merit-stride">Merit Stride</Link> · climb with{' '}
        <Link to="/form-forecast">Form Forecast</Link>.
      </p>
    </div>
  )
}
