/**
 * Local referral / promo data (mirrors PDF PostgreSQL schema shape).
 * Syncs to Node file store when the app server is available.
 */

import {
  ATTR_WINDOW_DAYS,
  AUTO_SHARE_INTERVAL_HOURS,
  BASE_COMMISSION_PCT,
  PARTNER_TYPES,
  REF_STORE_KEY,
  SHARE_CHANNELS,
  WALLET_STORE_KEY,
} from './referralConstants.js'

const EMPTY = () => ({
  partners: {},
  attributions: [],
  leadLocks: [],
  commissions: [],
  payouts: [],
  videos: [],
  b2bLeads: [],
  certificates: [],
  shareConsents: [],
  autoShareLogs: [],
  clicks: [],
  updatedAt: 0,
})

function safeParse(raw, fallback) {
  try {
    const v = JSON.parse(raw)
    return v && typeof v === 'object' ? v : fallback
  } catch {
    return fallback
  }
}

export function loadReferralStore() {
  if (typeof localStorage === 'undefined') return EMPTY()
  const data = safeParse(localStorage.getItem(REF_STORE_KEY), null)
  if (!data) return EMPTY()
  return {
    ...EMPTY(),
    ...data,
    partners: data.partners && typeof data.partners === 'object' ? data.partners : {},
    attributions: Array.isArray(data.attributions) ? data.attributions : [],
    leadLocks: Array.isArray(data.leadLocks) ? data.leadLocks : [],
    commissions: Array.isArray(data.commissions) ? data.commissions : [],
    payouts: Array.isArray(data.payouts) ? data.payouts : [],
    videos: Array.isArray(data.videos) ? data.videos : [],
    b2bLeads: Array.isArray(data.b2bLeads) ? data.b2bLeads : [],
    certificates: Array.isArray(data.certificates) ? data.certificates : [],
    shareConsents: Array.isArray(data.shareConsents) ? data.shareConsents : [],
    autoShareLogs: Array.isArray(data.autoShareLogs) ? data.autoShareLogs : [],
    clicks: Array.isArray(data.clicks) ? data.clicks : [],
  }
}

export function saveReferralStore(data) {
  const next = { ...EMPTY(), ...data, updatedAt: Date.now() }
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(REF_STORE_KEY, JSON.stringify(next))
  }
  return next
}

export function mutateReferralStore(mutator) {
  const current = loadReferralStore()
  const draft = structuredClone
    ? structuredClone(current)
    : JSON.parse(JSON.stringify(current))
  const result = mutator(draft) ?? draft
  return saveReferralStore(result)
}

export function newId(prefix = 'rf') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

function codeAlphabetHash(seed) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let h = 2166136261
  const s = String(seed)
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  let n = h >>> 0
  let out = ''
  for (let i = 0; i < 6; i += 1) {
    out += alphabet[n % alphabet.length]
    n = Math.floor(n / alphabet.length)
  }
  return out
}

export function normalizeReferralCode(code) {
  return String(code ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '')
    .slice(0, 24)
}

export function buildVanityCoupon({ name, college, partnerType }) {
  const first = String(name || 'MENTOR')
    .trim()
    .split(/\s+/)[0]
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 10) || 'MENTOR'
  if (partnerType === PARTNER_TYPES.UNIVERSITY_STUDENT) {
    const tag = String(college || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 8)
    return normalizeReferralCode(tag ? `${first}_${tag}` : `${first}10`)
  }
  if (partnerType === PARTNER_TYPES.FACULTY) {
    return normalizeReferralCode(`${first}SIR10`.slice(0, 16))
  }
  return normalizeReferralCode(`${first}10`)
}

export function getPartnerByUserId(userId) {
  if (!userId) return null
  const store = loadReferralStore()
  return Object.values(store.partners).find((p) => p.userId === userId) ?? null
}

export function getPartnerByCode(code) {
  const needle = normalizeReferralCode(code)
  if (needle.length < 3) return null
  const store = loadReferralStore()
  return (
    Object.values(store.partners).find((p) => {
      if (p.status === 'disabled') return false
      return (
        normalizeReferralCode(p.referralCode) === needle ||
        normalizeReferralCode(p.vanityCouponCode) === needle
      )
    }) ?? null
  )
}

export function getPartnerBySlug(slug) {
  const needle = String(slug || '')
    .trim()
    .toLowerCase()
  if (!needle) return null
  const store = loadReferralStore()
  return (
    Object.values(store.partners).find(
      (p) => String(p.micrositeSlug || '').toLowerCase() === needle,
    ) ?? null
  )
}

