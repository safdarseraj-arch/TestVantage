/** Teacher permission flags (admin assigns per teacher account). */
export const PERMS = {
  CREATE_PAPER: 'create_paper',
  UPLOAD_QUESTIONS: 'upload_questions',
  PUBLISH_QUESTIONS: 'publish_questions',
  ACCESS_MAIN_QUESTION_BANK: 'access_main_question_bank',
  VIEW_STUDENT_RESULTS: 'view_student_results',
  MANAGE_SCHOOLS: 'manage_schools',
  ASSIGN_TESTS: 'assign_tests',
}

export const PERM_LABELS = {
  [PERMS.CREATE_PAPER]: 'Create paper / test',
  [PERMS.UPLOAD_QUESTIONS]: 'Upload questions',
  [PERMS.PUBLISH_QUESTIONS]: 'Publish questions to bank',
  [PERMS.ACCESS_MAIN_QUESTION_BANK]: 'Access main question bank',
  [PERMS.VIEW_STUDENT_RESULTS]: 'See student results',
  [PERMS.MANAGE_SCHOOLS]: 'Manage schools',
  [PERMS.ASSIGN_TESTS]: 'Assign tests to classes',
}

export const ALL_TEACHER_PERMS = Object.values(PERMS)

/** Default rights for new teachers — publish + main bank access granted separately by admin. */
export const DEFAULT_TEACHER_PERMS = ALL_TEACHER_PERMS.filter(
  (p) => p !== PERMS.PUBLISH_QUESTIONS && p !== PERMS.ACCESS_MAIN_QUESTION_BANK,
)

/** Self-registered teacher: their bank, lecture plan, papers, PDF. Not Official PYQ / main bank. */
export const SELF_REGISTER_TEACHER_PERMS = [
  PERMS.CREATE_PAPER,
  PERMS.UPLOAD_QUESTIONS,
  PERMS.VIEW_STUDENT_RESULTS,
]

/** @param {string} permission @param {{ role?: string, permissions?: string[] } | null} session */
export function sessionHasPermission(session, permission) {
  if (!session) return false
  if (session.role === 'admin') return true
  if (session.role !== 'teacher') return false
  return (session.permissions ?? []).includes(permission)
}

/**
 * Default landing path after teacher login — always the teacher hub so the
 * organise / prepare / lecture / upload cards are obvious.
 * Permission-specific shortcuts stay available from the hub.
 */
export function teacherHomePath(_permissions = []) {
  return '/teacher'
}
