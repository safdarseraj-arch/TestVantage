import { parseQuestionText } from '../src/utils/parseQuestionText.js'
import { prepareTextForMathTextDisplay } from '../src/utils/prepareMathForRender.js'
import { repairMcqOptionForDisplay } from '../src/utils/repairMcqOption.js'
import { trimTrailingProseAfterMath, trimQuestionLeakFromOption } from '../src/utils/optionStemLeak.js'

const stem =
  'If $\\vec{a}=\\hat{i}-\\hat{j}+\\hat{k}$ and $\\vec{b}=2 \\hat{i}+4 \\hat{j}+3 \\hat{k}$ are one of the sides and medians respectively, of a triangle through the same vertex, then area of triangle is-'

const ctx = `${stem}\n(A) $\\sqrt{86}$\n(B) $\\frac{1}{2}\\sqrt{86}$\n(C) $\\frac{1}{2}\\sqrt{84}$\n(D) $\\sqrt{80}$`

const broken = [
  '$\\frac{1}{2}$$1$',
  '$\\frac{1}{2}$1$',
  '$\\frac{1}{2}$',
  '$$1$',
  '$\\frac{1}{2}$ $\\sqrt{86}$',
  '$\\frac{1}{2}$ \\sqrt{86}$',
  '$$\\frac{5}{85}$',
  '$\\frac{5}{85}$',
  '$\\frac{1}{2}\\sqrt{86}$ when the area is found If $\\vec{a}$',
]

for (const b of broken) {
  const out = prepareTextForMathTextDisplay(b, { questionContext: ctx, optionLetter: 'B' })
  const ok = /\\sqrt\{86\}/.test(out) && !/when the area/.test(out)
  console.log(JSON.stringify(b), '→', out, ok ? 'OK' : 'FAIL')
}

const userOcr = `${stem}\n\n1 1\n(A) 86 (B)$$\\frac{5}{85}$ (C) 581 (D) 80`
const parsedUser = parseQuestionText(userOcr)
console.log('\nuser OCR B:', parsedUser.options[1])

const raw = `${stem}\n(A) $\\sqrt{86}$\n(B) $\\frac{1}{2}$$1$\n(C) $\\frac{1}{2}\\sqrt{84}$\n(D) $\\sqrt{80}$`
const parsed = parseQuestionText(raw)
console.log('\nparse B:', parsed.options[1])
console.log('has sqrt86:', /\\sqrt\{86\}/.test(parsed.options[1]) ? 'OK' : 'FAIL')

const leakB = '$\\frac{1}{2}\\sqrt{86}$ when the area is found If $\\vec{a}$'
const repaired = repairMcqOptionForDisplay(leakB, 'B', ctx, stem)
console.log('\nrepair leak B:', repaired)
console.log('no prose:', !/when the area/.test(repaired) ? 'OK' : 'FAIL')

const parallelogramB =
  'area of parallelogram with diagonals $\\vec{d}_{1}=\\hat{i}-2\\hat{j}+\\hat{k}$ and $\\vec{d}_{2}=-\\hat{i}+2\\hat{j}-5\\hat{k}$ is equal to $2\\sqrt{5}$ sq. units'
const msqStem = 'Which of the following is/are true?'
let pb = trimTrailingProseAfterMath(parallelogramB)
pb = trimQuestionLeakFromOption(pb, msqStem)
console.log('\nparallelogram trim:', pb)
console.log('2sqrt5 tail:', /is equal to.*2\\sqrt\{5\}.*sq/i.test(pb) ? 'OK' : 'FAIL')
