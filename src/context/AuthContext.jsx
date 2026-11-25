import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  getSession,
  loginAdminAsync,
  loginUserAsync,
  logoutSession,
} from '../utils/auth'
import { registerTeacher, registerUser } from '../utils/users'
import { findUserByInviteCode, normalizeInviteCode } from '../utils/invites.js'
import { attributeSignup } from '../utils/referralEngine.js'
import { getPartnerByCode, upsertPartner } from '../utils/referralStore.js'
import { PARTNER_TYPES } from '../utils/referralConstants.js'
import { syncReferralStore } from '../utils/referralApi.js'
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

  const register = useCallback(
    async ({ name, email, password, role = 'user', inviteCode, becomeAmbassador = false }) => {
      try {
        const cleanInvite = normalizeInviteCode(inviteCode)
        let referral = {}
        if (cleanInvite) {
          const inviter = findUserByInviteCode(cleanInvite)
          const partner = getPartnerByCode(cleanInvite)
          if (!inviter && !partner) {
            return {
              ok: false,
              error: 'Invite code not found. Leave it blank, or ask the person who invited you.',
            }
          }
          if (inviter) {
            referral = {
              referredBy: inviter.id,
              referredByEmail: inviter.email,
              referredByName: inviter.name,
            }
          } else if (partner) {
            referral = {
              referredBy: partner.userId,
              referredByEmail: partner.email,
              referredByName: partner.displayName || partner.name,
            }
          }
        }
        const result =
          role === 'teacher'
            ? registerTeacher({ name, email, password, ...referral })
            : registerUser({ name, email, password, ...referral })
        if (!result.ok) return result
        const newUserId = result.user?.id
        if (newUserId) {
          try {
            attributeSignup({
              referredUserId: newUserId,
              inviteCode: cleanInvite || undefined,
              referredEmail: email,
            })
          } catch {
            /* attribution is best-effort */
          }
        }
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

        let ambassador = false
        if (becomeAmbassador && loginResult.session?.userId) {
          try {
            const partnerType =
              role === 'teacher' ? PARTNER_TYPES.FACULTY : PARTNER_TYPES.STUDENT
            const partnerResult = upsertPartner({
              userId: loginResult.session.userId,
              name: loginResult.session.name || name,
              email: loginResult.session.email || email,
              partnerType,
              parentPartnerCode: cleanInvite || undefined,
            })
            if (partnerResult.ok) {
              ambassador = true
              syncReferralStore().catch(() => {})
            }
          } catch {
            /* promoter create is best-effort; account still works */
          }
        }

        return { ...loginResult, ambassador }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Registration failed. Press F5 and try again.',
        }
      }
    },
    [],
  )

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
