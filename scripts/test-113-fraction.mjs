import { normalizeMathText } from '../src/utils/normalizeMathText.js'
import { prepareTextForMathTextDisplay } from '../src/utils/prepareMathForRender.js'

const raw =
  '(D) projection of $\\hat{i}+\\hat{j}+\\hat{k}$ on $-2 \\hat{i}+2 \\hat{j}+\\hat{k}$ is 113'

console.log('normalize:', normalizeMathText(raw))
console.log(
  'display:',
  prepareTextForMathTextDisplay('113', {
    questionContext: raw,
    optionLetter: 'D',
  }),
)
