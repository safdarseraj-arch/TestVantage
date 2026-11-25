/**
 * Promo template gallery + approved videos + social share + auto-share consent.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PROMO_TEMPLATES } from '../data/promoTemplates.js'
import {
  SHARE_CHANNEL_LABELS,
  SHARE_CHANNELS,
} from '../utils/referralConstants.js'
import {
  getShareConsent,
  listApprovedVideosForPartner,
  listAutoShareLogs,
  listFeaturedApprovedVideos,
  runAutoShareSimulation,
  setShareConsent,
} from '../utils/referralStore.js'
import { syncReferralStore } from '../utils/referralApi.js'
import {
  buildChannelShareUrls,
  captionForTemplate,
  captionForVideo,
  formatDueIn,
  selectionLabel,
  shareViaSystem,
} from '../utils/promoShare.js'

const CHANNEL_ORDER = [
  SHARE_CHANNELS.WHATSAPP,
  SHARE_CHANNELS.FACEBOOK,
  SHARE_CHANNELS.X,
  SHARE_CHANNELS.INSTAGRAM,
  SHARE_CHANNELS.SYSTEM,
]

export default function PromoShareGallery({ share, partner, session, onChanged }) {
  const [selectedId, setSelectedId] = useState(PROMO_TEMPLATES[0]?.id || '')
  const [selectedVideoId, setSelectedVideoId] = useState('')
  const [note, setNote] = useState('')
  const [consentTick, setConsentTick] = useState(0)
  const noteTimer = useRef(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.location.hash !== '#promo-gallery') return
    const el = document.getElementById('promo-gallery')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [partner?.id])

  useEffect(
    () => () => {
      if (noteTimer.current) clearTimeout(noteTimer.current)
    },
    [],
  )

  const flash = (text) => {
    setNote(text)
    if (noteTimer.current) clearTimeout(noteTimer.current)
    noteTimer.current = setTimeout(() => setNote(''), 3200)
  }

  const consent = useMemo(() => {
    void consentTick
    return session?.userId ? getShareConsent(session.userId) : null
  }, [session?.userId, consentTick])

  const logs = useMemo(() => {
    void consentTick
    return session?.userId ? listAutoShareLogs(session.userId, 5) : []
  }, [session?.userId, consentTick])

  const videos = useMemo(
    () => listApprovedVideosForPartner(partner?.id),
    [partner?.id, consentTick],
  )

  const featured = useMemo(
    () => listFeaturedApprovedVideos({ excludePartnerId: partner?.id, limit: 4 }),
    [partner?.id, consentTick],
  )

  const selectedTemplate =
    PROMO_TEMPLATES.find((t) => t.id === selectedId) || PROMO_TEMPLATES[0]
  const selectedVideo = videos.find((v) => v.id === selectedVideoId) || null

  const caption = selectedVideo
    ? captionForVideo(selectedVideo, share, partner)
    : captionForTemplate(selectedTemplate, share, partner)

  const shareUrl = selectedVideo
    ? typeof window !== 'undefined' && selectedVideo.videoTrackingSlug
      ? `${window.location.origin}/v/${selectedVideo.videoTrackingSlug}`
      : selectedVideo.videoUrl || share?.referralLink
    : share?.referralLink

  const urls = buildChannelShareUrls({ text: caption, url: shareUrl })

  const bump = () => {
    setConsentTick((n) => n + 1)
    onChanged?.()
  }

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(caption)
      flash('Caption copied — paste it into any app.')
    } catch {
      flash('Could not copy — select the text below.')
    }
  }

  const copyShareUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl || '')
      flash('Share link copied.')
    } catch {
      flash('Could not copy the link.')
    }
  }

  const openChannel = async (channel) => {
    if (channel === SHARE_CHANNELS.SYSTEM) {
      const r = await shareViaSystem({
        title: selectedTemplate?.headline || 'TestVantages',
        text: caption,
        url: shareUrl,
      })
      flash(r.ok ? 'Opened your device share sheet.' : r.error || 'Share unavailable.')
      return
    }
    if (channel === SHARE_CHANNELS.INSTAGRAM) {
      try {
        await navigator.clipboard.writeText(caption)
        flash('Caption copied. Instagram opened — paste into a Reel or Story.')
      } catch {
        flash('Copy the caption below, then paste into Instagram.')
      }
      window.open(urls[channel], '_blank', 'noopener,noreferrer')
      return
    }
    const href = urls[channel]
    if (href) window.open(href, '_blank', 'noopener,noreferrer')
    else flash('Could not open that app.')
  }

  const toggleConsent = (enabled) => {
    if (!session?.userId) {
      flash('Sign in to save auto-share consent.')
      return
    }
    const r = setShareConsent({
      userId: session.userId,
      partnerId: partner?.id,
      enabled,
      channels: consent?.channels?.length
        ? consent.channels
        : [SHARE_CHANNELS.WHATSAPP, SHARE_CHANNELS.FACEBOOK, SHARE_CHANNELS.X],
      preferredTemplateId: selectedTemplate?.id || null,
      preferredVideoId: selectedVideo?.id || null,
    })
    if (r.ok) {
      syncReferralStore().catch(() => {})
      flash(
        enabled
          ? 'Auto-share is on. We will queue posts for you (simulated until social login is connected).'
          : 'Auto-share is off. You can still share manually anytime.',
      )
      bump()
    } else flash(r.error || 'Could not save consent.')
  }

  const toggleChannel = (channel) => {
    if (!session?.userId) return
    const current = new Set(consent?.channels || [SHARE_CHANNELS.WHATSAPP])
    if (current.has(channel)) current.delete(channel)
    else current.add(channel)
    if (!current.size) current.add(SHARE_CHANNELS.WHATSAPP)
    setShareConsent({
      userId: session.userId,
      partnerId: partner?.id,
      enabled: Boolean(consent?.enabled),
      channels: [...current],
      preferredTemplateId: selectedTemplate?.id || null,
      preferredVideoId: selectedVideo?.id || null,
    })
    syncReferralStore().catch(() => {})
    bump()
  }

  const runSimShare = (force) => {
    if (!session?.userId) return
    setShareConsent({
      userId: session.userId,
      partnerId: partner?.id,
      enabled: true,
      channels: consent?.channels || [SHARE_CHANNELS.WHATSAPP],
      preferredTemplateId: selectedTemplate?.id || null,
      preferredVideoId: selectedVideo?.id || null,
    })
    const r = runAutoShareSimulation(session.userId, {
      force,
      message: `Queued: ${selectedVideo ? selectedVideo.title : selectedTemplate?.title} → ${(consent?.channels || ['whatsapp'])[0]}`,
    })
    syncReferralStore().catch(() => {})
    if (r.ok) flash(`Logged auto-share. Next one in about ${formatDueIn(r.consent?.nextShareAt - Date.now())}.`)
    else if (r.dueInMs != null) flash(`Next auto-share in ${formatDueIn(r.dueInMs)}.`)
    else flash(r.error || 'Could not run auto-share.')
    bump()
  }

  if (!share || !partner) return null

  const dueMs =
    consent?.enabled && consent?.nextShareAt ? Math.max(0, consent.nextShareAt - Date.now()) : null

  return (
    <section className="card create-section tv-promo-gallery" id="promo-gallery" data-testid="promo-share-gallery">
      <h2>Promo gallery</h2>
      <p className="form-hint">
        Pick a ready message or an approved reel, then share on WhatsApp and other apps. Friends get
        free diagnostic mocks and 10% off with your code.
      </p>

      <h3 className="tv-promo-subhead">Templates</h3>
      <ul className="tv-promo-grid">
        {PROMO_TEMPLATES.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              className={`tv-promo-card${selectedId === t.id && !selectedVideoId ? ' is-selected' : ''}`}
              style={{ '--promo-accent': t.accent }}
              aria-pressed={selectedId === t.id && !selectedVideoId}
              onClick={() => {
                setSelectedId(t.id)
                setSelectedVideoId('')
              }}
            >
              {selectedId === t.id && !selectedVideoId ? (
                <span className="tv-promo-selected-badge">Selected</span>
              ) : null}
              <span className="tv-promo-emoji" aria-hidden="true">
                {t.emoji}
              </span>
              <strong>{t.title}</strong>
              <span className="tv-promo-tone">{t.tone}</span>
              <span className="tv-promo-headline">{t.headline}</span>
            </button>
          </li>
        ))}
      </ul>

      <h3 className="tv-promo-subhead">Your approved videos &amp; reels</h3>
      {videos.length ? (
        <ul className="tv-video-grid">
          {videos.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                className={`tv-video-card tv-video-pick${selectedVideoId === v.id ? ' is-selected' : ''}`}
                aria-pressed={selectedVideoId === v.id}
                onClick={() => setSelectedVideoId(v.id)}
              >
                {selectedVideoId === v.id ? (
                  <span className="tv-promo-selected-badge">Selected</span>
                ) : null}
                <h3>{v.title}</h3>
                <p className="form-hint">
                  {v.platform || 'video'} · code {v.linkedCouponCode || share.vanityCode}
                  {v.commissionBoostRatePct ? ` · ${v.commissionBoostRatePct}% L1` : ''}
                </p>
                {v.videoTrackingSlug ? (
                  <Link to={`/v/${v.videoTrackingSlug}`} className="form-hint" onClick={(e) => e.stopPropagation()}>
                    Open tracking page
                  </Link>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="form-hint tv-gallery-empty">
          No approved videos of yours yet. Submit a Shorts / Reels link below — after admin approval
          it unlocks 15% video commission. Templates still work now.
        </p>
      )}

      {featured.length ? (
        <>
          <h3 className="tv-promo-subhead">Featured creator reels (inspiration)</h3>
          <ul className="tv-video-grid">
            {featured.map((v) => (
              <li key={v.id}>
                <div className="tv-video-card">
                  <h3>{v.title}</h3>
                  <p className="form-hint">{v.platform || 'video'} · watch &amp; learn style</p>
                  {v.videoTrackingSlug ? (
                    <Link to={`/v/${v.videoTrackingSlug}`} className="form-hint">
                      Open /v/{v.videoTrackingSlug}
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <div className="tv-promo-preview">
        <p className="tv-promo-selection" role="status">
          {selectionLabel(selectedTemplate, selectedVideo)}
        </p>
        <p className="form-hint">
          Ready to share · code <strong>{share.vanityCode}</strong>
          {shareUrl ? (
            <>
              {' '}
              · link <span className="tv-promo-share-url">{shareUrl}</span>
            </>
          ) : null}
        </p>
        <pre className="tv-promo-caption">{caption}</pre>
        <div className="tv-inline-form tv-share-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={copyCaption}>
            Copy caption
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={copyShareUrl}>
            Copy share link
          </button>
          {CHANNEL_ORDER.map((ch) => (
            <button
              key={ch}
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => openChannel(ch)}
            >
              {SHARE_CHANNEL_LABELS[ch] || ch}
            </button>
          ))}
        </div>
      </div>

      <div className="tv-auto-share" data-testid="auto-share-consent">
        <h3 className="tv-promo-subhead">Auto-share (with your OK)</h3>
        <p className="form-hint">
          If you turn this on, TestVantages can queue shares for you. Today we log and schedule them
          (simulated) — real WhatsApp / Instagram posting needs a later social login.
        </p>
        <label className="tv-consent-toggle">
          <input
            type="checkbox"
            checked={Boolean(consent?.enabled)}
            onChange={(e) => toggleConsent(e.target.checked)}
          />
          <span>
            <strong>Allow auto-share</strong>
            <span className="tv-consent-hint">
              {consent?.enabled
                ? dueMs != null
                  ? ` On · next share in ${formatDueIn(dueMs)}`
                  : ' On'
                : ' Off — manual share only'}
            </span>
          </span>
        </label>
        <div className="tv-channel-picks" role="group" aria-label="Preferred channels">
          {[SHARE_CHANNELS.WHATSAPP, SHARE_CHANNELS.FACEBOOK, SHARE_CHANNELS.X, SHARE_CHANNELS.INSTAGRAM].map(
            (ch) => (
              <label key={ch} className="tv-channel-chip">
                <input
                  type="checkbox"
                  checked={(consent?.channels || []).includes(ch)}
                  disabled={!consent?.enabled && !session?.userId}
                  onChange={() => toggleChannel(ch)}
                />
                {SHARE_CHANNEL_LABELS[ch]}
              </label>
            ),
          )}
        </div>
        <div className="tv-inline-form">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={!session?.userId}
            onClick={() => runSimShare(true)}
          >
            Log a simulated share now
          </button>
        </div>
        {logs.length ? (
          <ul className="tv-auto-share-log form-hint">
            {logs.map((row) => (
              <li key={row.id}>
                {new Date(row.at).toLocaleString()} · {row.channel} · {row.note}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {note ? (
        <p className="tv-copy-toast" role="status">
          {note}
        </p>
      ) : null}
    </section>
  )
}
