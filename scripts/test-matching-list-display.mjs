import assert from 'node:assert/strict'
import katex from 'katex'
import {
  looksLikeMatchingListStem,
  matchOptionsFoldedIntoLists,
  parseMatchingListForDisplay,
  stitchMatchListSource,
  foldListIIFromOptionsIntoStem,
  stripMarkdownBoldOutsideMath,
  rewriteLatexItemLabels,
  flattenTabularMatchLists,
  repairMatchListOcrGlitches,
} from '../src/utils/parseMatchingListDisplay.js'
import { splitSmilesDisplaySegments } from '../src/utils/smilesDisplay.js'
import { repairMatchArrowLatex } from '../src/utils/latexValidateRepair.js'
import { prepareTextForMathTextDisplay } from '../src/utils/prepareMathForRender.js'
import { matchQuestionMissingListI, restoreMissingFiguresFromSource } from '../src/utils/extendTruncatedStem.js'
import { wrapBareLatexRuns } from '../src/utils/wrapBareLatexRuns.js'
import { latexExtractionIncomplete, normalizeSmashedChemDollars } from '../src/utils/healTruncatedLatex.js'
import { convertLatexTabularToArray } from '../src/utils/latexTabularDisplay.js'
import { expandNarrowListICrops, stripEmptyFigureShells } from '../src/utils/mathpixMedia.js'

const matchingStem = `
Let $\\alpha$ and $\\beta$ be the distinct roots of the equation $x^2 + x - 1 = 0$.
Consider the set $T = \\{1, \\alpha, \\beta\\}$. For a $3 \\times 3$ matrix $M$ whose entries are from $T$.
Match each entry in List-I to the correct entries in List-II. **List-I** (P) The number of matrices $M$ for which the trace is $1$ is (Q) The number of symmetric matrices $M$ with all diagonal entries $1$ is (R) Let $M = (a_{ij})_{3 \\times 3}$ be a skew symmetric matrix with entries from $T$ (S) Let $M$ be a matrix with all entries $1$ **List-II** (1) $1$ (2) $2$ (3) $3$ (4) $4$ (5) $5$
`

assert.equal(looksLikeMatchingListStem(matchingStem), true)
const parsed = parseMatchingListForDisplay(matchingStem)
assert.ok(parsed, 'should parse matching-list stem')
assert.equal(parsed.listITitle, 'List-I')
assert.equal(parsed.listIITitle, 'List-II')
assert.equal(parsed.listI.length, 4, `List-I rows: ${parsed.listI.map((x) => x.label).join(',')}`)
assert.equal(parsed.listI[0].label, '(P)')
assert.equal(parsed.listI[1].label, '(Q)')
assert.equal(parsed.listI[2].label, '(R)')
assert.equal(parsed.listI[3].label, '(S)')
assert.match(parsed.listI[0].text, /number of matrices/)
assert.doesNotMatch(parsed.listI[0].text, /\(Q\)/)
assert.ok(parsed.listII.length >= 4, `List-II rows: ${parsed.listII.length}`)
assert.equal(parsed.listII[0].label, '(1)')
assert.doesNotMatch(parsed.intro, /\*\*/)
assert.doesNotMatch(parsed.intro, /^\s*List-I/i)
assert.match(parsed.intro, /distinct roots/)

const md = stripMarkdownBoldOutsideMath('Match. **List-I** (P) row $x^{**2**}$')
assert.equal(md.includes('**List-I**'), false)
assert.match(md, /List-I/)

const columnStem = `
Match the Column
Column-I
(A) First row of column I with enough text here
(B) Second row of column I with enough text here
(C) Third row of column I with enough text here
(D) Fourth row of column I with enough text here
Column-II
(P) Arithmetic progression
(Q) Geometric progression
(R) Harmonic progression
(S) Not a harmonic progression
`
const col = parseMatchingListForDisplay(columnStem)
assert.ok(col, 'classic Column I/II should parse')
assert.equal(col.listITitle, 'Column I')
assert.equal(col.listI[0].label, '(A)')
assert.equal(col.listII[0].label, '(P)')
assert.match(col.listII[0].text, /Arithmetic/)

