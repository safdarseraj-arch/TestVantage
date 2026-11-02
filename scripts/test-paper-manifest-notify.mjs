import assert from 'node:assert/strict'
import { buildPaperManifestData, stripStemForManifest } from '../src/utils/paperManifest.js'
import {
  buildAssignmentEmailDraft,
  getUnreadCountForUser } from '../src/utils/studentNotifications.js'

const sampleTest = {
  id: 'custom-test-1',
  title: 'Physics Unit 1',
  examPatternId: 'jee-main',
  durationMinutes: 60,
  totalQuestions: 2,
  qualityScore: 88,
  publishVersion: 1,
  publishedAt: Date.now(),
  paperBlueprint: [{ questionTypeId: 'single_correct', count: 2, marking: { correct: 4, wrong: -1, unattempted: 0 } }],
  questions: [
    {
      id: 'q1',
      questionType: 'single_correct',
      subject: 'physics',
      text: 'What is $F=ma$?',
      options: ['1', '2', '3', '4'],
      correctIndex: 0,
      toughnessLevel: 5 },
    {
      id: 'q2',
      questionType: 'integer',
      subject: 'physics',
      text: 'Value is 42',
      correctInteger: 42,
      toughnessLevel: 7 },
  ] }

const data = buildPaperManifestData(sampleTest)
assert.ok(data, 'manifest data')
assert.equal(data.questions.length, 2, 'two answerable')
assert.ok(data.qualityScore >= 0)

assert.ok(stripStemForManifest('What is $x^2$?').includes('What is'))

const draft = buildAssignmentEmailDraft({
  test: sampleTest,
  schoolClass: { name: 'Class 10A' },
  assignment: { notes: 'Good luck' },
  studentEmails: ['student1@test', 'student2@test'] })
assert.match(draft.body, /Physics Unit 1/)
assert.ok(draft.mailto.startsWith('mailto:'), 'mailto link')

assert.equal(getUnreadCountForUser('nobody-here'), 0)

console.log('test-paper-manifest-notify: ok')
