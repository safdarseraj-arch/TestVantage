import assert from 'node:assert/strict'
import {
  runAiUploadAssist,
  enhanceMatrixParse,
  enhanceMcqFromOcr,
  buildAiUploadReport,
} from '../src/utils/aiUploadAssist.js'
import { countRealMcqOptions } from '../src/utils/stemDiagramDetect.js'
import { matrixColsNeedHeal, parseMatchColumnUpload } from '../src/utils/parseMatchColumnUpload.js'

const progressionMtc = `
11. Match the Column
Column-I
(A) If p^th, q^th and r^th terms of a G.P. (common ratio != 1) are in G.P. then p,q,r will be in
(B) If a,b,c,d are non-zero real numbers such that inequality holds then a,b,c,d will be in
(C) If a,b,c,d are four different positive numbers in G.P. then fraction terms will be in
(D) If a_1, a_2, a_3 are in A.P., a_2, a_3, a_4 are in G.P. and a_3, a_4, a_5 are in H.P. then a_1, a_3, a_5 are always in
Column-II
(P) Arithmetic progression
(Q) Geometric progression
(R) Harmonic progression
(S) Not a harmonic progression
`

const parsedMtc = parseMatchColumnUpload(progressionMtc)
assert.ok(parsedMtc, 'MTC parse')
const enhancedMtc = enhanceMatrixParse(parsedMtc, progressionMtc)
assert.ok(
  !matrixColsNeedHeal(enhancedMtc.parsed?.matrixCols ?? []),
  'progression Column II valid after AI assist',
)

const partialMcq = `
If the 9th term in the expansion is equal to 495, then the value of x can be
(A) 1
(B) a fraction
(C) An integer greater than n
(D) an irrational number
`
const mcq = enhanceMcqFromOcr({
  stem: 'If the 9th term...',
  options: ['1', '', '', 'an irrational number'],
  rawOcr: partialMcq,
})
assert.ok(mcq.found >= 2, 'MCQ assist improves option count')

const assistScq = runAiUploadAssist(partialMcq)
assert.equal(assistScq.detectedType, 'single_correct', 'detects SCQ upload')
assert.ok(assistScq.quality, 'quality score')

const inverseGarbled = `Let f(x) = ln(x + sqrt(x^2+1)). If g(f(x)) = x for all x then g(2) is
- e' +e" 2 ee" -2 (A) (e^2+e^{-2})/2 B)e^2 C) (e^2-e^{-2})/2 D)e^{-2}`
const assistInverse = runAiUploadAssist(inverseGarbled, { hasSourceImage: true })
assert.equal(assistInverse.detectedType, 'single_correct', 'inverse function MCQ not IVQ')
assert.equal(
  countRealMcqOptions(assistInverse.stem, assistInverse.options),
  4,
  'AI repairs all 4 options',
)

const report = buildAiUploadReport(assistScq)
assert.ok(report.summary.includes('AI Upload Assist'), 'report summary')

console.log('test-ai-upload-assist: ok')
