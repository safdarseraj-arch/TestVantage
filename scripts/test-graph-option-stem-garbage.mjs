/**
 * Graph-option MCQ: stem must not keep axis/label OCR crumbs after "is :" / "?".
 */
import assert from 'node:assert/strict'
import {
  cleanStemMergedOptionGarbage,
  looksLikeGraphLabelOcrGarbage,
} from '../src/utils/optionStemLeak.js'
import { finalizeStemForBank, stemForLivePreview } from '../src/utils/stemBankGuard.js'
import { stripMistakenCropLeakFromStem } from '../src/utils/graphOptionOcr.js'

const garbageTail = 'i pg oa PY a % ™ \\infty WV. A x'
const polluted =
  `The curve $y=f(x)$ which satisfies the differential equation and the condition is : ${garbageTail}`

assert.ok(looksLikeGraphLabelOcrGarbage(garbageTail), 'detect graph-label OCR crumbs')
assert.ok(
  !looksLikeGraphLabelOcrGarbage('sq. units, then identify the correct statement(s)'),
  'keep real stem continuation after is :',
)

const cleaned = cleanStemMergedOptionGarbage(polluted, ['', '', '', ''])
assert.match(cleaned, /is\s*:?\s*$/i, 'stem ends at is :')
assert.doesNotMatch(cleaned, /pg\s+oa|™|\\infty|WV/i, 'no graph OCR in cleaned stem')

const graphPlaceholders = [
  '(Graph/diagram — attach image for this option below)',
  '(Graph/diagram — attach image for this option below)',
  '(Graph/diagram — attach image for this option below)',
  '(Graph/diagram — attach image for this option below)',
]
assert.doesNotMatch(
  cleanStemMergedOptionGarbage(polluted, graphPlaceholders),
  /pg\s+oa|™/i,
  'strip when options are graph placeholders',
)

const bank = finalizeStemForBank(polluted, graphPlaceholders)
assert.doesNotMatch(bank, /pg\s+oa|™|\\infty\s+WV/i, 'finalizeStemForBank strips garbage')
assert.match(bank, /curve\s+\$y=f\(x\)\$/i, 'keeps real stem math')

const preview = stemForLivePreview(polluted, graphPlaceholders)
assert.doesNotMatch(preview, /%\s*™/i, 'live preview strips garbage')

assert.doesNotMatch(
  stripMistakenCropLeakFromStem(polluted, graphPlaceholders),
  /pg\s+oa/i,
  'stripMistakenCropLeakFromStem also strips label OCR',
)

// Must not strip legitimate "is : sq. units, then…"
const locus =
  'If area of the triangle formed by the points A(3, 0), B(0, 3) & P(a, b) is : sq. units, then identify the correct statement(s)'
assert.equal(cleanStemMergedOptionGarbage(locus), locus, 'keep locus stem after is :')

// Question-mark + garbage
const qPolluted = `Which of the following graphs represents y=f(x)? ${garbageTail}`
assert.doesNotMatch(cleanStemMergedOptionGarbage(qPolluted), /pg\s+oa|™/i, 'strip after ?')

console.log('test-graph-option-stem-garbage: ok')
