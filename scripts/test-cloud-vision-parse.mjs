/**
 * Unit tests for cloud-vision JSON parsers (no live API keys).
 */
import assert from 'node:assert/strict'
import {
  normalizeVisionExtract,
  normalizeVisionSolve,
  formatVisionQuestionsAsBulkText,
  scoreLocalOcrWeakness,
  localOcrNeedsCloudAssist,
  parseVisionJsonLoose,
  isUltraLowConfidenceOcr,
  looksLikeMathHeavyOcr,
  normalizeVisionQuestion,
} from '../src/utils/cloudVisionParse.js'
import { ocrEngineBadgeLabel, shouldAttemptCloudVision } from '../src/utils/cloudVisionClient.js'
import { parseBulkQuestions } from '../src/utils/parseBulkQuestions.js'
import { getVisionStatus } from '../server/vision.js'

// —— Loose JSON ——
const fenced = parseVisionJsonLoose('```json\n{"text":"hi","questions":[]}\n```')
assert.equal(fenced.text, 'hi')
const trailing = parseVisionJsonLoose('{"text":"ok","questions":[]}\n}')
assert.equal(trailing.text, 'ok', 'must tolerate trailing brace garbage from Gemini')

// —— Extract normalize + multi-Q bulk text ——
const extract = normalizeVisionExtract({
  pageKind: 'dense_page',
  questions: [
    {
      number: 1,
      text: 'What is $2+2$?',
      options: ['3', '4', '5', '6'],
      correctIndex: 1,
      solution: 'Add integers.',
    },
    {
      number: 2,
      text: 'Value of $\\pi$ approx?',
      options: ['3.14', '2', '1', '0'],
      correctIndex: 0,
    },
  ],
})
assert.equal(extract.multi, true)
assert.equal(extract.questions.length, 2)
assert.ok(extract.text.includes('Q1.'))
assert.ok(extract.text.includes('Q2.'))
assert.ok(extract.text.includes('Answer: B'))

const bulk = parseBulkQuestions(formatVisionQuestionsAsBulkText(extract.questions))
assert.equal(bulk.length, 2)
assert.equal(bulk[0].correctIndex, 1)
assert.equal(bulk[0].answerSource, 'from_paper')

// —— Solve normalize ——
const solve = normalizeVisionSolve({
  correctIndex: 1,
  steps: ['Expand', 'Cancel'],
  whyCorrect: 'Matches B',
  whyOthersWrong: [{ option: 'A', reason: 'too small' }],
  solution: '**Correct:** (B)',
})
assert.ok(solve.solution.includes('Why correct'))
assert.ok(solve.solution.includes('Quick eliminations'))
assert.equal(solve.correctIndex, 1)

// —— Weakness scoring ——
assert.ok(scoreLocalOcrWeakness('') >= 90)
assert.ok(localOcrNeedsCloudAssist('??|il|| gibberish'))
assert.ok(!localOcrNeedsCloudAssist(`Q1. Clear stem here?\n(A) 1\n(B) 2\n(C) 3\n(D) 4`))

const garbageDet =
  '~~ 7 Van g¹+ , I+2, 1 = 0, they, het, Is qual ¢, . 1+ - 1+ - 1+3- 4) ~1\n(A) \n(B) \n(C) 3\n(D) '
assert.ok(
  scoreLocalOcrWeakness(garbageDet) >= 40,
  `empty option markers must not hide garbage (got ${scoreLocalOcrWeakness(garbageDet)})`,
)
assert.ok(localOcrNeedsCloudAssist(garbageDet), 'garbage determinant OCR needs cloud')

assert.ok(looksLikeMathHeavyOcr('If |A|=0 then x^{-1}+y^{-1}'))
assert.ok(isUltraLowConfidenceOcr(garbageDet) || scoreLocalOcrWeakness(garbageDet) >= 55)

