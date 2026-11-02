import { normalizeMathText } from '../src/utils/normalizeMathText.js'
import { parseQuestionText, applyParsedToForm } from '../src/utils/parseQuestionText.js'
import { applyGraphOptionPlaceholders, sanitizeStoredOptions } from '../src/utils/graphOptionOcr.js'

const raw = `If f(x) = { x+1 , x in [-1,0] ; x^2+1 , x in (0,1] }, then the value of (f^-1(0)+f^-1(1)+f^-1(2))/(f(-1)+f(0)+f(1)) is -
(A) 0    (B) 1    (C) 2    (D) 1/3`

const norm = normalizeMathText(raw)
const applied = applyParsedToForm(parseQuestionText(norm), norm)
const stem = applied.text
const final = sanitizeStoredOptions(
  applyGraphOptionPlaceholders(stem, applied.options, []),
  [],
  stem,
)

console.log('found', applied.optionsFound)
final.forEach((o, i) => console.log(String.fromCharCode(65 + i), o || '(EMPTY)'))

const ok =
  final[0] === '0' &&
  final[1] === '1' &&
  final[2] === '2' &&
  /frac|1\/3/.test(final[3] ?? '')
console.log(ok ? 'PASS' : 'FAIL')
process.exit(ok ? 0 : 1)
