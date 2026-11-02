/**
 * Labeled practice accounts so staff can try Student / Teacher / Staff / Admin.
 * Does not impersonate real users. Never wipes the question bank.
 */

import { PERMS, DEFAULT_TEACHER_PERMS } from './permissions.js'
import { loadUsers, saveUsersDirect } from './users.js'
import { loadAdminAccount } from './auth.js'
import { persistInviteCode } from './invites.js'
import { DEMO_STUDENT_EMAIL, DEMO_STUDENT_ID } from './demoStudentAccess.js'

export {
  DEMO_SAMPLE_TEST_IDS,
  DEMO_STUDENT_EMAIL,
  DEMO_STUDENT_ID,
  STAFF_WORKING_TEST_ID,
  isDemoStudentIdentity,
} from './demoStudentAccess.js'

export const DEMO_ACCOUNTS = [
  {
    id: 'demo-admin',
    key: 'admin',
    label: 'Admin',
    email: 'admin@testvantage.com',
    password: 'admin123',
    role: 'admin',
    home: '/question-bank',
    hint: 'Full admin — Question Bank and official papers',
  },
  {
    id: DEMO_STUDENT_ID,
    key: 'student',
    label: 'Student',
    email: DEMO_STUDENT_EMAIL,
    password: 'student123',
    role: 'user',
    home: '/home',
    hint: 'Student home — Prepare, mocks, results',
  },
  {
    id: 'demo-teacher',
    key: 'teacher',
    label: 'Teacher',
    email: 'teacher@testvantage.com',
    password: 'teacher123',
    role: 'teacher',
    home: '/teacher',
    permissions: [...DEFAULT_TEACHER_PERMS],
    hint: 'Teacher home — classes, papers, lecture set',
  },
  {
    id: 'demo-staff',
    key: 'staff',
    label: 'Staff',
    email: 'staff@testvantage.com',
    password: 'staff123',
    role: 'teacher',
    home: '/admin/schools',
    permissions: [
      PERMS.MANAGE_SCHOOLS,
      PERMS.ASSIGN_TESTS,
      PERMS.VIEW_STUDENT_RESULTS,
      PERMS.CREATE_PAPER,
      PERMS.UPLOAD_QUESTIONS,
    ],
    hint: 'School staff — schools, assign tests, results',
  },
]

const STUDENT_PROFILE = {
  kind: 'student',
  dob: '2008-06-15',
  fatherName: 'Demo Parent',
  fatherPhone: '9876543210',
  tenthMarks: 88,
  tenthYear: '2024',
  academicStatus: 'class_12',
  school: 'Demo School',
  // All three tracks so Prepare / Practice never bounce for a missing exam.
  targetExams: ['jee-main', 'jee-advanced', 'neet'],
  targetYear: String(new Date().getFullYear() + 1),
}

const TEACHER_PROFILE = {
  dob: '1988-06-15',
  subjects: ['physics', 'mathematics'],
  standards: ['class_11', 'class_12'],
  experience: 'Demo teacher account',
}

function reservedDemoEmail(email) {
  return DEMO_ACCOUNTS.some((d) => d.role !== 'admin' && d.email === email)
}

function demoUserRow(demo) {
  const isStudent = demo.role === 'user'
  return {
    id: demo.id,
    name: `Demo ${demo.label}`,
    email: demo.email,
    password: demo.password,
    role: demo.role,
    permissions: demo.role === 'teacher' ? [...(demo.permissions ?? [])] : [],
    profileComplete: true,
    selfRegistered: false,
    isDemo: true,
    allowAllMocks: isStudent,
    createdBy: 'demo-seed',
    profile: isStudent ? { ...STUDENT_PROFILE } : { ...TEACHER_PROFILE },
  }
}

function profilesMatch(prev, next) {
  return JSON.stringify(prev ?? {}) === JSON.stringify(next ?? {})
}

/** Create or refresh labeled demo users. Leaves unrelated accounts alone. */
export function ensureDemoAccounts() {
  const users = loadUsers()
  let changed = false
  for (const demo of DEMO_ACCOUNTS) {
    if (demo.role === 'admin') continue
    const idx = users.findIndex((u) => String(u.email ?? '').toLowerCase() === demo.email)
    const next = demoUserRow(demo)
    if (idx < 0) {
      users.push({ ...next, createdAt: Date.now() })
      changed = true
      continue
    }
    const prev = users[idx]
    const canRefresh = prev.isDemo === true || prev.id === demo.id || reservedDemoEmail(prev.email)
    if (!canRefresh) continue
    const same =
      prev.password === next.password &&
      prev.role === next.role &&
      prev.name === next.name &&
      prev.profileComplete === true &&
      prev.isDemo === true &&
      Boolean(prev.allowAllMocks) === Boolean(next.allowAllMocks) &&
      JSON.stringify(prev.permissions ?? []) === JSON.stringify(next.permissions) &&
      profilesMatch(prev.profile, next.profile)
    if (same) continue
    users[idx] = {
      ...prev,
      ...next,
      createdAt: prev.createdAt || Date.now(),
    }
    changed = true
  }
  if (changed) saveUsersDirect(users)
  for (const demo of DEMO_ACCOUNTS) {
    if (demo.role === 'admin') continue
    persistInviteCode(demo.id)
  }
  return DEMO_ACCOUNTS
}

export function getDemoAccount(key) {
  return DEMO_ACCOUNTS.find((d) => d.key === key) ?? null
}

/** Admin email/password for the demo hint (local default, not a user row). */
export function getDemoAdminHint() {
  const admin = loadAdminAccount()
  return {
    email: admin.email || 'admin@testvantage.com',
    password: admin.password === 'admin123' ? 'admin123' : '(the password you set in Admin)',
  }
}
