import { sanitizeMathDelimiters } from '../src/utils/sanitizeMathDelimiters.js'
import { prepareMathForRender } from '../src/utils/prepareMathForRender.js'
import { wrapBareLatexOutsideDollars } from '../src/utils/prepareMathForRender.js'

const d = '$$\\frac{1}{2}\\sqrt{84}$'
const ctx = 'area of triangle medians\n(D) ' + d

console.log('sanitize...')
const s = sanitizeMathDelimiters(ctx)
console.log('sanitize ok:', s.split('\n').pop())

console.log('prepare...')
const p = prepareMathForRender(s.split('\n').pop())
console.log('prepare ok:', p)

console.log('wrap...')
const w = wrapBareLatexOutsideDollars(p)
console.log('wrap ok:', w)
