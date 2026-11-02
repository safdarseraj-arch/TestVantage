import assert from 'node:assert/strict'
import {
  effectiveBankStatus,
  isQuestionPublished,
  normalizeLegacyBankStatus,
} from '../src/utils/questionUploadFilter.js'
import { filterBankQuestions } from '../src/utils/bankListFilters.js'

const base = {
  id: 'PHY00010',
  subject: 'Physics',
  text: 'Stem',
  savedAt: Date.now(),
}

const draft = { ...base, bankStatus: 'draft' }
const published = { ...base, bankStatus: 'published' }

assert.equal(effectiveBankStatus(draft), 'draft')
assert.equal(isQuestionPublished(draft), false)
assert.equal(effectiveBankStatus(published), 'published')

const legacy = { ...base, bankStatus: undefined }
assert.equal(effectiveBankStatus(legacy), 'draft')
assert.equal(normalizeLegacyBankStatus(legacy).bankStatus, 'published')

const legacyDraft = {
  ...base,
  bankStatus: undefined,
  updateHistory: [{ action: 'created', summary: 'Saved to bank (draft)' }],
}
assert.equal(normalizeLegacyBankStatus(legacyDraft).bankStatus, 'draft')

const onlyPublished = filterBankQuestions([draft, published], { bankStatus: 'published' })
assert.equal(onlyPublished.length, 1)
assert.equal(onlyPublished[0].id, 'PHY00010')

const onlyDraft = filterBankQuestions([draft, published], { bankStatus: 'draft' })
assert.equal(onlyDraft.length, 1)

console.log('test-bank-publish-history: ok')
