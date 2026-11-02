import assert from 'node:assert/strict'
import {
  detectAnswerFromPaper,
  detectSolutionFromPaper,
  detectMatrixAnswerKeyFromPaper,
  tryAiSolveMcq,
  enrichParsedWithAnswerProvenance,
  enrichPassageSubQuestion,
  answerSourceBadgeLabel,
  generateSolutionDraft,
} from '../src/utils/answerProvenance.js'
import {
  scoreUploadFieldConfidence,
  formatFieldConfidenceHint,
  knownConfidenceScore,
  resolveQuestionFieldConfidence,
  compactConfidenceBadge,
  formatEverydayConfidenceLabel,
  buildConfidencePersistFields,
  restoreFieldConfidenceState,
} from '../src/utils/uploadFieldConfidence.js'
import { parseBulkQuestions } from '../src/utils/parseBulkQuestions.js'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'
import { estimateSkewAngleDegrees } from '../src/utils/deskewImage.js'

// —— Paper answer detection ——
const paperAns = detectAnswerFromPaper(`What is 2+2?
(A) 3
(B) 4
(C) 5
(D) 6
Answer: B`)
assert.equal(paperAns.correctIndex, 1, 'Answer: B → index 1')
assert.equal(paperAns.answerSource, 'from_paper')

const parenAns = detectAnswerFromPaper('Stem here (Ans. C)')
assert.equal(parenAns.correctIndex, 2, '(Ans. C)')

const intAns = detectAnswerFromPaper('Ans: 42')
assert.equal(intAns.correctInteger, 42)

const msqAns = detectAnswerFromPaper('Answer: A, C')
assert.deepEqual(msqAns.correctIndices, [0, 2])

const sol = detectSolutionFromPaper(`Q. Find x
Solution: First expand, then cancel.
Hence x = 2
Answer: A`)
assert.ok(sol.solution?.includes('expand'), 'solution from paper')
assert.equal(sol.solutionSource, 'from_paper')

// —— Local AI solve (trivial only) ——
const ai = tryAiSolveMcq({
  text: 'What is 2+2?',
  options: ['3', '4', '5', '6'],
})
assert.ok(ai, 'AI solves 2+2')
assert.equal(ai.correctIndex, 1)
assert.equal(ai.answerSource, 'ai_generated')
assert.ok(ai.solution?.includes('4'))

const hard = tryAiSolveMcq({
  text: 'If $f(x)=x^2$ on $\\mathbb{R}$, which is true?',
  options: ['injective', 'surjective', 'bijective', 'none'],
})
assert.equal(hard, null, 'no invented hard answers')

// —— Enrich + badges ——
const enriched = enrichParsedWithAnswerProvenance(
  {
    text: 'What is 3+5?',
    options: ['7', '8', '9', '10'],
  },
  'What is 3+5?\n(A) 7\n(B) 8\n(C) 9\n(D) 10\nAnswer: B\nSolution: Add the integers.',
)
assert.equal(enriched.correctIndex, 1)
assert.equal(enriched.answerSource, 'from_paper')
assert.ok(String(enriched.solution).includes('Add') || String(enriched.solution).includes('integer'))
assert.equal(answerSourceBadgeLabel('from_paper'), 'From paper')
assert.equal(answerSourceBadgeLabel('ai_generated'), 'AI-generated')
assert.equal(answerSourceBadgeLabel('draft'), 'Draft')

const deepDraft = generateSolutionDraft({
  text: 'If $f$ is even, pick the right option.',
  options: ['odd only', 'even', 'neither', 'both'],
  correctIndex: 1,
  answerSource: 'from_paper',
})
assert.ok(
  String(deepDraft.solution).includes('Correct') || String(deepDraft.solution).includes('Answer'),
  'deep draft names the answer',
)
assert.ok(
  String(deepDraft.solution).includes('Quick eliminations') ||
    String(deepDraft.solution).includes('(A)'),
  'mentions wrong options briefly',
)
assert.doesNotMatch(
  String(deepDraft.solution),
  /What is asked|Read the stem once|Work it out/,
  'not essay-style instructions',
)

