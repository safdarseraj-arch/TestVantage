import assert from 'node:assert/strict'
import {
  PERMS,
  DEFAULT_TEACHER_PERMS,
  sessionHasPermission,
} from '../src/utils/permissions.js'
import {
  canAccessMainQuestionBank,
  filterQuestionsForTeacherScope,
  filterQuestionsForCreatePaper,
  isInTeacherPrivateBank,
  questionOwnedByTeacher,
  isSilentPublished,
} from '../src/utils/teacherQuestionBank.js'
import { questionBankUploadUrl, teacherUploadLinks } from '../src/utils/questionBankUploadRoutes.js'
import {
  buildLecturePlanLocal,
  suggestedQuestionCount,
  lecturePlannerAiBadge,
  lectureFitScore,
} from '../src/utils/lecturePlannerAi.js'

assert.ok(PERMS.ACCESS_MAIN_QUESTION_BANK)
assert.ok(!DEFAULT_TEACHER_PERMS.includes(PERMS.ACCESS_MAIN_QUESTION_BANK))
assert.ok(!DEFAULT_TEACHER_PERMS.includes(PERMS.PUBLISH_QUESTIONS))

const teacherSession = {
  role: 'teacher',
  userId: 't1',
  permissions: [...DEFAULT_TEACHER_PERMS],
}
assert.equal(canAccessMainQuestionBank(teacherSession), false)
assert.equal(
  sessionHasPermission(
    { ...teacherSession, permissions: [...DEFAULT_TEACHER_PERMS, PERMS.ACCESS_MAIN_QUESTION_BANK] },
    PERMS.ACCESS_MAIN_QUESTION_BANK,
  ),
  true,
)

const mine = {
  id: 'Q1',
  text: 'Mine',
  uploadedById: 't1',
  bankStatus: 'published',
  silentPublish: true,
  subject: 'mathematics',
  chapter: 'Limits',
  topic: 'Basics',
  toughnessLevel: 3,
  questionType: 'single_correct',
}
const other = {
  id: 'Q2',
  text: 'Other',
  uploadedById: 't2',
  bankStatus: 'published',
  subject: 'mathematics',
  chapter: 'Limits',
}
const removed = {
  id: 'Q3',
  text: 'Removed',
  uploadedById: 't1',
  bankStatus: 'published',
  silentPublish: true,
  removedFromTeacherBank: true,
}

assert.equal(questionOwnedByTeacher(mine, 't1'), true)
assert.equal(isInTeacherPrivateBank(mine, 't1'), true)
assert.equal(isInTeacherPrivateBank(removed, 't1'), false)
assert.equal(isSilentPublished(mine), true)

const scoped = filterQuestionsForTeacherScope([mine, other, removed], {
  session: teacherSession,
  forceMine: true,
})
assert.equal(scoped.length, 1)
assert.equal(scoped[0].id, 'Q1')

const paperPool = filterQuestionsForCreatePaper([mine, other, removed], {
  session: teacherSession,
  scope: 'mine',
})
assert.equal(paperPool.length, 1)

const url = questionBankUploadUrl({ tab: 'bulk', owner: 'teacher', source: 'Lecture' })
assert.ok(url.startsWith('/question-bank?'))
assert.ok(url.includes('hub=upload'))
assert.ok(url.includes('tab=bulk'))
assert.ok(url.includes('owner=teacher'))

const links = teacherUploadLinks({ source: 'Lecture', from: 'teacher' })
assert.ok(links.root.includes('hub=upload'))
assert.ok(links.image.includes('tab=single'))

assert.equal(suggestedQuestionCount(45), 8)
assert.equal(lecturePlannerAiBadge('cloud-vision'), 'AI')
assert.equal(lecturePlannerAiBadge('local'), 'AI')

const plan = buildLecturePlanLocal({
  pool: [mine, other, { ...mine, id: 'Q4', toughnessLevel: 8, text: 'Harder limit' }],
  subject: 'mathematics',
  chapter: 'Limits',
  topic: 'Basics',
  durationMinutes: 45,
})
assert.ok(plan.shortDescription)
assert.ok(plan.detailedNotes.includes('##'))
assert.ok(plan.teachingOrder.length >= 1)
assert.ok(plan.questionIds.includes('Q1'))
assert.ok(lectureFitScore(mine, { subject: 'mathematics', chapter: 'Limits' }) > 50)

console.log('test-teacher-lecture-planner: ok')
