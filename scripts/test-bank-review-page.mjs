import assert from 'node:assert/strict'
import {
  countAllReviewModes,
  sliceReviewPage,
  REVIEW_PAGE_SIZE_DRAFT,
} from '../src/utils/bankReviewFilters.js'

const drafts = Array.from({ length: 37 }, (_, i) => ({
  id: `D${i + 1}`,
  bankStatus: 'draft',
  subject: i % 3 === 0 ? '' : 'physics',
  section: i % 3 === 0 ? '' : 'Mechanics',
  chapter: i % 3 === 0 ? '' : 'Kinematics',
  questionType: 'single_correct',
  text: `Stem ${i + 1}`,
  options: ['A', 'B', 'C', 'D'],
  correctIndex: 0,
}))

const counts = countAllReviewModes(drafts)
assert.equal(counts.drafts, 37)
assert.ok(counts.untagged > 0)

const page0 = sliceReviewPage(drafts, 0, REVIEW_PAGE_SIZE_DRAFT)
assert.equal(page0.items.length, 10)
assert.equal(page0.items[0].id, 'D1')
assert.equal(page0.totalPages, 4)
assert.equal(page0.start, 0)
assert.equal(page0.end, 10)

const page3 = sliceReviewPage(drafts, 3, 10)
assert.equal(page3.items.length, 7)
assert.equal(page3.items[0].id, 'D31')
assert.equal(page3.page, 3)

const overflow = sliceReviewPage(drafts, 99, 10)
assert.equal(overflow.page, 3)
assert.equal(overflow.items[0].id, 'D31')

const empty = sliceReviewPage([], 2, 10)
assert.equal(empty.items.length, 0)
assert.equal(empty.page, 0)
assert.equal(empty.totalPages, 1)

console.log('test-bank-review-page: ok')
