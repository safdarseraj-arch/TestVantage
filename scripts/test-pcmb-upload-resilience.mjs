/**
 * PCMB (Physics/Chemistry/Math/Biology) upload resilience for JEE + NEET Class 11–12.
 * Guards: structured Gemini preserve, chem/bio/physics polish, no invent graphs, friendly errors.
 */
import assert from 'node:assert/strict'
import {
  normalizeVisionExtract,
  normalizeVisionQuestion,
  shouldPreserveVisionStructuredFill,
  mergeVisionOptionsPreferPreserve,
  visionQuestionToMcqParse,
} from '../src/utils/cloudVisionParse.js'
import { polishExtractedText, polishCloudVisionText } from '../src/utils/ocrExtractPolish.js'
import { processMcqUploadExtract } from '../src/utils/uploadPipeline.js'
import { UPLOAD_SMOKE_FIXTURES } from '../src/utils/uploadRegressionContracts.js'
import { friendlyUploadError } from '../src/utils/uploadFriendlyErrors.js'
import {
  isVisionTransientError,
  localFallbackNoteAfterCloudFail,
} from '../src/utils/cloudVisionClient.js'
import { resolveImageQueueOcrStatus } from '../src/utils/imageUploadQueue.js'
import { looksLikeChemistryContent } from '../src/utils/repairChemistryOcr.js'

for (const name of [
  'physicsOhmLawScq',
  'chemistryHydrogenBondScq',
  'biologyAlleleScq',
  'physicsCircuitFigureHint',
  'functionalEquationScq',
]) {
  const fx = UPLOAD_SMOKE_FIXTURES[name]
  assert.ok(fx, `missing fixture ${name}`)
  const extracted = processMcqUploadExtract(fx.raw, {
    engine: name.includes('chemistry') || name.includes('biology') || name.includes('physics')
      ? 'builtin'
      : 'builtin',
    minFound: fx.minFound ?? 0,
  })
  assert.ok(
    (extracted.found ?? 0) >= (fx.minFound ?? 0),
    `${name}: expected >=${fx.minFound} options, got ${extracted.found}`,
  )
  if (fx.mustStemMatch) {
    assert.match(extracted.parsed?.text ?? '', fx.mustStemMatch, `${name} stem`)
  }
}

// —— Gemini physics structured fill must be preserved ——
{
  const phys = normalizeVisionExtract({
    pageKind: 'typed',
    questions: [
      {
        number: 1,
        text: 'A resistor $R=4\\,\\Omega$ carries $I=2\\,\\mathrm{A}$. Potential difference is',
        options: ['$2\\,\\mathrm{V}$', '$4\\,\\mathrm{V}$', '$8\\,\\mathrm{V}$', '$16\\,\\mathrm{V}$'],
        regionTypes: ['stemText', 'optionText'],
        subject: 'physics',
        answerKeyVisible: false,
      },
    ],
  })
  assert.equal(phys.valid, true)
  const seed = visionQuestionToMcqParse(phys.questions[0])
  assert.equal(shouldPreserveVisionStructuredFill(seed, 'cloud-vision'), true)
  assert.match(polishExtractedText(phys.text, 'cloud-vision'), /\\Omega/)
}

{
  const fakeOpts = visionQuestionToMcqParse({
    text: 'The value of $\\int $$\\frac{dx}{1 + e\\cos x}$ must be same as:',
    options: ['Option A', 'Option B', 'Option C', 'Option D'],
  })
  assert.equal(fakeOpts.optionsFound, 0, 'Option A placeholders are not real MCQ options')
  assert.equal(
    shouldPreserveVisionStructuredFill(fakeOpts, 'cloud-vision'),
    false,
    'do not preserve Gemini placeholder A–D',
  )
}

// —— Chemistry: cloud polish wraps formulas ——
{
  const chemStem =
    'Which shows hydrogen bonding?\n(A) H2O\n(B) H2S\n(C) CH4\n(D) NH3'
  const polished = polishCloudVisionText(chemStem)
  assert.ok(looksLikeChemistryContent(polished) || /\\ce\{H2O\}/.test(polished))
  assert.match(polishExtractedText(chemStem, 'cloud-vision'), /H2O|\\ce\{H2O\}/)
}

