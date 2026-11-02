import { prepareTextForMathTextDisplay } from '../src/utils/prepareMathForRender.js'
import { repairMcqOptionForDisplay } from '../src/utils/repairMcqOption.js'
import { sanitizeMathDelimiters } from '../src/utils/sanitizeMathDelimiters.js'

const triangleStem =
  'If $\\vec{a}=\\hat{i}-\\hat{j}+\\hat{k}$ and $\\vec{b}=2 \\hat{i}+4 \\hat{j}+3 \\hat{k}$ are one of the sides and medians respectively, of a triangle through the same vertex, then area of triangle is-'

const boxStem =
  'If $\\vec{a}, \\vec{b}, \\vec{c}$ are such that $\\vec{a}+2 \\vec{b}+3 \\vec{c}=0$, then $$\\left[\\begin{matrix}\\vec{a}\\times\\vec{b} & \\vec{b}\\times\\vec{c} & \\vec{c}\\times\\vec{a}\\end{matrix}\\right]$$ is equal to'

const projectionD =
  'projection of $\\hat{i}+\\hat{j}+$\\hat{k}$ on $-2 \\hat{i}+2 \\hat{j}+$\\hat{k}$ is $\\frac{1}{3}$'

const cases = [
  { name: 'triangle D $$1{80}$', stem: triangleStem, d: '$$1{80}$' },
  { name: 'triangle D $$1$', stem: triangleStem, d: '$$1$' },
  { name: 'triangle D bare 80', stem: triangleStem, d: '80' },
  { name: 'triangle D (D)$$1{80}$ full', stem: triangleStem, d: '$$1{80}$', raw: `${triangleStem}\n(A) $$1{86}$\n(B) $\\frac{1}{2}$$1$\n(C) $$1$1$\n(D) $$1{80}$` },
  { name: 'box D $$1$', stem: boxStem, d: '$$1$' },
  { name: 'projection D', stem: 'Find projection', d: projectionD },
]

for (const c of cases) {
  const ctx = c.raw || `${c.stem}\n(A) x\n(B) y\n(C) z\n(D) ${c.d}`
  const polished = repairMcqOptionForDisplay(c.d, 'D', ctx)
  const display = prepareTextForMathTextDisplay(c.d, {
    questionContext: ctx,
    optionLetter: 'D',
  })
  console.log(`\n=== ${c.name} ===`)
  console.log('repair:  ', polished)
  console.log('display: ', display)
  console.log('sanitize block:', sanitizeMathDelimiters(`${ctx}\n(D) ${c.d}`).split('\n').pop())
}
