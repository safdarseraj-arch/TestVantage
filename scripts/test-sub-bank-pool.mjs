import {
  resolveSubBankType,
  SUB_BANK_TYPE_PYQ,
  SUB_BANK_TYPE_SIMILAR_PYQ,
} from '../src/utils/subBankType.js'
import { filterMasterPoolBySubBank } from '../src/utils/masterPool.js'

const pyq = { id: 'p1', officialPyq: true, bankSource: 'official_pyq' }
const similar = { id: 's1', similarToPyq: true, bankSource: 'similar_to_pyq' }
const normal = { id: 'n1', text: 'hello', options: ['a', 'b'], correctIndex: 0 }

if (resolveSubBankType(pyq) !== SUB_BANK_TYPE_PYQ) {
  console.error('expected pyq sub bank for official row')
  process.exit(1)
}
if (resolveSubBankType(similar) !== SUB_BANK_TYPE_SIMILAR_PYQ) {
  console.error('expected similar_pyq sub bank')
  process.exit(1)
}
if (resolveSubBankType(normal) !== 'normal') {
  console.error('expected normal sub bank')
  process.exit(1)
}

const pool = [pyq, similar, normal]
if (filterMasterPoolBySubBank(pool, SUB_BANK_TYPE_PYQ).length !== 1) {
  console.error('pyq filter count')
  process.exit(1)
}
if (filterMasterPoolBySubBank(pool, SUB_BANK_TYPE_SIMILAR_PYQ).length !== 1) {
  console.error('similar_pyq filter count')
  process.exit(1)
}

console.log('sub-bank pool tests ok')
