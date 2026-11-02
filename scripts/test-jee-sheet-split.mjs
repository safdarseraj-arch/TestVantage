import assert from 'node:assert/strict'
import {
  parseGlobalAnswerKeyMap } from '../src/utils/bulkExtractClean.js'
import { parseBulkQuestions, splitIntoQuestionBlocks } from '../src/utils/parseBulkQuestions.js'

const merged = `4. Which of the following function is surjective but not injective (A) f : R \\to R f (x) = x^4 + 2x^3 - x^2 + 1 (B) f : R \\to R f (x) = x^3 + x + 1 (C) f : R \\to R + f (x) = 1 + x^2 (D) f : R \\to R f (x) = x^3 + 2x^2 - x + 1 \\frac{1}{4} 5. If f : R \\to R is a function such that ( f(x + 1) ) x = 8, x > 0, then the value is equal to - (A) 4 (B) 8 (C) 32 (D) 64
6. f : R \\to R such that f(x) = ln x . Another function g(x) is defined such that gof(x) = x for all x \\in R. Then g(2) is - (A) 1 (B) e (C) 2 (D) 3
7. Let f : R \\to R be a real valued function such that f(10 + x) = f(10 - x) for all x \\in R and f(20 + x) = -f(20 - x) for all x \\in R. Then which of the following statements is true - (A) f(x) is odd and periodic (B) f(x) is odd and aperiodic (C) f(x) is even and periodic (D) f(x) is even and aperiodic`

const blocks = splitIntoQuestionBlocks(merged)
assert.ok(blocks.length >= 3, `merged split: expected >=3 blocks, got ${blocks.length}`)
assert.ok(blocks.every((b) => !/surjective.*5\.\s+If/s.test(b)), 'Q4/Q5 not merged')

const withKey = `${merged}

ANSWER KEY
4. D
5. D
6. C
7. A`
const bulk = parseBulkQuestions(withKey)
const q4 = bulk.find((q) => q.text.includes('surjective'))
const q7 = bulk.find((q) => q.text.includes('odd and periodic') || q.text.includes('statements is true'))
assert.equal(q4?.correctIndex, 3, 'Q4 answer D from key')
assert.equal(q7?.correctIndex, 0, 'Q7 answer A from key')

const ak = parseGlobalAnswerKeyMap('ANSWER KEY^1. A^2. A^21. B,C,D')
assert.equal(ak[1]?.correctIndex, 0)
assert.deepEqual(ak[21]?.correctIndices, [1, 2, 3])

console.log('test-jee-sheet-split: ok')
