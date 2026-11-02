import assert from 'node:assert/strict'
import katex from 'katex'
import {
  validateAndRepairLatexInText,
  repairLatexForUpload,
  repairCorruptedLatexRight,
} from '../src/utils/latexValidateRepair.js'

const triple = 'Given\n$$f(x)=\\begin{cases}a\\\\ b\\end{cases}$$$\nIf $x=1$'
const fixedTriple = repairLatexForUpload(triple)
assert.ok(!fixedTriple.includes('$$$'), 'triple dollars collapsed')

const cases = 'Let $f(x)=\\begin{cases}1 & x>0\\\\ 0 & x=0\\end{cases}$'
const casesOut = validateAndRepairLatexInText(cases)
assert.ok(casesOut.text.includes('\\end{cases}'), 'cases block intact')

// MCL00004 Option C: \right corrupted to " ight" when JS \r escape eats \r
const mclOptC = '$\\ln\\left(\\frac{3}{2} ight)$'
const mclFixed = repairLatexForUpload(mclOptC)
assert.match(mclFixed, /\\right\)/, 'MCL00004 option C \\right restored')
const mclInner = mclFixed.match(/\$([^$]+)\$/)?.[1] ?? ''
const mclHtml = katex.renderToString(mclInner, { throwOnError: false })
assert.ok(!mclHtml.includes('katex-error'), 'MCL00004 option C KaTeX renders')

// JS literal \right → backslash + CR + ight
const jsCorrupt = `$\\ln\\left(\\frac{3}{2}${'\right'.slice(1)})$`
const jsFixed = repairCorruptedLatexRight(jsCorrupt)
assert.match(jsFixed, /\\right\)/, 'CR-corrupted \\right restored')

console.log('test-latex-validate-repair: ok')