export function getPartnerById(id) {
  if (!id) return null
  return loadReferralStore().partners[id] ?? null
}

/**
 * Create or update a referral partner for the signed-in user.
 */
export function upsertPartner({
  userId,
  name,
  email,
  partnerType = PARTNER_TYPES.STUDENT,
  collegeName = '',
  collegeEmail = '',
  degree = '',
  gradYear = '',
  examCredentialBadge = '',
  parentPartnerCode = '',
  studentIdDocUrl = '',
  displayName = '',
}) {
  if (!userId) return { ok: false, error: 'Sign in first.' }
  const typeOk = Object.values(PARTNER_TYPES).includes(partnerType)
  if (!typeOk) return { ok: false, error: 'Pick a promoter type.' }

  let parentPartnerId = null
  let ancestryPath = ''
  if (parentPartnerCode) {
    const parent = getPartnerByCode(parentPartnerCode)
    if (parent) {
      if (parent.userId === userId) {
        return { ok: false, error: 'You cannot refer yourself as parent partner.' }
      }
      parentPartnerId = parent.id
      ancestryPath = parent.ancestryPath
        ? `${parent.ancestryPath}.${parent.id}`
        : String(parent.id)
    }
  }

  const existing = getPartnerByUserId(userId)
  const store = loadReferralStore()

  if (existing) {
    const next = {
      ...existing,
      name: name || existing.name,
      email: email || existing.email,
      partnerType,
      collegeName: collegeName || existing.collegeName,
      collegeEmail: collegeEmail || existing.collegeEmail,
      collegeEmailVerified: Boolean(
        collegeEmail &&
          (/\.ac\.in$/i.test(collegeEmail) || /\.edu\.in$/i.test(collegeEmail)),
      ),
      degree: degree || existing.degree,
      gradYear: gradYear || existing.gradYear,
      examCredentialBadge: examCredentialBadge || existing.examCredentialBadge,
      studentIdDocUrl: studentIdDocUrl || existing.studentIdDocUrl,
      displayName: displayName || existing.displayName || name,
      lastActiveAt: Date.now(),
      updatedAt: Date.now(),
    }
    if (!existing.parentPartnerId && parentPartnerId) {
      next.parentPartnerId = parentPartnerId
      next.ancestryPath = ancestryPath
    }
    store.partners[existing.id] = next
    saveReferralStore(store)
    return { ok: true, partner: next }
  }

  const id = newId('partner')
  const baseName = displayName || name || 'Partner'
  let micrositeSlug = slugify(`${baseName}-${collegeName || partnerType}`) || `mentor-${codeAlphabetHash(userId)}`
  let guard = 0
  while (getPartnerBySlug(micrositeSlug) && guard < 20) {
    micrositeSlug = `${micrositeSlug}-${codeAlphabetHash(`${userId}${guard}`).slice(0, 3).toLowerCase()}`
    guard += 1
  }

  let referralCode = `TV${codeAlphabetHash(userId)}`
  let vanity = buildVanityCoupon({ name: baseName, college: collegeName, partnerType })
  // Ensure uniqueness
  const used = new Set(
    Object.values(store.partners).flatMap((p) => [
      normalizeReferralCode(p.referralCode),
      normalizeReferralCode(p.vanityCouponCode),
    ]),
  )
  if (used.has(normalizeReferralCode(referralCode))) {
    referralCode = `TV${codeAlphabetHash(`${userId}-alt`)}`
  }
  if (used.has(normalizeReferralCode(vanity))) {
    vanity = `${vanity}${codeAlphabetHash(id).slice(0, 2)}`
  }

  const partner = {
    id,
    userId,
    tenantId: null,
    parentPartnerId,
    ancestryPath,
    partnerType,
    name: name || baseName,
    email: email || '',
    displayName: baseName,
    collegeName: collegeName || '',
    collegeEmail: collegeEmail || '',
    collegeEmailVerified: Boolean(
      collegeEmail &&
        (/\.ac\.in$/i.test(collegeEmail) || /\.edu\.in$/i.test(collegeEmail)),
    ),
    degree: degree || '',
    gradYear: gradYear || '',
    studentIdDocUrl: studentIdDocUrl || '',
    examCredentialBadge: examCredentialBadge || '',
    micrositeSlug,
    referralCode: normalizeReferralCode(referralCode),
    vanityCouponCode: normalizeReferralCode(vanity),
    tier: partnerType === PARTNER_TYPES.UNIVERSITY_STUDENT ? 'starter' : 'bronze',
    baseRatePct: BASE_COMMISSION_PCT,
    kycStatus: 'not_started',
    panMasked: '',
    payoutAccountJson: null,
    lastActiveAt: Date.now(),
    activeOverrideEligible: true,
    status: 'active',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    stats: {
      clicks: 0,
      signups: 0,
      freeMockLocks: 0,
      paidConversions: 0,
      micrositeVisits: 0,
    },
  }

  store.partners[id] = partner
  saveReferralStore(store)
  return { ok: true, partner }
}

