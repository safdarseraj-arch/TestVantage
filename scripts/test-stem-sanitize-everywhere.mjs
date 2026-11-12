/**
 * Lock: smashed $ / glued List-I / empty xenon rows stay fixed on EVERY path
 * (display sanitize, persist/save, upload heal). Not Official-PYQ-preview-only.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  sanitizeStemForDisplay,
  stemLooksIncompleteOnDisplay,
} from '../src/utils/sanitizeStemForDisplay.js'
import { latexExtractionIncomplete } from '../src/utils/healTruncatedLatex.js'
import { persistQuestionForBank } from '../src/utils/persistUpload.js'
import { healUploadQuestionCard } from '../src/utils/uploadQualityGuards.js'
import { parseMatchingListForDisplay } from '../src/utils/parseMatchingListDisplay.js'
import { validateQuestionReadiness } from '../src/utils/questionReadiness.js'
import { prepareTextForMathTextDisplay } from '../src/utils/prepareMathForRender.js'
import {
  officialPyqCardAllowsPassage,
  recoverOfficialPyqPassageFromSource,
  stripOfficialPyqPaperChrome,
} from '../src/utils/passage.js'
import { normalizeStemForStorage } from '../src/utils/stemStorage.js'

const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const previewMathSrc = readFileSync(join(SRC_ROOT, 'src/pages/OfficialPyqPreviewMath.jsx'), 'utf8')
const cardAsShownSrc = readFileSync(join(SRC_ROOT, 'src/utils/officialPyqCardAsShown.js'), 'utf8')
assert.match(previewMathSrc, /officialPyqCardAsShown\(q, sourceText\)/, 'Preview draws the shared card view')
assert.match(
  cardAsShownSrc,
  /healUploadQuestionCard\(q, sourceText\)/,
  'Rejected/pending/published preview must apply the shared heal',
)

/** Every read/write helper that shows or saves a stem must call this sanitizer. */
const SHARED_SANITIZE_CALL_SITES = [
  'src/components/QuestionMedia.jsx',
  'src/components/QuestionMediaLite.jsx',
  'src/utils/persistUpload.js',
  'src/utils/extendTruncatedStem.js',
  'src/utils/stemStorage.js',
  'src/utils/prepareMathForRender.js',
  'src/utils/sanitizeStemForDisplay.js',
]

function mathStripped(s) {
  return String(s ?? '')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$]*\$/g, ' ')
}

function hasWrappedPiecewise(s) {
  return /\$\$?[\s\S]{0,16}\\begin\{(?:array|cases)\}[\s\S]*?\\end\{(?:array|cases)\}\s*\$\$?/.test(s)
}

const Q46 =
  'Starting with one mole of $\\mathbf{Q}$, the amount of $\\mathbf{R}$ produced in gram is $____$.\n' +
  '[Given, atomic weight: $\\mathrm{H}=1$, C=12, $\\mathrm{~N}=14$, $\\mathrm{O}=16$, $\\mathrm{Na}=23$, $\\mathrm{Cl}=35$, $\\mathrm{Ca}=40$$ ]'

const Q47 =
  'Among the following complexes, the total number of diamagnetic species is $____$.\n' +
  '$$\\left[\\mathrm{Mn}\\left(\\mathrm{NH}_{3}\\right)_{6}\\right]^{3+}$$\n' +
  '[Given, atomic number: $\\mathrm{Mn}=25, \\mathrm{Fe}=26, \\mathrm{Co}=27$;\n' +
  '$$\\text { en } \\left.=\\mathrm{H}_{2} \\mathrm{NCH}_{2} \\mathrm{CH}_{2} \\mathrm{NH}_{2}\\right]$$'

const Q48 = [
  'In a conductometric titration, small volume of titrant of higher concentration is added.',
  'The limiting ionic conductivity ( $\\Lambda_{0}$ ) values are given below:',
  '\\begin{tabular}[t]{|l|l|}',
  '\\hline Ions & $\\mathrm{CH}_{3} \\mathrm{COO}^{-} \\\\\\$$',
  '\\hline$$\\Lambda_{0}$$ & 4.1 \\\\$$',
  '\\hline',
  '\\end{tabular}$$',
  'List-I',
  '(P) Titrate: KCl',
  'Titrant: $\\mathrm{AgNO}_{3}$$',
  '(Q) Titrate: $\\mathrm{AgNO}_{3}$$',
  'Titrant: KCl',
  '(R) Titrate: NaOH',
  'Titrant: HCl',
  '(S) Titrate: NaOH',
  'Titrant: $\\mathrm{CH}_{3} \\mathrm{COOH}$$',
  'List-II',
  '(1) figure A',
  '(2) figure B',
  '(3) figure C',
  '(4) figure D',
  '(5) figure E',
].join('\n')

const Q48_OCR = [
  'In a conductometric titration, small volume of titrant of higher concentration is added.',
  'The limiting ionic conductivity ( $\\Lambda_{0}$ ) values are given below:',
  '\\begin{tabular}[t]{|l|l|}',
  '\\hline Ions & $\\mathrm{CH}_{3} \\mathrm{COO}^{-}$ \\\\',
  '\\hline $\\Lambda_{0}$ & 4.1 \\\\',
  '\\hline',
  '\\end{tabular}',
  'List-I',
  '\\item[(P)] Titrate: KCl',
  'Titrant: $\\mathrm{AgNO}_{3}$',
  '\\item[(Q)] Titrate: $\\mathrm{AgNO}_{3}$',
  'Titrant: KCl',
  '\\item[(R)] Titrate: NaOH',
  'Titrant: HCl',
  '\\item[(S)] Titrate: NaOH',
  'Titrant: $\\mathrm{CH}_{3} \\mathrm{COOH}$',
  'List-II',
  '(1) figure A',
  '(2) figure B',
  '(3) figure C',
  '(4) figure D',
  '(5) figure E',
].join('\n')

