/**
 * Fast check: student/teacher self-register profile + teacher bank rights.
 * Does not touch the question bank file.
 */
import assert from 'node:assert/strict'

const mem = { local: {}, session: {} }
function memoryStore(bag) {
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(bag, k) ? bag[k] : null),
    setItem: (k, v) => {
      bag[k] = String(v)
    },
    removeItem: (k) => {
      delete bag[k]
    },
  }
}
globalThis.localStorage = memoryStore(mem.local)
globalThis.sessionStorage = memoryStore(mem.session)

const { registerUser, registerTeacher, getUserById, loadUsers, saveUsersDirect } = await import('../src/utils/users.js')
const { loginUser } = await import('../src/utils/auth.js')
const { PERMS, SELF_REGISTER_TEACHER_PERMS } = await import('../src/utils/permissions.js')
const {
  afterAuthPath,
  completeStudentProfile,
  completeTeacherProfile,
  needsStudentOnboarding,
  needsTeacherOnboarding,
  signedInHomePath,
  validateStudentProfile,
  validateTeacherProfile,
} = await import('../src/utils/userProfiles.js')

const bad = validateStudentProfile({})
assert.equal(bad.ok, false)

const studentOk = validateStudentProfile({
  dob: '2008-05-12',
  fatherName: 'Ramesh Kumar',
  fatherPhone: '+91 9876543210',
  tenthMarks: '86.5',
  tenthYear: '2024',
  academicStatus: 'class_11',
  school: 'DPS Ranchi',
  targetExams: ['jee-main', 'jee-advanced'],
  targetYear: String(new Date().getFullYear() + 1),
})
assert.equal(studentOk.ok, true)

const teacherOk = validateTeacherProfile({
  dob: '1988-03-01',
  subjects: ['physics'],
  standards: ['class_12'],
  experience: '8',
})
assert.equal(teacherOk.ok, true)

const sReg = registerUser({ name: 'Asha', email: 'asha.onboard@test.com', password: 'pass12' })
assert.equal(sReg.ok, true)
const sLogin = loginUser('asha.onboard@test.com', 'pass12')
assert.equal(sLogin.ok, true)
assert.equal(needsStudentOnboarding(sLogin.session), true)
assert.equal(afterAuthPath(sLogin.session), '/onboarding/student')

const sDone = completeStudentProfile(sReg.user.id, {
  dob: '2008-05-12',
  fatherName: 'Ramesh Kumar',
  fatherPhone: '9876543210',
  tenthMarks: '86',
  tenthYear: '2024',
  academicStatus: 'class_12',
  school: 'DPS Ranchi',
  targetExams: ['neet'],
  targetYear: String(new Date().getFullYear() + 1),
})
assert.equal(sDone.ok, true)
assert.equal(getUserById(sReg.user.id).profileComplete, true)
assert.equal(needsStudentOnboarding({ ...sLogin.session, profileComplete: true }), false)
assert.equal(afterAuthPath({ ...sLogin.session, profileComplete: true, role: 'user' }), '/home')

const tReg = registerTeacher({ name: 'Ms Rao', email: 'rao.onboard@test.com', password: 'teach12' })
assert.equal(tReg.ok, true)
assert.deepEqual(tReg.user.permissions, [])
const tLogin = loginUser('rao.onboard@test.com', 'teach12')
assert.equal(needsTeacherOnboarding(tLogin.session), true)
assert.equal(afterAuthPath(tLogin.session), '/onboarding/teacher')

const tDone = completeTeacherProfile(tReg.user.id, {
  dob: '1988-03-01',
  subjects: ['chemistry', 'physics'],
  standards: ['class_11', 'class_12'],
  experience: '',
})
assert.equal(tDone.ok, true)
const teacher = getUserById(tReg.user.id)
assert.equal(teacher.profileComplete, true)
assert.ok(teacher.permissions.includes(PERMS.CREATE_PAPER))
assert.ok(teacher.permissions.includes(PERMS.UPLOAD_QUESTIONS))
assert.ok(!teacher.permissions.includes(PERMS.PUBLISH_QUESTIONS))
assert.ok(!teacher.permissions.includes(PERMS.ACCESS_MAIN_QUESTION_BANK))
assert.deepEqual([...teacher.permissions].sort(), [...SELF_REGISTER_TEACHER_PERMS].sort())

const existingStudent = {
  id: 'user-legacy-empty',
  name: 'Legacy Student',
  email: 'legacy.student@test.com',
  password: 'pass12',
  role: 'user',
  createdAt: Date.now(),
  createdBy: 'admin',
}
const existingTeacher = {
  id: 'teacher-legacy-empty',
  name: 'Legacy Teacher',
  email: 'legacy.teacher@test.com',
  password: 'teach12',
  role: 'teacher',
  permissions: [],
  createdAt: Date.now(),
  createdBy: 'admin',
}
saveUsersDirect([...loadUsers(), existingStudent, existingTeacher])
const legacyStudentLogin = loginUser('legacy.student@test.com', 'pass12')
assert.equal(needsStudentOnboarding(legacyStudentLogin.session), true)
assert.equal(afterAuthPath(legacyStudentLogin.session), '/onboarding/student')
const legacyTeacherLogin = loginUser('legacy.teacher@test.com', 'teach12')
assert.equal(needsTeacherOnboarding(legacyTeacherLogin.session), true)
assert.equal(afterAuthPath(legacyTeacherLogin.session), '/onboarding/teacher')
const legacyTeacherDone = completeTeacherProfile(existingTeacher.id, {
  dob: '1985-01-15',
  subjects: ['mathematics'],
  standards: ['class_11'],
})
assert.equal(legacyTeacherDone.ok, true)
assert.ok(getUserById(existingTeacher.id).permissions.includes(PERMS.UPLOAD_QUESTIONS))
assert.ok(!getUserById(existingTeacher.id).permissions.includes(PERMS.PUBLISH_QUESTIONS))

