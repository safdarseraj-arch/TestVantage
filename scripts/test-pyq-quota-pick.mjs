import assert from 'node:assert/strict'
import {
  computePyqQuotaTargets,
  PYQ_QUOTA_MIN,
  PYQ_QUOTA_MAX,
  pyqQuotaReport,
  filterCandidatesForPyqQuota,
} from '../src/utils/pyqQuotaPick.js'
import { isPyqLike } from '../src/utils/pyqDetect.js'

assert.equal(PYQ_QUOTA_MIN, 0.1)
assert.equal(PYQ_QUOTA_MAX, 0.25)

const t20 = computePyqQuotaTargets(20, 50)
assert.equal(t20.min, 2)
assert.equal(t20.max, 5)

const t10few = computePyqQuotaTargets(10, 1)
assert.equal(t10few.min, 1)
assert.equal(t10few.max, 1)

const report = pyqQuotaReport(
  [{ id: '1', bankSource: 'pyq' }, { id: '2' }, { id: '3', source: 'PYQ 2023' }],
  10,
  20,
)
assert.equal(report.pyqCount, 2)
assert.ok(report.pyqQuotaMet)
assert.match(report.pyqSummary, /PYQ mix/)

const pool = [
  { id: 'b1', text: 'bank' },
  { id: 'p1', bankSource: 'pyq' },
  { id: 'p2', bankSource: 'pyq' },
  { id: 'p3', bankSource: 'pyq' },
]
const quota = computePyqQuotaTargets(2, 3)
const forcedPyq = filterCandidatesForPyqQuota(pool, 0, quota, 1)
assert.ok(forcedPyq.every(isPyqLike), 'last slot forces PYQ when min not met')
const capped = filterCandidatesForPyqQuota(pool, quota.max, quota, 1)
assert.ok(capped.every((q) => !isPyqLike(q)), 'excludes PYQ when max reached')

console.log('test-pyq-quota-pick: ok')
