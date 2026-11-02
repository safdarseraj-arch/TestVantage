import { loadOrgData } from './stores/orgData.js'

export const ADMIN = {
  email: (process.env.TESTVANTAGE_ADMIN_EMAIL || 'admin@testvantage.com').trim().toLowerCase(),
  password: process.env.TESTVANTAGE_ADMIN_PASSWORD || 'admin123',
  name: process.env.TESTVANTAGE_ADMIN_NAME || 'Admin',
}

/** True when live password was never set (unsafe for public internet). */
export const ADMIN_USING_DEFAULT_PASSWORD =
  !process.env.TESTVANTAGE_ADMIN_PASSWORD || process.env.TESTVANTAGE_ADMIN_PASSWORD === 'admin123'

if (ADMIN_USING_DEFAULT_PASSWORD && process.env.NODE_ENV === 'production') {
  console.error(
    '[TestVantages] WARNING: TESTVANTAGE_ADMIN_PASSWORD is still the default. Set a strong password before public go-live.',
  )
}

/**
 * @param {string} email
 * @param {string} password
 * @param {'admin' | 'student' | 'teacher' | 'any'} [roleHint]
 */
export async function authenticateLogin(email, password, roleHint = 'any') {
  const normalized = String(email ?? '').trim().toLowerCase()
  const pass = String(password ?? '')

  if (!normalized || !pass) {
    return { ok: false, error: 'Email and password are required.' }
  }

  const wantsAdmin = roleHint === 'admin'

  if (wantsAdmin || normalized === ADMIN.email) {
    if (normalized === ADMIN.email && pass === ADMIN.password) {
      return {
        ok: true,
        session: {
          email: ADMIN.email,
          role: 'admin',
          name: ADMIN.name,
          loggedInAt: Date.now(),
        },
      }
    }
    if (wantsAdmin) {
      return { ok: false, error: 'Invalid admin email or password.' }
    }
  }

  const org = await loadOrgData()
  const user = org.users.find((u) => String(u.email).toLowerCase() === normalized)
  if (!user || user.password !== pass) {
    return { ok: false, error: 'Invalid email or password. Register if you are new.' }
  }

  if (user.role === 'teacher') {
    return {
      ok: true,
      session: {
        email: user.email,
        role: 'teacher',
        name: user.name,
        userId: user.id,
        permissions: [...(user.permissions ?? [])],
        loggedInAt: Date.now(),
      },
    }
  }

  return {
    ok: true,
    session: {
      email: user.email,
      role: 'user',
      name: user.name,
      userId: user.id,
      loggedInAt: Date.now(),
    },
  }
}

/** @param {import('http').IncomingMessage} req */
export function adminAuthHeaders(req) {
  return {
    email: String(req.headers['x-admin-email'] ?? '').trim().toLowerCase(),
    password: String(req.headers['x-admin-password'] ?? ''),
  }
}

/** @param {import('http').IncomingMessage} req */
export async function requireAdmin(req) {
  const { email, password } = adminAuthHeaders(req)
  return authenticateLogin(email, password, 'admin')
}