export function touchPartnerActive(partnerId) {
  mutateReferralStore((s) => {
    const p = s.partners[partnerId]
    if (p) {
      p.lastActiveAt = Date.now()
      p.activeOverrideEligible = true
    }
    return s
  })
}

export function recordClick({ partnerId, source = 'link', videoId = null, utm = null }) {
  if (!partnerId) return null
  const click = {
    id: newId('click'),
    partnerId,
    source,
    videoId,
    utm,
    at: Date.now(),
  }
  mutateReferralStore((s) => {
    s.clicks = [click, ...(s.clicks || [])].slice(0, 5000)
    const p = s.partners[partnerId]
    if (p) {
      p.stats = { ...(p.stats || {}), clicks: (p.stats?.clicks || 0) + 1 }
      if (source === 'microsite') {
        p.stats.micrositeVisits = (p.stats.micrositeVisits || 0) + 1
      }
      p.lastActiveAt = Date.now()
    }
    return s
  })
  return click
}

export function listFeaturedVideos() {
  return loadReferralStore()
    .videos.filter((v) => v.approvalStatus === 'approved' && v.isFeatured)
    .sort((a, b) => (a.spotlightRank ?? 99) - (b.spotlightRank ?? 99))
}

export function listApprovedVideos() {
  return loadReferralStore()
    .videos.filter((v) => v.approvalStatus === 'approved')
    .sort((a, b) => (b.attributedConversions || 0) - (a.attributedConversions || 0))
}

export function getVideoBySlug(slug) {
  const needle = String(slug || '').trim().toLowerCase()
  if (!needle) return null
  return (
    loadReferralStore().videos.find(
      (v) => String(v.videoTrackingSlug || '').toLowerCase() === needle,
    ) ?? null
  )
}

export function submitPromoVideo({
  partnerId,
  title,
  platform = 'youtube',
  videoUrl,
  creatorChannelUrl = '',
}) {
  const partner = getPartnerById(partnerId)
  if (!partner) return { ok: false, error: 'Become a promoter first.' }
  const url = String(videoUrl || '').trim()
  if (!url) return { ok: false, error: 'Paste a YouTube / Shorts / Reels URL.' }
  const titleClean = String(title || '').trim() || 'Promo video'
  const slug = `${slugify(titleClean) || 'video'}-${codeAlphabetHash(url).slice(0, 4).toLowerCase()}`

  let embedId = ''
  const yt = url.match(/(?:youtu\.be\/|v=|shorts\/)([A-Za-z0-9_-]{6,})/)
  if (yt) embedId = yt[1]

  const video = {
    id: newId('video'),
    partnerId,
    title: titleClean,
    platform,
    videoUrl: url,
    embedId,
    videoTrackingSlug: slug,
    creatorChannelUrl: creatorChannelUrl || '',
    linkedCouponCode: partner.vanityCouponCode,
    commissionBoostRatePct: 15,
    approvalStatus: 'pending',
    isFeatured: false,
    spotlightRank: 99,
    viewClicks: 0,
    attributedConversions: 0,
    createdAt: Date.now(),
  }

  mutateReferralStore((s) => {
    s.videos = [video, ...s.videos]
    return s
  })
  return { ok: true, video }
}

export function setVideoApproval(videoId, { approvalStatus, isFeatured = false, spotlightRank = 99 }) {
  let updated = null
  mutateReferralStore((s) => {
    const idx = s.videos.findIndex((v) => v.id === videoId)
    if (idx < 0) return s
    s.videos[idx] = {
      ...s.videos[idx],
      approvalStatus,
      isFeatured: Boolean(isFeatured),
      spotlightRank: Number(spotlightRank) || 99,
      reviewedAt: Date.now(),
    }
    updated = s.videos[idx]
    return s
  })
  return updated ? { ok: true, video: updated } : { ok: false, error: 'Video not found.' }
}

