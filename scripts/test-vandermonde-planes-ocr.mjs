import assert from 'node:assert/strict'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'
import { parseQuestionText } from '../src/utils/parseQuestionText.js'
import { polishOcrText } from '../src/utils/ocrExtractPolish.js'
import { processMcqUploadExtract } from '../src/utils/uploadPipeline.js'
import {
  looksLikeVandermondePlanesInteger,
  repairVandermondePlanesIntegerOcr,
} from '../src/utils/repairVandermondePlanesIntegerOcr.js'

const badOcr = `Let Lp p (p ,q .1;) & (Py.Qy.1,) are satisfying [l q q° | = 6( where pi, qi, ri e Nand pi < qi < ri & i = 1, 2) and point (p ,q .1;) lies on the plane 2x + 3y + 6z = k and point (Py.Qy.1,) lies on the plane 2x + 3y + 6z = k, (where p1 = p2 = 1). If distance between these planes is 'd', then value of (210d) is`

assert.equal(looksLikeVandermondePlanesInteger(badOcr), true)
assert.match(repairVandermondePlanesIntegerOcr(badOcr), /\\begin\{vmatrix\}/)
assert.match(repairVandermondePlanesIntegerOcr(badOcr), /\\mathbb\{N\}/)
assert.match(repairVandermondePlanesIntegerOcr(badOcr), /\$\(210d\)\$ is/)

const bareParse = parseQuestionText(badOcr)
assert.equal(bareParse.options.filter(Boolean).length, 0, '(210d) must not become option D')

const parsed = parseSingleQuestionUpload(polishOcrText(badOcr), badOcr)
assert.match(parsed.text ?? '', /\\begin\{vmatrix\}/, 'full vmatrix restored')
assert.match(parsed.text ?? '', /k_1.*k_2/s, 'plane constants k_1 k_2')
assert.match(parsed.text ?? '', /\$\(210d\)\$ is/, 'integer tail preserved')
assert.equal(parsed.optionsFound, 0, 'no false MCQ options')

const extracted = processMcqUploadExtract(badOcr)
assert.ok((extracted.parsed.text ?? '').length > 350, 'upload pipeline keeps full stem')
assert.match(extracted.parsed.text ?? '', /distance between these planes/i)

console.log('test-vandermonde-planes-ocr: ok')
