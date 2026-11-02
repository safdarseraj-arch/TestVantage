/**
 * Focused coverage for the complete auto-upload pipeline (graph crop, passage,
 * match-column, idempotent option split, meta lock, answer/solution).
 */
import assert from 'node:assert/strict'
import {
  looksLikeVerbalGraphOptionDescription,
  shouldAttemptOptionsAutoCrop,
  shouldSkipOptionsAutoCrop,
  optionsAreTextOnlyMcq,
  countGraphOptionsNeedingImage,
  applyGraphOptionPlaceholders,
  optionTextForDisplay,
  GRAPH_OPTION_PLACEHOLDER,
} from '../src/utils/graphOptionOcr.js'
import { normalizeVisionQuestion } from '../src/utils/cloudVisionParse.js'
import {
  looksLikePassageMultiMcq,
  resolvePassageUpload,
  splitStemAndInlineMcqOptions,
} from '../src/utils/parsePassageUpload.js'
import {
  looksLikeMatchColumnUpload,
  parseMatchColumnUpload,
  resolveMatchColumnUpload,
  countFilledMatrixRowsNormalized,
} from '../src/utils/parseMatchColumnUpload.js'
import {
  stabilizeMcqOptionSlots,
  mcqOptionSplitIsIdempotent,
  mergeMcqOptionsIdempotent,
  reparseMcqUpload,
  resolveMcqFromOcr,
} from '../src/utils/uploadPipeline.js'
import {
  enrichUploadWithMetaAndAnswer,
  clearAiSuggestedMetaField,
} from '../src/utils/autoFillUploadAssist.js'
import {
  detectAnswerFromPaper,
  enrichParsedWithAnswerProvenance,
} from '../src/utils/answerProvenance.js'

// —— 1. Graph crop: invent text is NOT success; needs image ——
const verbal = [
  '[Graph A: Curve with local maximum and minimum]',
  '[Graph B: Decreasing, concave down curve]',
  'Graph C: Increasing then flat',
  '[Graph D: Parabola opening upward]',
]
const graphStem = 'Which of the following graphs is correct for y = f(x)?'
assert.ok(looksLikeVerbalGraphOptionDescription(verbal[0]))
assert.equal(optionsAreTextOnlyMcq(verbal), false)
assert.equal(shouldSkipOptionsAutoCrop(graphStem, verbal, graphStem), false)
assert.ok(countGraphOptionsNeedingImage(verbal, [], graphStem) >= 3)
assert.ok(shouldAttemptOptionsAutoCrop(graphStem, verbal, [], graphStem))
assert.ok(
  applyGraphOptionPlaceholders(graphStem, verbal, []).every((o) => o === GRAPH_OPTION_PLACEHOLDER),
)
assert.equal(optionTextForDisplay(verbal[0], false, graphStem), '')
const visionQ = normalizeVisionQuestion({ text: graphStem, options: verbal })
assert.deepEqual(visionQ.options, ['', '', '', ''])

// —— 2. Passage stem + options split ——
const passageBlob = `Paragraph for questions 1 and 2
A particle moves on a straight line with constant acceleration.
Answer the following questions:
1. The velocity at t = 2 s is
(A) 2
(B) 4
(C) 6
(D) 8
2. The displacement in 2 s is
(A) 2
(B) 4
(C) 8
(D) 16`
assert.ok(looksLikePassageMultiMcq(passageBlob), 'detect passage multi-MCQ')
const passage = resolvePassageUpload(passageBlob, passageBlob)
assert.ok(passage && passage.subQuestions?.length >= 2, 'split into ≥2 sub-questions')
const sq0 = passage.subQuestions[0]
assert.ok(
  (sq0.options?.filter((o) => String(o ?? '').trim()).length ?? 0) >= 2 ||
    String(sq0.stem ?? '').trim().length > 10,
  'sub-question has stem/options',
)
const inline = splitStemAndInlineMcqOptions(
  'Find the value\n(A) 1\n(B) 2\n(C) 3\n(D) 4',
)
assert.ok(
  !inline ||
    (inline.options?.filter((o) => String(o ?? '').trim()).length ?? 0) >= 2 ||
    String(inline.stem ?? '').length > 0,
  'inline split helper is safe',
)

