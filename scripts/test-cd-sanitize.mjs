import { sanitizeMathDelimiters } from '../src/utils/sanitizeMathDelimiters.js'
import { prepareMathForRender } from '../src/utils/prepareMathForRender.js'

const cases = [
  '(C) $\\frac{4}{9}$',
  '(D) 0',
  '(D) $0$',
  '(B) $\\frac{49}{4}$ (C) $\\frac{4}{9}$ (D) 0',
  '(C) $$1$',
  '(D) $$1$',
  '$\\frac{4}{9}$',
  '$0$',
]

for (const c of cases) {
  let s = sanitizeMathDelimiters(c)
  s = prepareMathForRender(s)
  console.log(JSON.stringify(c), '->', JSON.stringify(s))
}
