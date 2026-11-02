import assert from 'node:assert/strict'
import { parsePassageWithSubQuestions } from '../src/utils/parsePassageUpload.js'
import { persistPassageBundleFields } from '../src/utils/persistUpload.js'
import {
  trimPassageBodyText,
  passageSubQuestionDisplayText,
  sanitizePassageBundle,
  sanitizePassageSubStemForStorage,
  stemAlreadyInPassage,
  shouldShowPassageImageInViewer,
  shouldShowPassageTextBesideImage,
  passageLikelyNeedsSharedDiagram,
  normalizePassageQuestionStorage,
  getPassageText } from '../src/utils/passage.js'

const passage = `Equal masses of gases X, Y, Z were mixed. Pressure was P at T.
Answer the following questions:`

const q1 = `${passage}
Partial pressure of X after adding 2W grams is (P = 6 atm)`

const trimmed = trimPassageBodyText(
  `${passage}
Partial pressure of X after adding 2W grams is (P = 6 atm)
In final conditions partial pressure of Z is (P = 6 atm)`,
)
assert.ok(!/Partial\s+pressure\s+of\s+X/i.test(trimmed))
assert.match(trimmed, /Answer the following questions/i)

const display = passageSubQuestionDisplayText(q1, passage)
assert.match(display, /Partial pressure of X/i)
assert.ok(!display.includes('Equal masses') || display.length < q1.length)

const parent = {
  passageText: passage.repeat(1),
  questionImage: 'data:image/jpeg;base64,x',
  text: 'Partial pressure of X after adding 2W grams is (P = 6 atm)' }
assert.equal(shouldShowPassageImageInViewer(parent, passage), false)

const normalized = normalizePassageQuestionStorage(parent, [parent])
assert.equal(normalized.passageImage, undefined)

const towerPassage = `Two friends A & B playing a game of collision of ball and throwing balls from the top of the tower simultaneously as shown in the figure. If the balls collide in air at point P and point O is treated as origin (g=10 m/s^2) Answer the following questions`
const diagramParent = {
  passageText: towerPassage,
  passageImage: 'data:image/jpeg;base64,tower',
  text: 'If Distance D between the towers is x meter, then the value x/100' }
assert.equal(shouldShowPassageImageInViewer(diagramParent, towerPassage), true)
const diagramNorm = normalizePassageQuestionStorage(diagramParent, [diagramParent])
assert.equal(diagramNorm.passageImage, 'data:image/jpeg;base64,tower')

const dupTail = `${towerPassage}
${towerPassage}`
const dupTrimmed = trimPassageBodyText(dupTail)
assert.equal(
  (dupTrimmed.match(/Two friends/gi) ?? []).length,
  1,
  'trailing OCR passage repeat should be removed',
)

const withCrop = { passageImage: 'data:x', passageImageCrop: true, passageText: towerPassage }
assert.equal(shouldShowPassageTextBesideImage(withCrop, towerPassage), true)
const fullPage = { passageImage: 'data:x', passageText: towerPassage }
assert.equal(
  shouldShowPassageTextBesideImage(fullPage, towerPassage),
  true,
  'diagram passages must show trimmed text even when image is full-page',
)

const vdwPassage = `The plot of Density vs Pressure is shown below for a Van der Waals gas at various temperatures (R = 0.08 L atm mol-1 K-1)
The slope of the plot at 400 K is 1.25 (at low P)
What is the molar mass of the gas (in g mol-1)
What is the inversion temperature of the gas (in K)`
const vdwTrimmed = trimPassageBodyText(vdwPassage)
assert.ok(!/What is the molar mass/i.test(vdwTrimmed), 'passage should not include sub-stems')
assert.match(vdwTrimmed, /slope of the plot/i)

const vdwOneLine = `The plot of Density vs Pressure is shown below for a Van der Waals gas (R = 0.08). The slope of the plot at 400 K is 1.25 (at low P) What is the molar mass of the gas (in g mol-1) What is the inversion temperature of the gas (in K)`
const vdwOneLineTrim = trimPassageBodyText(vdwOneLine)
assert.ok(!/What is the/i.test(vdwOneLineTrim), 'inline OCR: cut before What is the')
assert.equal(
  passageSubQuestionDisplayText('What is the inversion temperature of the gas (in K)', vdwOneLine),
  '',
  'Q2 hidden when passage raw still has inversion line',
)
assert.match(
  passageSubQuestionDisplayText('What is the molar mass of the gas (in g mol-1)', vdwOneLineTrim),
  /molar mass/i,
)

const invStem = 'Find the inversion temperature of the gas (in K)'
assert.equal(
  passageSubQuestionDisplayText(invStem, vdwPassage),
  '',
  'inversion stem dup of passage (Find… vs What is…)',
)
assert.ok(
  stemAlreadyInPassage(invStem, vdwPassage),
  'stemAlreadyInPassage Find vs What is',
)
const massStem = 'What is the molar mass of the gas (in g mol-1)'
assert.match(passageSubQuestionDisplayText(massStem, vdwTrimmed), /molar mass/i)
assert.equal(
  sanitizePassageSubStemForStorage(invStem, vdwPassage),
  invStem,
  'storage keeps stem when display hidden',
)

