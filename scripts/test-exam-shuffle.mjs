import assert from 'node:assert/strict'
import {
  buildExamShuffleLayout,
  buildOptionPermutation,
  hashStringToSeed,
  questionOptionsAreShuffleable,
  shouldShuffleExamForTest } from '../src/utils/examShuffle.js'

const q = (id, extra = {}) => ({
  id,
  subject: 'physics',
  questionType: 'single_correct',
  text: `Q ${id}`,
  options: ['$1$', '$2$', '$3$', '$4$'],
  correctIndex: 0,
  ...extra })

const pool = [q('a'), q('b'), q('c'), q('d')]

const layoutA = buildExamShuffleLayout({
  testId: 't1',
  ownerKey: 'student-a',
  questions: pool })
const layoutB = buildExamShuffleLayout({
  testId: 't1',
  ownerKey: 'student-b',
  questions: pool })

assert.notDeepEqual(layoutA.questionIds, layoutB.questionIds, 'different students get different order')
assert.deepEqual(
  buildExamShuffleLayout({ testId: 't1', ownerKey: 'student-a', questions: pool }).questionIds,
  layoutA.questionIds,
  'same student gets stable order',
)

const scq = q('scq1')
assert.ok(questionOptionsAreShuffleable(scq))
const perm = buildOptionPermutation(4, hashStringToSeed('x'))
assert.equal(perm.length, 4)
assert.deepEqual([...perm].sort(), [0, 1, 2, 3])

const layoutSection = buildExamShuffleLayout({
  testId: 't2',
  ownerKey: 's1',
  questions: [
    q('p1', { subject: 'physics' }),
    q('p2', { subject: 'physics' }),
    q('c1', { subject: 'chemistry' }),
    q('c2', { subject: 'chemistry' }),
  ],
  sectionMode: true,
  sectionOrder: ['physics', 'chemistry'] })
const physIdx = layoutSection.questionIds.filter((id) => id.startsWith('p'))
const chemIdx = layoutSection.questionIds.filter((id) => id.startsWith('c'))
assert.equal(physIdx.length, 2)
assert.equal(chemIdx.length, 2)
assert.ok(
  layoutSection.questionIds.indexOf(physIdx[0]) < layoutSection.questionIds.indexOf(chemIdx[0]),
  'sections stay in NTA order',
)

const passageSubs = [
  q('sub1', { passageId: 'pass1' }),
  q('sub2', { passageId: 'pass1' }),
  q('solo', {}),
]
const passageLayout = buildExamShuffleLayout({
  testId: 't3',
  ownerKey: 's1',
  questions: passageSubs })
const i1 = passageLayout.questionIds.indexOf('sub1')
const i2 = passageLayout.questionIds.indexOf('sub2')
assert.ok(Math.abs(i1 - i2) === 1, 'passage sub-questions stay adjacent')

assert.equal(shouldShuffleExamForTest({ testTypeId: 'chapter' }), true)
assert.equal(shouldShuffleExamForTest({ testTypeId: 'chapter', antiCheatShuffle: false }), false)
assert.equal(shouldShuffleExamForTest({ testTypeId: 'practice' }), false)

console.log('test-exam-shuffle: ok')
