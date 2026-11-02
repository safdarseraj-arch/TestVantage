import assert from 'node:assert/strict'
import {
  assignApprovedAiQuestionId,
  assignClassifiedQuestionId,
  classifiedIdPrefix,
  firstMetaLetter,
  formatAiParentId,
  isClassifiedQuestionId,
  migrateAllClassifiedQuestionIds,
  nextAiChapterSerial,
  nextAiSimilarNumber,
  nextClassifiedSequence,
  remapPassageParentId,
  remapQuestionIdReferences,
} from '../src/utils/classifiedQuestionId.js'
import { similarId } from '../src/utils/questionId.js'

assert.equal(firstMetaLetter('Mathematics'), 'M')
assert.equal(firstMetaLetter('Unit 3 - Algebra'), 'A')
assert.equal(firstMetaLetter('Quadratic Equations'), 'Q')
assert.equal(classifiedIdPrefix({
  subject: 'mathematics',
  section: 'Algebra',
  chapter: 'Quadratic Equations',
}), 'MAQ')

const bank = [
  {
    id: 'MAQ00001',
    subject: 'mathematics',
    section: 'Algebra',
    chapter: 'Quadratic Equations',
    savedAt: 100,
  },
  {
    id: 'MAQ00002',
    subject: 'mathematics',
    section: 'Algebra',
    chapter: 'Quadratic Equations',
    savedAt: 200,
  },
]

const next = assignClassifiedQuestionId(
  {
    subject: 'mathematics',
    section: 'Algebra',
    chapter: 'Quadratic Equations',
    questionType: 'single_correct',
  },
  bank,
)
assert.equal(next.id, 'MAQ00003')
assert.ok(isClassifiedQuestionId(next.id))

const untagged = assignClassifiedQuestionId({ subject: 'physics', section: 'Mechanics' }, bank)
assert.match(untagged.id, /^uq-/)

const migrated = migrateAllClassifiedQuestionIds([
  { id: 'uq-old-2', subject: 'physics', section: 'Mechanics', chapter: 'Kinematics', savedAt: 200 },
  { id: 'uq-old-1', subject: 'physics', section: 'Mechanics', chapter: 'Kinematics', savedAt: 100 },
  { id: 'uq-child', subject: 'physics', section: 'Mechanics', chapter: 'Kinematics', passageId: 'uq-old-1', savedAt: 150 },
])
assert.equal(migrated[0].id, 'PMK00003')
assert.equal(migrated[1].id, 'PMK00001')
assert.equal(migrated[2].id, 'PMK00002')
assert.equal(migrated[2].passageId, 'PMK00001')

const kept = assignClassifiedQuestionId(
  { id: 'MAQ00002', subject: 'mathematics', section: 'Algebra', chapter: 'Quadratic Equations' },
  bank,
  { excludeIds: ['MAQ00002'] },
)
assert.equal(kept.id, 'MAQ00002')

const moved = assignClassifiedQuestionId(
  { id: 'MAQ00002', subject: 'physics', section: 'Mechanics', chapter: 'Kinematics' },
  bank,
  { excludeIds: ['MAQ00002'] },
)
assert.equal(moved.id, 'PMK00001')
assert.equal(nextClassifiedSequence(bank, moved), 1)

const remapped = remapPassageParentId(
  [{ id: 'a', passageId: 'old' }, { id: 'b' }],
  'old',
  'new',
)
assert.equal(remapped[0].passageId, 'new')

const pyqKept = assignClassifiedQuestionId(
  {
    id: 'MAQ00002A2024',
    subject: 'mathematics',
    section: 'Algebra',
    chapter: 'Quadratic Equations',
  },
  bank,
  { excludeIds: ['MAQ00002A2024'] },
)
assert.equal(pyqKept.id, 'MAQ00002A2024')

const similarKept = assignClassifiedQuestionId(
  {
    id: similarId('MAQ00001', 1),
    subject: 'mathematics',
    section: 'Algebra',
    chapter: 'Quadratic Equations',
    parentQuestionId: 'MAQ00001',
  },
  bank,
)
assert.equal(similarKept.id, 'MAQ00001C1')

const migrateKeepsFounder = migrateAllClassifiedQuestionIds([
  {
    id: 'MAQ00007A2024',
    subject: 'mathematics',
    section: 'Algebra',
    chapter: 'Quadratic Equations',
    savedAt: 50,
  },
  {
    id: 'uq-new',
    subject: 'mathematics',
    section: 'Algebra',
    chapter: 'Quadratic Equations',
    savedAt: 80,
  },
])
assert.equal(migrateKeepsFounder[0].id, 'MAQ00007A2024')
assert.equal(migrateKeepsFounder[1].id, 'MAQ00008')

const matrices = {
  subject: 'mathematics',
  section: 'Algebra',
  chapter: 'Matrices',
  source: 'Hybrid AI',
  bankSource: 'ai_hybrid',
  sub_bank_type: 'ai',
}

assert.equal(firstMetaLetter('123'), 'X')
assert.equal(firstMetaLetter(''), 'X')
assert.equal(classifiedIdPrefix({ subject: 'mathematics', section: '123', chapter: 'Matrices' }), 'MXM')
assert.equal(formatAiParentId('MAM', 1), 'MAM00001I')

