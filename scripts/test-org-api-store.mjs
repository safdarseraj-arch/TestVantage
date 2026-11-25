import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempRoot = mkdtempSync(join(tmpdir(), 'tv-org-'))
process.env.TESTVANTAGE_BANK_DATA_DIR = join(tempRoot, 'data')

const { saveOrgFile, loadOrgFile } = await import('../server/orgFileStore.js')

const school = { id: 'school-1', name: 'Demo School', createdAt: Date.now() }
const batch = {
  id: 'batch-1',
  schoolId: 'school-1',
  name: 'JEE Batch',
  trackType: 'jee',
  teacherIds: [],
  studentIds: [],
  createdAt: Date.now(),
}
const invite = {
  code: 'TV-ORG-TEST',
  schoolId: 'school-1',
  campusName: 'Demo School',
  department: 'Science',
  classes: ['11-A'],
  systemQbTier: 'school_standard',
  createdAt: Date.now(),
  revokedAt: null,
}
const saved = saveOrgFile({
  schools: [school],
  classes: [{ id: 'class-1', schoolId: 'school-1', name: '10A', teacherIds: [], studentIds: [] }],
  assignments: [],
  users: [],
  batches: [batch],
  invites: [invite],
})

assert.equal(saved.schools.length, 1)
assert.equal(saved.classes.length, 1)
assert.equal(saved.batches.length, 1)
assert.equal(saved.invites.length, 1)
assert.ok(saved.updatedAt > 0)

const loaded = loadOrgFile()
assert.equal(loaded.schools[0].name, 'Demo School')
assert.equal(loaded.batches[0].name, 'JEE Batch')
assert.equal(loaded.invites[0].code, 'TV-ORG-TEST')

rmSync(tempRoot, { recursive: true, force: true })
console.log('test-org-api-store: ok')
