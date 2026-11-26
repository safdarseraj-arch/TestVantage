/**
 * Faculty Onboarding & Workbench (PDF Part 2) — Phase 1 MVP helpers.
 * Dual pathways: school-invited vs independent B2T, Personal Vault IP, entitlement flags.
 */

export const FACULTY_ONBOARDING_MODES = Object.freeze({
  SCHOOL: 'school',
  INDEPENDENT: 'independent',
})

export const FACULTY_MODE_LABELS = Object.freeze({
  [FACULTY_ONBOARDING_MODES.SCHOOL]: 'School-invited teacher',
  [FACULTY_ONBOARDING_MODES.INDEPENDENT]: 'Independent / freelance teacher',
})

/** Exam specializations for independent (B2T) and optional school faculty. */
export const FACULTY_EXAM_SPECIALIZATIONS = Object.freeze([
  { id: 'cbse', label: 'CBSE' },
  { id: 'icse', label: 'ICSE' },
  { id: 'state-board', label: 'State Board' },
  { id: 'jee-main', label: 'JEE Main' },
  { id: 'jee-advanced', label: 'JEE Advanced' },
  { id: 'neet', label: 'NEET' },
  { id: 'olympiad', label: 'Olympiad' },
])

/**
 * Demo school invite codes (Path A). Principal/admin bulk invite comes later;
 * these codes unlock campus + default school entitlement tier.
 */
export const DEMO_SCHOOL_INVITES = Object.freeze({
  'SCHOOL-DEMO': {
    campusName: 'TestVantage Demo School',
    department: 'Science',
    classes: ['Class 11', 'Class 12'],
    systemQbTier: 'school_standard',
  },
  'CAMPUS-TV': {
    campusName: 'TestVantage Partner Campus',
    department: 'STEM',
    classes: ['Class 11', 'Class 12', 'Dropper'],
    systemQbTier: 'school_standard',
  },
})

export function normalizeSchoolInviteCode(raw) {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
}

export function lookupSchoolInvite(raw) {
  const code = normalizeSchoolInviteCode(raw)
  if (!code) return null
  const row = DEMO_SCHOOL_INVITES[code]
  if (!row) return null
  return { code, ...row }
}

/**
 * Boolean entitlement flags from the PDF §3.2 (stored on teacher profile).
 * @typedef {object} FacultyEntitlements
 * @property {boolean} can_upload_personal_qb
 * @property {boolean} can_contribute_school_qb
 * @property {boolean} can_approve_school_qb
 * @property {boolean} can_view_system_qb
 * @property {boolean} can_use_system_qb_in_cbt
 * @property {boolean} can_use_system_qb_in_lecture_plan
 * @property {boolean} can_export_system_qb_pdf
 * @property {number} monthly_ocr_quota
 */

/** @returns {FacultyEntitlements} */
export function defaultEntitlementsForMode(mode, { systemQbTier } = {}) {
  const school = mode === FACULTY_ONBOARDING_MODES.SCHOOL
  const systemOn = school || systemQbTier === 'pro_add_on'
  return {
    can_upload_personal_qb: true,
    can_contribute_school_qb: school,
    can_approve_school_qb: false,
    can_view_system_qb: systemOn,
    can_use_system_qb_in_cbt: systemOn,
    can_use_system_qb_in_lecture_plan: systemOn,
    can_export_system_qb_pdf: false,
    monthly_ocr_quota: school ? 200 : 40,
  }
}

export function normalizeEntitlements(raw, mode) {
  const base = defaultEntitlementsForMode(mode)
  if (!raw || typeof raw !== 'object') return base
  return {
    can_upload_personal_qb: raw.can_upload_personal_qb !== false,
    can_contribute_school_qb: !!raw.can_contribute_school_qb,
    can_approve_school_qb: !!raw.can_approve_school_qb,
    can_view_system_qb: !!raw.can_view_system_qb,
    can_use_system_qb_in_cbt: !!raw.can_use_system_qb_in_cbt,
    can_use_system_qb_in_lecture_plan: !!raw.can_use_system_qb_in_lecture_plan,
    can_export_system_qb_pdf: !!raw.can_export_system_qb_pdf,
    monthly_ocr_quota: Math.max(0, Number(raw.monthly_ocr_quota) || base.monthly_ocr_quota),
  }
}

export function facultyModeFromProfile(profile) {
  const mode = profile?.onboardingMode
  if (mode === FACULTY_ONBOARDING_MODES.SCHOOL) return FACULTY_ONBOARDING_MODES.SCHOOL
  if (mode === FACULTY_ONBOARDING_MODES.INDEPENDENT) return FACULTY_ONBOARDING_MODES.INDEPENDENT
  return null
}

/** Short IP ownership copy for UI. */
export function personalVaultBlurb(mode) {
  if (mode === FACULTY_ONBOARDING_MODES.SCHOOL) {
    return 'Your Personal Vault stays yours (portable IP). School Shared Bank items you submit stay with the institution after HOD approval.'
  }
  return 'Your Personal Vault is private teacher-owned IP — portable if you later join a school. No school shared bank until you accept a campus invite.'
}

export const ENTITLEMENT_LABELS = Object.freeze([
  { key: 'can_upload_personal_qb', label: 'Personal Vault upload' },
  { key: 'can_contribute_school_qb', label: 'Submit to school bank' },
  { key: 'can_approve_school_qb', label: 'Approve school bank' },
  { key: 'can_view_system_qb', label: 'Browse System QB' },
  { key: 'can_use_system_qb_in_cbt', label: 'System QB in CBT' },
  { key: 'can_use_system_qb_in_lecture_plan', label: 'System QB in lectures' },
  { key: 'can_export_system_qb_pdf', label: 'Export System QB PDF' },
])
