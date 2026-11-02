import { parseQuestionText } from '../src/utils/parseQuestionText.js'
import {
  findOptionsBlockStart,
  normalizeOptionMarkersInText,
} from '../src/utils/mcqOptionMarkers.js'

const ocr48 = `Which of the following is/are true?
(4) any four non-zero vectors in space will always be linearly independent.
(8) area of parallelogram with diagonals d1 = i - 2j + k and d2 = -i + 2j - 5k is equal to 2sqrt5 sq. units
(C) [a x b  b x c  a] = (a.b)[a b c]
(D) projection of i+j+k on -2i+2j+k is 113`

const ocr01 = `Which of the following is/are true?
(0) any four non-zero vectors in space will always be linearly independent.
(1) area of parallelogram with diagonals d1 = i - 2j + k is equal to 2sqrt5 sq. units
(2) scalar triple product
(3) projection is 1/3`

let ok = true
for (const [name, raw] of [
  ['(4)(8)', ocr48],
  ['(0)(1)', ocr01],
]) {
  const norm = normalizeOptionMarkersInText(raw)
  console.log('---', name, 'blockStart', findOptionsBlockStart(norm), 'hasA', /\(\s*A\s*\)/i.test(norm))
  const p = parseQuestionText(raw)
  console.log('found', p.optionsFound)
  p.options.forEach((o, i) => {
    const line = `${i} ${String.fromCharCode(65 + i)}: ${o ? o.slice(0, 50) : '(empty)'}`
    console.log(line)
    if (i < 2 && !o?.trim()) ok = false
  })
}
console.log(ok ? 'PASS' : 'FAIL')
