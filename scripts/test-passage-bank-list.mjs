import assert from 'node:assert/strict'
import {
  bankListVisibleQuestions,
  collapsePassageChildrenForBankList,
  getPassageSetListLabel,
} from '../src/utils/passageBankList.js'
import { getPassageSetQuestions } from '../src/utils/passage.js'

const bank = [
  {
    id: 'p1',
    subject: 'physics',
    questionType: 'passage_integer',
    passageText: 'Van der Waals gas passage.',
    text: 'Q1 stem',
    correctInteger: 1,
    contentMode: 'hybrid',
  },
  {
    id: 'c1',
    subject: 'physics',
    questionType: 'passage_integer',
    passageId: 'p1',
    text: 'Q2 stem',
    correctInteger: 2,
    contentMode: 'hybrid',
  },
]

assert.equal(collapsePassageChildrenForBankList(bank).length, 1)
assert.equal(bankListVisibleQuestions(bank, {}).length, 1)
assert.equal(getPassageSetListLabel(bank[0], bank), 'PIVQ set · 2 questions')

const set = getPassageSetQuestions(bank[1], bank)
assert.equal(set?.length, 2)

console.log('test-passage-bank-list: ok')
