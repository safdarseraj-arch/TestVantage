import assert from 'node:assert/strict'
import katex from 'katex'
import { fixOcrStructure } from '../src/utils/fixOcrStructure.js'
import { normalizeStemForStorage } from '../src/utils/stemStorage.js'

const giant = `Let $F(a, b) = \\log _{b} a, (a > 0, b > 0, b \\neq 1) then evaluate: F(\\sqrt{2}, 4)+F\\left(2 \\sqrt{2}, 4^{3}\\right)+F\\left((\\sqrt{2})^{99}, 4^{99}\\right)$`
const broken = `Let $F(a, b) = \\log _{b} a, (a > 0, b > 0, b \\neq 1)$ then evaluate: $F(\\sqrt{2}, 4)+F$\\left(2 \\sqrt{2}, 4^{3}\\right)+F\\left((\\sqrt{2})^{99}, 4^{99}\\right)$`

assert.ok(!fixOcrStructure(giant).includes('F(a, (b)'), 'F(a,b) must not become F(a,(b)')

const fixed = normalizeStemForStorage(broken)
assert.ok(!/\\backslash\\text/.test(fixed), 'must not shatter \\left into backslash text')
assert.match(fixed, /\$F\(a,\s*b\)/)
assert.match(fixed, /then evaluate:\s*\$F\(\\sqrt\{2\}, 4\)\+F\\left\(2/)
assert.ok(!/\+F\$\\left/.test(fixed), 'no +F$\\left shard')
assert.ok(!/\$F\([^$]+\)\+F\$/.test(fixed), 'no early $ close after +F')

for (const m of fixed.matchAll(/\$([^$]+)\$/g)) {
  const html = katex.renderToString(m[1], { throwOnError: false })
  assert.ok(!html.includes('katex-error'), `katex error in: ${m[1].slice(0, 80)}`)
}

console.log('test-math-left-right: ok')
