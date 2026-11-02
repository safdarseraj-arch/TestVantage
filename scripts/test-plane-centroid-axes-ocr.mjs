import assert from 'node:assert/strict'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'
import { polishOcrText } from '../src/utils/ocrExtractPolish.js'
import { finalizeStemForBank } from '../src/utils/stemBankGuard.js'
import { inferUploadQuestionType } from '../src/utils/classifyUploadFromOcr.js'
import {
  looksLikePlaneCentroidAxesMcq,
  polishPlaneCentroidStemOcr,
  repairPlaneCentroidAxesMcqOcr,
  PLANE_CENTROID_AXES_STEM,
} from '../src/utils/repairPlaneCentroidAxesMcqOcr.js'

const badOcr =
  'the coordinate axes in A, B, C such that the centroid of the triangle ABC is the point (1, 1, 1%). The plane passes through the point (4, -8, 15) if r'

assert.ok(looksLikePlaneCentroidAxesMcq(badOcr), 'detect plane centroid SCQ')

const polished = polishPlaneCentroidStemOcr(badOcr)
assert.match(polished, /A plane meets/i, 'restores missing opening')
assert.doesNotMatch(polished, /1\s*%/, 'fixes r² misread as 1%')
assert.match(polished, /r\^\{2\}|r\^{2}/, 'has r squared')
assert.match(polished, /is equal to/i, 'completes truncated ending')

const fixed = repairPlaneCentroidAxesMcqOcr(badOcr)
assert.equal(fixed, PLANE_CENTROID_AXES_STEM, 'golden stem restored')

const parsed = parseSingleQuestionUpload(polishOcrText(badOcr), badOcr)
assert.match(parsed.text ?? '', /A plane meets/i)
assert.match(parsed.text ?? '', /\$\(1,\s*r,\s*r\^\{2\}\)\$/)
assert.match(parsed.text ?? '', /\$\(4,\s*-8,\s*15\)\$/)
assert.match(parsed.text ?? '', /\$r\$ is equal to/)
assert.equal(parsed.optionsFound, 4)
assert.equal(String(parsed.options[0]).replace(/\s/g, ''), '$-3$')
assert.equal(String(parsed.options[3]).replace(/\s/g, ''), '$-5$')
assert.equal(
  inferUploadQuestionType({
    stem: parsed.text,
    options: parsed.options,
    found: parsed.optionsFound,
    rawOcr: badOcr,
  }),
  'single_correct',
)

assert.equal(finalizeStemForBank(badOcr), PLANE_CENTROID_AXES_STEM)

// Generic polish helps other centroid OCR too
const other =
  'A plane meets the coordinate axes in A, B, C such that the centroid of the triangle ABC is the point (1, 1, 1%).'
assert.match(polishPlaneCentroidStemOcr(other), /r\^\{2\}/)
assert.match(polishPlaneCentroidStemOcr(other), /A plane meets/)

console.log('test-plane-centroid-axes-ocr: ok')
