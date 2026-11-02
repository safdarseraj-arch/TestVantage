import { prepareTextForMathTextDisplay } from '../src/utils/prepareMathForRender.js'

const optD =
  'projection of $\\hat{i}+\\hat{j}+$\\hat{k}$ on $-2 \\hat{i}+2 \\hat{j}+$\\hat{k}$ is $\\frac{1}{3}$'

console.log('D projection (no context):')
console.log(prepareTextForMathTextDisplay(optD))

console.log('\nD projection (with letter):')
console.log(
  prepareTextForMathTextDisplay(optD, {
    questionContext: 'Find projection',
    optionLetter: 'D',
  }),
)
