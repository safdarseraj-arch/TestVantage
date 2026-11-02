import { prepareTextForMathTextDisplay } from '../src/utils/prepareMathForRender.js'
import katex from 'katex'

const single = 'If $x, y, z \\in \\mathbb{R}^{+}$ satisfy'
const double = 'If $x, y, z \\\\in \\\\mathbb{R}^{+}$ satisfy'

for (const [label, t] of [
  ['single', single],
  ['double', double],
]) {
  const disp = prepareTextForMathTextDisplay(t)
  const m = disp.match(/\$([^$]+)\$/)
  const latex = m?.[1] ?? ''
  console.log('---', label)
  console.log('latex:', latex)
  console.log('katex:', katex.renderToString(latex, { throwOnError: false }).replace(/<[^>]+>/g, ' ').slice(0, 80))
}
