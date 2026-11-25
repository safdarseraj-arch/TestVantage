/**
 * Referral attribution, lead locks, commission ledger, and tier helpers.
 */

import {
  ACTIVE_OVERRIDE_DAYS,
  ASPIRANT_DISCOUNT_PCT,
  ATTRIBUTION_SOURCES,
  ATTR_WINDOW_DAYS,
  BASE_COMMISSION_PCT,
  COMMISSION_STATUS,
  CREATOR_TIERS,
  DEFAULT_REFUND_WINDOW_DAYS,
  FACULTY_TIERS,
  FREE_MOCK_LOCK_DAYS,
  MAX_OVERRIDE_LEVEL,
  MIN_PAYOUT_INR,
  OVERRIDE_L2_PCT,
  OVERRIDE_L3_PCT,
  PARTNER_TYPES,
  PAYOUT_CUTOFF_DAY,
  RECONCILE_LOCK_DAY,
  STUDENT_MILESTONES,
  UNI_TIERS,
  VIDEO_BOOST_RATE_PCT,
} from './referralConstants.js'
import {
  attributionStillValid,
  creditWallet,
  getPartnerByCode,
  getPartnerById,
  getPartnerByUserId,
  loadReferralStore,
  mutateReferralStore,
  newId,
  normalizeReferralCode,
  touchPartnerActive,
} from './referralStore.js'

function daysMs(d) {
  return d * 24 * 60 * 60 * 1000
}

function monthKey(ts = Date.now()) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function firstOfNextMonth(fromTs) {
  const d = new Date(fromTs)
  return new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0).getTime()
}

export function estimateNetRevenue(grossAmount, { gstPct = 18, gatewayPct = 2 } = {}) {
  const gross = Number(grossAmount) || 0
  const gst = (gross * gstPct) / (100 + gstPct)
  const afterGst = gross - gst
  const gateway = (afterGst * gatewayPct) / 100
  return Math.max(0, Math.round((afterGst - gateway) * 100) / 100)
}

export function pickTier(tiers, count) {
  const n = Number(count) || 0
  if (n <= 0) return { ...tiers[0], rate: BASE_COMMISSION_PCT, inactive: true }
  return tiers.find((t) => n >= t.min && n <= t.max) || tiers[tiers.length - 1]
}

export function resolvePartnerTier(partner, paidCountPeriod) {
  const type = partner?.partnerType
  if (type === PARTNER_TYPES.UNIVERSITY_STUDENT) return pickTier(UNI_TIERS, paidCountPeriod)
  if (type === PARTNER_TYPES.FACULTY) return pickTier(FACULTY_TIERS, paidCountPeriod)
  if (type === PARTNER_TYPES.VOLUNTARY_MARKETER) return pickTier(CREATOR_TIERS, paidCountPeriod)
  // Students: wallet credit band 10–15%
  if (paidCountPeriod >= 30) return { id: 'scholar', label: 'Scholarship', rate: 15 }
  if (paidCountPeriod >= 15) return { id: 'ambassador', label: 'Ambassador', rate: 12.5 }
  return { id: 'starter', label: 'Starter', rate: 10 }
}

export function countPaidInPeriod(partnerId, { month = true } = {}) {
  const store = loadReferralStore()
  const now = new Date()
  return store.commissions.filter((c) => {
    if (c.partnerId !== partnerId || c.commissionLevel !== 1) return false
    if (c.status === COMMISSION_STATUS.REVERSED) return false
    if (!month) return true
    const d = new Date(c.createdAt || 0)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  }).length
}

export function countPaidQuarter(partnerId) {
  const store = loadReferralStore()
  const now = new Date()
  const q = Math.floor(now.getMonth() / 3)
  return store.commissions.filter((c) => {
    if (c.partnerId !== partnerId || c.commissionLevel !== 1) return false
    if (c.status === COMMISSION_STATUS.REVERSED) return false
    const d = new Date(c.createdAt || 0)
    return d.getFullYear() === now.getFullYear() && Math.floor(d.getMonth() / 3) === q
  }).length
}

