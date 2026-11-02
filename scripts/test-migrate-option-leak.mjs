import { migrateStoredQuestionText } from '../src/utils/migrateStoredQuestions.js'

const q = {
  id: 'leak-1',
  questionType: 'single_correct',
  text:
    'In the circuit shown, A and B are equal resistances. When S is closed, the capacitor C charges from the cell of emf E and reaches a steady state n A than in B. the same rate in A and B . is \\frac{1}{4}\\mathrm{CE}^{2} . is \\frac{1}{8}\\mathrm{CE}^{2}',
  options: [
    'During charging, more heat is produced in A than in B.',
    'In the steady state, heat is produced at the same rate in A and B .',
    'In the steady state, energy stored in C is \\frac{1}{4}\\mathrm{CE}^{2} .',
    'In the steady state, energy stored in C is \\frac{1}{8}\\mathrm{CE}^{2} .',
  ],
}

const out = migrateStoredQuestionText(q)
console.log('TEXT:', out.text)

const fail = []
if (/than in B/i.test(out.text)) fail.push('option A tail remains')
if (/same rate in A and B/i.test(out.text)) fail.push('option B tail remains')
if (/\\frac\{1\}\{8\}/.test(out.text)) fail.push('option D math remains')
if (!/reaches a steady state/i.test(out.text)) fail.push('legit stem truncated')
if (!/A and B are equal resistances/i.test(out.text)) fail.push('start damaged')
if ((out.options ?? []).length !== 4) fail.push('options count changed')

// Idempotent: re-running migration should not change the text further
const twice = migrateStoredQuestionText(out)
if (twice.text !== out.text) fail.push(`not idempotent: ${twice.text}`)

if (fail.length) {
  console.error('FAIL:', fail.join('; '))
  process.exit(1)
}
console.log('test-migrate-option-leak: ok')
