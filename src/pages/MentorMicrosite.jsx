/**
 * Personalized mentor microsite — /m/:slug
 */

import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ASPIRANT_DISCOUNT_PCT,
  ATTRIBUTION_SOURCES,
  FREE_MOCK_COUNT,
} from '../utils/referralConstants.js'
import { applyReferralCapture, createFreeMockLeadLock } from '../utils/referralEngine.js'
import {
  getPartnerBySlug,
  listApprovedVideos,
  recordClick,
} from '../utils/referralStore.js'
import { fetchPartnerBySlug } from '../utils/referralApi.js'
import { useAuth } from '../context/AuthContext'

export default function MentorMicrosite() {
  const { slug } = useParams()
  const { session, isLoggedIn } = useAuth()
  const [note, setNote] = useState('')
  const [partner, setPartner] = useState(() => getPartnerBySlug(slug))
  const [loadingRemote, setLoadingRemote] = useState(!getPartnerBySlug(slug))
  const [attributed, setAttributed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const local = getPartnerBySlug(slug)
    if (local) {
      setPartner(local)
      setLoadingRemote(false)
      return undefined
    }
    setLoadingRemote(true)
    fetchPartnerBySlug(slug).then((remote) => {
      if (cancelled) return
      setPartner(remote || null)
      setLoadingRemote(false)
    })
    return () => {
      cancelled = true
    }
  }, [slug])

  useEffect(() => {
    if (!partner || attributed) return
    recordClick({ partnerId: partner.id, source: 'microsite' })
    applyReferralCapture({
      code: partner.vanityCouponCode || partner.referralCode,
      source: ATTRIBUTION_SOURCES.LINK,
    })
    setAttributed(true)
  }, [partner, attributed])

  const videos = partner
    ? listApprovedVideos().filter((v) => v.partnerId === partner.id).slice(0, 3)
    : []

  if (loadingRemote && !partner) {
    return (
      <div className="page student-portal-page tv-compete-page">
        <header className="tv-compete-hero" style={{ '--tv-accent': '#0369a1' }}>
          <h1>Loading mentor page…</h1>
          <p className="insight-page-lead">Fetching your mentor’s share kit.</p>
        </header>
      </div>
    )
  }

  if (!partner) {
    return (
      <div className="page student-portal-page tv-compete-page">
        <header className="tv-compete-hero" style={{ '--tv-accent': '#0369a1' }}>
          <h1>Mentor page not found</h1>
          <p className="insight-page-lead">
            Ask your mentor for their latest link, or open{' '}
            <Link to="/campus-earn">Campus Earn</Link>.
          </p>
        </header>
      </div>
    )
  }

  const shareCode = partner.vanityCouponCode || partner.referralCode

  const claimFreeMock = () => {
    applyReferralCapture({
      code: shareCode,
      source: ATTRIBUTION_SOURCES.FREE_MOCK,
    })
    if (isLoggedIn && session?.userId) {
      const r = createFreeMockLeadLock({
        partnerId: partner.id,
        aspirantUserId: session.userId,
        examTrack: 'jee_main',
      })
      if (r.ok) {
        setNote(
          r.already
            ? 'You already have an active 45-day mentor lock. Opening free mock…'
            : '45-day mentor lock saved. Opening free mock…',
        )
      }
    } else {
      setNote(
        'Sign in or register with this mentor’s code so your free mocks stay locked for 45 days.',
      )
    }
  }

  return (
    <div className="page student-portal-page tv-compete-page tv-referral-page tv-microsite">
      <header className="tv-compete-hero" style={{ '--tv-accent': '#0369a1' }}>
        <p className="insight-page-eyebrow">TestVantages mentor</p>
        <h1>{partner.displayName || partner.name}</h1>
        <p className="insight-page-lead">
          {partner.examCredentialBadge ||
            [partner.degree, partner.collegeName].filter(Boolean).join(', ') ||
            'Campus mentor'}
        </p>
        <p className="tv-discount-banner" role="status">
          {FREE_MOCK_COUNT} free NTA-pattern diagnostic mocks + {ASPIRANT_DISCOUNT_PCT}% off paid
          packs with code <strong>{shareCode}</strong>
        </p>
      </header>

      <section className="card create-section">
        <h2>Attempt {FREE_MOCK_COUNT} free mocks</h2>
        <p className="form-hint">
          Start with a free All-India diagnostic. Your mentor keeps a 45-day lead lock if you later
          upgrade. Guests: register with the code so the lock sticks after sign-in.
        </p>
        <div className="tv-inline-form">
          <Link
            className="btn btn-primary"
            to={`/mock-test?ref=${encodeURIComponent(shareCode)}&exam=jee`}
            onClick={claimFreeMock}
          >
            Free JEE diagnostic
          </Link>
          <Link
            className="btn btn-ghost"
            to={`/mock-test?ref=${encodeURIComponent(shareCode)}&exam=neet`}
            onClick={claimFreeMock}
          >
            Free NEET diagnostic
          </Link>
          <Link
            className="btn btn-ghost"
            to={`/login?invite=${encodeURIComponent(shareCode)}`}
          >
            Register with code
          </Link>
        </div>
        {note ? (
          <p className="profile-saved" role="status">
            {note}
          </p>
        ) : null}
      </section>

      {videos.length ? (
        <section className="card create-section">
          <h2>Strategy videos</h2>
          <ul className="tv-video-grid">
            {videos.map((v) => (
              <li key={v.id} className="tv-video-card">
                <h3>{v.title}</h3>
                <Link className="btn btn-primary btn-sm" to={`/v/${v.videoTrackingSlug}`}>
                  Watch
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="form-hint">
        <Link to="/home">TestVantages home</Link>
        {' · '}
        <Link to="/campus-earn">Become a campus mentor</Link>
      </p>
    </div>
  )
}
