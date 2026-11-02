/**
 * Piecewise sgn / e^{2(x-1)} differentiability OCR repair.
 */
import assert from 'node:assert/strict'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'
import { processMcqUploadExtract } from '../src/utils/uploadPipeline.js'
import { polishExtractedText, polishOcrText } from '../src/utils/ocrExtractPolish.js'
import { finalizeStemForBank, stemLooksHighQualityLatex } from '../src/utils/stemBankGuard.js'
import {
  looksLikePiecewiseSgnDiffMcq,
  hasGoodPiecewiseSgnDiffStem,
  repairPiecewiseSgnDiffMcqParse,
  PIECEWISE_SGN_DIFF_STEM,
} from '../src/utils/repairPiecewiseSgnDiffMcqOcr.js'
import { scoreLocalOcrWeakness, looksLikeMathHeavyOcr } from '../src/utils/cloudVisionParse.js'

const garbled =
  '2 2(x-1) f^0 < x < l Given f(x)= re or Usxst f(x) is differentiable at x = 1 provided : asgn(x+1)cos(2x - 2)+ bx? for r^1 < x < 2'

assert.ok(looksLikePiecewiseSgnDiffMcq(garbled), 'detects garbled piecewise sgn stem')
assert.ok(looksLikeMathHeavyOcr(garbled), 'math-heavy so cloud path preferred')
assert.ok(scoreLocalOcrWeakness(garbled) >= 55, 'garbled stem scores weak')

const repaired = repairPiecewiseSgnDiffMcqParse({
  text: garbled,
  options: ['', '', '', ''],
  _ocrSource: garbled,
})
assert.equal(repaired.text, PIECEWISE_SGN_DIFF_STEM)
assert.ok(hasGoodPiecewiseSgnDiffStem(repaired.text))
assert.match(repaired.text, /\\begin\{cases\}/)
assert.match(repaired.text, /\\operatorname\{sgn\}/)
assert.match(repaired.text, /e\^\{2\(x-1\)\}/)
assert.doesNotMatch(repaired.text, /asgn|Usxst|bx\?/)

const polished = polishOcrText(garbled)
assert.match(polished, /\\begin\{cases\}/)
assert.doesNotMatch(polished, /asgn\s*\(|Usxst/)

const parsed = parseSingleQuestionUpload(garbled, garbled)
assert.match(parsed.text ?? '', /\\begin\{cases\}/)
assert.doesNotMatch(parsed.text ?? '', /asgn\s*\(|Usxst/)

const extracted = processMcqUploadExtract(garbled)
assert.match(extracted.parsed?.text ?? '', /\\begin\{cases\}/)
assert.match(finalizeStemForBank(extracted.parsed?.text ?? ''), /\\operatorname\{sgn\}/)

// Good Gemini cases LaTeX must survive light polish + finalize
const geminiStem = PIECEWISE_SGN_DIFF_STEM
assert.ok(stemLooksHighQualityLatex(geminiStem))
const cloudPolished = polishExtractedText(geminiStem, 'cloud-vision')
assert.match(cloudPolished, /\\begin\{cases\}/)
assert.match(cloudPolished, /\\operatorname\{sgn\}/)
assert.equal(
  finalizeStemForBank(cloudPolished).replace(/\s+/g, ' ').trim().slice(0, 40),
  finalizeStemForBank(geminiStem).replace(/\s+/g, ' ').trim().slice(0, 40),
)

const cloudExtracted = processMcqUploadExtract(geminiStem, { engine: 'cloud-vision' })
assert.match(cloudExtracted.parsed?.text ?? '', /\\begin\{cases\}/)
assert.doesNotMatch(cloudExtracted.parsed?.text ?? '', /asgn\s*\(/)

// Near-miss Gemini: missing \\\\ + bare "a sgn" must heal via light path (not heavy OCR)
const nearMissRaw =
  'Given f(x)=\\begin{cases} x^{2}e^{2(x-1)}, & 0\\le x\\le 1 a sgn(x+1)\\cos(2x-2)+bx^{2}, & 1<x\\le 2 \\end{cases}\nIf f(x) is differentiable at x=1, then |a-b| is'
const nearViaRegistry = processMcqUploadExtract(nearMissRaw, { engine: 'cloud-vision' })
assert.match(nearViaRegistry.parsed?.text ?? '', /\\\\/)
assert.match(nearViaRegistry.parsed?.text ?? '', /\\operatorname\{sgn\}/)
assert.doesNotMatch(nearViaRegistry.parsed?.text ?? '', /\ba\s+sgn\s*\(/)

// Continuity property MCQ (same cases figure) must NOT become |a-b| / wipe options
const continuityRaw = `Let $f(x)=\\begin{cases} x^{2}e^{2(x-1)}, & 0\\le x\\le 1 \\\\ a\\operatorname{sgn}(x+1)\\cos(2x-2)+bx^{2}, & 1<x\\le 2 \\end{cases}$. Then f is:
(A) continuous but not differentiable
(B) differentiable but not continuous
(C) both continuous and differentiable
(D) neither`
assert.equal(
  looksLikePiecewiseSgnDiffMcq(continuityRaw),
  false,
  'Then f is: continuity SCQ is not the |a-b| stem',
)
const contParsed = processMcqUploadExtract(continuityRaw, { engine: 'cloud-vision' })
assert.match(contParsed.parsed?.text ?? '', /Then f is:/)
assert.equal(contParsed.found, 4)
assert.match(contParsed.parsed?.options?.[3] ?? '', /neither/i)

console.log('test-piecewise-sgn-diff-mcq-ocr: ok')
