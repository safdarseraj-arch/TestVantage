import assert from 'node:assert/strict'
import katex from 'katex'
import { prepareTextForMathTextDisplay } from '../src/utils/prepareMathForRender.js'
import {
  passageHasTypesetArrayTable,
  shouldShowPassageImageInViewer,
} from '../src/utils/passage.js'

const passage = `Consider the arrangement of numbers as shown such that $\\mathrm{N}_{\\mathrm{p}}$ represents number of terms of $\\mathrm{p}^{\\text {th }}$ row and $S_{p}$ denotes sum of terms of $p^{\\text {th }}$ row : $$\\begin{array}{ccccc} \\mathrm{I}^{\\text {st }} \\text { row } & & \\frac{1}{3^{2}+3} & & \\\\ \\mathrm{II}^{\\text {nd }} \\text { row } & & \\frac{1}{4^{2}+4} & \\frac{1}{5^{2}+5} & \\frac{1}{6^{2}+6} \\\\ & & \\frac{1}{8^{2}+8} & \\frac{1}{9^{2}+9} & \\frac{1}{10^{2}+10} \\end{array} $\\_\\_\\_\\_$ and so on`

const out = prepareTextForMathTextDisplay(passage)
assert.match(out, /7\^\{?2\}?\+7/, 'row III repair inserts 1/(7²+7)')
assert.match(out, /11\^\{?2\}?\+11/, 'row III repair inserts 1/(11²+11)')
assert.match(out, /\$\$\\begin\{array\}/, 'array block must be wrapped in display math')
assert.ok(!/(?<!\$)\\begin\{array\}(?!\$)/.test(out.replace(/\$\$[\s\S]*?\$\$/g, '')), 'no bare array outside $$')

const m = out.match(/\$\$([\s\S]*?\\begin\{array\}[\s\S]*?\\end\{array\}[\s\S]*?)\$\$/)
assert.ok(m, 'display array chunk found')
const html = katex.renderToString(m[1], { displayMode: true, throwOnError: false })
assert.ok(!html.includes('katex-error'), 'katex should render array block')

assert.ok(passageHasTypesetArrayTable(passage))
assert.equal(
  shouldShowPassageImageInViewer(
    { passageImage: 'data:image/png;base64,x', passageText: passage },
    passage,
  ),
  false,
  'do not show cropped diagram when LaTeX array table is already in passage text',
)

console.log('test-array-render: ok')
