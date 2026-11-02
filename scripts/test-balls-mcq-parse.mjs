import { normalizeOptionMarkersInText } from '../src/utils/mcqOptionMarkers.js'
import { parseQuestionText } from '../src/utils/parseQuestionText.js'
import { looksLikePassageMultiMcq } from '../src/utils/parsePassageUpload.js'
import { normalizeMathText, normalizeQuestionStemText } from '../src/utils/normalizeMathText.js'
import { parseBulkQuestions } from '../src/utils/parseBulkQuestions.js'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'

const variants = [
  `A box contains $15$ green and $10$ yellow balls. If $10$ balls are randomly drawn one by one with replacement, then the variance of the number of green balls drawn is:(A) $\\frac{12}{5}$(B) $6$(C) $4$(D) $\\frac{6}{5}$`,
  ` A box contains $15$ green and $10$ yellow balls. If $10$ balls are randomly drawn one by one with replacement, then the variance of the number of green balls drawn is:(A) $\\frac{12}{5}$(B) $6$(C) $4$(D) $\\frac{6}{5}$   `,
  `A box contains $15$ green and $10$ yellow balls. If $10$ balls are randomly drawn one by one with replacement, then the variance of the number of green balls drawn is:\n(A) $\\frac{12}{5}$\n(B) $6$\n(C) $4$\n(D) $\\frac{6}{5}$`,
]

for (let i = 0; i < variants.length; i++) {
  const q = variants[i]
  const d = parseQuestionText(q)
  console.log('--- variant', i, '---')
  console.log('norm has newlines before B?', /\n\(B\)/.test(normalizeOptionMarkersInText(q)))
  console.log('found', d.optionsFound, 'parsed', d.parsed)
  console.log('stem end', d.text?.slice(-60))
  console.log('opts', d.options)
  console.log('passage?', looksLikePassageMultiMcq(q))
  const norm = normalizeMathText(q)
  const dn = parseQuestionText(norm)
  console.log('after normalizeMathText found', dn.optionsFound, 'stem len', dn.text?.length)
}

const q = variants[0]
console.log('bulk count', parseBulkQuestions(q).length)
const su = parseSingleQuestionUpload(q, q)
console.log('single upload multi', su.multi, 'found', su.optionsFound, 'complete', su.complete)
const stemNorm = normalizeQuestionStemText(su.text)
console.log(
  'stem keeps yellow?',
  stemNorm.includes('yellow'),
  '|',
  stemNorm.includes('10$ yellow') || stemNorm.includes('$10$ yellow'),
)
if (!stemNorm.includes('yellow')) {
  console.error('FAIL: stem lost yellow after normalizeQuestionStemText')
  process.exit(1)
}