export function refreshPartnerTier(partnerId) {
  const partner = getPartnerById(partnerId)
  if (!partner) return null
  const periodCount =
    partner.partnerType === PARTNER_TYPES.UNIVERSITY_STUDENT
      ? countPaidInPeriod(partnerId, { month: true })
      : countPaidQuarter(partnerId)
  const tier = resolvePartnerTier(partner, periodCount)
  mutateReferralStore((s) => {
    const p = s.partners[partnerId]
    if (!p) return s
    p.tier = tier.id
    p.baseRatePct = tier.rate
    p.tierLabel = tier.label
    p.updatedAt = Date.now()
    return s
  })
  return tier
}

/**
 * Capture ?ref= / coupon into attribution cookie + store click.
 */
export function applyReferralCapture({
  code,
  source = ATTRIBUTION_SOURCES.LINK,
  videoId = null,
  utm = null,
}) {
  const partner = getPartnerByCode(code)
  if (!partner) return { ok: false, error: 'Referral code not found.' }

  const meta = {
    partnerId: partner.id,
    code: normalizeReferralCode(code),
    source,
    videoId,
    utm,
    capturedAt: Date.now(),
    expiresAt: Date.now() + daysMs(ATTR_WINDOW_DAYS),
  }

  try {
    localStorage.setItem('tv_ref', meta.code)
    localStorage.setItem('tv_ref_meta', JSON.stringify(meta))
  } catch {
    /* ignore */
  }

  mutateReferralStore((s) => {
    s.clicks = [
      {
        id: newId('click'),
        partnerId: partner.id,
        source,
        videoId,
        utm,
        at: Date.now(),
      },
      ...(s.clicks || []),
    ].slice(0, 5000)
    const p = s.partners[partner.id]
    if (p) {
      p.stats = { ...(p.stats || {}), clicks: (p.stats?.clicks || 0) + 1 }
      p.lastActiveAt = Date.now()
    }
    return s
  })

  return { ok: true, partner, meta }
}

export function readCapturedReferral() {
  try {
    const raw = localStorage.getItem('tv_ref_meta')
    if (!raw) {
      const code = localStorage.getItem('tv_ref')
      if (!code) return null
      const partner = getPartnerByCode(code)
      return partner
        ? {
            partnerId: partner.id,
            code: normalizeReferralCode(code),
            source: ATTRIBUTION_SOURCES.LINK,
            capturedAt: Date.now(),
            expiresAt: Date.now() + daysMs(ATTR_WINDOW_DAYS),
          }
        : null
    }
    const meta = JSON.parse(raw)
    if (!meta?.partnerId || !meta?.expiresAt || meta.expiresAt < Date.now()) return null
    return meta
  } catch {
    return null
  }
}

export function clearCapturedReferral() {
  try {
    localStorage.removeItem('tv_ref')
    localStorage.removeItem('tv_ref_meta')
  } catch {
    /* ignore */
  }
}

/**
 * On signup: lock attribution to the new user (anti self-referral).
 */
