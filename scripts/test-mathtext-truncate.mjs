import { prepareTextForMathTextDisplay } from '../src/utils/prepareMathForRender.js'
import { normalizeQuestionStemText } from '../src/utils/normalizeMathText.js'

const full =
  'A box contains $15$ green and $10$ yellow balls. If $10$ balls are randomly drawn one by one with replacement, then the variance of the number of green balls drawn is:(A) $\\frac{12}{5}$(B) $6$(C) $4$(D) $\\frac{6}{5}$'

const norm = normalizeQuestionStemText(full)
console.log('norm around is:', norm.slice(norm.indexOf('variance') - 5, norm.indexOf('frac') + 20))

const prep = prepareTextForMathTextDisplay(norm)
console.log('prep around is:', prep.slice(prep.indexOf('variance') - 5, prep.indexOf('frac') + 20))

const idx = prep.indexOf('number')
console.log('number context:', JSON.stringify(prep.slice(idx - 10, idx + 50)))
