import assert from 'node:assert/strict'
import { CANONICAL_QUESTION_TYPE_IDS } from '../src/data/questionTypes.js'
import {
  EXAM_METADATA_QUESTION_TYPES,
  getAllowedQuestionTypeIdsForExams,
} from '../src/data/examPatterns.js'
import { getQuestionTypeOptionsForExams } from '../src/utils/questionMetadata.js'

assert.equal(CANONICAL_QUESTION_TYPE_IDS.length, 8)
assert.deepEqual(EXAM_METADATA_QUESTION_TYPES['jee-main'], ['single_correct', 'integer'])
assert.deepEqual(EXAM_METADATA_QUESTION_TYPES.neet, ['single_correct', 'integer', 'passage_scq'])
assert.equal(EXAM_METADATA_QUESTION_TYPES['jee-advanced'].length, 8)
assert.ok(EXAM_METADATA_QUESTION_TYPES['jee-advanced'].includes('true_false'))

const jm = getAllowedQuestionTypeIdsForExams(['jee-main'])
assert.equal(jm?.length, 2)
assert.ok(jm.includes('single_correct') && jm.includes('integer'))
assert.ok(!jm.includes('passage_scq'), 'jee-main paper allowlist must not include PSCQ')

const neet = getAllowedQuestionTypeIdsForExams(['neet'])
assert.ok(neet.includes('single_correct') && neet.includes('integer') && neet.includes('passage_scq'))
assert.ok(!neet.includes('passage_integer'), 'neet paper allowlist must not include PIVQ')
assert.equal(neet.length, 3)

const adv = getAllowedQuestionTypeIdsForExams(['jee-advanced'])
assert.equal(adv?.length, 8)
assert.ok(adv.includes('true_false'))

// Upload picker must always show every bank type, for any exam tag.
for (const exam of [['jee-main'], ['neet'], ['jee-advanced'], ['jee-main', 'neet']]) {
  const types = getQuestionTypeOptionsForExams(exam)
  assert.equal(types.length, 8, `upload picker incomplete for ${exam.join('+')}`)
  for (const id of CANONICAL_QUESTION_TYPE_IDS) {
    assert.ok(
      types.some((t) => t.id === id),
      `upload picker missing ${id} for ${exam.join('+')}`,
    )
  }
}

const NEET_SUBJECT_IDS = new Set(['biology', 'botany', 'zoology'])
assert.ok(NEET_SUBJECT_IDS.has('biology'))
assert.ok(!NEET_SUBJECT_IDS.has('mathematics'))

console.log('test-metadata-types: ok')
