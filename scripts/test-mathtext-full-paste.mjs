import { prepareTextForMathTextDisplay } from '../src/utils/prepareMathForRender.js'
import { normalizeQuestionStemText } from '../src/utils/normalizeMathText.js'

const full =
  'A box contains $15$ green and $10$ yellow balls. If $10$ balls are randomly drawn one by one with replacement, then the variance of the number of green balls drawn is:(A) $\\frac{12}{5}$(B) $6$(C) $4$(D) $\\frac{6}{5}$'

const norm = normalizeQuestionStemText(full)
const prep = prepareTextForMathTextDisplay(norm)

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

const parts = splitMathSegments(prep)
console.log('parts', parts.length)
parts.forEach((p, i) => {
  const kind = p.startsWith('$') ? 'MATH' : 'TEXT'
  const inner = p.startsWith('$') ? p.slice(1, -1) : p
  const wordCount = (inner.match(/\b[a-z]{2,}\b/gi) || []).length
  console.log(i, kind, 'words', wordCount, JSON.stringify(p.slice(0, 80)))
})
