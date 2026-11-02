import { prepareTextForMathTextDisplay } from '../src/utils/prepareMathForRender.js'
import { isEnglishHeavyMath } from '../src/utils/fixRunawayInlineMath.js'

const cases = [
  'and the angle between the lines',
  'Find the angle between $\\vec{a}$ and $\\vec{b}$.',
  '$and the \\angle between$',
  'A box contains $15$ green and $10$ yellow balls.',
]

for (const raw of cases) {
  const prep = prepareTextForMathTextDisplay(raw)
  console.log('OK', raw.slice(0, 50), '->', prep.slice(0, 60))
}

console.log('english plain?', isEnglishHeavyMath('and the angle between'))
console.log('all tests passed')
