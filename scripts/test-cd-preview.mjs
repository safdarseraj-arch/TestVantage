import { prepareTextForMathTextDisplay } from '../src/utils/prepareMathForRender.js'

const stem =
  'If $\\vec{a}, \\vec{b}, \\vec{c}$ are such that $\\vec{a}+2 \\vec{b}+3 \\vec{c}=0$, then $$\\left[\\begin{matrix}\\vec{a}\\times\\vec{b} & \\vec{b}\\times\\vec{c} & \\vec{c}\\times\\vec{a}\\end{matrix}\\right]$$ is equal to'

console.log('C $$1$')
console.log(
  prepareTextForMathTextDisplay('$$1$', {
    questionContext: stem,
    optionLetter: 'C',
  }),
)

console.log('D $$1$')
console.log(
  prepareTextForMathTextDisplay('$$1$', {
    questionContext: stem,
    optionLetter: 'D',
  }),
)
