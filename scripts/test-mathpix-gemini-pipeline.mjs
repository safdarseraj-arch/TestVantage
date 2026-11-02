/**
 * Gemini structure mapping after Mathpix OCR -> question-bank drafts.
 * No live API. Does not touch the stored question bank.
 */
import assert from 'node:assert/strict'
import {
  geminiStructuredItemToBankDraft,
  geminiStructureToBankDrafts,
  normalizeQuestionType,
  normalizeSubject,
} from '../src/utils/mathpixGeminiMap.js'
import { GEMINI_STRUCTURE_TIMEOUT_MS } from '../src/utils/mathpixGeminiPipeline.js'
import {
  consumeBankMathpixExtractResult,
  isGarbageRawLatexCard,
} from '../src/utils/bankMathpixUpload.js'
import {
  geminiStructureFailedSplit,
  mathpixSplitToBankDrafts,
} from '../src/utils/mathpixQuestionSplit.js'
import { raceStepTimeout } from '../src/utils/ocrTimeout.js'

assert.equal(normalizeQuestionType('scq'), 'single_correct')
assert.equal(normalizeQuestionType('msq'), 'multiple_correct')
assert.equal(normalizeSubject('maths'), 'mathematics')

const parsed = {
  instructions: 'Section A contains 6 questions.',
  questions: [
    {
      number: 1,
      text: 'The value of $2+2$ is',
      options: ['3', '4', '5', '6'],
      questionType: 'single_correct',
      correctIndex: 1,
      solution: '$2+2=4$',
      subject: 'mathematics',
      section: 'Algebra',
      chapter: 'Numbers',
      topic: 'Addition',
      examIds: ['jee-advanced'],
      pyqYear: 2024,
      paperLabel: 'Paper 1',
      toughnessLevel: 3,
      marks: 3,
      marking: { correct: 3, wrong: -1, unattempted: 0 },
    },
    {
      text: '',
      options: ['', '', '', ''],
    },
  ],
}

const emptyStem = geminiStructuredItemToBankDraft(parsed.questions[1])
assert.equal(emptyStem, null, 'instruction-like empty item dropped when no stem text')

const row = geminiStructuredItemToBankDraft(parsed.questions[0], {
  paperMeta: { exam: 'jee-advanced', year: 2024 },
  instructionText: parsed.instructions,
  index: 0,
})
assert.ok(row)
assert.equal(row.bankStatus, 'draft')
assert.equal(row.questionType, 'single_correct')
assert.equal(row.subject, 'mathematics')
assert.equal(row.section, 'Algebra')
assert.equal(row.chapter, 'Numbers')
assert.equal(row.correctIndex, 1)
assert.match(row.solution, /2\+2/)
assert.equal(row.examPatternId, 'jee-advanced')
assert.equal(row.pyqYear, 2024)
assert.equal(row.marking.correct, 3)
assert.equal(row.instructions, 'Section A contains 6 questions.')
assert.equal(row.ocrEngine, 'mathpix')

const { drafts, instructionText } = geminiStructureToBankDrafts(parsed, {
  paperMeta: { examPatternId: 'jee-advanced' },
})
assert.equal(drafts.length, 1)
assert.equal(instructionText, 'Section A contains 6 questions.')
assert.equal(drafts[0].bankStatus, 'draft')

const mathpixDump = `
\\item[Q.] 1 Let $x=1$. Then $x+1$ is
(A) $1$
(B) $2$
(C) $3$
(D) $4$
\\item[Q.] 2 The order of the reaction is
(A) $0$
(B) $1$
(C) $2$
(D) $3$
`
assert.equal(geminiStructureFailedSplit(1, mathpixDump), true)
const backup = mathpixSplitToBankDrafts(mathpixDump)
assert.ok(backup.drafts.length >= 2, `backup split got ${backup.drafts.length}`)
assert.equal(isGarbageRawLatexCard(backup.drafts, mathpixDump), false)
assert.equal(isGarbageRawLatexCard([{ text: mathpixDump, options: ['', '', '', ''] }], mathpixDump), true)

