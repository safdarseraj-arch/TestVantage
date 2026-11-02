import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempRoot = mkdtempSync(join(tmpdir(), 'tv-org-'))
process.env.TESTVANTAGE_BANK_DATA_DIR = join(tempRoot, 'data')

const { saveOrgFile, loadOrgFile } = await import('../server/orgFileStore.js')

const school = { id: 'school-1', name: 'Demo School', createdAt: Date.now() }
const saved = saveOrgFile({
  schools: [school],
  classes: [{ id: 'class-1', schoolId: 'school-1', name: '10A', teacherIds: [], studentIds: [] }],
  assignments: [],
  users: [],
})

assert.equal(saved.schools.length, 1)
assert.equal(saved.classes.length, 1)
assert.ok(saved.updatedAt > 0)

const loaded = loadOrgFile()
assert.equal(loaded.schools[0].name, 'Demo School')

rmSync(tempRoot, { recursive: true, force: true })
console.log('test-org-api-store: ok')
