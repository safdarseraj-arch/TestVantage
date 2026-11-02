import { parseQuestionText } from '../src/utils/parseQuestionText.js'
import { repairMcqOptionForDisplay, buildMcqPreviewContext } from '../src/utils/repairMcqOption.js'

const stem =
  'If $\\vec{a}=\\hat{i}-\\hat{j}+\\hat{k}$ and $\\vec{b}=2 \\hat{i}+4 \\hat{j}+3 \\hat{k}$ are one of the sides and medians respectively, of a triangle through the same vertex, then area of triangle is-'

const raw = `${stem}
(A) $\\sqrt{86}$
(B) $\\frac{1}{2}\\sqrt{86}$
(C) $\\frac{1}{2}\\sqrt{84}$
(D) $\\sqrt{80}$ ${stem}`

const r = parseQuestionText(raw)
console.log('D:', r.options[3])
console.log('D has stem leak:', r.options[3].includes('medians respectively') ? 'FAIL' : 'OK')
console.log('stem length:', r.text.length)

const lines = `${stem}
(A) 86
(B) half
(C) half84
If $\\vec{a}=\\hat{i}$ and $\\vec{b}=2\\hat{i}$ are one of the sides and medians respectively, of a triangle
(D) 80`

const r2 = parseQuestionText(lines)
console.log('\nline-append D:', r2.options[3])
console.log('D leak:', /medians respectively/.test(r2.options[3]) ? 'FAIL' : 'OK')

const pollutedD = `$\\sqrt{80}$ ${stem}`
const ctx = buildMcqPreviewContext({
  questionText: stem,
  options: ['a', 'b', 'c', pollutedD],
  forOptionRepair: true,
})
const repaired = repairMcqOptionForDisplay(pollutedD, 'D', ctx, stem)
console.log('\nrepair D:', repaired)
console.log('repair leak:', /medians respectively/.test(repaired) ? 'FAIL' : 'OK')
