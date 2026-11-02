import { normalizeMathText } from '../src/utils/normalizeMathText.js'

const raw = `Which of the following is/are true?
(4) any four non-zero vectors
(8) area of parallelogram 2sqrt5
(C) scalar triple
(D) projection 113`

const norm = normalizeMathText(raw)
console.log('has (A):', /\(\s*A\s*\)/i.test(norm))
console.log('has (B):', /\(\s*B\s*\)/i.test(norm))
console.log(norm.slice(0, 400))