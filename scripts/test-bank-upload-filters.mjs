import assert from 'node:assert/strict'
import { filterBankQuestions, describeBankPublishFilters } from '../src/utils/bankListFilters.js'
import {
  collectOperatorsInBank,
  questionMatchesIdFilter,
  questionMatchesOperatorFilter,
  questionMatchesUploadDateFilter,
  parseQuestionIdQuery,
} from '../src/utils/questionUploadFilter.js'

const day = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime()

const q1 = {
  id: 'PHY00001',
  subject: 'Physics',
  text: 'Q1',
  savedAt: day(2026, 6, 10),
  uploadedById: 'teacher-a',
  uploadedByName: 'Ms. Rao',
}

const q2 = {
  id: 'PHY00002',
  subject: 'Physics',
  text: 'Q2',
  savedAt: day(2026, 6, 28),
  uploadedById: 'admin@testvantage.com',
  uploadedByName: 'Admin',
}

assert.equal(questionMatchesUploadDateFilter(q1, { dateFrom: '2026-06-01', dateTo: '2026-06-15' }), true)
assert.equal(questionMatchesUploadDateFilter(q2, { dateFrom: '2026-06-01', dateTo: '2026-06-15' }), false)

const istEvening = day(2026, 10, 4, 23, 30)
assert.equal(
  questionMatchesUploadDateFilter({ savedAt: istEvening }, { dateFrom: '2026-10-04', dateTo: '2026-10-04' }),
  true,
  'local calendar day (India-safe)',
)
assert.equal(
  questionMatchesUploadDateFilter({ savedAt: istEvening }, { dateFrom: '04-10-2026', dateTo: '04-10-2026' }),
  true,
  'dd-mm-yyyy filter strings',
)

assert.equal(questionMatchesOperatorFilter(q1, 'teacher-a'), true)
assert.equal(questionMatchesOperatorFilter(q1, 'Ms. Rao'), true)

const filtered = filterBankQuestions([q1, q2], {
  dateFrom: '2026-06-01',
  dateTo: '2026-06-20',
  uploadedBy: 'teacher-a',
})
assert.equal(filtered.length, 1)
assert.equal(filtered[0].id, 'PHY00001')

assert.equal(parseQuestionIdQuery('phy').mode, 'contains')
assert.equal(parseQuestionIdQuery('PHY00001, MVD00002').mode, 'exact')
assert.equal(questionMatchesIdFilter(q1, 'phy'), true)
assert.equal(questionMatchesIdFilter(q1, 'PHY00001, MVD00002'), true)

const byIds = filterBankQuestions([q1, q2], { questionIdQuery: 'PHY00001' })
assert.equal(byIds.length, 1)

const desc = describeBankPublishFilters(
  { questionIdQuery: 'PHY00001', dateFrom: '2026-06-01', bankStatus: 'draft' },
  { operatorLabel: 'Ms. Rao' },
)
assert.ok(desc.includes('PHY00001'))

const ops = collectOperatorsInBank([q1, q2])
assert.equal(ops.length, 2)

console.log('test-bank-upload-filters: ok')
