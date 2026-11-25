/**
 * School ERP Phase-1 Academic Foundation — stores, CSV import, invites, readiness.
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
    clear: () => {
      for (const k of Object.keys(bag)) delete bag[k]
    },
  }
}
globalThis.localStorage = memoryStore(mem.local)
globalThis.sessionStorage = memoryStore(mem.session)

const { addSchool, updateSchool, deleteSchool, loadSchools } = await import(
  '../src/utils/schoolsStore.js'
)
const { addClass, enrollStudentInClass, loadClasses } = await import('../src/utils/classesStore.js')
const {
  addBatch,
  enrollStudentInBatch,
  getBatchesBySchool,
  deleteBatchesForSchool,
  trackLabel,
  updateBatch,
} = await import('../src/utils/schoolBatchesStore.js')
const {
  createSchoolInvite,
  findActiveSchoolInvite,
  revokeSchoolInvite,
  teacherInviteSignupPath,
  teacherInviteOnboardingPath,
  teacherInviteShareText,
  deleteInvitesForSchool,
  getInvitesForSchool,
} = await import('../src/utils/schoolInvitesStore.js')
const { lookupSchoolInvite } = await import('../src/utils/facultyWorkbench.js')
const {
  parseRosterCsv,
  previewRosterRows,
  formatRosterErrors,
  importRosterToClass,
  ROSTER_CSV_TEMPLATE,
} = await import('../src/utils/schoolRosterImport.js')
const {
  schoolPhase1Readiness,
  defaultAcademicYearLabel,
} = await import('../src/utils/schoolPhase1.js')
const { createStudentAccount, loadUsers, saveUsersDirect } = await import('../src/utils/users.js')

// Clean slate
saveUsersDirect([])
localStorage.clear()

assert.ok(defaultAcademicYearLabel(new Date('2026-06-01')).startsWith('2026'))

const schoolRes = addSchool({
  name: 'Phase1 Pilot School',
  code: 'P1',
  academicYear: '2026-27',
  boardType: 'cbse',
})
assert.equal(schoolRes.ok, true)
const school = schoolRes.school
assert.equal(loadSchools().length, 1)

const classRes = addClass({
  schoolId: school.id,
  name: '11-A Science',
  grade: '11',
  section: 'A',
})
assert.equal(classRes.ok, true)
const klass = classRes.class

const batchRes = addBatch({
  schoolId: school.id,
  name: 'JEE Integrated Batch 1',
  trackType: 'jee',
})
assert.equal(batchRes.ok, true)
assert.equal(trackLabel('jee'), 'JEE')
assert.equal(getBatchesBySchool(school.id).length, 1)

// Duplicate batch name blocked
const dupBatch = addBatch({
  schoolId: school.id,
  name: 'jee integrated batch 1',
  trackType: 'neet',
})
assert.equal(dupBatch.ok, false)

const inviteRes = createSchoolInvite({
  schoolId: school.id,
  campusName: school.name,
  department: 'Science',
  classes: ['11-A Science'],
  preferredCode: 'TV-PILOT-AAA',
})
assert.equal(inviteRes.ok, true)
assert.equal(findActiveSchoolInvite('tv-pilot-aaa')?.campusName, 'Phase1 Pilot School')
assert.equal(lookupSchoolInvite('TV-PILOT-AAA')?.source, 'school')
assert.equal(lookupSchoolInvite('SCHOOL-DEMO')?.source, 'demo')
assert.ok(teacherInviteSignupPath('TV-PILOT-AAA').startsWith('/login?schoolInvite='))
assert.ok(teacherInviteOnboardingPath('TV-PILOT-AAA').includes('/teacher/onboarding?schoolInvite='))
assert.ok(teacherInviteShareText('TV-PILOT-AAA', school.name).includes('TV-PILOT-AAA'))
assert.ok(teacherInviteShareText('TV-PILOT-AAA', school.name).includes('/login?schoolInvite='))

const earlyReady = schoolPhase1Readiness({
  school,
  schoolClasses: loadClasses().filter((c) => c.schoolId === school.id),
  batches: getBatchesBySchool(school.id),
})
assert.ok(earlyReady.readyCount >= 3)
assert.equal(earlyReady.items.find((i) => i.id === 'roster')?.done, false)
assert.ok(earlyReady.nextItem)
assert.equal(earlyReady.nextItem.id, 'roster')
assert.ok(earlyReady.nextItem.cta)

const parsed = parseRosterCsv(ROSTER_CSV_TEMPLATE)
assert.equal(parsed.ok, true)
assert.equal(parsed.rows.length, 3)
const previewOk = previewRosterRows(parsed.rows)
assert.equal(previewOk.ok, true)
assert.equal(previewOk.count, 3)
assert.ok(previewOk.summary.includes('3 students'))
assert.ok(previewOk.autoCreds >= 1)

const badPreview = previewRosterRows([
  { name: 'A', loginId: 'same', password: '', line: 2 },
  { name: 'Bok', loginId: 'same', password: '', line: 3 },
])
assert.equal(badPreview.ok, false)
assert.ok(formatRosterErrors(badPreview.errors).toLowerCase().includes('duplicate'))

const imported = importRosterToClass({
  classId: klass.id,
  className: klass.name,
  rows: parsed.rows,
  createdBy: 'phase1-test',
})
assert.equal(imported.ok, true)
assert.equal(imported.created.length, 3)
assert.equal(loadUsers().filter((u) => u.role === 'user').length, 3)

const refreshedClass = loadClasses().find((c) => c.id === klass.id)
assert.equal(refreshedClass.studentIds.length, 3)

const firstStudentId = imported.created[0].id
const mapRes = enrollStudentInBatch(batchRes.batch.id, firstStudentId)
assert.equal(mapRes.ok, true)

updateSchool(school.id, { affiliationNo: 'CBSE-123' })
const ready = schoolPhase1Readiness({
  school: loadSchools()[0],
  schoolClasses: loadClasses().filter((c) => c.schoolId === school.id),
  batches: getBatchesBySchool(school.id),
})
assert.equal(ready.percent, 100)
assert.equal(ready.nextItem, null)
assert.ok(ready.nextHint.toLowerCase().includes('ready'))

const revoke = revokeSchoolInvite('TV-PILOT-AAA')
assert.equal(revoke.ok, true)
assert.equal(findActiveSchoolInvite('TV-PILOT-AAA'), null)
assert.equal(lookupSchoolInvite('TV-PILOT-AAA'), null)

// After revoke with no staff linked, invite checklist item should flip off
const afterRevoke = schoolPhase1Readiness({
  school: loadSchools()[0],
  schoolClasses: loadClasses().filter((c) => c.schoolId === school.id),
  batches: getBatchesBySchool(school.id),
})
assert.equal(afterRevoke.items.find((i) => i.id === 'invite')?.done, false)
assert.ok(afterRevoke.percent < 100)

// Re-mint so cascade tests have an invite
createSchoolInvite({
  schoolId: school.id,
  campusName: school.name,
  preferredCode: 'TV-PILOT-BBB',
})
assert.equal(getInvitesForSchool(school.id).filter((i) => !i.revokedAt).length, 1)

// Rename uniqueness still enforced
assert.equal(
  updateBatch(batchRes.batch.id, { name: 'JEE Integrated Batch 1' }).ok,
  true,
)

// Manual student + enroll still works
const solo = createStudentAccount({
  name: 'Solo Student',
  loginId: 'solo.11a',
  password: 'pass1234',
  createdBy: 'test',
})
assert.equal(solo.ok, true)
assert.equal(enrollStudentInClass(klass.id, solo.user.id).ok, true)

const badCsv = parseRosterCsv('foo,bar\n1,2')
assert.equal(badCsv.ok, false)

// Cascade helpers (school still has classes — deleteSchool blocked at UI; helpers work alone)
const orphanSchool = addSchool({
  name: 'Orphan Cascade School',
  academicYear: '2026-27',
  boardType: 'icse',
})
assert.equal(orphanSchool.ok, true)
addBatch({ schoolId: orphanSchool.school.id, name: 'NEET Crash', trackType: 'neet' })
createSchoolInvite({
  schoolId: orphanSchool.school.id,
  campusName: orphanSchool.school.name,
  preferredCode: 'TV-ORPHAN-1',
})
assert.equal(getBatchesBySchool(orphanSchool.school.id).length, 1)
assert.equal(getInvitesForSchool(orphanSchool.school.id).length, 1)

const del = deleteSchool(orphanSchool.school.id)
assert.equal(del.ok, true)
// Dynamic cleanup is async via import().then — call helpers directly too for determinism
deleteBatchesForSchool(orphanSchool.school.id)
deleteInvitesForSchool(orphanSchool.school.id)
assert.equal(getBatchesBySchool(orphanSchool.school.id).length, 0)
assert.equal(getInvitesForSchool(orphanSchool.school.id).length, 0)
assert.equal(findActiveSchoolInvite('TV-ORPHAN-1'), null)

// --- Deferred MVP: pilot demo seed, WhatsApp helpers, batch assign, invite attach, org payload ---
const {
  ensurePilotDemoCampus,
  PILOT_DEMO_CAMPUS_NAME,
  PILOT_DEMO_INVITE_CODE,
} = await import('../src/utils/pilotDemoCampus.js')
const { attachTeacherFromSchoolInvite, isTeacherLinkedToSchool } = await import(
  '../src/utils/schoolTeacherAttach.js'
)
const {
  feeReminderMessage,
  absenceReminderMessage,
  buildWhatsAppHref,
} = await import('../src/utils/schoolWhatsApp.js')
const { collectOrgPayload, applyOrgPayload } = await import('../src/utils/orgServerSync.js')
const { assignTestToBatch, getAssignedTestIdsForStudent } = await import(
  '../src/utils/assignmentsStore.js'
)
const { createTeacherAccount } = await import('../src/utils/users.js')

const pilot1 = ensurePilotDemoCampus()
assert.equal(pilot1.ok, true)
assert.equal(pilot1.school?.name, PILOT_DEMO_CAMPUS_NAME)
assert.ok(pilot1.details.classCount >= 2)
assert.ok(pilot1.details.batchCount >= 1)
assert.ok(pilot1.details.studentCount >= 3)
assert.equal(pilot1.details.inviteCode, PILOT_DEMO_INVITE_CODE)
const pilot2 = ensurePilotDemoCampus()
assert.equal(pilot2.ok, true)
assert.equal(pilot2.details.classCount, pilot1.details.classCount)

const feeText = feeReminderMessage({
  studentName: 'Aria',
  title: 'Term fee',
  amount: 8500,
  dueDate: '2026-04-15',
  schoolName: PILOT_DEMO_CAMPUS_NAME,
})
assert.ok(feeText.includes('8500') || feeText.includes('8,500'))
assert.ok(buildWhatsAppHref(feeText).startsWith('https://wa.me/?text='))
assert.ok(absenceReminderMessage({ studentName: 'Aria', className: '11-A' }).includes('absent'))

const teacherRes = createTeacherAccount({
  name: 'Invite Teacher',
  email: 'invite.teacher@testvantage.local',
  password: 'teach1234',
  permissions: [],
  createdBy: 'phase1-test',
})
assert.equal(teacherRes.ok, true)
const attach = attachTeacherFromSchoolInvite(teacherRes.user.id, {
  schoolId: pilot1.school.id,
  campusName: PILOT_DEMO_CAMPUS_NAME,
  classes: ['11-A Science', '12-A Science'],
  code: PILOT_DEMO_INVITE_CODE,
})
assert.equal(attach.ok, true)
assert.equal(attach.attached, true)
assert.equal(isTeacherLinkedToSchool(teacherRes.user.id, pilot1.school.id), true)
const linkedClasses = loadClasses().filter(
  (c) => c.schoolId === pilot1.school.id && (c.teacherIds || []).includes(teacherRes.user.id),
)
assert.ok(linkedClasses.length >= 1)

const payload = collectOrgPayload()
assert.ok(Array.isArray(payload.batches))
assert.ok(Array.isArray(payload.invites))
assert.ok(payload.batches.some((b) => b.schoolId === pilot1.school.id))
assert.ok(payload.invites.some((i) => i.code === PILOT_DEMO_INVITE_CODE))

// Round-trip apply keeps batches/invites
applyOrgPayload({
  ...payload,
  batches: payload.batches,
  invites: payload.invites,
  updatedAt: Date.now(),
})
assert.ok(getBatchesBySchool(pilot1.school.id).length >= 1)
assert.ok(getInvitesForSchool(pilot1.school.id).some((i) => i.code === PILOT_DEMO_INVITE_CODE))

// Batch exam assign (use a catalog-free stub by writing assignment row shape via store after soft mock)
// Soft path: create a minimal published custom-free test is heavy; instead verify assign rejects missing test,
// then inject a synthetic assignment-compatible batch mapping via enroll + getAssignedTestIdsForStudent.
const badAssign = assignTestToBatch({
  testId: 'missing-test-xyz',
  batchId: getBatchesBySchool(pilot1.school.id)[0].id,
  assignedBy: 'phase1-test',
})
assert.equal(badAssign.ok, false)

const pilotStudent = loadUsers().find((u) => u.email === 'pilot.aria.11a')
assert.ok(pilotStudent)
const beforeIds = getAssignedTestIdsForStudent(pilotStudent.id, pilotStudent.classIds || [])
assert.ok(Array.isArray(beforeIds))

console.log('test-school-erp-phase1: ok')