const Q49_EMPTY = [
  'Based on VSEPR model, match the xenon compounds given in List-I with the corresponding geometries and the number of lone pairs on xenon given in List-II and choose the correct option.',
  'List-I',
  '(P)',
  '(Q)',
  '(R)',
  '(S)',
  'List-II',
  '(1) Trigonal bipyramidal and two lone pair of electrons',
  '(2) Tetrahedral and one lone pair of electrons',
  '(3) Octahedral and two lone pair of electrons',
  '(4) Trigonal bipyramidal and no lone pair of electrons',
  '(5) Trigonal bipyramidal and three lone pair of electrons',
].join('\n')

const Q49_OCR = [
  'Based on VSEPR model, match the xenon compounds in List-I with their structures in List-II and select the correct option.',
  '\\section*{List-I}',
  '\\begin{itemize}',
  '\\item[(P)] $\\mathrm{XeF}_{2}$',
  '\\item[(Q)] $\\mathrm{XeF}_{4}$',
  '\\item[(R)] $\\mathrm{XeO}_{3}$',
  '\\item[(S)] $\\mathrm{XeO}_{3} \\mathrm{F}_{2}$',
  '\\end{itemize}',
  '\\section*{List-II}',
  '\\begin{itemize}',
  '\\item[(1)] trigonal bipyramidal',
  '\\item[(2)] square planar',
  '\\item[(3)] pyramidal',
  '\\item[(4)] see-saw',
  '\\item[(5)] linear',
  '\\end{itemize}',
].join('\n')

const Q50 = [
  'List-I contains various reaction sequences and List-II contains the possible products.',
  'List-I',
  '\\includegraphics{https://cdn.mathpix.com/p/p50.png}',
  'i) $\\mathrm{O}_{3}$, Zn',
  'aq. $\\mathrm{NaOH}, \\Delta$',
  'List-II',
  '\\includegraphics{https://cdn.mathpix.com/p/one50.png}',
  '$\\mathrm{H}_{3} \\mathrm{O}^{+} \\mathrm{NaBH}_{4}',
  '',
  '(P) \\includegraphics{https://cdn.mathpix.com/p/p50b.png}',
  '(Q)',
  '',
  '_{3}$$, b) $\\mathrm{H}_{2} \\mathrm{O}_{2}$$, $\\mathrm{NaOH}$$$}',
  '\\includegraphics{https://cdn.mathpix.com/p/q50.png}',
  '(R)',
  '\\includegraphics{https://cdn.mathpix.com/p/r50.png}',
].join('\n')

const Q51_CROPS = [
  'Among the following phenolic compounds, match each entry in List-I with List-II.',
  'List-I',
  '(P) ![]($https://cdn.mathpix.com/cropped/page.jpg?height=324&width=573&top_left_y=452&top_left_x=338)',
  '(Q) ![]($https://cdn.mathpix.com/cropped/page.jpg?height=174&width=116&top_left_y=840&top_left_x=340)',
  '(R) ![]($https://cdn.mathpix.com/cropped/page.jpg?height=190&width=183&top_left_y=1153&top_left_x=340)',
  '(S) ![]($https://cdn.mathpix.com/cropped/page.jpg?height=345&width=756&top_left_y=1475&top_left_x=340)',
  'List-II',
  '(1) one OH',
  '(2) ortho',
  '(3) meta',
  '(4) para',
  '(5) none',
].join('\n')

function assertDisplayComplete(label, stem) {
  const sanitized = sanitizeStemForDisplay(stem)
  assert.equal(
    latexExtractionIncomplete(sanitized),
    false,
    `${label}: display sanitize must clear Extraction incomplete`,
  )
  assert.equal(
    stemLooksIncompleteOnDisplay(stem),
    false,
    `${label}: readiness/approve gate must use the same sanitize`,
  )
}

assertDisplayComplete('Q46', Q46)
assertDisplayComplete('Q47', Q47)
assertDisplayComplete('Q48', Q48)
assertDisplayComplete('Q50', Q50)
assertDisplayComplete('Q51', Q51_CROPS)

const q48Display = parseMatchingListForDisplay(sanitizeStemForDisplay(Q48))
assert.ok(q48Display, 'Q48 display parse')
assert.equal(q48Display.listI.length, 4)
assert.equal(q48Display.listI.find((x) => x.label === '(P)').text.includes('Titrant: KCl'), false)

