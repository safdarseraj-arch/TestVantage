import { prepareTextForMathTextDisplay } from '../src/utils/prepareMathForRender.js'
import { buildMcqPreviewContext } from '../src/utils/repairMcqOption.js'

const stem =
  'If $\\vec{a}=\\hat{i}-\\hat{j}+\\hat{k}$ and $\\vec{b}=2 \\hat{i}+4 \\hat{j}+3 \\hat{k}$ are one of the sides and medians respectively, of a triangle through the same vertex, then area of triangle is-'
const opts = ['$$1$', '$\\frac{1}{2} $1$', '$$1$1$', '$$1$']
const ctx = buildMcqPreviewContext({ questionText: stem, options: opts })

for (let i = 0; i < 4; i++) {
  const L = String.fromCharCode(65 + i)
  const raw = opts[i]
  const display = prepareTextForMathTextDisplay(raw, {
    questionContext: ctx,
    optionLetter: L })
  console.log(`${L} raw: ${JSON.stringify(raw)}`)
  console.log(`   → ${JSON.stringify(display)}`)
}
