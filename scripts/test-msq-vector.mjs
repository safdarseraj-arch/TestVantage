import { normalizeMathText } from '../src/utils/normalizeMathText.js'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'
import { prepareTextForMathTextDisplay } from '../src/utils/prepareMathForRender.js'

const messyOcr = `Which of the following is/are true?
(A) any four non-zero vectors in space will always be linearly independent.
(B) area of parallelogram with diagonals d1 = i - 2j + k and d2 = -i + 2j - 5k is equal to 2sqrt5 sq. units
(C) [a x b  b x c  a] = (a.b)[a b c]
(D) projection of i+j+k on -2i+2j+k is 113`

const normalized = normalizeMathText(messyOcr)
const parsed = parseSingleQuestionUpload(normalized)

console.log('=== STEM ===')
console.log(parsed.text)
console.log('\n=== OPTIONS ===')
parsed.options.forEach((o, i) => {
  console.log(`${String.fromCharCode(65 + i)}:`, o)
  const preview = prepareTextForMathTextDisplay(o, {
    questionContext: normalized,
    optionLetter: String.fromCharCode(65 + i),
  })
  const ok =
    (i === 0 && /linearly independent/.test(o)) ||
    (i === 1 && /\\frac\{1\}\{2\}.*\\sqrt\{5\}|2\\sqrt\{5\}/.test(o) && /\\vec\{d\}_\{1\}/.test(o)) ||
    (i === 2 && /\\vec\{a\}.*\\times.*\\vec\{b\}/.test(o)) ||
    (i === 3 && /\\frac\{1\}\{3\}/.test(preview))
  console.log('  preview OK:', ok ? 'YES' : 'NO', '|', preview.slice(0, 80))
})

console.log('\n=== AUTO ===')
console.log('type:', parsed.suggestedQuestionType)
console.log('correct:', parsed.suggestedCorrectIndices)
console.log('complete:', parsed.complete)

const pass =
  parsed.complete &&
  parsed.suggestedQuestionType === 'multiple_correct' &&
  parsed.suggestedCorrectIndices?.join() === '1,3' &&
  /\\vec\{d\}_\{1\}/.test(parsed.options[1]) &&
  /\\frac\{1\}\{3\}/.test(parsed.options[3])

console.log('\n', pass ? 'ALL OK' : 'FAIL')
