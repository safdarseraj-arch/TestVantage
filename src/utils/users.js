import { ALL_TEACHER_PERMS } from './permissions.js'

const USERS_KEY = 'testvantage-users'

/** @typedef {'user' | 'teacher'} UserRole */

/**
 * @typedef {{
 *   id: string
 *   name: string
 *   email: string
 *   password: string
 *   role: UserRole
 *   permissions?: string[]
 *   schoolId?: string
 *   classIds?: string[]
 *   createdAt: number
 *   createdBy?: string
 * }} StoredUser
 */

/** @returns {StoredUser[]} */
export function loadUsers() {
  try {
    const raw = localStorage.getItem(USERS_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users))
  import('./orgServerSync.js')
    .then((m) => m.notifyOrgChanged())
    .catch(() => {})
}

/** @param {StoredUser[]} users — used by class roster sync */
export function saveUsersDirect(users) {
  saveUsers(users)
}

function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase()
}

/** Login ID for students/teachers — stored in the email field. */
export function normalizeLoginId(loginId) {
  return normalizeEmail(loginId)
}

/** @param {string} loginId */
function loginIdTaken(loginId, exceptId = null) {
  const id = normalizeLoginId(loginId)
  return loadUsers().some((u) => u.email === id && u.id !== exceptId)
}

/** @param {string} email */
function emailTaken(email, exceptId = null) {
  return loginIdTaken(email, exceptId)
}

function slugLoginPart(value) {
  return (
    String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '')
      .slice(0, 16) || 'student'
  )
}

function randomPassword(length = 8) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)]
  }
  return out
}

/**
 * Suggest a unique user ID and password for a new student.
 * @param {string} name
 * @param {string} [className]
 */
export function generateStudentCredentials(name, className) {
  const base = slugLoginPart(name)
  const classPart = className ? slugLoginPart(className) : ''
  let loginId = classPart ? `${base}.${classPart}` : base
  let n = 1
  while (loginIdTaken(loginId)) {
    loginId = `${base}${n}`
    n += 1
  }
  return { loginId, password: randomPassword(8) }
}

/**
 * Student self-registration.
 * @param {{ name: string, email: string, password: string }} data
 */
export function registerUser({ name, email, password, referredBy, referredByEmail, referredByName }) {
  const trimmedEmail = normalizeEmail(email)
  if (!trimmedEmail || !password || password.length < 4) {
    return { ok: false, error: 'Email and password (min 4 chars) required.' }
  }
  if (emailTaken(trimmedEmail)) {
    return { ok: false, error: 'An account with this email already exists.' }
  }
  const user = {
    id: `user-${Date.now()}`,
    name: name.trim() || trimmedEmail.split('@')[0],
    email: trimmedEmail,
    password,
    role: 'user',
    selfRegistered: true,
    profileComplete: false,
    createdAt: Date.now(),
    ...(referredBy
      ? { referredBy, referredByEmail, referredByName }
      : {}),
  }
  const users = loadUsers()
  users.push(user)
  saveUsers(users)
  return { ok: true, user }
}

/**
 * Teacher self-registration. Bank / paper tools turn on after the profile form.
 * @param {{ name: string, email: string, password: string, referredBy?: string, referredByEmail?: string, referredByName?: string }} data
 */
export function registerTeacher({ name, email, password, referredBy, referredByEmail, referredByName }) {
  const trimmedEmail = normalizeEmail(email)
  if (!trimmedEmail || !password || password.length < 4) {
    return { ok: false, error: 'Email and password (min 4 chars) required.' }
  }
  if (emailTaken(trimmedEmail)) {
    return { ok: false, error: 'An account with this email already exists.' }
  }
  const user = {
    id: `teacher-${Date.now()}`,
    name: name.trim() || trimmedEmail.split('@')[0],
    email: trimmedEmail,
    password,
    role: 'teacher',
    permissions: [],
    selfRegistered: true,
    profileComplete: false,
    createdAt: Date.now(),
    ...(referredBy
      ? { referredBy, referredByEmail, referredByName }
      : {}),
  }
  const users = loadUsers()
  users.push(user)
  saveUsers(users)
  return { ok: true, user }
}

/**
 * Admin/teacher creates a student login (user ID + password).
 * @param {{ name: string, loginId: string, password: string, createdBy?: string }} data
 */
export function createStudentAccount({ name, loginId, password, createdBy }) {
  const id = normalizeLoginId(loginId)
  if (!id || id.length < 3) {
    return { ok: false, error: 'User ID must be at least 3 characters.' }
  }
  if (!password || password.length < 4) {
    return { ok: false, error: 'Password must be at least 4 characters.' }
  }
  if (loginIdTaken(id)) {
    return { ok: false, error: 'This user ID is already in use.' }
  }
  const user = {
    id: `user-${Date.now()}`,
    name: name.trim() || id,
    email: id,
    password,
    role: 'user',
    createdAt: Date.now(),
    createdBy,
  }
  const users = loadUsers()
  users.push(user)
  saveUsers(users)
  return { ok: true, user }
}

/**
 * @param {string} id
 * @param {{ name?: string, loginId?: string, password?: string }} updates
 */
