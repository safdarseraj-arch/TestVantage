import { parsePassageWithSubQuestions, looksLikePassageMultiMcq } from '../src/utils/parsePassageUpload.js'
import { normalizeMathText } from '../src/utils/normalizeMathText.js'
import { parseBulkQuestions } from '../src/utils/parseBulkQuestions.js'
import { normalizeOptionMarkersInText } from '../src/utils/mcqOptionMarkers.js'

const raw = `Consider the arrangement of numbers as shown such that N_p represents number of terms of p^{th} row and S_p denotes sum of terms of p^{th} row : ______ and so on On the basis of above information, answer the following questions : Value of sum N_p is -
A) 10000
B) 9801
C) 5050
D) 2401

10. Value of ratio S_p is -
A) 16/3
B) 5
C) 6
D) 19/3`

const norm = normalizeMathText(raw)
console.log('looksLike raw', looksLikePassageMultiMcq(raw))
console.log('parse raw', parsePassageWithSubQuestions(raw)?.subQuestions?.length)
console.log('looksLike norm', looksLikePassageMultiMcq(norm))
console.log('parse norm', parsePassageWithSubQuestions(norm)?.subQuestions?.length)
console.log('bulk norm', parseBulkQuestions(norm).length)
console.log('bulk raw', parseBulkQuestions(raw).length)

// Mathpix style: one line options
const inline = normalizeOptionMarkersInText(raw.replace(/\n/g, ' '))
console.log('parse inline', parsePassageWithSubQuestions(inline)?.subQuestions?.length)