// —— Bulk / single parse keeps answer + provenance ——
const bulk = parseBulkQuestions(`Q1. What is 2+2?
(A) 3
(B) 4
(C) 5
(D) 6
Answer: B
Solution: Basic addition.

Q2. Value of pi approx?
(A) 3.14
(B) 2
(C) 1
(D) 0
Answer: A`)
assert.equal(bulk.length, 2)
assert.equal(bulk[0].correctIndex, 1)
assert.equal(bulk[0].answerSource, 'from_paper')
assert.ok(bulk[0].solution)

const single = parseSingleQuestionUpload(`Find 10-3.
(A) 5
(B) 6
(C) 7
(D) 8
Ans: C`)
assert.equal(single.multi, false)
assert.equal(single.correctIndex, 2)
assert.equal(single.answerSource, 'from_paper')

// —— Field confidence ——
const conf = scoreUploadFieldConfidence({
  text: 'Short?',
  options: ['a', '', '', ''],
  answerSource: 'unknown',
})
assert.ok(conf.needsManualCheck, 'low quality flagged')
assert.ok(conf.lowConfidenceFields.includes('answer') || conf.lowConfidenceFields.includes('stem'))
assert.ok(formatFieldConfidenceHint(conf).length > 0)

const good = scoreUploadFieldConfidence({
  text: 'Which of the following is correct for $f(x)=x^2$? Choose carefully.',
  options: ['even', 'odd', 'neither', 'both'],
  correctIndex: 0,
  answerSource: 'from_paper',
  answerConfidence: 94,
  solution: 'Even because f(-x)=f(x) for all x.',
  solutionConfidence: 88,
  uploadQualityScore: 85,
})
assert.ok(good.overall >= 55)
assert.ok(!good.lowConfidenceFields.includes('answer'))

assert.equal(knownConfidenceScore(undefined), null)
assert.equal(knownConfidenceScore(0), null)
assert.equal(knownConfidenceScore(100), 100)
assert.equal(knownConfidenceScore(72), 72)
assert.equal(knownConfidenceScore(0.81), 81)
assert.equal(formatEverydayConfidenceLabel('stem', 72), 'Question 72%')
assert.equal(formatEverydayConfidenceLabel('options', null), 'Options not scored')
assert.equal(formatEverydayConfidenceLabel('solution', 55), 'Solution 55%')

const geminiBlank = resolveQuestionFieldConfidence({
  text: 'A long generated stem about limits and continuity for JEE Advanced.',
  options: ['A', 'B', 'C', 'D'],
  correctIndex: 0,
  solution: 'Because the function is continuous at the point.',
})
assert.equal(geminiBlank.fields.stem, null, 'Gemini draft without scores is not faked')
assert.equal(geminiBlank.fields.options, null)
assert.equal(geminiBlank.fields.solution, null)
assert.equal(geminiBlank.overall, null)
assert.equal(compactConfidenceBadge(geminiBlank), 'not scored')
assert.equal(Object.keys(buildConfidencePersistFields(null, geminiBlank)).length, 0)

const geminiGen = resolveQuestionFieldConfidence({
  text: 'Generated stem',
  options: ['A', 'B', 'C', 'D'],
  generationConfidence: 81,
})
assert.equal(geminiGen.overall, 81)
assert.equal(geminiGen.generation, 81)
assert.equal(geminiGen.fields.stem, null, 'generation score is not copied onto Question')
assert.equal(compactConfidenceBadge(geminiGen), '81%')

const storedSnap = resolveQuestionFieldConfidence({
  fieldConfidence: {
    overall: 70,
    fields: { stem: 72, options: 80, answer: 90, solution: 55, meta: 64 },
    optionScores: [82, 78, null, 80],
  },
})
assert.equal(storedSnap.fields.stem, 72)
assert.equal(storedSnap.fields.options, 80)
assert.equal(storedSnap.fields.answer, 90)
assert.equal(storedSnap.fields.solution, 55)
assert.equal(storedSnap.fields.meta, 64)
assert.deepEqual(storedSnap.optionScores, [82, 78, null, 80])