const bundle = sanitizePassageBundle({
  passageText: vdwPassage,
  subQuestions: [
    { text: massStem, options: ['', '', '', ''] },
    { text: invStem, options: ['', '', '', ''] },
  ] })
assert.ok(!/What is the/i.test(bundle.passageText))
assert.equal(bundle.subQuestions[0].text, massStem)
assert.equal(bundle.subQuestions[1].text, invStem)

const parentRow = {
  id: 'p1',
  passageText: vdwPassage,
  passageImage: 'data:image/png;base64,plot' }
const child2 = {
  id: 'c2',
  passageId: 'p1',
  text: invStem,
  questionType: 'integer' }
const bankNorm = normalizePassageQuestionStorage(parentRow, [parentRow, child2])
assert.ok(!/inversion temperature/i.test(bankNorm.passageText))
assert.equal(child2.text, invStem)
const displayPassage = getPassageText(child2, [bankNorm, child2])
assert.ok(!/inversion temperature/i.test(displayPassage ?? ''))
assert.match(displayPassage ?? '', /slope/i)

const vdwNorm = normalizePassageQuestionStorage(
  { passageText: vdwPassage, passageImage: 'data:image/png;base64,plot', text: 'Find the inversion temperature' },
  [],
)
assert.equal(vdwNorm.passageImage, 'data:image/png;base64,plot')

const cubicBody = `If α, β, γ are the roots of the equation ax^3 + bx^2 + cx + d = 0. Then answer the following questions`
assert.equal(passageLikelyNeedsSharedDiagram(cubicBody), false)
const cubicParent = {
  passageText: cubicBody,
  passageImage: 'data:image/jpeg;base64,wrong',
  text: 'Let P(x) be a cubic polynomial...' }
const cubicNorm = normalizePassageQuestionStorage(cubicParent, [cubicParent])
assert.equal(cubicNorm.passageImage, undefined)
assert.equal(shouldShowPassageImageInViewer(cubicNorm, cubicBody), false)

const pivqParent = { id: 'pp', questionType: 'passage_integer', passageText: 'Story only.' }
const pivqChild = { id: 'pc', passageId: 'pp', questionType: 'integer', text: 'Sub', correctInteger: 3 }
assert.equal(normalizePassageQuestionStorage(pivqChild, [pivqParent, pivqChild]).questionType, 'passage_integer')

const npPassage = `Consider the arrangement of numbers as shown such that $\\mathrm{N}_{\\mathrm{p}}$ represents number of terms of $\\mathrm{p}^{\\text {th }}$ row and $S_{p}$ denotes sum of terms of $p^{\\text {th }}$ row : $$\\begin{array}{ccccc} \\mathrm{I}^{\\text {st }} \\text { row } & & \\frac{1}{3^{2}+3} & & \\\\ \\mathrm{II}^{\\text {nd }} \\text { row } & & \\frac{1}{4^{2}+4} & \\frac{1}{5^{2}+5} & \\frac{1}{6^{2}+6} \\\\ & & \\frac{1}{8^{2}+8} & \\frac{1}{9^{2}+9} & \\frac{1}{10^{2}+10} \\end{array} $\\_\\_\\_\\_$ and so on On the basis of above information, answer the following questions : Value of $\\sum_{\\mathrm{p}=1}^{100} \\mathrm{~N}_{\\mathrm{p}}$ is - (A) 10000 (B) 9801 (C) 5050 (D) 2401 Value of $\\frac{\\sum_{p=1}^{4} S_{p}}{\\sum_{p=5}^{\\infty} S_{p}}$ is - (A) $1{16}{3}$ (B) 5 (C) 6 (D) $1{19}{3}$`
const npParsed = parsePassageWithSubQuestions(npPassage)
assert.equal(npParsed?.subQuestions?.length, 2)
const npSaved = persistPassageBundleFields({ passageText: npParsed.passageText }).passageText
assert.match(npSaved, /7\^\{?2\}?\+7/, 'saved N_p passage must repair missing row-III term 7')
assert.match(npSaved, /11\^\{?2\}?\+11/, 'saved N_p passage must repair missing row-III term 11')
assert.ok(npParsed.passageText.length > 120, 'passage must keep array + intro, not only answer cue')
assert.match(npParsed.passageText, /Consider the arrangement/i)
assert.match(npParsed.passageText, /answer the following questions/i)
assert.ok(!/Value of\s+\\sum/i.test(npParsed.passageText), 'sub-stems must not remain in passage')
assert.match(npParsed.subQuestions[0].text, /\\sum_\{\\mathrm\{p\}=1\}\^\{100\}/)
assert.equal(npParsed.subQuestions[1].options[0], '$\\frac{16}{3}$')

console.log('test-passage-dedupe: ok')