const q51Sanitized = sanitizeStemForDisplay(Q51_CROPS)
assert.doesNotMatch(q51Sanitized, /!\[\]\(\$https/)
const q51Parsed = parseMatchingListForDisplay(q51Sanitized)
assert.ok(q51Parsed)
assert.equal(q51Parsed.listI.length, 4)
assert.match(q51Parsed.listI.find((x) => x.label === '(Q)').text, /width=116&top_left_y=840/)
assert.match(q51Parsed.listI.find((x) => x.label === '(R)').text, /width=183&top_left_y=1153/)
assert.match(q51Parsed.listI.find((x) => x.label === '(S)').text, /width=756&top_left_y=1475/)

const q46Saved = persistQuestionForBank({
  text: Q46,
  options: [],
  extractedRaw: Q46,
})
assert.equal(latexExtractionIncomplete(q46Saved.text), false, 'Q46 persist/save must store complete math')

const q47Saved = persistQuestionForBank({ text: Q47, options: [], extractedRaw: Q47 })
assert.equal(latexExtractionIncomplete(q47Saved.text), false, 'Q47 persist/save must store complete math')

const q48Saved = persistQuestionForBank({
  text: Q48,
  options: ['P-1', 'P-2', 'P-3', 'P-4'],
  extractedRaw: Q48_OCR,
})
assert.equal(latexExtractionIncomplete(q48Saved.text), false, 'Q48 persist/save')
const q48SavedLists = parseMatchingListForDisplay(q48Saved.text)
assert.ok(q48SavedLists)
assert.equal(q48SavedLists.listI.find((x) => x.label === '(P)').text.includes('Titrant: KCl'), false)

const q49Healed = healUploadQuestionCard(
  {
    text: Q49_EMPTY,
    options: [
      'P-5, Q-2, R-3, S-1',
      'P-5, Q-3, R-2, S-4',
      'P-4, Q-3, R-2, S-1',
      'P-4, Q-2, R-5, S-3',
    ],
  },
  Q49_OCR,
)
assert.match(q49Healed.text, /XeF/)
const q49Parsed = parseMatchingListForDisplay(
  sanitizeStemForDisplay(q49Healed.text),
  q49Healed.options,
)
assert.ok(q49Parsed)
assert.equal(q49Parsed.listI.length, 4)
assert.match(q49Parsed.listI.find((x) => x.label === '(P)').text, /XeF/)
assert.doesNotMatch(q49Parsed.intro, /\(P\)\s*\(Q\)/)

const q49Saved = persistQuestionForBank({
  text: Q49_EMPTY,
  options: q49Healed.options,
  extractedRaw: Q49_OCR,
})
assert.match(q49Saved.text, /XeF/)
assert.equal(stemLooksIncompleteOnDisplay(q49Saved.text), false)

const ready = validateQuestionReadiness({
  text: Q46,
  options: ['1', '2', '3', '4'],
  questionType: 'numerical',
})
assert.equal(
  ready.issues.some((i) => i.id === 'extraction-incomplete'),
  false,
  'bank readiness must not flag healable Q46 smashed dollars',
)

assert.equal(
  stemLooksIncompleteOnDisplay('The value of k + p is $$ leftover'),
  true,
  'real unclosed $$ leftover still blocks display/approve',
)

const Q22_BOHR =
  'A particle of mass $m$ is moving in a circular orbit under the influence of the central force $F(r)=-k r$, corresponding to the potential energy $V(r)=k r^{2} / 2$, where $k$ is a positive force constant and $r$ is the radial distance from the origin. According to the Bohr\'s quantization rule, the angular momentum of the particle is given by $L=n \\hbar$, where $\\hbar=h /(2 \\pi), h$ is the Planck\'s constant, and $n$ a positive integer.'
const q22Prep = prepareTextForMathTextDisplay(sanitizeStemForDisplay(Q22_BOHR))
assert.match(q22Prep, /r\^\{2\} \/ 2/)
assert.doesNotMatch(q22Prep, /r\^\\frac\{2\}\{2\}/)
assert.doesNotMatch(q22Prep, /where \$\$\\hbar/)
assert.doesNotMatch(q22Prep, /L=n \$\\hbar/)
assert.match(q22Prep, /\$\\hbar=h \/\(2 \\pi\), h\$/)

const Q47_EN =
  'Among the following complexes, the total number of diamagnetic species is $____$.\n' +
  '$$\\left[\\mathrm{Mn}\\left(\\mathrm{NH}_{3}\\right)_{6}\\right]^{3+},\\left[\\mathrm{MnCl}_{6}\\right]^{3-}$$\n' +
  '[Given, atomic number: $\\mathrm{Mn}=25, \\mathrm{Fe}=26, \\mathrm{Co}=27$;\n' +
  '$$\\text { en } \\left.=\\mathrm{H}_{2} \\mathrm{NCH}_{2} \\mathrm{CH}_{2} \\mathrm{NH}_{2}\\right]$$'
const q47Prep = prepareTextForMathTextDisplay(sanitizeStemForDisplay(Q47_EN))
assert.match(q47Prep, /\$\$\\left\[\\mathrm\{Mn\}/)
assert.match(q47Prep, /\\right\]\^\{3-\}\$\$/)
assert.match(q47Prep, /\\right\]\$\$/)
assert.doesNotMatch(q47Prep, /\\right\]\$\$\$/)
assert.doesNotMatch(q47Prep, /\\right\]\$[^$]/)

const Q50_BODY =
  'List-I contains various reaction sequences and List-II contains the possible products. Match each entry in List-I with the appropriate entry in List-II and choose the correct option.\n\nList-I\n\n' +
  '\\includegraphics{https://cdn.mathpix.com/cropped/page.jpg?height=274&width=119&top_left_y=411&top_left_x=340}\n\n' +
  '(Q)\n\n' +
  '\\includegraphics{https://cdn.mathpix.com/cropped/page.jpg?height=306&width=767&top_left_y=854&top_left_x=352}\n\n' +
  'List-II\n(1) product one\n(2) product two'
const q50Parsed = parseMatchingListForDisplay(sanitizeStemForDisplay(Q50_BODY))
assert.ok(q50Parsed)
assert.match(q50Parsed.intro, /reaction sequences/)
assert.doesNotMatch(q50Parsed.intro, /^\s*$/)
const q50San = sanitizeStemForDisplay(Q50_BODY)
assert.match(q50San, /width=767/)
assert.match(q50San, /width=119&top_left_y=411/, 'List-I (P) figure keeps its OCR crop')

const Q50_LIVE =
  Q50_BODY +
  '\n\ni) $\\mathrm{O}_{3}$, Zn\naq. $\\mathrm{NaOH}, \\Delta$\nethylene glycol, PTSA\n' +
  '(Q)\n_{3}$$, b) $$\\mathrm{H}_{2}O_{2}$, $\\mathrm{NaOH}$$}\n' +
  'P-3, Q-5, R-4, S-1\nP-3, Q-2, R-4, S-1\nP-3, Q-5, R-1, S-4\nP-5, Q-2, R-4, S-1'
const q50Healed = persistQuestionForBank({
  text: Q50_LIVE,
  options: [
    '<smiles>CC1C(O)CCC1CO</smiles>',
    '<smiles>OCC1CCCC1O</smiles>',
    '<smiles>CC1(O)CCCC1O</smiles>',
    '<smiles>CC(O)C1CCCC1O</smiles>',
  ],
  extractedRaw: Q50_LIVE,
})
assert.match(q50Healed.options[0], /P-3/)
assert.doesNotMatch(q50Healed.options.join('\n'), /smiles/i)
assert.doesNotMatch(q50Healed.text, /ethylene glycol/)
assert.doesNotMatch(q50Healed.text, /P-3,\s*Q-5/)
const q50LiveParsed = parseMatchingListForDisplay(sanitizeStemForDisplay(q50Healed.text), q50Healed.options)
assert.match(q50LiveParsed.intro, /reaction sequences/)

