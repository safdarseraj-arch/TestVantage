import { dedupeRepeatedStemPhrase } from '../src/utils/dedupeStemText.js'
import { normalizeMathText } from '../src/utils/normalizeMathText.js'

const user =
  "int tan(x-1) tan 2x tan(x+1)dx is equal to (where ' C ' is the integration constant) int tan(x-1) tan 2x tan(x+1)dx is equal to (where ' C ' is the integration constant)"

const cases = [
  user,
  '$\\int \\tan(x-1) \\tan 2x \\tan(x+1)dx$ is equal to (where C is constant) $\\int \\tan(x-1) \\tan 2x \\tan(x+1)dx$ is equal to (where C is constant)',
  '$\\int \\tan(x-1) \\tan 2x \\tan(x+1)dx is equal to (where C is constant) \\int \\tan(x-1) \\tan 2x \\tan(x+1)dx is equal to (where C is constant)$',
]

let failed = 0
for (const c of cases) {
  const d = dedupeRepeatedStemPhrase(c)
  const n = normalizeMathText(c)
  const countInt = (s) => (s.match(/\\int\b|\bint\s/gi) || []).length
  const ok = countInt(d) <= 1 && countInt(n) <= 1
  console.log(ok ? 'ok' : 'FAIL', 'ints', countInt(d), countInt(n))
  console.log(' ', d.slice(0, 100))
  if (!ok) failed++
}
process.exit(failed)
