import assert from 'node:assert/strict'
import {
  countPlaceholderMcqOptions,
  isPlaceholderMcqOption,
  processMcqUploadExtract,
  runGuardedUploadStep,
  salvageParseFromOcr,
  shouldSkipHeavyMcqHeal,
} from '../src/utils/uploadPipeline.js'
import { runFullUploadAssist, iterativeUploadHeal } from '../src/utils/uploadOrchestrator.js'
import { applyMcqParseRepairs, runPluginSafely } from '../src/utils/repairRegistry.js'
import { countRealMcqOptions } from '../src/utils/stemDiagramDetect.js'
import { polishMcqOptionBody } from '../src/utils/polishMcqOptionBody.js'
import { shouldPreserveVisionStructuredFill } from '../src/utils/cloudVisionParse.js'

const rawOcr =
  'The value of the integral then: (A) $A = \\frac{3}{2}$ (B) $B = 1$ (C) $C$ is indefinite (D) $A + B = 2$'

const healed = iterativeUploadHeal({
  stem: '',
  options: ['', '', '', ''],
  rawOcr,
  engine: 'builtin',
  questionType: 'single_correct',
  maxPasses: 2,
})
const assist = runFullUploadAssist(rawOcr, {
  engine: 'builtin',
  hasSourceImage: true,
  questionType: 'single_correct',
  stem: healed.stem,
  options: healed.options,
  preHealed: healed,
})
assert.ok(assist, 'runFullUploadAssist imports and runs with preHealed')
assert.equal(assist.stem, healed.stem)
assert.ok(
  runFullUploadAssist(rawOcr, {
    engine: 'cloud-vision',
    hasSourceImage: true,
    questionType: 'single_correct',
    stem: 'A curve $g(x)$ passes through origin, then:',
    options: ['$1$', '$2$', '$3$', '$4$'],
    preHealed: null,
  }),
  'null preHealed must not throw (aiMcq-class)',
)
assert.deepEqual(
  runGuardedUploadStep('boom', () => { throw new Error('assist report exploded') }, { kept: true }),
  { kept: true },
)
const salvage = salvageParseFromOcr(rawOcr, 'builtin')
assert.ok(salvage && String(salvage.text ?? '').trim(), 'salvage fills a stem from OCR')
assert.equal(salvageParseFromOcr('   '), null)
assert.ok(processMcqUploadExtract(rawOcr, { engine: 'builtin' }).parsed)
assert.equal(isPlaceholderMcqOption('Option A'), true)
assert.equal(countRealMcqOptions('stem', ['Option A', 'Option B', 'Option C', 'Option D']), 0)
assert.equal(countPlaceholderMcqOptions(['Option A', 'Option B', 'Option C', 'Option D']), 4)
assert.equal(
  shouldSkipHeavyMcqHeal({
    preserveVision: true,
    stem: 'Find the value of the integral',
    options: ['Option A', 'Option B', 'Option C', 'Option D'],
  }),
  false,
)
assert.equal(
  shouldSkipHeavyMcqHeal({
    preserveVision: true,
    stem: 'Find the value of the integral',
    options: ['$1$', '$2$', '$3$', '$4$'],
  }),
  true,
)
assert.equal(
  shouldSkipHeavyMcqHeal({
    preserveVision: true,
    stem: '241 | 1 QInx + 1)dx A FC',
    options: ['Lhx+C', 'MC', '(FY +C', '(Graph/diagram — attach image for this option below)'],
  }),
  false,
  'OCR soup must not skip heal',
)
assert.equal(
  countRealMcqOptions('stem', ['(Graph/diagram — attach image for this option below)']),
  0,
  'graph placeholder is not a real option',
)
assert.equal(
  countRealMcqOptions('stem', ['(A) Option A', '(B) Option B']),
  0,
  'labeled Option A stubs are not real',
)
assert.equal(
  shouldPreserveVisionStructuredFill(
    { text: 'Find the value of the integral', options: ['Option A', 'Option B', 'Option C', 'Option D'] },
    'cloud-vision',
  ),
  false,
)
assert.equal(
  shouldPreserveVisionStructuredFill(
    {
      text: '241 | 1 QInx + 1)dx A FC',
      options: ['Lhx+C', 'MC', '(FY +C', '(Graph/diagram — attach image for this option below)'],
    },
    'cloud-vision',
  ),
  false,
  'garbled integral soup is not a structured fill to preserve',
)
assert.equal(polishMcqOptionBody('$A = \\frac{3}{2}$', 'A', '', 'then:'), '$A = \\frac{3}{2}$')
const kept = { text: 'Keep this stem', options: ['$1$', '$2$', '$3$', '$4$'] }
assert.equal(
  runPluginSafely({ id: 'boom', apply: () => { throw new Error('plugin boom') } }, kept).text,
  'Keep this stem',
)
assert.equal(runPluginSafely({ id: 'empty', apply: () => undefined }, kept).text, 'Keep this stem')
assert.ok(
  String(
    applyMcqParseRepairs(
      { text: 'Keep this stem', options: ['$1$', '$2$', '$3$', '$4$'], optionsFound: 4, complete: true },
      rawOcr,
      { passes: 1 },
    ).text ?? '',
  ).trim(),
)
console.log('test-upload-crash-safety: ok')