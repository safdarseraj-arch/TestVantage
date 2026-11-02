/**
 * Shared Mathpix post-OCR process rules (Official PYQ + any-paper uploads).
 * Locks: strip noise, no glue/split, passage-in-range, match isolation,
 * sanitizer on pending cards, published immutability (covered separately).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  cleanMathpixCardText,
  preCleanMathpixOcr,
  stripNonQuestionNoise,
  restoreScanMathBreaks,
  validateMathpixQuestion,
} from '../src/utils/mathpixCleanPipeline.js'
import { expectedPyqTargetFromOcrLite } from '../src/utils/pyqOcrCountLite.js'
import { paperItemsFromMathpixOcr, splitGluedPaperItemText, extractLatexTabularMcq, recoverOptionsFromStem } from '../src/utils/mathpixQuestionSplit.js'
import { sanitizeStemForDisplay } from '../src/utils/sanitizeStemForDisplay.js'
import { latexExtractionIncomplete, linearizeChemReactionAligned } from '../src/utils/healTruncatedLatex.js'
import { stripLeakedOptionsFromStem } from '../src/utils/stripLeakedOptionsFromStem.js'
import { stripTrailingOptionMarkerFromStem } from '../src/utils/optionStemLeak.js'
import { wrapBareLatexRuns } from '../src/utils/wrapBareLatexRuns.js'
import { prepareTextForMathTextDisplay, commandLeftOutsideMathSegments } from '../src/utils/prepareMathForRender.js'
import { extractLatexItemizeMcq } from '../src/utils/mathpixQuestionSplit.js'
import { visibleLatexSourceHits } from '../src/utils/visibleLatexSource.js'
import { renderSideBySideSheetConfigs, unwrapReactionStepTables } from '../src/utils/latexTabularDisplay.js'
import { restoreMissingOptionGridGraphs } from '../src/utils/mathpixMedia.js'
import {
  officialPyqCardAllowsPassage,
  peelOfficialPyqCardForDisplay,
} from '../src/utils/passage.js'
import {
  parsePaperSectionMap,
  stampQuestionTypesFromSectionMap,
  stampSubjectsFromPaper,
} from '../src/utils/parsePaperSectionMap.js'
import {
  foldListIIFromOptionsIntoStem,
  matchListRowPlan,
  looksLikeMatchingListStem,
  parseMatchingListForDisplay,
} from '../src/utils/parseMatchingListDisplay.js'

// 1) Strip non-question noise (book / page / instructions / watermark)
const noisy = [
  'Chapter 3 Electrostatics',
  'Page 12 of 48',
  'INSTRUCTIONS TO CANDIDATES',
  'SPACE FOR ROUGH WORK',
  'www.randomcoaching.com',
  'CamScanner',
  '\\item[Q.] 1 Let $x=1$. Then',
  '(A) $1$',
  '(B) $2$',
  '(C) $3$',
  '(D) $4$',
].join('\n')
const cleaned = preCleanMathpixOcr(noisy)
assert.equal(/Chapter 3/i.test(cleaned), false)
assert.equal(/INSTRUCTIONS TO CANDIDATES/i.test(cleaned), false)
assert.equal(/SPACE FOR ROUGH WORK/i.test(cleaned), false)
assert.match(cleaned, /Let \$x=1/)
assert.equal(stripNonQuestionNoise('Page 3\nQ. 1 Hello').includes('Page 3'), false)

const keptFigure = preCleanMathpixOcr(
  'Q. 4 The plot is:\n(A) ![](https://cdn.mathpix.com/cropped/abc-13.jpg?height=10\\&width=20\\&top_left_y=1\\&top_left_x=2)\n![]( )',
)
assert.match(keptFigure, /cdn\.mathpix\.com\/cropped\/abc-13\.jpg/)
assert.match(keptFigure, /width=20&top_left_y=1/)
assert.doesNotMatch(keptFigure, /\\&/)

// 2) No glue across wrong questions — splitGlued recovers separate stems
const glued = `Let $a=1$. The value is
(A) 1
(B) 2
(C) 3
(D) 4
Four identical thin sheets. Match List-I with List-II.
List-I
(P) One
(Q) Two
List-II
(1) A
(2) B`
const split = splitGluedPaperItemText(glued)
assert.ok(split.stems.length >= 2, 'glued stems must separate')
assert.match(split.stems[0], /Let \$a=1/)
assert.match(split.stems[1], /Four identical/)

// 3) Passage attach only in official range
const ocrWithPara = [
  '\\section*{SECTION 3}',
  '\\item[-] This section contains TWO (02) paragraphs.',
  '\\item[-] Based on each paragraph, TWO (02) questions.',
  'PARAGRAPH "I"',
  'A particle moves with constant speed.',
  '\\item[Q.] 14 The speed is',
  '(A) $1$ (B) $2$ (C) $3$ (D) $4$',
  '\\item[Q.] 15 The time is',
  '(A) $1$ (B) $2$ (C) $3$ (D) $4$',
  '\\item[Q.] 16 Let $x=2$. Then',
  '(A) $1$ (B) $2$ (C) $3$ (D) $4$',
].join('\n')
const items = paperItemsFromMathpixOcr(ocrWithPara, {
  paperMeta: { exam: 'jee-advanced', year: 2024, session: 'Paper 1' },
})
const map = parsePaperSectionMap(ocrWithPara)
const stamped = stampQuestionTypesFromSectionMap(items, ocrWithPara, map)
const q16 = stamped.find((q) => Number(q.printedNumber || q.pyqSlot) === 16)
if (q16) {
  const peeled = peelOfficialPyqCardForDisplay(q16, ocrWithPara)
  const pass = String(peeled.passageText || '').trim()
  if (pass) {
    assert.equal(
      officialPyqCardAllowsPassage(peeled, ocrWithPara, map),
      true,
      'if passage present it must be in-range',
    )
  }
}

// 4) Match isolation — List-II from options folds into stem; no chem bleed check shape
const matchStem = `Match List-I with List-II.
List-I
(P) Force
(Q) Torque
(R) Energy
(S) Power
List-II
(1) smash`
const matchOpts = [
  'P-1',
  'P-2',
  `P-3
List-II
(1) $N$
(2) $N\\cdot m$
(3) $J$
(4) $W$
(5) $Pa$`,
  'P-4',
]
const folded = foldListIIFromOptionsIntoStem(matchStem, matchOpts)
const parsed = parseMatchingListForDisplay(folded.text, folded.options)
assert.ok(parsed)
assert.ok((parsed.listI?.length || 0) >= 4)
assert.ok((parsed.listII?.length || 0) >= 4)
assert.doesNotMatch(String(folded.options[2] || ''), /List-II/)
assert.doesNotMatch(folded.text + JSON.stringify(folded.options), /phenol|NaOH|alkene/i)

// 5) Sanitizer on pending-style card (options peeled, bare latex wrapped)
const stemLeak = `A wire loop turns by $\\theta$
(A) $1$
(B) $2$
(C) $3$
(D) $4$
\\begin{array}{c}1\\\\2\\end{array}`
const opts = ['$1$', '$2$', '$3$', '$4$']
const san = sanitizeStemForDisplay(stemLeak, opts)
assert.equal(/\(\s*A\s*\)/.test(san), false)
const peeledStem = stripLeakedOptionsFromStem(san, opts)
assert.equal(/\(\s*A\s*\)/.test(peeledStem), false)
const wrapped = wrapBareLatexRuns('\\frac{1}{2}+\\frac{3}{4}')
assert.match(wrapped, /\$/)
const smilesKept = wrapBareLatexRuns('<smiles>C/C(=N\\O)c1cc([N+](=O)[O-])ccc1Br</smiles>')
assert.match(smilesKept, /<smiles>C\/C\(=N\\O\)/)
assert.doesNotMatch(smilesKept, /\$\\O\$/)
const unitKept = prepareTextForMathTextDisplay(
  'as $R$ (in $\\mathrm{J} \\mathrm{K}^{-1} \\mathrm{~mol}^{-1}$ ), the minimum value of $|W|$',
)
assert.match(unitKept, /\\mathrm\{~mol\}\^\{-1\}\$ \)/)
assert.doesNotMatch(unitKept, /mol\}\^\{-1\} \), the minimum/)

// 6) Incomplete → flag, never invent
const incomplete = validateMathpixQuestion({
  text: 'Let $f(x)=\\frac{1}{',
  options: ['', '', '', ''],
})
assert.notEqual(incomplete.status, 'ok')

// 7) Matrix \\left[ array must stay wrapped (no raw \\end{array} in prose)
const matrixStem = String.raw`Consider $$M=\left[\begin{array}{rr}2 & -1 \\ 1 & 0\end{array}\right].$$ Then`
const matrixSan = sanitizeStemForDisplay(matrixStem, ['a', 'b', 'c', 'd'])
const matrixVis = matrixSan.replace(/\$\$[\s\S]*?\$\$/g, ' ').replace(/\$[^$]*\$/g, ' ')
assert.equal(/\\end\{array\}/.test(matrixVis), false, 'array must stay inside math delimiters')

const fenced = 'The value is ```latex\n\\frac{1}{2}\n``` exactly.\uFFFD'
const fenceClean = cleanMathpixCardText(fenced)
assert.equal(fenceClean.includes('```'), false, 'code fences must leave the stem')
assert.equal(fenceClean.includes('\uFFFD'), false, 'replacement characters must leave the stem')
const fenceShown = sanitizeStemForDisplay(fenced, [])
const fenceVis = fenceShown.replace(/\$\$[\s\S]*?\$\$/g, ' ').replace(/\$[^$]*\$/g, ' ')
assert.equal(/\\frac/.test(fenceVis), false, 'bare frac must render as math, not leftover code')

const smashedMatrix = String.raw`Let $$A=\begin{bmatrix}1 & 2 & 3 & 4 & 5 & 6 & 7 & 8 & 9\end{bmatrix}$$ be given.`
const matrixFixed = cleanMathpixCardText(smashedMatrix)
assert.match(matrixFixed, /\\\\/, 'matrix rows need a line break')
assert.ok((matrixFixed.match(/&/g) || []).length >= 6, 'matrix columns stay separated')
const proseLet = 'Let A be a 3 by 3 matrix with real entries.'
assert.equal(cleanMathpixCardText(proseLet).includes('\\begin{'), false, 'ordinary Let A be stays prose')
const nestedCases = String.raw`Let $$g(x)=\begin{cases}1-2x, & 0 \leq x \leq $\frac{1}{2}$ \\ 0, & \text{otherwise}\end{cases}$$`
const casesVis = cleanMathpixCardText(nestedCases).replace(/\$\$[\s\S]*?\$\$/g, ' ').replace(/\$[^$]*\$/g, ' ')
assert.equal(/\\begin/.test(casesVis), false, 'cases must stay inside math, not show as code')

const ocr48 = Array.from({ length: 48 }, (_, i) => `\\item[Q.] ${i + 1} Let $x=${i}$.`).join('\n')
assert.equal(expectedPyqTargetFromOcrLite('jee-advanced', ocr48), 48)

// 8) Tabular A–D options peel (not flattened into List-I)
const tabQ = String.raw`Let $x=1$. Then which is TRUE?
\begin{tabular}[t]{|l|l|}
\hline (A) & First choice \\
\hline (B) & Second choice \\
\hline (C) & Third choice \\
\hline (D) & Fourth choice \\
\end{tabular}`
const tab = extractLatexTabularMcq(tabQ)
assert.ok(tab)
assert.equal(tab.options.length, 4)
assert.match(tab.options[0], /First choice/)
assert.doesNotMatch(tab.options[0], /^&/)
const recovered = recoverOptionsFromStem(tabQ, ['', '', '', ''])
assert.ok(recovered.options.filter((o) => String(o).trim()).length >= 4)

// 9) Subject + type metatags from the paper (headers + SECTION 1 cycles)
const pcmOcr = [
  'PHYSICS',
  'SECTION 1 (Maximum Marks: 12)',
  '\\item[-] This section contains FOUR (04) questions.',
  '\\item[-] Each question has FOUR options (A), (B), (C) and (D). ONLY ONE of these four options is the correct answer.',
  '\\item[Q.] 1 A disk of radius R rolls without slipping. The torque is',
  '(A) $1$ (B) $2$ (C) $3$ (D) $4$',
  '\\item[Q.] 2 The magnetic field is',
  '(A) $1$ (B) $2$ (C) $3$ (D) $4$',
  'CHEMISTRY',
  'SECTION 1 (Maximum Marks: 12)',
  '\\item[-] This section contains FOUR (04) questions.',
  '\\item[-] Each question has FOUR options (A), (B), (C) and (D). ONLY ONE of these four options is the correct answer.',
  '\\item[Q.] 1 An ideal gas (0.5 mol) is compressed. The work is',
  '(A) $1$ (B) $2$ (C) $3$ (D) $4$',
  '\\item[Q.] 2 The compound with phenol and an alkene is',
  '(A) $1$ (B) $2$ (C) $3$ (D) $4$',
  'MATHEMATICS',
  'SECTION 1 (Maximum Marks: 12)',
  '\\item[-] This section contains FOUR (04) questions.',
  '\\item[-] Each question has FOUR options (A), (B), (C) and (D). ONLY ONE of these four options is the correct answer.',
  '\\item[Q.] 1 Let the function $f$ and the matrix $A$ be given. Then',
  '(A) $1$ (B) $2$ (C) $3$ (D) $4$',
  '\\item[Q.] 2 The parabola and the ellipse meet at',
  '(A) $1$ (B) $2$ (C) $3$ (D) $4$',
].join('\n')
const pcmItems = paperItemsFromMathpixOcr(pcmOcr, {
  paperMeta: { exam: 'jee-advanced', year: 2026, session: 'Paper 1' },
})
assert.ok(pcmItems.length >= 6, `expected 6 PCM cards, got ${pcmItems.length}`)
const pcmStamped = stampSubjectsFromPaper(
  stampQuestionTypesFromSectionMap(pcmItems, pcmOcr),
  pcmOcr,
)
assert.equal(pcmStamped[0].subject, 'physics')
assert.equal(pcmStamped[1].subject, 'physics')
assert.equal(pcmStamped[2].subject, 'chemistry')
assert.equal(pcmStamped[3].subject, 'chemistry')
assert.equal(pcmStamped[4].subject, 'mathematics')
assert.equal(pcmStamped[5].subject, 'mathematics')
assert.ok(
  pcmStamped.every((q) => q.questionType),
  'every card must have a question type metatag',
)
assert.ok(
  pcmStamped.slice(0, 2).every((q) => q.questionType === 'single_correct' || q.typeSource === 'paper_instruction'),
  'instruction-first SCQ type',
)

// Restarting printed Q.1: last subject block keeps the trailing match card.
const restartCards = [
  { text: 'Let the function f and the matrix A. Then', printedNumber: 1, questionNumber: 1, pyqSlot: 1, questionType: 'single_correct' },
  { text: 'The parabola and the ellipse meet at the latus rectum.', printedNumber: 2, questionNumber: 2, pyqSlot: 2, questionType: 'single_correct' },
  { text: 'A disk of radius R rolls without slipping. The torque and magnetic field.', printedNumber: 1, questionNumber: 3, pyqSlot: 3, questionType: 'single_correct' },
  { text: 'The capacitor and inductor in the circuit have current I.', printedNumber: 2, questionNumber: 4, pyqSlot: 4, questionType: 'single_correct' },
  { text: 'An ideal gas (0.5 mol) is compressed. The compound and phenol alkene.', printedNumber: 1, questionNumber: 5, pyqSlot: 5, questionType: 'single_correct' },
  { text: 'Match the major products obtained in the reactions given in List-I with phenol.', printedNumber: 2, questionNumber: 6, pyqSlot: 6, questionType: 'matrix_match' },
]
const restartStamped = stampSubjectsFromPaper(restartCards, '')
assert.equal(restartStamped[0].subject, 'mathematics')
assert.equal(restartStamped[2].subject, 'physics')
assert.equal(restartStamped[4].subject, 'chemistry')
assert.equal(restartStamped[5].subject, 'chemistry', 'trailing match stays in last subject block')

// Consecutive matching-list sets share the same opener. Both must survive.
const twoMatch = [
  'SECTION 4 (Maximum Marks: 16)',
  'This section contains FOUR (04) Matching List Sets.',
  'Q. 13',
  'Match each entry in List-I to the correct entry in List-II and choose the correct option.',
  'List-I',
  '(P) First roots',
  '(Q) Second roots',
  '(R) Third value',
  '(S) Fourth value',
  'List-II',
  '(1) $x^{2}+x+1=0$',
  '(2) $x^{2}-x+1=0$',
  '(3) $x^{2}+x-1=0$',
  '(4) $-1$',
  '(5) $-4$',
  '(A) (P) → (1) (B) (P) → (3) (C) (P) → (1) (D) (P) → (2)',
  'Q. 14',
  'Match each entry in List-I to the correct entry in List-II and choose the correct option.',
  'List-I',
  '(P) The number of elements in the set $\\{1\\}$',
  '(Q) The number of elements in the set $\\{2\\}$',
  '(R) The number of elements in the set $\\{3\\}$',
  '(S) The number of elements in the set $\\{4\\}$',
  'List-II',
  '(1) is 1',
  '(2) is 2',
  '(3) is 3',
  '(4) is 4',
  '(5) is 5',
  '(A) (P) → (2) (B) (P) → (5) (C) (P) → (5) (D) (P) → (4)',
].join('\n')
const matchItems = paperItemsFromMathpixOcr(twoMatch, {
  paperMeta: { exam: 'jee-advanced', year: 2026, session: 'Paper 1' },
})
const printed = matchItems.map((q) => Number(q.printedNumber || q.questionNumber))
assert.ok(printed.includes(13), `Q.13 kept, got ${printed.join(',')}`)
assert.ok(printed.includes(14), `Q.14 kept, got ${printed.join(',')}`)
for (const q of matchItems) {
  const blob = `${q.text}\n${(q.options || []).join('\n')}`
  assert.match(blob, /List-I/i)
  assert.match(blob, /List-II|\(1\)/i)
}

// "as a function of" is the same question, not a new card. Figures stay with it.
const lens = [
  'Q. 4 A double convex lens is immersed in a liquid of refractive index $n_{L}$. The correct plot showing the variation of the power as a function of $n_{L}$ is:',
  '\\begin{tabular}[t]{|l|l|l|l|}',
  '\\hline (A) & \\includegraphics{https://cdn.mathpix.com/a.jpg?height=1} & (B) & \\includegraphics{https://cdn.mathpix.com/b.jpg?height=1} \\\\',
  '\\hline (C) & \\includegraphics{https://cdn.mathpix.com/c.jpg?height=1} & (D) & \\includegraphics{https://cdn.mathpix.com/d.jpg?height=1} \\\\',
  '\\hline',
  '\\end{tabular}',
  'Q. 5 Consider a hydrogen atom with velocity $v_{k}$.',
  '(A) $1$ (B) $2$ (C) $3$ (D) $4$',
].join('\n')
const lensItems = paperItemsFromMathpixOcr(lens, {
  paperMeta: { exam: 'jee-advanced', year: 2026, session: 'Paper 1' },
})
assert.equal(lensItems.length, 2, `lens split count ${lensItems.length}`)
assert.match(String(lensItems[0].text || ''), /double convex lens/)
assert.match(String(lensItems[0].text || '') + (lensItems[0].options || []).join(' '), /includegraphics|function of/)
assert.equal(/^a function of/i.test(String(lensItems[1].text || '')), false)

// An option cell that starts with "If" stays inside that question.
const ifOpt = [
  'Q. 7 Let $f$ be a function. Then which of the following statements is TRUE?',
  '\\begin{tabular}[t]{|l|l|}',
  '\\hline (A) & The function $g$ is continuous \\\\',
  '\\hline (B) & If $f$ is continuous then $g$ is differentiable \\\\',
  '\\hline (C) & If $g$ is differentiable then $f$ is continuous \\\\',
  '\\hline (D) & If $g$ is differentiable then the limit exists \\\\',
  '\\hline',
  '\\end{tabular}',
  'Q. 8 Consider the matrix $M$. Then which is TRUE?',
  '(A) $1$ (B) $2$ (C) $3$ (D) $4$',
].join('\n')
const ifItems = paperItemsFromMathpixOcr(ifOpt, {
  paperMeta: { exam: 'jee-advanced', year: 2026, session: 'Paper 1' },
})
assert.equal(ifItems.length, 2, `If-option split count ${ifItems.length}`)
assert.equal(Number(ifItems[0].printedNumber || ifItems[0].questionNumber), 7)
assert.ok((ifItems[0].options || []).filter((o) => String(o).trim()).length >= 4)

// Piecewise g(x) stays inside the same display as f(x). Do not show cases as code.
const piecewise = String.raw`Let $$f(x)=\left\{\begin{array}{ll} x|x|, & x \neq 0, \\ 0, & x=0, \end{array} \quad \text { and } \quad g(x)= \begin{cases}1-2 x, & 0 \leq x \leq \frac{1}{2} \\ 0, & \text { otherwise }\end{cases}\right.$$`
const piecewiseSan = sanitizeStemForDisplay(piecewise, [])
const piecewiseVis = piecewiseSan.replace(/\$\$[\s\S]*?\$\$/g, ' ').replace(/\$[^$]*\$/g, ' ')
assert.equal(/\\begin\{cases\}/.test(piecewiseVis), false, 'piecewise cases must stay inside math')
assert.equal(/\$\\frac\{1\}\{2\}\$/.test(piecewiseSan), false, 'no raw dollar inside cases')
assert.equal(piecewiseSan.includes('$$\\begin{cases}'), false, 'do not close display before cases')

// Column vectors already inside $\left( stay there. Do not nest $$.
const cols = String.raw`the set $\left\{\left(\begin{pmatrix}x \\ y \\ z\end{pmatrix}\right): x \in \mathbb{R}\right\}$ is`
const colsSmashed = String.raw`the set $\left\{\left($$\begin{pmatrix}x \\ y \\ z\end{pmatrix}$$\right): x \in \mathbb{R}\right\}$ is`
const colsSan = sanitizeStemForDisplay(colsSmashed, [])
assert.equal(colsSan.includes('$$\\begin{pmatrix}'), false, 'do not nest $$ inside \\left(')
assert.equal(/\\begin\{pmatrix\}/.test(colsSan), true, 'column entries stay')
assert.match(sanitizeStemForDisplay(cols, []), /\\begin\{pmatrix\}/)

// Stray $ glued to a display closer is not a cut-off formula.
const reagent = String.raw`$$\text { i) } \mathrm{Hg}^{2+}, \mathrm{H}_{3} \mathrm{O}^{+}$$$`
const reagentSan = sanitizeStemForDisplay(reagent, [])
assert.equal((reagentSan.match(/(?<!\\)\$/g) || []).length % 2, 0, 'reagent dollars balance')
const givenTail = String.raw`[Given, atomic weight: $\mathrm{H}=1$, $\mathrm{Ca}=40 ]`
const givenSan = sanitizeStemForDisplay(givenTail, [])
assert.equal((givenSan.match(/(?<!\\)\$/g) || []).length % 2, 0, 'closing bracket keeps the last dollar')
const znFig = String.raw`ii) $\mathrm{Zn}-\mathrm{Hg} / \mathrm{HCl} \includegraphics{https://cdn.mathpix.com/a.jpg} Glycerol`
const znSan = sanitizeStemForDisplay(znFig, [])
assert.match(znSan, /\\mathrm\{HCl\}\s*\$\s*\\includegraphics/, 'formula closer stays before the figure')
assert.equal((znSan.match(/(?<!\\)\$/g) || []).length % 2, 0, 'Zn dollars balance')

const gluedScheme = String.raw`Correct statement(s) about the compounds X, Y and Z is(are) $\mathrm{MnO}_{2}+\text { Conc. } \mathrm{HCl} \longrightarrow \mathrm{MnCl}_{2}+\underset{\text { (greenish yellow gas) }}{\mathbf{X}}+\mathrm{H}_{2} \mathrm{O}$$\underset{\text { (excess) }}{\mathrm{NH}_{3}}+\underset{ }{\mathbf{X}} \longrightarrow \underset{ }{\mathbf{Y}}+\mathrm{HCl}$$\mathbf{X}+\underset{\text { (excess) }}{\mathrm{F}_{2}} \xrightarrow{573 \mathrm{~K}} \mathbf{Z}$`
const schemeSan = sanitizeStemForDisplay(gluedScheme, [])
assert.equal(latexExtractionIncomplete(schemeSan), false, 'a complete chemistry scheme is not extraction incomplete')
assert.equal((schemeSan.match(/\$\$/g) || []).length, 6, 'three chemistry displays stay closed')
const collapsedScheme = String.raw`Correct statement(s) about the compounds X, Y and Z is(are) $\mathrm{MnO}_{2}+\text { Conc. } \mathrm{HCl} \longrightarrow \mathrm{MnCl}_{2}+\underset{\text { (greenish yellow gas) }}{\mathbf{X}}+\mathrm{H}_{2} \mathrm{O} \underset{\text { (excess) }}{\mathrm{NH}_{3}}+\underset{ }{\mathbf{X}} \longrightarrow \underset{ }{\mathbf{Y}}+\mathrm{HCl} \mathbf{X}+\underset{\text { (excess) }}{\mathrm{F}_{2}} \xrightarrow{573 \mathrm{~K}} \mathbf{Z}$`
const collapsedSan = sanitizeStemForDisplay(collapsedScheme, [])
assert.equal(latexExtractionIncomplete(collapsedSan), false, 'collapsed chemistry scheme is not extraction incomplete')
assert.equal((collapsedSan.match(/\$\$/g) || []).length, 6, 'collapsed chemistry scheme splits into three displays')
const ocrScheme = String.raw`Correct statement(s) about the compounds X, Y and Z is(are)
$$\mathrm{MnO}_{2}+\text { Conc. } \mathrm{HCl} \longrightarrow \mathrm{MnCl}_{2}+\underset{\text { (greenish yellow gas) }}{\mathbf{X}}+\mathrm{H}_{2} \mathrm{O}$$
$$\underset{\text { (excess) }}{\mathrm{NH}_{3}}+\underset{ }{\mathbf{X}} \longrightarrow \underset{ }{\mathbf{Y}}+\mathrm{HCl}$$
$$\mathbf{X}+\underset{\text { (excess) }}{\mathrm{F}_{2}} \xrightarrow{573 \mathrm{~K}} \mathbf{Z}$$`
const ocrSan = sanitizeStemForDisplay(ocrScheme, [])
assert.equal(latexExtractionIncomplete(ocrSan), false, 'OCR chemistry scheme is not extraction incomplete')
assert.equal((ocrSan.match(/\$\$/g) || []).length, 6, 'OCR chemistry scheme keeps three displays')

const rodPage = 'https://cdn.mathpix.com/cropped/29f8b727-48a8-4bba-8b95-542e9562d45f-24.jpg'
const rodOcr = `Q. 16 List-I shows four planar structures made of uniform solid rods each of mass $m$ and length $l$. In the List-II the possible moment of inertia of these structures about an axis $O C O^{\\prime}$, which lies in the plane of the structures, are given.
Choose the option that describes the correct match between the entries in List-I to those in List-II.
\\includegraphics{${rodPage}?height=311&width=306&top_left_y=790&top_left_x=580}
(1) $\\frac{5}{4} m l^{2}$
(Q)
![](${rodPage}?height=237&width=409&top_left_y=1121&top_left_x=493)
\\includegraphics{${rodPage}?height=386&width=288&top_left_y=1402&top_left_x=557}
\\includegraphics{${rodPage}?height=290&width=206&top_left_y=1861&top_left_x=601}
(4) $\\frac{2}{3} m l^{2}$
![](${rodPage}?height=71&width=164&top_left_y=2149&top_left_x=1133)
\\begin{tabular}[t]{|l|l|}
\\hline (A) & $\\mathrm{P} \\rightarrow 5, \\mathrm{Q} \\rightarrow 1, \\mathrm{R} \\rightarrow 4, \\mathrm{~S} \\rightarrow 2$ \\\\
\\hline (B) & $\\mathrm{P} \\rightarrow 1, \\mathrm{Q} \\rightarrow 3, \\mathrm{R} \\rightarrow 4, \\mathrm{~S} \\rightarrow 2$ \\\\
\\hline (C) & $\\mathrm{P} \\rightarrow 5, \\mathrm{Q} \\rightarrow 3, \\mathrm{R} \\rightarrow 2, \\mathrm{~S} \\rightarrow 1$ \\\\
\\hline (D) & $\\mathrm{P} \\rightarrow 5, \\mathrm{Q} \\rightarrow 4, \\mathrm{R} \\rightarrow 2, \\mathrm{~S} \\rightarrow 1$ \\\\
\\hline
\\end{tabular}
Q. 17 A second question so the splitter keeps both cards. The value of $x$ is
\\begin{tabular}[t]{|l|l|}
\\hline (A) & 1 \\\\
\\hline (B) & 2 \\\\
\\hline (C) & 3 \\\\
\\hline (D) & 4 \\\\
\\hline
\\end{tabular}
`
const rodItems = paperItemsFromMathpixOcr(rodOcr, { paperMeta: { exam: 'jee-advanced' } })
const rod = rodItems[0]
const rodLists = parseMatchingListForDisplay(rod.text, rod.options)
const rodII = (rodLists?.listII || []).map((r) => r.label)
assert.deepEqual(rodII, ['(1)', '(2)', '(3)', '(4)', '(5)'], 'List-II (2) and (3) survive between (1) and (4)')
assert.match(rodLists.listII[1].text, /frac\{1\}\{6\}/, 'row (2) is 1/6 ml^2 from the page image')
assert.match(rodLists.listII[2].text, /frac\{1\}\{12\}/, 'row (3) is 1/12 ml^2 from the page image')
assert.match(rodLists.listII[0].text, /frac\{5\}\{4\}/, '(1) stays 5/4 ml^2')
assert.match(rodLists.listII[3].text, /frac\{2\}\{3\}/, '(4) stays 2/3 ml^2 and is not shifted up')
assert.match(rodLists.listII[4].text, /frac\{1\}\{3\}/, 'row (5) is 1/3 ml^2')
assert.doesNotMatch(rodLists.listII[4].text, /includegraphics|!\[[^\]]*\]|\(\s*5\s*\)/, 'row (5) label is not repeated inside the cell')
assert.match(String(rod.options?.[0] || ''), /Q (?:\\rightarrow|→) 1/, 'rod option A stays')
assert.match(String(rod.options?.[1] || ''), /Q (?:\\rightarrow|→) 3/, 'rod option B stays')
assert.equal((rod.options || []).filter((o) => String(o).trim()).length, 4, 'rod options stay on the rod question')

const ozone = `Q. 15 The List-II contains products obtained from the reaction of compounds in List-I with ozone followed by cyclization (via more stable enolate) in the presence of aqueous NaOH. Match each entry in List-I with appropriate entry in List-II and choose the correct option.
List-I
(P)
<smiles>CC1CCCC2=C1CCCC2C</smiles>
(Q)
<smiles>CC1CCCC2=C1CCCC2C</smiles>
(R)
<smiles>CC1CCCC(C)C2=C1CCC2</smiles>
(S)
<smiles>CC1CCC(C)C2=C1CCCC2</smiles>
List-II
(1)
<smiles>CC1CCC(=O)C2(C)CCCCC12O</smiles>
(2)
<smiles>CC1CCCC(=O)C2(C)CCCC12O</smiles>
(3)
<smiles>CC1CCC2(C)C(=O)CCCCC12O</smiles>
(4)
<smiles>CC1CCCC2(C)CCCC(=O)C12O</smiles>
(5)
<smiles>CC1CCCC2(C)C(=O)CCCC12O</smiles>
Q. 16 Match the major products obtained in the reactions given in List-I with the corresponding structures in List-II and choose the correct option.
List-I
(P) first reaction
List-II
(1) one
(2) two
(5)
<smiles>C/C(=N\\O)c1cc([N+](=O)[O-])ccc1Br</smiles>
\\begin{tabular}[t]{|l|l|}
\\hline (A) & $\\mathrm{P} \\rightarrow 2 ; \\mathrm{Q} \\rightarrow 1 ; \\mathrm{R} \\rightarrow 5 ; \\mathrm{S} \\rightarrow 4$ \\\\
\\hline (B) & $\\mathrm{P} \\rightarrow 1 ; \\mathrm{Q} \\rightarrow 2 ; \\mathrm{R} \\rightarrow 4 ; \\mathrm{S} \\rightarrow 5$ \\\\
\\hline (C) & $\\mathrm{P} \\rightarrow 1 ; \\mathrm{Q} \\rightarrow 2 ; \\mathrm{R} \\rightarrow 3 ; \\mathrm{S} \\rightarrow 4$ \\\\
\\hline (D) & $\\mathrm{P} \\rightarrow 2 ; \\mathrm{Q} \\rightarrow 1 ; \\mathrm{R} \\rightarrow 3 ; \\mathrm{S} \\rightarrow 5$ \\\\
\\hline
\\end{tabular}
`
const ozoneItems = paperItemsFromMathpixOcr(ozone, { paperMeta: { exam: 'jee-advanced' } })
assert.equal(ozoneItems.length, 2, 'structure list and the next match stay two questions')
const q15opts = (ozoneItems[0].options || []).map((o) => String(o).replace(/\s+/g, ' '))
assert.match(q15opts[0], /Q (?:\\rightarrow|→) 4/, 'Q47 options stay on the structure question')
assert.match(q15opts[3], /Q (?:\\rightarrow|→) 5/, 'Q47 option D stays on that question')
const q16opts = (ozoneItems[1].options || []).map((o) => String(o).replace(/\s+/g, ' '))
assert.match(q16opts[0], /R (?:\\rightarrow|→) 5/, 'the next question keeps its own option table')
assert.equal(q16opts.some((o) => /Q (?:\\rightarrow|→) 4/.test(o)), false, 'do not move Q47 options onto the next question')

const tubePage = 'https://cdn.mathpix.com/cropped/29f8b727-48a8-4bba-8b95-542e9562d45f-21.jpg'
const loopPage = 'https://cdn.mathpix.com/cropped/29f8b727-48a8-4bba-8b95-542e9562d45f-23.jpg'
const tubeOcr = `Q. 13 List-I shows four configurations made of straight and semi-circular narrow tubes containing air. A sound wave of wavelength $\\lambda=0.29 \\mathrm{~m}$ enters at $S$.
Choose the option that best describes the match between the entries in List-I to those in List-II.
\\caption{List-I}
\\includegraphics{${tubePage}?height=279&width=402&top_left_y=582&top_left_x=466}
\\caption{List-II}
\\includegraphics{${tubePage}?height=46&width=174&top_left_y=571&top_left_x=1130}
\\caption{(Q)}
\\includegraphics{${tubePage}?height=260&width=400&top_left_y=904&top_left_x=475}
(R)
\\includegraphics{${tubePage}?height=356&width=372&top_left_y=1183&top_left_x=466}
\\caption{(S)}
\\includegraphics{${tubePage}?height=260&width=500&top_left_y=1557&top_left_x=459}
Q. 15 List-I contains four conducting loops. List-II contains the induced current graphs.
(1) \\includegraphics{${loopPage}?height=276&width=425&top_left_y=575&top_left_x=1240}
(2) \\includegraphics{${loopPage}?height=235&width=370&top_left_y=948&top_left_x=1242}
(3) \\includegraphics{${loopPage}?height=279&width=432&top_left_y=1366&top_left_x=1245}
(4) \\includegraphics{${loopPage}?height=279&width=429&top_left_y=1754&top_left_x=1238}
(5) \\includegraphics{${loopPage}?height=281&width=445&top_left_y=2147&top_left_x=1245}
\\begin{tabular}[t]{|l|l|}
\\hline (A) & $\\mathrm{P} \\rightarrow 5, \\mathrm{Q} \\rightarrow 4, \\mathrm{R} \\rightarrow 1, \\mathrm{~S} \\rightarrow 3$ \\\\
\\hline (B) & $\\mathrm{P} \\rightarrow 3, \\mathrm{Q} \\rightarrow 2, \\mathrm{R} \\rightarrow 5, \\mathrm{~S} \\rightarrow 4$ \\\\
\\hline (C) & $\\mathrm{P} \\rightarrow 3, \\mathrm{Q} \\rightarrow 2, \\mathrm{R} \\rightarrow 1, \\mathrm{~S} \\rightarrow 4$ \\\\
\\hline (D) & $\\mathrm{P} \\rightarrow 5, \\mathrm{Q} \\rightarrow 1, \\mathrm{R} \\rightarrow 2, \\mathrm{~S} \\rightarrow 3$ \\\\
\\hline
\\end{tabular}
`
const tubeItems = paperItemsFromMathpixOcr(tubeOcr, { paperMeta: { exam: 'jee-advanced' } })
assert.equal(tubeItems.length, 2, 'tube question and the next match stay separate')
const tube = tubeItems[0]
const tubeLists = parseMatchingListForDisplay(tube.text, tube.options)
const tubeII = (tubeLists?.listII || []).map((r) => String(r.text))
assert.equal((tubeLists?.listII || []).map((r) => r.label).join(','), '(1),(2),(3),(4),(5)', 'tube List-II keeps rows 1 to 5')
assert.match(tubeII[0], /1\.32/, 'tube row (1)')
assert.match(tubeII[1], /1\.19/, 'tube row (2)')
assert.match(tubeII[2], /0\.51/, 'tube row (3)')
assert.match(tubeII[3], /0\.29/, 'tube row (4)')
assert.match(tubeII[4], /0\.13/, 'tube row (5)')
assert.equal(/induced current|d45f-23\.jpg/.test(tube.text), false, 'tube card does not take the next question List-II')
assert.equal(/Not inventing|missing List|Extraction incomplete|Math looks cut off/.test(tube.text), false, 'scanner notes are not stored in the stem')
const tubeOpts = (tube.options || []).map((o) => String(o).replace(/\s+/g, ' '))
assert.match(tubeOpts[0], /P (?:\\rightarrow|→) 4/, 'tube options are the tube table')
assert.match(tubeOpts[0], /Q (?:\\rightarrow|→) 3/, 'tube option A keeps Q → 3')
assert.equal(/P (?:\\rightarrow|→) 5/.test(tubeOpts[0]), false, 'tube options are not the next question table')
const loops = tubeItems[1]
assert.match(String(loops.text), /induced current/, 'next question keeps its own stem')
assert.match(String(loops.text), /d45f-23\.jpg/, 'next question keeps its List-II figures')
const loopOpts = (loops.options || []).map((o) => String(o).replace(/\s+/g, ' '))
assert.match(loopOpts[0] || '', /P (?:\\rightarrow|→) 5/, 'next question keeps its own options')
assert.equal(tube.cleanNotes || '', '', 'complete tube list is not flagged missing')

const stripped = cleanMathpixCardText(
  '29. Match-the-column is missing List-II. Not inventing rows.\nA sound wave enters the tubes.',
)
assert.equal(/Not inventing|missing List/.test(stripped), false, 'warning sentences are removed from question text')
assert.match(stripped, /sound wave/, 'the real stem stays')

const q48 = [
  'Match the major products obtained in the reactions given in List-I with the corresponding structures in List-II and choose the correct option.',
  '',
  'List-I',
  '',
  '(P) (P)',
  '\\includegraphics{https://cdn.mathpix.com/cropped/29f8b727-48a8-4bba-8b95-542e9562d45f-34.jpg?height=192&width=678&top_left_y=411&top_left_x=359}',
  '\\includegraphics{https://cdn.mathpix.com/cropped/29f8b727-48a8-4bba-8b95-542e9562d45f-34.jpg?height=219&width=683&top_left_y=687&top_left_x=359}',
  '\\includegraphics{https://cdn.mathpix.com/cropped/29f8b727-48a8-4bba-8b95-542e9562d45f-34.jpg?height=237&width=665&top_left_y=1007&top_left_x=361}',
  '\\includegraphics{https://cdn.mathpix.com/cropped/29f8b727-48a8-4bba-8b95-542e9562d45f-34.jpg?height=281&width=708&top_left_y=1354&top_left_x=361}',
  '\\includegraphics{https://cdn.mathpix.com/cropped/29f8b727-48a8-4bba-8b95-542e9562d45f-34.jpg?height=192&width=665&top_left_y=1443&top_left_x=402}',
  '',
  'List-II',
  '(1) <smiles>N#Cc1cc([N+](=O)[O-])ccc1O</smiles>',
  '(2) <smiles>N#Cc1cc([N+](=O)[O-])ccc1Br</smiles>',
  '(3) <smiles>CC(=O)Nc1cc([N+](=O)[O-])ccc1Br</smiles>',
  '(4) <smiles>Cc1noc2ccc([N+](=O)[O-])cc12</smiles>',
  '(5) <smiles>C/C(=N\\O)c1cc([N+](=O)[O-])ccc1Br</smiles>',
].join('\n')
const q48clean = cleanMathpixCardText(q48)
assert.equal(/\(P\)\s+\(P\)/.test(q48clean), false, 'List-I does not emit (P) (P)')
assert.equal((q48clean.match(/top_left_y=1443/g) || []).length, 0, 'overlapping extra crop of the same row is dropped')
assert.match(q48clean, /top_left_y=459/, 'row (P) crop starts below the baked label')
assert.match(q48clean, /height=144&width=678/, '(P) structure height stays')
assert.match(q48clean, /tv_row=1/, 'trimmed crop is marked so it is not trimmed again')
const q48again = cleanMathpixCardText(q48clean)
assert.equal(
  (q48again.match(/top_left_y=\d+/g) || []).join(','),
  (q48clean.match(/top_left_y=\d+/g) || []).join(','),
  'a second clean does not crop the structure again',
)
const q48lists = parseMatchingListForDisplay(q48clean)
assert.deepEqual((q48lists?.listI || []).map((r) => r.label), ['(P)', '(Q)', '(R)', '(S)'])
assert.equal((q48lists?.listII || []).length, 5, 'List-II rows stay')
assert.match(q48clean, /Match the major products/, 'the stem start stays')
const tubeFig = cleanMathpixCardText(
  'List-I\n\\includegraphics{https://cdn.mathpix.com/cropped/tube.jpg?height=279&width=402&top_left_y=582&top_left_x=466}\nList-II\n(1) 1.32 m',
)
assert.match(tubeFig, /height=279&width=402&top_left_y=582/, 'narrow tube figure is not top-trimmed')

// 9) Display must not leave \\mathrm / \\frac as visible source, or a dangling $$.
const givenShown = prepareTextForMathTextDisplay('[Given: $9^{1 / 3}=2.08$ ]')
assert.equal((givenShown.match(/\$/g) || []).length % 2, 0, 'Given value keeps balanced dollars')
assert.match(givenShown, /2\.08/)
assert.doesNotMatch(givenShown, /\$\s+\$\s*\]/, 'closing dollar before ] is not left dangling')
const sinGiven = prepareTextForMathTextDisplay('Given: $$\\sin \\left(2^{\\circ}\\right)= 0.035$ ]')
assert.equal((sinGiven.match(/\$/g) || []).length % 2, 0, 'display Given value closes before ]')
assert.match(sinGiven, /0\.035/)
const angleShown = prepareTextForMathTextDisplay('( $2^{\\circ} \\pm 40^{\\prime}$$ )')
assert.equal((angleShown.match(/\$/g) || []).length % 2, 0, 'angle unit closer stays one dollar')
assert.doesNotMatch(angleShown, /\$\$\s*\)/)
const percentShown = prepareTextForMathTextDisplay('concentration 0.25$\\% ($$mass/mass) has $____$.')
assert.doesNotMatch(percentShown, /\(\$\$/, 'percent text does not keep an extra dollar')
const setShown = prepareTextForMathTextDisplay(
  'Let $$A=\\{x \\in(-3,3): f \\text { is discontinuous at } x\\}$$ and $$B=\\{x \\in(-3,3): g \\text { is discontinuous at } x\\} .$$ Then $|A \\cap B|$ is $____$.',
)
assert.doesNotMatch(setShown, /\}\s*and\$|\$\$Then/, 'set display must not glue the next word')
const setVis = setShown.replace(/\$\$[\s\S]*?\$\$/g, ' ').replace(/\$[^$\n]+\$/g, ' ')
assert.doesNotMatch(setVis, /\\(?:mathrm|frac|text|cap)\b/, 'set commands stay inside math')
const unitShown = prepareTextForMathTextDisplay(
  'The conductivity is $1.40 \\times 10^{-6} \\mathrm{~S} \\mathrm{~cm}^{-1}$.',
)
const unitVis = unitShown.replace(/\$\$[\s\S]*?\$\$/g, ' ').replace(/\$[^$\n]+\$/g, ' ')
assert.doesNotMatch(unitVis, /\\(?:mathrm|frac|times)\b/, 'unit commands stay inside math')
const emptyImg = cleanMathpixCardText('See !][() and ![]() the figure. Not inventing a missing part.')
assert.doesNotMatch(emptyImg, /!\]\s*\[|!\[\s*\]\s*\(|Not inventing/)

// 10) A List-II row that is in the OCR stays on the card. Passage header stays with its numbers.
const listOcr = [
  'SECTION 4 (Maximum Marks: 16)',
  'This section contains FOUR (04) Matching List Sets.',
  'Q. 1 Match each entry in List-I to the correct entry in List-II and choose the correct option.',
  'List-I',
  '(P) First roots',
  '(Q) Second roots',
  '(R) Third value kept',
  '(S) Fourth value',
  'List-II',
  '(1) is one',
  '(2) is two',
  '(3) is three kept',
  '(4) is four',
  '(5) is five',
  '(A) (P) → (1) (B) (P) → (3) (C) (P) → (1) (D) (P) → (2)',
].join('\n')
const listOnly = paperItemsFromMathpixOcr(listOcr, {
  paperMeta: { exam: 'jee-advanced', year: 2026, session: 'Paper 2' },
})
const listBlob = listOnly.map((q) => `${q.text}\n${(q.options || []).join('\n')}`).join('\n')
assert.match(listBlob, /\(R\)[\s\S]{0,40}Third value kept/, 'List-I (R) row is not dropped')
assert.match(listBlob, /\(3\)[\s\S]{0,40}three kept/, 'List-II (3) row is not dropped')
const stemOcr = [
  '\\item[Q.] 16 The capacitance is $C$.',
  '\\section*{Question Stem for Question Nos. 17 and 18}',
  'A uniform circular disk of radius 0.2 m.',
  '\\item[Q.] 17 The speed of the disk is $v$.',
  '\\item[Q.] 18 The force on the disk is $F$.',
].join('\n')
const stemItems = paperItemsFromMathpixOcr(stemOcr, {
  paperMeta: { exam: 'jee-advanced', year: 2026, session: 'Paper 2' },
})
const stemWrong = stemItems.filter((q) => {
  const printed = Number(q.printedNumber)
  return /Question Stem for Question Nos/i.test(String(q.text || '')) && printed !== 17 && printed !== 18
})
assert.equal(stemWrong.length, 0, 'passage header stays on questions 17 and 18')
const diskOwners = stemItems.filter((q) => /circular disk/i.test(`${q.passageText || ''} ${q.text || ''}`))
assert.ok(diskOwners.length >= 1, 'disk passage is kept')
assert.ok(
  diskOwners.every((q) => Number(q.printedNumber) === 17 || Number(q.printedNumber) === 18),
  'disk passage is not glued onto another question number',
)

const saltTable = cleanMathpixCardText(
  '\\begin{tabular}{|l|l|l|} \\hline \\multirow{2}{*}{\\mathrm{NaNO}_{3}} & 0.01 & 111 \\\\ \\hline & 0.04 & 101 \\\\ \\hline \\end{tabular}',
)
assert.doesNotMatch(saltTable, /\\multirow/, 'multirow is not left as source')
assert.match(saltTable, /NaNO/, 'salt name stays')
assert.match(saltTable, /0\.04/, 'second concentration row stays')

const readingsTable = cleanMathpixCardText(
  '\\begin{tabular}{|l|l|l|} \\hline & \\multicolumn{2}{|c|}{Readings} \\\\ \\hline & LS (mm) & CS \\\\ \\hline Wire-1 & 0.5 & 42 \\\\ \\hline Wire-2 & 1.5 & 95 \\\\ \\hline \\end{tabular}',
)
assert.doesNotMatch(readingsTable, /\\multicolumn/, 'multicolumn is not left as source')
assert.match(readingsTable, /Readings/, 'Readings header stays')
assert.match(readingsTable, /Wire-1[\s\S]*0\.5[\s\S]*42/, 'Wire-1 row stays')
assert.match(readingsTable, /Wire-2[\s\S]*1\.5[\s\S]*95/, 'Wire-2 row stays')

const arrowShown = prepareTextForMathTextDisplay(
  '$$\\text { Caprolactam } \\xrightarrow[\\Delta]{\\mathrm{H}_{3} \\mathrm{O}^{+}} \\mathbf{Y}$$',
)
assert.equal(visibleLatexSourceHits(arrowShown).length, 0, 'xrightarrow inside math is not source')
assert.doesNotMatch(
  prepareTextForMathTextDisplay('of $\\mathbf{X}$$ completely reacts'),
  /\\mathbf\{X\}\$\$/,
  'a doubled closer on mathbf is healed',
)

const warned = { text: 'Raw LaTeX is still showing as code.\nAt 300 K the salt is NaCl.' }
const warnedBefore = warned.text
const warnedCheck = validateMathpixQuestion(warned)
assert.equal(warned.text, warnedBefore, 'the checker does not write its sentence into the question')
assert.equal(warnedCheck.status, 'latex_noise')
const warnedClean = cleanMathpixCardText(warned.text)
assert.doesNotMatch(warnedClean, /Raw LaTeX is still showing/, 'the checker sentence is not stored in the stem')
assert.match(warnedClean, /NaCl/)

const plates =
  'plates ( $\\mathrm{M}_{1}$ and $\\mathrm{M}_{2}$ ) area $\\sqrt{10} \\mathrm{~cm}^{2}$ near constant $\\epsilon_{r}=1$ and is maintained at time $t>0$ is shown.'
const platesShown = prepareTextForMathTextDisplay(plates)
assert.match(platesShown, /\$\\mathrm\{M\}_\{1\}\$/, 'the opener before M1 stays')
assert.match(platesShown, /and is maintained/)
assert.match(platesShown, /\$t>0\$ is shown/)
assert.doesNotMatch(platesShown, /1and|0is/)
assert.equal(visibleLatexSourceHits(plates).length, 0, 'a normal epsilon span is not raw source')
assert.ok(
  visibleLatexSourceHits('has$$ \\epsilon_{r}=1and is maintained').length > 0,
  'a stray dollar that leaves epsilon as source is blocked',
)

const reaction = [
  'In the following reaction sequence, major products X and Y are acyclic monomers.',
  '\\begin{itemize}',
  '\\item[1.] KCN',
  '\\item[2.] $\\mathrm{H}_{3}\\mathrm{O}^{+}, \\Delta$',
  '\\item[3.] Red P, $\\mathrm{Br}_{2}$',
  '\\end{itemize}',
  '$\\mathrm{CH}_{3}\\mathrm{I} \\xrightarrow{\\text{4. }\\mathrm{NH}_{3}} \\mathbf{X}$',
  '500 mol of $\\mathbf{X}$ completely reacts with 500 mol of $\\mathbf{Y}$.',
].join('\n')
const peeled = extractLatexItemizeMcq(reaction)
assert.ok(peeled?.reactionStepsInStem, 'numbered reaction steps stay in the question')
assert.match(peeled.stem, /1\.\s*KCN/)
assert.match(peeled.stem, /Red P/)
assert.match(peeled.stem, /xrightarrow/, 'the reaction arrow stays in the question')
assert.match(peeled.stem, /500 mol of/, 'the numerical ask stays in the question')
assert.equal((peeled.options || []).filter((o) => String(o).trim()).length, 0, 'reagent steps are not options')
const again = recoverOptionsFromStem(peeled.stem, ['', '', '', ''])
assert.match(again.stem, /1\.\s*KCN/, 'a second clean does not peel the steps back out')
assert.match(again.stem, /500 mol of/)
assert.equal((again.options || []).filter((o) => String(o).trim()).length, 0)
assert.equal(
  visibleLatexSourceHits(peeled.stem).filter((h) => h === 'raw-command').length,
  0,
  'the reaction arrow stays inside math',
)
const namedMcq = [
  'The reagent used for this conversion is',
  '\\begin{itemize}',
  '\\item[(A)] KCN',
  '\\item[(B)] NaOH',
  '\\item[(C)] HBr',
  '\\item[(D)] PBr$_3$',
  '\\end{itemize}',
].join('\n')
const named = extractLatexItemizeMcq(namedMcq)
assert.match(named?.options?.[0] || '', /KCN/, 'a real A–D chemical-name choice stays an option')
assert.ok(!named?.reactionStepsInStem)
const sequenceMcq = [
  'In the following reaction sequence, major products P and Q are shown.',
  '\\begin{tabular}{|l|l|}',
  '\\hline (A) & Q is an aromatic aldehyde. \\\\',
  '\\hline (B) & P is a dinitro compound. \\\\',
  '\\end{tabular}',
].join('\n')
const sequenceChoices = extractLatexItemizeMcq(sequenceMcq)
assert.match(sequenceChoices?.options?.[0] || '', /aromatic aldehyde/)
assert.ok(!sequenceChoices?.reactionStepsInStem, 'a real A–D table after a reaction sequence stays choices')

const linedReaction = [
  'In the following reaction sequence, major products X and Y are acyclic monomers.',
  '1. KCN',
  '2. $\\mathrm{H}_{3}\\mathrm{O}^{+}, \\Delta$',
  '3. Red P, $\\mathrm{Br}_{2}$',
  '$\\mathrm{CH}_{3}\\mathrm{I} \\xrightarrow{\\text{4. }\\mathrm{NH}_{3} \\text{ (excess)}} \\mathbf{X}$',
  '$$\\text { Caprolactam } \\xrightarrow[\\Delta]{\\mathrm{H}_{3}\\mathrm{O}^{+}} \\mathbf{Y}$$',
  '',
  '500 mol of $\\mathbf{X}$ completely reacts with 500 mol of $\\mathbf{Y}$ to give 1 mol of a single biodegradable acyclic copolymer Z as the only product. The amount of Z formed in grams is ____.',
  '',
  'Given:',
  'Atomic mass (in amu): H : 1, C : 12, N : 14, O : 16, Br : 80',
].join('\n')
const linedShown = prepareTextForMathTextDisplay(linedReaction)
assert.match(linedShown, /\n1\.\s*KCN/, 'step 1 stays on its own line')
assert.match(linedShown, /\n2\./, 'step 2 stays on its own line')
assert.match(linedShown, /\n3\./, 'step 3 stays on its own line')
assert.match(linedShown, /\n[^\n]*\\xrightarrow\{[^}\n]*4\./, 'step 4 stays the arrow label on the next line')
assert.match(linedShown, /\n\n500 mol/, 'the amount sentence stays a new paragraph')
assert.match(linedShown, /\nGiven:/, 'Given stays on its own line')
assert.doesNotMatch(linedShown, /Br_\{2\}[^\n]*CH_\{3\}/, 'CH3I is not glued to Br2')
const linedAfterMarker = stripTrailingOptionMarkerFromStem(
  sanitizeStemForDisplay(linedReaction, ['', '', '', '']),
  ['', '', '', ''],
)
assert.match(linedAfterMarker, /\n1\.\s*KCN/, 'preview cleanup keeps step 1 on its own line')
assert.match(linedAfterMarker, /\n3\.\s*Red P/, 'preview cleanup keeps step 3 on its own line')
assert.match(linedAfterMarker, /\n\n500 mol/, 'preview cleanup keeps the amount sentence apart')
assert.match(linedAfterMarker, /\nGiven:/, 'preview cleanup keeps Given on its own line')
const proseJoined = prepareTextForMathTextDisplay(
  'Find the value of the integral over the given interval.\nThe answer is a single number.',
)
assert.doesNotMatch(proseJoined, /\n/, 'a normal sentence is not given extra reaction line breaks')

const graphPage = 'https://cdn.mathpix.com/cropped/44b2be98-b84d-4b5e-b570-0805a68e7887-24.jpg'
const graphTable = [
  'The correct graphical representation(s) for this reaction is(are)',
  '\\begin{tabular}{|l|l|l|l|}',
  `\\hline (A) & ![](${graphPage}?height=486&width=500&top_left_y=384&top_left_x=483) & (B) & $[\\mathbf{R}] \\longrightarrow$ \\\\`,
  `\\hline (C) & ![](${graphPage}?height=487&width=525&top_left_y=893&top_left_x=453) & (D) & ![](${graphPage}?height=483&width=509&top_left_y=896&top_left_x=1267) \\\\`,
  '\\hline',
  '\\end{tabular}',
].join('\n')
const graphs = extractLatexTabularMcq(graphTable)
assert.ok(graphs, 'graph table still parses')
assert.match(graphs.options[0], /top_left_y=384/, 'option A keeps its graph')
assert.match(graphs.options[1], /!\[\]\(https:\/\/cdn\.mathpix\.com\/cropped\//, 'option B is the missing page crop')
assert.match(graphs.options[1], /top_left_y=384/, 'option B sits on the same row as A')
assert.doesNotMatch(graphs.options[1], /\\longrightarrow|\[R\]\s*→/, 'option B is not only the axis stub')
assert.match(graphs.options[2], /top_left_y=893/, 'option C keeps its graph')
const sentenceOpts = restoreMissingOptionGridGraphs([
  `![](${graphPage}?height=486&width=500&top_left_y=384&top_left_x=483)`,
  'The rate increases as time passes.',
  `![](${graphPage}?height=487&width=525&top_left_y=893&top_left_x=453)`,
  `![](${graphPage}?height=483&width=509&top_left_y=896&top_left_x=1267)`,
])
assert.equal(sentenceOpts[1], 'The rate increases as time passes.')
const wipedOpts = restoreMissingOptionGridGraphs([
  `![](${graphPage}?height=486&width=500&top_left_y=384&top_left_x=483)`,
  '',
  `![](${graphPage}?height=487&width=525&top_left_y=893&top_left_x=453)`,
  `![](${graphPage}?height=483&width=509&top_left_y=896&top_left_x=1267)`,
])
assert.match(wipedOpts[1], /top_left_x=1197/, 'a blank grid corner is the page crop again')
assert.doesNotMatch(wipedOpts[1], /\\longrightarrow/)
const twoCrops = restoreMissingOptionGridGraphs([
  `![](${graphPage}?height=486&width=500&top_left_y=384&top_left_x=483)`,
  '',
  `![](${graphPage}?height=487&width=525&top_left_y=893&top_left_x=453)`,
  'a written choice',
])
assert.equal(twoCrops[1], '', 'two crops do not invent a third graph')

const conductivity =
  'At 300 K, the molar conductivities are given below: \\begin{tabular}{|l|l|} \\hline Salt & 111 \\\\ \\hline \\end{tabular}$$ The conductivity of a saturated aqueous solution of AgCl is $1.40 \\times 10^{-6}$. If the solubility is $$\\boldsymbol{X} \\mathrm{mol} \\mathrm{L}^{-1}$$, then $$\\log _{10}\\left(\\boldsymbol{X}^{-1}\\right)$$ is.'
const conductivityCheck = validateMathpixQuestion({ text: conductivity, options: ['3', '4', '5', '6'] })
assert.equal(conductivityCheck.status, 'ok', 'a spare dollar after a table is not a checker sentence')
const conductivityShown = prepareTextForMathTextDisplay(conductivity)
assert.match(conductivityShown, /\\end\{array\}\$\$/, 'a one-row table stays a display block')
assert.match(conductivityShown, /\$\$ The conductivity of/, 'the sentence after the table is not inside the table')
assert.doesNotMatch(conductivityShown, /begin\{tabular\}/, 'a drawn salt table is not the words begin{tabular}')

const screwGaugeTable = [
  'The value of $d$ (in $\\mu \\mathrm{m}$ ) is:',
  '',
  '\\begin{tabular}[t]{|l|l|l|}',
  '\\hline & Readings \\\\',
  '\\hline & LS (mm) & CS \\\\',
  '\\hline Wire-1 & 0.5 & 42 \\\\',
  '\\hline Wire-2 & 1.5 & 95 \\\\',
  '\\hline',
  '\\end{tabular}$$',
].join('\n')
const screwGaugeShown = prepareTextForMathTextDisplay(screwGaugeTable)
assert.doesNotMatch(screwGaugeShown, /begin\{tabular\}/, 'screw-gauge readings render as a table, not begin{tabular}')
assert.match(screwGaugeShown, /colspan="2"[^>]*>Readings</, 'Readings spans both LS and CS')
assert.match(screwGaugeShown, />LS \(mm\)</, 'LS (mm) stays in its own column')
assert.match(screwGaugeShown, />CS</, 'CS stays in its own column')
assert.match(screwGaugeShown, />Wire-1</, 'Wire-1 stays plain')
assert.match(screwGaugeShown, />Wire-2</, 'Wire-2 stays plain')
assert.doesNotMatch(screwGaugeShown, /Wire −|Wire - 1/, 'Wire-1 is not italic math')
assert.match(screwGaugeShown, />0\.5</, 'Wire-1 LS reading stays')
assert.match(screwGaugeShown, />42</, 'Wire-1 CS reading stays')
assert.match(screwGaugeShown, />1\.5</)
assert.match(screwGaugeShown, />95</)
assert.doesNotMatch(screwGaugeShown, /Wire-3/, 'no extra wire row is invented')

const saltConductivityTable = [
  'At 300 K, the molar conductivities of the aqueous solutions of three salts at two different concentrations are given below:',
  '\\begin{tabular}[t]{|l|l|l|} \\hline Salt & Concentration (M) & Molar conductivity (S \\mathrm{cm}^{2} \\mathrm{~mol}^{-1}) \\\\',
  '\\hline \\mathrm{NaNO}_{3} & 0.01 & 111 \\\\ \\hline & 0.04 & 101 \\\\',
  '\\hline NaCl & 0.01 & 117 \\\\ \\hline & 0.04 & 107 \\\\',
  '\\hline \\mathrm{AgNO}_{3} & 0.01 & 125 \\\\ \\hline & 0.04 & 116 \\\\ \\hline',
  '\\end{tabular}$$ The conductivity of a saturated aqueous solution of AgCl is $1.40 \\times 10^{-6}$.',
].join(' ')
const saltConductivityShown = prepareTextForMathTextDisplay(saltConductivityTable)
assert.doesNotMatch(saltConductivityShown, /begin\{tabular\}/, 'the salt conductivity table is not left as begin{tabular}')
assert.match(saltConductivityShown, />Concentration \(M\)</, 'Concentration (M) keeps its space')
assert.match(saltConductivityShown, /Molar conductivity \(S cm² mol⁻¹\)/, 'molar conductivity header keeps spaces')
assert.doesNotMatch(saltConductivityShown, /Concentration\(M\)|Molarconductivity/, 'headers are not glued')
assert.match(saltConductivityShown, /rowspan="2"[^>]*>NaNO₃</, 'NaNO3 spans both concentration rows')
assert.match(saltConductivityShown, /rowspan="2"[^>]*>NaCl</, 'NaCl spans both concentration rows')
assert.match(saltConductivityShown, /rowspan="2"[^>]*>AgNO₃</, 'AgNO3 spans both concentration rows')
assert.match(saltConductivityShown, />0\.01</)
assert.match(saltConductivityShown, />111</)
assert.match(saltConductivityShown, />0\.04</)
assert.match(saltConductivityShown, />116</)
const saltTableEnd = saltConductivityShown.indexOf('</table>')
assert.ok(saltTableEnd >= 0, 'the salt table closes')
assert.match(
  saltConductivityShown.slice(saltTableEnd),
  /The conductivity of a saturated aqueous solution of AgCl/,
  'the AgCl sentence stays below the table',
)
const answeredStem = cleanMathpixCardText('The value of $x$ is ____.\nAnswer: A')
assert.doesNotMatch(answeredStem, /Answer:\s*A/, 'a printed Answer line is not left in the question')
assert.match(answeredStem, /value of/, 'the question itself stays')
const proseAnswer = cleanMathpixCardText('The answer is a single number.')
assert.match(proseAnswer, /answer is a single number/, 'a normal sentence that says answer is kept')

const scheme = [
  'Correct statement(s) about the compounds P, Q and R is(are)',
  '$$\\begin{aligned}',
  '\\underset{(1: 5 \\text { ratio })}{\\mathrm{Xe}(\\mathrm{~g})}+\\underset{\\mathrm{O}_{2}(\\mathrm{~g})}{\\stackrel{873 \\mathrm{~K}, 7 \\text { bar }}{ }} & \\mathbf{P} \\\\',
  '\\underset{\\mathbf{P}}{+\\underset{\\mathrm{O}_{2} \\mathrm{~F}_{2}}{-}} & \\xrightarrow{143 \\mathrm{~K}} \\mathbf{Q}+\\mathrm{O}_{2} \\\\',
  '\\mathbf{Q}+\\mathrm{H}_{2} \\mathrm{O} & \\xrightarrow{\\text { complete hydrolysis }} \\mathbf{R}+\\mathrm{HF}',
  '\\end{aligned}$$',
].join('\n')
const xeOptions = [
  'P has two lone pairs of electrons on the central atom.',
  'Q has a perfect octahedral geometry.',
  'Q can act as a fluorinating agent.',
  'The molecular structure of R is trigonal pyramidal.',
]
const xeCard = validateMathpixQuestion({ text: scheme, options: xeOptions })
assert.equal(xeCard.status, 'ok', 'the Xe reaction scheme is not incomplete and not raw code')
assert.equal(
  xeCard.issues.some((issue) => issue.code === 'incomplete_math' || issue.code === 'latex_noise'),
  false,
  'a drawn Xe scheme is not a cut-off fraction or latex noise',
)
assert.equal(latexExtractionIncomplete(scheme), false, 'the stored Xe scheme is not a cut-off fraction')
assert.deepEqual(visibleLatexSourceHits(scheme), [], 'mathrm and xrightarrow inside $$ are not raw code')
const schemeLines = linearizeChemReactionAligned(scheme)
assert.equal(
  validateMathpixQuestion({ text: schemeLines, options: xeOptions }).status,
  'ok',
  'the three drawn reaction lines stay ok',
)
assert.match(schemeLines, /\\mathrm\{Xe\}[\s\S]*\\xrightarrow\{873/, 'the first arrow keeps its conditions')
assert.match(schemeLines, /\n\(1: 5 ratio\)/, 'the ratio sits on its own line')
assert.match(schemeLines, /\\mathbf\{P\} \+ \\mathrm\{O\}_\{2\} \\mathrm/, 'P + O2F2 is one line')
assert.match(schemeLines, /complete hydrolysis/, 'the third reaction stays')
assert.doesNotMatch(schemeLines, /\\underset|\\stackrel/, 'nested stacks are not left in the scheme')
assert.doesNotMatch(schemeLines, /\\mathrm\{F\}_\{2\}\(\\mathrm/, 'a gas the scan did not read is not invented')
const gluedXeScheme = schemeLines.replace(/\n(\$\$\\mathbf\{Q\})/, '$1')
const gluedShown = prepareTextForMathTextDisplay(gluedXeScheme)
assert.match(gluedShown, /\\mathbf\{Q\}\+\\mathrm\{O\}_\{2\}\$\$\n\$\$\\mathbf\{Q\}/, 'two reactions are not glued into one line')
assert.equal((gluedShown.match(/(?<!\\)\$/g) || []).length % 2, 0, 'glued reaction dollars stay balanced')
const droppedOpener = gluedXeScheme.replace('$$$$', '$$').replace(/HF\$\$/, 'HF$')
const droppedShown = prepareTextForMathTextDisplay(droppedOpener)
assert.match(droppedShown, /\\mathbf\{Q\}\+\\mathrm\{O\}_\{2\}\$\$\n\$\$\\mathbf\{Q\}/, 'a dropped reaction opener is put back on its own line')
assert.equal(latexExtractionIncomplete(droppedShown), false, 'the repaired reactions are not flagged incomplete')
assert.match(droppedShown, /\n\(1: 5 ratio\)\n/, 'the ratio note has no spare space')
const equationAligned = '$$\\begin{aligned} x &= 1 \\\\ y &= 2 \\end{aligned}$$'
assert.equal(linearizeChemReactionAligned(equationAligned), equationAligned, 'an equation block stays aligned')

const isotherm = [
  'Assume, the adsorption follows Freundlich isotherm,',
  '$$\\frac{x}{m}=k C^{1 / n}$$',
  'If the plot of $\\log _{10}(x / m)$ against $\\log _{10} C$ gives a straight line, the value of $k$ is $____$.',
  'Given: The molar mass of acetic acid is $60 \\mathrm{~g} \\mathrm{~mol}^{-1}$.',
  '$x$ is the mass (in grams) of acetic acid adsorbed.',
  '$m$ is the mass (in grams) of charcoal.',
].join('\n')
const isothermShown = prepareTextForMathTextDisplay(isotherm)
assert.match(isothermShown, /\n\$\$\\frac\{x\}\{m\}/, 'the isotherm equation stays on its own line')
assert.match(isothermShown, /\nGiven:/, 'Given stays on its own line')
assert.match(isothermShown, /\n\$x\$ is the mass/, 'each symbol meaning stays on its own line')
const gluedMeaning = isotherm.replace('\n$x$ is the mass', ' $x$ is the mass')
assert.match(
  prepareTextForMathTextDisplay(gluedMeaning),
  /\.\n\$x\$ is the mass/,
  'a symbol meaning glued to the previous sentence starts on its own line',
)

const { localOfficialPyqQualityCheck } = await import('../src/utils/officialPyqLocalQuality.js')
// One-card papers have no section counts, so passed stays false by design; the card itself must be clean.
const cardsCleanFactsUnknown = (quality) =>
  Array.isArray(quality?.failedGoTo) && quality.failedGoTo.length === 0 &&
  (quality.lines || []).every((line) => /facts card is unknown|does not contain .This section contains|does not say how many|does not name the question type/i.test(line))
const xeQuality = localOfficialPyqQualityCheck({
  questions: [{ text: schemeLines, options: xeOptions }],
  preparedText: schemeLines,
})
assert.ok(cardsCleanFactsUnknown(xeQuality), 'the Xe three-reaction stem passes the local quality check')
assert.deepEqual(xeQuality.failedGoTo, [], 'the Xe three-reaction stem has no failing Go to Q number')
const answerQuality = localOfficialPyqQualityCheck({
  questions: [{ text: 'The value of $x$ is ____.\nAnswer: A' }],
  preparedText: 'The value of $x$ is ____.\nAnswer: A',
})
assert.ok(cardsCleanFactsUnknown(answerQuality), 'Answer: A is not left in the stem for the local quality check')
assert.deepEqual(answerQuality.failedGoTo, [])
const pairedOption = prepareTextForMathTextDisplay('$\\mathrm{PF}_{3}$ and $\\mathrm{PCl}_{3}$')
assert.match(pairedOption, /^\$\\mathrm\{PF\}_\{3\}\$/, 'the first formula keeps its opening dollar')
assert.match(pairedOption, /\$\\mathrm\{PCl\}_\{3\}\$$/, 'the second formula keeps its closing dollar')
assert.deepEqual(visibleLatexSourceHits(pairedOption), [], 'two balanced formulas are not raw code')
const checkerNoteQuality = localOfficialPyqQualityCheck({
  questions: [{ text: 'Raw LaTeX is still showing as code.' }],
  preparedText: 'Raw LaTeX is still showing as code.',
})
assert.equal(checkerNoteQuality.passed, false, 'a checker sentence is not a passing question')
assert.deepEqual(checkerNoteQuality.failedGoTo, [1])

const { restoreMissingMatchOptionsFromSource, storedMatchOptionsAreCutOff } = await import(
  '../src/utils/extendTruncatedStem.js',
)
const cutOffOptions = [
  '(P) $\\rightarrow$',
  '(P) $\\rightarrow(5) \\quad(Q) \\rightarrow$',
  '$(P) $$\\rightarrow(5) \\quad(Q) \\rightarrow$$',
  '(P) $\\rightarrow$',
]
assert.equal(storedMatchOptionsAreCutOff(cutOffOptions), true, 'cut-off arrow scraps are not full options')
const cutOffStem =
  'Let $f: \\mathbb{R} \\rightarrow \\mathbb{R}$ be the function in this match question.\nMatch each entry in List-I to the correct entry in List-II.'
const matchOcr = [
  cutOffStem,
  'The correct option is',
  '$(\\mathrm{A})(\\mathrm{P}) \\rightarrow(4) \\quad(\\mathrm{Q}) \\rightarrow(3) \\quad(\\mathrm{R}) \\rightarrow(1) \\quad(\\mathrm{S}) \\rightarrow(2)$',
  '$(\\mathrm{B})(\\mathrm{P}) \\rightarrow(5) \\quad(\\mathrm{Q}) \\rightarrow(2) \\quad(\\mathrm{R}) \\rightarrow(4) \\quad(\\mathrm{S}) \\rightarrow(3)$',
  '$(\\mathrm{C})(\\mathrm{P}) \\rightarrow(5) \\quad(\\mathrm{Q}) \\rightarrow(3) \\quad(\\mathrm{R}) \\rightarrow(2) \\quad(\\mathrm{S}) \\rightarrow(4)$',
  '$(\\mathrm{D})(\\mathrm{P}) \\rightarrow(4) \\quad(\\mathrm{Q}) \\rightarrow(2) \\quad(\\mathrm{R}) \\rightarrow(1) \\quad(\\mathrm{S}) \\rightarrow(3)$',
].join('\n')
const restoredMatch = restoreMissingMatchOptionsFromSource(cutOffStem, cutOffOptions, matchOcr)
assert.equal(storedMatchOptionsAreCutOff(restoredMatch.options), false, 'OCR puts the full matching rows back')
assert.match(restoredMatch.options[0], /\(R\)/, 'option A keeps (R)')
assert.match(restoredMatch.options[0], /\(S\)/, 'option A keeps (S)')
assert.match(restoredMatch.options[1], /\\rightarrow\(2\)|→\(2\)|\(2\)/, 'option B keeps its own row')
const figureOpen = 'List-II\n$$\\includegraphics{https://cdn.mathpix.com/cropped/example.jpg}'
const figureShown = prepareTextForMathTextDisplay(figureOpen)
assert.doesNotMatch(figureShown, /\$\$\s*\\includegraphics/, 'a figure is not opened as display math')
assert.deepEqual(visibleLatexSourceHits(figureOpen), [], 'a figure command is not raw code once the extra dollars are removed')

const { ocrQuestionBodyForCard } = await import('../src/utils/extendTruncatedStem.js')
const damagedFrequency =
  'Consider the following frequency distribution:\n\\begin{tabular}[t]{|l|}\\hline Frequency & f_{1} \\\\\\hline\\end{tabular}$$\nSuppose that the sum of the frequencies is 19 and the median of this frequency distribution is 6.'
const frequencyScan = [
  'Consider the following frequency distribution:',
  '\\begin{tabular}[t]{|l|}\\hline Frequency & $f_{1}$ \\\\\\hline\\end{tabular}',
  'Suppose that the sum of the frequencies is 19 and the median of this frequency distribution is 6.',
  'Answer: C',
  'Q. 15 The next question starts here with its own stem.',
].join('\n')
const frequencyBody = ocrQuestionBodyForCard(damagedFrequency, frequencyScan)
assert.match(frequencyBody, /\$f_\{1\}\$/, 'the scan table keeps the frequency symbols in math')
assert.doesNotMatch(frequencyBody, /Answer\s*:/, 'the answer line stays off the question')
assert.doesNotMatch(frequencyBody, /next question/i, 'the next question stays off this card')

const keptGiven = prepareTextForMathTextDisplay(
  '[Given: the acceleration due to gravity $(\\mathrm{g})=-10 \\hat{\\jmath} \\mathrm{ms}^{-2}$ ]',
)
assert.match(keptGiven, /mathrm\{ms\}\^\{-2\}/, 'a Given line keeps ms before the exponent')
assert.doesNotMatch(keptGiven, /\\hat\{\\jmath\}\s*\^\{-2\}/, 'a Given line is not reduced to a bare exponent')

const { repairOfficialPyqUntilQuality } = await import('../src/utils/officialPyqLocalQuality.js')
const diskPassage = [
  'a particle with speed $100 \\mathrm{~ms}^{-1}$ moves at $90 \\mathrm{~ms}^{-1}$.',
  '[Given: the acceleration due to gravity $(\\mathrm{g})=-10 \\hat{\\jmath}^{-2}$ ]',
  '\\includegraphics{https://cdn.mathpix.com/cropped/disk.jpg}',
].join('\n')
const diskPaper = repairOfficialPyqUntilQuality({
  questions: [
    { text: 'The maximum change in the height is:', passageText: diskPassage },
    { text: 'Amount of energy loss is:', passageText: diskPassage },
  ],
  preparedText: diskPassage,
})
assert.ok(cardsCleanFactsUnknown(diskPaper.quality), 'the Given line is repaired from the ms token already in the passage')
assert.match(diskPaper.paper.questions[0].passageText, /mathrm\{[~ ]*ms\}\^\{-2\}/, 'question 35 keeps ms^{-2}')
assert.match(diskPaper.paper.questions[1].passageText, /mathrm\{[~ ]*ms\}\^\{-2\}/, 'question 36 keeps ms^{-2}')
assert.match(diskPaper.paper.questions[0].passageText, /includegraphics/, 'the disk figure stays on the passage')
const bareGiven = '[Given: the acceleration due to gravity $(\\mathrm{g})=-10 \\hat{\\jmath}^{-2}$ ]'
const barePaper = repairOfficialPyqUntilQuality({
  questions: [
    { text: 'The height is:', passageText: bareGiven },
    { text: 'The energy is:', passageText: bareGiven },
  ],
  preparedText: bareGiven,
})
assert.equal(barePaper.quality.passed, false, 'a Given line that still has no unit does not pass')
assert.deepEqual(barePaper.quality.failedGoTo, [1, 2])

const greekSentence =
  'let $$\\alpha$$ denote the mean deviation about the mean, $$\\beta$$ denote the mean deviation about the median, and $$\\sigma^{2}$$ denote the variance.'
const greekShown = prepareTextForMathTextDisplay(greekSentence)
assert.match(greekShown, /\$\\alpha\$/, 'alpha renders as inline math')
assert.match(greekShown, /\$\\beta\$/, 'beta renders as inline math')
assert.match(greekShown, /\$\\sigma\^\{2\}\$/, 'sigma squared renders as inline math')
assert.doesNotMatch(greekShown, /\$\$\\alpha\$\$/, 'alpha is not left as raw doubled dollars')
const { stemLooksIncompleteOnDisplay } = await import('../src/utils/sanitizeStemForDisplay.js')
const { officialPyqContentReviewMessages, reviewMarkSpans } = await import('../src/utils/officialPyqReviewFlags.js')
assert.equal(stemLooksIncompleteOnDisplay(greekSentence), false, 'a symbol in $$ is not a cut-off fraction')
assert.deepEqual(visibleLatexSourceHits(greekSentence), [], 'a symbol in $$ is not raw code')
assert.deepEqual(
  officialPyqContentReviewMessages([{ text: greekSentence }]),
  [],
  'the preview banner does not name a sentence whose symbols render',
)
const greekQuality = repairOfficialPyqUntilQuality({
  questions: [{ text: greekSentence }],
  preparedText: greekSentence,
})
assert.ok(cardsCleanFactsUnknown(greekQuality.quality), 'the list mark agrees when the symbols render')
assert.deepEqual(greekQuality.quality.failedGoTo, [])

const { localQualityListMark } = await import('../src/utils/officialPyqLocalQuality.js')
const optionStem =
  'Match each entry in List-I to the correct entry in List-II and choose the correct option.'
const optionOnly = repairOfficialPyqUntilQuality({
  questions: [
    {
      text: optionStem,
      options: [
        '(P) $\\rightarrow$',
        '(P) $\\rightarrow(5) \\quad(Q) \\rightarrow$',
        '(P) $\\rightarrow$',
        '(P) $\\rightarrow$',
      ],
    },
  ],
  preparedText: `${optionStem}\nThe scan does not include the four complete mapping rows.`,
})
assert.equal(optionOnly.quality.passed, false, 'an option-only defect fails the card')
assert.deepEqual(optionOnly.quality.failedGoTo, [1])
const optionMark = localQualityListMark(optionOnly.quality)
assert.match(optionMark, /not passed/, 'the list names a failed option card')
assert.match(optionMark, /Go to Q 1/)
assert.equal(optionMark.includes('— passed'), false, 'a failed option card is not marked passed')

const brokenFrac = 'The ratio of the two lengths is $$\\frac{1'
const brokenPaper = repairOfficialPyqUntilQuality({
  questions: [{ text: 'The speed of the block is $5$ m/s.' }, { text: brokenFrac }],
  preparedText: `The speed of the block is $5$ m/s.\n${brokenFrac}`,
})
assert.equal(brokenPaper.quality.passed, false, 'the list cannot be passed while a card fails')
assert.ok(brokenPaper.quality.failedGoTo.includes(2), 'the failing card is named by Go to Q')
const { healUploadQuestionCard: healShownCard } = await import('../src/utils/uploadQualityGuards.js')
const { peelOfficialPyqCardForDisplay: peelShownCard } = await import('../src/utils/passage.js')
const brokenShown = brokenPaper.paper.questions.map((card) => {
  try {
    return peelShownCard(healShownCard(card, brokenPaper.paper.preparedText), brokenPaper.paper.preparedText)
  } catch {
    return card
  }
})
const brokenBanner = officialPyqContentReviewMessages(brokenShown)
assert.ok(brokenBanner.length > 0, 'the preview banner still names the broken card')
assert.equal(brokenPaper.quality.passed, false, 'the list stays not passed while the red line would show')
const brokenMark = localQualityListMark(brokenPaper.quality)
assert.match(brokenMark, /not passed/)
assert.equal(brokenMark.includes('— passed'), false)

const ball =
  'A table tennis ball has radius (3 / 2) times 10 m and mass (22 / 7) times 10 kg. It is slowly pushed down into a swimming pool.'
const givenLine =
  '[Given: $\\pi=22 / 7, g=10 \\mathrm{~m} \\mathrm{~s}^{-2}$, density of water $=1 \\times 10^{3} \\mathrm{~kg} \\mathrm{~m}^{-3}$, viscosity of water $=1 \\times 10^{-3}$ Pa-s.]'
const neighbor = 'A block of mass 2 kg slides on a rough horizontal table for 4 m.'
const givenPaper = repairOfficialPyqUntilQuality({
  questions: [
    { text: ball, options: ['The work done is 0.077 J.'] },
    { text: neighbor, options: ['The friction force is 4 N.'] },
  ],
  preparedText: `${ball}\n${givenLine}\n${neighbor}\nThe friction force is 4 N.`,
})
assert.equal(givenPaper.questionsChanged, true, 'a dropped Given line is written back onto the card')
assert.match(givenPaper.paper.questions[0].text, /\[Given:/, 'the card keeps the scan Given line')
assert.match(givenPaper.paper.questions[0].text, /g=10 \\mathrm\{\s*~m\} \\mathrm\{\s*~s\}\^\{-2\}/)
assert.doesNotMatch(givenPaper.paper.questions[1].text, /\[Given:/, 'the next question does not receive that Given line')
assert.ok(cardsCleanFactsUnknown(givenPaper.quality), 'the paper passes once the Given line is restored')
assert.deepEqual(givenPaper.quality.failedGoTo, [])
const ballGivenShown = sanitizeStemForDisplay(
  givenPaper.paper.questions[0].text,
  givenPaper.paper.questions[0].options,
)
assert.match(ballGivenShown, /\[Given:/, 'the preview keeps the Given line on the question')
assert.match(ballGivenShown, /viscosity of water/)

const circle =
  'Let the straight line touch a circle with center C and radius r. Match each entry in List-I to the correct entry in List-II.'
const circleOcr = `${circle}
The correct option is
(A) (P) → (4)
(Q) → (2)
(R) → (1)
(S) → (3)
`
const gluedPaper = repairOfficialPyqUntilQuality({
  questions: [
    {
      text: circle,
      options: [
        '(P) → (4) (Q) → (2)(R) → (1) (S) → (3)',
        '(P) → (2) (Q) → (4) (R) → (1) (S) → (3)',
        '(P) → (4) (Q) → (2) (R) → (5) (S) → (3)',
        '(P) → (2) (Q) → (4) (R) → (1) (S) → (5)',
      ],
    },
  ],
  preparedText: circleOcr,
})
assert.match(gluedPaper.paper.questions[0].options[0], /\) \(R\)/, 'a glued match letter gets the scan space')
assert.doesNotMatch(gluedPaper.paper.questions[0].options[0], /\)\(R\)/)
assert.ok(cardsCleanFactsUnknown(gluedPaper.quality), 'spaced match rows from the scan are clean')
assert.deepEqual(gluedPaper.quality.failedGoTo, [])

const mathrmOcr = `${circle}
The correct option is
(A) (P) → (4)
$(\\mathrm{Q}) \\rightarrow(2)$
$(\\mathrm{R}) \\rightarrow(1)$
(S) → (3)
\\item[Q.] next question
`
const mathrmPaper = repairOfficialPyqUntilQuality({
  questions: [
    {
      text: circle,
      options: ['(P) → (4) (Q) → (2)(R) → (1) (S) → (3)'],
    },
  ],
  preparedText: mathrmOcr,
})
assert.match(
  mathrmPaper.paper.questions[0].options[0],
  /\) \(R\)/,
  'a scan line $(\\mathrm{R})$ still spaces the glued match letter',
)
assert.ok(cardsCleanFactsUnknown(mathrmPaper.quality))

const brokenReal =
  'Let the minimum value of n for which $$g(x)=\\left(2 n^{2}-13 n-15\\right)\\left(x^{3}+3 x\\right),$ x \\in \\mathbb{R}$, is an increasing function on $\\mathbb{R}$, is'
const scanReal =
  'Let the minimum value of n for which $$g(x)=\\left(2 n^{2}-13 n-15\\right)\\left(x^{3}+3 x\\right),$$\n$x \\in \\mathbb{R}$, is an increasing function on $\\mathbb{R}$, is'
const realInline = repairOfficialPyqUntilQuality({
  questions: [{ text: brokenReal, options: ['8', '9', '5', '10'] }],
  preparedText: scanReal,
})
assert.match(
  realInline.paper.questions[0].text,
  /,\$\$ \$x \\in \\mathbb\{R\}\$/,
  'a split display copies the scan close before x in mathbb R',
)
assert.equal(
  visibleLatexSourceHits(realInline.paper.questions[0].text).includes('raw-command'),
  false,
  'the restored inline symbol is not raw code',
)
assert.ok(cardsCleanFactsUnknown(realInline.quality), 'the list passes once mathbb R renders')
assert.equal(
  commandLeftOutsideMathSegments(
    '$$g(x)=\\left(2 n^{2}-13 n-15\\right)\\left(x^{3}+3 x\\right),$$ $x \\in \\mathbb{R}$, is an increasing function on $\\mathbb{R}$, is',
  ),
  false,
  'closing a display must not print mathbb R as raw code',
)
const rawLeft = repairOfficialPyqUntilQuality({
  questions: [{ text: brokenReal, options: ['8', '9', '5', '10'] }],
  preparedText: 'Let the minimum value of n for which the scan has no closed inline span.',
})
assert.ok(cardsCleanFactsUnknown(rawLeft.quality), 'a finished right-delimiter formula is not a cut-off fraction')
assert.equal(
  officialPyqContentReviewMessages(rawLeft.paper.questions).some((line) => /cut-off fraction|raw code/.test(line)),
  false,
  'the finished formula is not named as raw code',
)

const { healUploadQuestionCard } = await import('../src/utils/uploadQualityGuards.js')
function shownCard(text, ocr) {
  return peelOfficialPyqCardForDisplay(healUploadQuestionCard({ text, options: [] }, ocr), ocr)
}
const tableOcr =
  'Consider the following frequency distribution:\n\n\\end{tabular}\nSuppose that the sum of the frequencies is 19 and the median is 6.'
const tableShown = shownCard(
  'Consider the following frequency distribution:\n\n\\end{tabular}$$\nSuppose that the sum of the frequencies is 19 and the median is 6.',
  tableOcr,
)
assert.equal(/\\end\{tabular\}\$\$/.test(tableShown.text), false, 'a stray display after the frequency table is not in the scan')
assert.equal(officialPyqContentReviewMessages([tableShown]).some((line) => /cut-off fraction/.test(line)), false, 'the frequency table is not a cut-off fraction')
const sumOcr =
  'Number of $x_{0} \\in \\mathbb{R}$ such that\n$$l(x)=\\sum_{k=0}^{4} x,$$\n$x \\in \\mathbb{R}$, is NOT differentiable at $x_{0}$, is'
const sumShown = shownCard(
  'Number of $$x_{0} \\in \\mathbb{R}$$ such that\n$$l(x)=$$\\sum_{k=0}^{4} x,$$ x $$\\in \\mathbb{R}$$, is NOT differentiable at $$x_{0}$, is',
  sumOcr,
)
assert.match(sumShown.text, /\$\$l\(x\)=\\sum/)
assert.match(sumShown.text, /\$x \\in \\mathbb\{R\}\$/)
assert.equal(officialPyqContentReviewMessages([sumShown]).length, 0, 'the l(x) display is not raw code')
const sigmaOcr = 'Configuration I\n$+\\frac{\\sigma_{0}}{2} \\quad \\frac{-\\sigma_{0}}{2}$'
const sigmaShown = shownCard(
  'Configuration I\n$+$\\frac{\\sigma_{0}}{2} \\quad \\frac{-\\sigma_{0}}{2}$$',
  sigmaOcr,
)
assert.match(sigmaShown.text, /\$\+\\frac\{\\sigma_\{0\}\}\{2\}/)
assert.equal(/\$\+\$\\frac/.test(sigmaShown.text), false)
assert.equal(officialPyqContentReviewMessages([sigmaShown]).length, 0, 'the sigma row is not a cut-off fraction')

const snap2025 = JSON.parse(
  readFileSync(new URL('../public/official-pyq-store-snapshot.json', import.meta.url), 'utf8'),
)
const paper2025a = snap2025.root.papers.find((p) => p.id === 'opyq-1791275733435-im15vmg')
const paper2025b = snap2025.root.papers.find((p) => p.id === 'opyq-1791275953834-rjvwr9i')
const longerListII = [
  'Match each entry in List-I to the correct entry in List-II.',
  'List-I',
  '(P) $7 f_{1}+9 f_{2}$ is equal to',
  '(Q) $19 \\alpha$ is equal to',
  '(R) $19 \\beta$ is equal to',
  '(S) $19 \\sigma^{2}$ is equal to',
  'List-II',
  '(1) 146',
  '(2) 47',
  '(3) 48',
  '(4) 145',
  '(5) 55',
].join('\n')
const longerLists = parseMatchingListForDisplay(longerListII)
const longerRows = matchListRowPlan(longerLists?.listI, longerLists?.listII)
assert.equal(longerLists?.listI.length, 4, 'List-I stays four entries')
assert.equal(longerLists?.listII.length, 5, 'the extra List-II item stays')
assert.equal(longerRows.at(-1)?.leftCard, false, 'the extra List-II row has no blank left card')
assert.equal(longerRows.at(-1)?.right?.label, '(5)')
assert.match(String(longerRows.at(-1)?.right?.text || ''), /55/)
assert.equal(longerRows.slice(0, 4).every((row) => row.leftCard), true)

for (const [label, paper, n] of [
  ['Paper 1 Q14', paper2025a, 14],
  ['Paper 1 Q15', paper2025a, 15],
  ['Paper 2 Q23', paper2025b, 23],
]) {
  const stored = paper.questions[n - 1]
  const shown = peelOfficialPyqCardForDisplay(
    healUploadQuestionCard(stored, paper.preparedText),
    paper.preparedText,
  )
  assert.equal(officialPyqContentReviewMessages([shown]).length, 0, `${label} stays clean`)
  if (n === 14 || n === 15) {
    const lists = parseMatchingListForDisplay(
      sanitizeStemForDisplay(shown.text, shown.options),
      shown.options,
    )
    const rows = matchListRowPlan(lists?.listI, lists?.listII)
    assert.equal(rows.at(-1)?.leftCard, false, `${label} extra List-II has no blank left card`)
    assert.ok(String(rows.at(-1)?.right?.text || '').trim(), `${label} keeps the extra List-II item`)
    assert.equal((shown.options || []).filter((opt) => String(opt).trim()).length, 4, `${label} options stay`)
  }
  if (n === 14) {
    assert.match(String(shown.options?.[0] || ''), /\(P\).*→.*\(5\).*\(S\).*→.*\(4\)/)
    assert.match(String(shown.options?.[3] || ''), /\(P\).*→.*\(3\).*\(S\).*→.*\(4\)/)
  }
}
for (const paper of [paper2025a, paper2025b]) {
  const first = peelOfficialPyqCardForDisplay(
    healUploadQuestionCard(paper.questions[0], paper.preparedText),
    paper.preparedText,
  )
  assert.equal(officialPyqContentReviewMessages([first]).length, 0, 'question 1 still draws')
}

const sheetStem = [
  'The separation is $1 \\mu \\mathrm{~m}$. If $\\sigma_{0}=9 \\mu C / \\mathrm{m}^{2}$.',
  '$+\\sigma_{0} \\quad-\\sigma_{0} \\quad+\\sigma_{0} \\quad-\\sigma_{0} \\quad+\\sigma_{0} \\quad-\\sigma_{0}$',
  '\\begin{tabular}{|l|l|l|l|l|}',
  '1 & 2 & 3 & 4 & 5',
  '\\end{tabular}',
  'Configuration I',
  '$+\\frac{\\sigma_{0}}{2} \\quad-\\sigma_{0} \\quad+\\sigma_{0} \\quad-\\sigma_{0} \\quad+\\sigma_{0} \\quad \\frac{-\\sigma_{0}}{2}$',
  '\\begin{tabular}{|l|l|l|l|l|}',
  '1 & 2 & 3 & 4 & 5',
  '\\end{tabular}',
  'Configuration II',
].join('\n')
const sheetHtml = renderSideBySideSheetConfigs(sheetStem)
assert.match(sheetHtml, /class="sheet-config-pair"[^>]*display:flex/)
assert.match(sheetHtml, /flex-wrap:nowrap/)
assert.deepEqual(
  [...sheetHtml.matchAll(/data-sheet-label="([^"]+)"/g)].map((m) => m[1]),
  ['Configuration I', 'Configuration II'],
)
assert.deepEqual(
  [...sheetHtml.matchAll(/data-sheet-charge="([^"]+)"/g)].map((m) => m[1]),
  [
    '+\\sigma_{0}',
    '-\\sigma_{0}',
    '+\\sigma_{0}',
    '-\\sigma_{0}',
    '+\\sigma_{0}',
    '-\\sigma_{0}',
    '+\\frac{\\sigma_{0}}{2}',
    '-\\sigma_{0}',
    '+\\sigma_{0}',
    '-\\sigma_{0}',
    '+\\sigma_{0}',
    '\\frac{-\\sigma_{0}}{2}',
  ],
)
assert.equal(/\\begin\{tabular\}/.test(sheetHtml), false)
assert.match(sheetHtml, /1\\,\\mu\\mathrm\{m\}/)
assert.match(sheetHtml, /9\\,\\mu C/)
const sheetShown = shownCard(sheetStem, sheetStem)
assert.equal(officialPyqContentReviewMessages([sheetShown]).length, 0, 'a drawn sheet pair is not a cut-off fraction')
const realSheets = renderSideBySideSheetConfigs(
  healUploadQuestionCard(paper2025b.questions[22], paper2025b.preparedText).text,
)
assert.match(realSheets, /class="sheet-config-pair"/)
assert.equal(/\\begin\{tabular\}\{\|l\|l\|l\|l\|l\|\}/.test(realSheets), false)
const firstSheet = renderSideBySideSheetConfigs(paper2025b.questions[0].text)
assert.equal(/sheet-config-pair/.test(firstSheet), false, 'question 1 is not redrawn as sheets')

const strayTable = [
  '\\begin{tabular}{|l|l|l|}',
  '\\hline Salt & Concentration (M) & Molar conductivity (S \\mathrm{cm}^{2} \\mathrm{~mol}^{-1}) \\\\',
  '\\hline \\end{tabular}',
  'The conductivity is $1.40 \\times 10^{-6} \\mathrm{~S} \\mathrm{~cm}^{-1}$ at 300 K.',
].join('\n')
const strayWrapped = wrapBareLatexRuns(strayTable)
assert.equal(/\\end\{tabular\}\$/.test(strayWrapped), false, 'a table must not leave a dollar that cuts the next math')
assert.match(strayWrapped, /\$1\.40 \\times 10\^\{-6\}/)
const paper2026 = snap2025.root.papers.find((p) => p.id === 'opyq-1791275032248-aynozfl')
const q37 = peelOfficialPyqCardForDisplay(
  healUploadQuestionCard(paper2026.questions[36], paper2026.preparedText),
  paper2026.preparedText,
)
const q37shown = sanitizeStemForDisplay(q37.text, q37.options)
assert.equal(/\\end\{tabular\}\$/.test(q37shown), false, 'question 37 keeps the sentence after the salt table')
assert.equal(reviewMarkSpans(q37shown).length, 0, 'the conductivity sentence is not raw code')

const floorFrac = [
  '$$f(x)=\\left[\\frac{10 x^{3}-45 x^{2}+60 x+35}{n}\\right]$$',
  '$$g(x)=\\left(2 n^{2}-13 n-15\\right)\\left(x^{3}+3 x\\right),$ x \\in \\mathbb{R}$, is',
].join('\n')
assert.equal(latexExtractionIncomplete(floorFrac), false, 'a finished floor fraction is not a cut-off')
assert.deepEqual(visibleLatexSourceHits(floorFrac), [], 'a finished floor fraction is not raw code')
assert.equal(latexExtractionIncomplete('\\frac{1}{'), true, 'a fraction that never closes is still incomplete')
const q15raw = paper2025a.questions[14]
const q15lists = parseMatchingListForDisplay(q15raw.text, q15raw.options)
assert.equal(q15lists.listI.length >= 2 && q15lists.listII.length >= 2, true)
assert.equal(
  validateMathpixQuestion(q15raw).issues.some((issue) => issue.code === 'missing_column'),
  false,
  'List-I and List-II together are not a missing list',
)
assert.equal(
  officialPyqContentReviewMessages([q15raw]).some((line) => /15/.test(line)),
  false,
  'question 15 is not named for a finished fraction',
)
const longerList = {
  text: [
    'Match each entry in List-I to the correct entry in List-II.',
    'List-I',
    '(P) one',
    '(Q) two',
    '(R) three',
    '(S) four',
    'List-II',
    '(1) 8',
    '(2) 9',
    '(3) 5',
    '(4) 6',
    '(5) 10',
  ].join('\n'),
  options: ['(P) → (1)', '(P) → (2)', '(P) → (3)', '(P) → (4)'],
}
assert.equal(
  validateMathpixQuestion(longerList).issues.some((issue) => issue.code === 'missing_column'),
  false,
  'List-II one item longer than List-I is not a missing list',
)
const collision = {
  text: 'In a scattering experiment, a particle of mass $2m$ collides with another particle of mass $m$, which is initially at rest. The maximum angular deviation $\\theta$ is shown in the figure. \\includegraphics{https://cdn.mathpix.com/scatter.png}',
  options: ['$\\pi/2$', '$\\pi/3$', '$\\pi/4$', '$\\pi/6$'],
}
assert.equal(looksLikeMatchingListStem(collision.text), false, 'a collision figure is not a matching question')
assert.equal(
  validateMathpixQuestion(collision).issues.some((issue) => issue.code === 'missing_column'),
  false,
  'a collision figure is not missing a list',
)
const stephenListOcr = [
  'Match each entry in List-I with List-II.',
  'List-I',
  '(P) Stephen reaction',
  'List-II',
  '(1) chromyl',
  '(2)',
  '\\begin{tabular}[t]{|l|l|}',
  '\\hline & (i) \\mathrm{PCl}_{5} \\\\',
  '\\hline Benzoic acid & \\\\',
  '\\hline',
  '\\end{tabular}',
  '(3) Nitrobenzene',
  '(4) Toluene',
  '(5) Aniline',
  '\\begin{tabular}[t]{|l|l|}',
  '\\hline (A) & P → 2 \\\\',
  '\\hline (B) & P → 1 \\\\',
  '\\hline',
  '\\end{tabular}',
].join('\n')
const swallowed = [
  'Match each entry in List-I with List-II.',
  'List-I',
  '(P) Stephen reaction',
  'List-II',
  '(1) chromyl',
  '(2)',
  '\\begin{tabular}[t]{|l|l|}',
  '\\hline (A) & P → 2 \\\\',
  '\\hline (B) & P → 1 \\\\',
  '\\hline',
  '\\end{tabular}',
].join('\n')
const restoredList = restoreScanMathBreaks(swallowed, stephenListOcr)
assert.match(restoredList, /Nitrobenzene/, 'the scan List-II rows come back')
assert.match(restoredList, /Benzoic acid/, 'a reagent table is not replaced by the answer table')
assert.equal(
  validateMathpixQuestion({ text: restoredList, options: longerList.options }).issues.some(
    (issue) => issue.code === 'missing_column',
  ),
  false,
  'restored List-II is not a missing list',
)
const keptList = restoreScanMathBreaks(stephenListOcr, stephenListOcr)
assert.match(keptList, /\(5\) Aniline/, 'a complete List-II is not overwritten')
const scrambledSteps = unwrapReactionStepTables(String.raw`
(2)
\begin{tabular}[t]{|l|l|}
\hline \multirow{3}{*}{} & (i) $\mathrm{PCl}_{5}$ \\
\hline & (ii) $\mathrm{NH}_{3}$ \\
\hline & (iii) $\mathrm{P}_{4} \mathrm{O}_{10}, \Delta$ \\
\hline Benzoic acid & \\
\hline
\end{tabular}
(3)
\begin{tabular}[t]{|l|l|}
\hline &
\begin{tabular}[t]{l}
(i) Fe, HCl \\
(ii) $\mathrm{HCl}, \mathrm{NaNO}_{2}$ \\
$(273-278 \mathrm{~K}), \mathrm{H}_{2} \mathrm{O}$
\end{tabular} \\
\hline Nitrobenzene & $\xrightarrow{\longrightarrow}$ \\
\hline
\end{tabular}`)
assert.match(scrambledSteps, /Benzoic acid/, 'Benzoic acid stays on the card')
assert.ok(scrambledSteps.indexOf('Benzoic acid') < scrambledSteps.indexOf('PCl'), 'Benzoic acid stays with the PCl5 step from the scan')
assert.match(scrambledSteps, /PCl/)
assert.match(scrambledSteps, /NH/)
assert.match(scrambledSteps, /Δ/)
assert.match(scrambledSteps, /Nitrobenzene[\s\S]*Fe, HCl/)
assert.equal(/\\begin\{tabular\}/.test(scrambledSteps), false, 'a reaction-step table is not dumped as raw tabular')
assert.equal(/<td[^>]*>\s*<\/td>/.test(scrambledSteps), false, 'blank List-II cells are not drawn')
assert.equal(latexExtractionIncomplete(scrambledSteps), false, 'the reagent lines are not a cut-off fraction')
assert.deepEqual(visibleLatexSourceHits(scrambledSteps), [], 'a drawn reagent line is not raw code')
const healedScramble = healUploadQuestionCard(
  {
    text: String.raw`(2)
\begin{tabular}[t]{|l|l|}
\hline \multirow{3}{*}{} & (i) $\mathrm{PCl}_{5}$ \\
\hline & (ii) $\mathrm{NH}_{3}$ \\
\hline & (iii) $\mathrm{P}_{4} \mathrm{O}_{10}, \Delta$ \\
\hline Benzoic acid & \\
\hline
\end{tabular}`,
  },
  'Benzoic acid PCl5',
).text
assert.equal(/\\begin\{tabular\}/.test(healedScramble), false, 're-parse stores the reagent lines, not the scrambled table')
assert.ok(healedScramble.indexOf('Benzoic acid') < healedScramble.indexOf('PCl'), 're-parse keeps Benzoic acid with PCl5')
assert.deepEqual(
  visibleLatexSourceHits(
    'Toluene $\\xrightarrow{\\text { (ii) } \\mathrm{H}_{3} \\mathrm{O}^{+}}$\n$$(2) Benzoic acid',
  ),
  [],
  'a closed arrow before the next list row is not raw code',
)
assert.match(scrambledSteps, /reaction-align/, 'reagents are stacked above the arrow')
assert.ok(
  scrambledSteps.indexOf('Benzoic acid') < scrambledSteps.indexOf('(i)'),
  'Benzoic acid stays on the left of the steps',
)
assert.ok(scrambledSteps.indexOf('PCl') < scrambledSteps.indexOf('→'), 'the arrow points right of the reagents')
const tolueneLeft = unwrapReactionStepTables(String.raw`
List-II
(1)
(i) $\mathrm{CrO}_{2}\mathrm{Cl}_{2}/\mathrm{CS}_{2}$
Toluene $\xrightarrow{\text { (ii) } \mathrm{H}_{3}\mathrm{O}^{+}}$
`)
assert.match(tolueneLeft, /reaction-align/)
assert.ok(tolueneLeft.indexOf('Toluene') < tolueneLeft.indexOf('CrO'), 'Toluene stays left of the reagents')
assert.ok(tolueneLeft.indexOf('CrO') < tolueneLeft.indexOf('→'), 'both steps sit above the arrow')
assert.equal(latexExtractionIncomplete(tolueneLeft), false, 'a drawn reaction arrow is not a cut-off fraction')
assert.deepEqual(visibleLatexSourceHits(tolueneLeft), [], 'a drawn reaction arrow is not raw code')
const approvalSrc = readFileSync(new URL('../src/utils/officialPyqApproval.js', import.meta.url), 'utf8')
const listSrc = readFileSync(new URL('../src/pages/OfficialPyqTabList.jsx', import.meta.url), 'utf8')
assert.match(approvalSrc, /persistOfficialPyqQualityRun/, 'a new upload runs the local quality check')
assert.match(listSrc, /Run quality check and fix/, 'each pending row can run the check again')
assert.match(listSrc, /official-pyq-quality-rerun/)

const healedSalt = healUploadQuestionCard(
  { text: 'List-I (R) <smiles>[Cl+3-][N-]c1ccccc1</smiles>' },
  '',
).text
assert.match(healedSalt, /c1ccccc1\[NH3\+\]\.\[Cl-\]/, 'the scan salt is drawn as the benzene NH3+ Cl- from the paper')
assert.equal(/Cl\+3/.test(healedSalt), false, 'the undrawable salt code is not left on the card')
assert.equal(
  officialPyqContentReviewMessages([{ printedNumber: 16, text: healedSalt }]).some((line) =>
    /could not draw/.test(line),
  ),
  false,
  'the repaired salt is not flagged',
)
const undrawn = new Array(48)
undrawn[47] = {
  printedNumber: 16,
  text: 'List-I (R) <smiles>notasmiles[[</smiles>',
}
const undrawnLines = officialPyqContentReviewMessages(undrawn)
assert.match(
  undrawnLines.join(' '),
  /Question 48 \(printed 16\) has a structure the scan could not draw/,
  'a structure code that does not draw names Go to Q 48',
)
assert.equal(
  officialPyqContentReviewMessages([{ text: '(A) <smiles>C=C1C=CC(C(C)(C)C)=C1</smiles>' }]).length,
  0,
  'a structure code that draws is not this failure',
)

console.log('test-mathpix-process-rules: ok')
