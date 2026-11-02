import { polishExtractedText } from '../src/utils/ocrExtractPolish.js'
import { parseBulkQuestions, splitIntoQuestionBlocks } from '../src/utils/parseBulkQuestions.js'
import { readFileSync } from 'node:fs'

const samplePath = process.argv[2]
const sample = samplePath
  ? readFileSync(samplePath, 'utf8')
  : `1. Which of the following best suits the graph of f(x) = Sgn | x | (A) (B) (C) (D)
2. If f(x) = hat{i} 2 , then the value of is - (A) 0 (B) 1 (C) 2 (D) 3
3. Given the graphs of the two functions (A) (B) (C) (D)
4. Which of the following function is surjective but not injective (A) f : R to R (B) opt (C) opt (D) opt frac 5. If f : R to R is a function (A) 4 (B) 8 (C) 32 (D) 64
6. f : R to R such that f(x) = ln x (A) 1 (B) e (C) 2 (D) 3
7. Let f : R to R be a real valued function such that f(10+x)=f(10-x) (A) odd periodic (B) odd aperiodic (C) even periodic (D) even aperiodic

--- page ---

8. Let f(x) = and let g(x) = (A) 1 (B) 2 (C) 3 (D) 5
9. Let f (x) = sin 2 x (A) T1 (B) T2 (C) T3 (D) T4
10. If the domain of f(x) is [-1,2] then (A) a (B) b (C) c (D) d`

const polished = polishExtractedText(sample, 'builtin')
console.log('RAW blocks', splitIntoQuestionBlocks(sample).length, 'bulk', parseBulkQuestions(sample).length)
console.log('POL blocks', splitIntoQuestionBlocks(polished).length, 'bulk', parseBulkQuestions(polished).length)
console.log('--- polished head ---')
console.log(polished.slice(0, 400))