export function attributeSignup({
  referredUserId,
  inviteCode,
  referredEmail = '',
  referredPhone = '',
}) {
  if (!referredUserId) return { ok: false, error: 'Missing user.' }

  const captured = readCapturedReferral()
  let partner = null
  let source = ATTRIBUTION_SOURCES.INVITE

  if (inviteCode) {
    partner = getPartnerByCode(inviteCode)
    source = ATTRIBUTION_SOURCES.COUPON
  }
  if (!partner && captured?.partnerId) {
    partner = getPartnerById(captured.partnerId)
    source = captured.source || ATTRIBUTION_SOURCES.LINK
  }
  if (!partner) return { ok: false, error: 'No referral to attribute.' }

  // Self-referral guard
  if (partner.userId === referredUserId) {
    return { ok: false, error: 'Self-referral is not allowed.' }
  }
  if (
    referredEmail &&
    partner.email &&
    String(referredEmail).toLowerCase() === String(partner.email).toLowerCase()
  ) {
    return { ok: false, error: 'Self-referral email blocked.' }
  }

  const existing = loadReferralStore().attributions.find(
    (a) => a.referredUserId === referredUserId && a.targetType === 'b2c_student',
  )
  if (existing) return { ok: true, attribution: existing, already: true }

  const attribution = {
    id: newId('attr'),
    partnerId: partner.id,
    referredUserId,
    targetType: 'b2c_student',
    attributionSource: source,
    videoId: captured?.videoId || null,
    utmJson: captured?.utm || null,
    clickIpHash: '',
    deviceFp: '',
    attributedAt: Date.now(),
    aspirantDiscountPct: ASPIRANT_DISCOUNT_PCT,
    freeMocksGranted: 2,
  }

  mutateReferralStore((s) => {
    s.attributions = [attribution, ...s.attributions]
    const p = s.partners[partner.id]
    if (p) {
      p.stats = { ...(p.stats || {}), signups: (p.stats?.signups || 0) + 1 }
      p.lastActiveAt = Date.now()
    }
    return s
  })

  touchPartnerActive(partner.id)
  return { ok: true, attribution, partner }
}

/**
 * Free-mock-first 45-day lead lock.
 */
export function createFreeMockLeadLock({
  partnerId,
  aspirantUserId,
  examTrack = 'jee_main',
  freeMockId = 'diagnostic-nta',
}) {
  if (!partnerId || !aspirantUserId) {
    return { ok: false, error: 'Partner and aspirant required.' }
  }
  if (getPartnerById(partnerId)?.userId === aspirantUserId) {
    return { ok: false, error: 'Self-referral lock blocked.' }
  }

  const store = loadReferralStore()
  const active = store.leadLocks.find(
    (l) =>
      l.aspirantUserId === aspirantUserId &&
      l.status === 'active' &&
      l.lockExpiresAt > Date.now(),
  )
  if (active) {
    return { ok: true, lock: active, already: true }
  }

  const lock = {
    id: newId('lock'),
    partnerId,
    aspirantUserId,
    examTrack,
    freeMockId,
    lockedAt: Date.now(),
    lockExpiresAt: Date.now() + daysMs(FREE_MOCK_LOCK_DAYS),
    convertedOrderId: null,
    status: 'active',
  }

  mutateReferralStore((s) => {
    s.leadLocks = [lock, ...s.leadLocks]
    const p = s.partners[partnerId]
    if (p) {
      p.stats = {
        ...(p.stats || {}),
        freeMockLocks: (p.stats?.freeMockLocks || 0) + 1,
      }
    }
    // Ensure attribution exists
    const hasAttr = s.attributions.some(
      (a) => a.referredUserId === aspirantUserId && a.partnerId === partnerId,
    )
    if (!hasAttr) {
      s.attributions.unshift({
        id: newId('attr'),
        partnerId,
        referredUserId: aspirantUserId,
        targetType: 'b2c_student',
        attributionSource: ATTRIBUTION_SOURCES.FREE_MOCK,
        videoId: null,
        utmJson: null,
        clickIpHash: '',
        deviceFp: '',
        attributedAt: Date.now(),
        aspirantDiscountPct: ASPIRANT_DISCOUNT_PCT,
        freeMocksGranted: 2,
      })
    }
    return s
  })

  return { ok: true, lock }
}

function partnerOverrideEligible(partner) {
  if (!partner || partner.status !== 'active') return false
  if (!partner.activeOverrideEligible) return false
  if (partner.kycStatus === 'rejected') return false
  const last = Number(partner.lastActiveAt || partner.createdAt || 0)
  return Date.now() - last <= daysMs(ACTIVE_OVERRIDE_DAYS)
}

