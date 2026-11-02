import { findUserByCredentials, getUserById } from './users.js'
import { getGuestId } from './attemptHistory.js'
import { migrateExamProgressOwner } from './examProgressStore.js'
import { isPlatformScaleEnabled } from '../config/platform.js'
import { loginRemote, pingAuthApi } from './authApi.js'
import { pullOrgFromServer } from './orgServerSync.js'

const ADMIN_KEY = 'testvantage-admin-account'
const SESSION_KEY = 'testvantage-session'

const DEFAULT_ADMIN = {
  email: 'admin@testvantage.com',
  password: 'admin123',
  name: 'Admin',
}

/** @returns {{ email: string, password: string, name: string }} */
export function loadAdminAccount() {
  try {
    const raw = localStorage.getItem(ADMIN_KEY)
    if (!raw) return { ...DEFAULT_ADMIN }
    return { ...DEFAULT_ADMIN, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_ADMIN }
  }
}

/** @param {{ email: string, password: string, name?: string }} account */
export function saveAdminAccount(account) {
  localStorage.setItem(ADMIN_KEY, JSON.stringify(account))
}

/** @returns {{ email: string, role: 'admin' | 'user' | 'teacher', name: string, userId?: string, permissions?: string[], loggedInAt: number } | null} */
export function getSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function isAdminLoggedIn() {
  return getSession()?.role === 'admin'
}

export function isUserLoggedIn() {
  const role = getSession()?.role
  return role === 'user' || role === 'teacher'
}

export function isTeacherLoggedIn() {
  return getSession()?.role === 'teacher'
}

export function isStudentLoggedIn() {
  return getSession()?.role === 'user'
}

/** @param {string} email @param {string} password */
export function loginAdmin(email, password) {
  const admin = loadAdminAccount()
  if (
    email.trim().toLowerCase() === admin.email.trim().toLowerCase() &&
    password === admin.password
  ) {
    const session = {
      email: admin.email,
      role: 'admin',
      name: admin.name ?? 'Admin',
      loggedInAt: Date.now(),
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
    return { ok: true, session }
  }
  return { ok: false, error: 'Invalid admin email or password' }
}

/** Server-first admin login for live platform. */
export async function loginAdminAsync(email, password) {
  if (isPlatformScaleEnabled()) {
    try {
      const apiUp = await pingAuthApi()
      if (apiUp) {
        await pullOrgFromServer()
        const remote = await loginRemote(email, password, 'admin')
        if (remote.ok && remote.session) {
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(remote.session))
          return remote
        }
        if (!remote.ok) return remote
      }
    } catch {
      /* fall back to local admin for offline emergency */
    }
  }
  return loginAdmin(email, password)
}

/** @param {string} email @param {string} password */
export function loginUser(email, password) {
  const user = findUserByCredentials(email, password)
  if (!user) {
    return { ok: false, error: 'Invalid email or password. Register if you are new.' }
  }
  const isTeacher = user.role === 'teacher'
  const targetExams = Array.isArray(user.profile?.targetExams) ? [...user.profile.targetExams] : []
  const session = {
    email: user.email,
    role: isTeacher ? 'teacher' : 'user',
    name: user.name,
    userId: user.id,
    permissions: isTeacher ? [...(user.permissions ?? [])] : [],
    profileComplete: !!user.profileComplete,
    selfRegistered: !!user.selfRegistered,
    isDemo: !!user.isDemo,
    allowAllMocks: !!(user.allowAllMocks || (user.isDemo && !isTeacher)),
    targetExams,
    loggedInAt: Date.now(),
  }
  const guestKey = getGuestId()
  migrateExamProgressOwner(guestKey, user.id)
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return { ok: true, session }
}

/** Server-first student/teacher login for live platform. */
export async function loginUserAsync(email, password) {
  if (isPlatformScaleEnabled()) {
    try {
      const apiUp = await pingAuthApi()
      if (apiUp) {
        await pullOrgFromServer()
        const remote = await loginRemote(email, password, 'any')
        if (remote.ok && remote.session) {
          if (remote.session.userId) {
            migrateExamProgressOwner(getGuestId(), remote.session.userId)
          }
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(remote.session))
          return remote
        }
        if (!remote.ok) return remote
      }
    } catch {
      /* fall back to local */
    }
  }
  return loginUser(email, password)
}

export function logoutSession() {
  sessionStorage.removeItem(SESSION_KEY)
}

/** Refresh the signed-in session after a profile or permission change. */
export function refreshSessionFromUser(userId) {
  const user = getUserById(userId)
  const session = getSession()
  if (!user || !session || session.userId !== user.id) return session
  const next = {
    ...session,
    email: user.email,
    name: user.name,
    role: user.role === 'teacher' ? 'teacher' : session.role,
    permissions: user.role === 'teacher' ? [...(user.permissions ?? [])] : [],
    profileComplete: !!user.profileComplete,
    selfRegistered: !!user.selfRegistered,
    isDemo: !!user.isDemo,
    allowAllMocks: !!(user.allowAllMocks || (user.isDemo && user.role !== 'teacher')),
    targetExams: Array.isArray(user.profile?.targetExams) ? [...user.profile.targetExams] : [],
  }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(next))
  return next
}

/** @deprecated use logoutSession */
export function logoutAdmin() {
  logoutSession()
}

/** @param {string} currentPassword @param {string} newPassword @param {string} [newEmail] */
export function changeAdminCredentials(currentPassword, newPassword, newEmail) {
  const admin = loadAdminAccount()
  if (currentPassword !== admin.password) {
    return { ok: false, error: 'Current password is incorrect' }
  }
  const updated = {
    ...admin,
    password: newPassword || admin.password,
    email: newEmail?.trim() || admin.email,
  }
  saveAdminAccount(updated)
  const session = getSession()
  if (session?.role === 'admin') {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ ...session, email: updated.email, name: updated.name }),
    )
  }
  return { ok: true }
}
