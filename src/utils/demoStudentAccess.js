/**
 * Demo student identity — no storage imports (safe for exam access tests).
 */

export const DEMO_STUDENT_EMAIL = 'student@testvantage.com'
export const DEMO_STUDENT_ID = 'demo-student'
export const STAFF_WORKING_TEST_ID = 'uploaded-custom'

export const DEMO_SAMPLE_TEST_IDS = [
  'jee-main-full-demo',
  'jee-main-chapter-kinematics',
  'jee-main-part-pcm',
  'jee-advanced-all-types',
  'neet-chapter-demo',
]

/** Student practice account (Try as student) — not a teacher/admin. */
export function isDemoStudentIdentity(sessionOrUser) {
  if (!sessionOrUser) return false
  const role = sessionOrUser.role
  if (role === 'teacher' || role === 'admin') return false
  if (sessionOrUser.isDemo === true || sessionOrUser.allowAllMocks === true) {
    return role === 'user' || role === 'student' || !role
  }
  const id = String(sessionOrUser.id ?? sessionOrUser.userId ?? '')
  if (id === DEMO_STUDENT_ID) return true
  const email = String(sessionOrUser.email ?? '').trim().toLowerCase()
  return email === DEMO_STUDENT_EMAIL
}
