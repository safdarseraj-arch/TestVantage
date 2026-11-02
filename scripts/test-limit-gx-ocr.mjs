import assert from 'node:assert/strict'
import { fixBrokenMcqLatex } from '../src/utils/fixBrokenMcqLatex.js'
import {
  LIMIT_GX_OPTIONS,
  LIMIT_GX_STEM,
  looksLikeLimitGxQuestion,
  hasGoodLimitGxStem,
  repairLimitGxStemOcr,
  repairLimitGxMcqParse,
} from '../src/utils/repairLimitGxStemOcr.js'
import { polishOcrText } from '../src/utils/ocrExtractPolish.js'
import { finalizeStemForBank, stemForLivePreview } from '../src/utils/persistUpload.js'
import { migrateStoredQuestionText } from '../src/utils/migrateStoredQuestions.js'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'
import { processMcqUploadExtract } from '../src/utils/uploadPipeline.js'
import {
  shouldSkipOptionsAutoCrop,
  shouldStripMistakenOptionCrops,
} from '../src/utils/graphOptionOcr.js'

const garbled = `If (x)= lim eren/ntog(in) nq [Le dx=g(x)+C (C being the constant of integration). Then : noe sin! xcos x (A) o(3) -2 3) g (x) is continuous for all T 15 $T^1$ © o(3)-2 (D) o(3)-`

assert.ok(looksLikeLimitGxQuestion(garbled), 'detect limit gx stem')

const repaired = repairLimitGxStemOcr(garbled)
assert.match(repaired, /\\lim_\{n\s*\\to\s*\\infty\}/, 'rebuilds limit')
assert.match(repaired, /\\sqrt\[3\]\{\\sin\^\{11\}/, 'cube root sin^11')
assert.match(repaired, /g\\left\(\\frac\{\\pi\}\{4\}\\right\)/, 'g(pi/4) in options')
assert.match(repaired, /continuous for all/, 'option B prose')
assert.match(repaired, /\(A\)/, 'option A')
assert.match(repaired, /\(D\)/, 'option D')
assert.doesNotMatch(repaired, /eren|ntog|noe sin!/i, 'removes garbled OCR')

const polished = polishOcrText(garbled)
assert.match(polished, /\\lim_\{n\s*\\to\s*\\infty\}/, 'polish pipeline keeps limit')

const parsed = parseSingleQuestionUpload(polished, garbled)
assert.equal(parsed.multi, false, 'single stem')
assert.equal(parsed.options?.length, 4, 'four options')
assert.ok(parsed.options?.every((o) => String(o).trim()), 'all options filled')
assert.deepEqual(parsed.options, LIMIT_GX_OPTIONS, 'golden options')
assert.equal(parsed.text, LIMIT_GX_STEM, 'golden stem')
assert.ok(hasGoodLimitGxStem(parsed.text), 'canonical stem')

const hybridPartial = `If f(x) = \\lim_{n \\to \\infty} e^{x \\tan(1/n) \\log(1/n)} , and = g(x) + C (C being the constant of integration). Then : (A) g \\left(`
assert.ok(looksLikeLimitGxQuestion(hybridPartial), 'detect hybrid partial OCR')
const hybridParsed = parseSingleQuestionUpload(polishOcrText(hybridPartial), hybridPartial)
assert.equal(hybridParsed.options?.filter((o) => o.trim()).length, 4, 'hybrid partial → 4 options')
assert.ok(!/\(\s*A\s*\)/.test(hybridParsed.text ?? ''), 'no option leak in stem')
assert.ok(
  shouldSkipOptionsAutoCrop(hybridParsed.text ?? '', hybridParsed.options ?? []),
  'skip auto-crop — text MSQ',
)
assert.ok(
  shouldStripMistakenOptionCrops(hybridParsed.text ?? '', hybridParsed.options ?? [], ['data:image/png;base64,x']),
  'strip mistaken option crops',
)

const extracted = processMcqUploadExtract(hybridPartial)
assert.equal(extracted.found, 4, 'upload pipeline finds 4 options')
assert.ok(hasGoodLimitGxStem(extracted.parsed.text ?? ''), 'pipeline stem canonical')

const brokenFrac = fixBrokenMcqLatex(
  'Let $f(x)$ such that $f(1) = 2$$ and $$\\lim_{t \\to x} x (A) $1{31}{11x} - $\\frac{9}{11}$x^{10}$ (B) $1{9}{11x}$',
)
assert.match(brokenFrac, /\$f\(1\) = 2\$/, 'fixes double-dollar before and')
assert.match(brokenFrac, /\\frac\{31\}\{11x\}/, 'fixes malformed frac')
assert.ok(brokenFrac.includes('\n(B)'), 'splits option B')

const parseOnly = repairLimitGxMcqParse({
  text: hybridPartial,
  options: ['$g\\left(\\frac{ pi}{4}\\right) = $', '$g(x)$', '', ''],
})
assert.deepEqual(parseOnly.options, LIMIT_GX_OPTIONS)

const brokenSave = migrateStoredQuestionText({
  text: LIMIT_GX_STEM,
  options: [
    '$g\\left(\\frac{\\pi}{4}\\right) = \\frac{3}{2}$',
    '$g(x)$',
    'g\\left(\\frac{ pi}{4}\\right) = -$\\frac{15}{8}',
    '$g\\left(\\frac{\\pi}{4}\\right) = -\\frac{1}{2}$',
  ],
  questionType: 'multiple_correct',
})
assert.equal(brokenSave.options[2], LIMIT_GX_OPTIONS[2], 'heal broken option C on bank load')
assert.match(brokenSave.options[1], /continuous for all/i, 'heal broken option B on bank load')

const preview = stemForLivePreview(
  finalizeStemForBank(LIMIT_GX_STEM, LIMIT_GX_OPTIONS),
  LIMIT_GX_OPTIONS,
)
assert.match(preview, /\\int[\s\S]*\\sqrt\[3\]\{\\sin\^\{11\}/, 'preview keeps integral')

console.log('test-limit-gx-ocr: ok')
