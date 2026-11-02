import assert from 'node:assert/strict'
import {
  buildWordDataFromTesseractPage,
  findOptionMarkersInLineText,
  findOptionMarkersInWords,
  parseMcqFromTesseractPage,
} from '../src/utils/ocrWordData.js'
import { setLastOcrLineData, tryMcqParseFromCachedLineData } from '../src/utils/ocrLineDataCache.js'
import { processMcqUploadExtract } from '../src/utils/uploadPipeline.js'

/** @param {string} text @param {number} x0 @param {number} x1 */
function w(text, x0, x1) {
  return { text, confidence: 90, bbox: { x0, y0: 880, x1, y1: 910 } }
}

const horizontalOptionsPage = {
  width: 900,
  height: 1100,
  lines: [
    {
      text: 'Let f (x) = sin²x + cos⁴x + 2 and g (x) = cos (cos x) + cos (sin x).',
      bbox: { x0: 40, y0: 120, x1: 860, y1: 160 },
      confidence: 88,
      words: [{ text: 'Let f (x) = sin²x + cos⁴x + 2 and g (x) = cos (cos x) + cos (sin x).', confidence: 88 }],
    },
    {
      text: 'Also let fundamental period of f (x) and gfl(x) be T₁ and T₂ respectively then',
      bbox: { x0: 40, y0: 170, x1: 860, y1: 205 },
      confidence: 86,
      words: [{ text: 'Also let fundamental period of f (x) and gfl(x) be T₁ and T₂ respectively then', confidence: 86 }],
    },
    {
      text: '(A) T₁ = 2T₂ (B) 2T₁ = T₂ (C) T₁ = T₂ (D) T₁ = 4T₂',
      bbox: { x0: 40, y0: 880, x1: 860, y1: 915 },
      confidence: 84,
      words: [
        w('(A)', 40, 70),
        w('T₁', 75, 95),
        w('=', 98, 108),
        w('2T₂', 110, 140),
        w('(B)', 180, 210),
        w('2T₁', 215, 240),
        w('=', 243, 253),
        w('T₂', 256, 280),
        w('(C)', 320, 350),
        w('T₁', 355, 375),
        w('=', 378, 388),
        w('T₂', 391, 415),
        w('(D)', 455, 485),
        w('T₁', 490, 510),
        w('=', 513, 523),
        w('4T₂', 526, 560),
      ],
    },
  ],
}

const wordData = buildWordDataFromTesseractPage(horizontalOptionsPage)
assert.ok(wordData.length >= 12, 'word_data built')

const optLine = horizontalOptionsPage.lines[2].text
const textMarkers = findOptionMarkersInLineText(optLine)
assert.equal(textMarkers.length, 4, 'four text markers on horizontal row')

const wordMarkers = findOptionMarkersInWords(horizontalOptionsPage.lines[2].words)
assert.equal(wordMarkers.length, 4, 'four word markers')

const mcq = parseMcqFromTesseractPage(horizontalOptionsPage, { width: 900, height: 1100 })
assert.ok(mcq, 'word geometry MCQ')
assert.ok(
  ['mathpix-word-geometry', 'mathpix-line-geometry'].includes(mcq.source),
  'horizontal row parsed via line or word geometry',
)
assert.equal(mcq.optionsFound, 4)
assert.match(mcq.options[0] ?? '', /2T/)
assert.match(mcq.options[1] ?? '', /2T.*T/i)
assert.match(mcq.options[3] ?? '', /4T/)

const fakeFile = {}
setLastOcrLineData(fakeFile, [], { page: horizontalOptionsPage, imageSize: { width: 900, height: 1100 } })
const cached = tryMcqParseFromCachedLineData(fakeFile, optLine)
assert.equal(cached?.optionsFound, 4)
assert.match(cached?.options[1] ?? '', /\$2T_1\s*=\s*T_2\$|2T/)

const extracted = processMcqUploadExtract(optLine, { sourceFile: fakeFile })
assert.ok(['mathpix-word-geometry', 'mathpix-line-geometry'].includes(extracted.pass))
assert.equal(extracted.found, 4)

console.log('test-mathpix-word-geometry: ok')
