/**
 * Optional sync of referral store with Node app server (same pattern as Peer Pulse).
 */

import {
  ensureRemotePartner,
  ensureRemoteVideo,
  loadReferralStore,
  mergeServerReferralPayload,
  saveReferralStore,
} from './referralStore.js'

function apiBase() {
  if (typeof window === 'undefined') return ''
  return ''
}

export async function pullReferralFromServer() {
  try {
    const res = await fetch(`${apiBase()}/api/referral/store`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return loadReferralStore()
    const data = await res.json()
    if (data?.store) return mergeServerReferralPayload(data.store)
    return loadReferralStore()
  } catch {
    return loadReferralStore()
  }
}

export async function pushReferralToServer() {
  const store = loadReferralStore()
  try {
    const res = await fetch(`${apiBase()}/api/referral/store`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ store }),
    })
    if (!res.ok) return { ok: false }
    const data = await res.json()
    if (data?.store) saveReferralStore(data.store)
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export async function syncReferralStore() {
  await pullReferralFromServer()
  return pushReferralToServer()
}

/** Cold mentor page: resolve partner by slug when local store is empty. */
export async function fetchPartnerBySlug(slug) {
  const clean = String(slug || '').trim()
  if (!clean) return null
  try {
    const res = await fetch(`${apiBase()}/api/referral/partner?slug=${encodeURIComponent(clean)}`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data?.partner) return null
    ensureRemotePartner(data.partner)
    return data.partner
  } catch {
    return null
  }
}

/** Cold video page: resolve tracking slug when local store is empty. */
export async function fetchVideoBySlug(slug) {
  const clean = String(slug || '').trim()
  if (!clean) return null
  try {
    const res = await fetch(`${apiBase()}/api/referral/video?slug=${encodeURIComponent(clean)}`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data?.video) return null
    ensureRemoteVideo(data.video)
    const code = String(data.video.linkedCouponCode || '').trim()
    if (code) {
      try {
        const pRes = await fetch(
          `${apiBase()}/api/referral/partner?code=${encodeURIComponent(code)}`,
          { headers: { Accept: 'application/json' } },
        )
        if (pRes.ok) {
          const pData = await pRes.json()
          if (pData?.partner) ensureRemotePartner(pData.partner)
        }
      } catch {
        /* partner optional */
      }
    } else if (data.video.partnerId) {
      // Fall back to full store pull so partner row lands locally for attribution.
      await pullReferralFromServer().catch(() => {})
    }
    return data.video
  } catch {
    return null
  }
}
