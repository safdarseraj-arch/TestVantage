import { parseQuestionText } from '../src/utils/parseQuestionText.js'
import { normalizeMathText, normalizeMatrixItemText } from '../src/utils/normalizeMathText.js'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'

const q =
  'A box contains $15$ green and $10$ yellow balls. If $10$ balls are randomly drawn one by one with replacement, then the variance of the number of green balls drawn is:(A) $\\frac{12}{5}$(B) $6$(C) $4$(D) $\\frac{6}{5}$'

const d = parseQuestionText(q)
console.log('parse stem:', d.text)
console.log('yellow?', d.text.includes('yellow'))
console.log('10 yellow?', /\$10\$\s*yellow|10\s*yellow/i.test(d.text))

const stemNorm = normalizeMathText(d.text)
console.log('normalizeMathText(stem):', stemNorm)
console.log('yellow after norm?', stemNorm.includes('yellow'))

const su = parseSingleQuestionUpload(q, q)
const stemNorm2 = normalizeMathText(su.text)
console.log('single upload text:', su.text)
console.log('after norm on su.text:', stemNorm2)
console.log('matrix item norm yellow?', normalizeMatrixItemText(d.text).includes('yellow'))
