import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children }) {
  const { isAdmin } = useAuth()
  const location = useLocation()

  if (!isAdmin) {
    return (
      <Navigate to="/login" state={{ from: location.pathname, admin: true }} replace />
    )
  }

  return children
}
