import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Gate routes by admin role or a teacher permission flag.
 * @param {{ permission?: string, anyPermission?: string[], adminOnly?: boolean, children: import('react').ReactNode }} props
 */
export default function RequirePermission({ permission, anyPermission, adminOnly = false, children }) {
  const { isAdmin, hasPermission } = useAuth()
  const location = useLocation()
  const from = `${location.pathname}${location.search || ''}`
  const staffLogin = { from, staff: true, admin: adminOnly || from.startsWith('/question-bank') }

  if (adminOnly) {
    if (!isAdmin) {
      return <Navigate to="/login" state={{ ...staffLogin, admin: true }} replace />
    }
    return children
  }

  if (anyPermission?.length) {
    if (isAdmin || anyPermission.some((p) => hasPermission(p))) {
      return children
    }
    return <Navigate to="/login" state={staffLogin} replace />
  }

  if (isAdmin || (permission && hasPermission(permission))) {
    return children
  }

  return <Navigate to="/login" state={staffLogin} replace />
}
