import assert from 'node:assert/strict'
import {
  looksLikeFgGraphPointDQuestion,
  repairFgGraphPointDMcqOcr,
  FG_GRAPH_POINT_D_STEM,
} from '../src/utils/repairFgGraphPointDMcqOcr.js'
import { polishOcrText } from '../src/utils/ocrExtractPolish.js'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'
import { shouldSkipOptionsAutoCrop, shouldStripMistakenOptionCrops } from '../src/utils/graphOptionOcr.js'

const garbled = `Let $y=f(x)$ and $y=g(x)$ be two functions. In the adjacent vy nN figure from point A on the graph of y=f(x) corresponding to the given value of the independent variable, a straight line is drawn parallel to the X-axis to intersect the bisector of the first and the third quadrants at B. From B a line parallel to the Y-axis is drawn to intersect yfl= gx) at C. Again from C parallel to the X-axis to intersect NN" at D. If NN' is parallel to Y-axis, then the \\ce{co}-ordinates of the point D are
(A) (f(xy), gtx)
(B) (Xp^8 ( %p))
(C) (xq &(f(Xp)))
(D) (f(xy), f(g (xo)`

assert.ok(looksLikeFgGraphPointDQuestion(garbled), 'detect f/g graph point D stem')

const repaired = repairFgGraphPointDMcqOcr(garbled)
assert.match(repaired, /bisector of the first and the third quadrants/i, 'canonical bisector phrase')
assert.match(repaired, /g\(f\(x_0\)\)/, 'option C has g(f(x0))')
assert.doesNotMatch(repaired, /vy\s+nN|yfl|Xp\^8|\\ce\{co\}/i, 'garble removed')

const polished = polishOcrText(garbled)
assert.match(polished, /co-ordinates of the point \$?D/i, 'polish keeps question ending')

const parsed = parseSingleQuestionUpload(garbled)
assert.equal(parsed.multi, false, 'single question')
assert.match(parsed.text ?? '', /y = f\(x\)/i, 'stem has f(x)')
assert.match(parsed.options?.[2] ?? '', /x_0,\s*g\(f\(x_0\)\)/, 'option C repaired')
assert.equal(parsed.options?.filter((o) => o.trim()).length, 4, 'four options')

const opts = parsed.options ?? []
assert.ok(
  shouldSkipOptionsAutoCrop(parsed.text ?? '', opts, garbled),
  'skip graph auto-crop for coordinate-pair MCQ',
)
assert.ok(
  shouldStripMistakenOptionCrops(parsed.text ?? '', opts, ['u1', 'u2', 'u3', 'u4']),
  'strip mistaken option crops',
)

assert.match(FG_GRAPH_POINT_D_STEM, /NN'/, 'canonical stem has NN prime')

console.log('test-fg-graph-point-d-ocr: ok')
