import assert from 'node:assert/strict'

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  }
}

const {
  seedDemoBatchResults,
  summarizeDemoBatch,
  getDemoBatchAttempts,
  getAttemptSubjectDetails,
  DEMO_BATCH_TEST_TITLE,
  DEMO_SUBJECTS,
} = await import('../src/utils/seedDemoBatchResults.js')

localStorage.removeItem('testvantage-demo-batch-results-v1')
localStorage.removeItem('testvantage-demo-batch-results-v2')
localStorage.removeItem('testvantage-attempt-history')

const first = seedDemoBatchResults({ force: true })
assert.equal(first.seeded, true)
assert.equal(first.count, 12)

const rows = getDemoBatchAttempts()
assert.equal(rows.length, 12)

const subjects = getAttemptSubjectDetails(rows[0])
assert.deepEqual(
  subjects.map((s) => s.subject),
  DEMO_SUBJECTS,
)
for (const s of subjects) {
  assert.ok(s.attempted >= s.correct)
  assert.equal(s.attempted, s.correct + s.wrong)
  assert.equal(s.negativeMarks, s.wrong)
  assert.equal(s.totalMarks, s.correct * 4 - s.negativeMarks)
}

const summary = summarizeDemoBatch(rows)
assert.equal(summary.count, 12)
assert.equal(summary.bySubject.length, 3)
assert.ok(summary.bySubject.every((s) => 'questionsAttempted' in s && 'correctQuestions' in s))
assert.ok(summary.bySubject.every((s) => 'negativeMarks' in s && 'totalMarks' in s))
assert.equal(summary.studentSubjectRows.length, 12)
assert.ok(rows.every((r) => r.title === DEMO_BATCH_TEST_TITLE))

const { buildRankedBatchRows, assignDynamicRanks } = await import('../src/utils/seedDemoBatchResults.js')
const rankedOverall = buildRankedBatchRows(rows, 'overall')
assert.equal(rankedOverall[0].rank, 1)
assert.equal(rankedOverall[0].userName, 'Aarav Sharma')
assert.ok(rankedOverall.every((r) => r.physicsRank >= 1 && r.chemistryRank >= 1 && r.mathsRank >= 1))

const rankedPhy = buildRankedBatchRows(rows, 'Physics')
assert.equal(rankedPhy.length, 12)
assert.ok(rankedPhy[0].physicsMarks >= rankedPhy[1].physicsMarks)

const ranks = assignDynamicRanks(
  [{ id: 'a', score: 10 }, { id: 'b', score: 10 }, { id: 'c', score: 5 }],
  (r) => r.score,
)
assert.equal(ranks.get('a'), 1)
assert.equal(ranks.get('b'), 1)
assert.equal(ranks.get('c'), 3)

console.log('test-demo-batch-results: ok')
