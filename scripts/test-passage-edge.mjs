import { parsePassageWithSubQuestions } from '../src/utils/parsePassageUpload.js'

const cases = [
  ['D merged with Q2 stem on same line', `Passage N_p S_p rows.

Value of sum N_p is -
A) 10000
B) 9801
C) 5050
D) 2401 10. Value of ratio S_p is -
A) 16/3
B) 5
C) 6
D) 19/3`],
  ['no newline before 10.', `Passage text here long enough for test.

Value of sum N_p is -
(A) 10000
(B) 9801
(C) 5050
(D) 2401
10. Value of ratio S_p is -
(A) 16/3
(B) 5
(C) 6
(D) 19/3`],
  ['only one Value of in OCR garbage', `Passage N_p S_p.

Value of sum N_p is -
A) 10000
B) 9801
C) 5050
D) 2401 10. ratio S_p is -
A) 16/3
B) 5
C) 6
D) 19/3`],
  ['Q2 stem without Value of', `Passage N_p S_p rows long enough here.

Value of sum N_p is -
(A) 10000
(B) 9801
(C) 5050
(D) 2401
10. ratio S_p is -
(A) 16/3
(B) 5
(C) 6
(D) 19/3`],
  ['inline parens one block', `Passage here.
Value of sum N_p is - (A) 10000 (B) 9801 (C) 5050 (D) 2401 10. ratio S_p is - (A) 16/3 (B) 5 (C) 6 (D) 19/3`],
  [
    'grid summation no ABCD labels',
    `Consider the arrangement N_p S_p pth row fractions I II III and so on On the basis of above information answer the following questions Value of $\\sum_{p=1}^{100} N_p$ is - 10000 9801 5050 2401 Value of $\\frac{\\sum_{p=1}^{4} S_p}{\\sum_{p=5}^{\\infty} S_p}$ is - 16/3 5 6 19/3`,
  ],
]

for (const [name, v] of cases) {
  const p = parsePassageWithSubQuestions(v)
  console.log('\n===', name, '===')
  console.log('count', p?.subQuestions?.length ?? 0)
  p?.subQuestions?.forEach((q, i) => {
    console.log('Q' + (i + 1), 'stem:', q.text)
    console.log('    D=', JSON.stringify(q.options[3]))
    console.log('    all=', q.options)
  })
  if (name === 'grid summation no ABCD labels' && p?.subQuestions?.length === 2) {
    const q1 = p.subQuestions[0]
    if (!/\\sum_\{p=1\}\^\{100\}/.test(q1.text ?? '')) {
      console.error('FAIL: Q1 stem should keep summation LaTeX')
      process.exitCode = 1
    }
    if (/\b10000\b/.test(q1.text ?? '')) {
      console.error('FAIL: Q1 stem should not include option numbers')
      process.exitCode = 1
    }
    if (q1.options.filter((o) => o.trim()).length < 4) {
      console.error('FAIL: Q1 should have 4 parsed options')
      process.exitCode = 1
    }
  }
}
