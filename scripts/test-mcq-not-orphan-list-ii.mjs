/**
 * Plain SCQ options like "(1) 35" must not look like orphan List-II
 * (false "missing List-I" on JEE Main meter-bridge cards).
 */
import assert from 'node:assert/strict'
import { matchQuestionMissingListI } from '../src/utils/extendTruncatedStem.js'

const meterBridge = {
  questionType: 'single_correct',
  text:
    'A wire of length 10cm and radius $\\sqrt{7} \\times 10^{-4} \\mathrm{~m}$ is connected across the right gap of a meter bridge. When a resistance of $4.5 \\Omega$ is connected on the left gap by using a resistance box, the balance length is found to be at 60cm from the left end. If the resistivity of the wire is $R \\times 10^{-7} \\Omega \\mathrm{~m}$, then value of R is :\n(1) 35\n(2) 63\n(3) 66\n(4) 70',
  options: ['35', '63', '66', '70'],
}

assert.equal(
  matchQuestionMissingListI(meterBridge),
  false,
  'meter-bridge SCQ is not a match-column card',
)

assert.equal(
  matchQuestionMissingListI({
    text: 'List-II (1) $3C_0$ (2) $C_0/2$ (3) $C_0/3$ (4) $2C_0$',
  }),
  true,
  'real List-II-only card still flags missing List-I',
)

console.log('test-mcq-not-orphan-list-ii: ok')
