import assert from 'node:assert/strict'
import {
  compareBankQuestions,
  filterBankQuestions,
  bankListFiltersForViewTab,
  clearedBankListFilters,
  patchBankListFilters,
  sortAndFilterBankQuestions,
  isQuestionMetaUntagged,
  isQuestionMetaClassified,
  buildBankListGroups,
  BANK_UNTAGGED_FILTER,
  isBankCurriculumSubject,
  questionSourceKind,
  questionMatchesExamFilter,
} from '../src/utils/bankListFilters.js'
import { buildReviewQueue, reviewDatesAfterUrlParam } from '../src/utils/bankReviewFilters.js'

const qs = [
  {
    id: 'b',
    subject: 'physics',
    section: 'Mechanics',
    chapter: 'Kinematics',
    topic: '1D motion',
    questionType: 'integer',
    examIds: ['jee-main'],
    toughnessLevel: 5,
    savedAt: 100,
  },
  {
    id: 'a',
    subject: 'mathematics',
    section: 'Algebra',
    chapter: 'Quadratic',
    topic: 'Roots',
    questionType: 'single_correct',
    examIds: ['jee-main'],
    toughnessLevel: 3,
    savedAt: 200,
  },
  {
    id: 'c',
    subject: 'physics',
    section: 'Mechanics',
    chapter: 'Kinematics',
    topic: '2D motion',
    questionType: 'numerical',
    examIds: ['jee-main'],
    toughnessLevel: 7,
    savedAt: 50,
  },
]

const sorted = sortAndFilterBankQuestions(qs, {})
assert.equal(sorted[0].subject, 'mathematics')
assert.equal(sorted[1].topic, '1D motion')
assert.equal(sorted[2].topic, '2D motion')

const physOnly = filterBankQuestions(qs, { subject: 'physics' })
assert.equal(physOnly.length, 2)

const cascaded = patchBankListFilters(
  { subject: 'physics', section: 'Mechanics', chapter: 'Kinematics', topic: 'x' },
  { subject: 'mathematics' },
)
assert.equal(cascaded.section, '')
assert.equal(cascaded.chapter, '')
assert.equal(cascaded.topic, '')

assert.ok(compareBankQuestions(qs[0], qs[1]) > 0, 'physics after mathematics')

const untaggedQ = {
  id: 'u1',
  subject: 'physics',
  questionType: 'single_correct',
  examIds: ['jee-main'],
  savedAt: 1,
}
assert.ok(isQuestionMetaUntagged(untaggedQ), 'missing unit/chapter')
assert.ok(
  isQuestionMetaClassified({
    id: 'ok',
    subject: 'physics',
    section: 'Mechanics',
    chapter: 'Kinematics',
    questionType: 'integer',
  }),
  'topic and exams optional',
)
assert.ok(
  isQuestionMetaClassified({
    id: 'inferred-type',
    subject: 'physics',
    section: 'Mechanics',
    chapter: 'Kinematics',
    options: ['1', '2', '3', '4'],
    correctIndex: 0,
  }),
  'missing questionType inferred from MCQ shape',
)

assert.ok(
  isQuestionMetaClassified({
    id: 'legacy-hierarchy',
    subject: 'physics',
    chapter: 'Mechanics',
    topic: 'Kinematics',
    questionType: 'single_correct',
  }),
  'legacy unit/chapter in chapter+topic fields',
)

assert.ok(
  isQuestionMetaClassified({
    id: 'chapter-only',
    subject: 'physics',
    chapter: 'Kinematics',
    options: ['1', '2', '3', '4'],
    correctIndex: 0,
  }),
  'chapter without unit still classified',
)

assert.ok(
  isQuestionMetaUntagged({
    id: 'bare',
    subject: 'physics',
  }),
  'subject only is untagged',
)

const groups = buildBankListGroups([...qs, untaggedQ], {})
assert.equal(groups[0].id, BANK_UNTAGGED_FILTER)
assert.equal(groups[0].title, 'Untagged')
assert.equal(groups[0].questions.length, 1)

const untaggedOnly = filterBankQuestions([...qs, untaggedQ], { subject: BANK_UNTAGGED_FILTER })
assert.equal(untaggedOnly.length, 1)

assert.equal(isBankCurriculumSubject('physics'), true)
assert.equal(isBankCurriculumSubject(BANK_UNTAGGED_FILTER), false)
assert.equal(isBankCurriculumSubject(''), false)

const untaggedPatch = patchBankListFilters(
  { subject: 'physics', section: 'Mechanics', chapter: 'Kinematics', topic: 'x' },
  { subject: BANK_UNTAGGED_FILTER },
)
assert.equal(untaggedPatch.section, '')
assert.equal(untaggedPatch.chapter, '')
assert.equal(untaggedPatch.topic, '')

const { toughnessQuotaForCount, toughnessBandFromLevel } = await import(
  '../src/utils/bankToughnessMix.js'
)

