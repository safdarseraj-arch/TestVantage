import assert from 'node:assert/strict'
import { migrateStoredQuestionText } from '../src/utils/migrateStoredQuestions.js'
import { healStoredMcqQuestion } from '../src/utils/healStoredMcq.js'
import { ALPHA_BETA_DET_STEM } from '../src/utils/repairAlphaBetaRootsDeterminantMcqOcr.js'
import {
  BINOMIAL_LOG495_STEM,
  BINOMIAL_LOG495_OPTION_LIST,
} from '../src/utils/repairBinomialLog495StemOcr.js'

const alphaBetaPartial = {
  questionType: 'single_correct',
  text: ALPHA_BETA_DET_STEM,
  options: ['125', '', '', ''],
}

const healed = healStoredMcqQuestion(alphaBetaPartial)
assert.deepEqual(healed.options, ['125', '64', '25', '16'], 'fills B C D from known stem')

const migrated = migrateStoredQuestionText(alphaBetaPartial)
assert.deepEqual(migrated.options, ['125', '64', '25', '16'], 'migrate pipeline heals partial MCQ')

const z5Partial = {
  questionType: 'single_correct',
  text: 'Let $\\alpha, \\beta, \\gamma, \\delta$ are distinct imaginary roots of $z^5 = 1$, then value of $$\\begin{vmatrix} e^\\alpha & e^{2\\alpha} & e^{3\\alpha+1} - e^{-\\delta} \\\\ e^\\beta & e^{2\\beta} & e^{3\\beta+1} - e^{-\\delta} \\\\ e^\\gamma & e^{2\\gamma} & e^{3\\gamma+1} - e^{-\\delta} \\end{vmatrix}$$ is',
  options: ['0', '', '', ''],
}
const healedZ5 = healStoredMcqQuestion(z5Partial)
assert.equal(healedZ5.options.filter((o) => String(o).trim()).length, 4, 'z5 partial options filled')

const binomialMisaligned = {
  questionType: 'single_correct',
  text: BINOMIAL_LOG495_STEM,
  options: ['', 'a fraction', 'An integer greater than $n^1$', 'an irrational number'],
}
const healedBinomial = healStoredMcqQuestion(binomialMisaligned)
assert.deepEqual(healedBinomial.options, BINOMIAL_LOG495_OPTION_LIST, 'binomial log495 fixes A and B/C order')
assert.equal(healedBinomial.options[0], '1', 'option A is 1')

const migratedBinomial = migrateStoredQuestionText(binomialMisaligned)
assert.deepEqual(migratedBinomial.options, BINOMIAL_LOG495_OPTION_LIST, 'migrate fixes binomial options')

console.log('test-heal-stored-mcq: ok')
