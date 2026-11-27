/**
 * Idempotent Pilot Demo Campus seed — classes, roster, competitive batch, staff invite.
 * Safe to call from ensureDemoAccounts / school pages.
 */

import { addClass, enrollStudentInClass, getClassesBySchool, loadClasses } from './classesStore.js'
import { addBatch, enrollStudentInBatch, getBatchesBySchool, loadBatches } from './schoolBatchesStore.js'
import { createSchoolInvite, getInvitesForSchool } from './schoolInvitesStore.js'
import { attachTeacherFromSchoolInvite } from './schoolTeacherAttach.js'
import { addSchool, loadSchools, updateSchool } from './schoolsStore.js'
import { createStudentAccount, getUserById, loadUsers } from './users.js'

export const PILOT_DEMO_CAMPUS_NAME = 'Pilot Demo Campus'
export const PILOT_DEMO_SCHOOL_ID = 'school-pilot-demo-campus'
export const PILOT_DEMO_INVITE_CODE = 'TV-PILOT-DEMO'

const CLASS_DEFS = [
  { id: 'class-pilot-11a', name: '11-A Science', grade: '11', section: 'A' },
  { id: 'class-pilot-12a', name: '12-A Science', grade: '12', section: 'A' },
]

const STUDENT_DEFS = [
  { loginId: 'pilot.aria.11a', name: 'Aria Sharma', classKey: 0, password: 'pilot123' },
  { loginId: 'pilot.kabir.11a', name: 'Kabir Mehta', classKey: 0, password: 'pilot123' },
  { loginId: 'pilot.neha.12a', name: 'Neha Iyer', classKey: 1, password: 'pilot123' },
  { loginId: 'pilot.rohan.12a', name: 'Rohan Das', classKey: 1, password: 'pilot123' },
]

const BATCH_DEF = {
  id: 'batch-pilot-jee-1',
  name: 'JEE Integrated Batch 1',
  trackType: 'jee',
}

/** Rewrite a row id in localStorage JSON bag without changing other fields. */
function rewriteStoredId(storageKey, listKey, fromId, toId) {
  if (!fromId || !toId || fromId === toId) return toId
  try {
    const raw = localStorage.getItem(storageKey)
    const data = raw ? JSON.parse(raw) : {}
    const list = Array.isArray(data[listKey]) ? data[listKey] : []
    if (list.some((row) => row.id === toId)) return toId
    const idx = list.findIndex((row) => row.id === fromId)
    if (idx < 0) return fromId
    list[idx] = { ...list[idx], id: toId }
    localStorage.setItem(storageKey, JSON.stringify({ ...data, [listKey]: list }))
    return toId
  } catch {
    return fromId
  }
}

/**
 * Ensure Pilot Demo Campus exists with sample academic data.
 * @returns {{ ok: boolean, school: object | null, created: boolean, details: object }}
 */
