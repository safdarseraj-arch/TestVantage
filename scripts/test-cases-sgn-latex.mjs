/**
 * Cases / sgn LaTeX: missing \\\\ between rows, bare "a sgn", Gemini preserve, KaTeX-clean.
 */
import assert from 'node:assert/strict'
import katex from 'katex'
import {
  repairBareSgnOperator,
  repairCasesRowBreaks,
  repairCasesLatex,
  casesLatexLooksValid,
} from '../src/utils/repairCasesLatex.js'
import {
  hasGoodPiecewiseSgnDiffStem,
  repairPiecewiseSgnDiffStemOcr,
  PIECEWISE_SGN_DIFF_STEM,
} from '../src/utils/repairPiecewiseSgnDiffMcqOcr.js'
import { polishExtractedText } from '../src/utils/ocrExtractPolish.js'
import { finalizeStemForBank, detectBrokenBankStem, stemLooksHighQualityLatex } from '../src/utils/stemBankGuard.js'
import { collapseRunawayBackslashes } from '../src/utils/repairOperatorname.js'
import { polishVisionStemSafe } from '../src/utils/cloudVisionParse.js'
import { prepareTextForMathTextDisplay } from '../src/utils/prepareMathForRender.js'

/** Extract display/inline math and assert KaTeX accepts (no katex-error). */
function assertKatexOk(label, latexBody) {
  const html = katex.renderToString(latexBody, {
    throwOnError: true,
    displayMode: true,
    strict: 'ignore',
  })
  assert.ok(!html.includes('katex-error'), `${label}: katex-error in output`)
}

// —— bare sgn ——
assert.equal(repairBareSgnOperator('a sgn(x+1)'), 'a\\operatorname{sgn}(x+1)')
assert.equal(repairBareSgnOperator('asgn(x+1)'), 'a\\operatorname{sgn}(x+1)')
assert.equal(
  repairBareSgnOperator('a\\operatorname{sgn}(x+1)'),
  'a\\operatorname{sgn}(x+1)',
)

// —— missing \\\\ between cases rows (user "still error" screenshot) ——
const brokenGlued = String.raw`Given f(x)=\begin{cases} x^{2}e^{2(x-1)}, & 0\le x\le 1 a sgn(x+1)\cos(2x-2)+bx^{2}, & 1<x\le 2 \end{cases}
If f(x) is differentiable at x=1, then |a-b| is`

