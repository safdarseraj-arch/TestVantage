import assert from 'node:assert/strict'
import { normalizeStemForStorage, persistQuestionForBank } from '../src/utils/persistUpload.js'
import { resolvePassageUpload } from '../src/utils/parsePassageUpload.js'

const shattered = `Let $F(a, b) = \\log _{b} a, (a > 0, b > 0, b \\neq 1) then evaluate: F(\\sqrt{2}, 4)+F\\left(2 \\sqrt{2}, 4^{3}\\right)+F\\left((\\sqrt{2})^{99}, 4^{99}\\right)$`
const fixed = normalizeStemForStorage(shattered)
assert.ok(!/\\backslash\\text/.test(fixed), 'stored stem must not keep shattered left')

const ocr = `An expression $F(a, b)$ takes two inputs. For example $F(1,1)=3$.
Let$F(a, b)=\\log _{b} a$then evaluate:$F(\\sqrt{2}, 4)+F\\left(2 \\sqrt{2}, 4^{3}\\right)$
Consider the quadratic expression $f(x, b)=x^{2}+b x+4$.Let $g(b)$ be minimum of $f(x, b)$.`
const parsed = resolvePassageUpload(ocr, ocr, { allowOptionless: true })
assert.equal(parsed?.subQuestions?.length, 2)
assert.ok(!/Consider\s+the\s+quadratic/i.test(parsed.passageText))

const parent = {
  id: 'p1',
  questionType: 'passage_integer',
  passageText: parsed.passageText,
  text: parsed.subQuestions[0].text,
  correctInteger: 12 }
const child = {
  id: 'c1',
  passageId: 'p1',
  questionType: 'integer',
  text: parsed.subQuestions[1].text,
  correctInteger: 5 }
const persisted = persistQuestionForBank(child, [parent, child])
assert.equal(persisted.questionType, 'passage_integer')
assert.ok(!/\\backslash\\text/.test(persisted.text ?? ''))

console.log('test-persist-upload: ok')
