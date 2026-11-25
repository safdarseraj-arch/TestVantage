/**
 * School-issued teacher invite codes (SMS Phase-1).
 * Principals generate codes from Staff tab; teachers redeem via Path A onboarding.
 */

const STORAGE_KEY = 'testvantage-school-invites'

export function normalizeSchoolInviteCode(raw) {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
}

/**
 * @typedef {{
 *   code: string
 *   schoolId: string
 *   campusName: string
 *   department: string
 *   classes: string[]
 *   systemQbTier: string
 *   createdAt: number
 *   createdBy?: string
 *   revokedAt?: number | null
 * }} SchoolInvite
 */

/** @returns {SchoolInvite[]} */
export function loadSchoolInvites() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    return Array.isArray(data.invites) ? data.invites.map(normalizeInvite) : []
  } catch {
    return []
  }
}

/** @param {SchoolInvite[]} invites */
function saveSchoolInvites(invites) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ invites }))
  import('./orgServerSync.js')
    .then((m) => m.notifyOrgChanged())
    .catch(() => {})
}

/** @param {object} row @returns {SchoolInvite} */
function normalizeInvite(row) {
  return {
    code: normalizeSchoolInviteCode(row.code),
    schoolId: String(row.schoolId || ''),
    campusName: String(row.campusName || '').trim(),
    department: String(row.department || '').trim() || 'General',
    classes: Array.isArray(row.classes)
      ? row.classes.map((c) => String(c).trim()).filter(Boolean)
      : [],
    systemQbTier: row.systemQbTier === 'pro_add_on' ? 'pro_add_on' : 'school_standard',
    createdAt: Number(row.createdAt) || Date.now(),
    createdBy: row.createdBy ? String(row.createdBy) : undefined,
    revokedAt: row.revokedAt ? Number(row.revokedAt) : null,
  }
}

/** @param {string} schoolId */
export function getInvitesForSchool(schoolId) {
  return loadSchoolInvites()
    .filter((i) => i.schoolId === schoolId)
    .sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * Lookup an active (non-revoked) school-generated invite.
 * @param {string} raw
 * @returns {SchoolInvite | null}
 */
export function findActiveSchoolInvite(raw) {
  const code = normalizeSchoolInviteCode(raw)
  if (!code) return null
  const hit = loadSchoolInvites().find((i) => i.code === code && !i.revokedAt)
  return hit || null
}

/**
 * @param {{
 *   schoolId: string
 *   campusName: string
 *   department?: string
 *   classes?: string[]
 *   createdBy?: string
 *   preferredCode?: string
 * }} data
 */
export function createSchoolInvite({
  schoolId,
  campusName,
  department = 'General',
  classes = [],
  createdBy,
  preferredCode,
}) {
  if (!schoolId) return { ok: false, error: 'Select a school.' }
  const name = String(campusName ?? '').trim()
  if (!name) return { ok: false, error: 'School name is required for the invite.' }

  let code = normalizeSchoolInviteCode(preferredCode)
  if (!code) code = suggestInviteCode(name)

  const existing = loadSchoolInvites()
  if (existing.some((i) => i.code === code && !i.revokedAt)) {
    code = `${code}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`
  }

  // Demo codes stay reserved for the built-in Path A demos.
  if (code === 'SCHOOL-DEMO' || code === 'CAMPUS-TV') {
    return { ok: false, error: 'That code is reserved. Try another.' }
  }

  const invite = {
    code,
    schoolId,
    campusName: name,
    department: String(department || 'General').trim() || 'General',
    classes: (classes || []).map((c) => String(c).trim()).filter(Boolean).slice(0, 12),
    systemQbTier: 'school_standard',
    createdAt: Date.now(),
    createdBy: createdBy ? String(createdBy) : undefined,
    revokedAt: null,
  }

  existing.push(invite)
  saveSchoolInvites(existing)
  return { ok: true, invite }
}

/** @param {string} code */
export function revokeSchoolInvite(code) {
  const normalized = normalizeSchoolInviteCode(code)
  const invites = loadSchoolInvites()
  const idx = invites.findIndex((i) => i.code === normalized)
  if (idx < 0) return { ok: false, error: 'Invite not found.' }
  if (invites[idx].revokedAt) return { ok: false, error: 'Invite already revoked.' }
  invites[idx] = { ...invites[idx], revokedAt: Date.now() }
  saveSchoolInvites(invites)
  return { ok: true, invite: invites[idx] }
}

/**
 * Primary share link — lands on Teacher register with the invite remembered,
 * then continues into Path A onboarding after signup/sign-in.
 */
export function teacherInviteSignupPath(code) {
  const c = normalizeSchoolInviteCode(code)
  return `/login?schoolInvite=${encodeURIComponent(c)}`
}

/** Direct onboarding deep-link (for teachers already signed in). */
export function teacherInviteOnboardingPath(code) {
  const c = normalizeSchoolInviteCode(code)
  return `/teacher/onboarding?schoolInvite=${encodeURIComponent(c)}`
}

/** WhatsApp / email paste for a school invite. */
export function teacherInviteShareText(code, campusName) {
  const c = normalizeSchoolInviteCode(code)
  const path = teacherInviteSignupPath(c)
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'http://127.0.0.1:5173'
  const school = String(campusName || 'our school').trim() || 'our school'
  return [
    `You are invited to join ${school} on TestVantages as a teacher.`,
    `Invite code: ${c}`,
    `Open this link, choose Teacher → Register (or Sign in):`,
    `${origin}${path}`,
  ].join('\n')
}

/** Remove every invite minted for a school (used when deleting a campus). */
export function deleteInvitesForSchool(schoolId) {
  if (!schoolId) return { ok: false, error: 'Missing school.' }
  const invites = loadSchoolInvites()
  const next = invites.filter((i) => i.schoolId !== schoolId)
  if (next.length === invites.length) return { ok: true, removed: 0 }
  saveSchoolInvites(next)
  return { ok: true, removed: invites.length - next.length }
}

/** @param {string} campusName */
export function suggestInviteCode(campusName) {
  const slug = String(campusName ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 8)
  const suffix = Math.random().toString(36).slice(2, 5).toUpperCase()
  return normalizeSchoolInviteCode(slug ? `TV-${slug}-${suffix}` : `TV-CAMPUS-${suffix}`)
}
