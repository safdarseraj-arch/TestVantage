import assert from 'node:assert/strict'
import {
  processMcqUploadExtract,
  planUploadImageActions,
  polishOcrForBank,
  resolveMcqFromOcr,
} from '../src/utils/uploadPipeline.js'
import { UPLOAD_SMOKE_FIXTURES } from '../src/utils/uploadRegressionContracts.js'
import { parseMatchColumnUpload } from '../src/utils/parseMatchColumnUpload.js'
import { resolvePassageUpload, looksLikePassageMultiMcq } from '../src/utils/parsePassageUpload.js'
import { polishExtractedText } from '../src/utils/ocrExtractPolish.js'
import { shouldSkipOptionsAutoCrop } from '../src/utils/graphOptionOcr.js'

for (const [name, fx] of Object.entries(UPLOAD_SMOKE_FIXTURES)) {
  const result = processMcqUploadExtract(fx.raw)
  assert.ok(result.found >= (fx.minFound ?? 0), `${name}: found ${result.found} options`)
  if (fx.maxFound != null) {
    assert.ok(result.found <= fx.maxFound, `${name}: too many options ${result.found}`)
  }
  if (fx.mustNotPassage) {
    assert.equal(
      looksLikePassageMultiMcq(fx.raw),
      false,
      `${name}: must not classify as passage`,
    )
    assert.notEqual(result.pass, 'passage-deferred', `${name}: upload must not defer passage`)
  }
  if (fx.mustStemMatch) {
    assert.ok(fx.mustStemMatch.test(result.parsed.text ?? ''), `${name}: stem mismatch`)
  }
  if (fx.mustOptionMatch) {
    const blob = (result.parsed.options ?? []).join('\n')
    assert.ok(fx.mustOptionMatch.test(blob), `${name}: options mismatch`)
  }
  if (fx.mustOptions) {
    assert.deepEqual(
      (result.parsed.options ?? []).slice(0, fx.mustOptions.length),
      fx.mustOptions,
      `${name}: exact options`,
    )
  }
  if (fx.skipOptionsAutoCrop) {
    assert.ok(
      shouldSkipOptionsAutoCrop(result.parsed.text ?? '', result.parsed.options ?? [], fx.raw),
      `${name}: must skip option auto-crop`,
    )
  }
  if (fx.imagePlan) {
    const plan = planUploadImageActions({
      stem: result.parsed.text,
      options: result.parsed.options,
      extractedRaw: result.polished,
      questionType: 'single_correct',
    })
    for (const [k, v] of Object.entries(fx.imagePlan)) {
      assert.equal(plan[k], v, `${name}: image plan ${k}`)
    }
  }
}

const mtxRaw = `Match the Column
Column-I
(A) a, b, c are unit vectors
(B) If matrix equals zero
Column-II
(P) 0
(Q) 1`
const mtx = parseMatchColumnUpload(mtxRaw, polishExtractedText(mtxRaw))
assert.ok(mtx.matrixRows.filter((r) => r.trim()).length >= 2, 'matrix rows parsed')

const passageRaw = `F(a,b)=log_b a. Consider the quadratic expression f(x,b)=x^2+bx+4.
Q1. Let F(a,b)=log_b a then evaluate F(sqrt2,4) (A) 1 (B) 2 (C) 3 (D) 4
Q2. Consider the quadratic expression f(x,b)=x^2+bx+4. Let g(b) be minimum (A) 1 (B) 2 (C) 3 (D) 4`
const passage = resolvePassageUpload(passageRaw, polishExtractedText(passageRaw), {
  allowOptionless: true,
})
assert.ok((passage?.subQuestions?.length ?? 0) >= 2, 'passage sub-questions parsed')

const polished = polishOcrForBank(
  'The function f is not defined for x=0, but for all non zero real number x, f(x) + 2f 2) = 3x',
  [],
)
assert.doesNotMatch(polished, /2f\s*2\s*\)/, 'polishOcrForBank repairs functional OCR')

const lnResolved = resolveMcqFromOcr(UPLOAD_SMOKE_FIXTURES.lnFractionIdenticalScq.raw)
assert.ok(lnResolved.stem?.includes('\\frac{x}{\\ln x}'), 'resolveMcqFromOcr fills stem for ln MCQ')
assert.ok(!/\(\s*A\s*\)/i.test(lnResolved.stem ?? ''), 'stem must not include option markers')

console.log('test-upload-pipeline-smoke: ok')