export function updateStudentAccount(id, updates) {
  const users = loadUsers()
  const idx = users.findIndex((u) => u.id === id && u.role === 'user')
  if (idx < 0) return { ok: false, error: 'Student not found.' }

  const nextLoginId =
    updates.loginId != null ? normalizeLoginId(updates.loginId) : users[idx].email
  if (updates.loginId != null) {
    if (!nextLoginId || nextLoginId.length < 3) {
      return { ok: false, error: 'User ID must be at least 3 characters.' }
    }
    if (loginIdTaken(nextLoginId, id)) {
      return { ok: false, error: 'This user ID is already in use.' }
    }
  }
  if (updates.password != null && String(updates.password).length > 0 && updates.password.length < 4) {
    return { ok: false, error: 'Password must be at least 4 characters.' }
  }

  const row = { ...users[idx] }
  if (updates.name != null) row.name = updates.name.trim() || row.name
  if (updates.loginId != null) row.email = nextLoginId
  if (updates.password != null && String(updates.password).length > 0) row.password = updates.password
  users[idx] = row
  saveUsers(users)
  return { ok: true, user: row }
}

/** @param {string} id */
export function deleteStudentAccount(id) {
  const users = loadUsers()
  const next = users.filter((u) => !(u.id === id && u.role === 'user'))
  if (next.length === users.length) return { ok: false, error: 'Student not found.' }
  saveUsers(next)
  return { ok: true }
}

/**
 * Admin creates a teacher login with selected rights.
 * @param {{ name: string, email: string, password: string, permissions?: string[], createdBy?: string }} data
 */
export function createTeacherAccount({ name, email, password, permissions = [], createdBy }) {
  const trimmedEmail = normalizeEmail(email)
  if (!trimmedEmail || !password || password.length < 4) {
    return { ok: false, error: 'Email and password (min 4 chars) required.' }
  }
  if (emailTaken(trimmedEmail)) {
    return { ok: false, error: 'This email is already in use.' }
  }
  const perms = (permissions ?? []).filter((p) => ALL_TEACHER_PERMS.includes(p))
  const user = {
    id: `teacher-${Date.now()}`,
    name: name.trim() || trimmedEmail.split('@')[0],
    email: trimmedEmail,
    password,
    role: 'teacher',
    permissions: perms,
    createdAt: Date.now(),
    createdBy,
  }
  const users = loadUsers()
  users.push(user)
  saveUsers(users)
  return { ok: true, user }
}

/**
 * @param {string} id
 * @param {{ name?: string, email?: string, password?: string, permissions?: string[] }} updates
 */
export function updateTeacherAccount(id, updates) {
  const users = loadUsers()
  const idx = users.findIndex((u) => u.id === id && u.role === 'teacher')
  if (idx < 0) return { ok: false, error: 'Teacher not found.' }

  const nextEmail = updates.email != null ? normalizeEmail(updates.email) : users[idx].email
  if (updates.email != null && emailTaken(nextEmail, id)) {
    return { ok: false, error: 'Email already in use.' }
  }
  if (updates.password != null && String(updates.password).length > 0 && updates.password.length < 4) {
    return { ok: false, error: 'Password must be at least 4 characters.' }
  }

  const row = { ...users[idx] }
  if (updates.name != null) row.name = updates.name.trim() || row.name
  if (updates.email != null) row.email = nextEmail
  if (updates.password != null && String(updates.password).length > 0) row.password = updates.password
  if (updates.permissions != null) {
    row.permissions = updates.permissions.filter((p) => ALL_TEACHER_PERMS.includes(p))
  }
  users[idx] = row
  saveUsers(users)
  return { ok: true, user: row }
}

/** @param {string} id */
export function deleteTeacherAccount(id) {
  const users = loadUsers()
  const next = users.filter((u) => !(u.id === id && u.role === 'teacher'))
  if (next.length === users.length) return { ok: false, error: 'Teacher not found.' }
  saveUsers(next)
  return { ok: true }
}

export function listTeachers() {
  return loadUsers().filter((u) => u.role === 'teacher')
}

export function listStudents() {
  return loadUsers().filter((u) => u.role === 'user')
}

/** @param {string} email @param {string} password */
export function findUserByCredentials(email, password) {
  const trimmedEmail = normalizeEmail(email)
  return (
    loadUsers().find((u) => u.email === trimmedEmail && u.password === password) ?? null
  )
}

/** @param {string} userId */
export function getUserById(userId) {
  return loadUsers().find((u) => u.id === userId) ?? null
}

/**
 * Save profile fields on a student or teacher account.
 * @param {string} userId
 * @param {{ profile?: object, profileComplete?: boolean, permissions?: string[] }} updates
 */
export function saveUserProfile(userId, updates) {
  const users = loadUsers()
  const idx = users.findIndex((u) => u.id === userId)
  if (idx < 0) return { ok: false, error: 'Account not found.' }
  const row = { ...users[idx] }
  if (updates.profile != null) row.profile = { ...(row.profile ?? {}), ...updates.profile }
  if (updates.profileComplete != null) row.profileComplete = !!updates.profileComplete
  if (updates.permissions != null) row.permissions = [...updates.permissions]
  users[idx] = row
  saveUsers(users)
  return { ok: true, user: row }
}
