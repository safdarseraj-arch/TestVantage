import { prepareTextForMathTextDisplay } from '../src/utils/prepareMathForRender.js'
import { wrapBareFracExpressions } from '../src/utils/latexBraceMatch.js'

const stem =
  'Let $$ A = \\begin{bmatrix}2 & 0 & 1 \\\\ 1 & 0 & 2 \\\\ 2 & 1 & 1 \\end{bmatrix}$$ then absolute value of \\frac{\\left|(\\mathrm{A}-\\mathrm{I})^{3}-5 \\mathrm{~A}\\right|}{128} is'

const out = prepareTextForMathTextDisplay(stem)
const twice = prepareTextForMathTextDisplay(out)

if (!/\$\\frac\{\\left\|/.test(out)) {
  throw new Error(`fraction not wrapped: ${out}`)
}
if (/\\\$\\\$/.test(out) || /Let\s+\$\$\s+A/.test(out)) {
  throw new Error(`stray $$ visible in source: ${out}`)
}
if (out !== twice) throw new Error(`not idempotent: ${twice}`)
if (!/then absolute value of \$\\frac/.test(out)) {
  throw new Error(`prose/frac split wrong: ${out}`)
}

const bare = wrapBareFracExpressions(
  'then absolute value of \\frac{\\left|(\\mathrm{A}-\\mathrm{I})^{3}-5 \\mathrm{~A}\\right|}{128} is',
)
if (!bare.includes('$\\frac{\\left|')) throw new Error(`wrapBareFrac failed: ${bare}`)

console.log('ok:', out.slice(0, 160))
