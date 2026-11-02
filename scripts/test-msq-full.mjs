import { normalizeMathText } from '../src/utils/normalizeMathText.js'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'
import { polishMcqOptionBody } from '../src/utils/polishMcqOptionBody.js'
import { buildMcqPreviewContext } from '../src/utils/repairMcqOption.js'

const messy = `Which of the following is/are true?
(A) any four non-zero vectors in space will always be linearly independent.
(B) area of parallelogram with diagonals d1 = i - 2j + k and d2 = -i + 2j - 5k is equal to 2sqrt5 sq. units
(C) [a x b  b x c  a] = (a.b)[a b c]
(D) projection of i+j+k on -2i+2j+k is 113`

function polishOptions(stem, options, raw) {
  const ctx = buildMcqPreviewContext({
    extractedRaw: raw,
    questionText: stem,
    options,
    forOptionRepair: true,
  })
  return options.map((o, i) =>
    polishMcqOptionBody(o, String.fromCharCode(65 + i), ctx, stem),
  )
}

function check(label, opts) {
  console.log(`\n=== ${label} ===`)
  const checks = [
    [0, /linearly independent/, 'A'],
    [1, /2\\sqrt\{5\}.*sq\.?\s*units/i, 'B area'],
    [1, /\\vec\{d\}_\{1\}/, 'B d1'],
    [2, /\\vec\{a\}.*\\times.*\\vec\{b\}/, 'C'],
    [3, /\\frac\{1\}\{3\}/, 'D'],
  ]
  let ok = true
  for (const [i, re, name] of checks) {
    const pass = re.test(opts[i] ?? '')
    if (!pass) ok = false
    console.log(`  ${pass ? 'OK' : 'FAIL'} ${name}:`, (opts[i] ?? '').slice(0, 100))
  }
  return ok
}

const norm = normalizeMathText(messy)
const parsed = parseSingleQuestionUpload(norm)
const polished = polishOptions(parsed.text, parsed.options, norm)
const pass = check('messy pipeline', polished)
console.log('suggestedCorrectIndices:', parsed.suggestedCorrectIndices)
console.log(pass ? 'PASS' : 'FAIL')

// Regression: vector MSQ must not become fraction MCQ options
const badFraction = /\$\\frac\{49\}\{4\}\$/.test(polished[1] ?? '')
if (badFraction) {
  console.log('REGRESSION: option B became 49/4 fraction')
  process.exit(1)
}
process.exit(pass ? 0 : 1)
