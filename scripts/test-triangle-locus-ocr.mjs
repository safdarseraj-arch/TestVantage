import assert from 'node:assert/strict'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'
import { parseBulkQuestions } from '../src/utils/parseBulkQuestions.js'
import { polishOcrText } from '../src/utils/ocrExtractPolish.js'

const badOcr = `If area of the triangle formed by the points A(3, 0), B(0, 3) & P(a, b) is : sq. units, then identify the correct statement(s)
(A) locus of P will be a union of two parallel lines
(B) Locus of P will be a union of two perpendicular lines
(C) Locus of P is given by xX + a +2xy-6(x+y)+8= 0
(D) Locus of P is given by x -y +2y-6x+8= 0`

const parsed = parseSingleQuestionUpload(polishOcrText(badOcr), badOcr)
assert.match(parsed.text ?? '', /\\frac\{3\}\{2\}/, 'stem restores area 3/2')
assert.doesNotMatch(parsed.text ?? '', /\bis\s*:\s*sq/i, 'no bare colon before sq. units')
assert.match(parsed.options[2] ?? '', /x\^2 \+ y\^2 \+ 2xy/, 'option C equation repaired')
assert.match(parsed.options[3] ?? '', /x\^2 - y\^2 \+ 2y/, 'option D equation repaired')
assert.equal(parsed.optionsFound, 4)

const bulk = parseBulkQuestions(badOcr.replace(/\n/g, ' '))
assert.equal(bulk.length, 1, 'bulk paste stays one question')
assert.match(bulk[0]?.text ?? '', /\\frac\{3\}\{2\}/, 'bulk stem restores area')

console.log('test-triangle-locus-ocr: ok')