function ancestryPartnerIds(partner) {
  const path = String(partner?.ancestryPath || '')
    .split('.')
    .map((x) => x.trim())
    .filter(Boolean)
  const ids = []
  if (partner?.parentPartnerId) ids.push(partner.parentPartnerId)
  for (const id of path) {
    if (!ids.includes(id)) ids.push(id)
  }
  return ids.slice(0, MAX_OVERRIDE_LEVEL - 1)
}

/**
 * Record a paid conversion and create L1–L3 commissions.
 */
export function recordPaidConversion({
  referredUserId,
  orderId,
  grossAmount,
  gstAmount = null,
  refundWindowDays = DEFAULT_REFUND_WINDOW_DAYS,
  forcePartnerId = null,
  fromVideo = false,
}) {
  if (!referredUserId) return { ok: false, error: 'Missing referred user.' }
  const store = loadReferralStore()

  let attribution =
    store.attributions.find(
      (a) => a.referredUserId === referredUserId && a.targetType === 'b2c_student',
    ) || null

  // Fall back to active free-mock lock
  if (!attribution) {
    const lock = store.leadLocks.find(
      (l) =>
        l.aspirantUserId === referredUserId &&
        l.status === 'active' &&
        l.lockExpiresAt > Date.now(),
    )
    if (lock) {
      attribution = {
        id: newId('attr'),
        partnerId: lock.partnerId,
        referredUserId,
        targetType: 'b2c_student',
        attributionSource: ATTRIBUTION_SOURCES.FREE_MOCK,
        videoId: null,
        attributedAt: lock.lockedAt,
      }
      mutateReferralStore((s) => {
        s.attributions = [attribution, ...s.attributions]
        return s
      })
    }
  }

  if (forcePartnerId) {
    attribution = {
      id: attribution?.id || newId('attr'),
      partnerId: forcePartnerId,
      referredUserId,
      targetType: 'b2c_student',
      attributionSource: fromVideo ? ATTRIBUTION_SOURCES.VIDEO : ATTRIBUTION_SOURCES.LINK,
      videoId: attribution?.videoId || null,
      attributedAt: Date.now(),
    }
  }

  if (!attribution?.partnerId) {
    return { ok: false, error: 'No referral attribution for this user.' }
  }

  if (
    attribution.attributionSource !== ATTRIBUTION_SOURCES.FREE_MOCK &&
    !attributionStillValid(attribution.attributedAt, ATTR_WINDOW_DAYS)
  ) {
    const lock = store.leadLocks.find(
      (l) =>
        l.aspirantUserId === referredUserId &&
        l.partnerId === attribution.partnerId &&
        l.status === 'active' &&
        l.lockExpiresAt > Date.now(),
    )
    if (!lock) return { ok: false, error: 'Attribution window expired.' }
  }

  const l1Partner = getPartnerById(attribution.partnerId)
  if (!l1Partner) return { ok: false, error: 'Partner missing.' }
  if (l1Partner.userId === referredUserId) {
    return { ok: false, error: 'Self-referral conversion blocked.' }
  }

  // Circular chain: do not pay if referred user is already in partner ancestry
  const chain = [l1Partner.id, ...ancestryPartnerIds(l1Partner)]
  const referredAsPartner = getPartnerByUserId(referredUserId)
  if (referredAsPartner && chain.includes(referredAsPartner.id)) {
    return { ok: false, error: 'Circular referral blocked.' }
  }

  const existingOrder = store.commissions.find(
    (c) => c.orderOrContractId === orderId && c.commissionLevel === 1,
  )
  if (existingOrder) return { ok: true, commissions: [existingOrder], already: true }

  const gross = Number(grossAmount) || 0
  const gst =
    gstAmount != null ? Number(gstAmount) : Math.round(((gross * 18) / 118) * 100) / 100
  const net = estimateNetRevenue(gross)
  const paidAt = Date.now()
  const refundEnds = paidAt + daysMs(refundWindowDays)

  const videoBoost =
    fromVideo ||
    attribution.attributionSource === ATTRIBUTION_SOURCES.VIDEO ||
    Boolean(attribution.videoId)

  refreshPartnerTier(l1Partner.id)
  const fresh = getPartnerById(l1Partner.id)
  const periodCount =
    fresh.partnerType === PARTNER_TYPES.UNIVERSITY_STUDENT
      ? countPaidInPeriod(fresh.id, { month: true }) + 1
      : countPaidQuarter(fresh.id) + 1
  const tier = resolvePartnerTier(fresh, periodCount)
  const l1Rate = videoBoost ? VIDEO_BOOST_RATE_PCT : tier.rate
  const rateSource = videoBoost ? 'video_15' : 'standard_10'

  const rewardMode =
    fresh.partnerType === PARTNER_TYPES.STUDENT ? 'wallet_credit' : 'cash'

  const commissions = []

  const l1 = {
    id: newId('comm'),
    partnerId: fresh.id,
    attributionId: attribution.id,
    orderOrContractId: orderId,
    grossAmount: gross,
    gstAmount: gst,
    netRevenueBase: net,
    commissionLevel: 1,
    rateSource,
    commissionRatePct: l1Rate,
    commissionAmount: Math.round(((net * l1Rate) / 100) * 100) / 100,
    rewardMode,
    refundWindowEndsAt: refundEnds,
    refundClearedAt: null,
    payoutCycleMonth: monthKey(firstOfNextMonth(refundEnds)),
    eligiblePayoutDate: firstOfNextMonth(Math.max(refundEnds, paidAt)),
    status: COMMISSION_STATUS.PENDING_REFUND,
    createdAt: paidAt,
  }
  commissions.push(l1)

  // L2 / L3 overrides (faculty, creators, university only per PDF spirit)
  if (
    [
      PARTNER_TYPES.FACULTY,
      PARTNER_TYPES.VOLUNTARY_MARKETER,
      PARTNER_TYPES.UNIVERSITY_STUDENT,
    ].includes(fresh.partnerType)
  ) {
    const uplineIds = ancestryPartnerIds(fresh)
    const rates = [
      { level: 2, pct: OVERRIDE_L2_PCT, source: 'override_l2_5' },
      { level: 3, pct: OVERRIDE_L3_PCT, source: 'override_l3_2_5' },
    ]
    uplineIds.forEach((upid, idx) => {
      if (idx >= MAX_OVERRIDE_LEVEL - 1) return
      const up = getPartnerById(upid)
      if (!up || !partnerOverrideEligible(up)) return
      const rate = rates[idx]
      if (!rate) return
      commissions.push({
        id: newId('comm'),
        partnerId: up.id,
        attributionId: attribution.id,
        orderOrContractId: orderId,
        grossAmount: gross,
        gstAmount: gst,
        netRevenueBase: net,
        commissionLevel: rate.level,
        rateSource: rate.source,
        commissionRatePct: rate.pct,
        commissionAmount: Math.round(((net * rate.pct) / 100) * 100) / 100,
        rewardMode: 'cash',
        refundWindowEndsAt: refundEnds,
        refundClearedAt: null,
        payoutCycleMonth: monthKey(firstOfNextMonth(refundEnds)),
        eligiblePayoutDate: firstOfNextMonth(Math.max(refundEnds, paidAt)),
        status: COMMISSION_STATUS.PENDING_REFUND,
        createdAt: paidAt,
      })
    })
  }

  mutateReferralStore((s) => {
    s.commissions = [...commissions, ...s.commissions]
    const p = s.partners[fresh.id]
    if (p) {
      p.stats = {
        ...(p.stats || {}),
        paidConversions: (p.stats?.paidConversions || 0) + 1,
      }
      p.tier = tier.id
      p.baseRatePct = tier.rate
      p.lastActiveAt = Date.now()
    }
    const lockIdx = s.leadLocks.findIndex(
      (l) =>
        l.aspirantUserId === referredUserId &&
        l.partnerId === fresh.id &&
        l.status === 'active',
    )
    if (lockIdx >= 0) {
      s.leadLocks[lockIdx] = {
        ...s.leadLocks[lockIdx],
        status: 'converted',
        convertedOrderId: orderId,
      }
    }
    if (attribution.videoId) {
      const vIdx = s.videos.findIndex((v) => v.id === attribution.videoId)
      if (vIdx >= 0) {
        s.videos[vIdx].attributedConversions =
          (s.videos[vIdx].attributedConversions || 0) + 1
      }
    }
    return s
  })

  if (rewardMode === 'wallet_credit' && fresh.userId) {
    creditWallet(
      fresh.userId,
      l1.commissionAmount,
      `Referral wallet credit (pending unlock) · order ${orderId}`,
    )
  }

  maybeIssueCertificates(fresh.id)
  return { ok: true, commissions, partner: getPartnerById(fresh.id), tier }
}

