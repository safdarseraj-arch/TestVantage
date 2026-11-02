/**
 * Single MCQ must not be typed/routed as passage (upload-gate type detection).
 */
import assert from 'node:assert/strict'
import { looksLikePassageMultiMcq, resolvePassageUpload } from '../src/utils/parsePassageUpload.js'
import { classifyUploadFromOcr } from '../src/utils/classifyUploadFromOcr.js'
import { processMcqUploadExtract } from '../src/utils/uploadPipeline.js'

const singleMcqs = [
  [
    'which-of-following',
    `Which of the following is true for an ideal gas at constant temperature?
(A) PV = nRT
(B) P = nRT
(C) V = nRT
(D) T = nRT`,
  ],
  [
    'answer-following-one-mcq',
    `Read the paragraph about gases carefully. Pressure and volume are related by Boyle's law.
Answer the following questions:
The value of the constant for this sample is
(A) 1
(B) 2
(C) 3
(D) 4`,
  ],
  [
    'passage-colon-header',
    `Passage: A gas expands isothermally from volume V to 2V.
The work done by the gas is
(A) nRT ln 2
(B) nRT
(C) 2 nRT
(D) zero`,
  ],
  [
    'long-stem-find-determine',
    `Consider a triangle ABC with sides a, b, c and area Delta. Find the area using Heron's formula. Determine which option matches the result.
(A) 1
(B) 2
(C) 3
(D) 4`,
  ],
  [
    'figure-following-word',
    `A particle moves as shown in the following figure. The acceleration is constant between t = 0 and t = 2. The magnitude of average velocity is
(A) 1
(B) 2
(C) 3
(D) 4`,
  ],
  [
    'represents-matrix-stem',
    `The matrix shown below represents a linear transformation on R^2. The value of det(A) is
(A) 0
(B) 1
(C) 2
(D) -1`,
  ],
  [
    'chem-which-following',
    `Which of the following compounds shows aromaticity?
(A) Benzene
(B) Cyclohexane
(C) Ethene
(D) Cyclobutadiene`,
  ],
  [
    'long-paragraph-one-mcq',
    `Consider a gas in a container. Pressure P and volume V are related. Temperature is constant. Density varies. Entropy increases. Work done by the system is positive when expansion occurs. Internal energy depends only on temperature for ideal gas. The molar heat capacity at constant volume is Cv. Then the value of gamma is
(A) 1.4
(B) 1.67
(C) 1.33
(D) 2`,
  ],
  [
    'piecewise-log-continuity',
    `The function $f(x)$ is defined $f(x)=\\begin{cases}
\\log_{(4x-3)}(x^{2}-2x+5), & \\text{if } \\frac{3}{4} < x < 1 \\text{ or } x > 1 \\\\
4, & \\text{if } x = 1
\\end{cases}$
(A) is continuous at $x = 1$
(B) is discontinuous at $x = 1$ since $f(1^{+})$ does not exist though $f(1^{-})$ exists
(C) is discontinuous at $x = 1$ since $f(1^{-})$ does not exist though $f(1^{+})$ exists
(D) is discontinuous since neither $f(1^{-})$ nor $f(1^{+})$ exists`,
  ],
  [
    'piecewise-if-garbled',
    `The function f(x) is defined f(x)=
log_(4x-3)(x^2-2x+5), if 3/4 < x < 1 or x > 1
4, if x = 1
(A) is continuous at x = 1
(B) is discontinuous at x = 1 since f(1+) does not exist though f(1-) exists
(C) is discontinuous at x = 1 since f(1-) does not exist though f(1+) exists
(D) is discontinuous since neither f(1-) nor f(1+) exists`,
  ],
]

for (const [name, raw] of singleMcqs) {
  assert.equal(looksLikePassageMultiMcq(raw), false, `${name}: looksLikePassageMultiMcq`)
  assert.equal(
    resolvePassageUpload(raw, raw)?.subQuestions?.length ?? 0,
    0,
    `${name}: resolvePassageUpload must not invent 2+ subs`,
  )
  assert.equal(
    resolvePassageUpload(raw, raw, { allowOptionless: true })?.subQuestions?.length ?? 0,
    0,
    `${name}: allowOptionless must not invent 2+ subs`,
  )
  const classified = classifyUploadFromOcr(raw)
  assert.ok(
    !String(classified.detectedType).startsWith('passage'),
    `${name}: classify type was ${classified.detectedType}, expected SCQ/MSQ`,
  )
  const extracted = processMcqUploadExtract(raw)
  assert.notEqual(extracted.pass, 'passage-deferred', `${name}: must not defer as passage`)
  assert.ok(extracted.found >= 2, `${name}: should parse A–D options (found=${extracted.found})`)
  if (name === 'piecewise-log-continuity') {
    const stem = String(extracted.parsed?.text ?? '')
    assert.match(stem, /\\begin\{cases\}/, `${name}: cases kept in one stem`)
    assert.match(stem, /\\end\{cases\}/, `${name}: cases not cut mid-block`)
    assert.ok(!/^\s*if\s*\}/i.test(stem), `${name}: stem must not start mid-cases`)
  }
}

const truePassage = `Consider the arrangement of numbers as shown such that N_p represents number of terms of pth row and S_p denotes sum of terms of pth row and so on.
On the basis of above information, answer the following questions:
Value of sum N_p is -
(A) 10000
(B) 9801
(C) 5050
(D) 2401
Value of ratio S_p is -
(A) 16/3
(B) 5
(C) 6
(D) 19/3`
assert.ok(looksLikePassageMultiMcq(truePassage), 'true multi-MCQ passage still detected')
assert.ok(
  (resolvePassageUpload(truePassage)?.subQuestions?.length ?? 0) >= 2,
  'true passage still splits',
)
const passageClassified = classifyUploadFromOcr(truePassage)
assert.equal(passageClassified.detectedType, 'passage_scq', 'true passage → passage_scq')

const integerPassage = `Equal masses of three gases X, Y and Z were mixed in a sealed container. Total pressure at T was P.
Answer the following questions:
Partial pressure of X after adding more X at 2T is (express with P = 6)
In final conditions partial pressure of Z is (express with P = 6)`
assert.ok(looksLikePassageMultiMcq(integerPassage), 'integer passage still detected')
assert.ok(
  (resolvePassageUpload(integerPassage, integerPassage, { allowOptionless: true })?.subQuestions
    ?.length ?? 0) >= 2,
  'integer passage still splits',
)

console.log('ok: single MCQ stays MCQ; true passages still passage')
