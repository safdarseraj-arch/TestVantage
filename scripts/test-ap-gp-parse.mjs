import { parseQuestionText } from '../src/utils/parseQuestionText.js'
import { normalizeMathText } from '../src/utils/normalizeMathText.js'
import { countRealMcqOptions } from '../src/utils/stemDiagramDetect.js'

const raw =
  'If x, y, z in R+ satisfy xyz (1/y^2 z^2 + 25/x^2 z^2 + 81/x^2 y^2) = 45/x + 9/y + 5/z, then x, y and z are in (A) A.P. (B) G.P. (C) H.P. (D) A.G.P.'

const norm = normalizeMathText(raw)
const p = parseQuestionText(norm)
console.log('normalized tail:', norm.slice(-60))
console.log('options:', p.options)
console.log('found:', p.optionsFound, 'real:', countRealMcqOptions(p.text, p.options))

const noMarkers =
  'If x, y, z in R+ satisfy ... then x, y and z are in A.P. G.P. H.P. A.G.P.'
const p2 = parseQuestionText(noMarkers)
console.log('no markers:', p2.optionsFound, p2.options)
