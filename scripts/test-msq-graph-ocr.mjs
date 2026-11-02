import assert from 'node:assert/strict'
import { repairMsqGraphOcr } from '../src/utils/repairMsqGraphOcr.js'
import { polishExtractedText } from '../src/utils/ocrExtractPolish.js'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'
import { parseBulkQuestions } from '../src/utils/parseBulkQuestions.js'

const userOcr = `The graph shows the distribution of molecular velocities for two different molecules (A and (B) at the same temperature. TT eeearocty ns) Choose the correct options from the following. (A) The molecular weight of Gas 'A'" is greater than 'B'. (under all similar conditions including 'c") (B) Collision frequency of Gas - A 1s more than Gas - B (under all similar conditions including 'c") (C) most probable velocity of Gas 'B' is more than Gas 'A'. (under all similar conditions including 'c") (D) Mean free path of Gas - A 1s greater than Gas - B (under all similar conditions including 'c")`

const repaired = repairMsqGraphOcr(userOcr)
assert.match(repaired, /\(A and B\)/, 'repair fixes molecule labels')

const polished = polishExtractedText(userOcr, 'builtin')
assert.ok(!/eeearocty/i.test(polished), 'graph axis junk removed')
assert.ok(!/\b1s\s+more\b/i.test(polished), '1s -> is')
assert.match(polished, /\(A and B\)/, 'molecule labels fixed')
assert.match(polished, /\\sigma|σ/, 'sigma repaired')

const single = parseSingleQuestionUpload(polished)
assert.equal(single.multi, false, 'single MCQ not bulk multi')
assert.equal(single.optionsFound, 4, 'four options parsed')
assert.equal(single.suggestedQuestionType, 'multiple_correct', 'MSQ type suggested')
assert.ok(!/eeearocty/i.test(single.text ?? ''), 'clean stem')

const bulk = parseBulkQuestions(polished)
assert.equal(bulk.length, 1, 'one bulk block')
assert.equal(bulk[0].options.filter((o) => o.trim()).length, 4)

console.log('test-msq-graph-ocr: ok')
