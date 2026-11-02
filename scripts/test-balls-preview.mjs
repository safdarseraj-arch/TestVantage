import { prepareTextForMathTextDisplay } from '../src/utils/prepareMathForRender.js'
import { normalizeQuestionStemText } from '../src/utils/normalizeMathText.js'

const stem =
  'A box contains $15$ green and $10$ yellow balls. If $10$ balls are randomly drawn one by one with replacement, then the variance of the number of green balls drawn is:'

const norm = normalizeQuestionStemText(stem)
const prep = prepareTextForMathTextDisplay(norm)
console.log('norm:\n', norm)
console.log('prep:\n', prep)

// simulate splitMathSegments
function splitMathSegments(text) {
  const normalized = text.replace(/\$\$([^$\n]+?)\$(?!\$)/g, (_, inner) => `$${inner.trim()}$`)
  const parts = []
  let i = 0
  while (i < normalized.length) {
    if (normalized.startsWith('$$', i)) {
      const end = normalized.indexOf('$$', i + 2)
      if (end !== -1) {
        parts.push(normalized.slice(i, end + 2))
        i = end + 2
        continue
      }
    }
    if (normalized[i] === '$') {
      const end = normalized.indexOf('$', i + 1)
      if (end !== -1) {
        parts.push(normalized.slice(i, end + 1))
        i = end + 1
        continue
      }
    }
    const nextD = normalized.indexOf('$$', i)
    const nextS = normalized.indexOf('$', i)
    let next = normalized.length
    if (nextD !== -1) next = Math.min(next, nextD)
    if (nextS !== -1) next = Math.min(next, nextS)
    if (next > i) parts.push(normalized.slice(i, next))
    i = next === i ? i + 1 : next
  }
  return parts.filter((p) => p.length > 0)
}

const parts = splitMathSegments(prep)
console.log('parts count', parts.length)
parts.forEach((p, i) => {
  const isMath = p.startsWith('$')
  console.log(i, isMath ? 'MATH' : 'TEXT', JSON.stringify(p.slice(0, 80)))
})

// check third "line" roughly
const line3 = 'then the variance of the number of green balls drawn is:'
const idx = prep.indexOf('then the')
console.log('line3 in prep:', prep.slice(idx, idx + line3.length))
console.log('spaces in line3?', /\s/.test(prep.slice(idx, idx + line3.length)))