export function addB2bSchoolLead({
  partnerId,
  schoolName,
  city,
  contactName,
  contactMobile,
}) {
  if (!partnerId) return { ok: false, error: 'Become a promoter first.' }
  if (!String(schoolName || '').trim()) return { ok: false, error: 'School name is required.' }
  const lead = {
    id: newId('b2b'),
    partnerId,
    schoolName: String(schoolName).trim(),
    city: String(city || '').trim(),
    contactName: String(contactName || '').trim(),
    contactMobile: String(contactMobile || '').trim(),
    lockExpiresAt: Date.now() + B2B_LEAD_LOCK_MS(),
    dealStage: 'new',
    signedTenantId: null,
    createdAt: Date.now(),
  }
  mutateReferralStore((s) => {
    s.b2bLeads = [lead, ...s.b2bLeads]
    return s
  })
  return { ok: true, lead }
}

function B2B_LEAD_LOCK_MS() {
  return 60 * 24 * 60 * 60 * 1000
}

export function attributionStillValid(attributedAt, days = ATTR_WINDOW_DAYS) {
  return Date.now() - Number(attributedAt || 0) <= days * 24 * 60 * 60 * 1000
}

/* ——— Wallet (student credits) ——— */

export function loadWalletStore() {
  if (typeof localStorage === 'undefined') return { balances: {}, ledger: [] }
  return safeParse(localStorage.getItem(WALLET_STORE_KEY), { balances: {}, ledger: [] })
}

export function saveWalletStore(data) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(WALLET_STORE_KEY, JSON.stringify(data))
  }
  return data
}

export function getWalletBalance(userId) {
  if (!userId) return 0
  return Number(loadWalletStore().balances?.[userId] || 0)
}

export function creditWallet(userId, amountInr, note = '') {
  if (!userId || !(amountInr > 0)) return getWalletBalance(userId)
  const store = loadWalletStore()
  store.balances = store.balances || {}
  store.ledger = store.ledger || []
  store.balances[userId] = Number(store.balances[userId] || 0) + amountInr
  store.ledger.unshift({
    id: newId('wal'),
    userId,
    amountInr,
    note,
    at: Date.now(),
  })
  store.ledger = store.ledger.slice(0, 2000)
  saveWalletStore(store)
  return store.balances[userId]
}

export function mergeServerReferralPayload(payload) {
  if (!payload || typeof payload !== 'object') return loadReferralStore()
  const local = loadReferralStore()
  const remoteUpdated = Number(payload.updatedAt || 0)
  if (remoteUpdated && remoteUpdated > Number(local.updatedAt || 0)) {
    return saveReferralStore({ ...EMPTY(), ...payload })
  }
  // Prefer richer local if newer
  return local
}

const DEFAULT_CHANNELS = [
  SHARE_CHANNELS.WHATSAPP,
  SHARE_CHANNELS.FACEBOOK,
  SHARE_CHANNELS.X,
]

function autoShareIntervalMs() {
  return Math.max(1, Number(AUTO_SHARE_INTERVAL_HOURS) || 24) * 60 * 60 * 1000
}

export function getShareConsent(userId) {
  if (!userId) return null
  return loadReferralStore().shareConsents.find((c) => c.userId === userId) ?? null
}

export function setShareConsent({
  userId,
  partnerId = null,
  enabled,
  channels,
  preferredTemplateId = null,
  preferredVideoId = null,
}) {
  if (!userId) return { ok: false, error: 'Sign in first.' }
  const cleanChannels = (Array.isArray(channels) ? channels : DEFAULT_CHANNELS)
    .map((c) => String(c || '').toLowerCase())
    .filter(Boolean)
  const unique = [...new Set(cleanChannels.length ? cleanChannels : DEFAULT_CHANNELS)]
  const now = Date.now()
  let saved = null
  mutateReferralStore((s) => {
    s.shareConsents = Array.isArray(s.shareConsents) ? s.shareConsents : []
    const idx = s.shareConsents.findIndex((c) => c.userId === userId)
    const prev = idx >= 0 ? s.shareConsents[idx] : null
    const on = Boolean(enabled)
    const next = {
      userId,
      partnerId: partnerId || prev?.partnerId || null,
      enabled: on,
      channels: unique,
      preferredTemplateId:
        preferredTemplateId !== undefined
          ? preferredTemplateId
          : prev?.preferredTemplateId || null,
      preferredVideoId:
        preferredVideoId !== undefined ? preferredVideoId : prev?.preferredVideoId || null,
      nextShareAt: on ? prev?.nextShareAt && prev.nextShareAt > now ? prev.nextShareAt : now + autoShareIntervalMs() : null,
      lastAutoShareAt: prev?.lastAutoShareAt || null,
      lastAutoShareNote: prev?.lastAutoShareNote || '',
      updatedAt: now,
    }
    if (idx >= 0) s.shareConsents[idx] = next
    else s.shareConsents.unshift(next)
    saved = next
    return s
  })
  return { ok: true, consent: saved }
}