const approved = assignApprovedAiQuestionId(
  { ...matrices, id: 'TV-AI-MATH-abc', hybridSyncedFromPostgres: true },
  [],
)
assert.equal(approved.id, 'MAM00001I')
assert.equal(approved.aiTempId, 'TV-AI-MATH-abc')

const secondAi = assignApprovedAiQuestionId(
  { ...matrices, id: 'TV-AI-MATH-def' },
  [approved],
)
assert.equal(secondAi.id, 'MAM00002I')

const family = [
  approved,
  { id: 'MAM00001IC1', ...matrices, sub_bank_type: 'similar_pyq', parentQuestionId: 'MAM00001I' },
  { id: 'MAM00001IC2', ...matrices, sub_bank_type: 'similar_pyq', parentQuestionId: 'MAM00001I' },
]
assert.equal(nextAiChapterSerial(family, matrices), 2)
const afterChildren = assignApprovedAiQuestionId({ ...matrices, id: 'TV-AI-MATH-ghi' }, family)
assert.equal(afterChildren.id, 'MAM00002I')

const onlyChildren = [
  { id: 'MAM00001IC1', ...matrices },
  { id: 'MAM00001IC2', ...matrices },
]
assert.equal(nextAiChapterSerial(onlyChildren, matrices), 2)

const pyqUntouched = assignApprovedAiQuestionId(
  {
    id: 'MAQ00002A2024',
    officialPyq: true,
    sub_bank_type: 'pyq',
    bankSource: 'official_pyq',
    subject: 'mathematics',
    section: 'Algebra',
    chapter: 'Quadratic Equations',
  },
  [],
)
assert.equal(pyqUntouched.id, 'MAQ00002A2024')

const draftKept = assignClassifiedQuestionId(
  { ...matrices, id: 'TV-AI-MATH-abc', hybridSyncedFromPostgres: true },
  [],
)
assert.equal(draftKept.id, 'TV-AI-MATH-abc')

const aiIdKept = assignClassifiedQuestionId({ ...matrices, id: 'MAM00001I' }, [approved])
assert.equal(aiIdKept.id, 'MAM00001I')

const similarApproved = assignApprovedAiQuestionId(
  {
    id: 'TV-AI-MATH-abcC1',
    parentQuestionId: 'TV-AI-MATH-abc',
    similarToId: 'TV-AI-MATH-abc',
    sub_bank_type: 'similar_pyq',
    similarToPyq: true,
    bankSource: 'ai_similar_pyq',
    subject: 'mathematics',
    section: 'Algebra',
    chapter: 'Matrices',
  },
  [approved],
)
assert.equal(similarApproved.id, 'MAM00001IC1')
assert.equal(similarApproved.parentQuestionId, 'MAM00001I')

const similarNext = assignApprovedAiQuestionId(
  {
    id: 'uq-similar-temp',
    parentQuestionId: 'MAM00001I',
    sub_bank_type: 'similar_pyq',
    subject: 'mathematics',
    section: 'Algebra',
    chapter: 'Matrices',
  },
  [approved, { id: 'MAM00001IC1' }],
)
assert.equal(similarNext.id, 'MAM00001IC2')
assert.equal(nextAiSimilarNumber('MAM00001I', ['MAM00001IC1', 'MAM00001IC2']), 3)

const childBeforeParent = assignApprovedAiQuestionId(
  {
    id: 'TV-AI-MATH-waitC1',
    parentQuestionId: 'TV-AI-MATH-wait',
    sub_bank_type: 'similar_pyq',
    subject: 'mathematics',
    section: 'Algebra',
    chapter: 'Matrices',
  },
  [{ ...matrices, id: 'TV-AI-MATH-wait' }],
)
assert.equal(childBeforeParent.id, 'TV-AI-MATH-waitC1')

const remappedFamily = remapQuestionIdReferences(
  [
    { id: 'TV-AI-MATH-abcC1', parentQuestionId: 'TV-AI-MATH-abc', similarToId: 'TV-AI-MATH-abc' },
    { id: 'plain', passageId: 'TV-AI-MATH-abc' },
  ],
  'TV-AI-MATH-abc',
  'MAM00001I',
)
assert.equal(remappedFamily[0].id, 'MAM00001IC1')
assert.equal(remappedFamily[0].parentQuestionId, 'MAM00001I')
assert.equal(remappedFamily[0].similarToId, 'MAM00001I')
assert.equal(remappedFamily[1].passageId, 'MAM00001I')

const migratedAi = migrateAllClassifiedQuestionIds([
  {
    id: 'MAM00001I',
    subject: 'mathematics',
    section: 'Algebra',
    chapter: 'Matrices',
    savedAt: 1,
    source: 'Hybrid AI',
    sub_bank_type: 'ai',
  },
  {
    id: 'TV-AI-MATH-abc',
    subject: 'mathematics',
    section: 'Algebra',
    chapter: 'Matrices',
    savedAt: 2,
    source: 'Hybrid AI',
    sub_bank_type: 'ai',
    hybridSyncedFromPostgres: true,
  },
  {
    id: 'uq-plain',
    subject: 'mathematics',
    section: 'Algebra',
    chapter: 'Matrices',
    savedAt: 3,
  },
])
assert.equal(migratedAi[0].id, 'MAM00001I')
assert.equal(migratedAi[1].id, 'TV-AI-MATH-abc')
assert.equal(migratedAi[2].id, 'MAM00001')

console.log('test-classified-question-id: ok')
