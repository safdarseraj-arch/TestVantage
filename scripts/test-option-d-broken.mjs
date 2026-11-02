import { prepareTextForMathTextDisplay } from '../src/utils/prepareMathForRender.js'

const triangleCtx =
  'If $\\vec{a}=\\hat{i}-\\hat{j}+\\hat{k}$ and $\\vec{b}=2 \\hat{i}+4 \\hat{j}+3 \\hat{k}$ are one of the sides and medians respectively, of a triangle through the same vertex, then area of triangle is-\n(A) $\\sqrt{86}$\n(B) $\\frac{1}{2}\\sqrt{86}$\n(C) $\\frac{1}{2}\\sqrt{84}$'

const cases = [
  '80',
  '$$1{80}$',
  '$$80$',
  '$$1$',
  '$$\\sqrt{80}$',
  '$$\\frac{1}{2}\\sqrt{84}$',
  '$\\sqrt{80}$',
  '$\\frac{1}{2}\\sqrt{84}$',
  '$$\\frac{1}{2}\\sqrt{84}$$',
]

for (const d of cases) {
  const out = prepareTextForMathTextDisplay(d, {
    questionContext: `${triangleCtx}\n(D) ${d}`,
    optionLetter: 'D',
  })
  console.log(`IN:  ${JSON.stringify(d)}`)
  console.log(`OUT: ${JSON.stringify(out)}`)
  console.log('---')
}
