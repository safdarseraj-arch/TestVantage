import { normalizeMathText } from '../src/utils/normalizeMathText.js'

const cases = [
  'int tan(x-1) tan^2x tan(x+1) dx',
  'int tan(x-1) tan^{2} x tan(x+1) dx',
  'int tan(x-1) tan ^{2} x tan(x+1) dx',
  'int tan(x-1) tan^{2}{x} tan(x+1) dx',
  'int tan(x-1) tan²x tan(x+1) dx',
  'int tan(x-1) tan2x tan(x+1) dx',
  '$\\int \\tan(x-1) \\tan^2x \\tan(x+1) dx$',
  '$\\int \\tan(x-1) \\tan^{2} x \\tan(x+1) dx$',
]

let failed = 0
for (const c of cases) {
  const o = normalizeMathText(c)
  const bad = /\\tan\s*\^|tan\^2|tan²/i.test(o)
  console.log(bad ? 'FAIL' : 'ok  ', c.slice(0, 40).padEnd(40), '=>', o)
  if (bad) failed++
}
process.exit(failed ? 1 : 0)
