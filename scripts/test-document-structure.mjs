/**
 * Document structure segmentation (local line_data zones).
 */
import assert from 'node:assert/strict'
import { buildLineDataFromTesseractPage } from '../src/utils/ocrLineData.js'
import {
  inferStructureKind,
  mcqPayloadFromStructure,
  segmentLineDataIntoStructure,
  zoneText,
} from '../src/utils/documentStructure.js'
import { parseFromDocumentStructure } from '../src/utils/structureAwareUpload.js'
import { refineLineDataDiagramTypes } from '../src/utils/diagramClassifier.js'
import { matrixColsFromLineGeometry } from '../src/utils/columnGeometry.js'

/** Minimal Tesseract-like page for regression. */
function fakePage(lines) {
  return {
    width: 800,
    height: 1200,
    lines: lines.map((text, i) => ({
      text,
      confidence: 92,
      bbox: { x0: 40, y0: 80 + i * 44, x1: 760, y1: 118 + i * 44 },
      words: [{ text, confidence: 92, bbox: { x0: 40, y0: 80 + i * 44, x1: 760, y1: 118 + i * 44 } }],
    })),
  }
}

const mcqLines = [
  'If $f(x) = x^2 + 1$ then $f(2)$ equals',
  '(A) $3$',
  '(B) $4$',
  '(C) $5$',
  '(D) $6$',
]

const lineData = buildLineDataFromTesseractPage(fakePage(mcqLines), { width: 800, height: 1200 })
const structure = segmentLineDataIntoStructure(lineData, { width: 800, height: 1200 })

assert.equal(inferStructureKind(structure.zones), 'mcq')
assert.ok(zoneText(structure.zones, 'stem').includes('f(x)'))
assert.ok(zoneText(structure.zones, 'options').includes('(A)'))

const mcq = mcqPayloadFromStructure(structure)
assert.ok(mcq)
assert.equal(mcq.optionsFound, 4)
assert.ok(mcq.options[0].includes('3'))

const parsed = parseFromDocumentStructure(structure, mcqLines.join('\n'))
assert.ok(parsed)
assert.equal(parsed.kind, 'mcq')
assert.equal(parsed.pass, 'document-structure')
assert.ok((parsed.parsed?.optionsFound ?? 0) >= 4)

const refined = refineLineDataDiagramTypes(lineData, { width: 800, height: 1200 })
assert.ok(refined.every((l) => l.type))

const matrixLines = buildLineDataFromTesseractPage(
  fakePage([
    '(A) sin x',
    '(B) cos x',
    '(P) periodic',
    '(Q) bounded',
    '(R) differentiable',
    '(S) integrable',
  ]),
  { width: 800, height: 1200 },
)
const geo = matrixColsFromLineGeometry(
  refineLineDataDiagramTypes(matrixLines, { width: 800, height: 1200 }),
  { width: 800, height: 1200 },
)
assert.ok(geo)
assert.ok(geo.filled >= 2)

console.log('test-document-structure: ok')