/** Own approved videos only — never substitute other creators' reels as "yours". */
export function listApprovedVideosForPartner(partnerId) {
  if (!partnerId) return []
  return listApprovedVideos().filter((v) => v.partnerId === partnerId)
}

/** Featured / spotlight reels from other creators (gallery inspiration strip). */
export function listFeaturedApprovedVideos({ excludePartnerId = null, limit = 6 } = {}) {
  return listApprovedVideos()
    .filter((v) => v.partnerId !== excludePartnerId)
    .sort((a, b) => {
      const feat = Number(Boolean(b.isFeatured)) - Number(Boolean(a.isFeatured))
      if (feat) return feat
      return (b.spotlightRank || 0) - (a.spotlightRank || 0) || (b.viewClicks || 0) - (a.viewClicks || 0)
    })
    .slice(0, Math.max(0, limit))
}

/** Seed a partner fetched from the server so cold /m/ visitors can attribute. */
export function ensureRemotePartner(partner) {
  if (!partner?.id) return { ok: false, error: 'Missing partner.' }
  let saved = null
  mutateReferralStore((s) => {
    const prev = s.partners[partner.id]
    saved = prev ? { ...prev, ...partner, stats: { ...(prev.stats || {}), ...(partner.stats || {}) } } : partner
    s.partners[partner.id] = saved
    return s
  })
  return { ok: true, partner: saved }
}

/** Seed a video fetched from the server so cold /v/ visitors can attribute. */
export function ensureRemoteVideo(video) {
  if (!video?.id) return { ok: false, error: 'Missing video.' }
  let saved = null
  mutateReferralStore((s) => {
    const idx = s.videos.findIndex((v) => v.id === video.id)
    if (idx >= 0) {
      saved = { ...s.videos[idx], ...video }
      s.videos[idx] = saved
    } else {
      saved = video
      s.videos = [video, ...s.videos]
    }
    return s
  })
  return { ok: true, video: saved }
}

/**
 * MVP auto-share: when consent is on and nextShareAt has passed, log a simulated
 * share and schedule the next one. No OAuth — ready for real connectors later.
 */
export function runAutoShareSimulation(userId, { force = false, message = '' } = {}) {
  const consent = getShareConsent(userId)
  if (!consent?.enabled && !force) {
    return { ok: false, error: 'Turn on auto-share consent first.' }
  }
  const now = Date.now()
  if (!force && consent?.nextShareAt && consent.nextShareAt > now) {
    return {
      ok: false,
      error: 'Next auto-share is still scheduled.',
      consent,
      dueInMs: consent.nextShareAt - now,
    }
  }
  const channel = (consent?.channels || DEFAULT_CHANNELS)[0] || SHARE_CHANNELS.WHATSAPP
  const note =
    String(message || '').trim() ||
    `Simulated auto-share to ${channel} (no OAuth yet — logged for queue).`
  const entry = {
    id: newId('ashare'),
    userId,
    partnerId: consent?.partnerId || null,
    channel,
    templateId: consent?.preferredTemplateId || null,
    videoId: consent?.preferredVideoId || null,
    note,
    simulated: true,
    at: now,
  }
  let updatedConsent = null
  mutateReferralStore((s) => {
    s.autoShareLogs = [entry, ...(s.autoShareLogs || [])].slice(0, 200)
    const idx = (s.shareConsents || []).findIndex((c) => c.userId === userId)
    if (idx >= 0) {
      s.shareConsents[idx] = {
        ...s.shareConsents[idx],
        lastAutoShareAt: now,
        lastAutoShareNote: note,
        nextShareAt: now + autoShareIntervalMs(),
        updatedAt: now,
      }
      updatedConsent = s.shareConsents[idx]
    }
    return s
  })
  return { ok: true, log: entry, consent: updatedConsent || getShareConsent(userId) }
}

export function listAutoShareLogs(userId, limit = 10) {
  const rows = loadReferralStore().autoShareLogs || []
  const filtered = userId ? rows.filter((r) => r.userId === userId) : rows
  return filtered.slice(0, Math.max(1, limit))
}
