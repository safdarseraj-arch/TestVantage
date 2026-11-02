import assert from 'node:assert/strict'
import { looksLikePassageMultiMcq } from '../src/utils/parsePassageUpload.js'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'
import { processMcqUploadExtract } from '../src/utils/uploadPipeline.js'
import {
  looksLikeTrigPeriodMcq,
  repairTrigPeriodMcqParse,
} from '../src/utils/repairTrigPeriodMcqOcr.js'

const garbled = `Let f(x) =sin ?x + cos *x + 2 and g (x) = cos(cos X) + cos(sin x) . Also let fundamental period of f (x) and gfl(x) be T, and T, respectively then
(A) T1=2T2 (B) 2T1=T2 (C) T1=T2 (D) T1=4T2`

assert.ok(looksLikeTrigPeriodMcq(garbled))
assert.equal(looksLikePassageMultiMcq(garbled), false, 'single trig period SCQ — not passage')

const parsed = parseSingleQuestionUpload(garbled, garbled)
assert.equal(parsed.optionsFound, 4)
assert.match(parsed.options[0] ?? '', /T_1\s*=\s*2T_2/)
assert.match(parsed.options[3] ?? '', /4T_2/)

const extracted = processMcqUploadExtract(garbled)
assert.notEqual(extracted.pass, 'passage-deferred')
assert.equal(extracted.found, 4)

const garbledNone = `Let f(x) =sin ?x + cos *x + 2 and g (x) = cos(cos X) + cos(sin x) . Also let fundamental period of f (x) and gfl(x) be T, and T, respectively then
(A) T1=2T2 (B) 2T1=T2 (C) T1=T2 (D) none of these`

const repairedNone = repairTrigPeriodMcqParse({
  text: 'bad',
  options: ['$T_1 = 2T_2$', '$2T_1 = T_2$', '$T_1 = T_2$', 'none of these'],
  _ocrSource: garbledNone,
})
assert.match(repairedNone.options[3] ?? '', /\$T_1\s*=\s*4T_2\$/)
assert.ok(!/none\s+of/i.test(repairedNone.options[3] ?? ''))

const repaired = repairTrigPeriodMcqParse({
  text: 'bad',
  options: ['T =2T,', '2T1=T2 (C) T1=T2', '', ''],
  _ocrSource: garbled,
})
assert.equal(repaired.optionsFound, 4)
assert.match(repaired.text ?? '', /\\sin\^2|\\sin\^\{2\}/)
assert.match(repaired.text ?? '', /\\cos\^4|\\cos\^\{4\}/)
assert.ok(!/\\pi\s*x/.test(repaired.text ?? ''))
assert.match(repaired.options[1] ?? '', /2T_1\s*=\s*T_2/)
assert.match(repaired.options[2] ?? '', /T_1\s*=\s*T_2/)
assert.match(repaired.options[3] ?? '', /4T_2/)
assert.ok(!/\(C\)/i.test(repaired.options[1] ?? ''))

const garbledCrops = {
  text: 'Let f(x) = sin^2 x...',
  options: ['T =2T,', '2T =T, OT =T,', '$T_1 = T_2$', 'T =4T,'],
  _ocrSource: `fundamental period of f(x) and g(x) be T1 and T2 respectively then`,
}
const fixedCrops = repairTrigPeriodMcqParse(garbledCrops)
assert.match(fixedCrops.options[0] ?? '', /\$T_1\s*=\s*2T_2\$/)
assert.match(fixedCrops.options[1] ?? '', /\$2T_1\s*=\s*T_2\$/)
assert.match(fixedCrops.options[2] ?? '', /\$T_1\s*=\s*T_2\$/)
assert.match(fixedCrops.options[3] ?? '', /\$T_1\s*=\s*4T_2\$/)
assert.ok(!/OT/i.test(fixedCrops.options[1] ?? ''))

console.log('test-trig-period-mcq-ocr: ok')
