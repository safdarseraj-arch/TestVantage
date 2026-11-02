import assert from 'node:assert/strict'
import { normalizeOptionMarkersInText } from '../src/utils/mcqOptionMarkers.js'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'

const raw = `Let f (x) = sin²x + cos⁴x + 2 and g (x) = cos (cos x) + cos (sin x). Also let fundamental period of f (x) and gfl(x) be T₁ and T₂ respectively then (A) T₁ = 2T₂ (B) 2T₁ = T₂ (C) T₁ = T₂ (D) T₁ = 4T₂`

const norm = normalizeOptionMarkersInText(raw)
assert.match(norm, /\(B\)/)
assert.ok(norm.split('(B)').length >= 2 || /\n\(B\)/.test(norm), 'B on own line')

const p = parseSingleQuestionUpload(raw, raw)
console.log('stem:', p.text)
console.log('opts:', p.options)
assert.equal(p.optionsFound, 4)
assert.match(p.text ?? '', /\\sin\^2|\\sin\^\{2\}/)
assert.match(p.text ?? '', /\\cos\^4|\\cos\^\{4\}/)
assert.match(p.options[0] ?? '', /\$T_1\s*=\s*2T_2\$/)
assert.match(p.options[1] ?? '', /\$2T_1\s*=\s*T_2\$/)
assert.match(p.options[2] ?? '', /\$T_1\s*=\s*T_2\$/)
assert.match(p.options[3] ?? '', /\$T_1\s*=\s*4T_2\$/)
assert.ok(!/\\pi\s*x/.test(p.text ?? '') || /\\sin\^2/.test(p.text ?? ''))

console.log('test-trig-period-inline: ok')
