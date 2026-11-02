import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'
import { polishOcrText } from '../src/utils/ocrExtractPolish.js'

const samples = [
  `f(x) = x / ln x and g (x) = ln x / x . Then identify the CORRECT statement
(A) 1 / g (x) and f (x) are identical functions
(B) 1 / f (x) and g (x) are identical functions
(C) f(x) . g(x) = 1 for all x > 0
(D) 1 / (f(x) . g(x)) = 1 for all x > 0`,
  `f fix) = . and g (x) = -. Then identify the CORRECT statement
(A) 7) and f(x) are identical functions
(B) T(x) and g(x) are identical functions
(C) f(x) g(x) = 1 forall x > 0
(D) 1/(f(x)g(x)) = 1 forall x > 0`,
  `f(x)= x/lnx and g(x)= lnx/x Then identify the CORRECT statement (A) 1/g(x) and f(x) are identical functions (B) 1/f(x) and g(x) are identical functions (C) f(x).g(x)=1 forall x>0 (D) 1/(f(x)g(x))=1 forall x>0`,
  `f fix) = . and g (x) = -. Then identify the CORRECT statement
(A) 7) and f(x) are identical functio
(B) T(x) and g(x) are identical functions
(C) f(x) g(x) = 1 forall x > 0`,
]

for (const s of samples) {
  const p = polishOcrText(s)
  const r = parseSingleQuestionUpload(p, s)
  console.log('---')
  console.log('found', r.optionsFound)
  console.log('text', r.text?.slice(0, 100))
  console.log('opts', r.options?.map((o) => o?.slice(0, 60)))
}
