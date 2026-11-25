/**
 * Platform growth admin — video moderation + payout snapshot.
 */

import { useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import PortalPage from '../components/PortalPage'
import { getAdminGrowthSnapshot, listPendingVideosForAdmin } from '../utils/referralEngine.js'
import { loadReferralStore, setVideoApproval } from '../utils/referralStore.js'
import { syncReferralStore } from '../utils/referralApi.js'
import { PARTNER_TYPE_LABELS } from '../utils/referralConstants.js'

export default function ReferralAdmin() {
  const { isAdmin, isLoggedIn } = useAuth()
  const [tick, setTick] = useState(0)
  const [msg, setMsg] = useState('')

  const snap = useMemo(() => {
    void tick
    return getAdminGrowthSnapshot()
  }, [tick])

  const pending = useMemo(() => {
    void tick
    return listPendingVideosForAdmin()
  }, [tick])

  const partners = useMemo(() => {
    void tick
    return Object.values(loadReferralStore().partners)
  }, [tick])

  if (!isLoggedIn) return <Navigate to="/login" replace state={{ from: '/admin/referrals' }} />
  if (!isAdmin) return <Navigate to="/home" replace />

  return (
    <PortalPage
      role="admin"
      eyebrow="Growth"
      title="Referral & creator admin"
      subtitle="Approve videos, watch funnel counts, and release demo payouts. Real RazorpayX / TDS arrives in Phase 3."
      actions={
        <Link to="/earn" className="btn btn-ghost btn-sm">
          Promoter view
        </Link>
      }
      className="tv-referral-admin"
    >
      {msg ? (
        <p className="profile-saved" role="status">
          {msg}
        </p>
      ) : null}

      <section className="card create-section">
        <h2>Snapshot</h2>
        <div className="tv-kpi-row">
          <div className="kpi-card">
            <span>Partners</span>
            <strong>{snap.partnerCount}</strong>
          </div>
          <div className="kpi-card">
            <span>Pending videos</span>
            <strong>{snap.pendingVideos}</strong>
          </div>
          <div className="kpi-card">
            <span>Featured</span>
            <strong>{snap.featuredVideos}</strong>
          </div>
          <div className="kpi-card">
            <span>B2B open</span>
            <strong>{snap.openB2bLeads}</strong>
          </div>
          <div className="kpi-card">
            <span>Eligible payout ₹</span>
            <strong>{snap.eligiblePayoutTotal}</strong>
          </div>
        </div>
        <ul className="form-hint">
          {Object.entries(snap.byType || {}).map(([k, v]) => (
            <li key={k}>
              {PARTNER_TYPE_LABELS[k] || k}: {v}
            </li>
          ))}
        </ul>
      </section>

      <section className="card create-section">
        <h2>Video moderation</h2>
        {!pending.length ? (
          <p className="form-hint">No videos waiting.</p>
        ) : (
          <ul className="tv-admin-video-list">
            {pending.map((v) => (
              <li key={v.id}>
                <strong>{v.title}</strong>
                <p className="form-hint">
                  {v.platform} · <a href={v.videoUrl} target="_blank" rel="noreferrer">{v.videoUrl}</a>
                </p>
                <div className="tv-inline-form">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      setVideoApproval(v.id, {
                        approvalStatus: 'approved',
                        isFeatured: true,
                        spotlightRank: 1,
                      })
                      syncReferralStore().catch(() => {})
                      setMsg(`Approved & featured: ${v.title}`)
                      setTick((t) => t + 1)
                    }}
                  >
                    Approve + feature
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setVideoApproval(v.id, { approvalStatus: 'approved', isFeatured: false })
                      syncReferralStore().catch(() => {})
                      setMsg(`Approved: ${v.title}`)
                      setTick((t) => t + 1)
                    }}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setVideoApproval(v.id, { approvalStatus: 'rejected' })
                      syncReferralStore().catch(() => {})
                      setMsg(`Rejected: ${v.title}`)
                      setTick((t) => t + 1)
                    }}
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card create-section">
        <h2>Partners</h2>
        {!partners.length ? (
          <p className="form-hint">No partners yet — open /campus-earn as a user.</p>
        ) : (
          <ul className="form-hint">
            {partners.slice(0, 40).map((p) => (
              <li key={p.id}>
                {p.displayName || p.name} · {PARTNER_TYPE_LABELS[p.partnerType] || p.partnerType} ·{' '}
                {p.vanityCouponCode} · /m/{p.micrositeSlug} · paid {p.stats?.paidConversions || 0}
              </li>
            ))}
          </ul>
        )}
      </section>
    </PortalPage>
  )
}