/** Refund ⇒ reverse all L1/L2/L3 for that order. */
export function reverseCommissionsForOrder(orderId) {
  let count = 0
  mutateReferralStore((s) => {
    s.commissions = s.commissions.map((c) => {
      if (c.orderOrContractId !== orderId) return c
      if (c.status === COMMISSION_STATUS.REVERSED) return c
      count += 1
      return {
        ...c,
        status: COMMISSION_STATUS.REVERSED,
        commissionAmount: 0,
        refundClearedAt: Date.now(),
      }
    })
    return s
  })
  return { ok: true, reversed: count }
}

/**
 * Advance pending → eligible when refund window done and cutoff rules apply.
 */
export function reconcileCommissionStatuses(now = Date.now()) {
  const d = new Date(now)
  const day = d.getDate()
  let moved = 0
  mutateReferralStore((s) => {
    s.commissions = s.commissions.map((c) => {
      if (c.status !== COMMISSION_STATUS.PENDING_REFUND) return c
      if (now < Number(c.refundWindowEndsAt || 0)) return c
      const paidDay = new Date(c.createdAt || 0).getDate()
      // Gate 1: enrollment on/before 20th; Gate 2: refund cleared by reconcile lock (28th)
      const clearsThisCycle = paidDay <= PAYOUT_CUTOFF_DAY && day >= RECONCILE_LOCK_DAY
      const next = {
        ...c,
        refundClearedAt: now,
        status: COMMISSION_STATUS.ELIGIBLE,
        eligiblePayoutDate: firstOfNextMonth(now),
        payoutCycleMonth: monthKey(firstOfNextMonth(now)),
      }
      // Mid-month or post-cutoff enrollments: mark eligible; payout date rolls to next 1st
      if (!clearsThisCycle) {
        next.eligiblePayoutDate = firstOfNextMonth(Math.max(now, c.refundWindowEndsAt))
        next.payoutCycleMonth = monthKey(next.eligiblePayoutDate)
      }
      moved += 1
      return next
    })
    return s
  })
  return { ok: true, moved }
}

