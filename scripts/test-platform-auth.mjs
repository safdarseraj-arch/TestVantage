import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempRoot = mkdtempSync(join(tmpdir(), 'tv-auth-'))
process.env.TESTVANTAGE_BANK_DATA_DIR = join(tempRoot, 'data')
process.env.TESTVANTAGE_ADMIN_EMAIL = 'admin@testvantage.com'
process.env.TESTVANTAGE_ADMIN_PASSWORD = 'secret-pass'
process.env.TESTVANTAGE_ADMIN_NAME = 'Live Admin'

const { saveOrgFile } = await import('../server/orgFileStore.js')
const { setOrgDataBackend } = await import('../server/stores/orgData.js')
const { authenticateLogin } = await import('../server/auth.js')

setOrgDataBackend('file')

saveOrgFile({
  schools: [],
  classes: [],
  assignments: [],
  users: [
    {
      id: 'user-1',
      name: 'Riya',
      email: 'riya@school.com',
      password: 'pass123',
      role: 'user',
      createdAt: Date.now(),
    },
    {
      id: 'teacher-1',
      name: 'Mr Rao',
      email: 'rao@school.com',
      password: 'teach123',
      role: 'teacher',
      permissions: ['VIEW_STUDENT_RESULTS'],
      createdAt: Date.now(),
    },
  ],
})

const admin = await authenticateLogin('admin@testvantage.com', 'secret-pass', 'admin')
assert.equal(admin.ok, true)
assert.equal(admin.session.role, 'admin')

const student = await authenticateLogin('riya@school.com', 'pass123', 'any')
assert.equal(student.ok, true)
assert.equal(student.session.role, 'user')

const teacher = await authenticateLogin('rao@school.com', 'teach123', 'any')
assert.equal(teacher.ok, true)
assert.equal(teacher.session.role, 'teacher')

const bad = await authenticateLogin('riya@school.com', 'wrong', 'any')
assert.equal(bad.ok, false)

rmSync(tempRoot, { recursive: true, force: true })
console.log('test-platform-auth: ok')
