/**
 * Process invariants: shared sanitize/peel/fold so Paper 1+2 stay clean.
 */
import assert from 'node:assert/strict'
import { sanitizeStemForDisplay } from '../src/utils/sanitizeStemForDisplay.js'
import { peelGluedMcqOptions } from '../src/utils/peelGluedMcqOptions.js'
import {
  foldListIIFromOptionsIntoStem,
  parseMatchingListForDisplay,
} from '../src/utils/parseMatchingListDisplay.js'

const stemWithOpts = `A metal wire loop turns by angle $\\theta$ given by
(A) $1$
(B) $2$
(C) $3$
(D) $4$
\\includegraphics{https://cdn.mathpix.com/cropped/x.jpg?height=1&width=1&top_left_y=1&top_left_x=1}`
const opts = ['$1$', '$2$', '$3$', '$4$']
const peeled = peelGluedMcqOptions(stemWithOpts, opts)
assert.equal(/\(\s*A\s*\)/.test(peeled.text), false)
assert.match(peeled.text, /includegraphics/)
const san = sanitizeStemForDisplay(stemWithOpts, opts)
assert.equal(/\(\s*A\s*\)/.test(san), false)

const matchStem = `Four identical thin sheets. Match List-I with List-II.
List-I
(P) One
(Q) Two
(R) Three
(S) Four
List-II
(1) smash
$broken`
const matchOpts = [
  'P-1',
  'P-2',
  `P-3

List-II
(1) $3 C_{0}$
(2) $C_{0} / 2$
(3) $C_{0} / 3$
(4) $2 C_{0} / 3$
(5) $2 C_{0}$`,
  'P-4',
]
const folded = foldListIIFromOptionsIntoStem(matchStem, matchOpts)
const parsed = parseMatchingListForDisplay(folded.text, folded.options)
assert.ok(parsed)
assert.equal(parsed.listI.length, 4)
assert.ok(parsed.listII.length >= 4)
assert.doesNotMatch(folded.options[2], /List-II/)

// OCR: (P) fig then (R)(S) before the next fig — must not drop (R) or assign both labels to one figure.
const figOcr = `Match List-I with List-II. List-I (P) \\includegraphics{https://cdn.mathpix.com/a.jpg?x=1} (R) (S) \\includegraphics{https://cdn.mathpix.com/b.jpg?x=2} List-II \\includegraphics{https://cdn.mathpix.com/c.jpg?x=3} (2) \\includegraphics{https://cdn.mathpix.com/d.jpg?x=4}`
const figParsed = parseMatchingListForDisplay(figOcr, ['P-2, Q-3, R-4, S-5', 'P-1', 'P-3', 'P-4'])
assert.ok(figParsed?.listI?.some((r) => r.label === '(P)'), 'fig List-I P')
assert.ok(figParsed?.listI?.some((r) => r.label === '(R)'), 'fig List-I R')
assert.ok(figParsed?.listI?.some((r) => r.label === '(S)'), 'fig List-I S')
assert.ok(figParsed?.listII?.length >= 2, 'fig List-II rows')

const interleaved = `Match each entry in List-I to the correct entry in List-II.
List-I
(P) The number of elements in the set
$$\\left\\{x \\in[-\\pi, \\pi]: \\sin x=1\\right\\}$$
List-II
(1) is 1
(Q) The number of elements in the set
(2) is 2
$$\\left\\{x \\in[-\\pi, \\pi]: \\cos x=1\\right\\}$$
(3) is 3
$$\\left\\{x \\in[-\\pi, \\pi]: \\tan x=1\\right\\}$$
(S) The number of elements in the set
(4) is 4
$$\\left\\{x \\in[-\\pi, \\pi]: \\cot x=1\\right\\}$$
(5) is 5`
const inter = parseMatchingListForDisplay(interleaved, [])
assert.ok(inter)
assert.deepEqual(inter.listI.map((r) => r.label), ['(P)', '(Q)', '(R)', '(S)'])
assert.match(inter.listI.find((r) => r.label === '(Q)').text, /\\cos x=1/)
assert.match(inter.listI.find((r) => r.label === '(R)').text, /\\tan x=1/)
assert.match(inter.listI.find((r) => r.label === '(S)').text, /\\cot x=1/)
assert.match(inter.listII.find((r) => r.label === '(2)').text, /^is 2/)
assert.doesNotMatch(inter.listII.find((r) => r.label === '(2)').text, /\\cos/)
assert.doesNotMatch(inter.intro, /\\tan x=1/)

const flatOpt = sanitizeStemForDisplay(
  '$\\left[\\begin{array}{lll}1 & 1 & 1 1 & 1 & 1 1 & 1 & 1\\end{array}\\right]$',
  [],
)
assert.match(flatOpt, /\\\\/)
const junk = sanitizeStemForDisplay(
  'The speed is shown in the figure.\n![]( )\n\\includegraphics{https://cdn.mathpix.com/cropped/a.jpg?height=1&width=1&top_left_y=1&top_left_x=1}',
  [],
)
assert.doesNotMatch(junk, /!\[\]/)
assert.match(junk, /includegraphics/)

console.log('test-official-pyq-process-invariants: ok')