export function getEarningsBuckets(partnerId) {
  reconcileCommissionStatuses()
  const rows = loadReferralStore().commissions.filter((c) => c.partnerId === partnerId)
  const pending = rows.filter((c) => c.status === COMMISSION_STATUS.PENDING_REFUND)
  const eligible = rows.filter((c) => c.status === COMMISSION_STATUS.ELIGIBLE)
  const reversed = rows.filter((c) => c.status === COMMISSION_STATUS.REVERSED)
  const paid = rows.filter((c) => c.status === COMMISSION_STATUS.PAID)
  const sum = (list) =>
    Math.round(list.reduce((a, c) => a + Number(c.commissionAmount || 0), 0) * 100) / 100
  return {
    pending: { rows: pending, total: sum(pending) },
    eligible: { rows: eligible, total: sum(eligible) },
    reversed: { rows: reversed, total: sum(reversed) },
    paid: { rows: paid, total: sum(paid) },
    canPayout: sum(eligible) >= MIN_PAYOUT_INR,
    minPayoutInr: MIN_PAYOUT_INR,
  }
}

export function simulateDemoPayout(partnerId) {
  const buckets = getEarningsBuckets(partnerId)
  if (!buckets.canPayout) {
    return {
      ok: false,
      error: `Eligible balance must reach ₹${MIN_PAYOUT_INR} (demo).`,
    }
  }
  const total = buckets.eligible.total
  const tds = Math.round(total * 0.02 * 100) / 100
  const payout = {
    id: newId('pay'),
    partnerId,
    totalGross: total,
    tdsDeducted: tds,
    netDisbursed: Math.round((total - tds) * 100) / 100,
    payoutMode: 'upi',
    gatewayPayoutId: `demo_${Date.now()}`,
    status: 'processed_demo',
    processedAt: Date.now(),
  }
  mutateReferralStore((s) => {
    s.payouts = [payout, ...s.payouts]
    s.commissions = s.commissions.map((c) => {
      if (c.partnerId !== partnerId || c.status !== COMMISSION_STATUS.ELIGIBLE) return c
      return { ...c, status: COMMISSION_STATUS.PAID }
    })
    return s
  })
  return { ok: true, payout }
}