// —— Biology alleles survive cloud polish ——
{
  const bio =
    'A person with genotype $I^A I^B$ has blood group\n(A) A\n(B) B\n(C) AB\n(D) O'
  const p = polishExtractedText(bio, 'cloud-vision')
  assert.match(p, /I\^A/)
  assert.match(p, /\bAB\b/)
}

// —— Graph invent stripped; figure+text stem preserved ——
{
  const fig = normalizeVisionQuestion({
    text: 'In the circuit shown, ammeter reading is',
    options: ['', '', '', ''],
    regionTypes: ['stemText', 'stemFigure', 'optionText'],
  })
  const seed = visionQuestionToMcqParse(fig)
  assert.equal(shouldPreserveVisionStructuredFill(seed, 'cloud-vision'), true)
  const invent = normalizeVisionQuestion({
    text: 'Which graph?',
    options: ['[Graph A: rising]', '[Graph B: falling]', '[Graph C: flat]', '[Graph D: peak]'],
    regionTypes: ['stemText', 'optionGraph'],
  })
  assert.deepEqual(invent.options, ['', '', '', ''])
  const kept = mergeVisionOptionsPreferPreserve(
    ['1', '2', '3', '4'],
    ['[Graph A: x]', '2', '3', ''],
    { preserve: true },
  )
  assert.deepEqual(kept, ['1', '2', '3', '4'])
}

// —— Transient / empty / network → friendly Needs review, not raw Error ——
assert.equal(isVisionTransientError(502, 'bad gateway'), true)
assert.equal(isVisionTransientError(0, 'Failed to fetch', 'VISION_NETWORK'), true)
assert.equal(isVisionTransientError(200, 'empty', 'VISION_EMPTY'), true)

const netNote = localFallbackNoteAfterCloudFail(
  Object.assign(new Error('Failed to fetch'), { code: 'VISION_NETWORK' }),
)
assert.match(netNote, /Local OCR backup/i)
assert.match(friendlyUploadError(Object.assign(new Error('VISION_NETWORK Failed to fetch'), { code: 'VISION_NETWORK' })), /network|Local OCR|bottom panel/i)

assert.equal(
  resolveImageQueueOcrStatus({
    hasContent: true,
    cloudNote: netNote,
  }).status,
  'needs_review',
)

// —— Continuity MCQ: text A–D, never option-image crop path ——
{
  const { shouldAttemptOptionsAutoCrop, shouldSkipOptionsAutoCrop } = await import(
    '../src/utils/graphOptionOcr.js'
  )
  const contRaw = `The function $f(x)$ is defined $f(x)=\\begin{cases}
\\log_{(4x-3)}(x^{2}-2x+5), & \\text{if } \\frac{3}{4} < x < 1 \\text{ or } x > 1 \\\\
4, & \\text{if } x = 1
\\end{cases}$
(A) is continuous at $x = 1$
(B) is discontinuous at $x = 1$ since $f(1^{+})$ does not exist though $f(1^{-})$ exists
(C) is discontinuous at $x = 1$ since $f(1^{-})$ does not exist though $f(1^{+})$ exists
(D) is discontinuous since neither $f(1^{-})$ nor $f(1^{+})$ exists`
  const extracted = processMcqUploadExtract(contRaw, { engine: 'cloud-vision' })
  assert.ok((extracted.found ?? 0) >= 3, 'continuity: fills A–D text options')
  assert.match(extracted.parsed?.text ?? '', /\\begin\{cases\}/, 'continuity: keeps cases stem')
  assert.ok(
    !String(extracted.pass).includes('passage'),
    'continuity: not passage',
  )
  assert.ok(
    shouldSkipOptionsAutoCrop(extracted.parsed?.text ?? '', extracted.parsed?.options ?? [], contRaw),
    'continuity: skip option auto-crop',
  )
  assert.equal(
    shouldAttemptOptionsAutoCrop(
      extracted.parsed?.text ?? '',
      ['', '', '', ''],
      [],
      contRaw,
    ),
    false,
    'continuity: empty slots still skip crop',
  )
}

// Soft Convert empty path: friendly errors (no raw stack) for network/empty AI
assert.match(friendlyUploadError(new Error('No text found in the image.')), /clearer|manually/i)
assert.match(
  friendlyUploadError(Object.assign(new Error('VISION_EMPTY'), { code: 'VISION_EMPTY' })),
  /Needs review|Local OCR|empty/i,
)

console.log('test-pcmb-upload-resilience: ok')
