import assert from 'node:assert/strict'
import { polishOcrText } from '../src/utils/ocrExtractPolish.js'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'
import { countRealMcqOptions } from '../src/utils/stemDiagramDetect.js'
import { shouldSkipOptionsAutoCrop } from '../src/utils/graphOptionOcr.js'
import { resolveStemInputForSave } from '../src/utils/resolveStemInput.js'

const garbled = `12 If the 9 term in the expansion of (& + log , x) is equal to 495, then the value of x can be- X AI
(A) Option A
(B) An
(C) a fraction
(D) an irrational number`

const polished = polishOcrText(garbled)
const parsed = parseSingleQuestionUpload(polished)

console.log('parsed.text', parsed.text?.slice(0, 100))
console.log('parsed.options', parsed.options)
console.log('countReal', countRealMcqOptions(parsed.text, parsed.options))
console.log('skipAutoCrop', shouldSkipOptionsAutoCrop(parsed.text, parsed.options))

const save = resolveStemInputForSave({ qText: '', extractedRaw: polished, options: parsed.options })
console.log('save.source', save.source, 'stem len', save.stem?.length)

assert.ok(parsed.text?.trim(), 'stem parsed')
assert.equal(parsed.options?.filter((o) => o.trim()).length, 4, 'four options')
assert.ok(shouldSkipOptionsAutoCrop(parsed.text, parsed.options), 'must skip auto-crop for text MSQ')
assert.ok(countRealMcqOptions(parsed.text, parsed.options) >= 3, 'count prose MSQ options')
assert.ok(save.stem?.trim(), 'save resolves stem from extractedRaw')

console.log('test-binomial-form-fill: ok')
