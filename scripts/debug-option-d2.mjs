import { polishOcrText } from '../src/utils/ocrExtractPolish.js'
import { finalizeStemForBank } from '../src/utils/stemBankGuard.js'

const raw = '1/(f(x)g(x)) = 1 forall x > 0'
console.log('polish', polishOcrText(raw))
console.log('finalize', finalizeStemForBank(polishOcrText(raw)))