const Q48_ROW5_FILE =
  'https://cdn.mathpix.com/cropped/ab5af785-29b3-4e7b-9cb4-55445aaafd34-27.jpg'
const Q48_ROW5 =
  'In a conductometric titration, small volume of titrant of higher concentration is added.\n' +
  'List-I\n(P) Titrate: KCl\nTitrant: $\\mathrm{AgNO}_{3}$\n(Q) Titrate: $\\mathrm{AgNO}_{3}$\nTitrant: KCl\n' +
  '(R) Titrate: NaOH\nTitrant: HCl\n(S) Titrate: NaOH\nTitrant: $\\mathrm{CH}_{3} \\mathrm{COOH}$\n' +
  'List-II\n' +
  `\\includegraphics{${Q48_ROW5_FILE}?height=258&width=327&top_left_y=1062&top_left_x=1286}\n` +
  `\\includegraphics{${Q48_ROW5_FILE}?height=247&width=315&top_left_y=1338&top_left_x=1293}\n` +
  `\\includegraphics{${Q48_ROW5_FILE}?height=256&width=327&top_left_y=1603&top_left_x=1286}\n` +
  `\\includegraphics{${Q48_ROW5_FILE}?height=265&width=320&top_left_y=1868&top_left_x=1288}\n` +
  `\\includegraphics{${Q48_ROW5_FILE}?height=258&width=329&top_left_y=2151&top_left_x=1283}\n` +
  'List-II\n' +
  `(1) \\includegraphics{${Q48_ROW5_FILE}?height=258&width=327&top_left_y=1062&top_left_x=1286}\n` +
  `(2) \\includegraphics{${Q48_ROW5_FILE}?height=247&width=315&top_left_y=1338&top_left_x=1293}\n` +
  `(3) \\includegraphics{${Q48_ROW5_FILE}?height=256&width=327&top_left_y=1603&top_left_x=1286}\n` +
  `(4) \\includegraphics{${Q48_ROW5_FILE}?height=265&width=320&top_left_y=1868&top_left_x=1288}\n` +
  `(5) ![](${Q48_ROW5_FILE}?hei`
const Q48_ROW5_OCR =
  Q48_ROW5.replace(
    `${Q48_ROW5_FILE}?hei`,
    `${Q48_ROW5_FILE}?height=258&width=329&top_left_y=2151&top_left_x=1283)`,
  )