function maybeIssueCertificates(partnerId) {
  const partner = getPartnerById(partnerId)
  if (!partner || partner.partnerType !== PARTNER_TYPES.UNIVERSITY_STUDENT) return
  const paid = Number(partner.stats?.paidConversions || 0)
  const daysActive = Math.floor(
    (Date.now() - Number(partner.createdAt || Date.now())) / daysMs(1),
  )
  const store = loadReferralStore()
  const hasInternship = store.certificates.some(
    (c) => c.partnerId === partnerId && c.certificateType === 'internship',
  )
  if (!hasInternship && (paid >= 10 || daysActive >= 60)) {
    mutateReferralStore((s) => {
      s.certificates.unshift({
        id: newId('cert'),
        partnerId,
        certificateType: 'internship',
        verifiedConversionsCount: paid,
        verificationQrCode: `TV-CERT-${normalizeReferralCode(partner.referralCode)}`,
        pdfUrl: '',
        issuedAt: Date.now(),
      })
      return s
    })
  }
  if (paid >= 41) {
    const hasLor = store.certificates.some(
      (c) => c.partnerId === partnerId && c.certificateType === 'lor',
    )
    if (!hasLor) {
      mutateReferralStore((s) => {
        s.certificates.unshift({
          id: newId('cert'),
          partnerId,
          certificateType: 'lor',
          verifiedConversionsCount: paid,
          verificationQrCode: `TV-LOR-${normalizeReferralCode(partner.referralCode)}`,
          pdfUrl: '',
          issuedAt: Date.now(),
        })
        return s
      })
    }
  }
}

export function getStudentMilestones(partnerId) {
  const partner = getPartnerById(partnerId)
  const paid = Number(partner?.stats?.paidConversions || 0)
  return STUDENT_MILESTONES.map((m) => ({
    ...m,
    unlocked: paid >= m.at,
    progress: Math.min(paid, m.at),
  }))
}

export function summarizeLeadLocks(locks, now = Date.now()) {
  const active = []
  const expired = []
  for (const l of locks || []) {
    const expires = Number(l.lockExpiresAt || 0)
    const daysLeft = Math.ceil((expires - now) / daysMs(1))
    const row = { ...l, daysLeft }
    if (l.status === 'active' && expires > now) active.push(row)
    else expired.push(row)
  }
  active.sort((a, b) => a.lockExpiresAt - b.lockExpiresAt)
  return {
    active,
    expired,
    activeCount: active.length,
    expiredCount: expired.length,
    nextExpiryAt: active[0]?.lockExpiresAt || null,
    nextExpiryDays: active[0]?.daysLeft ?? null,
  }
}

