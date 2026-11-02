import assert from 'node:assert/strict'
import {
  iterativeUploadHeal,
  buildUploadFixActions,
  needsAutoReExtract,
  runFullUploadAssist,
  scoreBulkQuestionRow,
  filterBulkImportRows,
  chunkArray,
} from '../src/utils/uploadOrchestrator.js'
import { assessUploadQuality } from '../src/utils/classifyUploadFromOcr.js'

const garbled = `Let f(x) = ln(x + sqrt(x^2+1)). If g(f(x)) = x for all x then g(2) is
- e' +e" 2 ee" -2 (A) (e^2+e^{-2})/2 B)e^2 C) (e^2-e^{-2})/2 D)e^{-2}`

const healed = iterativeUploadHeal({
  rawOcr: garbled,
  stem: 'Let f(x)...',
  options: ['', '', '', ''],
  questionType: 'integer',
})
assert.ok(healed.improved || healed.found >= 0)
assert.equal(healed.questionType, 'single_correct', 'heal fixes integer→SCQ when A-D in OCR')

const preHealedAssist = runFullUploadAssist(garbled, {
  stem: healed.stem,
  options: healed.options,
  preHealed: healed,
  questionType: healed.questionType,
})
assert.equal(preHealedAssist.healed, healed, 'preHealed skips second heal pass')

const quality = assessUploadQuality({
  detectedType: 'single_correct',
  stem: 'x',
  options: ['| (s-a)', '', '', ''],
  rawOcr: garbled,
})
assert.ok(buildUploadFixActions(quality).some((a) => a.id === 'reparse'))
assert.equal(needsAutoReExtract(quality), true)

const good = assessUploadQuality({
  detectedType: 'single_correct',
  stem: 'Find $x$',
  options: ['$1$', '$2$', '$3$', '$4$'],
  rawOcr: 'Find x (A) 1 (B) 2',
})
assert.equal(needsAutoReExtract(good), false)

const bulk = filterBulkImportRows(
  [
    {
      text: 'Q1',
      questionType: 'single_correct',
      options: ['one', 'two', 'three', 'four'],
      correctIndex: 0,
    },
    { text: '', questionType: 'single_correct', options: [], correctIndex: 0 },
  ],
  { minConfidence: 40 },
)
assert.equal(bulk.ok.length, 1)
assert.equal(bulk.skipped.length, 1)

assert.deepEqual(chunkArray([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])

const rowScore = scoreBulkQuestionRow({
  text: 'Find value',
  questionType: 'integer',
  options: [],
})
assert.ok(rowScore.confidence >= 0)

console.log('test-upload-orchestrator: ok')
