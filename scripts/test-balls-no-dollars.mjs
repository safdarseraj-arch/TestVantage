import { normalizeQuestionStemText } from '../src/utils/normalizeMathText.js'
import { prepareTextForMathTextDisplay } from '../src/utils/prepareMathForRender.js'

const stems = [
  'A box contains $15$ green and $10$ yellow balls. If $10$ balls are randomly drawn one by one with replacement, then the variance of the number of green balls drawn is:',
  'A box contains 15 green and 10 yellow balls. If 10 balls are randomly drawn one by one with replacement, then the variance of the number of green balls drawn is:',
  `A box contains $15$ green and $10$ yellow balls. If $10$ balls are randomly drawn one by one with replacement,
then the variance of the number of green balls drawn is:`,
  `A box contains $15$ green and $10$ yellow balls. If $10$ balls are randomly drawn one by one with replacement,
then the variance of the number of green balls drawn is:`,
]

for (const stem of stems) {
  const norm = normalizeQuestionStemText(stem)
  const prep = prepareTextForMathTextDisplay(norm)
  const line3 = prep.match(/then the[\s\S]*?is:/)?.[0] ?? ''
  const spaces = (line3.match(/ /g) || []).length
  const words = line3.split(/\s+/).filter(Boolean)
  console.log('---')
  console.log('spaces in line3:', spaces, 'words:', words.length)
  console.log('line3:', JSON.stringify(line3.slice(0, 100)))
  if (spaces < 5) console.log('FAIL sparse spaces')
}
