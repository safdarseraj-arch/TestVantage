/**
 * Integration: fixture Gemini JSON → polish/finalize must preserve stem/options.
 * Guards against local OCR cleaners overwriting good AI LaTeX.
 */
import assert from 'node:assert/strict'
import {
  normalizeVisionExtract,
  normalizeVisionQuestion,
  validateVisionExtract,
  validateVisionQuestion,
} from '../src/utils/cloudVisionParse.js'
import { polishCloudVisionText, polishExtractedText } from '../src/utils/ocrExtractPolish.js'
import { finalizeStemForBank, stemLooksHighQualityLatex } from '../src/utils/stemBankGuard.js'
import { ocrEngineBadgeLabel } from '../src/utils/cloudVisionClient.js'
import { processMcqUploadExtract } from '../src/utils/uploadPipeline.js'

// —— Fixture: abs-π / sin one-sided limit (text options, full C/D) ——
const geminiAbsPi = {
  pageKind: 'typed',
  questions: [
    {
      number: 1,
      text: 'Let $f(x) = \\dfrac{|x+\\pi|}{\\sin x}$, then :',
      options: [
        '$f(-\\pi^{+}) = -1$',
        '$f(-\\pi^{-}) = 1$',
        '$\\lim_{x \\to -\\pi} f(x)$ does not exist',
        '$\\lim_{x \\to \\pi} f(x)$ does not exist',
      ],
      regionTypes: ['stemText', 'optionText'],
      answerKeyVisible: false,
      correctIndex: null,
    },
  ],
}

const absNorm = normalizeVisionExtract(geminiAbsPi)
assert.equal(absNorm.questions.length, 1)
assert.equal(absNorm.valid, true)
assert.equal(absNorm.confidence, 'high')
assert.match(absNorm.questions[0].text, /\\dfrac\{\|x\+\\pi\|\}\{\\sin x\}/)
assert.match(absNorm.questions[0].options[2], /does not exist/)
assert.match(absNorm.questions[0].options[3], /does not exist/)
assert.equal(absNorm.questions[0].correctIndex, undefined, 'must not invent Answer A')

