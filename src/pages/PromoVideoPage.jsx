/**
 * Video tracking landing — /v/:slug — 15% attribution when approved.
 */

import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ATTRIBUTION_SOURCES, ASPIRANT_DISCOUNT_PCT } from '../utils/referralConstants.js'
import { applyReferralCapture } from '../utils/referralEngine.js'
import {
  getPartnerById,
  getVideoBySlug,
  mutateReferralStore,
} from '../utils/referralStore.js'
import { fetchVideoBySlug } from '../utils/referralApi.js'

export default function PromoVideoPage() {
  const { slug } = useParams()
  const [video, setVideo] = useState(() => getVideoBySlug(slug))
  const [partner, setPartner] = useState(() => {
    const v = getVideoBySlug(slug)
    return v ? getPartnerById(v.partnerId) : null
  })
  const [loadingRemote, setLoadingRemote] = useState(!getVideoBySlug(slug))
  const [copied, setCopied] = useState(false)
  const [tracked, setTracked] = useState(false)

  useEffect(() => {
    let cancelled = false
    const local = getVideoBySlug(slug)
    if (local) {
      setVideo(local)
      setPartner(getPartnerById(local.partnerId))
      setLoadingRemote(false)
      return undefined
    }
    setLoadingRemote(true)
    fetchVideoBySlug(slug).then((remote) => {
      if (cancelled) return
      setVideo(remote || null)
      setPartner(remote ? getPartnerById(remote.partnerId) : null)
      setLoadingRemote(false)
    })
    return () => {
      cancelled = true
    }
  }, [slug])

  useEffect(() => {
    if (!video || tracked) return
    if (video.approvalStatus !== 'approved') return
    const p = partner || getPartnerById(video.partnerId)
    if (!p) return
    mutateReferralStore((s) => {
      const idx = s.videos.findIndex((v) => v.id === video.id)
      if (idx >= 0) s.videos[idx].viewClicks = (s.videos[idx].viewClicks || 0) + 1
      return s
    })
    applyReferralCapture({
      code: video.linkedCouponCode || p.vanityCouponCode || p.referralCode,
      source: ATTRIBUTION_SOURCES.VIDEO,
      videoId: video.id,
    })
    setTracked(true)
  }, [video, partner, tracked])

  if (loadingRemote && !video) {
    return (
      <div className="page student-portal-page tv-compete-page">
        <header className="tv-compete-hero" style={{ '--tv-accent': '#7c2d12' }}>
          <h1>Loading video…</h1>
        </header>
      </div>
    )
  }

  if (!video) {
    return (
      <div className="page student-portal-page tv-compete-page">
        <header className="tv-compete-hero" style={{ '--tv-accent': '#7c2d12' }}>
          <h1>Video not found</h1>
          <p className="insight-page-lead">
            <Link to="/home">Back home</Link>
          </p>
        </header>
      </div>
    )
  }

  if (video.approvalStatus !== 'approved') {
    return (
      <div className="page student-portal-page tv-compete-page">
        <header className="tv-compete-hero" style={{ '--tv-accent': '#7c2d12' }}>
          <h1>{video.title}</h1>
          <p className="insight-page-lead">
            This video is still under review. Check back after moderation.
          </p>
        </header>
      </div>
    )
  }

  const embedSrc = video.embedId
    ? `https://www.youtube.com/embed/${video.embedId}`
    : null
  const code = video.linkedCouponCode || partner?.vanityCouponCode || partner?.referralCode || ''

  return (
    <div className="page student-portal-page tv-compete-page tv-referral-page">
      <header className="tv-compete-hero" style={{ '--tv-accent': '#7c2d12' }}>
        <p className="insight-page-eyebrow">Creator video · 15% tracked</p>
        <h1>{video.title}</h1>
        <p className="insight-page-lead">
          {partner?.displayName || partner?.name || 'Creator'}
          {partner?.collegeName ? ` · ${partner.collegeName}` : ''}
        </p>
      </header>

      <section className="card create-section">
        {embedSrc ? (
          <div className="tv-video-embed">
            <iframe
              title={video.title}
              src={embedSrc}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <p>
            <a href={video.videoUrl} target="_blank" rel="noreferrer" className="btn btn-primary">
              Open video
            </a>
          </p>
        )}
        <div className="tv-inline-form tv-share-actions" style={{ marginTop: '1rem' }}>
          {video.creatorChannelUrl ? (
            <a
              className="btn btn-ghost btn-sm"
              href={video.creatorChannelUrl}
              target="_blank"
              rel="noreferrer"
            >
              Subscribe on creator channel
            </a>
          ) : null}
          <Link
            className="btn btn-primary btn-sm"
            to={
              partner
                ? `/m/${partner.micrositeSlug}`
                : `/login?coupon=${encodeURIComponent(code)}`
            }
          >
            Take free mock / join with {code || 'code'} — {ASPIRANT_DISCOUNT_PCT}% off
          </Link>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(code)
                setCopied(true)
              } catch {
                setCopied(false)
              }
            }}
          >
            {copied ? 'Code copied' : 'Copy code'}
          </button>
        </div>
      </section>
    </div>
  )
}
