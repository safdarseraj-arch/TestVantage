import { getUserById, saveUserProfile } from './users.js'
import { refreshSessionFromUser } from './auth.js'
import { SELF_REGISTER_TEACHER_PERMS } from './permissions.js'

export const STUDENT_ONBOARDING_PATH = '/onboarding/student'
export const TEACHER_ONBOARDING_PATH = '/onboarding/teacher'
export const STUDENT_HOME_PATH = '/home'
export const TEACHER_HOME_PATH = '/teacher'
export const PROFILE_PATH = '/profile'

/** Home path for a signed-in (or signed-out) session — never a crash / blank page. */
export function signedInHomePath(session) {
  if (!session) return STUDENT_HOME_PATH
  if (session.role === 'admin') return '/question-bank'
  if (session.role === 'teacher') {
    if (needsTeacherOnboarding(session)) return TEACHER_ONBOARDING_PATH
    return TEACHER_HOME_PATH
  }
  if (needsStudentOnboarding(session)) return STUDENT_ONBOARDING_PATH
  return STUDENT_HOME_PATH
}

export const ACADEMIC_STATUSES = [
  { id: 'class_11', label: 'Studying 11th' },
  { id: 'class_12', label: 'Studying 12th' },
  { id: 'class_12_passed', label: '12th passed' },
]

export const TARGET_EXAMS = [
  { id: 'jee-main', label: 'JEE Main' },
  { id: 'jee-advanced', label: 'JEE Advanced' },
  { id: 'neet', label: 'NEET' },
]

export const TEACHER_SUBJECTS = [
  { id: 'physics', label: 'Physics' },
  { id: 'chemistry', label: 'Chemistry' },
  { id: 'mathematics', label: 'Mathematics' },
  { id: 'botany', label: 'Botany' },
  { id: 'zoology', label: 'Zoology' },
]

export const TEACHER_STANDARDS = [
  { id: 'class_11', label: 'Class 11' },
  { id: 'class_12', label: 'Class 12' },
  { id: 'class_12_passed', label: 'Class 12 passed / dropper' },
]

export function yearOptions(fromYear, toYear) {
  const from = Number(fromYear)
  const to = Number(toYear)
  const out = []
  for (let y = to; y >= from; y -= 1) out.push(y)
  return out
}

export function currentCalendarYear() {
  return new Date().getFullYear()
}

function trim(value) {
  return String(value ?? '').trim()
}

export function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '')
}

export function normalizePhone(value) {
  let digits = digitsOnly(value)
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2)
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
  return digits
}

