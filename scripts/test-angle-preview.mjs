import { embedInlineLatexInProse } from '../src/utils/fixRunawayInlineMath.js'
import { normalizeQuestionStemText } from '../src/utils/normalizeMathText.js'
import { prepareTextForMathTextDisplay } from '../src/utils/prepareMathForRender.js'

const cases = [
  'Find the angle between the vectors $\\vec{a}$ and $\\vec{b}$.',
  'and the angle between',
  'and the ∠ between the lines',
  '$and the \\angle between$',
  'The acute angle between $\\vec{p}$ and $\\vec{q}$ is $\\frac{\\pi}{4}$.',
]

for (const raw of cases) {
  const norm = normalizeQuestionStemText(raw)
  const prep = prepareTextForMathTextDisplay(norm)
  const phrase = prep.match(/and\s+the\s+.{0,30}between/i)?.[0] ?? prep.slice(0, 60)
  const hasSpaces =
    !/\bandthe\b/i.test(prep) &&
    !/\banglebetween\b/i.test(prep) &&
    (!/and.*the.*angle.*between/i.test(raw) ||
      (/\band the\b/i.test(prep) && /\bangle\b/i.test(prep) && /\bbetween\b/i.test(prep)))
  console.log('---')
  console.log('in:', raw.slice(0, 70))
  console.log('prep:', prep.slice(0, 90))
  console.log('phrase:', phrase)
  console.log('spaces OK?', hasSpaces)
  if (!hasSpaces) {
    console.error('FAIL missing spaces')
    process.exit(1)
  }
}

const wrapped = embedInlineLatexInProse('$and the \\angle between$')
console.log('unwrap angle:', wrapped)
if (!wrapped.includes('and the') || !wrapped.includes('$\\angle$') || !wrapped.includes('between')) {
  console.error('FAIL unwrap')
  process.exit(1)
}

console.log('OK')
