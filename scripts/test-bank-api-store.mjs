import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempRoot = mkdtempSync(join(tmpdir(), 'tv-bank-'))
process.env.TESTVANTAGE_BANK_DATA_DIR = join(tempRoot, 'data')

const { upsertQuestion, loadBankFile, bulkUpsertQuestions } = await import(
  '../server/bankStore.js'
)

const q1 = upsertQuestion({
  id: 'MAQ10001',
  subject: 'mathematics',
  text: 'Test stem',
  options: ['A', 'B', 'C', 'D'],
  correctIndex: 0,
})

assert.equal(q1.syncStatus, 'live')
assert.equal(loadBankFile().questions.length, 1)

const bulk = bulkUpsertQuestions([
  { id: 'MAQ10002', subject: 'physics', text: 'Q2' },
  {
    id: 'MAQ10001',
    subject: 'mathematics',
    text: 'Updated stem',
    options: ['A', 'B', 'C', 'D'],
  },
])
assert.equal(bulk.synced, 2)
assert.equal(loadBankFile().questions.length, 2)

rmSync(tempRoot, { recursive: true, force: true })
console.log('test-bank-api-store: ok')
