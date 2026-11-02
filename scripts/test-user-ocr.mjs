import { parsePassageWithSubQuestions, looksLikePassageMultiMcq } from '../src/utils/parsePassageUpload.js'
import { parseQuestionText } from '../src/utils/parseQuestionText.js'
import { normalizeMathText } from '../src/utils/normalizeMathText.js'

const ocr = `Consider the arrangement of numbers as shown such that $N_p$ represents number of terms of $p^{th}$ row and $S_p$ denotes sum of terms of $p^{th}$ row : ______ and so on On the basis of above information, answer the following questions : Value of $\\sum_{p=1}^{100} N_p$ is
(A) 10000
(B) 9801
(C) 5050
(D) 2401 Value of $\\frac{\\sum_{p=1}^{4} S_p}{\\sum_{p=5}^{\\infty} S_p}$ is -
(A) 16/3
(B) 5
(C) 6
(D) 19/3`

console.log('looksLike', looksLikePassageMultiMcq(ocr))
const p = parsePassageWithSubQuestions(ocr)
console.log('passage', p?.subQuestions?.length, 'passageLen', p?.passageText?.length)
p?.subQuestions?.forEach((q, i) => {
  console.log('Q' + (i + 1), 'stem len', q.text?.length, q.text?.slice(0, 80))
  console.log('  D=', q.options[3]?.slice(0, 80))
})

const norm = normalizeMathText(ocr)
console.log('\nnormalized passage', parsePassageWithSubQuestions(norm)?.subQuestions?.length)
const single = parseQuestionText(ocr)
console.log('single D=', single.options[3]?.slice(0, 120))

// inline options like bad OCR
const inline = ocr.replace(/\n/g, ' ')
console.log('\ninline looksLike', looksLikePassageMultiMcq(inline), 'passage', parsePassageWithSubQuestions(inline)?.subQuestions?.length)
