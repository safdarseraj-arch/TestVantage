/**
 * TestVantages referral / campus-earn constants (PDF Part 3 growth engine).
 * Rates are on Net Realized Revenue (gross − GST − gateway fees).
 */

export const PARTNER_TYPES = Object.freeze({
  STUDENT: 'student',
  FACULTY: 'faculty',
  VOLUNTARY_MARKETER: 'voluntary_marketer',
  UNIVERSITY_STUDENT: 'university_student',
})

export const PARTNER_TYPE_LABELS = Object.freeze({
  [PARTNER_TYPES.STUDENT]: 'School / B2C Student',
  [PARTNER_TYPES.FACULTY]: 'Faculty / Teacher',
  [PARTNER_TYPES.VOLUNTARY_MARKETER]: 'Voluntary Marketer / Creator',
  [PARTNER_TYPES.UNIVERSITY_STUDENT]: 'University / Campus Mentor (18+)',
})

/** Standard L1 rate; video-attributed L1 uses VIDEO_BOOST_RATE_PCT. */
export const BASE_COMMISSION_PCT = 10
export const VIDEO_BOOST_RATE_PCT = 15
export const OVERRIDE_L2_PCT = 5
export const OVERRIDE_L3_PCT = 2.5
/** Recommended production default from PDF: cap at L3. */
export const MAX_OVERRIDE_LEVEL = 3

export const ATTR_WINDOW_DAYS = 30
export const FREE_MOCK_LOCK_DAYS = 45
export const B2B_LEAD_LOCK_DAYS = 60
export const ACTIVE_OVERRIDE_DAYS = 90
export const DEFAULT_REFUND_WINDOW_DAYS = 14
export const PAYOUT_CUTOFF_DAY = 20
export const RECONCILE_LOCK_DAY = 28
export const MIN_PAYOUT_INR = 300
export const ASPIRANT_DISCOUNT_PCT = 10
export const FREE_MOCK_COUNT = 2

/** Channels users can enable for manual + auto-share. */
export const SHARE_CHANNELS = Object.freeze({
  WHATSAPP: 'whatsapp',
  FACEBOOK: 'facebook',
  X: 'x',
  INSTAGRAM: 'instagram',
  SYSTEM: 'system',
})

export const SHARE_CHANNEL_LABELS = Object.freeze({
  [SHARE_CHANNELS.WHATSAPP]: 'WhatsApp',
  [SHARE_CHANNELS.FACEBOOK]: 'Facebook',
  [SHARE_CHANNELS.X]: 'X (Twitter)',
  [SHARE_CHANNELS.INSTAGRAM]: 'Instagram',
  [SHARE_CHANNELS.SYSTEM]: 'Device share',
})

/** Hours between simulated auto-shares when consent is on. */
export const AUTO_SHARE_INTERVAL_HOURS = 24

/** University monthly tiers (paid conversions / month). */
export const UNI_TIERS = Object.freeze([
  { id: 'starter', label: 'Starter', min: 1, max: 15, rate: 10, bonusInr: 0 },
  { id: 'rising', label: 'Rising Mentor', min: 16, max: 40, rate: 12.5, bonusInr: 1000 },
  { id: 'star', label: 'Campus Star', min: 41, max: Infinity, rate: 15, bonusInr: 3000 },
])

/** Voluntary marketer quarterly tiers. */
export const CREATOR_TIERS = Object.freeze([
  { id: 'bronze', label: 'Bronze', min: 1, max: 25, rate: 10 },
  { id: 'silver', label: 'Silver', min: 26, max: 100, rate: 12.5 },
  { id: 'gold', label: 'Gold', min: 101, max: Infinity, rate: 15 },
])

/** Faculty quarterly tiers. */
export const FACULTY_TIERS = Object.freeze([
  { id: 'base', label: 'Base', min: 1, max: 24, rate: 10 },
  { id: 'growth', label: 'Growth', min: 25, max: 74, rate: 12.5 },
  { id: 'elite', label: 'Elite', min: 75, max: Infinity, rate: 15 },
])

/** Student wallet milestones (paid referred conversions). */
export const STUDENT_MILESTONES = Object.freeze([
  { at: 5, reward: 'free_1yr_pack', label: 'Free 1-Year Pack' },
  { at: 15, reward: 'ambassador_cert', label: 'Ambassador Certificate + Merch' },
  { at: 30, reward: 'cash_scholarship', label: 'Cash Scholarship (parent KYC)' },
])

export const COMMISSION_STATUS = Object.freeze({
  PENDING_REFUND: 'pending_refund_period',
  ELIGIBLE: 'eligible_for_payout',
  PAID: 'paid',
  REVERSED: 'reversed_refund',
  CLAWBACK: 'clawback_offset',
})

export const ATTRIBUTION_SOURCES = Object.freeze({
  LINK: 'link',
  COUPON: 'coupon',
  VIDEO: 'video',
  FREE_MOCK: 'free_mock',
  B2B_LEAD: 'b2b_lead',
  INVITE: 'invite',
})

export const REF_COOKIE_KEY = 'tv_ref'
export const REF_COOKIE_META_KEY = 'tv_ref_meta'
export const REF_STORE_KEY = 'testvantage-referral-v1'
export const WALLET_STORE_KEY = 'testvantage-referral-wallet-v1'

export const ELITE_COLLEGE_HINTS = Object.freeze([
  'iit',
  'nit',
  'iiit',
  'bits',
  'aiims',
  'mbbs',
  'government medical',
])