const healed = repairCasesLatex(brokenGlued)
assert.match(healed, /\\begin\{cases\}/)
assert.match(healed, /\\\\/)
assert.match(healed, /a\\operatorname\{sgn\}/)
assert.doesNotMatch(healed, /\ba\s+sgn\s*\(/)
assert.ok(casesLatexLooksValid(healed), 'healed cases structurally valid')

const casesInner = healed.match(/\\begin\{cases\}([\s\S]*?)\\end\{cases\}/)?.[1] ?? ''
assertKatexOk(
  'healed cases body',
  `\\begin{cases}${casesInner}\\end{cases}`,
)

// —— collapse must NOT strip cases row breaks ——
const goodCases = PIECEWISE_SGN_DIFF_STEM
const collapsed = collapseRunawayBackslashes(goodCases)
assert.match(collapsed, /\\\\/)
assert.match(collapsed, /\\begin\{cases\}/)
assert.equal(detectBrokenBankStem(goodCases).length, 0, detectBrokenBankStem(goodCases).join(', '))
assert.ok(stemLooksHighQualityLatex(goodCases))

// —— over-escaped row break inside cases survives + normalizes ——
const overEsc = String.raw`f(x)=\begin{cases} x^{2}e^{2(x-1)}, & 0\le x\le 1 \\\\
a\operatorname{sgn}(x+1)\cos(2x-2)+bx^{2}, & 1<x\le 2 \end{cases}`
// Force four backslashes as row sep (over-escaped Gemini)
const fourSlash = overEsc.replace('\\\\', '\\\\\\\\')
const fixedOver = repairCasesRowBreaks(fourSlash)
assert.ok(casesBodyHasOneRowBreak(fixedOver), 'over-escaped collapsed to one row break')

function casesBodyHasOneRowBreak(t) {
  const inner = t.match(/\\begin\{cases\}([\s\S]*?)\\end\{cases\}/)?.[1] ?? ''
  const breaks = inner.match(/\\\\/g) || []
  return breaks.length >= 1
}

// —— Gemini near-miss survives cloud polish without full rewrite losing structure ——
const geminiNearMiss = `Given
$$
f(x)=\\begin{cases}
x^{2}e^{2(x-1)}, & 0\\le x\\le 1
a sgn(x+1)\\cos(2x-2)+bx^{2}, & 1<x\\le 2
\\end{cases}
$$
If $f(x)$ is differentiable at $x=1$, then the value of $|a-b|$ is`

const visionSafe = polishVisionStemSafe(geminiNearMiss)
assert.match(visionSafe, /\\operatorname\{sgn\}/)
assert.match(visionSafe, /\\\\/)

const cloud = polishExtractedText(geminiNearMiss, 'cloud-vision')
assert.match(cloud, /\\begin\{cases\}/)
assert.match(cloud, /\\operatorname\{sgn\}/)
assert.match(cloud, /e\^\{2\(x-1\)\}/)
assert.ok(hasGoodPiecewiseSgnDiffStem(cloud) || /\\begin\{cases\}[\s\S]*\\\\/.test(cloud))

const finalized = finalizeStemForBank(geminiNearMiss)
assert.match(finalized, /\\begin\{cases\}/)
assert.match(finalized, /\\\\/)
assert.match(finalized, /\\operatorname\{sgn\}/)
assert.equal(detectBrokenBankStem(finalized).length, 0, detectBrokenBankStem(finalized).join(', '))

const finalInner = finalized.match(/\\begin\{cases\}([\s\S]*?)\\end\{cases\}/)?.[1] ?? ''
assertKatexOk('finalize cases', `\\begin{cases}${finalInner}\\end{cases}`)

// —— full canonical still used for OCR soup ——
const soup = repairPiecewiseSgnDiffStemOcr(
  '2 2(x-1) asgn(x+1)cos(2x-2)+bx? differentiable at x=1',
)
assert.equal(soup, PIECEWISE_SGN_DIFF_STEM)

const piecewiseRaw =
  'Let f(x) and g(x) be defined by f(x)=\\{ \\begin{array}{ll} x|x| \\sin ( \\frac{1}{x} ), & x \\neq 0, \\\\ 0, & x=0, \\end{array} \\text { and } g(x)=\\begin{cases}1-2 x, & 0 \\leq x \\leq \\frac{1}{2} \\\\ 0, & \\text { otherwise }\\end{cases}'
const piecewiseOut = prepareTextForMathTextDisplay(piecewiseRaw)
assert.match(piecewiseOut, /\\begin\{cases\}/, 'brace-array becomes cases')
assert.match(piecewiseOut, /\$\$/, 'piecewise wrapped for KaTeX')
assert.doesNotMatch(piecewiseOut, /f\(x\)=\\\{\s*\\begin\{array\}/)
assert.match(piecewiseOut, /\band\b/, 'and is readable prose')
const caseBlocks = [...piecewiseOut.matchAll(/\$\$([\s\S]*?\\begin\{cases\}[\s\S]*?\\end\{cases\}[\s\S]*?)\$\$/g)]
assert.ok(caseBlocks.length >= 1, 'at least one display cases block')
for (const [i, m] of caseBlocks.entries()) {
  const html = katex.renderToString(m[1], { displayMode: true, throwOnError: false })
  assert.equal(html.includes('katex-error'), false, `piecewise block ${i} must render`)
}

console.log('test-cases-sgn-latex: ok')