function validDob(value) {
  const raw = trim(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false
  const dt = new Date(`${raw}T00:00:00`)
  if (Number.isNaN(dt.getTime())) return false
  const year = dt.getFullYear()
  const now = new Date()
  if (dt > now) return false
  if (year < 1950 || year > now.getFullYear() - 8) return false
  return true
}

function studentProfileFilled(user) {
  if (!user) return false
  if (user.profileComplete) return true
  const p = user.profile
  if (!p) return false
  return !!(
    p.dob &&
    p.fatherName &&
    p.fatherPhone &&
    p.tenthMarks != null &&
    p.tenthYear &&
    p.academicStatus &&
    p.school &&
    Array.isArray(p.targetExams) &&
    p.targetExams.length &&
    p.targetYear
  )
}

function teacherProfileFilled(user) {
  if (!user) return false
  if (user.profileComplete) return true
  const p = user.profile
  if (!p) return false
  return !!(p.dob && Array.isArray(p.subjects) && p.subjects.length && Array.isArray(p.standards) && p.standards.length)
}

/**
 * Student with an empty / unfinished profile — show the form once until filled.
 * Covers new self-register and older accounts that never stored these fields.
 */
export function needsStudentOnboarding(session) {
  if (!session || (session.role !== 'user' && session.role !== 'student')) return false
  if (session.profileComplete) return false
  const user = session.userId ? getUserById(session.userId) : null
  if (user) return !studentProfileFilled(user)
  return !session.profileComplete
}

/**
 * Teacher with an empty / unfinished profile — show the form once until filled.
 * After the form, their bank / lecture / paper tools turn on.
 */
export function needsTeacherOnboarding(session) {
  if (!session || session.role !== 'teacher') return false
  if (session.profileComplete) return false
  const user = session.userId ? getUserById(session.userId) : null
  if (user) return !teacherProfileFilled(user)
  return !session.profileComplete
}

/** Exam the student should land on in Practice / Speed / CDF / Mock Builder. */
export function preferredStudentExamId(session) {
  const user = session?.userId ? getUserById(session.userId) : null
  const fromSession = Array.isArray(session?.targetExams) ? session.targetExams : []
  const fromProfile = Array.isArray(user?.profile?.targetExams) ? user.profile.targetExams : []
  const ids = fromSession.length ? fromSession : fromProfile
  const hit = ids.find((id) => TARGET_EXAMS.some((e) => e.id === id))
  return hit || 'jee-main'
}

export function afterAuthPath(session, fallback = STUDENT_HOME_PATH) {
  if (!session) return '/login'
  if (session.role === 'admin') return fallback && fallback !== STUDENT_HOME_PATH ? fallback : '/question-bank'
  if (session.role === 'teacher') {
    if (needsTeacherOnboarding(session)) return TEACHER_ONBOARDING_PATH
    return fallback && fallback !== STUDENT_HOME_PATH ? fallback : TEACHER_HOME_PATH
  }
  if (needsStudentOnboarding(session)) return STUDENT_ONBOARDING_PATH
  return fallback || STUDENT_HOME_PATH
}

/**
 * @param {object} raw
 * @returns {{ ok: true, profile: object } | { ok: false, error: string }}
 */
export function validateStudentProfile(raw) {
  const dob = trim(raw?.dob)
  const fatherName = trim(raw?.fatherName)
  const fatherPhone = normalizePhone(raw?.fatherPhone)
  const tenthMarks = trim(raw?.tenthMarks)
  const tenthYear = trim(raw?.tenthYear)
  const academicStatus = trim(raw?.academicStatus)
  const school = trim(raw?.school)
  const targetExams = Array.isArray(raw?.targetExams)
    ? raw.targetExams.map(trim).filter(Boolean)
    : []
  const targetYear = trim(raw?.targetYear)

  if (!validDob(dob)) return { ok: false, error: 'Enter a valid date of birth.' }
  if (fatherName.length < 2) return { ok: false, error: 'Enter father’s full name.' }
  if (!/^[6-9]\d{9}$/.test(fatherPhone)) {
    return { ok: false, error: 'Enter father’s 10-digit mobile number.' }
  }
  const marksNum = Number(tenthMarks)
  if (!Number.isFinite(marksNum) || marksNum < 0 || marksNum > 100) {
    return { ok: false, error: 'Enter Class 10 marks as a percentage (0–100).' }
  }
  const ty = Number(tenthYear)
  const nowY = currentCalendarYear()
  if (!Number.isInteger(ty) || ty < 2005 || ty > nowY) {
    return { ok: false, error: 'Enter a valid Class 10 passing year.' }
  }
  if (!ACADEMIC_STATUSES.some((s) => s.id === academicStatus)) {
    return { ok: false, error: 'Choose whether you are in 11th, 12th, or 12th passed.' }
  }
  if (school.length < 2) return { ok: false, error: 'Enter your school name.' }
  if (!targetExams.length || !targetExams.every((id) => TARGET_EXAMS.some((e) => e.id === id))) {
    return { ok: false, error: 'Pick at least one target exam.' }
  }
  const ey = Number(targetYear)
  if (!Number.isInteger(ey) || ey < nowY || ey > nowY + 6) {
    return { ok: false, error: 'Pick the year you will take the exam.' }
  }

  return {
    ok: true,
    profile: {
      kind: 'student',
      dob,
      fatherName,
      fatherPhone,
      tenthMarks: Math.round(marksNum * 10) / 10,
      tenthYear: ty,
      academicStatus,
      school,
      targetExams,
      targetYear: ey,
    },
  }
}

/**
 * @param {object} raw
 * @returns {{ ok: true, profile: object } | { ok: false, error: string }}
 */
export function validateTeacherProfile(raw) {
  const dob = trim(raw?.dob)
  const subjects = Array.isArray(raw?.subjects) ? raw.subjects.map(trim).filter(Boolean) : []
  const standards = Array.isArray(raw?.standards) ? raw.standards.map(trim).filter(Boolean) : []
  const experience = trim(raw?.experience)

  if (!validDob(dob)) return { ok: false, error: 'Enter a valid date of birth.' }
  if (!subjects.length || !subjects.every((id) => TEACHER_SUBJECTS.some((s) => s.id === id))) {
    return { ok: false, error: 'Pick at least one subject you teach.' }
  }
  if (!standards.length || !standards.every((id) => TEACHER_STANDARDS.some((s) => s.id === id))) {
    return { ok: false, error: 'Pick at least one class / standard you teach.' }
  }
  if (experience.length > 2000) {
    return { ok: false, error: 'Keep academic / past experience under 2000 characters, or leave it blank.' }
  }

  return {
    ok: true,
    profile: {
      kind: 'teacher',
      dob,
      subjects,
      standards,
      experience,
    },
  }
}

export function completeStudentProfile(userId, raw) {
  const checked = validateStudentProfile(raw)
  if (!checked.ok) return checked
  const saved = saveUserProfile(userId, {
    profile: checked.profile,
    profileComplete: true,
  })
  if (!saved.ok) return saved
  refreshSessionFromUser(userId)
  return { ok: true, user: saved.user }
}

export function completeTeacherProfile(userId, raw) {
  const checked = validateTeacherProfile(raw)
  if (!checked.ok) return checked
  const user = getUserById(userId)
  if (!user || user.role !== 'teacher') return { ok: false, error: 'Teacher account not found.' }

  const existing = Array.isArray(user.permissions) ? user.permissions : []
  const saved = saveUserProfile(userId, {
    profile: checked.profile,
    profileComplete: true,
    permissions: [...new Set([...existing, ...SELF_REGISTER_TEACHER_PERMS])],
  })
  if (!saved.ok) return saved
  refreshSessionFromUser(userId)
  return { ok: true, user: saved.user }
}
