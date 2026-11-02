import assert from 'node:assert/strict'
import {
  looksLikeChemistryContent,
  repairChemistryOcr,
} from '../src/utils/repairChemistryOcr.js'
import { polishOcrText } from '../src/utils/ocrExtractPolish.js'
import { finalizeStemForBank } from '../src/utils/stemBankGuard.js'
import { tryFastHybridTesseractResult } from '../src/utils/hybridOcrFastPath.js'
import { pageNeedsOnnxBoost } from '../src/utils/hybridOcrNeeds.js'

const waterMcq =
  'Which has hydrogen bonding?\n(A) H2O\n(B) H2S\n(C) CH4\n(D) NH3'

const repaired = repairChemistryOcr(waterMcq)
assert.match(repaired, /\\ce\{H2O\}/, 'wraps H2O in ce')
assert.match(repaired, /\\ce\{NH3\}/, 'wraps NH3 in ce')
assert.ok(looksLikeChemistryContent(repaired), 'detects chemistry content')

const polished = polishOcrText(waterMcq)
assert.match(polished, /\\ce\{H2O\}/, 'polish pipeline keeps ce')

const saved = finalizeStemForBank(polished)
assert.match(saved, /\\ce\{H2O\}/, 'bank storage keeps ce')

const reaction = '2H2 + O2 -> 2H2O at 298 K and 1 atm'
const rxn = repairChemistryOcr(reaction)
assert.match(rxn, /\\rightarrow/, 'reaction arrow')
assert.match(rxn, /\\ce\{H2O\}|H2O/, 'product formula')

const ions = 'Fe2+ and SO4^2- in aqueous solution'
const ionFixed = repairChemistryOcr(ions)
assert.match(ionFixed, /\\ce\{Fe/, 'iron ion')
assert.match(ionFixed, /\\ce\{SO4/, 'sulphate ion')

const cleanMcq =
  'The boiling point of ethanol is compared with methanol at standard laboratory pressure.\n(A) 65\n(B) 78\n(C) 82\n(D) 100'
const layout = { confidence: 55, text: cleanMcq }
const fast = tryFastHybridTesseractResult(cleanMcq, layout)
assert.ok(fast, 'fast path for clean prose MCQ')
assert.equal(pageNeedsOnnxBoost(cleanMcq), false, 'prose MCQ does not need ONNX')

assert.ok(looksLikeChemistryContent('pH of buffer at 298 K with Kc = 0.5'), 'detects chem keywords')

// MCQ options must keep $\ce{H2O}$ (never wipe to lone "$")
{
  const { processMcqUploadExtract } = await import('../src/utils/uploadPipeline.js')
  const mcq =
    'Which has hydrogen bonding?\n(A) H2O\n(B) H2S\n(C) CH4\n(D) NH3'
  const extracted = processMcqUploadExtract(mcq)
  assert.equal(extracted.found, 4)
  assert.match(extracted.parsed.options[0] ?? '', /\\ce\{H2O\}|H2O/)
  assert.doesNotMatch(extracted.parsed.options[0] ?? '', /^\$+$/)
}

console.log('test-chemistry-ocr: ok')