const brokenOpt = '(P) \\rightarrow \\quad \\right (2)'
const healed = repairMatchArrowLatex(brokenOpt)
assert.match(healed, /\\rightarrow/)
assert.doesNotMatch(healed, /\\right\s*\(/)

const brokenOpt2 = '(P) \\rightarrow (Q) \\r (4) \\'
const healed2 = repairMatchArrowLatex(brokenOpt2)
assert.match(healed2, /\\rightarrow/)
assert.doesNotMatch(healed2, /\\r\s*\(/)

const prepared = prepareTextForMathTextDisplay(brokenOpt)
assert.doesNotMatch(prepared, /\\right\s*\(/)
assert.match(prepared, /\\rightarrow/)
assert.equal(prepared.includes('**'), false)

const preparedMd = prepareTextForMathTextDisplay('See **List-I** then $\\alpha$')
assert.doesNotMatch(preparedMd, /\*\*/)
assert.match(preparedMd, /List-I/)

for (const sample of [brokenOpt, brokenOpt2, '(R) \\right (5)']) {
  const p = prepareTextForMathTextDisplay(sample)
  assert.doesNotMatch(p, /\\right\s*\(/)
  const inner = (p.match(/\$([^$]+)\$/) || [])[1]
  assert.ok(inner, `should wrap arrow math: ${p}`)
  const html = katex.renderToString(inner, { throwOnError: false })
  assert.equal(html.includes('katex-error'), false, inner)
  assert.equal(html.includes('\\rightarrow') && html.includes('katex-error'), false)
}

const titrateStem = `
The limiting ionic conductivities $\\Lambda_0$ are given below.
\\begin{tabular}[t]{|l|l|l|} \\hline Ions & Ag^+ & K^+ \\\\ \\hline $\\Lambda_0$& 6.2 & 7.4 \\\\ \\hline \\end{tabular}
Match each entry in List-I with the appropriate entry in List-II and choose the correct option.
List-I Titrate: KCl Titrant: AgNO_3 Titrate : AgNO_3 Titrant: KCl Titrate: NaOH Titrant: HCl Titrate: NaOH Titrant: CH_3COOH
List-II
\\begin{figure}
\\includegraphics{https://cdn.mathpix.com/cropped/graph.jpg?height=100&width=100&top_left_y=1&top_left_x=1}
\\caption{List-II}
\\end{figure}
`
assert.equal(looksLikeMatchingListStem(titrateStem), true, 'in List-I + Titrate must look like a match list')
const titrate = parseMatchingListForDisplay(titrateStem)
assert.ok(titrate, 'Titrate run-on after “in List-I” must parse')
assert.equal(titrate.listI.length, 4, `Titrate List-I rows: ${titrate.listI.map((x) => x.label).join(',')}`)
assert.equal(titrate.listI[0].label, '(P)')
assert.match(titrate.listI[0].text, /KCl/)
assert.match(titrate.listI[1].text, /AgNO/)
assert.ok(titrate.listII.length >= 1, 'figure-only List-II must become items')
assert.match(titrate.listII[0].text, /cdn\.mathpix\.com|includegraphics/)
assert.match(titrate.intro, /limiting ionic|Match each entry/i)
assert.doesNotMatch(titrate.intro, /Titrate:\s*KCl/)

const figListStem = `List-I contains various reaction sequences and List-II contains different phenolic compounds. Match each entry in List-I with the appropriate entry in List-II and choose the correct option.
\\begin{figure}
\\includegraphics[width=\\textwidth]{https://cdn.mathpix.com/cropped/ab.jpg?height=324&width=573&top_left_y=452&top_left_x=338}
\\caption{List-I}
\\end{figure}
\\caption{(P)}
\\begin{figure}
\\includegraphics{https://cdn.mathpix.com/cropped/cd.jpg?height=100&width=100&top_left_y=1&top_left_x=1}
\\caption{List-II}
\\end{figure}`
assert.equal(looksLikeMatchingListStem(figListStem), true, 'figure List-I/II after match sentence')
const figParsed = parseMatchingListForDisplay(figListStem)
assert.ok(figParsed, 'figure-only match list must parse')
assert.ok(figParsed.listI.length >= 1, 'List-I from Mathpix figure')
assert.ok(figParsed.listII.length >= 1, 'List-II from Mathpix figure')
assert.match(figParsed.listI[0].text + figParsed.listII[0].text, /cdn\.mathpix\.com|includegraphics/)
assert.equal(matchQuestionMissingListI({ text: titrateStem }), false, 'Titrate List-I is present')
assert.equal(matchQuestionMissingListI({ text: figListStem }), false, 'figure caption List-I is present')
assert.equal(
  matchQuestionMissingListI({ text: 'List-II (1) $3C_0$ (2) $C_0/2$ (3) $C_0/3$ (4) $2C_0$' }),
  true,
  'List-II-only card is still missing List-I',
)

const ions = convertLatexTabularToArray(
  '\\begin{tabular}[t]{|l|l|} \\hline Ions & Ag^+ \\\\ \\hline $\\Lambda_0$ & 6.2 \\\\ \\hline \\end{tabular}',
)
assert.match(ions, /<table class="paper-data-table"/)
assert.doesNotMatch(ions, /\\begin\{tabular\}/)
assert.match(ions, />Λ₀</, 'Greek capital in a cell is kept')
assert.match(ions, />Ag⁺</, 'ion charge draws as a superscript')
assert.match(prepareTextForMathTextDisplay(ions), /<table class="paper-data-table"/)

const bdeTable = prepareTextForMathTextDisplay(String.raw`Correct match of the C-H bonds (shown in bold) in Column J with their BDE in Column K is

\begin{tabular}[t]{|l|l|}
\hline Column J Molecule & Column K BDE ( $\mathrm{kcal} \mathrm{mol}^{-1}$ ) \\
\hline (P) $\mathbf{H}-\mathrm{CH}\left(\mathrm{CH}_{3}\right)_{2}$ & (i) 132 \\
\hline (Q) $\mathbf{H}-\mathrm{CH}_{2} \mathrm{Ph}$ & (ii) 110 \\
\hline (S) $\mathbf{H}-\mathbf{C} \equiv \mathrm{CH}$ & (iv) 88 \\
\hline
\end{tabular}`)
assert.match(bdeTable, /text-align:center[^"]*">Column J<br>Molecule</, 'header prints on two centred lines')
assert.match(bdeTable, />Column K<br>BDE \(kcal mol⁻¹\)</)
assert.match(bdeTable, /text-align:left[^"]*">\(P\) <b>H<\/b>&ndash;CH\(CH₃\)₂</, '{l} column is left aligned, bold H kept')
assert.match(bdeTable, />\(Q\) <b>H<\/b>&ndash;CH₂Ph</, 'formula is not split by a space')
assert.match(bdeTable, />\(S\) <b>H&ndash;C<\/b>≡CH</, 'bold H–C bond stays one bold run')
assert.match(bdeTable, /text-align:left[^"]*">\(i\) 132</)
assert.match(
  convertLatexTabularToArray(
    '\\begin{tabular}{|l|l|} \\hline Column $\\mathbf{J}$ Molecule & Column $\\mathbf{K}$ BDE \\\\ \\hline (P) a & (i) 1 \\\\ \\hline \\end{tabular}',
  ),
  />Column <b>J<\/b><br>Molecule</,
  'bold column letter still splits the header',
)

const gluedStem =
  'Let $L_1$ and $L_2$ be two lines. Match each entry in List-I to the correct entry in List-II. List-I'
const gluedOpts = [
  '$\\gamma$',
  'A possible choice for $\\hat{n}$ is',
  '$\\overrightarrow{OR_1}$',
  'If $a=0$, $b=0$, $c=0$, and $d=1$, then List-II (1) $0$ (2) $1$ (3) $2$ (4) $3$ (5) $4$',
]
assert.equal(
  /List-II/.test(stitchMatchListSource(gluedStem, gluedOpts)),
  true,
  'option D List-II is stitched onto the stem',
)
const glued = parseMatchingListForDisplay(gluedStem, gluedOpts)
assert.ok(glued, 'glued List-II on option D must parse')
assert.equal(glued.listI.length, 4, `glued List-I rows: ${glued.listI.map((x) => x.label).join(',')}`)
assert.doesNotMatch(glued.listI[3].text, /List-II/)
assert.match(glued.listI[3].text, /d\s*=\s*1|then/i)
assert.ok(glued.listII.length >= 4, `glued List-II rows: ${glued.listII.length}`)
assert.equal(glued.listII[0].label, '(1)')
assert.equal(matchOptionsFoldedIntoLists(gluedStem, gluedOpts), true)

// List-II glued onto option C (not only the last option) must still fold.
const midGlueStem = `Four identical thin metal sheets. Match the quantities in List-I with List-II.
List-I
(P) Cap between S1 and S4
(Q) Cap with S2 shorted
(R) Cap S1 and S3
(S) Cap S1 and S2`
const midGlueOpts = [
  '$P \\rightarrow 3 ; Q \\rightarrow 2 ; R \\rightarrow 4 ; S \\rightarrow 5$',
  '$P \\rightarrow 2 ; Q \\rightarrow 3 ; R \\rightarrow 2 ; S \\rightarrow 1$',
  `$P \\rightarrow 3 ; Q \\rightarrow 2 ; R \\rightarrow 4 ; S \\rightarrow 1$

List-II
(1) $3 C_{0}$
(2) $C_{0} / 2$
(3) $C_{0} / 3$
(4) $2 C_{0} / 3$
(5) $2 C_{0}$`,
  '$P \\rightarrow 3 ; Q \\rightarrow 2 ; R \\rightarrow 2 ; S \\rightarrow 5$',
]
const midFold = foldListIIFromOptionsIntoStem(midGlueStem, midGlueOpts)
assert.match(midFold.text, /List-II[\s\S]*\(1\)\s*\$3 C_\{0\}/)
assert.doesNotMatch(midFold.options[2], /List-II/)
const midParsed = parseMatchingListForDisplay(midFold.text, midFold.options)
assert.ok(midParsed)
assert.equal(midParsed.listI.length, 4)
assert.ok(midParsed.listII.length >= 4, `mid-option List-II rows: ${midParsed.listII.length}`)

assert.equal(
  matchOptionsFoldedIntoLists(gluedStem, [
    '(P) $\\rightarrow$ (1)',
    '(P) $\\rightarrow$ (2)',
    '(P) $\\rightarrow$ (3)',
    '(P) $\\rightarrow$ (4)',
  ]),
  false,
  'real mapping options stay as MCQ answers',
)

const noSecondHeader = parseMatchingListForDisplay(
  'Match each entry in List-I to the correct entry in List-II and choose the correct option.',
  [
    'If $a=0$, $b=1$, $c=0$, and $d=0$, then',
    'If $a=1$, $b=0$, $c=0$, and $d=0$, then',
    'If $a=0$, $b=0$, $c=1$, and $d=0$, then',
    'If $a=0$, $b=0$, $c=0$, and $d=1$, then',
  ],
)
assert.ok(noSecondHeader, 'in List-I instruction + option rows must still parse')
assert.equal(noSecondHeader.listI.length, 4)
assert.equal(
  looksLikeMatchingListStem(
    stitchMatchListSource(
      'Match each entry in List-I to the correct entry in List-II and choose the correct option.',
      [
        'If $a=0$, $b=1$, $c=0$, and $d=0$, then',
        'If $a=1$, $b=0$, $c=0$, and $d=0$, then',
        'If $a=0$, $b=0$, $c=1$, and $d=0$, then',
        'If $a=0$, $b=0$, $c=0$, and $d=1$, then',
      ],
    ),
  ),
  true,
  'stitched “in List-I” + A–D rows must look like a match list',
)

assert.equal(
  matchQuestionMissingListI({
    text: 'Match each entry in List-I to the correct entry in List-II and choose the correct option.',
    options: [
      'If $a=0$, $b=1$, $c=0$, and $d=0$, then',
      'If $a=1$, $b=0$, $c=0$, and $d=0$, then',
      'If $a=0$, $b=0$, $c=1$, and $d=0$, then',
      'If $a=0$, $b=0$, $c=0$, and $d=1$, then List-II (1) $0$ (2) $1$ (3) $2$ (4) $3$',
    ],
  }),
  false,
  'List-I sitting in A–D is present — do not flag missing List-I',
)

const matchTheColumn = parseMatchingListForDisplay('Match the Column', [
  'Arithmetic progression with enough text here',
  'Geometric progression with enough text here',
  'Harmonic progression with enough text here',
  'Not a harmonic progression then List-II (P) AP (Q) GP (R) HP (S) None',
])
assert.ok(matchTheColumn, 'Match the Column + option rows must parse')
assert.equal(matchTheColumn.listI.length, 4)
assert.ok(matchTheColumn.listII.length >= 3, 'List-II peeled from option D')
assert.doesNotMatch(matchTheColumn.listI[3].text, /List-II/)

const unclosedTab = convertLatexTabularToArray(
  '\\begin{tabular}[t]{|l|l|} \\hline Ions & Ag^+ \\\\ \\hline $\\Lambda_0$ & 6.2',
)
assert.match(unclosedTab, /\\begin\{array\}/)
assert.doesNotMatch(unclosedTab, /\\begin\{tabular\}/)

const molPrep = prepareTextForMathTextDisplay(
  'The amount is 2 \\mathrm{mol} when $A = \\begin{bmatrix}1\\\\0\\end{bmatrix}$.',
)
assert.match(molPrep, /\$\\mathrm\{mol\}|\$\$[^$]*\\mathrm\{mol\}/)
assert.doesNotMatch(molPrep.replace(/\$[^$]+\$/g, ' ').replace(/\$\$[\s\S]+?\$\$/g, ' '), /\\mathrm\{mol\}/)

const smilesParts = splitSmilesDisplaySegments('Before <smiles>CCO</smiles> after <smiles>')
assert.ok(smilesParts.some((p) => p.kind === 'smiles' && p.value === 'CCO'))
assert.ok(smilesParts.every((p) => p.kind === 'smiles' || !/<smiles>/i.test(p.value)))
const emptySmiles = splitSmilesDisplaySegments('<smiles></smiles> text')
assert.ok(emptySmiles.every((p) => !/<smiles>/i.test(p.value)))

const displayStem =
  '\\item[] The value is 2 \\mathrm{mol}. ' +
  '\\begin{tabular}{|c|c|} \\hline A & B \\\\ 1 & 2 \\end{tabular} ' +
  '<smiles>CCO</smiles> \\caption{List-I}'
const displaySegs = splitSmilesDisplaySegments(displayStem)
assert.ok(displaySegs.some((p) => p.kind === 'smiles' && p.value === 'CCO'), 'SMILES drawer gets CCO')
const displayPrepared = displaySegs
  .map((p) => (p.kind === 'smiles' ? ' [structure] ' : prepareTextForMathTextDisplay(p.value)))
  .join('')
assert.doesNotMatch(displayPrepared, /<smiles>/i, 'display path has no raw smiles tags')
assert.doesNotMatch(displayPrepared, /\\begin\{tabular\}/, 'display path has no raw tabular')
assert.doesNotMatch(displayPrepared, /\\item\s*\[/, 'display path has no \\item[]')
assert.doesNotMatch(displayPrepared, /\\caption/, 'display path has no \\caption')
assert.match(displayPrepared, /\\mathrm\{mol\}/, 'mol is kept for KaTeX')
assert.match(displayPrepared, /<table class="paper-data-table"/, 'tabular becomes a drawn table')
const displayProse = displayPrepared.replace(/\$\$[\s\S]+?\$\$/g, ' ').replace(/\$[^$]+\$/g, ' ')
assert.doesNotMatch(displayProse, /\\mathrm\{mol\}/, 'mol is inside math delimiters')

const ionTable = prepareTextForMathTextDisplay(
  'Ions \\begin{tabular}[t]{|l|l|} \\hline Ions & $\\Lambda_0$ \\\\ \\hline \\end{tabular}',
)
assert.doesNotMatch(ionTable, /\\begin\{tabular\}/)
assert.match(ionTable, /\$\$/)
const ionInner = ionTable.match(/\$\$([\s\S]+?)\$\$/)?.[1] ?? ''
assert.doesNotMatch(ionInner, /\$/, 'no inner $ inside display array')
const ionHtml = katex.renderToString(ionInner, { throwOnError: false, displayMode: true })
assert.equal(ionHtml.includes('katex-error'), false, 'ion table must render')

assert.match(rewriteLatexItemLabels('\\item[(P)] The number of matrices'), /\(P\)/)
assert.doesNotMatch(rewriteLatexItemLabels('\\begin{itemize}\\item[(Q)] row'), /itemize/)
assert.doesNotMatch(rewriteLatexItemLabels('\\item[Q.] 52 Let $x$'), /\\item/)

const itemListStem = `Match each entry in List-I to the correct entry in List-II.
List-I
\\begin{itemize}
\\item[(P)] The number of matrices $M$ with all entries in $T$ such that $R_i = C_j = 0$ is
\\item[(Q)] The number of symmetric matrices $M$ with all entries in $T$ is
\\item[(R)] Let $M$ be a skew symmetric matrix with enough words here
\\item[(S)] Let $M$ be a matrix with all entries in $T$ then det
\\end{itemize}
List-II (1) $1$ (2) $12$ (3) infinite (4) $6$`
const parsedItemList = parseMatchingListForDisplay(itemListStem)
assert.ok(parsedItemList, 'itemize List-I must parse')
assert.equal(parsedItemList.listI.length, 4, `itemize List-I rows: ${parsedItemList.listI.map((x) => x.label).join(',')}`)
assert.equal(parsedItemList.listI[0].label, '(P)')
assert.match(parsedItemList.listI[0].text, /number of matrices/)
assert.equal(matchQuestionMissingListI({ text: itemListStem }), false)

const COL_TAB = String.raw`Match the Column
\begin{tabular}{ll}
Column I & Column II \\
(A) First row of column I with enough text here & (P) Arithmetic progression \\
(B) Second row of column I with enough text here & (Q) Geometric progression \\
(C) Third row of column I with enough text here & (R) Harmonic progression \\
(D) Fourth row of column I with enough text here & (S) Not a harmonic progression \\
\end{tabular}`
const flatCol = flattenTabularMatchLists(COL_TAB)
assert.match(flatCol, /Column I/)
assert.match(flatCol, /Column II/)
const colTab = parseMatchingListForDisplay(COL_TAB)
assert.ok(colTab, 'Column I/II tabular must parse both columns')
assert.equal(colTab.listI.length, 4, `Column I rows: ${colTab.listI.map((x) => x.label).join(',')}`)
assert.ok(colTab.listII.length >= 4, `Column II rows: ${colTab.listII.length}`)
assert.equal(colTab.listI[0].label, '(A)')
assert.equal(colTab.listII[0].label, '(P)')
assert.match(colTab.listITitle, /Column I/i)
assert.doesNotMatch(colTab.listI.map((x) => x.text).join(' '), /Arithmetic/)

const chromePrep = prepareTextForMathTextDisplay(
  'Then \\begin{itemize} \\item[(A)] $x=1$ --- page --- SECTION',
)
assert.doesNotMatch(chromePrep, /\\begin\{itemize\}/)
assert.doesNotMatch(chromePrep, /\\item/)
assert.doesNotMatch(chromePrep, /--- page ---/i)

const captionList = String.raw`Match each entry in List-I to the correct entry in List-II.
\begin{figure}
\includegraphics{https://cdn.mathpix.com/p/list-i-p.png}
\caption{(P)}
\end{figure}
\begin{figure}
\includegraphics{https://cdn.mathpix.com/p/list-i-q.png}
\caption{(Q)}
\end{figure}
\begin{figure}
\includegraphics{https://cdn.mathpix.com/p/list-i-r.png}
\caption{(R)}
\end{figure}
\begin{figure}
\includegraphics{https://cdn.mathpix.com/p/list-i-s.png}
\caption{(S)}
\end{figure}
List-II
(1) $1$
(2) $12$
(3) infinite
(4) $6$`
assert.equal(looksLikeMatchingListStem(captionList), true)
const captionFigParsed = parseMatchingListForDisplay(captionList)
assert.ok(captionFigParsed, 'figure List-I must parse')
assert.ok(captionFigParsed.listI.length >= 4, `figure List-I rows: ${captionFigParsed.listI.length}`)
assert.match(captionFigParsed.listI.map((x) => x.text).join(' '), /cdn\.mathpix\.com/)
assert.equal(matchQuestionMissingListI({ text: captionList }), false)
const keptCaption = wrapBareLatexRuns('\\caption{List-I} then \\item[(P)] a row')
assert.match(keptCaption, /List-I/)
assert.match(keptCaption, /\(P\)/)
assert.doesNotMatch(keptCaption, /\\caption/)
assert.doesNotMatch(keptCaption, /\\item/)
assert.match(rewriteLatexItemLabels('\\caption{List-I}\\caption{(P)}'), /List-I/)
assert.match(rewriteLatexItemLabels('\\caption{(P)}'), /\(P\)/)
assert.match(rewriteLatexItemLabels('\\section*{List-I}\\item[(P)] Work done'), /List-I/)
assert.match(rewriteLatexItemLabels('\\section*{List-I}\\item[(P)] Work done'), /\(P\)\s+Work done/)
assert.match(rewriteLatexItemLabels('\\section*{(1) $3 C_{0}$}'), /\(1\)\s*\$3 C_\{0\}\$/)
assert.match(rewriteLatexItemLabels('$(\\mathrm{A}) \\quad(\\mathrm{P}) \\rightarrow(4)$'), /\(A\)/)
assert.match(rewriteLatexItemLabels('$(\\mathrm{A}) \\quad(\\mathrm{P}) \\rightarrow(4)$'), /\(P\)/)

const figOcr = `A particle as shown in the figure starts from rest.
\\includegraphics{https://cdn.mathpix.com/p/circuit.png}
Then the current is`
const figStem = 'A particle as shown in the figure starts from rest. Then the current is'
const restoredFig = restoreMissingFiguresFromSource(figStem, figOcr)
assert.match(restoredFig, /cdn\.mathpix\.com\/p\/circuit/)
const aspFigOcr = `The structure of aspartame is
![](https://cdn.mathpix.com/p/aspartame.png)
(A)
<smiles>COC(=O)[C@H](Cc1ccccc1)NC(=O)C[C@H](N)C(=O)O</smiles>`
assert.match(
  restoreMissingFiguresFromSource('The structure of aspartame is', aspFigOcr),
  /cdn\.mathpix\.com\/p\/aspartame/,
)

const listWithKey = `Match each entry in List-I to the correct entry in List-II.
List-I
(P) one
(Q) two
(R) three
(S) four
List-II
(1) 1
(2) 12
(3) infinite
(4) 6
(5) 0 The correct option is (A) (P)→(4) (Q)→(3) (R)→(2) (S)→(5)`
const parsedKey = parseMatchingListForDisplay(listWithKey, [])
assert.ok(parsedKey)
assert.doesNotMatch(parsedKey.listII.map((x) => x.text).join(' '), /The correct option is/)

const ptDiagram = `One mole of a monatomic ideal gas undergoes the cyclic process, as shown in the P-T diagram.
\\includegraphics{https://cdn.mathpix.com/p/pt-diagram.png}
Match the quantities mentioned in List-I with their values in List-II and choose the correct option.
List-I
(P) Work done in the complete cyclic process
(Q) Change in the internal energy of the gas in the process JK
(R) Heat given to the gas in the process KL
(S) Change in the internal energy of the gas in the process MJ
List-II
(1) $RT_{0}-4RT_{0}\\ln 2$
(2) 0
(3) $3RT_{0}$
(4) $-2RT_{0}\\ln 2$
(5) $-3RT_{0}\\ln 2$`
const ptParsed = parseMatchingListForDisplay(ptDiagram)
assert.ok(ptParsed, 'P-T match list must parse')
assert.match(ptParsed.intro, /cdn\.mathpix\.com\/p\/pt-diagram/, 'stem P-T diagram stays above List-I')
assert.doesNotMatch(ptParsed.listI.map((x) => x.text).join(' '), /cdn\.mathpix/, 'P-T diagram is not a List-I row')

const circuitDump = `The circuit shown in the figure.
\\includegraphics{https://cdn.mathpix.com/p/circuit34.png}
Match the quantities mentioned in List-I with their values in List-II and choose the correct option.
List-I
(P) The value of $I_{1}$ in Ampere is
(Q) The value of $I_{2}$ in Ampere is
(R) The value of $I_{3}$ in Ampere is
(S) The value of $V_{0}$ in Volt is

List-II
0
2
4
20
200

List-II
(1) 0
(2) 2
(3) 4
(4) 20
(5) 200`
const circuitParsed = parseMatchingListForDisplay(circuitDump)
assert.ok(circuitParsed)
assert.match(circuitParsed.intro, /cdn\.mathpix\.com\/p\/circuit34/, 'circuit diagram stays in intro')
const rowS = circuitParsed.listI.find((x) => x.label === '(S)')
assert.ok(rowS)
assert.doesNotMatch(rowS.text, /List-II/)
assert.doesNotMatch(rowS.text, /\b20\b/)
assert.equal(circuitParsed.listII[0].label, '(1)')
assert.match(circuitParsed.listII[0].text, /^0$/)

assert.equal(
  matchQuestionMissingListI({
    text: 'Based on VSEPR model, match the xenon compounds in List-I with their structures in List-II and select the correct option.',
    options: ['', '', '', ''],
  }),
  true,
  'xenon instruction-only card still needs List-I from OCR',
)

assert.match(repairMatchListOcrGlitches('$C_{0} / 2$'), /\\frac\{C_\{0\}\}\{2\}/)
assert.match(repairMatchListOcrGlitches('$2 C_{0} / 3$'), /\\frac\{2 C_\{0\}\}\{3\}/)

const gluedListIi = repairMatchListOcrGlitches(
  'List-II\n$(1)$ the point $(1,1)$\n(2) the point $(7,9)$\n(3) the point $(3,2) (4)$ the point $(2,5)$\n(5) the point $(8,3)$\nList-I\n[t]{|l|l|l|}',
)
assert.match(gluedListIi, /\(1\)\s+the point/)
assert.match(gluedListIi, /\$\(3,2\)\$\s*\n\s*\(4\)\s+the point/)
assert.doesNotMatch(gluedListIi, /\[t\]/)
const gluedParsed = parseMatchingListForDisplay(
  `Match each entry in List-I to List-II.
List-I
(P) circle
(Q) tangent
(R) ellipse
(S) hyperbola
${gluedListIi}`,
  ['', '', '', ''],
)
assert.ok(gluedParsed)
assert.equal(gluedParsed.listII.length, 5, `glued List-II must split to 5, got ${gluedParsed.listII.length}`)
assert.match(gluedParsed.listII[2].text, /\$\(3,2\)\$/)
assert.match(gluedParsed.listII[3].text, /\$\(2,5\)\$/)

assert.match(rewriteLatexItemLabels('\\caption{iv) a) $\\mathrm{BH}_{3}$, b) $\\mathrm{H}_{2} \\mathrm{O}_{2}$}'), /mathrm\{BH\}/)
assert.doesNotMatch(
  rewriteLatexItemLabels('\\caption{iv) a) $\\mathrm{BH}_{3}$, b) $\\mathrm{H}_{2} \\mathrm{O}_{2}$}'),
  /\\caption/,
)

const q32Cap = parseMatchingListForDisplay(`Match the quantities mentioned in List-I with their values in List-II.
List-I
(P) The capacitance between $S_{1}$ and $S_{4}$
(Q) The capacitance between $S_{1}$ and $S_{3}$
(R) The capacitance between $S_{1}$ and $S_{2}$
(S) The capacitance with $S_{3}$ shorted
List-II
(1) $3 C_{0}$
(2) $C_{0} / 2$
(3) $C_{0} / 3$
(4) $2 C_{0} / 3$
(5) $2 C_{0}$`)
assert.ok(q32Cap)
assert.match(q32Cap.listII[1].text, /\\frac\{C_\{0\}\}\{2\}/)
assert.match(q32Cap.listII[3].text, /\\frac\{2 C_\{0\}\}\{3\}/)

const q51Figs = `Match each entry in List-I with List-II.
\\caption{List-I}
\\includegraphics{https://cdn.mathpix.com/p/p.png}
\\includegraphics{https://cdn.mathpix.com/p/q.png}
\\caption{(R)}
\\includegraphics{https://cdn.mathpix.com/p/r.png}
\\caption{(S)}
\\includegraphics{https://cdn.mathpix.com/p/s.png}
List-II
\\includegraphics{https://cdn.mathpix.com/p/one.png}
\\caption{(2)}
\\includegraphics{https://cdn.mathpix.com/p/two.png}
\\caption{(3)}
\\includegraphics{https://cdn.mathpix.com/p/three.png}
\\caption{(4)}
\\includegraphics{https://cdn.mathpix.com/p/four.png}
\\caption{(5)}
\\includegraphics{https://cdn.mathpix.com/p/five.png}`
const q51Parsed = parseMatchingListForDisplay(q51Figs)
assert.ok(q51Parsed)
assert.equal(q51Parsed.listI.map((x) => x.label).join(','), '(P),(Q),(R),(S)', `List-I ${q51Parsed.listI.map((x) => x.label).join(',')}`)
assert.match(q51Parsed.listI.find((x) => x.label === '(S)').text, /cdn\.mathpix\.com\/p\/s\.png/)
assert.ok(q51Parsed.listII.some((x) => x.label === '(1)'))

const q50Figs = `List-I contains various reaction sequences and List-II contains the possible products. Match each entry in List-I with the appropriate entry in List-II.
\\caption{List-I}
\\includegraphics{https://cdn.mathpix.com/p/p50.png}
i) O3
\\caption{List-II}
\\includegraphics{https://cdn.mathpix.com/p/one50.png}
(Q)
\\caption{iv) a) $\\mathrm{BH}_{3}$}
\\includegraphics{https://cdn.mathpix.com/p/q50.png}
\\caption{(R)}
\\includegraphics{https://cdn.mathpix.com/p/r50.png}
\\caption{(S)}
\\includegraphics{https://cdn.mathpix.com/p/s50.png}
(2)
<smiles>CC1C(O)CCC1CO</smiles>
(3)
<smiles>OCC1CCCC1O</smiles>
(4)
<smiles>CC1(O)CCCC1O</smiles>
(5)
<smiles>CC(O)C1CCCC1O</smiles>`
const q50Parsed = parseMatchingListForDisplay(q50Figs)
assert.ok(q50Parsed, 'Q50 figure match lists must parse')
assert.equal(q50Parsed.listI.length, 4, `Q50 List-I ${q50Parsed.listI.map((x) => x.label).join(',')}`)
assert.ok(q50Parsed.listII.length >= 4, `Q50 List-II ${q50Parsed.listII.length}`)
assert.match(q50Parsed.listII.map((x) => x.text).join(' '), /smiles|includegraphics/)

const q50EchoP = `List-I contains various reaction sequences and List-II contains the possible products.
List-I
(P)
\\includegraphics{https://cdn.mathpix.com/p/p50.png}
(P)
i) O3, Zn
ii) aq. NaOH
(Q)
\\includegraphics{https://cdn.mathpix.com/p/q50.png}
\\caption{iv) a) $\\mathrm{BH}_{3}$, b) $$\\mathrm{H}_{2}\\mathrm{O}_{2}$, NaOH}
List-II
(1)
\\includegraphics{https://cdn.mathpix.com/p/one50.png}
(2)
<smiles>CC1C(O)CCC1CO</smiles>
(3)
<smiles>OCC1CCCC1O</smiles>
(4)
<smiles>CC1(O)CCCC1O</smiles>
(5)
<smiles>CC(O)C1CCCC1O</smiles>`
const q50Echo = parseMatchingListForDisplay(q50EchoP)
assert.ok(q50Echo)
assert.doesNotMatch(q50Echo.listI.find((x) => x.label === '(P)').text, /O3|ethylene/)
assert.match(q50Echo.listI.find((x) => x.label === '(P)').text, /p50\.png/)
assert.match(q50Echo.listII.find((x) => x.label === '(4)').text, /CC1\(O\)CCCC1O/)
const q50Sanitized = wrapBareLatexRuns(rewriteLatexItemLabels(q50EchoP))
assert.equal(
  latexExtractionIncomplete(q50Sanitized),
  false,
  'Q50 smashed BH3 caption is complete chemistry, not a cut formula',
)
assert.match(normalizeSmashedChemDollars('b) $$\\mathrm{H}_{2}\\mathrm{O}_{2}$'), /\$\\mathrm\{H\}/)

const q51Smashed = `Among the following phenolic compounds, match each entry in List-I with List-II.
\\caption{List-I}
![]($ https://cdn.mathpix.com/cropped/list-i-wide.jpg)
![](https://cdn.mathpix.com/cropped/q51.jpg)
\\caption{(R)}
\\includegraphics{https://cdn.mathpix.com/p/r51.png}
\\caption{(S)}
\\includegraphics{https://cdn.mathpix.com/p/s51.png}
\\caption{List-II}
![]($ https://cdn.mathpix.com/cropped/one51.jpg)
\\caption{(2)}
\\includegraphics{https://cdn.mathpix.com/p/two51.png}
\\caption{(3)}
\\includegraphics{https://cdn.mathpix.com/p/three51.png}
\\caption{(4)}
\\includegraphics{https://cdn.mathpix.com/p/four51.png}
\\caption{(5)}
\\includegraphics{https://cdn.mathpix.com/p/five51.png}`
const q51SmashedParsed = parseMatchingListForDisplay(q51Smashed)
assert.ok(q51SmashedParsed)
assert.equal(q51SmashedParsed.listI.map((x) => x.label).join(','), '(P),(Q),(R),(S)')
assert.equal(
  latexExtractionIncomplete(wrapBareLatexRuns(rewriteLatexItemLabels(q51Smashed))),
  false,
  'Q51 List-I figures with leftover $ in markdown are not incomplete',
)

const q48GluedQ = `Match each entry in List-I with List-II.
List-I
(P) Titrate: KCl
Titrant: $\\mathrm{AgNO}_{3}$$
(Q) Titrate: $\\mathrm{AgNO}_{3}$
Titrant: KCl
(R) Titrate: NaOH
Titrant: HCl
(S) Titrate: NaOH
Titrant: $\\mathrm{CH}_{3} \\mathrm{COOH}$$
List-II
(1) graph one`
const q48Split = parseMatchingListForDisplay(q48GluedQ)
assert.ok(q48Split)
assert.equal(q48Split.listI.length, 4)
assert.doesNotMatch(q48Split.listI.find((x) => x.label === '(P)').text, /Titrant: KCl/)
assert.match(q48Split.listI.find((x) => x.label === '(Q)').text, /KCl/)

const q51Narrow = expandNarrowListICrops(
  `List-I
\\includegraphics{https://cdn.mathpix.com/cropped/page.jpg?height=324&width=573&top_left_y=452&top_left_x=338}
\\includegraphics{https://cdn.mathpix.com/cropped/page.jpg?height=174&width=116&top_left_y=840&top_left_x=340}
\\includegraphics{https://cdn.mathpix.com/cropped/page.jpg?height=190&width=183&top_left_y=1153&top_left_x=340}
\\includegraphics{https://cdn.mathpix.com/cropped/page.jpg?height=345&width=756&top_left_y=1475&top_left_x=340}`,
)
assert.match(q51Narrow, /width=116&top_left_y=840&top_left_x=340/)
assert.match(q51Narrow, /width=183&top_left_y=1153&top_left_x=340/)

const q51Captioned = expandNarrowListICrops(
  stripEmptyFigureShells(
    `\\begin{figure}\\caption{(R)}\\includegraphics{https://cdn.mathpix.com/cropped/page.jpg?height=190&width=183&top_left_y=1153&top_left_x=340}\\end{figure}`,
  ) +
    `\n\\includegraphics{https://cdn.mathpix.com/cropped/page.jpg?height=345&width=756&top_left_y=1475&top_left_x=340}`,
)
assert.match(q51Captioned, /width=183&top_left_y=1153/, 'captioned List-I (R) crop stays the OCR rectangle')

const signedList = parseMatchingListForDisplay(`Match each entry in List-I to the correct entry in List-II.
List-I
(P) roots of the first equation
(Q) roots of the second equation
(R) third value here
(S) fourth value here
List-II
(1) $x^{2}+x+1=0$
(2) $x^{2}-x+1=0$
(3) $x^{2}+x-1=0$
(4) -1
(5) -4`)
assert.equal(signedList.listII.find((r) => r.label === '(4)')?.text, '-1')
assert.equal(signedList.listII.find((r) => r.label === '(5)')?.text, '-4')

const matchKey = prepareTextForMathTextDisplay(
  '(P) → (5), & (Q) → (4), & (R) → (2), & $(S) \\rightarrow(1)$ $$',
)
assert.match(matchKey, /\(P\) → \(5\)/)
assert.match(matchKey, /\(S\) → \(1\)/)
assert.doesNotMatch(matchKey, /List-I/)
assert.doesNotMatch(matchKey, /&/)
assert.doesNotMatch(matchKey, /\\rightarrow/)

const matrixOpt = prepareTextForMathTextDisplay(
  '$\\left[\\begin{array}{lll}1 & 1 & 1 \\\\ 2 & 3 & 4 \\\\ 1 & 2 & 1\\end{array}\\right]$',
)
assert.match(matrixOpt, /\\\\/)
assert.match(matrixOpt, /2 & 3 & 4/)
assert.doesNotMatch(matrixOpt, /1 2 & 3/)

const massRatio = prepareTextForMathTextDisplay(
  'the value of $\\left(m_{1} / m_{2}\\right)$ is $____$.',
)
assert.match(massRatio, /m_\{1\}/)
assert.doesNotMatch(massRatio, /m_\\frac/)

const chem = prepareTextForMathTextDisplay(
  'Treatment of buta-1,3-diyne with $\\mathrm{NaNH}_{2}$ (2 equivalents), followed by reaction with excess of trans- $\\mathrm{CH}_{3}-\\mathrm{CH}=\\mathrm{CH}-\\mathrm{CH}_{2}-\\mathrm{Br}$ gives X',
)
assert.match(chem, /\$\\mathrm\{NaNH\}_\{2\}\$/)
assert.match(chem, /\(2 equivalents\)/)
assert.doesNotMatch(chem, /\\mathrm\{NaNH\}_\{2\} \(2 equivalents\)/)

const inertia = `List-I shows rods. Choose the option that describes the correct match.
List-I
(P) \\includegraphics{https://cdn.mathpix.com/cropped/p.jpg?height=10&width=10&top_left_y=1&top_left_x=1}
(Q) \\includegraphics{https://cdn.mathpix.com/cropped/q.jpg?height=10&width=10&top_left_y=2&top_left_x=1}
(R) \\includegraphics{https://cdn.mathpix.com/cropped/r.jpg?height=10&width=10&top_left_y=3&top_left_x=1}
(S) \\includegraphics{https://cdn.mathpix.com/cropped/s.jpg?height=10&width=10&top_left_y=4&top_left_x=1}
List-II
(1) $\\frac{5}{4} m l^{2}$
(4) $\\frac{2}{3} m l^{2}$
\\includegraphics{https://cdn.mathpix.com/cropped/five.jpg?height=71&width=164&top_left_y=2149&top_left_x=1133}`
const inertiaLists = parseMatchingListForDisplay(inertia)
const row4 = inertiaLists?.listII?.find((r) => r.label === '(4)')
const row5 = inertiaLists?.listII?.find((r) => r.label === '(5)')
assert.ok(row4, 'List-II (4) stays')
assert.match(String(row4?.text || ''), /\\frac\{2\}\{3\}/)
assert.doesNotMatch(String(row4?.text || ''), /includegraphics/)
assert.ok(row5, 'trailing figure is List-II (5), not glued onto (4)')
assert.match(String(row5?.text || ''), /five\.jpg/)
assert.equal(inertiaLists?.listII?.some((r) => r.label === '(2)'), false)

const fullListII = `Match each entry in List-I with List-II.
List-I
(P) alpha
(Q) beta
(R) gamma
(S) delta
List-II
(1) one
(2) two
(3) three
(4) four
(5) five`
const fullRows = parseMatchingListForDisplay(fullListII)
for (const label of ['(1)', '(2)', '(3)', '(4)', '(5)']) {
  assert.ok(fullRows?.listII?.some((r) => r.label === label), `List-II ${label} stays when the OCR has it`)
}

const missingR = String.raw`Match each entry in List-I to the correct entry in List-II and choose the correct option.
List-I
(P) The number of elements in the set
$$\left\{x \in[-\pi, \pi]: \sin ^{6} x+\cos ^{4} x=1\right\}$$
List-II
(1) is 1
(Q) The number of elements in the set
$$\text { (2) is } 2$$
$$\left\{x \in\left[-\frac{\pi}{2}, \frac{\pi}{2}\right]: \sin ^{2} x+\cos ^{6} x=1\right\}$$
(3) is 3
$$\left\{x \in[-\pi, \pi]: \cos ^{2}\left(\frac{x}{2}\right)-\sin ^{2} x=\frac{1}{2}\right\}$$
(S) The number of elements in the set
$$\text { (4) is } 4$$
$$\left\{x \in[-2 \pi, 2 \pi]: 6 \sin ^{2}\left(\frac{x}{2}\right)-\cos 3 x=3\right\}$$
(5) is 5`
const rRows = parseMatchingListForDisplay(missingR)
const rowR = rRows?.listI?.find((r) => r.label === '(R)')
assert.ok(rowR, 'unlabeled set between (Q) and (S) becomes (R)')
assert.match(String(rowR?.text || ''), /cos \^\{2\}/)
assert.doesNotMatch(String(rRows?.intro || ''), /cos \^\{2\}/)
for (const label of ['(P)', '(Q)', '(R)', '(S)']) {
  assert.ok(rRows?.listI?.some((r) => r.label === label), label)
}

const nuclear = [
  'Match List I of the nuclear processes with List II containing parent nucleus and one of the end products of each process and then select the correct answer using the codes given below the lists :',
  '',
  '(P)',
  'Alpha decay',
  '',
  '(Q)',
  '$\\beta^{+}$decay',
  '',
  '(R)',
  'Fission',
  '',
  '(S)',
  'Proton emission',
  '',
  '(1)',
  '${ }_{8}^{15} \\mathrm{O} \\rightarrow{ }_{7}^{15} \\mathrm{~N}+\\ldots$..',
  '',
  '(2)',
  '${ }_{92}^{238} U \\rightarrow{ }_{90}^{234} T h+\\ldots$..',
  '',
  '(3)',
  '${ }_{83}^{185} \\mathrm{Bi} \\rightarrow{ }_{82}^{184} \\mathrm{~Pb}+\\ldots$..',
  '',
  '(4)',
  '${ }_{94}^{239} \\mathrm{Pu} \\rightarrow{ }_{57}^{140} \\mathrm{La}+\\ldots$..',
].join('\n')
const nuclearRows = parseMatchingListForDisplay(nuclear, ['4 2 1 3', '1 3 2 4', '2 1 4 3', '4 3 2 1'])
assert.equal(
  nuclearRows?.intro,
  'Match List I of the nuclear processes with List II containing parent nucleus and one of the end products of each process and then select the correct answer using the codes given below the lists :',
  '2013 P2 Q19: "List I" inside the sentence is not the List-I heading',
)
assert.deepEqual(
  nuclearRows?.listI?.map((r) => r.text),
  ['Alpha decay', '$\\beta^{+}$decay', 'Fission', 'Proton emission'],
)
assert.equal(nuclearRows?.listII?.length, 4)

console.log('ok matching-list display + arrow repair')