const withGemini = {
  ...qs[0],
  source: 'Gemini trial',
  examIds: ['jee-main'],
  toughnessLevel: 2,
}
const withPyqStyle = {
  id: 'pyq-ai',
  subject: 'physics',
  section: 'Mechanics',
  chapter: 'Kinematics',
  topic: '1D motion',
  questionType: 'single_correct',
  examIds: ['neet'],
  source: 'PYQ-style (AI)',
  bankSource: 'pyq_style_ai',
  pyqStyle: true,
  pyqYear: 2023,
  toughnessLevel: 5,
  savedAt: 9,
}
const withOfficial = {
  id: 'pyq-off',
  subject: 'physics',
  section: 'Mechanics',
  chapter: 'Kinematics',
  questionType: 'single_correct',
  examIds: ['jee-advanced'],
  bankSource: 'official_pyq',
  imported: true,
  pyqYear: 2024,
  toughnessLevel: 4,
  savedAt: 8,
}

assert.equal(questionSourceKind(withGemini), 'gemini')
assert.equal(questionSourceKind(withPyqStyle), 'pyq')
assert.equal(questionSourceKind(withOfficial), 'pyq')
assert.equal(questionSourceKind(qs[0]), 'upload')
assert.equal(questionMatchesExamFilter(withGemini, 'jee-main'), true)
assert.equal(questionMatchesExamFilter(withGemini, 'neet'), false)

const examNeet = filterBankQuestions([withGemini, withPyqStyle, withOfficial], { examId: 'neet' })
assert.equal(examNeet.length, 1)
assert.equal(examNeet[0].id, 'pyq-ai')

const geminiOnly = filterBankQuestions([withGemini, withPyqStyle, qs[0]], { sourceKind: 'gemini' })
assert.equal(geminiOnly.length, 1)

const pyqOnly = filterBankQuestions([withGemini, withPyqStyle, withOfficial, qs[0]], {
  sourceKind: 'pyq',
})
assert.equal(pyqOnly.length, 2)

const easyOnly = filterBankQuestions([withGemini, withPyqStyle, withOfficial], {
  toughnessBand: 'easy',
})
assert.equal(easyOnly.length, 1)
assert.equal(easyOnly[0].id, withGemini.id)

const combinedNone = filterBankQuestions([withGemini, withPyqStyle], {
  examId: 'jee-main',
  sourceKind: 'pyq',
})
assert.equal(combinedNone.length, 0)

const parentQ = { ...withOfficial, id: 'JEE24-P1-Q03' }
const childQ = {
  ...withOfficial,
  id: 'JEE24-P1-Q03C1',
  parentQuestionId: 'JEE24-P1-Q03',
  similarToPyq: true,
  bankSource: 'ai_similar',
  source: 'AI similar',
}
const replicaQ = {
  ...withOfficial,
  id: 'JEE24-P1-Q03C2',
  aiReplicaPaper: true,
  paperId: '2024-adv-p1-similar-1',
  bankSource: 'ai_replica_paper',
}
assert.equal(filterBankQuestions([parentQ, childQ, replicaQ], { familyKind: 'original' }).length, 1)
assert.equal(filterBankQuestions([parentQ, childQ, replicaQ], { familyKind: 'similar' })[0].id, 'JEE24-P1-Q03C1')
assert.equal(filterBankQuestions([parentQ, childQ, replicaQ], { familyKind: 'replica' })[0].id, 'JEE24-P1-Q03C2')
assert.equal(filterBankQuestions([parentQ, childQ], { questionIdQuery: 'C1' }).length, 1)
assert.equal(filterBankQuestions([parentQ, childQ], { questionIdQuery: 'C1' })[0].id, 'JEE24-P1-Q03C1')

const hybridAi = {
  id: 'TV-AI-MATH-abc',
  sub_bank_type: 'ai',
  text: 'x',
  options: ['a', 'b'],
  correctIndex: 0,
  examPatternId: 'jee-advanced',
}
const officialPyqRow = { ...withOfficial, sub_bank_type: 'pyq' }
const aiOnly = filterBankQuestions([hybridAi, officialPyqRow, qs[0]], { subBankType: 'ai' })
assert.equal(aiOnly.length, 1)
assert.equal(aiOnly[0].id, 'TV-AI-MATH-abc')

assert.deepEqual(toughnessQuotaForCount(10), { easy: 4, moderate: 3, tough: 3 })
assert.equal(toughnessBandFromLevel(1), 'easy')
assert.equal(toughnessBandFromLevel(3), 'easy')
assert.equal(toughnessBandFromLevel('T3'), 'easy')
assert.equal(toughnessBandFromLevel(5), 'moderate')
assert.equal(toughnessBandFromLevel(7), 'moderate')
assert.equal(toughnessBandFromLevel(8), 'tough')
assert.equal(toughnessBandFromLevel(9), 'tough')
assert.equal(toughnessBandFromLevel(10), 'tough')