const absPolished = polishExtractedText(absNorm.text, 'cloud-vision')
assert.match(absPolished, /\\pi/)
assert.match(absPolished, /does not exist/)
assert.doesNotMatch(absPolished, /\[Graph\s*A:/i)

const absStem = finalizeStemForBank(absNorm.questions[0].text, absNorm.questions[0].options)
assert.ok(stemLooksHighQualityLatex(absNorm.questions[0].text))
assert.match(absStem, /\\dfrac\{\|x\+\\pi\|\}\{\\sin x\}/)
assert.doesNotMatch(absStem, /\[Graph/i)
// Must NOT swap into an unrelated canonical exam stem
assert.match(absStem, /Let \$f\(x\)/)

// —— Fixture: good f'/f'' curve stem (not mangled) ——
const goodPrimes =
  "The curve $y = f(x)$ which satisfies the condition $f'(x) > 0$ and $f''(x) < 0$ for all real $x$, is :"
const geminiCurve = normalizeVisionQuestion({
  text: goodPrimes,
  options: ['', '', '', ''],
  regionTypes: ['stemText', 'optionGraph'],
  answerKeyVisible: false,
  correctIndex: 0, // guessed A — must drop
})
assert.equal(geminiCurve.correctIndex, undefined)
assert.match(geminiCurve.text, /f'\(x\)\s*>\s*0/)
assert.match(geminiCurve.text, /f''\(x\)\s*<\s*0/)
assert.equal(polishCloudVisionText(goodPrimes), polishExtractedText(goodPrimes, 'cloud-vision'))
const curveFinal = finalizeStemForBank(geminiCurve.text, geminiCurve.options)
assert.match(curveFinal, /f'\(x\)/)
assert.match(curveFinal, /f''\(x\)/)

// —— Graph invent stripped; text math kept ——
const invent = normalizeVisionQuestion({
  text: 'Which sketch matches?',
  options: [
    '[Graph A: Curve with local maximum]',
    '[Graph B: Decreasing concave-down]',
    'Graph C: Parabola opening up',
    '[Graph D: Flat then rise]',
  ],
  regionTypes: ['stemText', 'optionGraph'],
})
assert.deepEqual(invent.options, ['', '', '', ''])

// —— Incomplete C/D fails validation ——
const truncated = validateVisionQuestion(
  normalizeVisionQuestion({
    text: 'Let $f(x)=x$, then :',
    options: [
      '$f(-\\pi^{+})=-1$',
      '$f(-\\pi^{-})=1$',
      '$\\lim$',
      '',
    ],
    regionTypes: ['stemText', 'optionText'],
  }),
)
assert.equal(truncated.ok, false)
assert.ok(truncated.issues.includes('truncated-cd') || truncated.issues.includes('too-few-options'))

// —— Full extract validation ——
const v = validateVisionExtract(absNorm)
assert.equal(v.ok, true)
assert.equal(v.confidence, 'high')

// —— Badge stays "AI" ——
assert.equal(ocrEngineBadgeLabel('cloud-vision'), 'AI')
assert.equal(ocrEngineBadgeLabel('builtin'), 'AI')

// —— Idempotent light polish (π already correct) ——
const once = polishCloudVisionText('Let $f(x)=|x+\\pi|$')
const twice = polishCloudVisionText(once)
assert.equal(once, twice)
assert.match(once, /\\pi/)

// —— Piecewise cases from Gemini must not be rewritten by local OCR stack ——
const casesStem = `Given
$$
f(x)=\\begin{cases}
x^{2}e^{2(x-1)}, & 0\\le x\\le 1 \\\\
a\\operatorname{sgn}(x+1)\\cos(2x-2)+bx^{2}, & 1<x\\le 2
\\end{cases}
$$
If $f(x)$ is differentiable at $x=1$, then the value of $|a-b|$ is`
assert.ok(stemLooksHighQualityLatex(casesStem))
const casesPolished = polishExtractedText(casesStem, 'cloud-vision')
assert.match(casesPolished, /\\begin\{cases\}/)
assert.match(casesPolished, /\\operatorname\{sgn\}/)
assert.doesNotMatch(casesPolished, /asgn\s*\(|Usxst/)
const casesFinal = finalizeStemForBank(casesStem)
assert.match(casesFinal, /\\begin\{cases\}/)
assert.match(casesFinal, /e\^\{2\(x-1\)\}/)
assert.match(casesFinal, /\\\\/)
assert.match(casesFinal, /\\operatorname\{sgn\}/)

// Near-miss: missing \\\\ + bare "a sgn" must heal, not stay broken
const nearMiss = `Given $f(x)=\\begin{cases} x^{2}e^{2(x-1)}, & 0\\le x\\le 1 a sgn(x+1)\\cos(2x-2)+bx^{2}, & 1<x\\le 2 \\end{cases}$ If $f(x)$ is differentiable at $x=1$, then $|a-b|$ is`
const nearFinal = finalizeStemForBank(nearMiss)
assert.match(nearFinal, /\\\\/)
assert.match(nearFinal, /\\operatorname\{sgn\}/)
assert.doesNotMatch(nearFinal, /\ba\s+sgn\s*\(/)

// —— Heavy builtin after cloud must NOT be the Convert path (documents + guards) ——
{
  const light = polishExtractedText(casesStem, 'cloud-vision')
  const heavy = polishExtractedText(light, 'builtin')
  assert.match(light, /\$\$/)
  assert.notEqual(light, heavy, 'saved-image Convert must use engine polish only once')
  assert.doesNotMatch(light, /\$\$\$y\s*=\s*f\(x\)\$\$\$/)
  const curveLight = polishExtractedText(goodPrimes, 'cloud-vision')
  assert.doesNotMatch(curveLight, /\$\$\$/)
}

console.log('test-gemini-preserve-extract: ok')

// —— Continuity "Then f is:" SCQ must keep Gemini options (not |a-b| overwrite) ——
{
  const continuity = {
    pageKind: 'typed',
    questions: [
      {
        number: 1,
        text: 'Let $f(x)=\\begin{cases} x^{2}e^{2(x-1)}, & 0\\le x\\le 1 \\\\ a\\operatorname{sgn}(x+1)\\cos(2x-2)+bx^{2}, & 1<x\\le 2 \\end{cases}$. Then f is:',
        options: [
          'continuous but not differentiable',
          'differentiable but not continuous',
          'both continuous and differentiable',
          'neither',
        ],
        regionTypes: ['stemText', 'optionText'],
        answerKeyVisible: false,
      },
    ],
  }
  const contNorm = normalizeVisionExtract(continuity)
  assert.equal(contNorm.valid, true, 'continuity MCQ must validate (short D=neither ok)')
  assert.match(contNorm.questions[0].text, /Then f is:/)
  assert.equal(contNorm.questions[0].options[3], 'neither')
  const contExtracted = processMcqUploadExtract(contNorm.text, { engine: 'cloud-vision' })
  assert.match(contExtracted.parsed?.text ?? '', /Then f is:/)
  assert.doesNotMatch(contExtracted.parsed?.text ?? '', /value of \|a-b\|/)
  assert.equal(contExtracted.found, 4)
  assert.match(contExtracted.parsed?.options?.[0] ?? '', /continuous but not/)
  assert.equal(contExtracted.parsed?.options?.[3], 'neither')
}

console.log('test-gemini-preserve-extract: continuity ok')
