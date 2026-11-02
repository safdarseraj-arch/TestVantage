import { paperItemsFromMathpixOcr } from '../src/utils/mathpixQuestionSplit.js'
import { peelOfficialPyqParagraph, parsePyqParagraphQuestionNums } from '../src/utils/passage.js'

const disk =
  'A uniform circular disk of radius 0.2 m and mass 1 kg is pivoted at its top point C.'
const cap =
  'The difference in the capacitance (in F) between the metal plates at $t = 0$ and that at $t = 500$ s is $(8-n)\\epsilon_0$. The value of $n$ is:'

function subject(label, extra) {
  return `
\\section*{${label}}
\\section*{SECTION 4 (Maximum Marks: 12)}
Q. 16 ${cap} ${extra}
Question Stem for Question Nos. 17 and 18
${disk} ${label}
Q. 17 The speed of the disk in ${label} is $v$.
Q. 18 The force on the disk in ${label} is $F$.
`
}

const ocr = subject('MATHEMATICS', 'math-cap') + subject('PHYSICS', 'phys-cap') + subject('CHEMISTRY', 'chem-cap')
const items = paperItemsFromMathpixOcr(ocr, {
  paperMeta: { exam: 'jee-advanced', year: 2026, session: 'Paper 2' },
})

const nums = parsePyqParagraphQuestionNums('Question Stem for Question Nos. 17 and 18')
if (nums.join(',') !== '17,18') {
  console.error('nums', nums)
  process.exit(1)
}
const peeled = peelOfficialPyqParagraph(
  `Question Stem for Question Nos. 17 and 18\n${disk}\nQ. 17 The speed is $v$.`,
)
if (!peeled.passageText.includes('circular disk')) {
  console.error('peel passage', peeled)
  process.exit(1)
}
if (!/Q\.\s*17/.test(peeled.stem) && !/speed/.test(peeled.stem)) {
  console.error('peel stem', peeled.stem)
  process.exit(1)
}

const bad = items.filter((q) => {
  const text = String(q.text || '')
  const printed = Number(q.printedNumber)
  return /Question Stem for Question Nos/i.test(text) && printed !== 17 && printed !== 18
})
if (bad.length) {
  console.error('header on wrong card', bad.map((q) => [q.pyqSlot, q.printedNumber, q.text.slice(0, 80)]))
  process.exit(1)
}
const caps = items.filter((q) => /capacitance/i.test(q.text || ''))
if (caps.length !== 3) {
  console.error('cap count', caps.length, caps.map((q) => q.text.slice(0, 60)))
  process.exit(1)
}
for (const q of caps) {
  if (/Question Stem for Question Nos|circular disk/i.test(q.text || '')) {
    console.error('cap glued', q.pyqSlot, q.text.slice(0, 180))
    process.exit(1)
  }
}
const disks = items.filter((q) => /circular disk/i.test(`${q.passageText || ''} ${q.text || ''}`))
if (disks.length < 6) {
  console.error(
    'disk owners',
    disks.length,
    items.map((q) => `${q.pyqSlot}:${q.printedNumber}:${String(q.passageText || '').slice(0, 24)}`),
  )
  process.exit(1)
}
const wrongDisk = disks.filter((q) => {
  const n = Number(q.printedNumber)
  return n !== 17 && n !== 18
})
if (wrongDisk.length) {
  console.error('disk on wrong number', wrongDisk.map((q) => [q.pyqSlot, q.printedNumber]))
  process.exit(1)
}
console.log('ok', items.length, 'cards', disks.length, 'with disk passage')
