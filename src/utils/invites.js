/**
 * Simple invite / referral codes for students and teachers.
 * Does not impersonate users or wipe the question bank.
 */

import { getUserById, loadUsers, saveUsersDirect } from './users.js'

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function hashCode(str) {
  let h = 2166136261
  for (let i = 0; i < String(str).length; i += 1) {
    h ^= String(str).charCodeAt(i)
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

export function normalizeInviteCode(code) {
  return String(code ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8)
}

/** Stable invite code for a saved account. */
export function inviteCodeForUser(userId) {
  const user = getUserById(userId)
  if (user?.inviteCode) return normalizeInviteCode(user.inviteCode)
  return userId ? `TV${hashCode(userId)}`.slice(0, 8) : ''
}

export function findUserByInviteCode(code) {
  const needle = normalizeInviteCode(code)
  if (needle.length < 4) return null
  return (
    loadUsers().find((u) => {
      const mine = normalizeInviteCode(u.inviteCode || inviteCodeForUser(u.id))
      return mine === needle
    }) ?? null
  )
}

export function inviteSignupPath(code) {
  const clean = normalizeInviteCode(code)
  return clean ? `/login?invite=${encodeURIComponent(clean)}` : '/login'
}

/** Attach a referred-by mark when someone registers with an invite code. */
export function applyInviteOnRegister(newUserId, inviteCode) {
  const inviter = findUserByInviteCode(inviteCode)
  if (!inviter || inviter.id === newUserId) {
    return { ok: false, error: 'Invite code not found.' }
  }
  const users = loadUsers()
  const idx = users.findIndex((u) => u.id === newUserId)
  if (idx < 0) return { ok: false, error: 'New account not found.' }
  users[idx] = {
    ...users[idx],
    referredBy: inviter.id,
    referredByEmail: inviter.email,
    referredByName: inviter.name,
  }
  const inviterIdx = users.findIndex((u) => u.id === inviter.id)
  if (inviterIdx >= 0 && !users[inviterIdx].inviteCode) {
    users[inviterIdx] = { ...users[inviterIdx], inviteCode: inviteCodeForUser(inviter.id) }
  }
  saveUsersDirect(users)
  return { ok: true, inviter }
}

export function countReferralsForUser(userId) {
  return loadUsers().filter((u) => u.referredBy === userId).length
}

/** Save a stable invite code on the account so friends can look it up. */
export function persistInviteCode(userId) {
  const users = loadUsers()
  const idx = users.findIndex((u) => u.id === userId)
  if (idx < 0) return ''
  const code = normalizeInviteCode(users[idx].inviteCode) || `TV${hashCode(userId)}`.slice(0, 8)
  if (users[idx].inviteCode !== code) {
    users[idx] = { ...users[idx], inviteCode: code }
    saveUsersDirect(users)
  }
  return code
}