const q48Row5San = sanitizeStemForDisplay(Q48_ROW5)
assert.doesNotMatch(q48Row5San, /!\[\]\(/)
assert.match(q48Row5San, /\\includegraphics\{https:\/\/cdn\.mathpix\.com\/cropped\/ab5af785/)
assert.match(q48Row5San, /height=258&width=329/)
const q48Row5Healed = healUploadQuestionCard(
  {
    text: Q48_ROW5,
    options: ['P-4, Q-3, R-2, S-5', 'P-2, Q-4, R-3, S-1', 'P-3, Q-4, R-2, S-5', 'P-4, Q-3, R-2, S-1'],
  },
  Q48_ROW5_OCR,
)
assert.doesNotMatch(q48Row5Healed.text, /!\[\]\(/)
assert.match(q48Row5Healed.text, /top_left_y=2151/)
assert.doesNotMatch(q48Row5Healed.text, /top_left_y=2427/)
assert.doesNotMatch(q48Row5San, /top_left_y=2427/)
const q48Row5Parsed = parseMatchingListForDisplay(
  sanitizeStemForDisplay(q48Row5Healed.text),
  q48Row5Healed.options,
)
assert.ok(q48Row5Parsed)
assert.match(q48Row5Parsed.listII.find((x) => x.label === '(5)').text, /includegraphics/)
assert.doesNotMatch(q48Row5Parsed.listII.find((x) => x.label === '(5)').text, /!\[\]\(/)

const Q34_PHYS =
  'The circuit shown in the figure contains an inductor $L$. Match the quantities mentioned in List-I with their values in List-II and choose the correct option.\n' +
  'List-I\n(P) The value of $I_{1}$ in Ampere is\n(Q) The value of $I_{2}$ in Ampere is\n' +
  '(R) The value of $\\omega_{0}$ in kilo-radians/s is\n(S) The value of $V_{0}$ in Volt is\n' +
  'List-II\n(1) 0\n(2) 2\n(3) 4\n(4) 20\n(5) 200'
const Q33_OPTICS_GAS =
  'A light ray is incident on the surface of a sphere of refractive index $n$ at an angle of incidence $\\theta_{0}$. Match the quantities mentioned in List-I with their values in List-II and choose the correct option.\n' +
  'List-I\n(P) If $n=2$ and $\\alpha=180^{\\circ}$, then all the possible values of $\\theta_{0}$ will be\n' +
  '(Q) If $n=\\sqrt{3}$ and $\\alpha=180^{\\circ}$, then all the possible values of $\\theta_{0}$ will be\n' +
  '(R) If $n=\\sqrt{3}$ and $\\alpha=180^{\\circ}$, then all the possible values of $\\phi_{0}$ will be\n' +
  '(S) If $n=\\sqrt{2}$ and $\\theta_{0}=45^{\\circ}$, then all the possible values of $\\alpha$ will be\n' +
  'List-II\n(1) $\\mathcal{R} T_{0}-4 \\mathcal{R} T_{0} \\ln 2$\n(2) 0\n(3) $3 \\mathcal{R} T_{0}$\n(4) $-2 \\mathcal{R} T_{0} \\ln 2$\n(5) $-3 \\mathcal{R} T_{0} \\ln 2$'
const Q31_INTRO =
  'One mole of a monatomic ideal gas undergoes the cyclic process as shown in the P-T diagram. Match the quantities mentioned in List-I with their values in List-II and choose the correct option.'
const SHARED_OCR = [
  Q31_INTRO,
  'List-I',
  '(P) Work done in the complete cyclic process',
  '(Q) Change in the internal energy of the gas in the process JK',
  '(R) Heat given to the gas in the process KL',
  '(S) Change in the internal energy of the gas in the process MJ',
  'List-II',
  '(1) $\\mathcal{R} T_{0}-4 \\mathcal{R} T_{0} \\ln 2$',
  '(2) 0',
  '(3) $3 \\mathcal{R} T_{0}$',
  '(4) $-2 \\mathcal{R} T_{0} \\ln 2$',
  '(5) $-3 \\mathcal{R} T_{0} \\ln 2$',
  'Four identical thin, square metal sheets',
  Q33_OPTICS_GAS.replace('List-II\n(1) $\\mathcal{R} T_{0}-4 \\mathcal{R} T_{0} \\ln 2$\n(2) 0\n(3) $3 \\mathcal{R} T_{0}$\n(4) $-2 \\mathcal{R} T_{0} \\ln 2$\n(5) $-3 \\mathcal{R} T_{0} \\ln 2$',
    'List-II\n(1) 30° and 0°\n(2) 60° and 0°\n(3) 45° and 0°\n(4) 150°\n(5) 0°'),
  Q34_PHYS,
  'List-I contains various reaction sequences and List-II contains the possible products.',
  '(2)\n<smiles>CC1C(O)CCC1CO</smiles>',
  '(3)\n<smiles>OCC1CCCC1O</smiles>',
  '(4)\n<smiles>CC1(O)CCCC1O</smiles>',
  '(5)\n<smiles>CC(O)C1CCCC1O</smiles>',
].join('\n')

const q34Phys = healUploadQuestionCard({ text: Q34_PHYS, options: ['P-1', 'P-2', 'P-3', 'P-4'] }, SHARED_OCR)
assert.doesNotMatch(q34Phys.text, /smiles/i)
assert.match(q34Phys.text, /\(1\)\s*0/)
assert.match(q34Phys.text, /\(5\)\s*200/)
const q34Parsed = parseMatchingListForDisplay(sanitizeStemForDisplay(q34Phys.text), q34Phys.options)
assert.doesNotMatch(q34Parsed.listII.map((x) => x.text).join('\n'), /smiles|CC1C/i)
assert.match(q34Parsed.listII.find((x) => x.label === '(2)').text, /^2$/)

const q33Phys = healUploadQuestionCard({ text: Q33_OPTICS_GAS, options: ['P-5', 'P-4', 'P-3', 'P-2'] }, SHARED_OCR)
assert.doesNotMatch(q33Phys.text, /smiles/i)
assert.doesNotMatch(q33Phys.text, /T_\{0\}/)
assert.match(q33Phys.text, /30°|30\s*\\circ|30° and 0/)
const q33Parsed = parseMatchingListForDisplay(sanitizeStemForDisplay(q33Phys.text), q33Phys.options)
assert.doesNotMatch((q33Parsed.listII || []).map((x) => x.text).join('\n'), /smiles|CC1C/i)

const q31Phys = healUploadQuestionCard({ text: Q31_INTRO, options: [] }, SHARED_OCR)
assert.doesNotMatch(q31Phys.text, /smiles/i)
assert.match(q31Phys.text, /Work done in the complete/)
assert.match(q31Phys.text, /T_\{0\}/)

const q50Chem = healUploadQuestionCard(
  {
    text: 'List-I contains various reaction sequences and List-II contains the possible products. Match each entry in List-I with the appropriate entry in List-II.\nList-I\n(P) scheme\nList-II\n(1) product one',
    options: ['P-3, Q-5, R-4, S-1', 'P-3, Q-2, R-4, S-1', 'P-3, Q-5, R-1, S-4', 'P-5, Q-2, R-4, S-1'],
  },
  SHARED_OCR,
)
assert.match(q50Chem.text, /<smiles>/i)

const q34Smashed = parseMatchingListForDisplay(
  Q34_PHYS + '\n(2)\n<smiles>CC1C(O)CCC1CO</smiles>\n(3)\n<smiles>OCC1CCCC1O</smiles>',
)
assert.match(q34Smashed.listII.find((x) => x.label === '(2)').text, /^2$/)
assert.doesNotMatch(q34Smashed.listII.find((x) => x.label === '(2)').text, /smiles/i)

const paraMath =
  'Let $S$ be the set. If $x \\in S$ then\n$$E = \\frac{1}{2}mv^{2}$$\n\\includegraphics{https://cdn.mathpix.com/cropped/rod.jpg}'
const paraClean = sanitizeStemForDisplay(paraMath)
assert.match(paraClean, /\$\$E = \\frac\{1\}\{2\}mv\^\{2\}\$\$/, 'do not drop $$ on a passage')
assert.match(paraClean, /\\includegraphics\{https:\/\/cdn\.mathpix\.com/, 'keep the figure')
assert.equal(stemLooksIncompleteOnDisplay(paraMath), false)
assert.equal(latexExtractionIncomplete(paraClean), false)

const Q13_RAW =
  'Let the function f : [1, \\infty) \\rightarrow \\mathbb{R} be defined by f(t)={\n' +
  '(-1)^{n+1}2, if t=2n-1, n \\in \\mathbb{N},\n' +
  '\\frac{(2n+1-t)}{2}f(2n-1)+\\frac{(t-(2n-1))}{2}f(2n+1), if 2n-1 < t < 2n+1, n \\in \\mathbb{N}.\n' +
  'Define g(x)=\\int_{?}^{x} f(t) dt, x \\in (1,\\infty). Let \\alpha denote the number of solutions of the equation g(x)=0 in the interval (1,8) and \\beta=\\lim_{x \\rightarrow 1+} \\frac{g(x)}{x-1}. Then the value of \\alpha+\\beta is equal to ______.\n' +
  '\\section*{PARAGRAPH "I"}'
const q13Clean = sanitizeStemForDisplay(Q13_RAW)
assert.doesNotMatch(q13Clean, /\\section/, 'Q13 must not show \\section as raw/red TeX')
assert.match(q13Clean, /\\begin\{cases\}/, 'Q13 piecewise cases must line up')
assert.match(q13Clean, /\$[^$]*\\int_\{\?\}/, 'Q13 integral must be delimited, bound stays ?')
assert.doesNotMatch(q13Clean, /\\int_\{1\}/, 'never invent the missing integral bound')
assert.match(q13Clean, /\$[^$]*\\alpha/, 'alpha must be math, not raw \\alpha prose')
assert.match(q13Clean, /\$[^$]*\\lim/, 'limit must be delimited')
assert.match(q13Clean, /\$[^$]*\\frac\{g\(x\)\}\{x-1\}/, 'g(x)/(x-1) must be delimited')
assert.match(q13Clean, /\\int_\{\?\}/, 'incomplete OCR bound stays flagged as ?')

const Q13_SMASH =
  'Let the function f : [1,\\infty)\\rightarrow\\mathbb{R} be defined by f(t)={\n' +
  '(-1)^{n+1}2, ift=2n-1, n \\in \\mathbb{N},\n' +
  '\\frac{(2n+1-t)}{2}f(2n-1)+\\frac{(t-(2n-1))}{2}f(2n+1), if2n-1 < t < 2n+1, n \\in \\mathbb{N}.\n' +
  'Defineg(x)=\\int_{?}{x}f(t)d t, x \\in(1,\\infty).Let \\alpha denote the number of solutions and \\beta=\\lim_{x \\rightarrow 1+} \\frac{g(x)}{x-1}.'
const q13Smash = sanitizeStemForDisplay(Q13_SMASH)
assert.match(q13Smash, /\\begin\{cases\}/)
assert.match(q13Smash, /\$[^$]*\\int_\{\?\}\^\{x\}/, 'delimiter repair keeps ? and uses printed x')
assert.doesNotMatch(q13Smash, /\\int_\{1\}/)
assert.match(q13Smash, /Define g\(/)
assert.match(q13Smash, /\$[^$]*\\alpha/)

const PARA_I_GLUE =
  '\\section*{PARAGRAPH "I"}\n' +
  'Let $S=\\{1,2,3,4,5,6\\}$ and $X$ be the set of all relations $R$ from $S$ to $S$ that satisfy both the following properties:\n' +
  '\\item[i.] $R$ has exactly 6 elements.\n' +
  '\\item[ii.] For each $(a,b)\\in R$, we have $|a-b|\\geq 2$.\n' +
  'Let $n(A)$ denote the number of elements in a set $A$.\n' +
  '(There are two questions based on PARAGRAPH "I", the question given below is one of them)'
const stored14 = healUploadQuestionCard({
  text: 'If $n(X)={}^{m}C_{6}$, then the value of $m$ is ______.\n' + PARA_I_GLUE,
  options: ['$R$ has exactly 6 elements.', 'For each $(a,b)\\in R$, we have $|a-b|\\geq 2$.', '', ''],
  printedNumber: 14,
  questionNumber: 14,
})
assert.match(String(stored14.passageText), /Let \$S=\\\{1,2,3,4,5,6\\\}/)
assert.doesNotMatch(String(stored14.passageText), /\\section/)
assert.match(String(stored14.text), /n\(X\)/)
assert.doesNotMatch(String(stored14.text), /exactly 6 elements/)
assert.doesNotMatch((stored14.options || []).join('\n'), /exactly 6 elements/)
assert.equal(stored14.passageRole, 'comprehension_child')

const healedFromOcr = healUploadQuestionCard(
  {
    text: 'If $n(X)={}^{m}C_{6}$, then the value of $m$ is ______.',
    options: ['', '', '', ''],
    printedNumber: 14,
    questionNumber: 14,
    passageText: '',
  },
  PARA_I_GLUE + '\n\\item[Q.] 14 If $n(X)={}^{m}C_{6}$, then the value of $m$ is ______.\n\\item[Q.] 15 If the value of $n(Y)+n(Z)$ is $k^{2}$, then $|k|$ is ______.',
)
assert.match(String(healedFromOcr.passageText), /Let \$S=\\\{1,2,3,4,5,6\\\}/, 'empty stored card recovers Paragraph I from OCR')
assert.doesNotMatch(String(healedFromOcr.text), /exactly 6 elements/)

const Q4_ARRAY =
  'Let $f:\\mathbb{R}\\rightarrow\\mathbb{R}$ be a function defined by f(x)=\\{ x^{2}\\sin(\\frac{\\pi}{x^{2}}), & if x \\neq 0, \\\\ 0, & if x=0. \\end{array} Then which of the following statements is TRUE?'
const q4San = sanitizeStemForDisplay(Q4_ARRAY)
const q4Prep = prepareTextForMathTextDisplay(q4San)
assert.doesNotMatch(mathStripped(q4San), /\\end\{array\}/, 'Q4 sanitize must not leave raw \\end{array}')
assert.doesNotMatch(mathStripped(q4Prep), /\\end\{array\}/, 'Q4 prepare must not leave raw \\end{array}')
assert.ok(
  hasWrappedPiecewise(q4San) || hasWrappedPiecewise(q4Prep),
  'Q4 piecewise array/cases must be wrapped in math delimiters',
)
assert.match(q4San + q4Prep, /x\^\{2\}.*\\sin|\\sin.*\\frac\{\\pi\}/, 'Q4 keeps the printed sine term')
assert.match(q4San + q4Prep, /x\\neq 0|x \\neq 0/)

const Q13_ARRAY =
  'Let the function f : [1, \\infty) \\rightarrow \\mathbb{R} be defined by f(t)=\\{ (-1)^{n+1}2, if t=2n-1, n \\in \\mathbb{N} , \\\\ \\frac{(2n+1-t)}{2}f(2n-1)+\\frac{(t-(2n-1))}{2}f(2n+1), if 2n-1 < t < 2n+1, n \\in \\mathbb{N}. \\end{array} Define g(x)=\\int_{1}^{x} f(t) dt, x \\in (1,\\infty). Let \\alpha denote the number of solutions and \\beta=\\lim_{x \\rightarrow 1+} \\frac{g(x)}{x-1}.'
const q13San = sanitizeStemForDisplay(Q13_ARRAY)
const q13Prep = prepareTextForMathTextDisplay(q13San)
assert.doesNotMatch(mathStripped(q13San), /\\end\{array\}/, 'Q13 sanitize must not leave raw \\end{array}')
assert.doesNotMatch(mathStripped(q13Prep), /\\end\{array\}/, 'Q13 prepare must not leave raw \\end{array}')
assert.ok(
  hasWrappedPiecewise(q13San) || hasWrappedPiecewise(q13Prep),
  'Q13 piecewise array/cases must be wrapped in math delimiters',
)
assert.match(q13San + q13Prep, /\\int_\{1\}/, 'Q13 keeps the OCR integral bound 1')
assert.doesNotMatch(q13San, /\\int_\{2\}/)
assert.match(q13San + q13Prep, /\\frac\{g\(x\)\}\{x-1\}/)

for (const rel of SHARED_SANITIZE_CALL_SITES) {
  const src = readFileSync(join(SRC_ROOT, rel), 'utf8')
  assert.match(
    src,
    /sanitizeStemForDisplay/,
    `${rel} must call the shared stem sanitizer — do not add a new display/save path without it`,
  )
}

const Q7_GLUE =
  'A thin uniform ion beam of a given velocity is shot into a region of uniform magnetic field as shown. ' +
  'Which of the following option(s) is(are) correct? ' +
  'If the H+ ion has x = d then the detector is at height h. ' +
  'If AM = 144 the ion hits the detector. ' +
  'The detector is placed at a height 2d. ' +
  'The width w of the detector is d.'
const q7Heal = healUploadQuestionCard(
  {
    text: Q7_GLUE,
    options: [
      'If the H+ ion has x = d then the detector is at height h.',
      'If AM = 144 the ion hits the detector.',
      '',
      '',
    ],
  },
  '',
)
assert.doesNotMatch(q7Heal.text, /AM = 144/, 'Q7-class: leaked options must leave the stem')
assert.equal(q7Heal.options.filter((o) => String(o ?? '').trim()).length, 4)
assert.doesNotMatch(sanitizeStemForDisplay(Q7_GLUE, q7Heal.options), /width w of the detector/)

const Q40_GLUE =
  "The option(s) with correct sequence of reagents for the conversion of P to Q is(are)" +
  "i) Lindlar's catalyst, H2; ii) SnCl2/HCl; iii) NaBH4; iv) H3O+ " +
  "i) Lindlar's catalyst, H2; i) H3O+; iii) SnCl2/HCl; iv) NaBH4 " +
  "i) NaBH4; ii) SnCl2/HCl; iii) H3O+; iv) Lindlar's catalyst, H2 " +
  "i) Lindlar's catalyst, H2; ii) NaBH4; iii) SnCl2/HCl; iv) H3O+"
const q40Heal = healUploadQuestionCard({ text: Q40_GLUE, options: ['', '', '', ''] }, '')
assert.doesNotMatch(q40Heal.text, /i\)\s*Lindlar/i, 'Q40-class: reagent rows must not stay in the stem')
assert.equal(q40Heal.options.filter((o) => String(o ?? '').trim()).length, 4)
assert.doesNotMatch(sanitizeStemForDisplay(Q40_GLUE), /i\)\s*Lindlar/i)
assert.doesNotMatch(normalizeStemForStorage(Q40_GLUE), /i\)\s*Lindlar/i)

assert.equal(
  officialPyqCardAllowsPassage({ printedNumber: 1, text: 'Let $f$ be tan inverse.', options: ['1', '2', '3', '4'] }),
  false,
  'Q1 must never receive a paragraph',
)
assert.equal(
  officialPyqCardAllowsPassage({ printedNumber: 2, text: 'Let $g$ be another MCQ.', options: ['1', '2', '3', '4'] }),
  false,
  'Q2 must never receive a paragraph',
)
assert.equal(
  officialPyqCardAllowsPassage({ printedNumber: 14, text: 'If $n(X)={}^{m}C_{6}$', options: ['', '', '', ''] }),
  false,
  'default is no passage unless the printed number is in a parsed range',
)
assert.ok(
  officialPyqCardAllowsPassage(
    { printedNumber: 14, text: 'If $n(X)={}^{m}C_{6}$', options: ['', '', '', ''] },
    'Paragraph for Questions 14 and 15\nLet $S=\\{1,2,3,4,5,6\\}$\n\\item[Q.] 14 If $n(X)$\n\\item[Q.] 15 If $n(Y)$',
  ),
  'Q14 is allowed only because the range map / header lists 14-15',
)
assert.equal(
  officialPyqCardAllowsPassage({
    printedNumber: 3,
    text: 'Let $k \\in \\mathbb{R}$. If lim then k is',
    passageId: 'pyq-para-14-15-leak',
    passageText: 'Let $S=\\{1,2,3,4,5,6\\}$ relations R from S',
    passageRole: 'comprehension_child',
  }),
  false,
  'Q3 leftover passageId must not allow a paragraph',
)

const storedQ4 = normalizeStemForStorage(Q4_ARRAY)
assert.doesNotMatch(mathStripped(storedQ4), /\\end\{array\}/, 'save path uses the same array wrap')

const Q4_LIVE =
  '{x^2}\\sin(\\frac{\\pi}{x^2}), & if x\\neq0, \\\\ 0, & if x=0. \\end{array} Then which of the following statements is TRUE?'
const q4Live = sanitizeStemForDisplay(Q4_LIVE)
assert.doesNotMatch(mathStripped(q4Live), /\\end\{array\}/, 'live Q4 leftover array must wrap')
assert.ok(hasWrappedPiecewise(q4Live) || hasWrappedPiecewise(prepareTextForMathTextDisplay(q4Live)))

const endPaper = stripOfficialPyqPaperChrome(
  'Three particles 1, 2 and 3 connected by springs oscillate as shown.\nEND OF THE QUESTION PAPER',
)
assert.doesNotMatch(endPaper, /END OF THE QUESTION PAPER/i)
assert.doesNotMatch(
  sanitizeStemForDisplay('amplititu END OF THE QUESTION PAPER'),
  /END OF THE QUESTION PAPER/i,
)

const SPRING_FIG = '\\includegraphics{https://cdn.mathpix.com/cropped/spring-mass.png}'
const YDSE_FIG = '\\includegraphics{https://cdn.mathpix.com/cropped/ydse.png}'
const ADV_P2_OCR = [
  '\\section*{PARAGRAPH "I"}',
  "In a Young's double slit experiment, two slits are oscillating as shown in the figure.",
  YDSE_FIG,
  '\\item[Q.] 31 The fringe width is ______.',
  '\\item[Q.] 32 The intensity as shown in the figure is ______.',
  '\\section*{PARAGRAPH "II"}',
  'Three particles 1, 2 and 3 connected by a spring-mass system oscillate with amplitude A as shown in the figure.',
  SPRING_FIG,
  '\\item[Q.] 33 The amplitude of particle 2 is ______.',
  '\\item[Q.] 34 The amplitude of particle 3 is ______.',
  '\\section*{PARAGRAPH "I"}',
  'An organic compound P with molecular formula $C_{9}H_{18}O_{2}$ is treated as follows.',
  '\\item[Q.] 48 Sum of number of oxygen atoms in S and T is ____',
  '\\section*{PARAGRAPH "II"}',
  'A ferricyanide complex is treated with KI. The molecular weight of U is needed.',
  '\\item[Q.] 49 The molecular weight of U is ____',
  '\\item[Q.] 50 The moles of KI to produce 2 moles of P is ____',
  '\\item[Q.] 51 The number of zinc ions in the formula of Q is ____',
  'END OF THE QUESTION PAPER',
].join('\n')

const stolenChem = healUploadQuestionCard(
  {
    text: `Three particles 1, 2 and 3 connected by a spring-mass system oscillate with amplitude A as shown in the figure.\n${SPRING_FIG}\nSum of number of oxygen atoms in S and T is ____`,
    options: ['', '', '', ''],
    printedNumber: 48,
    questionNumber: 48,
    subject: 'chemistry',
    passageText: `Three particles 1, 2 and 3 spring-mass ${SPRING_FIG}`,
  },
  ADV_P2_OCR,
)
const chemBlob = `${stolenChem.text}\n${stolenChem.passageText || ''}`
assert.doesNotMatch(chemBlob, /spring-mass/i, 'chemistry card must not keep the physics spring-mass passage')
assert.doesNotMatch(chemBlob, /spring-mass\.png/, 'chemistry card must not keep the spring figure')
assert.match(chemBlob, /C_\{9\}H_\{18\}O_\{2\}|oxygen atoms in S and T/i)

const physSpring = healUploadQuestionCard(
  {
    text: 'The amplitude of particle 2 is ______.',
    options: ['', '', '', ''],
    printedNumber: 33,
    questionNumber: 33,
    subject: 'physics',
    passageText: 'Three particles 1, 2 and 3 spring-mass oscillate with amplititu',
  },
  ADV_P2_OCR,
)
assert.match(String(physSpring.passageText), /as shown in the figure/i)
assert.match(String(physSpring.passageText), /spring-mass\.png/)
assert.doesNotMatch(
  `${physSpring.text}\n${physSpring.passageText || ''}`,
  /C_\{9\}H_\{18\}O_\{2\}/,
  'physics 33-34 must not contain C9H18O2',
)
assert.doesNotMatch(String(physSpring.passageText), /END OF THE QUESTION PAPER/i)

const q26San = sanitizeStemForDisplay('The ratio is (T_\\frac{1}{T_2}^2) then')
assert.doesNotMatch(mathStripped(q26San), /T_\\frac/)
assert.match(q26San, /T_1\^\{2\}|T_\{1\}\^\{2\}/)

const q43Heal = healUploadQuestionCard(
  {
    text: "van't Hoff boiling point elevation uses w2g and w1g in the formula.",
    options: ['', '', '', ''],
    printedNumber: 43,
  },
  'The elevation is proportional to $\\mathrm{w}_1$ and $\\mathrm{w}_2$.',
)
assert.doesNotMatch(q43Heal.text, /\bw2g\b/)
assert.match(q43Heal.text, /w_\{?1\}?|\\mathrm\{w\}_\{?1\}?/)

const recoveredYdse = recoverOfficialPyqPassageFromSource(
  {
    text: 'The fringe width is ______.',
    printedNumber: 31,
    questionNumber: 31,
    passageText: 'In a Young\'s double slit experiment, two slits are oscilc',
  },
  ADV_P2_OCR,
)
assert.match(String(recoveredYdse.passageText), /as shown in the figure/)
assert.match(String(recoveredYdse.passageText), /ydse\.png/)

const Q51_THEN =
  'Consider $M$ with $r=\\frac{1025}{513}$. Let $k$ be the number of all those circles $C_{n}$ that are inside $M$. Then'
assert.equal(stemLooksIncompleteOnDisplay(Q51_THEN), true, 'a lone "Then" with no options is torn')
assert.equal(
  stemLooksIncompleteOnDisplay(Q51_THEN, ['$k+2 l=22$', '$2 k+l=26$', '$2 k+3 l=34$', '$3 k+2 l=40$']),
  false,
  'options finish a stem that ends in "Then"',
)

const Q39_SETS =
  'Let $$\\begin{gathered} S_{1}=\\{1\\}, \\\\ S_{2}=\\{2\\} \\end{gathered}$$ and $$S_{4}=\\{(i, j, k, l): i, j, k \\text { and } l \\text { are distinct elements in }\\{1,2, \\ldots, 10\\}\\} .$$ If the total number is $n_{r}$, then TRUE ?'
const q39Prep = prepareTextForMathTextDisplay(sanitizeStemForDisplay(Q39_SETS))
assert.match(q39Prep, /\$\$\\begin\{gathered\}/, 'stacked sets stay display math')
assert.match(q39Prep, /\$\$S_\{4\}=/, 'a long set definition stays display math')
const Q53_G = 'and\n$$g(x)=\\int_{0}^{x^{2}} \\sqrt{t} e^{-t} d t, \\quad x>0$$'
assert.match(prepareTextForMathTextDisplay(Q53_G), /\$\$g\(x\)=\\int_/, 'an integral with limits stays display math')

console.log('test-stem-sanitize-everywhere: ok')
