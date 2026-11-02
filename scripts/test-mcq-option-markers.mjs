/**
 * Generic MCQ option-block detection — "is (A)" must not be treated as f(A).
 * Run via: node scripts/test-mcq-option-markers.mjs  (also in test:regression)
 */
import assert from 'node:assert/strict'
import {
  findOptionsBlockStart,
  isFunctionStyleParen,
  normalizeOptionMarkersInText,
} from '../src/utils/mcqOptionMarkers.js'
import { parseQuestionText } from '../src/utils/parseQuestionText.js'
import { processMcqUploadExtract, tryRecoverSingleUploadParse } from '../src/utils/uploadPipeline.js'
import { runAiUploadAssist } from '../src/utils/aiUploadAssist.js'
import { countRealMcqOptions } from '../src/utils/stemDiagramDetect.js'

// f(A) / P(A) glued — function style
assert.equal(isFunctionStyleParen('f(A)', 1), true, 'f(A) is function-style')
assert.equal(isFunctionStyleParen('P(A)', 1), true, 'P(A) is function-style')
assert.equal(isFunctionStyleParen('g(2)', 1), true, 'g(2) is function-style')

// English "is (A)" — MUST be an MCQ label (regression: previously false-positived)
const isA = 'Then g(2) is (A) (e^2+e^{-2})/2 (B) e^2 (C) (e^2-e^{-2})/2 (D) e^{-2}'
const aIdx = isA.indexOf('(A)')
assert.ok(aIdx > 0)
assert.equal(isFunctionStyleParen(isA, aIdx), false, 'is (A) is NOT function-style')
assert.ok(findOptionsBlockStart(isA) >= 0, 'finds option block after "is (A)"')

const parsed = parseQuestionText(isA)
assert.equal(parsed.optionsFound, 4, 'parseQuestionText gets 4 nested-paren options')
assert.match(parsed.options[0] ?? '', /e\^2|e\^\{2\}/)
assert.match(parsed.options[1] ?? '', /e\^2|e\^\{2\}/)

const pipe = processMcqUploadExtract(isA)
assert.equal(pipe.found, 4, 'upload pipeline finds 4 options')

const recover = tryRecoverSingleUploadParse(isA, { minFound: 0 })
assert.ok(recover && recover.found >= 4, 'recover finds 4 options')

const assist = runAiUploadAssist(isA)
assert.equal(countRealMcqOptions(assist.stem, assist.options), 4, 'AI assist keeps 4 options')
assert.equal(assist.detectedType, 'single_correct')

// Interval options with half-open brackets
const intervals = `Find the domain
(A) [0,1)
(B) (1,2]
(C) [2,3)
(D) (3,4]`
assert.equal(parseQuestionText(intervals).optionsFound, 4, 'interval options')
assert.equal(processMcqUploadExtract(intervals).found, 4)

// Marker normalize forces "is (A)" onto new line before options
const marked = normalizeOptionMarkersInText('value is (A) 1 (B) 2 (C) 3 (D) 4')
assert.ok(findOptionsBlockStart(marked) >= 0, 'marked text finds option block')
assert.equal(parseQuestionText(marked).optionsFound, 4, 'marked "is (A)" parses 4')

console.log('test-mcq-option-markers: ok')
