/**
 * Captures ?ref= / ?invite= / ?coupon= into a 30-day attribution cookie (localStorage).
 * Mount once under the router.
 */

import { useEffect } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { ATTRIBUTION_SOURCES } from '../utils/referralConstants.js'
import { applyReferralCapture } from '../utils/referralEngine.js'
import { recordClick } from '../utils/referralStore.js'

export default function ReferralCapture() {
  const [params] = useSearchParams()
  const location = useLocation()

  useEffect(() => {
    const code =
      params.get('ref') || params.get('invite') || params.get('coupon') || params.get('code')
    if (!code) return
    const source = params.get('video')
      ? ATTRIBUTION_SOURCES.VIDEO
      : params.get('coupon')
        ? ATTRIBUTION_SOURCES.COUPON
        : ATTRIBUTION_SOURCES.LINK
    const result = applyReferralCapture({
      code,
      source,
      videoId: params.get('video') || null,
      utm: {
        utm_source: params.get('utm_source'),
        utm_medium: params.get('utm_medium'),
        utm_campaign: params.get('utm_campaign'),
      },
    })
    if (result.ok && location.pathname.startsWith('/m/')) {
      recordClick({ partnerId: result.partner.id, source: 'microsite' })
    }
  }, [params, location.pathname])

  return null
}
