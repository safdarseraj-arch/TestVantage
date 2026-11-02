import { dedupeRepeatedStemPhrase } from '../src/utils/dedupeStemText.js'
import { polishMcqExtract } from '../src/utils/polishMcqExtract.js'
import { fixOcrStructure } from '../src/utils/fixOcrStructure.js'
import { repairInlineMathDelimiters } from '../src/utils/repairInlineMathDelimiters.js'
import { sanitizeMathDelimiters } from '../src/utils/sanitizeMathDelimiters.js'
import { prepareMathForRender } from '../src/utils/prepareMathForRender.js'

const stem =
  'A box contains $15$ green and $10$ yellow balls. If $10$ balls are randomly drawn one by one with replacement, then the variance of the number of green balls drawn is:'

function step(name, fn, out) {
  const next = fn(out)
  const yellow = next.includes('yellow')
  console.log(name, yellow ? 'OK' : 'LOST YELLOW', '|', next.slice(0, 90))
  return next
}

let out = stem
out = step('dedupe', dedupeRepeatedStemPhrase, out)
out = step('polishMcqExtract', polishMcqExtract, out)
out = step('fixOcrStructure', fixOcrStructure, out)
out = step('repairInline', repairInlineMathDelimiters, out)
out = step('sanitize', sanitizeMathDelimiters, out)
step('prepareMath', prepareMathForRender, out)
