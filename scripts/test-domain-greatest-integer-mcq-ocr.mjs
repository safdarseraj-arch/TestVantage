import assert from 'node:assert/strict'
import { parseMcqFromLineData } from '../src/utils/ocrLineData.js'
import { parseMcqFromTesseractPage } from '../src/utils/ocrWordData.js'
import { parseQuestionText } from '../src/utils/parseQuestionText.js'
import { normalizeOptionMarkersInText } from '../src/utils/mcqOptionMarkers.js'
import {
  repairDomainGreatestIntegerMcqParse,
  looksLikeDomainGreatestIntegerMcq,
  DOMAIN_GI_MCQ_OPTIONS } from '../src/utils/repairDomainGreatestIntegerMcqOcr.js'
import {
  shouldSkipOptionsAutoCrop,
  shouldStripMistakenOptionCrops,
  stripMistakenCropLeakFromStem,
  looksLikeMistakenCropStemTail } from '../src/utils/graphOptionOcr.js'
import { countRealMcqOptions } from '../src/utils/stemDiagramDetect.js'

export const DOMAIN_GI_STEM =
  'If the domain of f(x) is [-1,2] then the domain of the function f([x] - x + 4) is (where [.] denotes greatest integer function)'
export const DOMAIN_GI_RAW = `${DOMAIN_GI_STEM}
(A) [-1, \\sqrt{7}] (B) [-\\sqrt{3}, -1] \\cup [\\sqrt{3}, \\sqrt{7}]
(C) [-\\sqrt{3}, \\sqrt{7}] - (-1, 2) (D) [\\sqrt{13}, \\sqrt{15}]`

assert.ok(looksLikeDomainGreatestIntegerMcq(DOMAIN_GI_RAW))

const norm = normalizeOptionMarkersInText(DOMAIN_GI_RAW)
const parsed = parseQuestionText(norm)
assert.equal(parsed.optionsFound, 4, 'marker parse gets four interval options')

const healed = repairDomainGreatestIntegerMcqParse({
  text: DOMAIN_GI_STEM,
  options: ['[-1, \\sqrt{7}]', '', '', ''],
  _ocrSource: DOMAIN_GI_RAW })
assert.ok(
  healed.text.includes('x^2'),
  'stem repair restores x^2 in f([x] - x^2 + 4)',
)
assert.equal(
  healed.options.filter((o) => String(o ?? '').trim()).length,
  4,
  'heal fills all four options from OCR blob',
)

const lineData = [
  {
    included: true,
    conversionOutput: true,
    text: DOMAIN_GI_STEM,
    bbox: { x0: 0, y0: 10, x1: 800, y1: 80 } },
  {
    included: true,
    conversionOutput: true,
    text: '(A) [-1, sqrt(7)] (B) [-sqrt(3), -1] U [sqrt(3), sqrt(7)]',
    bbox: { x0: 0, y0: 200, x1: 800, y1: 240 } },
  {
    included: true,
    conversionOutput: true,
    text: '(C) [-sqrt(3), sqrt(7)] - (-1, 2) (D) [sqrt(13), sqrt(15)]',
    bbox: { x0: 0, y0: 260, x1: 800, y1: 300 } },
]
const geo = parseMcqFromLineData(lineData)
assert.equal(geo?.optionsFound, 4, 'line geometry parses 2×2 option grid')

const page = {
  width: 800,
  height: 400,
  lines: lineData.map((l, _i) => ({
    text: l.text,
    bbox: l.bbox,
    words: l.text.split(/\s+/).map((t, wi) => ({
      text: t,
      bbox: { x0: wi * 40, y0: l.bbox.y0, x1: (wi + 1) * 40, y1: l.bbox.y1 } })) })) }
const wordGeo = parseMcqFromTesseractPage(page, { width: 800, height: 400 })
assert.ok((wordGeo?.optionsFound ?? 0) >= 4, 'word geometry aggregates 2×2 grid')

assert.ok(
  shouldSkipOptionsAutoCrop(DOMAIN_GI_STEM, healed.options, DOMAIN_GI_RAW),
  'skip graph auto-crop for domain interval MCQ',
)

const cropGarbled = ['-147', '[3.1] U[ V^{3}.7] C 3.7 ]-(-12)', '', '|$\\sqrt{13}$,415 |']
const cropImgs = ['a', 'b', 'c', 'd'].map((x) => `data:image/png;base64,${x}`)
assert.ok(
  shouldStripMistakenOptionCrops(DOMAIN_GI_STEM, cropGarbled, cropImgs, DOMAIN_GI_RAW),
  'strip mistaken crops on interval MCQ',
)

assert.ok(
  countRealMcqOptions(DOMAIN_GI_STEM, healed.options) >= 4,
  'interval options count as real MCQ answers',
)

const pollutedStem = `${DOMAIN_GI_STEM} -147 | [3.1] U[ V^{3}.7] © 3.7 ]-(-12) |`
assert.ok(looksLikeMistakenCropStemTail(pollutedStem))
assert.ok(
  stripMistakenCropLeakFromStem(pollutedStem).includes('greatest integer function'),
  'strip crop garbage from stem tail',
)
assert.ok(
  !stripMistakenCropLeakFromStem(pollutedStem).includes('-147'),
  'stem leak removed',
)

const userGarbled =
  'If the domain of f(x) is [-1,2] then the domain of the function f([x] - x^2 + 4 ) is (where [.] denotes greatest integer function) -147 | [3.1] U[ V^3 .7] © 3.7 ]-(-12) |'
const userHealed = repairDomainGreatestIntegerMcqParse({
  text: userGarbled,
  options: ['-147', ''],
  _ocrSource: userGarbled })
assert.equal(userHealed.optionsFound, 4, 'canonical repair when OCR has no A-D markers')
assert.deepEqual(userHealed.options, DOMAIN_GI_MCQ_OPTIONS)
assert.ok(!userHealed.text.includes('-147'))

import { recoverTextMcqFromFullOcr } from '../src/utils/uploadPipeline.js'
const userRecovered = recoverTextMcqFromFullOcr(userGarbled, ['-147', ''], userGarbled)
assert.equal(userRecovered.found, 4, 'recover fills canonical options from garbled OCR')
assert.deepEqual(userRecovered.options, DOMAIN_GI_MCQ_OPTIONS)

console.log('test-domain-greatest-integer-mcq-ocr: ok')
