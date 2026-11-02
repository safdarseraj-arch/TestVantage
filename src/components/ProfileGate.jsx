import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  STUDENT_ONBOARDING_PATH,
  TEACHER_ONBOARDING_PATH,
  needsStudentOnboarding,
  needsTeacherOnboarding,
} from '../utils/userProfiles'

/**
 * After self-register, send students/teachers to the required profile form
 * instead of a blank /login or an empty home.
 */
export default function ProfileGate({ children }) {
  const { session, isUser, isTeacher, isAdmin } = useAuth()
  const { pathname } = useLocation()

  if (pathname.startsWith('/onboarding') || pathname.startsWith('/login')) {
    return children
  }

  if (isUser && !isTeacher && !isAdmin && needsStudentOnboarding(session)) {
    return <Navigate to={STUDENT_ONBOARDING_PATH} replace />
  }
  if (isTeacher && !isAdmin && needsTeacherOnboarding(session)) {
    return <Navigate to={TEACHER_ONBOARDING_PATH} replace />
  }

  return children
}
