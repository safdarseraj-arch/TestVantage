import { dedupeRepeatedStemPhrase } from '../src/utils/dedupeStemText.js'

const stem =
  'A box contains $15$ green and $10$ yellow balls. If $10$ balls are randomly drawn one by one with replacement, then the variance of the number of green balls drawn is:'

const out = dedupeRepeatedStemPhrase(stem)
console.log('yellow kept?', out.includes('yellow'))
console.log('out:', out)
if (!out.includes('yellow')) process.exit(1)
