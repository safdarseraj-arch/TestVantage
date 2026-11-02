/**
 * Publish duplicate choice: compare first, publish only when the user keeps both.
 * Uses an in-memory bank. Does not touch a real browser bank.
 */
import assert from 'node:assert/strict'

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    get length() {
      return store.size
    },
    key: (i) => [...store.keys()][i] ?? null,
  }
}
if (typeof globalThis.sessionStorage === 'undefined') {
  const store = new Map()
  globalThis.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  }
}
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis
}

const {
  decidePublishDuplicateChoice,
  findWholeBankPublishDuplicates,
  questionCompareFacts,
} = await import('../src/utils/detectDuplicateQuestion.js')

const { splitHybridSyncDrafts, mergeHybridSyncIntoExisting, isSuppressedHybridDraft } =
  await import('../src/utils/hybridBankIdentity.js')

const {
  saveQuestionBank,
  publishUploadedQuestion,
  removeUploadedQuestions,
  removeDuplicateDraftOnly,
  loadQuestionBank,
  CURRENT_BANK_MIGRATE_VERSION,
} = await import('../src/utils/questionBank.js')

localStorage.setItem('testvantage-bank-migrate-version', String(CURRENT_BANK_MIGRATE_VERSION))

assert.deepEqual(decidePublishDuplicateChoice(false, null), {
  action: 'publish',
  publish: true,
  keepBoth: false,
})
assert.deepEqual(decidePublishDuplicateChoice(true, null), {
  action: 'compare',
  publish: false,
  keepBoth: false,
})
assert.deepEqual(decidePublishDuplicateChoice(true, 'keep-original'), {
  action: 'delete-duplicate',
  publish: false,
  keepBoth: false,
})
assert.deepEqual(decidePublishDuplicateChoice(true, 'keep-both'), {
  action: 'publish',
  publish: true,
  keepBoth: true,
})

const STEM =
  'Let A equal the matrix with rows 1 2 0 and 0 1 2 and 0 0 1 and let B equal A to the tenth minus A to the ninth. Find the trace of B.'
const OTHER =
  'A completely different question about the boiling point of pure water in a closed vessel at standard atmospheric pressure.'
const UNIQUE =
  'Find the determinant of the diagonal matrix with entries 4 9 and 16 and explain that result in one clear sentence.'

function row(partial) {
  return {
    text: STEM,
    subject: 'mathematics',
    section: 'Algebra',
    chapter: 'Matrices',
    questionType: 'single_correct',
    options: ['1', '2', '3', '4'],
    correctIndex: 1,
    bankStatus: 'draft',
    sub_bank_type: 'main',
    savedAt: 1,
    ...partial,
  }
}

const pair = [
  row({ id: 'MAM00020I', sub_bank_type: 'main', bankStatus: 'published', source: 'Main' }),
  row({
    id: 'TV-AI-00025',
    sub_bank_type: 'ai',
    bankStatus: 'draft',
    source: 'Hybrid AI (Postgres)',
    hybridSyncedFromPostgres: true,
  }),
]
const matches = findWholeBankPublishDuplicates(pair[1], pair, { excludeIds: ['TV-AI-00025'] })
assert.equal(matches.length, 1)
assert.equal(matches[0].question.id, 'MAM00020I')
assert.equal(questionCompareFacts(pair[0]).subBank, 'Main')
assert.equal(questionCompareFacts(pair[0]).statusLabel, 'Published')
assert.equal(questionCompareFacts(pair[0]).answer, 'B')
assert.equal(questionCompareFacts(pair[1]).subBank, 'Hybrid AI')
assert.equal(questionCompareFacts(pair[1]).statusLabel, 'Draft')

saveQuestionBank({
  questions: [
    ...pair,
    row({
      id: 'UNRELATED0001',
      text: OTHER,
      sub_bank_type: 'pyq',
      bankStatus: 'published',
      savedAt: 2,
    }),
  ],
})

let code = ''
try {
  publishUploadedQuestion('TV-AI-00025')
} catch (err) {
  code = err.code
}
assert.equal(code, 'PUBLISH_DUPLICATE')
let stored = loadQuestionBank().questions
assert.equal(stored.length, 3)
assert.ok(stored.some((q) => q.id === 'TV-AI-00025' && q.bankStatus === 'draft'))
assert.equal(stored.filter((q) => q.text === STEM).length, 2)

