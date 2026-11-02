/**
 * OCR repair for finite lim f(x) + (3f-1)/f^2 = 3 MCQ.
 */
import assert from 'node:assert/strict'
import {
  looksLikeFxLimitFiniteMcq,
  repairFxLimitFiniteStemOcr,
  repairFxLimitFiniteMcqParse,
  FX_LIMIT_FINITE_STEM,
  FX_LIMIT_FINITE_SOLUTION,
} from '../src/utils/repairFxLimitFiniteMcqOcr.js'
import { polishMcqOptionBody } from '../src/utils/polishMcqOptionBody.js'
import { generateDeepSolutionLocal } from '../src/utils/deepSolutionGenerator.js'

const garbled =
  'If lim f(x) exists and is finite and non-zero and lim J PEA i =3, then the value of /im $f(x)$ is equal to: 3 -1\n' +
  '(A) 1\n(B) -1\n(C) 2 \u00AED) None of these\n(D) (Graph/diagram)'

assert.ok(looksLikeFxLimitFiniteMcq(garbled), 'detect fx limit finite MCQ')

const repaired = repairFxLimitFiniteStemOcr(garbled)
assert.match(repaired, /\\lim_\{x\s*\\to\s*\\infty\}/, 'rebuilds lim')
assert.match(repaired, /\\frac\{3f\(x\)\s*-\s*1\}/, 'inner fraction')
assert.doesNotMatch(repaired, /J\s*PEA|\/im/i, 'removes OCR soup')

const parsed = repairFxLimitFiniteMcqParse({
  text: garbled,
  options: ['1', '-1', '2 \u00AED) None of these', '(Graph/diagram)'],
  optionsFound: 4,
})
assert.match(parsed.text ?? '', /\\frac\{3f\(x\)/, 'parse stem fixed')
assert.equal(parsed.options?.[0], '1')
assert.equal(parsed.options?.[1], '-1')
assert.equal(parsed.options?.[2], '2')
assert.match(parsed.options?.[3] ?? '', /None of these/i)
assert.equal(parsed.correctIndex, 0)
assert.match(parsed.solution ?? '', /Correct:\*\*\s*\(A\)/)
assert.doesNotMatch(parsed.solution ?? '', /What is asked|Work it out/i)

assert.equal(polishMcqOptionBody('2 \u00AED) None of these', 'C'), '2')
assert.equal(polishMcqOptionBody('2 (D) None of these', 'C'), '2')

const localDraft = generateDeepSolutionLocal({
  text: 'If lim J PEA i =3 /im $f(x)$',
  options: ['1', '-1', '2 \u00AED) None of these', ''],
  correctIndex: 2,
})
assert.equal(localDraft.quality, 'none')
assert.ok(!localDraft.solution)

const goodDraft = generateDeepSolutionLocal({
  text: FX_LIMIT_FINITE_STEM,
  options: ['1', '-1', '2', 'None of these'],
  correctIndex: 0,
  answerSource: 'from_paper',
})
assert.ok(goodDraft.solution?.includes('Step 1'))
assert.ok(goodDraft.solution?.includes('(L-1)'))
assert.match(goodDraft.solution ?? '', /Correct:\*\*\s*\(A\)/)
assert.doesNotMatch(goodDraft.solution ?? '', /What is asked|Read the stem once|\*\*Answer\.\*\* \(A\)/)

const minimalUpgrade = generateDeepSolutionLocal({
  text: FX_LIMIT_FINITE_STEM,
  options: ['1', '-1', '2', 'None of these'],
  correctIndex: 0,
  existingSolution: '**Answer.** (A) 1\n\n**Quick eliminations:**\n- **(B)** -1',
})
assert.ok(minimalUpgrade.solution?.includes('Step 1'), 'minimal draft upgraded to full steps')

assert.match(FX_LIMIT_FINITE_SOLUTION(), /\(L-1\)\^\{3\}/)

console.log('test-fx-limit-finite-ocr: ok')
