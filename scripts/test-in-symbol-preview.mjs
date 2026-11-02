import { normalizeMathText } from '../src/utils/normalizeMathText.js'
import { prepareTextForMathTextDisplay } from '../src/utils/prepareMathForRender.js'
import katex from 'katex'

function preview(latex) {
  try {
    return katex.renderToString(latex, { throwOnError: false }).includes('katex-error') ? 'ERROR' : 'OK'
  } catch {
    return 'ERR'
  }
}

const cases = [
  ['plain in R+', 'If x, y, z in R+ satisfy xyz = 1, then y & z are in'],
  ['split dollars', 'If $x, y, z $ \\in \\mathbb{R}^{+}$ satisfy $xyz=1$'],
  ['ampersand', 'then $y \\& z$ are in'],
  ['mathpix', 'If $x, y, z \\in \\mathbb{R}^{+}$ satisfy $xyz\\left(\\frac{1}{y^{2}}\\right)=1$, then $x,$ $y$ \\& $z$ are in'],
]

for (const [label, raw] of cases) {
  const norm = normalizeMathText(raw)
  const disp = prepareTextForMathTextDisplay(norm)
  const firstMath = disp.match(/\$([^$]+)\$/)?.[1] ?? ''
  console.log('---', label)
  console.log('display sample:', disp.slice(0, 90))
  if (firstMath) console.log('first math:', firstMath, '->', preview(firstMath))
  if (/backslash|\\&/.test(disp) && !disp.includes('\\text{ and }')) console.log('^^ may still show bad &')
}
