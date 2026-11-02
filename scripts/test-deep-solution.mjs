/**
 * Deep step-by-step solution drafts (local, no API keys).
 */
import assert from 'node:assert/strict'
import {
  generateDeepSolutionLocal,
  generateDeepSolution,
  solutionSourceBadgeLabel,
} from '../src/utils/deepSolutionGenerator.js'
import {
  generateSolutionDraft,
  enrichParsedWithAnswerProvenance,
  solutionBadgeLabel,
} from '../src/utils/answerProvenance.js'
import { isPptxFile } from '../src/utils/pptExtract.js'

assert.equal(solutionSourceBadgeLabel('ai_generated'), 'AI solution')
assert.equal(solutionSourceBadgeLabel('draft'), 'Draft')
assert.equal(solutionBadgeLabel('draft'), 'Draft')
assert.equal(solutionBadgeLabel('ai_generated'), 'AI solution')
assert.equal(solutionBadgeLabel('from_paper'), 'From paper')

const deep = generateDeepSolutionLocal({
  text: 'If $f(x)=x^2$, which is true?',
  options: ['odd', 'even', 'neither', 'both'],
  correctIndex: 1,
  answerSource: 'from_paper',
})
assert.ok(deep.solution?.includes('Correct'))
assert.ok(deep.solution?.includes('Quick eliminations') || deep.solution?.includes('Answer'))
assert.doesNotMatch(deep.solution ?? '', /What is asked|Read the stem once|Work it out/i)
assert.equal(deep.solutionSource, 'draft')
assert.equal(deep.quality, 'deep')

const draft = generateSolutionDraft({
  text: 'If $f(x)=x^2$, which is true?',
  options: ['odd', 'even', 'neither', 'both'],
  correctIndex: 1,
  answerSource: 'from_paper',
})
assert.ok(String(draft.solution).includes('Correct'))
assert.ok(['draft', 'from_paper', 'ai_generated'].includes(draft.solutionSource))

const enriched = enrichParsedWithAnswerProvenance(
  {
    text: 'What is 9-3?',
    options: ['5', '6', '7', '8'],
  },
  'What is 9-3?\n(A) 5\n(B) 6\n(C) 7\n(D) 8\nAnswer: B',
)
assert.equal(enriched.correctIndex, 1)
assert.ok(String(enriched.solution).length > 40)

const cloudish = await generateDeepSolution(
  {
    text: 'Pick even',
    options: ['1', '2', '3', '4'],
    correctIndex: 1,
    answerSource: 'from_paper',
  },
  {
    force: true,
    solveCloud: async () => ({
      solution: '**Step 1** Even integers.\n**Correct:** (B) 2',
      provider: 'mock',
      solutionConfidence: 80,
    }),
  },
)
assert.equal(cloudish.quality, 'cloud')
assert.equal(cloudish.solutionSource, 'ai_generated')
assert.ok(cloudish.solution.includes('Correct'))

const fallback = await generateDeepSolution(
  {
    text: 'Pick even',
    options: ['1', '2', '3', '4'],
    correctIndex: 1,
    answerSource: 'ai_generated',
  },
  {
    force: true,
    solveCloud: async () => {
      throw new Error('no key')
    },
  },
)
assert.ok(fallback.solution?.includes('Correct') || fallback.solution?.includes('Answer'))
assert.equal(fallback.solutionSource, 'draft')
assert.doesNotMatch(fallback.solution ?? '', /What is asked|Read the stem once/i)

assert.equal(isPptxFile({ name: 'q.pptx', type: '' }), true)
assert.equal(isPptxFile({ name: 'q.docx', type: '' }), false)

console.log('test-deep-solution: ok')
