/**
 * Promoter self-service dashboard — funnel cards + 3-bucket earnings ledger.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import ShareKitPanel from '../components/ShareKitPanel.jsx'
import PromoShareGallery from '../components/PromoShareGallery.jsx'
import {
  createFreeMockLeadLock,
  getPromoterDashboard,
  reconcileCommissionStatuses,
  recordPaidConversion,
  simulateDemoPayout,
} from '../utils/referralEngine.js'
import {
  addB2bSchoolLead,
  getPartnerByUserId,
  getWalletBalance,
  submitPromoVideo,
  upsertPartner,
} from '../utils/referralStore.js'
import { PARTNER_TYPES, PARTNER_TYPE_LABELS } from '../utils/referralConstants.js'
import { syncReferralStore } from '../utils/referralApi.js'

function money(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function defaultPartnerType(session, isAdmin) {
  if (isAdmin) return PARTNER_TYPES.STUDENT
  if (session?.role === 'teacher') return PARTNER_TYPES.FACULTY
  return PARTNER_TYPES.STUDENT
}

const START_PERSONAS = [
  {
    type: PARTNER_TYPES.STUDENT,
    label: 'Student',
    hint: 'Share with classmates — wallet credits on paid upgrades',
  },
  {
    type: PARTNER_TYPES.FACULTY,
    label: 'Teacher',
    hint: 'Refer aspirants & school leads — cash / credit share',
  },
  {
    type: PARTNER_TYPES.VOLUNTARY_MARKETER,
    label: 'Ambassador / Creator',
    hint: 'Promo gallery, reels, and performance commissions',
  },
  {
    type: PARTNER_TYPES.UNIVERSITY_STUDENT,
    label: 'Campus mentor',
    hint: 'College side-income · mentor page · 45-day free-mock locks',
  },
]

const isDevDemo =
  typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV)

export default function ReferralDashboard() {
  const { session, isLoggedIn, isAdmin } = useAuth()
  const [tick, setTick] = useState(0)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [videoTitle, setVideoTitle] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [channelUrl, setChannelUrl] = useState('')
  const [school, setSchool] = useState({ schoolName: '', city: '', contactName: '', contactMobile: '' })
  const [demoGross, setDemoGross] = useState('4999')
  const [startType, setStartType] = useState(() => defaultPartnerType(session, isAdmin))

  useEffect(() => {
    reconcileCommissionStatuses()
    syncReferralStore()
      .then(() => setTick((t) => t + 1))
      .catch(() => {})
  }, [])

  const partner = session?.userId ? getPartnerByUserId(session.userId) : null

  const dash = useMemo(() => {
    void tick
    return partner ? getPromoterDashboard(partner.id) : null
  }, [partner, tick])

  if (!isLoggedIn) {
    return <Navigate to="/login" replace state={{ from: '/earn' }} />
  }

  const startPromoting = () => {
    const r = upsertPartner({
      userId: session.userId,
      name: session.name,
      email: session.email,
      partnerType: startType || defaultPartnerType(session, isAdmin),
    })
    if (r.ok) {
      syncReferralStore().catch(() => {})
      setMsg('You are set — copy your code or open the promo gallery.')
      setTick((t) => t + 1)
      if (typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          window.location.hash = 'promo-gallery'
          document.getElementById('promo-gallery')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        })
      }
    } else {
      setErr(r.error || 'Could not start promoting.')
    }
  }

  if (!partner) {
    return (
      <div className="page student-portal-page tv-compete-page tv-referral-page">
        <header className="tv-compete-hero" style={{ '--tv-accent': '#0369a1' }}>
          <Link to="/home" className="insight-page-back">
            ← Home
          </Link>
          <p className="insight-page-eyebrow">Refer & Earn</p>
          <h1>Start promoting TestVantages</h1>
          <p className="insight-page-lead">
            Students, teachers, and ambassadors share one kit: your code, mentor page, and promo
            gallery. Friends get 2 free diagnostic mocks and 10% off.
          </p>
        </header>

        <section className="card create-section tv-earn-first-run" data-testid="earn-first-run">
          <h2>Three quick steps</h2>
          <ol className="tv-earn-steps">
            <li>Pick how you promote (you can change this later on Campus Referrals).</li>
            <li>Copy your share code or open the promo gallery templates.</li>
            <li>Send on WhatsApp — when friends upgrade after free mocks, earnings show in Pending.</li>
          </ol>

          <fieldset className="tv-persona-pick">
            <legend>I am promoting as</legend>
            <div className="tv-persona-grid">
              {START_PERSONAS.map((p) => (
                <label
                  key={p.type}
                  className={`tv-persona-card${startType === p.type ? ' is-selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="earn-persona"
                    value={p.type}
                    checked={startType === p.type}
                    onChange={() => setStartType(p.type)}
                  />
                  <strong>{p.label}</strong>
                  <span>{p.hint}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {err ? <p className="upload-error">{err}</p> : null}
          {msg ? (
            <p className="profile-saved" role="status">
              {msg}
            </p>
          ) : null}

          <div className="tv-inline-form" style={{ marginTop: '1rem' }}>
            <button type="button" className="btn btn-primary" onClick={startPromoting}>
              Create my share kit
            </button>
            <Link to="/campus-earn" className="btn btn-ghost">
              Campus Referrals details
            </Link>
          </div>
          <p className="form-hint" style={{ marginTop: '0.75rem' }}>
            Demo: Login → Try as ambassador (<code>ambassador@testvantage.com</code> /{' '}
            <code>ambassador123</code>). Already an ambassador? Use the Ambassador tab on Login — then open this page
            again to create your kit if it is missing.
          </p>
        </section>
      </div>
    )
  }

  const onSubmitVideo = (e) => {
    e.preventDefault()
    setErr('')
    setMsg('')
    const r = submitPromoVideo({
      partnerId: partner.id,
      title: videoTitle,
      videoUrl,
      creatorChannelUrl: channelUrl,
    })
    if (!r.ok) {
      setErr(r.error)
      return
    }
    setVideoTitle('')
    setVideoUrl('')
    setChannelUrl('')
    setMsg('Video submitted for review. After approval it unlocks 15% video commission.')
    syncReferralStore().catch(() => {})
    setTick((t) => t + 1)
  }

  const onB2b = (e) => {
    e.preventDefault()
    setErr('')
    setMsg('')
    const r = addB2bSchoolLead({ partnerId: partner.id, ...school })
    if (!r.ok) {
      setErr(r.error)
      return
    }
    setSchool({ schoolName: '', city: '', contactName: '', contactMobile: '' })
    setMsg('School lead locked for 60 days.')
    syncReferralStore().catch(() => {})
    setTick((t) => t + 1)
  }

  const onDemoConvert = () => {
    setErr('')
    setMsg('')
    const referredUserId = `demo_aspirant_${Date.now()}`
    createFreeMockLeadLock({
      partnerId: partner.id,
      aspirantUserId: referredUserId,
      examTrack: 'jee_main',
    })
    const r = recordPaidConversion({
      referredUserId,
      orderId: `demo_order_${Date.now()}`,
      grossAmount: Number(demoGross) || 4999,
      fromVideo: false,
    })
    if (!r.ok) {
      setErr(r.error)
      return
    }
    setMsg(
      `Demo paid conversion recorded (${r.commissions.length} commission row(s)). Check Pending bucket.`,
    )
    syncReferralStore().catch(() => {})
    setTick((t) => t + 1)
  }

  const wallet = getWalletBalance(session.userId)
  const lockSummary = dash.lockSummary

  return (
    <div className="page student-portal-page tv-compete-page tv-referral-page">
      <header className="tv-compete-hero" style={{ '--tv-accent': '#0369a1' }}>
        <Link to="/home" className="insight-page-back">
          ← Home
        </Link>
        <p className="insight-page-eyebrow">Refer & Earn</p>
        <h1>{partner.displayName || partner.name}</h1>
        <p className="insight-page-lead">
          {PARTNER_TYPE_LABELS[partner.partnerType] || partner.partnerType}
          {partner.collegeName ? ` · ${partner.collegeName}` : ''}
          {partner.examCredentialBadge ? ` · ${partner.examCredentialBadge}` : ''}
        </p>
        <p className="form-hint">
          Tier: <strong>{dash.tier.label}</strong> ({dash.tier.rate}% L1)
          {partner.partnerType === PARTNER_TYPES.UNIVERSITY_STUDENT
            ? ` · ${dash.periodCount} paid this month`
            : ` · ${dash.periodCount} paid this quarter`}
          {' · '}
          <Link to={`/m/${partner.micrositeSlug}`}>Open mentor page</Link>
          {' · '}
          <Link to="/campus-earn">Edit profile</Link>
          {isAdmin ? (
            <>
              {' · '}
              <Link to="/admin/referrals">Admin growth</Link>
            </>
          ) : null}
        </p>
      </header>

      {msg ? (
        <p className="profile-saved" role="status">
          {msg}
        </p>
      ) : null}
      {err ? <p className="upload-error">{err}</p> : null}

      <section className="card create-section">
        <h2>Funnel</h2>
        <div className="tv-kpi-row">
          <div className="kpi-card">
            <span>Clicks</span>
            <strong>{partner.stats?.clicks || 0}</strong>
          </div>
          <div className="kpi-card">
            <span>Signups</span>
            <strong>{partner.stats?.signups || 0}</strong>
          </div>
          <div className="kpi-card">
            <span>Active 45-day locks</span>
            <strong>{lockSummary?.activeCount ?? 0}</strong>
          </div>
          <div className="kpi-card">
            <span>Paid</span>
            <strong>{partner.stats?.paidConversions || 0}</strong>
          </div>
          <div className="kpi-card">
            <span>Microsite visits</span>
            <strong>{partner.stats?.micrositeVisits || 0}</strong>
          </div>
          {partner.partnerType === PARTNER_TYPES.STUDENT ? (
            <div className="kpi-card">
              <span>Wallet credits</span>
              <strong>{money(wallet)}</strong>
            </div>
          ) : null}
        </div>
        {lockSummary?.activeCount ? (
          <p className="form-hint tv-lock-hint">
            {lockSummary.nextExpiryDays != null
              ? `Next free-mock lock expires in ~${lockSummary.nextExpiryDays} day(s) (${new Date(lockSummary.nextExpiryAt).toLocaleDateString('en-IN')}). Paid upgrades inside the lock still count to you.`
              : 'You have active free-mock locks.'}
            {lockSummary.expiredCount
              ? ` · ${lockSummary.expiredCount} expired lock(s) no longer attribute new paid orders.`
              : ''}
          </p>
        ) : (
          <p className="form-hint tv-lock-hint">
            No active 45-day locks yet. When an aspirant claims a free mock from your mentor page,
            they stay attributed to you for 45 days.
          </p>
        )}
        {dash.milestones?.length ? (
          <ul className="form-hint">
            {dash.milestones.map((m) => (
              <li key={m.reward}>
                {m.unlocked ? '✓' : '○'} {m.at} paid → {m.label} ({m.progress}/{m.at})
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <ShareKitPanel share={dash.share} partner={partner} />

      <PromoShareGallery
        share={dash.share}
        partner={partner}
        session={session}
        onChanged={() => setTick((t) => t + 1)}
      />

      <section className="card create-section">
        <h2>Earnings ledger</h2>
        <p className="form-hint">
          <strong>Pending</strong> = paid order still inside the refund window (shows unlock date).{' '}
          <strong>Eligible</strong> = refund cleared — ready for the next 1st-of-month payout (min ₹
          {dash.buckets.minPayoutInr}). <strong>Reversed</strong> = refunded / cancelled = ₹0. Self
          and circular referrals never earn.
        </p>
        <div className="tv-kpi-row">
          <div className="kpi-card">
            <span>Pending (refund window)</span>
            <strong>{money(dash.buckets.pending.total)}</strong>
          </div>
          <div className="kpi-card">
            <span>Eligible (next 1st)</span>
            <strong>{money(dash.buckets.eligible.total)}</strong>
          </div>
          <div className="kpi-card">
            <span>Reversed</span>
            <strong>{money(dash.buckets.reversed.total)}</strong>
          </div>
          <div className="kpi-card">
            <span>Paid out</span>
            <strong>{money(dash.buckets.paid.total)}</strong>
          </div>
        </div>
        <div className="tv-inline-form">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              const r = reconcileCommissionStatuses()
              setMsg(`Reconciled — moved ${r.moved} row(s) toward eligible.`)
              setTick((t) => t + 1)
            }}
          >
            Refresh unlock status
          </button>
        </div>
        {dash.nextUnlockAt ? (
          <p className="form-hint">
            Next pending unlock:{' '}
            <strong>{new Date(dash.nextUnlockAt).toLocaleDateString('en-IN')}</strong>
            {dash.buckets.pending.rows[0]?.orderOrContractId
              ? ` · order ${dash.buckets.pending.rows[0].orderOrContractId}`
              : ''}
          </p>
        ) : dash.buckets.eligible.total > 0 ? (
          <p className="form-hint">
            Nothing pending — eligible balance waits for the 1st (demo payout is in the tools below
            when available).
          </p>
        ) : (
          <p className="form-hint">No commissions yet. Share your kit, then wait for a paid upgrade.</p>
        )}
        {dash.buckets.reversed.rows[0] ? (
          <p className="form-hint">
            Latest reverse: order {dash.buckets.reversed.rows[0].orderOrContractId} → ₹0 (refund /
            cancel).
          </p>
        ) : null}
      </section>

      <section className="card create-section">
        <h2>Submit promo video (15% boost)</h2>
        <p className="form-hint">
          YouTube / Shorts / Reels. After admin approval, traffic via /v/… earns 15% L1 (overrides
          stay 5% / 2.5%).
        </p>
        <form className="onboarding-form" onSubmit={onSubmitVideo}>
          <label>
            Title
            <input value={videoTitle} onChange={(e) => setVideoTitle(e.target.value)} required />
          </label>
          <label>
            Video URL
            <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} required />
          </label>
          <label>
            Channel URL
            <input value={channelUrl} onChange={(e) => setChannelUrl(e.target.value)} />
          </label>
          <button type="submit" className="btn btn-primary btn-sm">
            Submit for review
          </button>
        </form>
        {dash.videos.length ? (
          <ul className="form-hint">
            {dash.videos.map((v) => (
              <li key={v.id}>
                {v.title} — {v.approvalStatus}
                {v.approvalStatus === 'approved' ? (
                  <>
                    {' '}
                    · <Link to={`/v/${v.videoTrackingSlug}`}>/v/{v.videoTrackingSlug}</Link>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {[PARTNER_TYPES.FACULTY, PARTNER_TYPES.VOLUNTARY_MARKETER, PARTNER_TYPES.UNIVERSITY_STUDENT].includes(
        partner.partnerType,
      ) ? (
        <section className="card create-section">
          <h2>B2B school lead (60-day lock)</h2>
          <form className="onboarding-form" onSubmit={onB2b}>
            <label>
              School name
              <input
                value={school.schoolName}
                onChange={(e) => setSchool({ ...school, schoolName: e.target.value })}
                required
              />
            </label>
            <label>
              City
              <input
                value={school.city}
                onChange={(e) => setSchool({ ...school, city: e.target.value })}
              />
            </label>
            <label>
              Contact name
              <input
                value={school.contactName}
                onChange={(e) => setSchool({ ...school, contactName: e.target.value })}
              />
            </label>
            <label>
              Mobile
              <input
                value={school.contactMobile}
                onChange={(e) => setSchool({ ...school, contactMobile: e.target.value })}
              />
            </label>
            <button type="submit" className="btn btn-primary btn-sm">
              Lock lead
            </button>
          </form>
          {dash.leads.length ? (
            <ul className="form-hint">
              {dash.leads.slice(0, 8).map((l) => (
                <li key={l.id}>
                  {l.schoolName} ({l.city || '—'}) — {l.dealStage} · locks until{' '}
                  {new Date(l.lockExpiresAt).toLocaleDateString('en-IN')}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {dash.certs.length ? (
        <section className="card create-section">
          <h2>Certificates</h2>
          <ul>
            {dash.certs.map((c) => (
              <li key={c.id}>
                {c.certificateType.toUpperCase()} · QR {c.verificationQrCode} ·{' '}
                {new Date(c.issuedAt).toLocaleDateString('en-IN')}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {(isDevDemo || isAdmin) ? (
        <section className="card create-section tv-demo-tools">
          <h2>Local demo tools</h2>
          <p className="form-hint">
            Development / admin only — creates a fake aspirant lock + paid order so you can see the
            ledger. Real checkout will call the same engine later.
          </p>
          <div className="tv-inline-form">
            <label>
              Gross ₹
              <input value={demoGross} onChange={(e) => setDemoGross(e.target.value)} />
            </label>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onDemoConvert}>
              Record demo paid referral
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                const r = simulateDemoPayout(partner.id)
                if (!r.ok) setErr(r.error)
                else setMsg(`Demo payout ${money(r.payout.netDisbursed)} (TDS demo applied).`)
                setTick((t) => t + 1)
              }}
            >
              Simulate 1st-of-month payout
            </button>
          </div>
        </section>
      ) : null}
    </div>
  )
}
