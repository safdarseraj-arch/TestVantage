/**
 * Focused checks for referral attribution + commission ledger (no upload-gate).
 * Run: node scripts/test_referral_engine.mjs
 */

import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

// Minimal localStorage polyfill for Node
const mem = new Map()
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
}
globalThis.window = { location: { origin: 'http://127.0.0.1:5173' } }

const storeUrl = pathToFileURL(path.join(root, 'src/utils/referralStore.js')).href
const engineUrl = pathToFileURL(path.join(root, 'src/utils/referralEngine.js')).href
const constantsUrl = pathToFileURL(path.join(root, 'src/utils/referralConstants.js')).href

const store = await import(storeUrl)
const engine = await import(engineUrl)
const { PARTNER_TYPES, COMMISSION_STATUS, VIDEO_BOOST_RATE_PCT } = await import(constantsUrl)

mem.clear()

const a = store.upsertPartner({
  userId: 'user-mentor',
  name: 'Rohit Mentor',
  email: 'rohit@nit.ac.in',
  partnerType: PARTNER_TYPES.UNIVERSITY_STUDENT,
  collegeName: 'NIT Surathkal',
  collegeEmail: 'rohit@nitk.ac.in',
  degree: 'B.Tech CSE',
})
assert.equal(a.ok, true)
assert.ok(a.partner.vanityCouponCode.includes('ROHIT'))

const b = store.upsertPartner({
  userId: 'user-creator',
  name: 'Priya Creator',
  email: 'priya@creator.test',
  partnerType: PARTNER_TYPES.VOLUNTARY_MARKETER,
  parentPartnerCode: a.partner.referralCode,
})
assert.equal(b.ok, true)
assert.equal(b.partner.parentPartnerId, a.partner.id)

const cap = engine.applyReferralCapture({ code: a.partner.vanityCouponCode })
assert.equal(cap.ok, true)

const signup = engine.attributeSignup({
  referredUserId: 'user-aspirant-1',
  inviteCode: a.partner.vanityCouponCode,
  referredEmail: 'aspirant@example.com',
})
assert.equal(signup.ok, true)

const lock = engine.createFreeMockLeadLock({
  partnerId: a.partner.id,
  aspirantUserId: 'user-aspirant-1',
})
assert.equal(lock.ok, true)

const paid = engine.recordPaidConversion({
  referredUserId: 'user-aspirant-1',
  orderId: 'order-1',
  grossAmount: 4999,
})
assert.equal(paid.ok, true)
assert.ok(paid.commissions.length >= 1)
assert.equal(paid.commissions[0].status, COMMISSION_STATUS.PENDING_REFUND)

// Self-referral blocked
const self = engine.recordPaidConversion({
  referredUserId: 'user-mentor',
  orderId: 'order-self',
  grossAmount: 1000,
  forcePartnerId: a.partner.id,
})
assert.equal(self.ok, false)

// Video L1 rate
engine.applyReferralCapture({
  code: b.partner.referralCode,
  source: 'video',
  videoId: 'vid-1',
})
engine.attributeSignup({
  referredUserId: 'user-aspirant-2',
  inviteCode: b.partner.referralCode,
})
const videoPaid = engine.recordPaidConversion({
  referredUserId: 'user-aspirant-2',
  orderId: 'order-2',
  grossAmount: 4999,
  fromVideo: true,
})
assert.equal(videoPaid.ok, true)
assert.equal(videoPaid.commissions[0].commissionRatePct, VIDEO_BOOST_RATE_PCT)
// L2 override to parent mentor
assert.ok(videoPaid.commissions.some((c) => c.commissionLevel === 2 && c.partnerId === a.partner.id))

engine.reverseCommissionsForOrder('order-1')
const buckets = engine.getEarningsBuckets(a.partner.id)
assert.ok(buckets.reversed.rows.some((r) => r.orderOrContractId === 'order-1'))

const est = engine.estimateCampusMonthlyIncome(20)
assert.ok(est.totalInr > 0)
assert.equal(est.tier.id, 'rising')

console.log('referral engine checks passed')
