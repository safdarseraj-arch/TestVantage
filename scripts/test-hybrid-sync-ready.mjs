import assert from 'node:assert/strict'
import {
  hybridPoolReadyForImport,
  hybridSyncUserMessage,
  postgresHasNoHybridAiRows,
} from '../src/utils/hybridAiSync.js'

assert.equal(hybridPoolReadyForImport({ ready: false, poolAiCount: 0 }, 0), false)
assert.equal(hybridPoolReadyForImport({ ready: false, poolAiCount: 3 }, 3), false)
assert.equal(hybridPoolReadyForImport({ ready: true, poolAiCount: 3 }, 3), false)
assert.equal(hybridPoolReadyForImport({ ready: true, poolAiCount: 4 }, 3), true)
assert.equal(hybridPoolReadyForImport({ ready: true, poolAiCount: 1 }, null), true)

const pending = { added: 0, poolAiCount: 0, pending: true }
assert.equal(postgresHasNoHybridAiRows(pending), false)
assert.match(hybridSyncUserMessage(pending), /still drafting/i)
assert.match(
  hybridSyncUserMessage({ added: 0, poolAiCount: 0, poolCount: 0 }),
  /Postgres has 0 Hybrid AI/,
)

console.log('test-hybrid-sync-ready: ok')
