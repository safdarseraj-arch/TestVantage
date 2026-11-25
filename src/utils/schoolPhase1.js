/**
 * Phase-1 Academic Foundation readiness — mirrors PDF 7-day school onboarding Days 1–2.
 */

import { getBatchesBySchool } from './schoolBatchesStore.js'
import { getInvitesForSchool } from './schoolInvitesStore.js'

/**
 * @param {{
 *   school: object | null
 *   schoolClasses?: object[]
 *   students?: object[]
 *   batches?: object[]
 *   invites?: object[]
 * }} opts
 */
export function schoolPhase1Readiness({
  school,
  schoolClasses = [],
  students = [],
  batches,
  invites,
}) {
  if (!school) {
    return {
      readyCount: 0,
      total: 6,
      percent: 0,
      items: [],
      nextHint: 'Create a school first.',
    }
  }

  const schoolBatches = batches ?? getBatchesBySchool(school.id)
  const schoolInvites = (invites ?? getInvitesForSchool(school.id)).filter((i) => !i.revokedAt)
  const enrolled = new Set(schoolClasses.flatMap((c) => c.studentIds ?? []))
  const staffLinked = schoolClasses.some((c) => (c.teacherIds ?? []).length > 0)

  const items = [
    {
      id: 'campus',
      label: 'Campus profile set (name + academic year + board)',
      hint: 'Add year and board on the school profile',
      cta: 'Edit campus profile',
      done: Boolean(
        school.name &&
          String(school.academicYear || '').trim() &&
          String(school.boardType || '').trim(),
      ),
      tab: 'overview',
    },
    {
      id: 'classes',
      label: 'At least one class / section',
      hint: 'Create a board class like 11-A Science',
      cta: 'Add a class',
      done: schoolClasses.length > 0,
      tab: 'classes',
    },
    {
      id: 'batches',
      label: 'Competitive batch created (JEE / NEET / Olympiad)',
      hint: 'Dual-track with the board class — same students, no re-entry',
      cta: 'Create a batch',
      done: schoolBatches.length > 0,
      tab: 'batches',
    },
    {
      id: 'roster',
      label: 'Students enrolled (class roster)',
      hint: 'Add one-by-one or bulk CSV import',
      cta: 'Open Students',
      done: enrolled.size > 0,
      tab: 'students',
    },
    {
      id: 'invite',
      label: 'Teacher invite code ready to share',
      hint: 'Mint a Path A code or link a teacher to a class',
      cta: 'Invite teachers',
      done: schoolInvites.length > 0 || staffLinked,
      tab: 'staff',
    },
    {
      id: 'dual',
      label: 'At least one student mapped to a competitive batch',
      hint: 'Pick students from the class roster into a JEE/NEET batch',
      cta: 'Map to batch',
      done: schoolBatches.some((b) => (b.studentIds ?? []).length > 0),
      tab: 'batches',
    },
  ]

  const readyCount = items.filter((i) => i.done).length
  const next = items.find((i) => !i.done)
  return {
    readyCount,
    total: items.length,
    percent: Math.round((readyCount / items.length) * 100),
    items,
    nextItem: next || null,
    nextHint: next
      ? `Next: ${next.label}`
      : 'Phase-1 foundation ready — mark attendance and assign a mock exam.',
    studentCount: enrolled.size,
    batchCount: schoolBatches.length,
    inviteCount: schoolInvites.length,
  }
}

export const BOARD_TYPES = Object.freeze([
  { id: 'cbse', label: 'CBSE' },
  { id: 'icse', label: 'ICSE' },
  { id: 'state', label: 'State Board' },
  { id: 'ib', label: 'IB' },
  { id: 'igcse', label: 'IGCSE' },
  { id: 'other', label: 'Other' },
])

/** Suggest current Indian academic year label, e.g. 2026-27. */
export function defaultAcademicYearLabel(now = new Date()) {
  const y = now.getFullYear()
  const month = now.getMonth() // 0 = Jan
  // Indian AY typically starts April.
  const start = month >= 3 ? y : y - 1
  const end = String((start + 1) % 100).padStart(2, '0')
  return `${start}-${end}`
}