export function getPromoterDashboard(partnerId) {
  const partner = getPartnerById(partnerId)
  if (!partner) return null
  const store = loadReferralStore()
  const buckets = getEarningsBuckets(partnerId)
  const locks = store.leadLocks.filter((l) => l.partnerId === partnerId)
  const lockSummary = summarizeLeadLocks(locks)
  const videos = store.videos.filter((v) => v.partnerId === partnerId)
  const leads = store.b2bLeads.filter((l) => l.partnerId === partnerId)
  const certs = store.certificates.filter((c) => c.partnerId === partnerId)
  const periodCount =
    partner.partnerType === PARTNER_TYPES.UNIVERSITY_STUDENT
      ? countPaidInPeriod(partnerId, { month: true })
      : countPaidQuarter(partnerId)
  const tier = resolvePartnerTier(partner, periodCount)
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const shareCode = partner.vanityCouponCode || partner.referralCode
  const micrositeLink = `${origin}/m/${partner.micrositeSlug}`
  const referralLink = `${origin}/?ref=${encodeURIComponent(shareCode)}`
  const inviteLoginLink = `${origin}/login?invite=${encodeURIComponent(shareCode)}`
  const nextUnlockRow = buckets.pending.rows
    .slice()
    .sort((a, b) => Number(a.refundWindowEndsAt || 0) - Number(b.refundWindowEndsAt || 0))[0]
  return {
    partner,
    tier,
    periodCount,
    buckets,
    locks,
    lockSummary,
    videos,
    leads,
    certs,
    nextUnlockAt: nextUnlockRow?.refundWindowEndsAt || null,
    milestones:
      partner.partnerType === PARTNER_TYPES.STUDENT
        ? getStudentMilestones(partnerId)
        : [],
    share: {
      referralLink,
      micrositeLink,
      inviteLoginLink,
      vanityCode: shareCode,
      referralCode: partner.referralCode,
      whatsappText: encodeURIComponent(
        `Try 2 free NTA-pattern JEE/NEET diagnostic mocks on TestVantages — use code ${shareCode} for 10% off.\n${micrositeLink}`,
      ),
    },
  }
}

/** Side-income calculator for campus landing. */
export function estimateCampusMonthlyIncome(paidReferrals, avgOrderInr = 4999) {
  const n = Math.max(0, Number(paidReferrals) || 0)
  const tier = pickTier(UNI_TIERS, n || 1)
  const netPer = estimateNetRevenue(avgOrderInr)
  const commission = Math.round(((netPer * tier.rate) / 100) * n)
  const bonus = n >= tier.min ? tier.bonusInr || 0 : 0
  // If rising/star thresholds met, use that tier's bonus
  let bonusInr = 0
  if (n >= 41) bonusInr = 3000
  else if (n >= 16) bonusInr = 1000
  return {
    paidReferrals: n,
    tier,
    commissionInr: commission,
    bonusInr: bonus || bonusInr,
    totalInr: commission + (bonus || bonusInr),
    avgOrderInr,
  }
}

export function listPendingVideosForAdmin() {
  return loadReferralStore().videos.filter((v) => v.approvalStatus === 'pending')
}

export function getAdminGrowthSnapshot() {
  const store = loadReferralStore()
  const partners = Object.values(store.partners)
  const byType = {}
  for (const t of Object.values(PARTNER_TYPES)) byType[t] = 0
  partners.forEach((p) => {
    byType[p.partnerType] = (byType[p.partnerType] || 0) + 1
  })
  const eligibleTotal = store.commissions
    .filter((c) => c.status === COMMISSION_STATUS.ELIGIBLE)
    .reduce((a, c) => a + Number(c.commissionAmount || 0), 0)
  return {
    partnerCount: partners.length,
    byType,
    pendingVideos: store.videos.filter((v) => v.approvalStatus === 'pending').length,
    featuredVideos: store.videos.filter((v) => v.isFeatured).length,
    openB2bLeads: store.b2bLeads.filter((l) => l.dealStage !== 'closed').length,
    eligiblePayoutTotal: Math.round(eligibleTotal * 100) / 100,
    attributions: store.attributions.length,
  }
}