let openedDrafts = false
assert.equal(
  consumeBankMathpixExtractResult(
    {
      savedDrafts: [{ id: 'MAQS00001' }, { id: 'MAQS00002' }],
      engine: 'mathpix',
      cloudNote: 'Gemini filled 2 question(s) from Mathpix text.',
    },
    { openDrafts: () => { openedDrafts = true } },
  ),
  true,
)
assert.equal(openedDrafts, true)
assert.equal(
  consumeBankMathpixExtractResult(
    { savedDrafts: [], questions: [], engine: 'mathpix', cloudNote: 'Nothing was saved.' },
    {},
  ),
  true,
)

assert.ok(GEMINI_STRUCTURE_TIMEOUT_MS <= 15_000, 'official Gemini split must fail fast')

const hung = new Promise(() => {})
await assert.rejects(
  () => raceStepTimeout(hung, 30, 'Gemini split timed out after 0 seconds.', 'GEMINI_STRUCTURE_TIMEOUT'),
  (err) => err?.code === 'GEMINI_STRUCTURE_TIMEOUT',
)
const quick = await raceStepTimeout(Promise.resolve('ok'), 200, 'should not fire')
assert.equal(quick, 'ok')

const { diagnoseLocalUploadSplit, localBankSplitGoodEnough, mergeLightEnrichOntoDrafts, GEMINI_LIGHT_MODEL } = await import(
  '../src/utils/uploadLocalFirstPipeline.js'
)
assert.equal(GEMINI_LIGHT_MODEL, 'gemini-3.5-flash-lite')
const twoClean = [
  { text: 'Let $a=1$. Then $x$ is', options: ['1', '2', '3', '4'] },
  { text: 'Let $b=2$. Then $y$ is', options: ['1', '2', '3', '4'] },
]
const twoOcr = `Q.1 Let $a=1$. Then $x$ is
(A) 1
(B) 2
(C) 3
(D) 4
Q.2 Let $b=2$. Then $y$ is
(A) 1
(B) 2
(C) 3
(D) 4`
assert.equal(localBankSplitGoodEnough(twoClean, twoOcr), true)
assert.equal(diagnoseLocalUploadSplit(twoClean, twoOcr).ok, true)
assert.ok(
  diagnoseLocalUploadSplit(
    [{ text: 'Let $x=1$. Then the value is $$', options: ['1', '2', '3', '4'] }],
    'Let $x=1$. Then the value is $$',
  ).reasons.includes('incomplete-stem'),
)

const stemKeep = 'Keep this stem $$x^2$$ and the figure \\includegraphics{a.png}'
const mergedLite = mergeLightEnrichOntoDrafts(
  [
    {
      text: stemKeep,
      options: ['1', '2', '3', '4'],
      chapter: 'General',
      correctIndex: null,
    },
  ],
  [
    {
      i: 0,
      subject: 'mathematics',
      chapter: 'Quadratic Equations',
      correctIndex: 1,
      solution: 'Square both sides. Answer is B.',
    },
  ],
)
assert.equal(mergedLite[0].text, stemKeep, 'light Gemini must not rewrite the stem')
assert.equal(mergedLite[0].options[0], '1')
assert.equal(mergedLite[0].subject, 'mathematics')
assert.equal(mergedLite[0].chapter, 'Quadratic Equations')
assert.equal(mergedLite[0].correctIndex, 1)
assert.match(mergedLite[0].solution, /Square both sides/)
const skippedSol = mergeLightEnrichOntoDrafts(
  [{ text: stemKeep, options: ['1', '2', '3', '4'] }],
  [{ i: 0, solution: 'Should not apply' }],
  { deferSolutions: true },
)
assert.equal(skippedSol[0].solution, undefined)

console.log('test-mathpix-gemini-pipeline: structure maps to bank drafts; 1 blob is failure')
