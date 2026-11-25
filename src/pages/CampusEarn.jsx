/**
 * University / campus mentor side-income onboarding (/campus-earn).
 */

import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  ELITE_COLLEGE_HINTS,
  PARTNER_TYPE_LABELS,
  PARTNER_TYPES,
} from '../utils/referralConstants.js'
import { estimateCampusMonthlyIncome } from '../utils/referralEngine.js'
import { getPartnerByUserId, upsertPartner } from '../utils/referralStore.js'
import { syncReferralStore } from '../utils/referralApi.js'
import ShareKitPanel from '../components/ShareKitPanel.jsx'
import { getPromoterDashboard } from '../utils/referralEngine.js'

export default function CampusEarn() {
  const { session, isLoggedIn } = useAuth()
  const navigate = useNavigate()
  const existing = session?.userId ? getPartnerByUserId(session.userId) : null

  const [partnerType, setPartnerType] = useState(
    existing?.partnerType || PARTNER_TYPES.UNIVERSITY_STUDENT,
  )
  const [collegeName, setCollegeName] = useState(existing?.collegeName || '')
  const [collegeEmail, setCollegeEmail] = useState(existing?.collegeEmail || '')
  const [degree, setDegree] = useState(existing?.degree || '')
  const [gradYear, setGradYear] = useState(existing?.gradYear || '')
  const [badge, setBadge] = useState(existing?.examCredentialBadge || '')
  const [parentCode, setParentCode] = useState('')
  const [referralsSlider, setReferralsSlider] = useState(20)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  const estimate = useMemo(
    () => estimateCampusMonthlyIncome(referralsSlider),
    [referralsSlider],
  )

  const dash = existing ? getPromoterDashboard(existing.id) : null

  const eliteHint = ELITE_COLLEGE_HINTS.some((h) =>
    String(collegeName).toLowerCase().includes(h),
  )

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSaved(false)
    if (!isLoggedIn || !session?.userId) {
      navigate('/login', { state: { from: '/campus-earn' } })
      return
    }
    setBusy(true)
    try {
      const result = upsertPartner({
        userId: session.userId,
        name: session.name,
        email: session.email,
        partnerType,
        collegeName,
        collegeEmail,
        degree,
        gradYear,
        examCredentialBadge:
          badge ||
          (eliteHint && degree
            ? `${degree}, ${collegeName}`
            : collegeName
              ? `${degree || 'Student'}, ${collegeName}`
              : ''),
        parentPartnerCode: parentCode,
      })
      if (!result.ok) {
        setError(result.error || 'Could not save.')
        return
      }
      await syncReferralStore().catch(() => {})
      setSaved(true)
      navigate('/earn#promo-gallery')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page student-portal-page tv-compete-page tv-referral-page">
      <header className="tv-compete-hero" style={{ '--tv-accent': '#0369a1' }}>
        <Link to="/home" className="insight-page-back">
          ← Home
        </Link>
        <p className="insight-page-eyebrow">Campus Earn</p>
        <h1>Side income for college mentors</h1>
        <p className="insight-page-lead">
          Share 2 free NTA-pattern JEE / NEET diagnostic mocks. Earn 10%–15% when aspirants upgrade
          — UPI-friendly for 18+ university students, plus faculty and creator tracks.
        </p>
      </header>

      <section className="card create-section">
        <h2>Monthly side-income calculator</h2>
        <p className="form-hint">
          Drag to estimate paid upgrades this month (average pack ≈ ₹{estimate.avgOrderInr}).
        </p>
        <label>
          Paid referrals: <strong>{referralsSlider}</strong>
          <input
            type="range"
            min={0}
            max={80}
            value={referralsSlider}
            onChange={(e) => setReferralsSlider(Number(e.target.value))}
          />
        </label>
        <div className="tv-kpi-row">
          <div className="kpi-card">
            <span>Tier</span>
            <strong>{estimate.tier.label}</strong>
          </div>
          <div className="kpi-card">
            <span>Commission</span>
            <strong>₹{estimate.commissionInr.toLocaleString('en-IN')}</strong>
          </div>
          <div className="kpi-card">
            <span>Bonus</span>
            <strong>₹{estimate.bonusInr.toLocaleString('en-IN')}</strong>
          </div>
          <div className="kpi-card">
            <span>Total</span>
            <strong>₹{estimate.totalInr.toLocaleString('en-IN')}</strong>
          </div>
        </div>
        <p className="form-hint">
          Rising Mentor (16+) gets ₹1,000/mo bonus; Campus Star (41+) gets ₹3,000/mo + video
          spotlight. Figures are estimates on net revenue share.
        </p>
      </section>

      <section className="card create-section">
        <h2>{existing ? 'Update promoter profile' : '1-minute onboarding'}</h2>
        {!isLoggedIn ? (
          <p className="form-hint">
            <Link to="/login" state={{ from: '/campus-earn' }}>
              Sign in or register
            </Link>{' '}
            first, then finish this form.
          </p>
        ) : null}
        <form className="onboarding-form" onSubmit={onSubmit}>
          <label>
            Promoter type
            <select
              value={partnerType}
              onChange={(e) => setPartnerType(e.target.value)}
              required
            >
              {Object.entries(PARTNER_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            College / school name
            <input
              value={collegeName}
              onChange={(e) => setCollegeName(e.target.value)}
              placeholder="e.g. NIT Surathkal"
            />
          </label>
          <label>
            College email (.ac.in / .edu.in)
            <input
              type="email"
              value={collegeEmail}
              onChange={(e) => setCollegeEmail(e.target.value)}
              placeholder="you@college.ac.in"
            />
          </label>
          <label>
            Degree
            <input
              value={degree}
              onChange={(e) => setDegree(e.target.value)}
              placeholder="B.Tech CSE / MBBS"
            />
          </label>
          <label>
            Graduation year
            <input
              value={gradYear}
              onChange={(e) => setGradYear(e.target.value)}
              placeholder="2027"
            />
          </label>
          <label>
            Mentor badge (optional)
            <input
              value={badge}
              onChange={(e) => setBadge(e.target.value)}
              placeholder="Verified IIT / NIT / AIIMS mentor"
            />
          </label>
          <label>
            Parent partner code (optional — multi-tier)
            <input
              value={parentCode}
              onChange={(e) => setParentCode(e.target.value)}
              placeholder="Someone who invited you as a promoter"
            />
          </label>
          {error ? <p className="upload-error">{error}</p> : null}
          {saved ? (
            <p className="profile-saved" role="status">
              Saved — opening your Earn dashboard.
            </p>
          ) : null}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : existing ? 'Save & open dashboard' : 'Get my link & vanity code'}
          </button>
        </form>
      </section>

      {dash ? <ShareKitPanel share={dash.share} partner={dash.partner} /> : null}

      <p className="form-hint">
        Already promoting? <Link to="/earn">Open Earn & Refer dashboard</Link>
      </p>
    </div>
  )
}