// Empty correctIndex on empty option A
const emptyCorrect = normalizeVisionQuestion({
  text: 'Stem?',
  options: ['', '', '3', ''],
  correctIndex: 0,
})
assert.equal(emptyCorrect.correctIndex, undefined, 'must not keep CORRECT on empty A')
assert.equal(emptyCorrect.options[2], '3')

// —— Badges / settings gate (no network) ——
assert.equal(ocrEngineBadgeLabel('cloud-vision'), 'AI')
assert.equal(ocrEngineBadgeLabel('builtin'), 'AI')
assert.equal(
  shouldAttemptCloudVision('bad', { useCloudVision: false, preferCloudVision: false }),
  false,
)
assert.equal(
  shouldAttemptCloudVision('bad||||', { useCloudVision: 'auto', preferCloudVision: false }),
  true,
)
assert.equal(
  shouldAttemptCloudVision(garbageDet, { useCloudVision: 'auto', preferCloudVision: false }),
  true,
)

// —— Server status without keys (safe) ——
const prevOpen = process.env.OPENAI_API_KEY
const prevGem = process.env.GEMINI_API_KEY
delete process.env.OPENAI_API_KEY
delete process.env.GEMINI_API_KEY
delete process.env.GOOGLE_API_KEY
delete process.env.GOOGLE_GENERATIVE_AI_API_KEY
const status = getVisionStatus()
assert.equal(status.configured, false)
assert.equal(status.ready, false)
assert.ok(/OPENAI_API_KEY|GEMINI_API_KEY/i.test(status.message))
if (prevOpen != null) process.env.OPENAI_API_KEY = prevOpen
if (prevGem != null) process.env.GEMINI_API_KEY = prevGem

// With keys restored, status should be ready (model may be env override)
{
  const live = getVisionStatus()
  if (live.configured) {
    assert.equal(live.ready, true)
    assert.ok(live.preferred === 'gemini' || live.preferred === 'openai')
    assert.ok(live.model)
  }
}

// —— Dense packed multi-Q split heuristic ——
const dense = parseBulkQuestions(
  `1. If x=1 then y=? (A) 1 (B) 2 (C) 3 (D) 4 2. Let f(x)=x. Which is true? (A) odd (B) even (C) both (D) none Answer: A`,
)
assert.ok(dense.length >= 2, `expected >=2 questions, got ${dense.length}`)

// —— Strip invented graph option descriptions from vision extract ——
const graphQ = normalizeVisionQuestion({
  number: 1,
  text: 'Which graph is correct?',
  options: [
    '[Graph A: Curve with local maximum and minimum]',
    '[Graph B: Decreasing, concave down curve]',
    'Graph C: Increasing then flat',
    '[Graph D: Parabola opening upward]',
  ],
})
assert.ok(graphQ)
assert.deepEqual(
  graphQ.options,
  ['', '', '', ''],
  'vision normalize must clear verbal graph invent so auto-crop can attach images',
)

// —— Guessed Answer A without printed key must drop ——
const guessedA = normalizeVisionQuestion({
  text: 'Pick one?',
  options: ['1', '2', '3', '4'],
  correctIndex: 0,
  answerKeyVisible: false,
})
assert.equal(guessedA.correctIndex, undefined, 'must not keep guessed Answer A')

// —— Printed key + Answer A is kept ——
const keyedA = normalizeVisionQuestion({
  text: 'Pick one?',
  options: ['1', '2', '3', '4'],
  correctIndex: 0,
  answerKeyVisible: true,
})
assert.equal(keyedA.correctIndex, 0)

// —— “does not exist” must survive invent strip ——
const existOpt = normalizeVisionQuestion({
  text: 'Let $f(x)=x$, then :',
  options: [
    '$a$',
    '$b$',
    '$\\lim_{x\\to 0} f(x)$ does not exist',
    '$\\lim_{x\\to 1} f(x)$ does not exist',
  ],
  regionTypes: ['stemText', 'optionText'],
})
assert.match(existOpt.options[2], /does not exist/)
assert.match(existOpt.options[3], /does not exist/)

console.log('test-cloud-vision-parse: ok')
