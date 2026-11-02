import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  getSession,
  loginAdminAsync,
  loginUserAsync,
  logoutSession,
} from '../utils/auth'
import { registerTeacher, registerUser } from '../utils/users'
import { findUserByInviteCode, normalizeInviteCode } from '../utils/invites.js'
import { sessionHasPermission } from '../utils/permissions'
import { isPlatformScaleEnabled } from '../config/platform.js'
import { pullOrgFromServer, pushOrgToServer } from '../utils/orgServerSync.js'
import { pullTestsFromServer } from '../utils/testsServerSync.js'
import { ensureDemoAccounts } from '../utils/demoAccounts.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => getSession())

  useEffect(() => {
    try {
      ensureDemoAccounts()
    } catch {
      /* demo seed is optional */
    }
  }, [])

  useEffect(() => {
    if (!isPlatformScaleEnabled()) return
    pullOrgFromServer().catch(() => {})
    pullTestsFromServer().catch(() => {})
  }, [])

  const loginAsAdmin = useCallback(async (email, password) => {
    const result = await loginAdminAsync(email, password)
    if (result.ok) setSession(result.session)
    return result
  }, [])

  const loginAsUser = useCallback(async (email, password) => {
    const result = await loginUserAsync(email, password)
    if (result.ok) setSession(result.session)
    return result
  }, [])

  const register = useCallback(async ({ name, email, password, role = 'user', inviteCode }) => {
    try {
      const cleanInvite = normalizeInviteCode(inviteCode)
      let referral = {}
      if (cleanInvite) {
        const inviter = findUserByInviteCode(cleanInvite)
        if (!inviter) {
          return {
            ok: false,
            error: 'Invite code not found. Leave it blank, or ask the person who invited you.',
          }
        }
        referral = {
          referredBy: inviter.id,
          referredByEmail: inviter.email,
          referredByName: inviter.name,
        }
      }
      const result =
        role === 'teacher'
          ? registerTeacher({ name, email, password, ...referral })
          : registerUser({ name, email, password, ...referral })
      if (!result.ok) return result
      if (isPlatformScaleEnabled()) {
        await pushOrgToServer().catch(() => {})
      }
      const loginResult = await loginUserAsync(email, password)
      if (loginResult.ok) setSession(loginResult.session)
      else {
        return {
          ok: false,
          error:
            loginResult.error ??
            'Account created, but sign-in failed. Go back to Sign in and use the same email and password.',
        }
      }
      return loginResult
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Registration failed. Press F5 and try again.',
      }
    }
  }, [])

  const logout = useCallback(() => {
    logoutSession()
    setSession(null)
  }, [])

  const refresh = useCallback(() => setSession(getSession()), [])

  const hasPermission = useCallback(
    (permission) => sessionHasPermission(session, permission),
    [session],
  )

  const value = useMemo(
    () => ({
      session,
      isAdmin: session?.role === 'admin',
      isUser: session?.role === 'user' || session?.role === 'student',
      isTeacher: session?.role === 'teacher',
      isLoggedIn: !!session,
      hasPermission,
      loginAsAdmin,
      loginAsUser,
      register,
      logout,
      refresh,
      /** @deprecated */ login: loginAsAdmin,
    }),
    [session, hasPermission, loginAsAdmin, loginAsUser, register, logout, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