assert.equal(signedInHomePath(null), '/home')
assert.equal(signedInHomePath({ role: 'admin' }), '/question-bank')
assert.equal(
  signedInHomePath({ ...tLogin.session, profileComplete: true, role: 'teacher' }),
  '/teacher',
)
assert.equal(signedInHomePath({ ...sLogin.session, profileComplete: true, role: 'user' }), '/home')

const studentResave = completeStudentProfile(sReg.user.id, {
  dob: '2008-05-12',
  fatherName: 'Suresh Kumar',
  fatherPhone: '9876543210',
  tenthMarks: '91',
  tenthYear: '2024',
  academicStatus: 'class_12',
  school: 'DPS Ranchi',
  targetExams: ['neet'],
  targetYear: String(new Date().getFullYear() + 1),
})
assert.equal(studentResave.ok, true)
assert.equal(getUserById(sReg.user.id).profile.fatherName, 'Suresh Kumar')
assert.equal(getUserById(sReg.user.id).profile.tenthMarks, 91)

const teacherResave = completeTeacherProfile(tReg.user.id, {
  dob: '1988-03-01',
  subjects: ['physics'],
  standards: ['class_12'],
  experience: 'IIT coaching, 10 years',
})
assert.equal(teacherResave.ok, true)
assert.equal(getUserById(tReg.user.id).profile.experience, 'IIT coaching, 10 years')
assert.deepEqual(getUserById(tReg.user.id).profile.subjects, ['physics'])

const { ensureDemoAccounts, DEMO_ACCOUNTS } = await import('../src/utils/demoAccounts.js')
ensureDemoAccounts()
const seeded = loadUsers()
const studentDemo = seeded.find((u) => u.email === 'student@testvantage.com')
const teacherDemo = seeded.find((u) => u.email === 'teacher@testvantage.com')
const staffDemo = seeded.find((u) => u.email === 'staff@testvantage.com')
assert.equal(studentDemo?.isDemo, true)
assert.equal(studentDemo?.password, 'student123')
assert.equal(teacherDemo?.role, 'teacher')
assert.equal(teacherDemo?.password, 'teacher123')
assert.equal(staffDemo?.role, 'teacher')
assert.equal(staffDemo?.password, 'staff123')
assert.ok(staffDemo.permissions.includes(PERMS.MANAGE_SCHOOLS))
const studentLogin = loginUser('student@testvantage.com', 'student123')
assert.equal(studentLogin.ok, true)
assert.equal(studentLogin.session.role, 'user')
assert.equal(studentLogin.session.isDemo, true)
assert.equal(studentLogin.session.allowAllMocks, true)
assert.ok(studentLogin.session.targetExams.includes('jee-main'))
assert.equal(needsStudentOnboarding(studentLogin.session), false)
assert.equal(signedInHomePath(studentLogin.session), '/home')
const teacherLogin = loginUser('teacher@testvantage.com', 'teacher123')
assert.equal(teacherLogin.ok, true)
assert.equal(needsTeacherOnboarding(teacherLogin.session), false)
assert.equal(signedInHomePath(teacherLogin.session), '/teacher')
const staffLogin = loginUser('staff@testvantage.com', 'staff123')
assert.equal(staffLogin.ok, true)
assert.equal(staffLogin.session.role, 'teacher')
assert.ok(DEMO_ACCOUNTS.some((d) => d.email === 'admin@testvantage.com'))
const other = registerUser({ name: 'Keep Me', email: 'keep.me@school.test', password: 'keep1234' })
assert.equal(other.ok, true)
ensureDemoAccounts()
assert.equal(getUserById(other.user.id)?.email, 'keep.me@school.test')
assert.equal(getUserById(other.user.id)?.password, 'keep1234')

const {
  persistInviteCode,
  findUserByInviteCode,
  applyInviteOnRegister,
  countReferralsForUser,
  normalizeInviteCode,
} = await import('../src/utils/invites.js')
const teacherInvite = persistInviteCode(teacherDemo.id)
assert.ok(teacherInvite.length >= 6)
assert.equal(findUserByInviteCode(teacherInvite)?.id, teacherDemo.id)
const invited = registerUser({ name: 'Referred Kid', email: 'referred.kid@test.com', password: 'pass12' })
assert.equal(invited.ok, true)
const applied = applyInviteOnRegister(invited.user.id, teacherInvite)
assert.equal(applied.ok, true)
assert.equal(getUserById(invited.user.id).referredBy, teacherDemo.id)
assert.equal(countReferralsForUser(teacherDemo.id) >= 1, true)
assert.equal(normalizeInviteCode('tv-ab12'), 'TVAB12')
const badInvite = applyInviteOnRegister(invited.user.id, 'ZZZZZZ')
assert.equal(badInvite.ok, false)

console.log('test-onboarding-profiles: ok')