const pub = { ...qs[0], id: 'pub-1', bankStatus: 'published' }
const draftRow = { ...qs[1], id: 'dr-1', bankStatus: 'draft' }
const viewTabDraft = buildReviewQueue([pub, draftRow], { bankStatus: 'published' }, 'drafts', 'draft')
assert.equal(viewTabDraft.length, 1)
assert.equal(viewTabDraft[0].id, 'dr-1')

const stripped = bankListFiltersForViewTab({ examId: 'jee-main', bankStatus: 'published' })
assert.equal(stripped.bankStatus, undefined)
assert.equal(stripped.examId, 'jee-main')

const clearedPublished = clearedBankListFilters(
  { examId: 'jee-main', bankStatus: 'draft', dateFrom: '2026-06-01', dateTo: '2026-06-15', subBankType: 'ai' },
  { hideBankStatusFilter: true, viewTab: 'published' },
)
assert.equal(clearedPublished.bankStatus, 'published')
assert.equal(clearedPublished.dateFrom, '')
assert.equal(clearedPublished.subBankType, 'ai')
const afterClear = buildReviewQueue(
  [pub, draftRow],
  { ...clearedPublished, subBankType: '' },
  'drafts',
  'published',
)
assert.equal(afterClear.length, 1)
assert.equal(afterClear[0].id, 'pub-1')
const clearedDraft = clearedBankListFilters(
  { bankStatus: 'published' },
  { hideBankStatusFilter: true, viewTab: 'draft' },
)
assert.equal(clearedDraft.bankStatus, 'draft')
assert.equal(buildReviewQueue([pub, draftRow], clearedDraft, 'drafts', 'draft')[0].id, 'dr-1')

/** Local calendar day (inclusive). Empty from or empty to is open on that side. */
const localDay = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min, 0, 0).getTime()
const dated = (id, ts) => ({
  id,
  text: id,
  subject: 'physics',
  bankStatus: 'draft',
  savedAt: ts,
})
const beforeFrom = dated('before', localDay(2026, 5, 31, 23, 59))
const rangeStart = dated('start', localDay(2026, 6, 1, 0, 30))
const inRange = dated('inside', localDay(2026, 6, 10, 15, 0))
const rangeEnd = dated('end', localDay(2026, 6, 15, 23, 59))
const afterTo = dated('after', localDay(2026, 6, 16, 0, 1))
const uploadDates = [beforeFrom, rangeStart, inRange, rangeEnd, afterTo]
const juneRange = { dateFrom: '2026-06-01', dateTo: '2026-06-15' }

const matchedIds = filterBankQuestions(uploadDates, juneRange).map((q) => q.id)
assert.deepEqual(matchedIds, ['start', 'inside', 'end'], 'in range, inclusive same-day ends')
assert.equal(matchedIds.includes('before'), false, 'before from')
assert.equal(matchedIds.includes('after'), false, 'after to')

const sameDay = filterBankQuestions(
  [
    dated('early', localDay(2026, 10, 4, 0, 30)),
    dated('late', localDay(2026, 10, 4, 23, 59)),
    dated('prev', localDay(2026, 10, 3, 23, 59)),
    dated('next', localDay(2026, 10, 5, 0, 1)),
  ],
  { dateFrom: '2026-10-04', dateTo: '2026-10-04' },
).map((q) => q.id)
assert.deepEqual(sameDay, ['early', 'late'], 'same local calendar day inclusive')

assert.deepEqual(
  filterBankQuestions(uploadDates, { dateFrom: '2026-06-10', dateTo: '' }).map((q) => q.id),
  ['inside', 'end', 'after'],
  'empty to is open-ended',
)
assert.deepEqual(
  filterBankQuestions(uploadDates, { dateFrom: '', dateTo: '2026-06-01' }).map((q) => q.id),
  ['before', 'start'],
  'empty from is open-ended',
)

const reviewQueue = buildReviewQueue(uploadDates, juneRange, 'drafts', 'draft')
assert.deepEqual(
  reviewQueue.map((q) => q.id),
  ['end', 'inside', 'start'],
  'review queue uses the same inclusive upload-date range',
)
assert.equal(buildReviewQueue(uploadDates, {}, 'drafts', 'draft').length, uploadDates.length)

const customKept = reviewDatesAfterUrlParam(
  { dateFrom: '2026-06-01', dateTo: '2026-06-15' },
  null,
)
assert.equal(customKept.changed, false)
assert.equal(customKept.dateFrom, '2026-06-01')
assert.equal(customKept.dateTo, '2026-06-15')
const cleared = reviewDatesAfterUrlParam(
  { dateFrom: '2026-06-01', dateTo: '2026-06-15' },
  'all',
)
assert.equal(cleared.dateFrom, '')
assert.equal(cleared.dateTo, '')
assert.equal(cleared.changed, true)

console.log('test-bank-list-filters: ok')
