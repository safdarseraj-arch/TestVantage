/**
 * Build share URLs + captions for referral promo templates / videos.
 */

import { fillPromoTemplate } from '../data/promoTemplates.js'
import { SHARE_CHANNELS } from './referralConstants.js'

export function buildShareContext(share, partner) {
  return {
    code: share?.vanityCode || partner?.vanityCouponCode || partner?.referralCode || '',
    link: share?.referralLink || '',
    mentor: share?.micrositeLink || share?.referralLink || '',
    name: partner?.displayName || partner?.name || 'A friend',
  }
}

export function captionForTemplate(template, share, partner) {
  return fillPromoTemplate(template, buildShareContext(share, partner))
}

export function captionForVideo(video, share, partner) {
  const ctx = buildShareContext(share, partner)
  const watch =
    typeof window !== 'undefined' && video?.videoTrackingSlug
      ? `${window.location.origin}/v/${video.videoTrackingSlug}`
      : video?.videoUrl || ctx.link
  return `${video?.title || 'Watch this TestVantages tip'} — 2 free NTA diagnostic mocks + code ${ctx.code} for 10% off.\n${watch}`
}

/** Short status line for the selected gallery item. */
export function selectionLabel(template, video) {
  if (video?.title) return `Selected reel: ${video.title}`
  if (template?.title) return `Selected template: ${template.title}`
  return 'Pick a template or reel to preview'
}

export function buildChannelShareUrls({ text, url }) {
  const encodedText = encodeURIComponent(text || '')
  const encodedUrl = encodeURIComponent(url || '')
  return {
    [SHARE_CHANNELS.WHATSAPP]: `https://wa.me/?text=${encodedText}`,
    [SHARE_CHANNELS.FACEBOOK]: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    [SHARE_CHANNELS.X]: `https://twitter.com/intent/tweet?text=${encodedText}`,
    [SHARE_CHANNELS.INSTAGRAM]: 'https://www.instagram.com/',
    [SHARE_CHANNELS.SYSTEM]: null,
  }
}

export async function shareViaSystem({ title, text, url }) {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return { ok: false, error: 'This device has no system share sheet.' }
  }
  try {
    await navigator.share({ title: title || 'TestVantages', text, url })
    return { ok: true }
  } catch (err) {
    if (err?.name === 'AbortError') return { ok: false, error: 'Share cancelled.' }
    return { ok: false, error: err instanceof Error ? err.message : 'Share failed.' }
  }
}

export function formatDueIn(ms) {
  const n = Math.max(0, Number(ms) || 0)
  if (n < 60_000) return 'less than a minute'
  const mins = Math.round(n / 60_000)
  if (mins < 90) return `${mins} min`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours} h`
  return `${Math.round(hours / 24)} days`
}
