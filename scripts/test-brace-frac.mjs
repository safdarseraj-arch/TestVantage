import { fixOcrBraceFractions } from '../src/utils/fixOcrMathSymbols.js'

const cases = [
  '$1{p^{3}}{61 m n}$',
  '{p^{3}}/{61 m n}',
  '1{p^{3}}{61 m n}',
]
for (const s of cases) {
  console.log(s, '=>', fixOcrBraceFractions(s))
}
