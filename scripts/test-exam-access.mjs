import assert from 'node:assert/strict'
import { getExamAccess } from '../src/utils/examAccess.js'

const published = {
  id: 'custom-abc',
  title: 'Test',
  status: 'published',
  questions: [{ id: 'q1', text: 'Hi', questionType: 'integer', correctInteger: 1 }],
}

const draft = { ...published, status: 'draft' }

assert.equal(
  getExamAccess('custom-abc', published, {
    session: { role: 'user' },
    studentClassIds: ['c1'],
    assignedTestIds: [],
  }).reason,
  'not_assigned',
  'student in class blocked without assignment',
)

assert.equal(
  getExamAccess('custom-abc', published, {
    session: { role: 'user' },
    studentClassIds: ['c1'],
    assignedTestIds: [],
  }).allowed,
  false,
)

assert.equal(
  getExamAccess('custom-abc', draft, { canManagePapers: true }).reason,
  'draft_preview',
)

assert.equal(
  getExamAccess('custom-abc', draft, { session: { role: 'user' } }).allowed,
  false,
)

assert.equal(getExamAccess('jee-main-demo', { id: 'jee-main-demo' }, {}).allowed, true, 'builtin open')

assert.equal(
  getExamAccess('uploaded-custom', { id: 'uploaded-custom' }, { session: { role: 'user' } }).allowed,
  false,
  'students cannot start staff working pool',
)

assert.equal(
  getExamAccess(
    'custom-abc',
    published,
    {
      session: { role: 'user', isDemo: true, email: 'student@testvantage.com' },
      studentClassIds: ['c1'],
      assignedTestIds: [],
    },
  ).allowed,
  true,
  'demo student may open published mocks without class assignment',
)

assert.equal(
  getExamAccess('jee-main-full-demo', { id: 'jee-main-full-demo' }, {
    session: { role: 'user', isDemo: true },
  }).allowed,
  true,
  'demo student can start sample mock',
)

console.log('test-exam-access: ok')