export function ensurePilotDemoCampus() {
  const schools = loadSchools()
  let school = schools.find((s) => s.id === PILOT_DEMO_SCHOOL_ID)
  let created = false

  if (!school) {
    school = schools.find((s) => s.name.toLowerCase() === PILOT_DEMO_CAMPUS_NAME.toLowerCase())
  }

  if (!school) {
    const res = addSchool({
      name: PILOT_DEMO_CAMPUS_NAME,
      code: 'PILOT',
      academicYear: '2026-27',
      boardType: 'cbse',
      address: 'Demo campus — local practice only',
      affiliationNo: 'DEMO-PILOT-001',
    })
    if (!res.ok || !res.school) {
      return { ok: false, school: null, created: false, details: { error: res.error } }
    }
    const stableId = rewriteStoredId(
      'testvantage-schools',
      'schools',
      res.school.id,
      PILOT_DEMO_SCHOOL_ID,
    )
    school = loadSchools().find((s) => s.id === stableId) || {
      ...res.school,
      id: stableId,
    }
    created = true
  } else if (!school.academicYear || !school.boardType || !school.affiliationNo) {
    updateSchool(school.id, {
      academicYear: school.academicYear || '2026-27',
      boardType: school.boardType || 'cbse',
      affiliationNo: school.affiliationNo || 'DEMO-PILOT-001',
    })
    school = loadSchools().find((s) => s.id === school.id) || school
  }

  const schoolId = school.id
  const classIds = []

  for (const def of CLASS_DEFS) {
    const existing = getClassesBySchool(schoolId).find(
      (c) => c.id === def.id || c.name.toLowerCase() === def.name.toLowerCase(),
    )
    if (existing) {
      classIds.push(existing.id)
      continue
    }
    const res = addClass({
      schoolId,
      name: def.name,
      grade: def.grade,
      section: def.section,
    })
    if (res.ok && res.class) {
      const id = rewriteStoredId('testvantage-classes', 'classes', res.class.id, def.id)
      classIds.push(id)
      created = true
    }
  }

  const enrolledStudentIds = []
  for (const def of STUDENT_DEFS) {
    const users = loadUsers()
    let user = users.find((u) => String(u.email).toLowerCase() === def.loginId)
    if (!user) {
      const res = createStudentAccount({
        name: def.name,
        loginId: def.loginId,
        password: def.password,
        createdBy: 'pilot-demo-seed',
      })
      if (res.ok) {
        user = res.user
        created = true
      }
    }
    if (!user) continue
    const classId = classIds[def.classKey]
    if (!classId) continue
    const cls = loadClasses().find((c) => c.id === classId)
    if (cls && !(cls.studentIds || []).includes(user.id)) {
      enrollStudentInClass(classId, user.id)
      created = true
    }
    enrolledStudentIds.push(user.id)
  }

  let batch = getBatchesBySchool(schoolId).find(
    (b) => b.id === BATCH_DEF.id || b.name.toLowerCase() === BATCH_DEF.name.toLowerCase(),
  )
  if (!batch) {
    const res = addBatch({
      schoolId,
      name: BATCH_DEF.name,
      trackType: BATCH_DEF.trackType,
    })
    if (res.ok && res.batch) {
      const id = rewriteStoredId(
        'testvantage-school-batches',
        'batches',
        res.batch.id,
        BATCH_DEF.id,
      )
      batch = loadBatches().find((b) => b.id === id) || { ...res.batch, id }
      created = true
    }
  }

  if (batch) {
    for (const sid of enrolledStudentIds.slice(0, 3)) {
      if (!(batch.studentIds || []).includes(sid)) {
        enrollStudentInBatch(batch.id, sid)
        batch = getBatchesBySchool(schoolId).find((b) => b.id === batch.id) || batch
        created = true
      }
    }
  }

  const invites = getInvitesForSchool(schoolId).filter((i) => !i.revokedAt)
  let invite = invites.find((i) => i.code === PILOT_DEMO_INVITE_CODE)
  if (!invite) {
    const classNames = getClassesBySchool(schoolId).map((c) => c.name)
    const res = createSchoolInvite({
      schoolId,
      campusName: PILOT_DEMO_CAMPUS_NAME,
      department: 'Science',
      classes: classNames.length ? classNames : ['11-A Science', '12-A Science'],
      preferredCode: PILOT_DEMO_INVITE_CODE,
      createdBy: 'pilot-demo-seed',
    })
    if (res.ok) {
      invite = res.invite
      created = true
    }
  }

  const schoolManagers = [
    getUserById('demo-school'),
    getUserById('demo-staff'),
    loadUsers().find((u) => String(u.email).toLowerCase() === 'school@testvantage.com'),
    loadUsers().find((u) => String(u.email).toLowerCase() === 'staff@testvantage.com'),
  ].filter((u, i, arr) => u?.role === 'teacher' && arr.findIndex((x) => x?.id === u.id) === i)

  for (const staff of schoolManagers) {
    const attach = attachTeacherFromSchoolInvite(staff.id, {
      schoolId,
      campusName: PILOT_DEMO_CAMPUS_NAME,
      classes: getClassesBySchool(schoolId).map((c) => c.name),
      code: invite?.code || PILOT_DEMO_INVITE_CODE,
    })
    if (attach.attached) created = true
  }

  return {
    ok: true,
    school: loadSchools().find((s) => s.id === schoolId) || school,
    created,
    details: {
      classCount: getClassesBySchool(schoolId).length,
      batchCount: getBatchesBySchool(schoolId).length,
      inviteCode: invite?.code || PILOT_DEMO_INVITE_CODE,
      studentCount: new Set(
        getClassesBySchool(schoolId).flatMap((c) => c.studentIds || []),
      ).size,
    },
  }
}