const ocrLegacy = resolveQuestionFieldConfidence({
  uploadFieldConfidence: 67,
  answerConfidence: 94,
  solutionConfidence: 88,
  text: 'Which of the following is correct for $f(x)=x^2$? Choose carefully.',
  options: ['even', 'odd', 'neither', 'both'],
  correctIndex: 0,
  answerSource: 'from_paper',
  solution: 'Even because f(-x)=f(x) for all x.',
})
assert.equal(ocrLegacy.overall, 67)
assert.equal(ocrLegacy.fields.answer, 94)
assert.equal(ocrLegacy.fields.solution, 88)
assert.ok(ocrLegacy.fields.stem != null, 'legacy OCR overall rebuilds Question %')
assert.ok(ocrLegacy.fields.options != null)

const restored = restoreFieldConfidenceState({
  fieldConfidence: { overall: 70, fields: { stem: 72, options: 80 } },
})
assert.equal(restored.fields.stem, 72)
assert.equal(restoreFieldConfidenceState({ text: 'manual compose' }), null)

const persistLive = buildConfidencePersistFields({
  overall: 67,
  fields: { stem: 72, options: 80, answer: 90, solution: 55 },
  needsManualCheck: false,
  lowConfidenceFields: [],
})
assert.equal(persistLive.uploadFieldConfidence, 67)
assert.equal(persistLive.answerConfidence, 90)
assert.equal(persistLive.fieldConfidence.fields.stem, 72)

const persistGenOnly = buildConfidencePersistFields(
  { overall: 81, fields: {}, generation: 81, needsManualCheck: false },
  {},
)
assert.equal(persistGenOnly.generationConfidence, 81)
assert.equal(persistGenOnly.uploadFieldConfidence, undefined, 'do not stamp generation as OCR overall')

// —— Deskew helper (no DOM ImageData in node — synthetic) ——
const w = 40
const h = 40
const data = new Uint8ClampedArray(w * h * 4)
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4
    const ink = y % 8 < 2 && x > 4 && x < 36
    const v = ink ? 40 : 240
    data[i] = data[i + 1] = data[i + 2] = v
    data[i + 3] = 255
  }
}
const angle = estimateSkewAngleDegrees({ data, width: w, height: h })
assert.ok(typeof angle === 'number')
assert.ok(Math.abs(angle) <= 12)

// —— Matrix codes from paper ——
const mtxKey = detectMatrixAnswerKeyFromPaper(`Match the Column
Column I
(A) foo
(B) bar
(C) baz
(D) qux
Column II
(P) 1
(Q) 2
(R) 3
(S) 4
Codes:
A → P, Q
B → R
C → S
D → P`)
assert.ok(mtxKey, 'matrix codes detected')
assert.deepEqual(mtxKey.matrixAnswerKey[0], [0, 1])
assert.deepEqual(mtxKey.matrixAnswerKey[1], [2])
assert.equal(mtxKey.answerSource, 'from_paper')

const noFalseMtx = detectMatrixAnswerKeyFromPaper(`Match the Column
(A) If f(x)=x-1 then
(B) If g(x)=x-2 then
Column II
(P) 1
(Q) 2`)
assert.equal(noFalseMtx, null, 'Column-I algebra must not become answer codes')

// —— Passage sub: no empty-A default ——
const emptyA = enrichPassageSubQuestion(
  { text: 'Value of x is', options: ['', '2', '3', '4'] },
  'Value of x is\n(A)\n(B) 2\n(C) 3\n(D) 4',
)
assert.equal(emptyA.correctIndex, undefined, 'must not default empty A as correct')

const paperPass = enrichPassageSubQuestion(
  { text: 'Value of x is', options: ['1', '2', '3', '4'] },
  'Value of x is\n(A) 1\n(B) 2\n(C) 3\n(D) 4\nAnswer: C',
)
assert.equal(paperPass.correctIndex, 2, 'passage sub picks Answer: C from paper')

// —— Drop bogus correctIndex 0 on empty A ——
const stripped = enrichParsedWithAnswerProvenance(
  { text: 'Graph question', options: ['', '', '', ''], correctIndex: 0 },
  'Graph question\n(A)\n(B)\n(C)\n(D)',
)
assert.equal(stripped.correctIndex, undefined, 'strip empty-A default on enrich')

console.log('test-answer-provenance: ok')
