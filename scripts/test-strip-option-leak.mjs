import { stripLeakedOptionsFromStem } from '../src/utils/stripLeakedOptionsFromStem.js'

const stem =
  'In the circuit shown, A and B are equal resistances. When S is closed, the capacitor C charges from the cell of emf E and reaches a steady state n A than in B. the same rate in A and B . is \\frac{1}{4}\\mathrm{CE}^{2} . is \\frac{1}{8}\\mathrm{CE}^{2}'

const options = [
  'During charging, more heat is produced in A than in B.',
  'In the steady state, heat is produced at the same rate in A and B .',
  'In the steady state, energy stored in C is \\frac{1}{4}\\mathrm{CE}^{2} .',
  'In the steady state, energy stored in C is \\frac{1}{8}\\mathrm{CE}^{2} .',
]

const out = stripLeakedOptionsFromStem(stem, options)
console.log('OUT:', out)

const fail = []
if (/than in B/i.test(out)) fail.push('option A tail remains')
if (/same rate in A and B/i.test(out)) fail.push('option B tail remains')
if (/CE\}\^\{2\}|\\frac\{1\}\{8\}/.test(out)) fail.push('option C/D math remains')
if (!/reaches a steady state/i.test(out)) fail.push('legit stem truncated')
if (/\bstate n$/i.test(out)) fail.push('orphan "n" left at boundary')
if (!/A and B are equal resistances/i.test(out)) fail.push('start of stem damaged')

// No options → unchanged (trimmed)
const noOpts = stripLeakedOptionsFromStem('Simple question with no options here.', [])
if (noOpts !== 'Simple question with no options here.') fail.push('no-option stem changed')

// Legit stem that references A and B should not be over-trimmed
const safe = stripLeakedOptionsFromStem(
  'Compare currents through A and B in the circuit and find the ratio.',
  ['1:2', '2:1', '1:1', '4:1'],
)
if (!/find the ratio/i.test(safe)) fail.push('safe stem over-trimmed')

const cotStem =
  '$$\\begin{aligned} & \\text { Let } \\frac{\\pi}{2}<x<\\pi \\text { be such that } \\cot x=\\frac{-5}{\\sqrt{11}} \\text {. Then } \\\\ & \\left(\\sin \\frac{11 x}{2}\\right)\\end{aligned}$$'
const cotOpts = [
  '$\\frac{\\sqrt{11}-1}{2\\sqrt{3}}$',
  '$\\frac{\\sqrt{11}+1}{2\\sqrt{3}}$',
  '$\\frac{\\sqrt{11}+1}{3\\sqrt{2}}$',
  '$\\frac{\\sqrt{11}-1}{3\\sqrt{2}}$',
]
const cotKept = stripLeakedOptionsFromStem(cotStem, cotOpts)
if (!/\\sqrt\{11\}/.test(cotKept)) fail.push('cot-x stem cut at shared \\sqrt{11}')
if (/\\frac\{-5\}\{\s*$/.test(cotKept)) fail.push('cot-x stem left as unclosed frac')
if (!/\\end\{aligned\}/.test(cotKept)) fail.push('cot-x aligned closed env dropped')

// Stored A–D options + duplicated (A)–(D) band in the stem must peel cleanly.
const labeledStem = `A thin stiff insulated metal wire is bent into a circular loop with its two ends extending tangentially.
When a current $I$ is passed through the loop, the loop turns about the line PQ by an angle $\\theta$ given by

(A) $\\tan \\theta=\\pi r I B_{0} /(m g)$
(B) $\\tan \\theta=2 \\pi r I B_{0} /(m g)$
(C) $\\tan \\theta=\\pi r I B_{0} /(2 m g)$
(D) $\\tan \\theta=m g /\\left(\\pi r I B_{0}\\right)$
\\includegraphics{https://cdn.mathpix.com/cropped/demo.jpg?height=10&width=10&top_left_y=1&top_left_x=1}`
const labeledOpts = [
  '$\\tan \\theta=\\pi r I B_{0} /(m g)$',
  '$\\tan \\theta=2 \\pi r I B_{0} /(m g)$',
  '$\\tan \\theta=\\pi r I B_{0} /(2 m g)$',
  '$\\tan \\theta=m g /\\left(\\pi r I B_{0}\\right)$',
]
const labeledOut = stripLeakedOptionsFromStem(labeledStem, labeledOpts)
if (/\(\s*A\s*\)/.test(labeledOut)) fail.push('labeled (A)–(D) band still in stem')
if (!/angle\s+\$\\theta\$\s+given by/i.test(labeledOut)) fail.push('labeled stem prompt damaged')
if (!/includegraphics/.test(labeledOut)) fail.push('figure after options was dropped')

if (fail.length) {
  console.error('FAIL:', fail.join('; '))
  process.exit(1)
}
console.log('test-strip-option-leak: ok')
