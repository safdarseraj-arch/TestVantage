import { looksLikePassageMultiMcq, resolvePassageUpload } from '../src/utils/parsePassageUpload.js'
import { looksLikeMatchColumnUpload } from '../src/utils/parseMatchColumnUpload.js'
import { parseQuestionText } from '../src/utils/parseQuestionText.js'

const q = `Let $A$ and $B$ be two independent events such that $P(A \\cup B) = \\frac{5}{6}$ and $P(A \\cap B) = \\frac{1}{3}$. If $P(A) > P(B)$, then the value of $P(A) - P(B)$ is:(A) $\\frac{1}{6}$(B) $\\frac{1}{3}$(C) $\\frac{1}{2}$(D) $\\frac{2}{3}$`

console.log('passage?', looksLikePassageMultiMcq(q))
console.log('passage parse', resolvePassageUpload(q) ? 'yes' : 'no')
console.log('matrix?', looksLikeMatchColumnUpload(q))
const d = parseQuestionText(q)
console.log('single', d.optionsFound, d.parsed, d.options)
