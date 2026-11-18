/**
 * JEE Main (1)–(4) choices glued into the stem must peel when A–D boxes already hold them.
 */
import assert from 'node:assert/strict'
import { findOptionsBlockStart } from '../src/utils/mcqOptionMarkers.js'
import { peelGluedMcqOptions } from '../src/utils/peelGluedMcqOptions.js'
import { stripLeakedOptionsFromStem } from '../src/utils/stripLeakedOptionsFromStem.js'
import { sanitizeStemForDisplay } from '../src/utils/sanitizeStemForDisplay.js'
import { matchQuestionMissingListI } from '../src/utils/extendTruncatedStem.js'

const stem =
  'A wire of length 10cm and radius $\\sqrt{7} \\times 10^{-4} \\mathrm{~m}$ is connected across the right gap of a meter bridge. When a resistance of $4.5 \\Omega$ is connected on the left gap by using a resistance box, the balance length is found to be at 60cm from the left end. If the resistivity of the wire is $R \\times 10^{-7} \\Omega \\mathrm{~m}$, then value of R is :\n(1) 35\n(2) 63\n(3) 66\n(4) 70'
const options = ['35', '63', '66', '70']

assert.ok(findOptionsBlockStart(stem) > 24, 'finds numbered (1)–(4) block')

const peeled = peelGluedMcqOptions(stem, options)
assert.doesNotMatch(peeled.text, /\(1\)\s*35/)
assert.match(peeled.text, /then value of R is\s*:/i)
assert.deepEqual(peeled.options.slice(0, 4), options)

const stripped = stripLeakedOptionsFromStem(stem, options)
assert.doesNotMatch(stripped, /\(1\)\s*35/)

const shown = sanitizeStemForDisplay(stem, options)
assert.doesNotMatch(String(shown), /\(1\)\s*35/)

assert.equal(
  matchQuestionMissingListI({ text: stem, options, questionType: 'single_correct' }),
  false,
)

// Real List-II must not be treated as SCQ option start.
const listTwo = 'List-II\n(1) $3C_0$\n(2) $C_0/2$\n(3) $C_0/3$\n(4) $2C_0$'
assert.equal(findOptionsBlockStart(listTwo), -1, 'List-II (1)–(4) is not an SCQ block')

console.log('test-peel-numbered-mcq-stem: ok')
