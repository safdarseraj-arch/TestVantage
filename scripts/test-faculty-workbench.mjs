/**
 * Faculty workbench helpers — entitlements → permissions, invites, branding.
 */
import assert from 'node:assert/strict'
import {
  FACULTY_ONBOARDING_MODES,
  defaultEntitlementsForMode,
  defaultWatermarkForName,
  lookupSchoolInvite,
  normalizeSchoolInviteCode,
  permissionsFromEntitlements,
  summarizeEntitlements,
} from '../src/utils/facultyWorkbench.js'
import { PERMS } from '../src/utils/permissions.js'

assert.equal(normalizeSchoolInviteCode(' school-demo '), 'SCHOOL-DEMO')
assert.equal(lookupSchoolInvite('campus-tv')?.campusName, 'Pilot Demo Campus')
assert.equal(lookupSchoolInvite('NOPE'), null)

const indep = defaultEntitlementsForMode(FACULTY_ONBOARDING_MODES.INDEPENDENT)
assert.equal(indep.can_contribute_school_qb, false)
assert.equal(indep.can_view_system_qb, false)

const school = defaultEntitlementsForMode(FACULTY_ONBOARDING_MODES.SCHOOL, {
  systemQbTier: 'school_standard',
})
assert.equal(school.can_contribute_school_qb, true)
assert.equal(school.can_view_system_qb, true)

const indepPerms = permissionsFromEntitlements(indep)
assert.ok(indepPerms.includes(PERMS.UPLOAD_QUESTIONS))
assert.ok(!indepPerms.includes(PERMS.ACCESS_MAIN_QUESTION_BANK))

const schoolPerms = permissionsFromEntitlements(school)
assert.ok(schoolPerms.includes(PERMS.ACCESS_MAIN_QUESTION_BANK))
assert.ok(schoolPerms.includes(PERMS.ASSIGN_TESTS))

assert.equal(defaultWatermarkForName('Anita Sharma'), 'Anita · confidential')
const summary = summarizeEntitlements(school)
assert.ok(summary.onLabels.includes('Browse System QB'))
assert.equal(summary.ocrQuota, 200)

console.log('test-faculty-workbench: ok')
