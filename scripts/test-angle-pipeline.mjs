import { normalizeQuestionStemText } from '../src/utils/normalizeMathText.js'
import { prepareTextForMathTextDisplay } from '../src/utils/prepareMathForRender.js'

const inputs = [
  'Find and the angle between the vectors',
  'and the angle between',
  'and the ∠ between the lines',
  'and the \\angle between',
  '$and the \\angle between$',
  '$and the angle between$',
  'andtheanglebetween',
]

for (const raw of inputs) {
  const norm = normalizeQuestionStemText(raw)
  const prep = prepareTextForMathTextDisplay(norm)
  const bad = /\bandthe\b/i.test(prep) || /\banglebetween\b/i.test(prep)
  console.log({ raw: raw.slice(0, 55), norm: norm.slice(0, 55), prep: prep.slice(0, 55), bad })
}

function splitMathSegments(text) {
  const parts = []
  let i = 0
  while (i < text.length) {
    if (text[i] === '$') {
      const end = text.indexOf('$', i + 1)
      if (end !== -1) {
        parts.push(text.slice(i, end + 1))
        i = end + 1
        continue
      }
    }
    const nextS = text.indexOf('$', i)
    const next = nextS === -1 ? text.length : nextS
    if (next > i) parts.push(text.slice(i, next))
    i = next === i ? i + 1 : next
  }
  return parts
}

const prep = prepareTextForMathTextDisplay(
  normalizeQuestionStemText('Find the angle between $\\vec{a}$ and $\\vec{b}$'),
)
console.log('parts:', splitMathSegments(prep).map((p) => (p.startsWith('$') ? 'M:' : 'T:') + p.slice(0, 40)))
