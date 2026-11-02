import { fixRunawayInlineMath, isEnglishHeavyMath } from '../src/utils/fixRunawayInlineMath.js'
import { prepareTextForMathTextDisplay } from '../src/utils/prepareMathForRender.js'
import { normalizeQuestionStemText } from '../src/utils/normalizeMathText.js'

const stem =
  'A box contains $15$ green and $10$ yellow balls. If $10$ balls are randomly drawn one by one with replacement, then the variance of the number of green balls drawn is:'

const runaway =
  'If $10$ $balls are randomly drawn one by one with replacement, then the variance of the number of green balls drawn is:$'

console.log('english heavy?', isEnglishHeavyMath('balls are randomly drawn one by one with replacement, then the variance of the number of green balls drawn is:'))

const fixed = fixRunawayInlineMath(runaway)
console.log('fixed runaway has spaces?', /\bthe variance of\b/.test(fixed) && fixed.includes(' '))

const norm = normalizeQuestionStemText(stem)
const prep = prepareTextForMathTextDisplay(norm)
const line3 = prep.match(/then the[\s\S]*?is:/)?.[0] ?? ''
console.log('line3 spaces', (line3.match(/ /g) || []).length, line3)

if ((line3.match(/ /g) || []).length < 5) process.exit(1)