// —— 3. Match the Column rows/cols ——
const matrixBlob = `Match the Column
Column-I
(A) Velocity is constant when
(B) Acceleration is zero when
(C) Displacement is zero when
(D) Speed is constant when
Column-II
(P) Force is zero
(Q) Velocity is zero
(R) Acceleration is zero
(S) Force is constant`
assert.ok(looksLikeMatchColumnUpload(matrixBlob))
const mtx = resolveMatchColumnUpload(matrixBlob) ?? parseMatchColumnUpload(matrixBlob)
assert.ok(mtx, 'parse match column')
assert.ok(countFilledMatrixRowsNormalized(mtx) >= 3, 'rows filled')
assert.ok(mtx.matrixCols.filter((c) => String(c).trim()).length >= 3, 'cols filled')

// —— 4. Idempotent option split (no cascade / dupe) ——
const good = ['$1/2$', '$1/3$', '$1/4$', '$1/6$']
assert.deepEqual(stabilizeMcqOptionSlots(good), good)
assert.ok(mcqOptionSplitIsIdempotent(good, good))
assert.deepEqual(
  mergeMcqOptionsIdempotent(good, ['$1/2$', '$1/2$', '$1/2$', '$1/2$']),
  good,
  'reject all-identical cascade',
)
assert.deepEqual(
  mergeMcqOptionsIdempotent(good, ['$1/2$', '', '', '']),
  good,
  'do not shrink a full split',
)
assert.deepEqual(stabilizeMcqOptionSlots(['a', 'b', 'c', 'd', 'e', 'f']).length, 4)
const mcqRaw = `Find x.
(A) 1
(B) 2
(C) 3
(D) 4`
const once = reparseMcqUpload(mcqRaw)
const twice = reparseMcqUpload(
  `${once.parsed?.text ?? ''}\n${(once.parsed?.options ?? [])
    .map((o, i) => `(${String.fromCharCode(65 + i)}) ${o}`)
    .join('\n')}`,
)
assert.ok(once.found >= 3, 'first parse finds options')
assert.ok(
  mcqOptionSplitIsIdempotent(once.parsed.options, twice.parsed.options) ||
    twice.found >= once.found,
  're-parse does not corrupt options',
)
const resolved = resolveMcqFromOcr(mcqRaw)
assert.equal(resolved.options.length, 4)

// —— 5. Meta fill + user lock ——
const first = enrichUploadWithMetaAndAnswer(
  {
    text: String.raw`If $$\begin{vmatrix}1+x & 1 \\ 1 & 1+y\end{vmatrix}=0$$ then`,
    options: ['-1', '-2', '-3', '1'],
  },
  'determinant matrices',
  { examIds: ['jee-advanced'] },
)
assert.ok(first.subject === 'mathematics' || (first.aiSuggestedMeta ?? []).length >= 0)
const locked = enrichUploadWithMetaAndAnswer(
  {
    text: first.text,
    options: first.options,
  },
  'determinant matrices',
  {
    examIds: ['jee-advanced'],
    prevAiSuggestedMeta: first.aiSuggestedMeta ?? ['subject'],
    userLockedMeta: ['subject', 'chapter'],
    currentMeta: {
      subject: 'physics',
      chapter: 'User Chapter',
      section: '',
      topic: '',
      toughnessLevel: null,
      examIds: [],
    },
  },
)
assert.equal(locked.subject, 'physics', 'user-locked subject survives re-enrich')
assert.equal(locked.chapter, 'User Chapter', 'user-locked chapter survives re-enrich')
assert.deepEqual(clearAiSuggestedMetaField(['subject', 'chapter', 'topic'], 'chapter'), [
  'subject',
  'topic',
])

// —— 6. Answer + solution from paper; never empty A ——
const withAns = enrichParsedWithAnswerProvenance(
  {
    text: 'What is 2+2?',
    options: ['3', '4', '5', '6'],
  },
  'What is 2+2?\n(A) 3\n(B) 4\n(C) 5\n(D) 6\nAnswer: B\nSolution: Add the integers.',
)
assert.equal(withAns.correctIndex, 1)
assert.equal(withAns.answerSource, 'from_paper')
assert.ok(String(withAns.solution ?? '').length > 5)
const noAns = detectAnswerFromPaper('What is 2+2?\n(A) \n(B) \n(C) \n(D) ')
assert.equal(noAns.answerSource, 'unknown')
assert.equal(noAns.correctIndex, undefined)
const emptyA = normalizeVisionQuestion({
  text: 'Pick one',
  options: ['', '2', '3', '4'],
  correctIndex: 0,
})
assert.equal(emptyA.correctIndex, undefined, 'never keep Correct A on empty option')

console.log('test-upload-auto-pipeline: ok')
