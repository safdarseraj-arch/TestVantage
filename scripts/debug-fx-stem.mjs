import { repairFunctionalEquationStemOcr } from '../src/utils/repairFunctionalEquationStemOcr.js'
import { polishOcrText } from '../src/utils/ocrExtractPolish.js'
import { stemForLivePreview } from '../src/utils/stemBankGuard.js'

const raw =
  "The function f is not defined for x= 0, but for all non zero real number x, f(x) + 2f 2) =3x. The X equation f(x) = f(-x) is satisfied by"

console.log('repair:', repairFunctionalEquationStemOcr(raw))
console.log('polish:', polishOcrText(raw))
console.log('live:', stemForLivePreview(raw))