const kept = publishUploadedQuestion('TV-AI-00025', { allowDuplicate: true })
assert.ok(kept)
assert.equal(kept.bankStatus, 'published')
assert.notEqual(String(kept.id), 'TV-AI-00025')
assert.equal(kept.aiTempId, 'TV-AI-00025')
stored = loadQuestionBank().questions
assert.equal(stored.length, 3)
assert.equal(stored.filter((q) => String(q.id).startsWith('TV-AI')).length, 0)
assert.equal(stored.filter((q) => q.text === STEM && q.bankStatus === 'published').length, 2)
assert.ok(stored.some((q) => q.id === 'MAM00020I'))

saveQuestionBank({
  questions: [
    ...stored,
    row({
      id: 'MAM00007I',
      text: UNIQUE,
      sub_bank_type: 'ai',
      hybridSyncedFromPostgres: true,
      source: 'Hybrid AI (Postgres)',
      bankStatus: 'draft',
      savedAt: 3,
    }),
  ],
})
const unique = publishUploadedQuestion('MAM00007I')
assert.equal(unique.id, 'MAM00007I')
assert.equal(unique.bankStatus, 'published')
stored = loadQuestionBank().questions
assert.equal(stored.filter((q) => q.text === UNIQUE).length, 1)
assert.equal(stored.filter((q) => q.id === 'MAM00007I' && q.bankStatus === 'draft').length, 0)

const syncDraft = row({
  id: 'TV-AI-00025',
  sub_bank_type: 'ai',
  bankStatus: 'draft',
  hybridSyncedFromPostgres: true,
})
const split = splitHybridSyncDrafts(stored, [syncDraft])
assert.equal(split.toAdd.length, 0)
assert.equal(split.toUpdate.length, 1)
const merged = mergeHybridSyncIntoExisting(split.toUpdate[0].existing, syncDraft)
assert.equal(merged.bankStatus, 'published')
assert.notEqual(String(merged.id), 'TV-AI-00025')

const deleted = removeUploadedQuestions(['MAM00020I'])
assert.equal(deleted.blockedEmpty, false)
assert.ok(deleted.removedIds.includes('MAM00020I'))
stored = loadQuestionBank().questions
assert.equal(stored.filter((q) => q.text === STEM).length, 0)
assert.ok(stored.some((q) => q.id === 'UNRELATED0001'))
assert.ok(stored.some((q) => q.id === 'MAM00007I'))
assert.equal(isSuppressedHybridDraft(syncDraft), true)
const afterDelete = splitHybridSyncDrafts(stored, [syncDraft])
assert.equal(afterDelete.toAdd.length, 0)
assert.equal(afterDelete.toUpdate.length, 0)

saveQuestionBank({
  questions: [
    row({ id: 'MAM00020I', sub_bank_type: 'main', bankStatus: 'published', source: 'Main' }),
    row({
      id: 'TV-AI-00025',
      sub_bank_type: 'ai',
      bankStatus: 'draft',
      source: 'Hybrid AI (Postgres)',
      hybridSyncedFromPostgres: true,
    }),
    row({
      id: 'UNRELATED0001',
      text: OTHER,
      sub_bank_type: 'pyq',
      bankStatus: 'published',
      savedAt: 2,
    }),
  ],
})
const choice = decidePublishDuplicateChoice(true, 'keep-original')
assert.equal(choice.action, 'delete-duplicate')
assert.equal(choice.publish, false)
const dropped = removeDuplicateDraftOnly('TV-AI-00025', { keepIds: ['MAM00020I'] })
assert.equal(dropped.blockedEmpty, false)
assert.ok(dropped.removedIds.includes('TV-AI-00025'))
assert.equal(dropped.removedIds.includes('MAM00020I'), false)
stored = loadQuestionBank().questions
assert.equal(stored.some((q) => q.id === 'TV-AI-00025'), false)
assert.equal(stored.filter((q) => q.text === STEM && q.bankStatus === 'draft').length, 0)
assert.equal(stored.filter((q) => q.id === 'MAM00020I' && q.bankStatus === 'published').length, 1)
assert.ok(stored.some((q) => q.id === 'UNRELATED0001'))
assert.equal(stored.filter((q) => q.text === STEM).length, 1)

console.log('publish duplicate choice tests passed')
