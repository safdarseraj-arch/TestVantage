import { fixOcrMathSymbols } from '../src/utils/fixOcrMathSymbols.js'
import { normalizeQuestionStemText } from '../src/utils/normalizeMathText.js'
import { prepareTextForMathTextDisplay } from '../src/utils/prepareMathForRender.js'

const stem =
  'A box contains $15$ green and $10$ yellow balls. If $10$ balls are randomly drawn one by one with replacement, then the variance of the number of green balls drawn is:'

console.log('fixOcrMathSymbols:')
console.log(fixOcrMathSymbols(stem))
console.log('normalizeQuestionStemText:')
const norm = normalizeQuestionStemText(stem)
console.log(norm)
console.log('has backslash vec?', /\\vec/.test(norm))

function splitMathSegments(text) {
  const normalized = text.replace(/\$\$([^$\n]+?)\$(?!\$)/g, (_, inner) => `$${inner.trim()}$`)
  const parts = []
  let i = 0
  while (i < normalized.length) {
    if (normalized[i] === '$') {
      const end = normalized.indexOf('$', i + 1)
      if (end !== -1) {
        parts.push(normalized.slice(i, end + 1))
        i = end + 1
        continue
      }
    }
    const nextS = normalized.indexOf('$', i)
    const next = nextS === -1 ? normalized.length : nextS
    if (next > i) parts.push(normalized.slice(i, next))
    i = next === i ? i + 1 : next
  }
  return parts.filter((p) => p.length > 0)
}

const prep = prepareTextForMathTextDisplay(norm)
const parts = splitMathSegments(prep)
const last = parts[parts.length - 1]
console.log('last part is math?', last.startsWith('$'))
console.log('last part:', JSON.stringify(last.slice(0, 120)))
