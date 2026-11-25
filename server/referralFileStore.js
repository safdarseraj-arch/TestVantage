/**
 * File-backed referral / promo store (Phase 1–2 MVP).
 * Mirrors the PDF schema shape without requiring Postgres migrations yet.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const SERVER_DIR = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.TESTVANTAGE_BANK_DATA_DIR || join(SERVER_DIR, 'data')
const REF_FILE = join(DATA_DIR, 'referral-data.json')

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
  clicks: [],
  updatedAt: 0,
})

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
}

function loadRaw() {
  ensureDataDir()
  if (!existsSync(REF_FILE)) return EMPTY()
  try {
    const parsed = JSON.parse(readFileSync(REF_FILE, 'utf8'))
    return { ...EMPTY(), ...parsed }
  } catch {
    return EMPTY()
  }
}

function saveRaw(data) {
  ensureDataDir()
  const next = { ...EMPTY(), ...data, updatedAt: Date.now() }
  writeFileSync(REF_FILE, JSON.stringify(next), 'utf8')
  return next
}

export function loadReferralFile() {
  return loadRaw()
}

export function saveReferralFile(store) {
  if (!store || typeof store !== 'object') {
    throw new Error('store object required')
  }
  const current = loadRaw()
  const incomingUpdated = Number(store.updatedAt || 0)
  const currentUpdated = Number(current.updatedAt || 0)
  // Last-write-wins by updatedAt; merge partners by id when remote is newer field-wise
  if (incomingUpdated >= currentUpdated) {
    return saveRaw(store)
  }
  return current
}

export function getPartnerByCodeFile(code) {
  const needle = String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '')
  if (needle.length < 3) return null
  const store = loadRaw()
  return (
    Object.values(store.partners || {}).find((p) => {
      if (p.status === 'disabled') return false
      const a = String(p.referralCode || '')
        .trim()
        .toUpperCase()
      const b = String(p.vanityCouponCode || '')
        .trim()
        .toUpperCase()
      return a === needle || b === needle
    }) ?? null
  )
}

export function getPartnerBySlugFile(slug) {
  const needle = String(slug || '')
    .trim()
    .toLowerCase()
  if (!needle) return null
  const store = loadRaw()
  return (
    Object.values(store.partners || {}).find(
      (p) => String(p.micrositeSlug || '').toLowerCase() === needle,
    ) ?? null
  )
}

export function getVideoBySlugFile(slug) {
  const needle = String(slug || '')
    .trim()
    .toLowerCase()
  if (!needle) return null
  return (
    (loadRaw().videos || []).find(
      (v) => String(v.videoTrackingSlug || '').toLowerCase() === needle,
    ) ?? null
  )
}

export function listFeaturedVideosFile() {
  return (loadRaw().videos || [])
    .filter((v) => v.approvalStatus === 'approved' && v.isFeatured)
    .sort((a, b) => (a.spotlightRank ?? 99) - (b.spotlightRank ?? 99))
}
