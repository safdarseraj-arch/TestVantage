/**
 * Errors found on stored Official PYQ papers stay fixed, in their general form:
 * every \left / \right fence around an array, `$$` lines in the scan, a `$` after a
 * list label, case inside molecules, number-answer cards and crop pictures, picture
 * rows in match lists, question numbers glued to the first number, and source files
 * saved as UTF-16.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    get length() { return store.size },
    key: (i) => [...store.keys()][i] ?? null,
  }
}

const { paperItemsFromMathpixOcr, restoreGluedQuestionNumbers, sanitizeMathpixOcrText } = await import('../src/utils/mathpixQuestionSplit.js')
const { mathDrawFailure } = await import('../src/utils/mathDrawCheck.js')
const { prepareTextForMathTextDisplay } = await import('../src/utils/prepareMathForRender.js')
const { stripImageWatermarkOcr } = await import('../src/utils/stripImageWatermarkOcr.js')
const { stripStrayMathDelimiters } = await import('../src/utils/wrapBareLatexRuns.js')
const { reviewOfficialPyqCards } = await import('../src/utils/officialPyqUnifiedCheck.js')
const { healUploadQuestionCard } = await import('../src/utils/uploadQualityGuards.js')
const { looksLikeMatchingListStem, parseMatchingListForDisplay } = await import('../src/utils/parseMatchingListDisplay.js')
const { validateMathpixQuestion, cleanMathpixCardText } = await import('../src/utils/mathpixCleanPipeline.js')
const { stripTrailingPyqSectionHeader } = await import('../src/utils/bulkExtractClean.js')
const { officialPyqDrawnRawCode, officialPyqDrawnText } = await import('../src/utils/officialPyqOriginalCompare.js')
const { stripMistakenOfficialPyqPassages } = await import('../src/utils/passage.js')
const { buildPaperFacts } = await import('../src/utils/officialPyqPaperFacts.js')
const { splitGluedChemDisplayEquations } = await import('../src/utils/healTruncatedLatex.js')
const { extendOfficialPyqHealCard, restoreMissingListIIFromSource, matchQuestionMissingListI } = await import('../src/utils/extendTruncatedStem.js')
const { keepApprovedOfficialPyqCards, importQuestionsToOfficialPyqPending } = await import('../src/utils/officialPyqApproval.js')
const { keepAdminEditedCards, copyAnswersOntoCanonical } = await import('../src/utils/officialPyqLocalReparse.js')
const { questionsFromOfficialPyqExtract, formatOfficialPyqUploadError, inferOcrQuestionCount } = await import('../src/utils/pyqGeminiExtract.js')
const { readPrintedAnswerKey } = await import('../src/utils/printedAnswerKey.js')
const { parsedBulkToPyqItems } = await import('../src/utils/pyqImport.js')
const { enrichParsedWithAnswerProvenance } = await import('../src/utils/answerProvenance.js')
const { sanitizeStemForDisplay, shownStemLooksIncomplete } = await import('../src/utils/sanitizeStemForDisplay.js')
const { matchColumnTableLayout, splitMatchColumnTables } = await import('../src/utils/latexTabularDisplay.js')
const { reviewMarkSpans } = await import('../src/utils/officialPyqReviewFlags.js')

let failed = 0
function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (err) {
    failed += 1
    console.error(`FAIL - ${name}\n${err?.stack || err}`)
  }
}

const FENCES = [
  ['\\left|', '\\right|'],
  ['\\left[', '\\right]'],
  ['\\left(', '\\right)'],
  ['\\left\\{', '\\right\\}'],
  ['\\left\\|', '\\right\\|'],
  ['\\left\\lVert', '\\right\\rVert'],
  ['\\left\\langle', '\\right\\rangle'],
  ['\\left\\lfloor', '\\right\\rfloor'],
]
const SMASH = /\\left\s*(?:\\[a-zA-Z]+|\\?[^\sa-zA-Z])\s*\$|\$\s*\\right/
const plainQ = (n) =>
  `\\item[Q.] ${n} Find the value of $x^{${n}}$ when the matrix is singular and real.\n\\begin{itemize}\n\\item[(A)] $1$\n\\item[(B)] $2$\n\\item[(C)] $3$\n\\item[(D)] $4$\n\\end{itemize}`
const splitShapes = {
  bare: (l, r) => `Let f equal ${l}\\begin{array}{cc}\n1 & 2 \\\\\n3 & 4\n\\end{array}${r} for all x.`,
  inline: (l, r) => `Let $f=${l}\\begin{array}{cc}1 & 2 \\\\ 3 & 4\\end{array}${r}$ for all x.`,
  displayLine: (l, r) => `Let\n$$\n${l}\\begin{array}{cc}\n1 & 2 \\\\\n3 & 4\n\\end{array}${r}\n$$\nfor all x.`,
  twoInline: (l, r) =>
    `Let $A=${l}\\begin{array}{cc}1 & 2 \\\\ 3 & 4\\end{array}${r}$ and $B=${l}\\begin{array}{cc}5 & 6 \\\\ 7 & 8\\end{array}${r}$ for all x.`,
  determinantSum: (l, r) =>
    `Let\n$$f(\\theta)=\\frac{1}{2}${l}\\begin{array}{cc}\n1 & \\sin \\theta \\\\\n-1 & 1\n\\end{array}${r}+${l}\\begin{array}{cc}\n\\sin \\pi & 1 \\\\\n0 & \\tan \\pi\n\\end{array}${r} .$$\nfor all x.`,
}

test('every \\left / \\right fence around an array survives split, heal and display', () => {
  const bad = []
  for (const [shape, mk] of Object.entries(splitShapes)) {
    for (const [l, r] of FENCES) {
      const ocr = ['\\begin{itemize}', plainQ(13), `\\item[Q.] 14 ${mk(l, r)}`, '\\begin{itemize}', '\\item[(A)] $1$', '\\item[(B)] $2$', '\\item[(C)] $3$', '\\item[(D)] $4$', '\\end{itemize}', plainQ(15), '\\end{itemize}'].join('\n')
      const card = paperItemsFromMathpixOcr(ocr).find((q) => /for all x/.test(q.text))
      const text = card?.text || ''
      const shown = prepareTextForMathTextDisplay(text)
      const why = !card ? 'no card' : SMASH.test(text) ? 'split smash' : mathDrawFailure(text) ? 'does not draw' : SMASH.test(shown) ? 'display smash' : !text.includes(l) ? 'lost \\left' : ''
      if (why) bad.push(`${shape} ${l}: ${why}`)
    }
  }
  assert.deepEqual(bad, [])
})

test('stored smashes `\\left| $$ … $$ \\right|` with any fence draw again', () => {
  const bad = []
  for (const [l, r] of FENCES) {
    for (const s of [
      `$$f=${l}$$\\begin{array}{cc}\n1 & 2 \\\\\n3 & 4\n\\end{array}$$${r} .$$`,
      `Let $f=${l}$$$\\begin{array}{cc}1 & 2 \\\\ 3 & 4\\end{array}$$$${r}$ ok`,
    ]) {
      const shown = prepareTextForMathTextDisplay(s)
      if (SMASH.test(shown)) bad.push(`${l}: ${shown}`)
    }
  }
  assert.deepEqual(bad, [])
})

test('`$$` and `\\[` lines of multi-line display math are not dropped as scan noise', () => {
  for (const [open, close] of [['$$', '$$'], ['\\[', '\\]']]) {
    const src = `Let\n${open}\n\\left|\\begin{array}{cc}\n1 & 2 \\\\\n3 & 4\n\\end{array}\\right|\n${close}\nfor all x.`
    const out = stripImageWatermarkOcr(src)
    assert.equal(out.split(open).length, src.split(open).length, out)
    assert.equal(out.split(close).length, src.split(close).length, out)
  }
})

test('a `$` right after a list label (P) / (A) / (1) / (II) on its own line is kept (2023 P1 Q17)', () => {
  for (const [a, b] of [['P', 'Q'], ['A', 'B'], ['1', '2'], ['II', 'III']]) {
    const src = `List-I\n\n(${a})\n$|z|^{2}$ is equal to\n\n(${b})\n$|z-\\bar{z}|^{2}$ is equal to`
    const out = stripStrayMathDelimiters(src)
    assert.ok(out.includes('$|z|^{2}$') && out.includes('$|z-\\bar{z}|^{2}$'), out)
    const shown = prepareTextForMathTextDisplay(src)
    assert.deepEqual(officialPyqDrawnRawCode(officialPyqDrawnText(shown)), [], shown)
  }
})

test('a `$` that closes a row right before the next label (2) is kept when rows sit on one line (2024 P1 Q31)', () => {
  const src = 'List-II (1) $\\mathcal{R} T_{0}-4 \\mathcal{R} T_{0} \\ln 2$ (2) 0 (3) $3 \\mathcal{R} T_{0}$ (4) $-2 \\mathcal{R} T_{0} \\ln 2$ (5) $-3 \\mathcal{R} T_{0} \\ln 2$'
  assert.equal(stripStrayMathDelimiters(src), src)
  const rows = 'Match the quantities.\n$[\\mathcal{R}$ is the gas constant.]\n\nList-I\n\n(P)\nWork done\n\n(Q)\nHeat given\n\nList-II\n\n(1)\n$\\mathcal{R} T_{0}-4 \\mathcal{R} T_{0} \\ln 2$\n\n(2)\n0\n\n(3)\n$3 \\mathcal{R} T_{0}$\n\n(4)\n$-2 \\mathcal{R} T_{0} \\ln 2$'
  assert.deepEqual(officialPyqDrawnRawCode(officialPyqDrawnText(prepareTextForMathTextDisplay(rows))), [])
})

test('options that differ only in case inside molecules or math are not "the same"; real repeats still are', () => {
  const card = (options) => ({ text: 'Which structure is aromatic?', options, questionType: 'single_correct', correctIndex: 0 })
  const reasons = (options) => reviewOfficialPyqCards([card(options)], '', null, { cardsOnly: true }).messages.join(' ')
  assert.doesNotMatch(reasons(['<smiles>c1ccccc1</smiles>', '<smiles>C1CCCCC1</smiles>', '<smiles>CCO</smiles>', '<smiles>CC</smiles>']), /options are the same/)
  assert.doesNotMatch(reasons(['$X$', '$x$', '$Y$', '$y$']), /options are the same/)
  assert.match(reasons(['$x$', '$x$', '$y$', '$z$']), /options are the same/)
  assert.match(reasons(['Only one', 'only ONE', 'Two', 'Three']), /options are the same/)
})

const SECTION_2 = [
  '\\section*{SECTION 2 (Maximum marks: 24)}',
  '\\begin{itemize}',
  '\\item[-] This section contains SIX (06) questions.',
  '\\item[-] Each question has FOUR options (A), (B), (C) and (D). ONE OR MORE THAN ONE of these four option(s) is (are) correct answer(s).',
  '\\item[-] For each question, choose the option(s) corresponding to (all) the correct answer(s).',
  '\\end{itemize}',
].join('\n')
const CROP = '/api/official-pyq/original/crops/opyq-1791600203377-1ynbz3j-p21-a1d9e0b674ab1dc1.png'

test('a number-answer card gets no options from the next section instruction and keeps its crop picture (2022 P2 Q44)', () => {
  const ocr = [
    '\\begin{itemize}',
    '\\item[Q.] 8 The total number of chiral molecules formed from one molecule of P on complete ozonolysis $\\left(\\mathrm{O}_{3}, \\mathrm{Zn} / \\mathrm{H}_{2} \\mathrm{O}\\right)$ is \\_\\_\\_\\_.',
    '<smiles>C/C=C(\\C)[C@@H](C)/C(C)=C(\\C)C</smiles>',
    '\\end{itemize}',
    SECTION_2,
  ].join('\n')
  for (const questionType of ['integer', 'numerical']) {
    const card = {
      text: `The total number of chiral molecules formed from one molecule of P on complete ozonolysis $\\left(\\mathrm{O}_{3}, \\mathrm{Zn} / \\mathrm{H}_{2} \\mathrm{O}\\right)$ is $\\_\\_\\_\\_$.\n\\includegraphics{${CROP}}`,
      options: [],
      questionType,
      adminEdited: true,
    }
    const healed = healUploadQuestionCard(card, ocr)
    assert.deepEqual((healed.options || []).filter((o) => String(o).trim()), [], JSON.stringify(healed.options))
    assert.ok(String(healed.text).includes(CROP), healed.text)
  }
})

test('crop pictures in options and in the passage survive heal', () => {
  const ocr = '\\item[Q.] 5 Which graph shows the motion?\n\\item[(A)] graph\n\\item[(B)] graph\n\\item[(C)] graph\n\\item[(D)] graph'
  const crop = (n) => `\\includegraphics{/api/official-pyq/original/crops/opyq-1-p3-${'abcdef0123456789'.slice(0, 15)}${n}.png}`
  const card = {
    text: 'Which graph shows the motion?',
    passageText: `A ball is thrown up.\n${crop(9)}`,
    options: [crop(1), crop(2), crop(3), crop(4)],
    questionType: 'single_correct',
    correctIndex: 0,
  }
  const healed = healUploadQuestionCard(card, ocr)
  for (let i = 1; i <= 4; i += 1) assert.ok(String(healed.options?.[i - 1] ?? '').includes(crop(i)), JSON.stringify(healed.options))
  assert.ok(String(healed.passageText ?? healed.text).includes(crop(9)) || String(healed.text).includes(crop(9)))
})

test('a match list with a picture row keeps the $$ text rows beside it (2023 P1 Q50)', () => {
  const pic = '\\includegraphics{https://cdn.mathpix.com/cropped/22af20be-1a43-4c5b-a717-a14406f81de2-29.jpg?height=144&width=591&top_left_y=1825&top_left_x=483}'
  for (const [I, II] of [[['P', 'Q', 'R', 'S'], ['1', '2', '3', '4', '5']], [['A', 'B', 'C', 'D'], ['1', '2', '3', '4', '5']], [['I', 'II', 'III', 'IV'], ['P', 'Q', 'R', 'S', 'T']]]) {
    const rowText = ['$$\\underset{\\text { (single enantiomer) }}{\\mathrm{C}_{5} \\mathrm{H}_{11} \\mathrm{Br}} \\xrightarrow[S_{\\mathrm{N}} 2]{\\text { aq. } \\mathrm{NaOH}}$$', '$$\\mathrm{C}_{5} \\mathrm{H}_{11} \\mathrm{Br} \\xrightarrow[S_{\\mathrm{N}} 1]{}$$', '$$\\mathrm{C}_{7} \\mathrm{H}_{15} \\mathrm{Br} \\xrightarrow[S_{\\mathrm{N}} 1]{\\text { aq. }}$$']
    const text = [
      'Match the reactions in List-I with the features of their products in List-II and choose the correct option.',
      'List-I',
      ...I.slice(0, 3).map((l, i) => `(${l})\n${rowText[i]}`),
      `(${I[3]})\n\n${pic}`,
      'List-II',
      ...['Inversion of configuration', 'Retention of configuration', 'Mixture of enantiomers', 'Mixture of structural isomers', 'Mixture of diastereomers'].map((t, i) => `(${II[i]})\n${t}`),
    ].join('\n\n')
    const options = [0, 1, 2, 3].map((k) => I.map((l, i) => `${l} → ${II[(i + k) % 5]}`).join('; '))
    const parsed = parseMatchingListForDisplay(text, options)
    assert.ok(parsed, `${I[0]}: no match parse`)
    assert.equal(parsed.listI.length, 4, `${I[0]}: ${JSON.stringify(parsed.listI)}`)
    const empty = parsed.listI.filter((row) => !String(row.text ?? '').trim() && !row.image && !row.images?.length)
    assert.deepEqual(empty, [], `${I[0]}: ${JSON.stringify(parsed.listI)}`)
    assert.ok(parsed.listI.slice(0, 3).every((row) => /\\xrightarrow/.test(row.text)), JSON.stringify(parsed.listI))
  }
})

test('"liquid column in the capillary" beside a figure is not a match-the-column question (2023 P2 Q28)', () => {
  const text = 'A capillary tube is dipped into the liquid, as shown in the figure. The height $(h)$ of the liquid column in the capillary above the liquid level in cm is ____.\n\\includegraphics{https://cdn.mathpix.com/cropped/52e1470d-16.jpg?height=503&width=765&top_left_y=941&top_left_x=697}'
  assert.equal(looksLikeMatchingListStem(text), false)
  assert.deepEqual(validateMathpixQuestion({ text, options: ['', '', '', ''], questionType: 'integer' }).issues.filter((i) => i.code === 'missing_column'), [])
  assert.equal(looksLikeMatchingListStem('Match List-I with List-II.\nList-I\n(P) a\n(Q) b\n(R) c\n(S) d\nList-II\n(1) w\n(2) x\n(3) y\n(4) z'), true)
  assert.equal(looksLikeMatchingListStem('Match each entry in Column I with Column II.\n\\includegraphics{https://cdn.mathpix.com/cropped/x-1.jpg}'), true)
})

test('answer rows "(A) P → 2 ; Q → 1 …" in the scan do not turn List-I into (A)–(D) rows (2026 P1 Q48)', () => {
  const pic = (y) => `\\includegraphics{https://cdn.mathpix.com/cropped/29f8b727-48a8-4bba-8b95-542e9562d45f-34.jpg?height=219&width=683&top_left_y=${y}&top_left_x=359}`
  const smiles = ['N#Cc1cc([N+](=O)[O-])ccc1O', 'N#Cc1cc([N+](=O)[O-])ccc1Br', 'CC(=O)Nc1cc([N+](=O)[O-])ccc1Br', 'Cc1noc2ccc([N+](=O)[O-])cc12', 'C/C(=N\\O)c1cc([N+](=O)[O-])ccc1Br']
  const keys = [[2, 1, 5, 4], [1, 2, 4, 5], [1, 2, 3, 4], [2, 1, 3, 5]]
  const table = (I) => ['\\begin{tabular}[t]{|l|l|}', ...keys.map((k, n) => `\\hline (${'ABCD'[n]}) & $${I.map((l, i) => `${l} \\rightarrow ${k[i]}`).join(' ; ')}$ \\\\`), '\\hline', '\\end{tabular}'].join('\n')
  const listII = ['List-II', `<smiles>${smiles[0]}</smiles>\n<smiles>${smiles[0]}</smiles>`, ...smiles.slice(1).map((s, i) => `(${i + 2})\n<smiles>${s}</smiles>`)]
  const window = ['16 Match the major products obtained in the reactions given in List-I with the corresponding structures in List-II and choose the correct option.', `List-I\n\n${[411, 687, 1007, 1354, 1443].map(pic).join('\n')}`, ...listII, table(['P', 'Q', 'R', 'S'])].join('\n\n')
  const parsed = parseMatchingListForDisplay(window)
  assert.deepEqual(parsed?.listI?.map((r) => r.label), ['(P)', '(Q)', '(R)', '(S)'])
  assert.deepEqual(parsed?.listII?.map((r) => r.label), ['(1)', '(2)', '(3)', '(4)', '(5)'])
  const alpha = ['Match List-I with List-II and choose the correct option.', `List-I\n\n${['A', 'B', 'C', 'D'].map((l, i) => `(${l}) ${pic(411 + i * 300)}`).join('\n')}`, 'List-II', ...smiles.map((s, i) => `(${i + 1})\n<smiles>${s}</smiles>`), table(['A', 'B', 'C', 'D'])].join('\n\n')
  assert.deepEqual(parseMatchingListForDisplay(alpha)?.listI?.map((r) => r.label), ['(A)', '(B)', '(C)', '(D)'])
})

test('a question number glued to the first number of the stem is split again (2023 P2 Q8, Q12)', () => {
  const cases = [
    ['\\item[Q.] 7 Seven text.\n\\item[Q.] $8 \\mathrm{H}_{2} \\mathrm{~S}$ (5 moles) reacts.\n\\item[Q.] 9 Nine.', '\\item[Q.] 8 $ \\mathrm{H}_{2} \\mathrm{~S}$ (5 moles)'],
    ['Q. 11 Eleven.\nQ. 1250 mL of urea.\nQ. 13 Thirteen.', 'Q. 12 50 mL of urea.'],
    ['Q. 1 One.\nQ. 2 Two.\nQ. 34 g of X.\nQ. 4 Next.', 'Q. 3 4 g of X.'],
  ]
  for (const [src, want] of cases) assert.ok(restoreGluedQuestionNumbers(src).includes(want), restoreGluedQuestionNumbers(src))
  for (const keep of [
    'Q. 2 Two.\nQ. 25 A particle.\nQ. 26 Next.',
    'Q. 1 One.\nQ. 2 Two.\nQ. 34 g of X.\nQ. 35 Next.',
    'Q. 1 One.\nQ. 2 Two.\nQ. 1 Restart chem.\nQ. 2 Two.',
    '\\item[Q.] 4 Four.\n\\item[Q.] $5 x$ is a root.\n\\item[Q.] 5 Five real.',
  ]) {
    assert.equal(restoreGluedQuestionNumbers(keep), keep)
  }
  const ocr = ['\\begin{itemize}', plainQ(7), '\\item[Q.] $8 \\mathrm{H}_{2} \\mathrm{~S}$ (5 moles) reacts with excess acid. The number of moles is \\_\\_\\_\\_.', plainQ(9), '\\end{itemize}'].join('\n')
  const items = paperItemsFromMathpixOcr(ocr)
  assert.equal(items.length, 3, JSON.stringify(items.map((q) => q.text.slice(0, 40))))
  assert.ok(items.some((q) => /5 moles/.test(q.text)))
})

test('source files are UTF-8, never UTF-16 (the editor once saved files as UTF-16)', () => {
  const roots = ['src', 'scripts']
  const bad = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(?:m?js|jsx|ts|tsx|css|py|json)$/.test(entry.name)) {
        const head = Buffer.alloc(4)
        const fd = fs.openSync(full, 'r')
        const n = fs.readSync(fd, head, 0, 4, 0)
        fs.closeSync(fd)
        if (n >= 2 && ((head[0] === 0xff && head[1] === 0xfe) || (head[0] === 0xfe && head[1] === 0xff) || head[1] === 0 || head[0] === 0)) bad.push(full)
      }
    }
  }
  for (const root of roots) if (fs.existsSync(root)) walk(root)
  assert.deepEqual(bad, [])
})

test('answer blanks next to math: the closing $ stays, and the card is not flagged (2018 P1 Q11, Q14)', () => {
  const pic = '\n\\includegraphics{https://cdn.mathpix.com/cropped/a-06.jpg?height=691&top_left_y=1837&top_left_x=578}'
  const cases = [
    'The value of $\\epsilon_{r} =$ ________.' + pic,
    'then $K_{1} / K_{2}=$ ________.' + pic,
    'The value of $\\epsilon_{r}= ____$.' + pic,
    'then $K_{1} / K_{2}= ____$.' + pic,
    'If $x_{1}=2$ then $y=$ ____ units.',
  ]
  for (const text of cases) {
    assert.equal(mathDrawFailure(text), '', text)
    assert.deepEqual(officialPyqDrawnRawCode(officialPyqDrawnText(text)), [], text)
  }
  assert.equal(stripStrayMathDelimiters('of $\\epsilon_{r} =$ ________.'), 'of $\\epsilon_{r} =$ ________.')
  assert.doesNotMatch(prepareTextForMathTextDisplay(cases[0]), /\$\\includegraphics/)
})
test('new pending papers 2018-2020: aligned $, PART headings, dangling \\item and the check matching the display', () => {
  const aligned = 'Let $f$ be given by\n$$f(x)=\\left\\{\\begin{aligned}\nx^{2}-x+1, & 0 \\leq x<1 ; \\\\\n$\\frac{2}{3} x^{3}$, & 1 \\leq x<3 ; \\\\\nx+$\\frac{10}{3}$, & x \\geq 3 .\n\\end{aligned}\\right.$$\nThen which'
  assert.equal(mathDrawFailure(aligned), '')
  assert.deepEqual(officialPyqDrawnRawCode(officialPyqDrawnText(aligned)), [])
  assert.doesNotMatch(cleanMathpixCardText(aligned), /\\begin\{aligned\}[^]*\$\\frac/)

  const part = 'where $t$ is $____$.\n\\includegraphics{https://x.jpg}\n\n$\\$$\\$ PART-II'
  assert.doesNotMatch(stripTrailingPyqSectionHeader(part), /PART/)
  assert.match(stripTrailingPyqSectionHeader('Find the string in PART-II of the figure.'), /PART-II/)

  const option = '<smiles>COc1ccc(CCCC(=O)O)cc1</smiles> <smiles>COc1ccc2c(c1)C(=O)CCC2</smiles> \\item['
  assert.equal(cleanMathpixCardText(option), '<smiles>COc1ccc(CCCC(=O)O)cc1</smiles> <smiles>COc1ccc2c(c1)C(=O)CCC2</smiles>')
  assert.deepEqual(officialPyqDrawnRawCode(officialPyqDrawnText(option)), [])
  assert.equal(officialPyqDrawnText('the speed is $____ \\mathrm{m} \\mathrm{s}^{-1}$.'), 'the speed is ____ ms−1.')
})
test('a lowercase "if" inside option D does not start a new question (2019 P1 Q5)', () => {
  const ocr = String.raw`\begin{itemize}
\item[Q.] 5 A capillary tube is dipped vertically in water in two configurations, case I and II. Which of the following option(s) is(are) correct?
\begin{itemize}
\item[(A)] The correction in the height will be different for both cases.
\item[(B)] For case II, if the capillary joint is 5 cm above the water surface, the height of water column raised in the tube will be 3.75 cm.
\item[(C)] For case I, if the joint is kept at 8 cm above the water surface, the height of water column in the tube will be 7.5 cm.
\item[(D)] For case I, if the capillary joint is 5 cm above the water surface, the height of water column raised in the tube will be more than 8.75 cm.
\end{itemize}
\end{itemize}
\begin{itemize}
\item[Q.] 6 A conducting wire of parabolic shape is moving. Then the correct option(s) is(are)
\item[(A)] one
\item[(B)] two
\item[(C)] three
\item[(D)] four
\end{itemize}`
  const out = paperItemsFromMathpixOcr(ocr)
  const items = out?.items || out || []
  assert.equal(items.length, 2)
  assert.match(String(items[0].options?.[3] ?? ''), /more than 8\.75 cm/)
})
const matchSubject = (title, para15, para17) => `\\section*{JEE (ADVANCED) 2019 PAPER 2 PART-${title}}

Q. 14 A ball of mass $m$ is dropped from height $h$ on a fixed floor. Find the speed just before it hits the floor.
(A) $\\sqrt{g h}$
(B) $\\sqrt{2 g h}$
(C) $2 g h$
(D) $g h$

Answer Q. 15 and Q. 16 by appropriately matching the lists based on the information given in the paragraph

${para15} List-I gives four strings while List-II lists the magnitude of some quantity.

List-I
\\begin{itemize}
\\item[(I)] String-1 $(\\mu)$
\\item[(II)] String-2 $(2 \\mu)$
\\end{itemize}

List-II
\\begin{itemize}
\\item[(P)] 1
\\item[(T)] 3/16
\\item[(U)] 1/16
\\end{itemize}
Q. 15 Which of the following options has the correct combination considering List-I and List-II?
(A) (I), (P)
(B) (I), (T)
(C) (II), (P)
(D) (II), (U)
Q. 16 Which of the following options has the correct combination considering List-I and List-II?
(A) (III), (P)
(B) (III), (T)
(C) (IV), (P)
(D) (IV), (U)

\\section*{Answer Q. 17 and Q. 18 by appropriately matching the lists based on the information given in the paragraph}

${para17} The List-I below gives some quantities and List-II gives some possible values.

List-I
\\begin{itemize}
\\item[(I)] Work done by the system
\\item[(II)] Change in internal energy
\\end{itemize}

List-II
\\begin{itemize}
\\item[(P)] $R T_{0}$
\\item[(U)] $\\frac{5}{6} R T_{0}$
\\end{itemize}
Q. 17 If the process on one mole of gas is as shown in the figure, the correct match is,
(A) I → P, II → U
(B) I → U, II → P
(C) I → P, II → P
(D) I → U, II → U
Q. 18 If the process on one mole of gas is as shown in the second figure, the correct match is,
(A) I → U, II → U
(B) I → P, II → U
(C) I → U, II → P
(D) I → P, II → P
`

test('"Answer Q.15 and Q.16 by appropriately matching…" paragraphs go to that subject\'s two cards only (2019 P2)', () => {
  const ocr =
    matchSubject('I PHYSICS', 'A musical instrument is made using four different metal strings.', 'In a thermodynamic process on an ideal monatomic gas the heat absorbed is T dX.') +
    matchSubject('II CHEMISTRY', 'Consider the Bohr model of a one-electron atom.', 'List-I includes starting materials and reagents of selected chemical reactions.')
  const items = paperItemsFromMathpixOcr(ocr)
  assert.deepEqual(items.map((q) => q.printedNumber), [14, 15, 16, 17, 18, 14, 15, 16, 17, 18])
  assert.ok(items.every((q) => !/^\s*Answer Q/i.test(q.text)), 'no instruction-only cards')
  const passage = (i) => String(items[i].passageText ?? '')
  assert.equal(passage(0), '')
  assert.match(passage(1), /musical instrument/)
  assert.match(passage(2), /musical instrument/)
  assert.match(passage(3), /thermodynamic process/)
  assert.match(passage(4), /thermodynamic process/)
  assert.match(passage(6), /Bohr model/)
  assert.match(passage(7), /Bohr model/)
  assert.match(passage(8), /starting materials/)
  assert.match(passage(9), /starting materials/)
  assert.doesNotMatch(passage(8), /thermodynamic/)
  assert.match(passage(1), /\(U\) 1\/16/)
  const kept = stripMistakenOfficialPyqPassages(items, ocr)
  assert.ok([1, 2, 3, 4, 6, 7, 8, 9].every((i) => String(kept[i].passageText ?? '').trim()), 'later clean-up keeps them')
  assert.deepEqual(items[2].options, ['(III), (P)', '(III), (T)', '(IV), (P)', '(IV), (U)'])
})

test('a Column-I row labelled "\\item[Q.]" is not a new question (2020 P1 Q6)', () => {
  const ocr = String.raw`Q. 6 The Fischer projection of D-erythrose is shown below. D-Erythrose and its isomers are listed as P, Q, R, and S in Column-I. Choose the correct relationship of P, Q, R, and S with D-erythrose from Column II.

Column-I
\begin{itemize}
\item[P.]
<smiles>O=C[C@H](O)[C@H](O)CO</smiles>
\item[Q.]
<smiles>O=CC(O)C(O)CO</smiles>
\item[R.]
<smiles>O=C[C@@H](O)[C@H](O)CO</smiles>
\item[S.]
<smiles>O=CC(O)C(CO)CO</smiles>
\end{itemize}

Column-II
\begin{itemize}
\item[1.] Diastereomer
\item[2.] Identical
\item[3.] Enantiomer
\end{itemize}
(A) P→2, Q→3, R→2, S→2
(B) P→3, Q→1, R→1, S→2
(C) P→2, Q→1, R→1, S→3
(D) P→2, Q→3, R→3, S→1
\item[Q.] 7 In thermodynamics, the $P-V$ work done is given by $w=-\int d V P_{\mathrm{ext}}$. Which process is this?
(A) reversible and isothermal
(B) reversible and adiabatic
(C) irreversible at constant pressure
(D) none of these`
  const items = paperItemsFromMathpixOcr(ocr)
  assert.deepEqual(items.map((q) => q.printedNumber), [6, 7])
  assert.match(items[0].text, /O=CC\(O\)C\(O\)CO[\s\S]*Diastereomer[\s\S]*Enantiomer/)
  assert.deepEqual(items[0].options, [
    'P→2, Q→3, R→2, S→2',
    'P→3, Q→1, R→1, S→2',
    'P→2, Q→1, R→1, S→3',
    'P→2, Q→3, R→3, S→1',
  ])
})

test('"Choose the correct option(s) … [figure] Consider Q, R and S …" stays one card with its options (2019 P2 chem Q7)', () => {
  const ocr = String.raw`Q. 6 Choose the correct option(s) that give(s) an aromatic compound as the major product
(A) benzene
(B) toluene
(C) phenol
(D) cyclohexane
Q. 7 Choose the correct option(s) for the following reaction sequence
![](https://cdn.mathpix.com/cropped/6ad5e50f-17.jpg?height=199&width=1541&top_left_y=281&top_left_x=318)
Consider Q, R and S as major products
\begin{itemize}
\item[(A)] <smiles>COc1ccc(C(O)CCC(=O)O)cc1</smiles>
\item[(B)] <smiles>COc1ccc2c(c1)C(=O)CC=C2</smiles>
\item[(C)] <smiles>COc1ccc2c(c1)C(=O)CCC2</smiles>
\item[(D)] <smiles>COc1ccc2c(c1)CCCC2</smiles>
\end{itemize}
Q. 8 Choose the correct option(s) from the following
(A) Natural rubber is polyisoprene
(B) Nylon-6 has amide linkages
(C) Teflon is made from tetrafluoroethene
(D) Cellulose has only alpha-glycosidic linkages`
  const items = paperItemsFromMathpixOcr(ocr)
  assert.deepEqual(items.map((q) => q.printedNumber), [6, 7, 8])
  assert.match(items[1].text, /Consider Q, R and S as major products/)
  assert.equal(items[1].options.filter((o) => String(o).trim()).length, 4)
})

test('"The figure below is the plot … [figure]" then "What is the value …" is one question (2020 P2 chem Q15)', () => {
  const ocr = String.raw`Q. 14 The total number of lone pairs of electrons present in the whole molecule of $\mathrm{XeF}_{4}$ is
Q. 15 The figure below is the plot of potential energy versus internuclear distance (d) of $\mathrm{H}_{2}$ molecule in the electronic ground state.
\includegraphics{https://cdn.mathpix.com/cropped/d771ecc7-f5d8-4005-9ec7-41db-15.jpg}
What is the value of the net potential energy $E_{0}$ (as indicated in the figure) in $\mathrm{kJ} \mathrm{mol}^{-1}$, for $d=d_{0}$?
Q. 16 Consider the reaction sequence from P to Q shown below. What is the amount in grams of Q obtained from 9.3 mL of P?`
  const items = paperItemsFromMathpixOcr(ocr)
  assert.deepEqual(items.map((q) => q.printedNumber), [14, 15, 16])
  assert.match(items[1].text, /What is the value of the net potential energy/)
})

test('"TW0 (02) List-Match sets … TWO (02) Multiple Choice Questions" counts four matching questions (2019 P2)', () => {
  const facts = buildPaperFacts(String.raw`\section*{SECTION 3 (Maximum Marks: 12)}
\begin{itemize}
\item[-] This section contains TW0 (02) List-Match sets.
\item[-] Each List-Match set has TW0 (02) Multiple Choice Questions.
\item[-] Each List-Match set has two lists: List-I and List-II.
\end{itemize}`)
  assert.equal(facts.sections.length, 1)
  assert.equal(facts.sections[0].count, 4)
  assert.equal(facts.sections[0].type, 'matrix_match')
})

const choices = (n) => ['A', 'B', 'C', 'D'].map((l, k) => `(${l}) value ${n * 10 + k}`).join('\n')
const PARA_2018 = (subject, x, a) => String.raw`\section*{JEE (ADVANCED) 2018 PAPER 1 PART-${subject}}
Q. 14 The value of $n$ is \_\_\_\_.
\section*{SECTION 3 (Maximum Marks: 12)}
\begin{itemize}
\item[-] This section contains TWO (02) paragraphs. Based on each paragraph, there are TWO (02) questions.
\end{itemize}

\section*{PARAGRAPH "X"}

${x}
(There are two questions based on PARAGRAPH "X", the question given below is one of them)

\section*{Q. 15 The first X question is}
${choices(15)}

PARAGRAPH "X"
${x}
(There are two questions based on PARAGRAPH "X", the question given below is one of them)
Q. 16 The second X question is
${choices(16)}

\section*{PARAGRAPH "A"}

${a}
\begin{itemize}
\item[Q.] 17 The first A question is
\end{itemize}
${choices(17)}

\section*{PARAGRAPH "A"}

${a}
\begin{itemize}
\item[Q.] 18 The second A question is
\end{itemize}
${choices(18)}
`

test('a paragraph printed again above each of its questions goes to those two cards only, without its "X"/"A" label (2018 P1 Q15–18)', () => {
  const ocr = [
    PARA_2018('I PHYSICS', 'In electromagnetic theory, the electric and magnetic phenomena are related to each other.', 'If the measurement errors in all the independent quantities are known, then it is possible.'),
    PARA_2018('II CHEMISTRY', 'Treatment of benzene with CO/HCl in the presence of anhydrous AlCl3 gives compound X.', 'An organic acid P can easily be oxidized to a dibasic acid which reacts with ethyleneglycol.'),
    String.raw`\section*{JEE (ADVANCED) 2018 PAPER 1 PART-III MATHEMATICS}
Q. 1 For a non-zero complex number $z$, which of the following is TRUE?
(A) one
(B) two
(C) three
(D) four`,
  ].join('\n')
  const items = paperItemsFromMathpixOcr(ocr)
  const card = (subjectIndex, n) => items.filter((q) => q.printedNumber === n)[subjectIndex]
  for (const [s, x, a] of [[0, /^In electromagnetic theory/, /^If the measurement errors/], [1, /^Treatment of benzene/, /^An organic acid P/]]) {
    for (const n of [15, 16]) assert.match(card(s, n)?.passageText || '', x, `subject ${s} Q${n}`)
    for (const n of [17, 18]) assert.match(card(s, n)?.passageText || '', a, `subject ${s} Q${n}`)
    for (const n of [15, 16, 17, 18]) assert.doesNotMatch(card(s, n).passageText, /^["“]|There are two questions/)
    assert.equal(card(s, 15).passageGroup, card(s, 16).passageGroup)
    assert.notEqual(card(s, 15).passageGroup, card(s, 17).passageGroup)
  }
  const mathQ1 = items.find((q) => /non-zero complex number/.test(q.text))
  assert.ok(!mathQ1?.passageText, 'the next part\'s Q1 gets no paragraph')
})

test('"[A]" in a table heading and "$[B]$" in math are not option labels (2019 P1 chem Q17, 2018 P1 phys Q15)', () => {
  const ocr = String.raw`Q. 16 The value of $x$ is \_\_\_\_
\item[Q.] 17 Consider the kinetic data given in the following table for the reaction $\mathrm{A}+\mathrm{B}+\mathrm{C} \rightarrow$ Product .

\begin{tabular}[t]{|l|l|l|l|l|}
\hline Experiment No. & [A] $\left(\mathrm{mol} \mathrm{dm}{ }^{-3}\right)$ & [B] $\left(\mathrm{mol} \mathrm{dm}^{-3}\right)$ & [C] $\left(\mathrm{mol} \mathrm{dm}{ }^{-3}\right)$ & Rate \\
\hline 1 & 0.2 & 0.1 & 0.1 & $6.0 \times 10^{-5}$ \\
\hline
\end{tabular}
The rate is found to be $\mathrm{Y} \times 10^{-5}$. The value of Y is \_\_\_\_
\item[Q.] 18 The relation between $[E]$ and $[B]$ is
(A) $[E]=[B][L][T]$
(B) $[E]=[B][L]^{-1}[T]$
(C) $[E]=[B][L][T]^{-1}$
(D) $[E]=[B][L]^{-1}[T]^{-1}$`
  const items = paperItemsFromMathpixOcr(ocr)
  const q17 = items.find((q) => q.printedNumber === 17)
  assert.deepEqual(q17.options.filter((o) => String(o).trim()), [])
  assert.match(q17.text, /& \[A\] /)
  assert.match(q17.text, /The value of Y is/)
  const q18 = items.find((q) => q.printedNumber === 18)
  assert.match(q18.text, /\$\[E\]\$ and \$\[B\]\$/)
  assert.equal(q18.options[3], '$[E]=[B][L]^{-1}[T]^{-1}$')
})

test('printed "(A) P and Q" options win over the structures drawn in the stem; "(B) X is <empty>" keeps its slot (2020 P1 Q22, P2 Q30)', () => {
  const ocr = String.raw`Q. 4 Newman projections P, Q, R and S are shown below:
<smiles>CCC1C(C)C2(C)CCC1(C)C2(C)C</smiles>

<smiles>CCc1ccc(C)c(C)c1C</smiles>

<smiles>CCC1=CC(C)C(CC)C(C)C1O</smiles>

Which one of the following options represents identical molecules?
(A) P and Q
(B) Q and S
(C) Q and R
(D) R and S
\item[Q.] 5 Consider the following transformations of a compound P.
Choose the correct option(s).
(A) P is
<smiles>C#CCC1CC=CCC1</smiles>
(B) X is
<smiles></smiles>
(C) P is
<smiles>C#CCC1C=CCCC1</smiles>
(D) R is
<smiles>C=C(C#CCC1CC=CCC1)c1ccccc1</smiles>`
  const items = paperItemsFromMathpixOcr(ocr)
  assert.deepEqual(items[0].options, ['P and Q', 'Q and S', 'Q and R', 'R and S'])
  assert.match(items[0].text, /<smiles>CCc1ccc\(C\)c\(C\)c1C<\/smiles>/)
  assert.match(items[1].options[0], /^P is\s*<smiles>C#CCC1CC=CCC1<\/smiles>$/)
  assert.match(items[1].options[1], /^X is/)
  assert.match(items[1].options[3], /^R is/)
  const review = reviewOfficialPyqCards([{ ...items[1], questionType: 'multiple_correct' }], '', null, { cardsOnly: true })
  assert.deepEqual(review.failedGoTo, [1], 'the lost drawing in option B is flagged')
})

test('four same-size pictures after "will look like" are the options A–D in reading order (2020 P1 Q3)', () => {
  const img = (y, x, h = 270) => `![](https://cdn.mathpix.com/cropped/p-02.jpg?height=${h}&width=320&top_left_y=${y}&top_left_x=${x})`
  const q = {
    questionType: 'single_correct',
    text: [
      'A small roller of diameter 20 cm has an axle of diameter 10 cm. After the roller has moved 50 cm, the position of the scale will look like (figures are schematic)',
      img(528, 434, 205),
      img(946, 470),
      img(946, 1339),
      img(1379, 513),
      img(1375, 1286),
    ].join('\n'),
    options: ['', '', '', ''],
  }
  const healed = healUploadQuestionCard(q, '')
  assert.deepEqual(
    healed.options.map((o) => o.match(/top_left_y=(\d+)&top_left_x=(\d+)/).slice(1).join(',')),
    ['946,470', '946,1339', '1379,513', '1375,1286'],
  )
  assert.match(healed.text, /top_left_y=528/)
  const plain = { ...q, text: q.text.replace('will look like', 'moves') }
  assert.deepEqual(healUploadQuestionCard(plain, '').options, ['', '', '', ''], 'pictures stay put when the question does not ask for one')
})

test('"weak base (B)" in a number-answer question is not a missing option (2020 P2 chem Q13)', () => {
  const ocr = String.raw`\item[Q.] 13 A solution of 0.1 M weak base (B) is titrated with 0.1 M of a strong acid (HA). What is the $\mathrm{p} K_{\mathrm{b}}$ of the base?
\item[Q.] 14 Liquids A and B form ideal solution.`
  const card = {
    questionType: 'numerical',
    text: 'A solution of 0.1 M weak base (B) is titrated with 0.1 M of a strong acid (HA). What is the $\\mathrm{p} K_{\\mathrm{b}}$ of the base?',
    options: [],
  }
  assert.deepEqual(reviewOfficialPyqCards([card], ocr, null, { cardsOnly: true }).failedGoTo, [])
})

test('"List-I  List-II" printed side by side, then rows (I)–(IV) and (P)–(U): both lists show, (U) is its own row (2019 P2 Q15)', () => {
  const text = [
    'Answer Q. 15 and Q. 16 by appropriately matching the lists based on the information given in the paragraph',
    'Consider the Bohr\'s model of a one-electron atom. List-I contains some quantities and List-II contains how they depend on $n$.',
    'List-I\nList-II',
    '(I) Radius of the orbit',
    '(II) Angular momentum of the electron',
    '(III) Kinetic energy of the electron',
    '(IV) Potential energy of the electron',
    '(P) $\\propto n^{-2}$',
    '(Q) $\\propto n^{-1}$',
    '(R) $\\propto n^{0}$',
    '(S) $\\propto n^{1}$',
    '(T) $\\propto n^{2}$',
    '(U) $\\propto n^{1 / 2}$',
  ].join('\n')
  const parsed = parseMatchingListForDisplay(text, [])
  assert.ok(parsed, 'no match parse')
  assert.deepEqual(parsed.listI.map((row) => row.label), ['(I)', '(II)', '(III)', '(IV)'], JSON.stringify(parsed.listI))
  assert.deepEqual(parsed.listII.map((row) => row.label), ['(P)', '(Q)', '(R)', '(S)', '(T)', '(U)'], JSON.stringify(parsed.listII))
  assert.ok(!/\(\s*U\s*\)/.test(parsed.listII[4].text), parsed.listII[4].text)
  assert.ok(/Radius/.test(parsed.listI[0].text), parsed.listI[0].text)
})

test('"…considering List-I and List-II?" followed by choices "(I), (Q), (T), (U)" is not drawn as a table; the choices stay (2019 P2 chem Q17, Q18)', () => {
  for (const options of [
    ['(I), (Q), (T), (U)', '(II), (P), (S), (T)', '(II), (P), (S), (U)', '(I), (S), (Q), (R)'],
    ['(III), (S), (R)', '(IV), (Q), (U)', '(III), (T), (U)', '(IV), (Q), (R)'],
  ]) {
    const stem = 'Which of the following options has correct combination considering List-I and List-II?'
    const text = `${stem}\n${options.map((o, k) => `(${'ABCD'[k]}) ${o}`).join('\n')}`
    assert.equal(parseMatchingListForDisplay(text, options), null, options[0])
    assert.equal(parseMatchingListForDisplay(stem, options), null, options[0])
  }
})

test('a match paragraph keeps its List-I pictures when physics prints the same "Answer Q. 17 and Q. 18" heading (2019 P2 chem Q17)', () => {
  const url = (y) => `https://cdn.mathpix.com/cropped/6ad5e50f-8e34-4d86-9132-8c3f027bdcd0-21.jpg?height=233&width=607&top_left_y=${y}&top_left_x=268`
  const physUrl = 'https://cdn.mathpix.com/cropped/6ad5e50f-8e34-4d86-9132-8c3f027bdcd0-13.jpg?height=348&width=552&top_left_y=396&top_left_x=818'
  const head = 'Answer Q. 17 and Q. 18 by appropriately matching the lists based on the information given in the paragraph'
  const physics = String.raw`\section*{JEE (ADVANCED) 2019 PAPER 2 PART-I PHYSICS}
Answer Q. 17 and Q. 18 by appropriately matching the lists based on the information given in the paragraph}

In a thermodynamic process on an ideal monatomic gas, the infinitesimal heat absorbed by the gas is given by $T \Delta X$, where $T$ is temperature of the system and $\Delta X$ is the infinitesimal change in a thermodynamic quantity $X$ of the system.

The List-I below gives some quantities involved in a process and List-II gives some possible values of these quantities.

List-I
\begin{itemize}
\item[(I)] Work done by the system in process 1→2→3
\item[(II)] Change in internal energy in process 1→2→3
\item[(III)] Heat absorbed by the system in process 1→2→3
\item[(IV)] Heat absorbed by the system in process 1→2
\end{itemize}

List-II
\begin{itemize}
\item[(P)] $\frac{1}{3} R T_{0} \ln 2$
\item[(Q)] $\frac{1}{3} R T_{0}$
\item[(R)] $R T_{0}$
\item[(S)] $\frac{4}{3} R T_{0}$
\item[(T)] $\frac{1}{3} R T_{0}(3+\ln 2)$
\item[(U)] $\frac{5}{6} R T_{0}$
\end{itemize}
\begin{itemize}
\item[Q.] 17 If the process carried out on one mole of monatomic ideal gas is as shown in figure in the $P V$-diagram with $P_{0} V_{0}=\frac{1}{3} R T_{0}$, the correct match is,
![](${physUrl})
(A) I → Q, II → R, III → P, IV → U
(B) I → Q, II → R, III → S, IV → U
(C) I → S, II → R, III → Q, IV → T
(D) I → Q, II → S, III → R, IV → U
\item[Q.] 18 If the process on one mole of monatomic ideal gas is as shown in the $T V$-diagram with $P_{0} V_{0}=\frac{1}{3} R T_{0}$, the correct match is,
(A) I → P, II → R, III → T, IV → S
(B) I → P, II → T, III → Q, IV → T
(C) I → P, II → R, III → T, IV → P
(D) I → S, II → T, III → Q, IV → U
\end{itemize}`
  const chemPara = [
    head,
    '',
    'List-I includes starting materials and reagents of selected chemical reactions. List-II gives structures of compounds that may be formed as intermediate products and/or final products from the reactions of List-I.',
    '',
    'List-I\nList-II',
    `(I)\n![](${url(652)})\n(P)\n<smiles>O=CCc1ccccc1C(=O)O</smiles>`,
    `(II)\n![](${url(1007)})\n(Q)\n<smiles>OCCc1ccccc1CO</smiles>`,
    `(III)\n![](${url(1362)})\n(R)\n<smiles>c1ccc2c(c1)CCOC2</smiles>`,
    `(IV)\n![](${url(1700)})\n(S)\n<smiles>O=C(O)c1ccccc1CCO</smiles>`,
    '(T)\n<smiles>O=C(O)Cc1ccccc1C(=O)O</smiles>\n(U)\n<smiles>O=C1OCCc2ccccc21</smiles>',
  ].join('\n')
  const ocr = [
    physics,
    '',
    '\\section*{JEE (ADVANCED) 2019 PAPER 2 PART-II CHEMISTRY}',
    'Q. 16 Which of the following is the strongest acid among the given compounds?\n(A) acetic acid\n(B) formic acid\n(C) benzoic acid\n(D) phenol',
    '',
    chemPara,
    'Q. 17 Which of the following options has correct combination considering List-I and List-II?\n(A) (I), (Q), (T), (U)\n(B) (II), (P), (S), (T)\n(C) (II), (P), (S), (U)\n(D) (I), (S), (Q), (R)',
    'Q. 18 Which of the following options has correct combination considering List-I and List-II?\n(A) (III), (S), (R)\n(B) (IV), (Q), (U)\n(C) (III), (T), (U)\n(D) (IV), (Q), (R)',
  ].join('\n')
  const card = {
    subject: 'chemistry',
    printedNumber: 17,
    questionNumber: 35,
    pyqSlot: 35,
    questionType: 'matrix_match',
    passageText: chemPara.replace(/!\[\]\(([^)]+)\)/g, '\\includegraphics{$1}'),
    passageRole: 'comprehension_child',
    text: 'Which of the following options has correct combination considering List-I and List-II?',
    options: ['(I), (Q), (T), (U)', '(II), (P), (S), (T)', '(II), (P), (S), (U)', '(I), (S), (Q), (R)'],
  }
  const healed = healUploadQuestionCard(card, `${ocr}\n\n${ocr}`)
  for (const y of [652, 1007, 1362, 1700]) assert.ok(String(healed.passageText).includes(url(y)), healed.passageText)
  assert.ok(!String(healed.passageText).includes(physUrl), healed.passageText)
})

test('a radioactive decay chain stays one line; the $$ closer before the next "$x_1$" line is kept (2019 P1 chem Q10)', () => {
  const chain =
    '$${ }_{92}^{238} \\mathrm{U} \\xrightarrow{-\\mathrm{x}_{1}}{ }_{90}^{234} \\mathrm{Th} \\xrightarrow{-\\mathrm{x}_{2}}{ }_{91}^{234} \\mathrm{~Pa} \\xrightarrow{-\\mathrm{x}_{3}}{ }^{234} \\mathbf{Z} \\xrightarrow{-\\mathrm{x}_{4}}{ }_{90}^{230} \\mathrm{Th}$$'
  const text = `In the decay sequence,\n${chain}\n$\\mathrm{x}_{1}, \\mathrm{x}_{2}, \\mathrm{x}_{3}$ and $\\mathrm{x}_{4}$ are particles/radiation emitted by the respective isotopes. The correct option(s) is(are)`
  assert.equal(splitGluedChemDisplayEquations(text), text)
  const card = {
    text,
    options: ['$\\mathrm{x}_{1}$ will deflect towards negatively charged plate', '$\\mathrm{x}_{2}$ is $\\beta^{-}$', '$\\mathrm{x}_{3}$ is $\\gamma$-ray', 'Z is an isotope of uranium'],
    questionType: 'multiple_correct',
  }
  const healed = extendOfficialPyqHealCard(card, `\\item[Q.] 10 ${text}`)
  assert.equal((healed.text.match(/\$\$/g) || []).length, 2, healed.text)
  assert.ok(healed.text.includes('\\mathrm{Th}$$\n$\\mathrm{x}_{1}'), healed.text)
})

test('"…, then" followed by four choices shows no "Extraction incomplete" banner or red "Then" (2020 P2 Q10–12)', () => {
  const stem = 'Starting at time $t=0$ from the origin with speed $1 \\mathrm{~ms}^{-1}$, a particle follows a two-dimensional trajectory in the $x-y$ plane so that its coordinates are related by the equation $y=\\frac{x^{2}}{2}$. The $x$ and $y$ components of its acceleration are denoted by $a_{x}$ and $a_{\\mathrm{y}}$, respectively. Then'
  const options = ['$a_{x}=1 \\mathrm{~ms}^{-2}$ implies $a_{y}=1 \\mathrm{~ms}^{-2}$', '$a_{x}=0$ implies $a_{y}=1 \\mathrm{~ms}^{-2}$ at all times', "at $t=0$, the particle's velocity points in the $x$-direction", '$a_{x}=0$ implies the angle is 45°']
  const shown = sanitizeStemForDisplay(stem, options)
  assert.equal(shownStemLooksIncomplete(shown, options), false)
  assert.deepEqual(reviewMarkSpans(shown, options), [])
  assert.equal(shownStemLooksIncomplete(shown, []), true, 'a lone "Then" with no choices is still torn')
})

test('the next part\'s page heading glued onto option D is cut off (2019 P2 phys Q18)', () => {
  assert.equal(stripTrailingPyqSectionHeader('$\\frac{5}{6} R T_{0}$ JEE (ADVANCED) 2019 PAPER 2 PART-II CHEMISTRY'), '$\\frac{5}{6} R T_{0}$')
  assert.equal(stripTrailingPyqSectionHeader('(IV), (Q)\n\\section*{JEE (ADVANCED) 2019 PAPER 2 PART-III MATHEMATICS}'), '(IV), (Q)')
})

const IMG18 = (y, h, w) =>
  `![](https://cdn.mathpix.com/cropped/8d7e95c4-a2b9-4a3b-9b5f-0e4cf6710a68-20.jpg?height=${h}&width=${w}&top_left_y=${y}&top_left_x=543)`
const CHEM18_Q16 = [
  'Q. 16  The desired product X can be prepared by reacting the major product of the reactions in LIST-I with one or more appropriate reagents in LIST-II.',
  '(given, order of migratory aptitude: aryl > alkyl > hydrogen)',
  '<smiles>CC(C(=O)O)(c1ccccc1)c1ccccc1</smiles>',
  '',
  'LIST-I',
  'LIST-II',
  '\\item[P.]',
  IMG18(775, 156, 459),
  '\\item[Q.]',
  '<smiles>COC(c1ccccc1)C(N)(c1ccccc1)c1ccccc1</smiles>',
  '$+\\mathrm{HNO}_{2}$',
  '\\item[1.] $\\mathbf{I}_{\\mathbf{2}}, \\mathrm{NaOH}$',
  '\\item[2.] $\\left[\\mathrm{Ag}\\left(\\mathrm{NH}_{3}\\right)_{2}\\right] \\mathrm{OH}$',
  '\\item[3.] Fehling solution',
  '\\item[R.]',
  IMG18(1202, 157, 442),
  '\\item[S.]',
  IMG18(1415, 158, 455),
  '\\item[4.] HCHO, NaOH',
  '\\item[5.] NaOBr',
  '\\end{itemize}',
  '',
  'The correct option is',
  '\\begin{itemize}',
  '\\item[(A)] P → 1; Q → 2,3; R → 1,4; S → 2,4',
  '\\item[(B)] P → 1,5; Q → 3,4; R → 4,5; S → 3',
  '\\item[(C)] P → 1,5; Q → 3,4; R → 5; S → 2,4',
  '\\item[(D)] P → 1,5; Q → 2,3; R → 1,5; S → 2,3',
  '\\end{itemize}',
].join('\n')
const CHEM18_Q17 = [
  'Q. 17 LIST-I contains reactions and LIST-II contains major products.',
  '',
  'LIST-I',
  'LIST-II',
  '<smiles>CC(C)(C)[O][Na]</smiles>',
  '<smiles>CC(C)(C)Br</smiles>',
  '$+\\mathrm{HBr} \\longrightarrow$',
  '<smiles>CC(C)(C)O</smiles>',
  '$+\\mathrm{NaOMe} \\longrightarrow$',
  '<smiles>COC(C)(C)C</smiles>',
  '$+\\mathrm{MeBr} \\longrightarrow$',
  '<smiles>C=C(C)C</smiles>',
  '',
  'Match each reaction in LIST-I with one or more products in LIST-II and choose the correct option.',
  '\\begin{itemize}',
  '\\item[(A)] P → 1,5; Q → 2; R → 3; S → 4',
  '\\item[(B)] P → 1,4; Q → 2; R → 4; S → 3',
  '\\item[(C)] P → 1,4; Q → 1,2; R → 3,4; S → 4',
  '\\item[(D)] P → 4,5; Q → 4; R → 4; S → 3,4',
  '\\end{itemize}',
].join('\n')
const CHEM18_Q18 = [
  'Q. 18 Dilution processes of different aqueous solutions, with water, are given in LIST-I. The effects of dilution of the solutions on $\\left[\\mathrm{H}^{+}\\right]$are given in LIST-II.',
  '',
  '\\section*{LIST-I}',
  '\\begin{itemize}',
  '\\item[P.] ( 10 mL of $0.1 \\mathrm{M} \\mathrm{NaOH}+20 \\mathrm{~mL}$ of 0.1 M acetic acid) diluted to 60 mL',
  '\\item[Q.] (20 mL of 0.1 M NaOH + 20 mL of 0.1 M acetic acid) diluted to 80 mL',
  '\\item[R.] (20 mL of 0.1 M HCl + 20 mL of 0.1 M ammonia solution) diluted to 80 mL',
  '\\item[S.] 10 mL saturated solution of $\\mathrm{Ni}(\\mathrm{OH})_{2}$ is diluted to 20 mL',
  '\\end{itemize}',
  '',
  '\\section*{LIST-II}',
  '\\begin{itemize}',
  '\\item[1.] the value of $\\left[\\mathrm{H}^{+}\\right]$does not change on dilution',
  '\\item[2.] the value of [ $\\mathrm{H}^{+}$] changes to half of its initial value on dilution',
  '\\item[3.] the value of $\\left[\\mathrm{H}^{+}\\right]$changes to two times of its initial value on dilution',
  '\\item[4.] the value of $\\left[\\mathrm{H}^{+}\\right]$changes to $\\frac{1}{\\sqrt{2}}$ times of its initial value on dilution',
  '\\item[5.] the value of $\\left[\\mathrm{H}^{+}\\right]$changes to $\\sqrt{2}$ times of its initial value on dilution',
  '\\end{itemize}',
  '',
  'Match each process given in LIST-I with one or more effect(s) in LIST-II. The correct option is',
  '\\begin{itemize}',
  '\\item[(A)] P → 4; Q → 2; R → 3; S → 1',
  '\\item[(B)] P → 4; Q → 3; R → 2; S → 3',
  '\\item[(C)] P → 1; Q → 4; R → 5; S → 3',
  '\\item[(D)] P → 1; Q → 5; R → 4; S → 1',
  '\\end{itemize}',
].join('\n')

test('"\\item[P.]" / "\\item[1.]" labels survive, and a match card whose scan lost its labels is not glued onto the one before (2018 P2 chem Q16–18)', () => {
  const ocr = ['\\section*{JEE (ADVANCED) 2018 PAPER 2 PART-II CHEMISTRY}', CHEM18_Q16, CHEM18_Q17, CHEM18_Q18].join('\n\n')
  const items = paperItemsFromMathpixOcr(ocr)
  const byN = (n) => items.filter((q) => Number(q.printedNumber) === n)
  for (const n of [16, 17, 18]) assert.equal(byN(n).length, 1, `printed ${n}: ${items.map((q) => q.printedNumber).join(',')}`)
  const q16 = byN(16)[0]
  const q18 = byN(18)[0]
  assert.ok(/\(P\)/.test(q16.text) && /\(5\)\s*NaOBr/.test(q16.text), q16.text)
  assert.ok(!/LIST-I contains reactions/.test(q16.text), 'Q17 merged into Q16')
  assert.ok(/\(P\)/.test(q18.text) && /\(1\)/.test(q18.text), q18.text)
  assert.ok(/LIST-I contains reactions/.test(byN(17)[0].text))
  assert.equal(validateMathpixQuestion(q18).issues.some((x) => x.code === 'missing_column'), false)
})

test('a match card whose scan has no (P)/(1) labels at all is flagged; "P." lines and \\textbf{P.} table cells are not (2018 P2 chem Q17, Q18, maths Q18)', () => {
  const choices = ['P → 1,5; Q → 2; R → 3; S → 4', 'P → 1,4; Q → 2; R → 4; S → 3', 'P → 1,4; Q → 1,2; R → 3,4; S → 4', 'P → 4,5; Q → 4; R → 4; S → 3,4']
  const missing = (text) => validateMathpixQuestion({ text, options: choices }).issues.some((x) => x.code === 'missing_column')
  assert.equal(missing('LIST-I contains reactions and LIST-II contains major products.\n\nLIST-I\nLIST-II\n<smiles>CC(C)(C)Br</smiles>\n<smiles>CC(C)(C)O</smiles>\n\nMatch each reaction in LIST-I with one or more products in LIST-II.'), true)
  assert.equal(missing('Let f be given.\n\nLIST-I\nP. The function $f_{1}$ is\nQ. The function $f_{2}$ is\nR. The function $f_{3}$ is\nS. The function $f_{4}$ is\n\nLIST-II\n1. NOT continuous\n(2)\ncontinuous'), false)
  assert.equal(missing('Dilution processes are given in LIST-I.\n\\begin{tabular}{ll}\n\\textbf{LIST--I} & \\textbf{LIST--II} \\\\\n\\textbf{P.} (10 mL) & \\textbf{1.} no change \\\\\n\\textbf{Q.} (20 mL) & \\textbf{2.} half \\\\\n\\textbf{R.} (30 mL) & \\textbf{3.} two times \\\\\n\\textbf{S.} (40 mL) & \\textbf{4.} root two \\\\\n & \\textbf{5.} root half \\\\\n\\end{tabular}'), false)
})

test('List-II printed after the answer choices is found again late in a long paper, for a stem longer than 200 characters (2018 P2 maths Q17)', () => {
  const stem = 'Let $H: \\frac{x^{2}}{a^{2}}-\\frac{y^{2}}{b^{2}}=1$, where $a>b>0$, be a hyperbola in the $x y$-plane whose conjugate axis $L M$ subtends an angle of $60^{0}$ at one of its vertices $N$. Let the area of the triangle $L M N$ be $4 \\sqrt{3}$.'
  const earlierPages = 'The earlier questions of this paper take up this space.\n'.repeat(900)
  const ocr = [
    earlierPages,
    `Q. 17  ${stem}`,
    '\\end{itemize}',
    '',
    '\\section*{LIST-I}',
    '\\begin{itemize}',
    '\\item[P.] The length of the conjugate axis of $H$ is',
    '\\item[Q.] The eccentricity of $H$ is',
    '\\item[R.] The distance between the foci of $H$ is',
    '\\item[S.] The length of the latus rectum of $H$ is',
    '\\end{itemize}',
    '',
    'The correct option is:',
    '\\begin{itemize}',
    '\\item[(A)] P → 4; Q → 2; R → 1; S → 3',
    '\\item[(B)] P → 4; Q → 3; R → 1; S → 2',
    '\\item[(C)] P → 4; Q → 1; R → 3; S → 2',
    '\\item[(D)] P → 3; Q → 4; R → 2; S → 1',
    '\\end{itemize}',
    '',
    '\\section*{LIST-II}',
    '\\begin{itemize}',
    '\\item[1.] 8',
    '\\item[2.] $\\frac{4}{\\sqrt{3}}$',
    '\\item[3.] $\\frac{2}{\\sqrt{3}}$',
    '\\item[4.] 4',
    '\\end{itemize}',
  ].join('\n')
  const text = `${stem}\n\nLIST-I\n\n(P) The length of the conjugate axis of $H$ is\n\n(Q) The eccentricity of $H$ is\n\n(R) The distance between the foci of $H$ is\n\n(S) The length of the latus rectum of $H$ is`
  const options = ['P → 4; Q → 2; R → 1; S → 3', 'P → 4; Q → 3; R → 1; S → 2', 'P → 4; Q → 1; R → 3; S → 2', 'P → 3; Q → 4; R → 2; S → 1']
  const out = restoreMissingListIIFromSource(text, options, ocr)
  assert.ok(/List-II/i.test(out) && out.includes('\\frac{4}{\\sqrt{3}}'), out)
})

test('two questions opening with the same words are each checked against their own scan text (2018 P2 phys Q7 and Q17)', () => {
  const ocr = [
    '\\item[Q.] 7 One mole of a monatomic ideal gas undergoes an adiabatic expansion in which its volume becomes eight times its initial value. If the universal gas constant $R=8.0 ~ J mol^{-1} K^{-1}$, the decrease in its internal energy, in Joule, is ____.',
    '\\item[Q.] 17 One mole of a monatomic ideal gas undergoes four thermodynamic processes as shown schematically in the $P V$-diagram below. Match the processes mentioned in List-I with the corresponding statements in List-II.',
    'LIST-I',
    '\\item[P.] In process I',
    '\\item[Q.] In process II',
  ].join('\n')
  const card = {
    printedNumber: 17,
    questionType: 'single_correct',
    text: 'One mole of a monatomic ideal gas undergoes four thermodynamic processes as shown schematically in the $P V$-diagram below. Match the processes mentioned in List-I with the corresponding statements in List-II.\n(P) In process I\n(Q) In process II',
    options: ['P → 4; Q → 3', 'P → 1; Q → 3', 'P → 3; Q → 4', 'P → 3; Q → 1'],
  }
  const messages = reviewOfficialPyqCards([card], ocr, null, { cardsOnly: true }).messages.join(' ')
  assert.ok(!/8\.0/.test(messages), messages)
})

test('an automatic auto-fix card that still misses a list gives way to a fresh parse that has both lists; a hand edit stays (2018 P2 chem Q16)', () => {
  const crop = 'The desired product X can be prepared by reacting the major product of the reactions in LIST-I with one or more appropriate reagents in LIST-II.\n\\includegraphics{/api/official-pyq/original/crops/x-p20.png}\nThe correct option is'
  const fresh = {
    id: 'c16', pyqSlot: 34, questionNumber: 34, printedNumber: 16, questionType: 'single_correct',
    text: 'The desired product X can be prepared by reacting the major product of the reactions in LIST-I with one or more appropriate reagents in LIST-II.\n\nList-I\n(P) aldehyde\n(Q) amine\n(R) ketone\n(S) ester\n\nList-II\n(1) $\\mathrm{I}_{2}, \\mathrm{NaOH}$\n(2) Tollens\n(3) Fehling solution\n(4) HCHO, NaOH\n(5) NaOBr',
    options: ['P → 1; Q → 2,3', 'P → 1,5; Q → 3,4', 'P → 1,5; Q → 3,4; R → 5', 'P → 1,5; Q → 2,3'],
  }
  const lost = 'The desired product X can be prepared by reacting the major product of the reactions in LIST-I with one or more appropriate reagents in LIST-II.\n\nLIST-I\nLIST-II\n<smiles>CC(C)(C)Br</smiles>\n<smiles>CC(C)(C)O</smiles>\nThe correct option is'
  const auto = { ...fresh, text: lost, adminEdited: true, adminEditedAt: 1, editSource: 'auto_compare' }
  assert.ok(validateMathpixQuestion(auto).issues.some((x) => x.code === 'missing_column'), 'lost-list card should read as missing a list')
  assert.equal(keepAdminEditedCards([fresh], [auto])[0].text, fresh.text)
  assert.equal(copyAnswersOntoCanonical([fresh], [auto])[0].text, fresh.text)
  const byHand = { ...auto, editSource: undefined }
  assert.equal(keepAdminEditedCards([fresh], [byHand])[0].text, lost)
  // The original-page picture of both lists is complete; the auto-fix card keeps it.
  const autoCrop = { ...auto, text: crop }
  assert.equal(validateMathpixQuestion(autoCrop).issues.some((x) => x.code === 'missing_column'), false)
  assert.equal(keepAdminEditedCards([fresh], [autoCrop])[0].text, crop)
})

test('"+ HNO2" after a drawn List-I row stays in that row; one original-page picture of both lists is not row (P) (2018 P2 chem Q16, Q17)', () => {
  const rows = parseMatchingListForDisplay(
    'The desired product X can be prepared from LIST-I with reagents in LIST-II.\n\nList-I\n(P) \\includegraphics{https://cdn.mathpix.com/cropped/a-20.jpg?height=156&width=459&top_left_y=775&top_left_x=543}\n(Q) <smiles>COC(c1ccccc1)C(N)(c1ccccc1)c1ccccc1</smiles>\n$+\\mathrm{HNO}_{2}$\n(R) \\includegraphics{https://cdn.mathpix.com/cropped/a-20.jpg?height=157&width=442&top_left_y=1202&top_left_x=541}\n(S) \\includegraphics{https://cdn.mathpix.com/cropped/a-20.jpg?height=158&width=455&top_left_y=1415&top_left_x=541}\n\nList-II\n(1) $\\mathrm{I}_{2}, \\mathrm{NaOH}$\n(2) Tollens reagent\n(3) Fehling solution\n(4) HCHO, NaOH\n(5) NaOBr',
    ['P → 1; Q → 2,3', 'P → 1,5; Q → 3,4', 'P → 1,5; Q → 3,4; R → 5', 'P → 1,5; Q → 2,3'],
  )
  const q = rows?.listI?.find((r) => r.label === '(Q)')
  assert.ok(q && q.text.includes('\\mathrm{HNO}_{2}'), JSON.stringify(rows?.listI))
  assert.equal(rows.listII.length, 5)
  const whole = parseMatchingListForDisplay(
    'LIST-I contains reactions and LIST-II contains major products.\n\\includegraphics{/api/official-pyq/original/crops/x-p21.png?page=21&x0=0.18&y0=0.11&x1=0.76&y1=0.42}\nMatch each reaction in LIST-I with one or more products in LIST-II and choose the correct option.',
    ['P → 1,5; Q → 2', 'P → 1,4; Q → 2', 'P → 1,4; Q → 1,2', 'P → 4,5; Q → 4'],
  )
  assert.equal(whole, null, JSON.stringify(whole))
})

test('a "LIST--I / LIST--II" table with bold "P." / "1." cells shows both lists and keeps every $ in its own row (2018 P2 maths Q17)', () => {
  const stem =
    'Let $H$ be a hyperbola.\n\n\\begin{tabular}{ll}\n\\textbf{LIST--I} & \\textbf{LIST--II} \\\\\n\\textbf{P.} The length of the conjugate axis of $H$ is & \\textbf{1.} $8$ \\\\\n\\textbf{Q.} The eccentricity of $H$ is & \\textbf{2.} $\\frac{4}{\\sqrt{3}}$ \\\\\n\\textbf{R.} The distance between the foci of $H$ is & \\textbf{3.} $\\frac{2}{\\sqrt{3}}$ \\\\\n\\textbf{S.} The length of the latus rectum of $H$ is & \\textbf{4.} $4$\n\\end{tabular}\n\nThe correct option is:'
  const rows = parseMatchingListForDisplay(sanitizeStemForDisplay(stem), [
    'P → 4; Q → 2; R → 1; S → 3',
    'P → 4; Q → 3; R → 1; S → 2',
    'P → 4; Q → 1; R → 3; S → 2',
    'P → 3; Q → 4; R → 2; S → 1',
  ])
  assert.deepEqual(rows?.listI?.map((r) => r.label), ['(P)', '(Q)', '(R)', '(S)'], JSON.stringify(rows))
  assert.ok(rows.listI[1].text.includes('$H$'), rows.listI[1].text)
  assert.deepEqual(rows.listII.map((r) => r.text), ['$8$', '$\\frac{4}{\\sqrt{3}}$', '$\\frac{2}{\\sqrt{3}}$', '$4$'])
})

test('false alarms on published papers: printed "Answer: [0.7 to 0.8]", "2<P<8" in math and the drawn reaction block (2025 P2 Q9, 2026 P1 Q33, 2025 P1 Q47)', () => {
  const stem = 'Let $y(x)$ be the solution of the differential equation with $y(1)=0$. Then the value of $2 y(e)$ is $____$.'
  const ocr = `\\item[Q.] 9 ${stem.replace('$____$', '\\_\\_\\_\\_')}. Answer: [0.7 to 0.8]\n\\item[Q.] 10 Let $a_{0}, a_{1}$ be real numbers. Then the value of $r$ is \\_\\_\\_\\_. Answer: 6\n${'Filler line for the scan length.\n'.repeat(4)}`
  const card = { text: stem, options: ['', '', '', ''], questionType: 'numerical', subject: 'mathematics' }
  const messages = reviewOfficialPyqCards([card], ocr, null, { cardsOnly: true }).messages.join(' ')
  assert.ok(!/0\.7|0\.8/.test(messages), messages)
  assert.equal(mathDrawFailure('the gas is compressed against $P$ bar $(2<P<8)$ and then 8 bar'), '')
  assert.equal(
    mathDrawFailure('Toluene <div class="reaction-align" style="display:flex"><span style="white-space:nowrap">A</span><span>B<br>C</span></div> gives (2)'),
    '',
  )
  assert.equal(mathDrawFailure('a stray <div class="x">table</div> left by the scan'), 'raw HTML')
})

test('Compare\'s original-page picture of both lists is not "missing List-I"; bare "P." / "1." rows parse; an approved card without an id is published as saved (2018 P2 Q34, Q35, Q54)', () => {
  const crop = '\\includegraphics{/api/official-pyq/original/crops/x-p20-927cb0f4.png?page=20&x0=0.18&y0=0.14&x1=0.70&y1=0.57}'
  const options = ['$\\mathbf{P} \\rightarrow 1 ; \\mathbf{Q} \\rightarrow 2,3$', '$\\mathbf{P} \\rightarrow 1,5 ; \\mathbf{Q} \\rightarrow 3,4$', '$\\mathbf{P} \\rightarrow 1,5 ; \\mathbf{Q} \\rightarrow 3,4$ ; R → 5', '$\\mathbf{P} \\rightarrow 1,5 ; \\mathbf{Q} \\rightarrow 2,3$']
  const card = {
    text: `The desired product X can be prepared by reacting the major product of the reactions in LIST-I with one or more appropriate reagents in LIST-II.\n${crop}\nThe correct option is`,
    options,
    questionType: 'single_correct',
  }
  assert.equal(validateMathpixQuestion(card).issues.some((x) => x.code === 'missing_column'), false)
  assert.equal(matchQuestionMissingListI(card), false)
  assert.equal(parseMatchingListForDisplay(card.text, card.options), null, '"$\\mathbf{P} \\rightarrow 1$" choices are not List-I rows; the picture stays')
  const matchCard = {
    text: `LIST-I contains reactions and LIST-II contains major products.\n${crop}\nMatch each reaction in LIST-I with one or more products in LIST-II and choose the correct option.`,
    options: ['P → 1,5; Q → 2; R → 3; S → 4', 'P → 1,4; Q → 2; R → 4; S → 3', 'P → 1,4; Q → 1,2; R → 3,4; S → 4', 'P → 4,5; Q → 4; R → 4; S → 3,4'],
    questionType: 'single_correct',
  }
  assert.equal(matchQuestionMissingListI(matchCard), false)
  assert.equal(matchQuestionMissingListI({ ...matchCard, text: matchCard.text.replace(crop, '') }), true, 'without the picture it is still flagged')

  const bare = 'Let f be given.\n\nLIST-I\nP. The function $f_{1}$ is\nQ. The function $f_{2}$ is\nR. The function $f_{3}$ is\nS. The function $f_{4}$ is\n\nLIST-II\n1. NOT continuous at $x=0$\n\n(2)\ncontinuous at $x=0$\n\n(3)\ndifferentiable at $x=0$\n\n(4)\nits derivative is continuous at $x=0$'
  const rows = parseMatchingListForDisplay(bare, ['P → 2; Q → 3; R → 1; S → 4', 'P → 4; Q → 1; R → 2; S → 3'])
  assert.deepEqual([rows?.listI?.length, rows?.listII?.length], [4, 4], JSON.stringify(rows))
  assert.equal(rows.listII[1].text, 'continuous at $x=0$')

  const approvedCard = { text: `LIST-I contains reactions.\n${crop}`, pyqSlot: 35, questionNumber: 35, subject: 'chemistry', adminApproved: true }
  const healedCard = { text: 'LIST-I contains reactions.\n\nLIST-I\nLIST-II\n<smiles>CC</smiles>', pyqSlot: 35, questionNumber: 35, subject: 'chemistry' }
  const other = { text: 'Q36', pyqSlot: 36, questionNumber: 36, subject: 'chemistry' }
  const kept = keepApprovedOfficialPyqCards({ questions: [approvedCard, other] }, [healedCard, other])
  assert.equal(kept[0], approvedCard)
  assert.equal(kept[1], other)
})

test('2017 answer-key layout: printed answer boxes never reach a card; the key, facts, subjects, three-column tables and a nine-molecule integer question come through (JEE Adv 2017 P1)', () => {
  const raw = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'fixtures', 'jee-advanced-2017-p1-mathpix.txt'), 'utf8')
  const meta = { exam: 'jee-advanced', year: 2017, session: 'Paper 1', paperLabel: 'JEE Advanced 2017', sourceLabel: 'Official JEE Advanced archive' }

  const facts = buildPaperFacts(raw)
  assert.equal(facts.known, true, facts.notes.join(' | '))
  assert.equal(facts.expectedQuestionCount, 54)
  assert.deepEqual(facts.sections.slice(0, 3).map((s) => `${s.count}:${s.type}`), ['7:multiple_correct', '5:integer', '6:single_correct'])

  const built = questionsFromOfficialPyqExtract({ engine: 'mathpix', text: raw, questions: [] }, meta)
  const qs = built.questions
  assert.equal(qs.length, 54)
  for (const q of qs) {
    const blob = JSON.stringify([q.text, q.options, q.passageText])
    assert.ok(!/Ans\s+for\s+Q|Answers?\s+for\s+the\s+above/i.test(blob), `Q${q.pyqSlot} carries a printed answer box`)
    assert.ok(!/\\(?:begin|end)\{table\}|rough work/i.test(String(q.passageText ?? '')), `Q${q.pyqSlot} table keeps its wrapper`)
    assert.ok(!/\\(?:begin|end)\{table\}/.test(JSON.stringify([q.text, q.options])), `Q${q.pyqSlot} card carries a table wrapper`)
  }
  const at = (n) => qs.find((q) => Number(q.printedNumber ?? q.pyqSlot) === n)
  assert.deepEqual(at(1).correctIndices, [0, 1, 3])
  assert.deepEqual(at(4).correctIndices, [2], 'a one-letter answer on a multi-correct card is still a correctIndices list')
  assert.equal(at(8).correctInteger, 6)
  assert.equal(at(13).correctIndex, 3)
  for (const bonus of [29, 39]) {
    const q = at(bonus)
    assert.equal(q.answerSource, 'unknown', `Q${bonus} has no printed answer (marks to all)`)
    assert.ok(q.correctIndex == null && !q.correctIndices?.length && q.correctInteger == null, `Q${bonus} got a guessed answer`)
  }
  const q30 = at(30)
  assert.equal(q30.questionType, 'integer')
  assert.equal((q30.text.match(/<smiles>/g) || []).length, 9, 'all nine structures stay in the question')
  assert.equal(q30.correctInteger, 5)
  qs.forEach((q, i) => assert.equal(q.subject, i < 18 ? 'physics' : i < 36 ? 'chemistry' : 'mathematics', `Q${i + 1} subject`))
  for (const n of [13, 14, 15, 16, 17, 18, 31, 32, 33, 34, 35, 36, 49, 50, 51, 52, 53, 54]) {
    assert.match(String(at(n).passageText ?? ''), /Column 1/, `Q${n} lost its three-column table`)
  }

  const stored = built.preparedText
  assert.ok(!/Ans\s+for\s+Q/i.test(sanitizeMathpixOcrText(stored)), 'the cleaner removes the stored key before any split reads it')
  const again = questionsFromOfficialPyqExtract({ engine: 'builtin', text: sanitizeMathpixOcrText(stored), questions: [] }, meta, {
    printedAnswerKey: readPrintedAnswerKey(stored),
  })
  assert.deepEqual(
    again.questions.map((q) => [q.correctIndex, q.correctIndices, q.correctInteger]),
    qs.map((q) => [q.correctIndex, q.correctIndices, q.correctInteger]),
    're-parse of the stored text keeps the printed answers',
  )
})

test('2017 "[A] text" choices keep one letter, and the three-column match tables draw one aligned row per (I)/(i)/(P) (JEE Adv 2017 P1)', () => {
  const raw = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'fixtures', 'jee-advanced-2017-p1-mathpix.txt'), 'utf8')
  const meta = { exam: 'jee-advanced', year: 2017, session: 'Paper 1', paperLabel: 'JEE Advanced 2017', sourceLabel: 'Official JEE Advanced archive' }
  const qs = questionsFromOfficialPyqExtract({ engine: 'mathpix', text: raw, questions: [] }, meta).questions
  assert.equal(qs.length, 54)
  for (const q of qs) {
    ;(q.options || []).forEach((opt, i) => {
      const letter = 'ABCD'[i]
      assert.ok(
        !new RegExp(`^\\s*(?:\\[\\s*${letter}\\s*\\]|\\(\\s*${letter}\\s*\\)|${letter}\\s*[.:)])`).test(String(opt ?? '')),
        `Q${q.pyqSlot} option ${letter} still starts with its own label: ${String(opt).slice(0, 40)}`,
      )
    })
  }
  assert.match(qs[0].options[0], /^The pressure difference/)

  const tableOf = (passage) => {
    const s = String(passage ?? '')
    const at = s.indexOf('\\begin{tabular}')
    const end = s.lastIndexOf('\\end{tabular}')
    assert.ok(at >= 0 && end > at, 'passage keeps its table')
    return matchColumnTableLayout(s.slice(at, end).replace(/^\\begin\{tabular\}(?:\[[^\]]*\])?(?:\{[^}]*\})?/, ''))
  }
  for (const n of [13, 16, 31, 34, 49, 52]) {
    const q = qs[n - 1]
    const layout = tableOf(q.passageText)
    assert.ok(layout, `Q${n} table is not read as a three-column match table`)
    assert.deepEqual(layout.header, ['Column 1', 'Column 2', 'Column 3'], `Q${n} header`)
    assert.equal(layout.rows.length, 4, `Q${n} rows`)
    layout.rows.forEach((cells, r) => {
      assert.equal(cells.length, 3, `Q${n} row ${r + 1} has ${cells.length} cells`)
      assert.match(cells[0], new RegExp(`^\\(${['I', 'II', 'III', 'IV'][r]}\\)`), `Q${n} row ${r + 1} column 1`)
      assert.match(cells[1], new RegExp(`^\\(${['i', 'ii', 'iii', 'iv'][r]}\\)`), `Q${n} row ${r + 1} column 2`)
      assert.match(cells[2], new RegExp(`^\\(${'PQRS'[r]}\\)`), `Q${n} row ${r + 1} column 3`)
    })
    const parts = splitMatchColumnTables(q.passageText)
    const html = parts?.find((p) => p.kind === 'html')?.value ?? ''
    assert.ok(html, `Q${n} table is not drawn`)
    assert.ok(!/\\(?:begin|end|hline|frac|vec)\b|\$/.test(html), `Q${n} drawn table shows TeX source`)
  }
  assert.match(tableOf(qs[12].passageText).rows[0][0], /\$\\vec\{v\}=2 \\frac\{E_\{0\}\}\{B_\{0\}\}/, 'Column 1 math keeps its dollars')
  assert.equal(tableOf(qs[12].passageText).intro.length, 1, 'the spanning lead-in row stays above the header')
  assert.ok(tableOf(qs[15].passageText).rows.every((cells) => /!\[\]\(https:\/\/cdn\.mathpix\.com/.test(cells[2])), 'P-V pictures stay in column 3')

  const split = matchColumnTableLayout(String.raw`\hline
\multicolumn{2}{|c|}{\textbf{Column 1}} & \multicolumn{2}{c|}{\textbf{Column 2}} & \multicolumn{2}{c|}{\textbf{Column 3}} \\
\hline
(I) & Electron with $\vec{v} = 2\frac{E_0}{B_0} \hat{x}$ & (i) & $\vec{E} = E_0\hat{z}$ & (P) & $\vec{B} = -B_0\hat{x}$ \\
(II) & Electron with $\vec{v} = \frac{E_0}{B_0} \hat{y}$ & (ii) & $\vec{E} = -E_0\hat{y}$ & (Q) & $\vec{B} = B_0\hat{x}$ \\
\hline`)
  assert.deepEqual(split.rows.map((cells) => cells.length), [3, 3], 'a label in its own cell joins its item')
  assert.match(split.rows[0][1], /^\(i\) \$\\vec\{E\}/)
})

test('a card with no read answer gets none (no default "A" marked as from the paper)', () => {
  const [q] = parsedBulkToPyqItems([{ text: 'A question whose answer the scan does not print.', options: ['1', '2', '3', '4'] }], { pyqYear: 2017, examPatternId: 'jee-advanced' }, 0)
  assert.equal(q.correctIndex, undefined)
  assert.notEqual(enrichParsedWithAnswerProvenance(q, q.text).answerSource, 'from_paper')
})

test('upload stops at the split: no AI tags, answers, or solutions; printed answers stay', () => {
  const stemA = 'If $3 x+2=11$, then the value of $x$ is equal to which one of the following numbers?'
  const stemB = 'The number of real roots of the equation $x^{2}+4 x+5=0$ is equal to which value below?'
  const stemC = 'The derivative of $\\sin x$ with respect to $x$ at $x=0$ is equal to which value below?'
  const built = questionsFromOfficialPyqExtract(
    {
      engine: 'cloud-vision',
      text: '',
      questions: [
        { number: 1, text: stemA, options: ['$1$', '$2$', '$3$', '$4$'], correctIndex: 2, answerKeyVisible: true, chapter: 'Algebra', topic: 'Linear equations', toughness: 3, solution: 'Subtract 2 and divide by 3, so $x=3$.' },
        { number: 2, text: stemB, options: ['$0$', '$1$', '$2$', '$3$'], correctIndex: 0, chapter: 'Quadratic Equations', toughness: 6, solution: 'The discriminant is negative.' },
        { number: 3, text: stemC, options: ['$0$', '$1$', '$-1$', '$2$'], correctIndex: 1, answerSource: 'from_paper', solution: 'Printed: $\\cos 0=1$.', solutionSource: 'from_paper', chapter: 'Differentiation' },
      ],
    },
    { exam: 'jee-main', year: 2024, session: 'January', paperLabel: 'JEE Main 2024 split-only check', sourceLabel: 'test' },
  )
  const [a, b, c] = built.questions
  assert.equal(built.questions.length, 3, built.rejected.join('; '))
  for (const q of built.questions) {
    assert.equal(q.chapter, 'General', `Q${q.pyqSlot} chapter is a Hybrid AI job after approval`)
    assert.equal(q.topic, undefined)
    assert.equal(q.toughnessLevel, undefined)
  }
  assert.equal(a.correctIndex, 2, 'an answer key printed on the paper stays')
  assert.equal(a.solution, undefined)
  assert.equal(b.correctIndex, undefined, 'a guessed answer is not kept at upload')
  assert.equal(b.solution, undefined)
  assert.equal(c.correctIndex, 1)
  assert.match(String(c.solution), /Printed/)

  const plain = { text: 'What is 2+3?', options: ['4', '5', '6', '7'] }
  const plainBlock = 'What is 2+3?\n(A) 4\n(B) 5\n(C) 6\n(D) 7'
  assert.equal(enrichParsedWithAnswerProvenance({ ...plain }, plainBlock).answerSource, 'ai_generated', 'the local solver would answer this one')
  const paperOnly = enrichParsedWithAnswerProvenance({ ...plain }, plainBlock, { paperOnly: true })
  assert.equal(paperOnly.correctIndex, undefined, 'upload does not solve')
  assert.equal(paperOnly.solution, undefined, 'upload does not draft a solution')
  assert.equal(paperOnly.answerSource, 'unknown')
  const printed = enrichParsedWithAnswerProvenance({ ...plain }, `${plainBlock}\nAnswer: B`, { paperOnly: true })
  assert.equal(printed.correctIndex, 1)
  assert.equal(printed.answerSource, 'from_paper')

  const importSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/officialPyqImportFile.js'), 'utf8')
  assert.match(importSrc, /enrichParsedWithAnswerProvenance\(q, q\.text, \{ paperOnly: true \}\)/)
  assert.doesNotMatch(importSrc, /fillOfficialPyq|enrichQuestionsLightClient/)
  const extractSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/pyqGeminiExtract.js'), 'utf8')
  assert.doesNotMatch(extractSrc, /tags, answers, solutions…/)
  const pageSrc = fs.readFileSync(path.join(process.cwd(), 'src/pages/OfficialPyqPending.jsx'), 'utf8')
  assert.doesNotMatch(pageSrc, /fillOfficialPyq(?:Approved|Pending)PaperPartByPart|fillOfficialPyqTags/, 'the page never starts Hybrid AI on its own')
})

test('2017 P2 layout: a number glued inside the formula ("Q. $51|…"), clause options, either-or keys, review notes and a picture option split right (JEE Adv 2017 P2)', () => {
  const raw = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'fixtures', 'jee-advanced-2017-p2-mathpix.txt'), 'utf8')
  const meta = { exam: 'jee-advanced', year: 2017, session: 'Paper 2', paperLabel: 'JEE Advanced 2017', sourceLabel: 'Official JEE Advanced archive' }

  const facts = buildPaperFacts(raw)
  assert.equal(facts.known, true, facts.notes.join(' | '))
  assert.equal(facts.expectedQuestionCount, 54, '"Based on each paragraph, there are TWO questions" is read')
  assert.equal(inferOcrQuestionCount(raw), 54, '"Q.44: Due to internal review…" notes are not counted as questions')

  const built = questionsFromOfficialPyqExtract({ engine: 'mathpix', text: raw, questions: [] }, meta)
  const qs = built.questions
  assert.equal(qs.length, 54)
  assert.equal(built.summary?.expected, 54)
  qs.forEach((q, i) => assert.equal(q.subject, i < 18 ? 'physics' : i < 36 ? 'chemistry' : 'mathematics', `Q${i + 1} subject`))
  const at = (n) => qs.find((q) => Number(q.printedNumber ?? q.pyqSlot) === n)

  const q51 = at(51)
  assert.match(q51.text, /\\overrightarrow\{O X\} \\times \\overrightarrow\{O Y\}/, 'Q51 is its own card')
  assert.deepEqual(q51.options, ['$\\sin (P+Q)$', '$\\sin 2 R$', '$\\sin (P+R)$', '$\\sin (Q+R)$'])
  assert.equal(q51.correctIndex, 0)
  assert.match(at(52).text, /minimum value of/)
  assert.deepEqual(at(52).options.map((o) => o.trim()), ['$-\\frac{5}{3}$', '$-\\frac{3}{2}$', '$\\frac{3}{2}$', '$\\frac{5}{3}$'])
  assert.match(at(50).text, /\\sum_\{k=1\}\^\{98\}/)
  assert.match(at(50).options[3], /49\}\{50\}/, 'Q50 does not swallow Q51')

  assert.deepEqual(at(46).options, [
    '$f(x)$ is increasing in $(0, \\infty)$',
    '$f(x)$ is decreasing in $(0, \\infty)$',
    '$f(x)>e^{2 x}$ in $(0, \\infty)$',
    "$f'(x)<e^{2 x}$ in $(0, \\infty)$",
  ])
  assert.deepEqual(at(46).correctIndices, [0, 2])

  const q24 = at(24)
  assert.match(q24.options[1], /^(?:\\includegraphics\{|!\[\]\()https:\/\/cdn\.mathpix\.com\/[^\s]*top_left_y=1075/, 'Q24 option B is its picture')
  assert.match(q24.options[2], /Oc1ccc2nnc3ccccc3c2c1/)
  assert.equal(q24.correctIndex, 2)

  assert.deepEqual(at(3).correctIndex, 3, 'two answer boxes on one line both read')
  assert.deepEqual(at(4).correctIndex, 0)
  assert.deepEqual(at(31).correctIndices, [0, 3])
  assert.match(at(31).options[3], /ZnO/)
  for (const n of [14, 29, 17, 44, 45]) {
    const q = at(n)
    assert.equal(q.answerSource, 'unknown', `Q${n} has no single printed answer`)
    assert.ok(q.correctIndex == null && !q.correctIndices?.length, `Q${n} got a guessed answer`)
  }
  assert.equal(qs.filter((q) => q.answerSource === 'from_paper').length, 49)
  for (const q of qs) {
    const opts = (q.options || []).map((o) => String(o).trim())
    assert.equal(opts.filter(Boolean).length, 4, `Q${q.pyqSlot} is missing an option`)
    assert.equal(new Set(opts).size, 4, `Q${q.pyqSlot} has two options the same`)
    const blob = JSON.stringify([q.text, q.options, q.passageText])
    assert.ok(!/Ans\s+for\s+Q|internal\s+review|awarded|\}\$?\s+or\s+\$?\\\\\{/i.test(blob), `Q${q.pyqSlot} carries answer-box text`)
  }

  const stored = built.preparedText
  assert.equal(inferOcrQuestionCount(stored), 54)
  const again = questionsFromOfficialPyqExtract({ engine: 'builtin', text: sanitizeMathpixOcrText(stored), questions: [] }, meta, {
    printedAnswerKey: readPrintedAnswerKey(stored),
  })
  assert.equal(again.questions.length, 54, 're-parse of the stored text keeps Q51')
  assert.deepEqual(
    again.questions.map((q) => [q.correctIndex, q.correctIndices]),
    qs.map((q) => [q.correctIndex, q.correctIndices]),
    're-parse of the stored text keeps the printed answers',
  )

  // Text stored by the older cleaner: "Ans for Q.14:" gone, the "\{…\} or \{…\}" half left behind.
  const oldStored = raw.replace(/Ans for Q\.(?:14|29):\s*/g, '')
  const fromOld = paperItemsFromMathpixOcr(sanitizeMathpixOcrText(oldStored), { paperMeta: meta })
  assert.equal(fromOld.length, 54)
  for (const q of fromOld) {
    const blob = JSON.stringify([q.text, q.options])
    assert.ok(!/\}\$?\s+or\s+\$?\\\\\{/.test(blob), `Q${q.pyqSlot ?? q.printedNumber} carries an old either-or box`)
  }
  assert.match(String(fromOld[30].options?.[3] ?? ''), /ZnO/, 'Q31 keeps its own options')
})

test('an upload lost to a dropped internet connection says so in plain words, never a bare "fetch failed" (2017 P2)', () => {
  for (const raw of ['fetch failed', 'Fetch failed.', 'socket hang up', 'connect ETIMEDOUT 104.18.1.1:443', 'getaddrinfo ENOTFOUND api.mathpix.com']) {
    const shown = formatOfficialPyqUploadError(new Error(raw))
    assert.notEqual(shown, raw, raw)
    assert.match(shown, /nothing was saved/i, raw)
    assert.match(shown, /not in Pending approval/, raw)
    assert.match(shown, /upload the file again/, raw)
  }
  const server = Object.assign(new Error('The internet connection to Mathpix dropped. Nothing was saved.'), { code: 'MATHPIX_NETWORK' })
  assert.equal(formatOfficialPyqUploadError(server), server.message)
  assert.match(formatOfficialPyqUploadError(new TypeError('Failed to fetch')), /port 3001/, 'the browser losing our own API keeps its own advice')

  const mathpixSrc = fs.readFileSync(path.join(process.cwd(), 'server/mathpix.js'), 'utf8')
  assert.match(mathpixSrc, /pollPdfUntilReady[\s\S]*withNetworkRetry/, 'waiting on Mathpix survives a short drop')
  assert.match(mathpixSrc, /reusableMathpixPdfJob\(fileHash/, 'the same PDF uploaded again reuses the finished Mathpix read')
})

const p2Upload = await (async () => {
  const raw = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'fixtures', 'jee-advanced-2017-p2-mathpix.txt'), 'utf8')
  const realFetch = globalThis.fetch
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  globalThis.fetch = async (url) => {
    const u = String(url)
    if (u.endsWith('/mathpix/status')) return json({ configured: true, ready: true })
    if (u.endsWith('/mathpix/extract')) return json({ text: raw, format: 'word' })
    return json({ error: 'No cloud calls in this test.' }, 503)
  }
  try {
    const { runMathpixThenGemini } = await import('../src/utils/mathpixGeminiPipeline.js')
    const meta = { exam: 'jee-advanced', year: 2017, session: 'Paper 2', paperLabel: 'JEE Advanced 2017' }
    const file = new File([new Uint8Array([37, 80, 68, 70])], '2017_2.pdf', { type: 'application/pdf' })
    const result = await runMathpixThenGemini(file, { officialPyq: true, saveToBank: false, format: 'word', paperMeta: meta })
    return { raw, result }
  } catch (err) {
    return err
  } finally {
    globalThis.fetch = realFetch
  }
})()

test('an upload keeps the answers printed on the paper: the key is read from the raw OCR before cleaning cuts it out (JEE Adv 2017 P2)', () => {
  if (p2Upload instanceof Error) throw p2Upload
  const { raw, result } = p2Upload
  assert.match(raw, /Ans for Q\.3:/, 'the raw OCR has the printed boxes')
  assert.doesNotMatch(String(result.text), /Ans\s+for\s+Q/i, 'the cleaned text has none')
  assert.ok(result.printedAnswerKey instanceof Map, 'the upload result carries the key read before cleaning')
  assert.equal(result.printedAnswerKey.size, 49)

  // extractMcqFromImage → extractPyqFileWithGemini → importFileToPending hand the key on unchanged.
  const docSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/extractDocument.js'), 'utf8')
  assert.match(docSrc, /printedAnswerKey: result\.printedAnswerKey/)
  const extractSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/pyqGeminiExtract.js'), 'utf8')
  assert.match(extractSrc, /printedAnswerKey: extracted\.printedAnswerKey/)
  const extracted = {
    engine: 'mathpix',
    text: result.text,
    questions: result.questions,
    printedAnswerKey: result.printedAnswerKey,
    localOcrText: result.text,
    pdfText: result.text,
    visionText: result.text,
  }
  const meta = { exam: 'jee-advanced', year: 2017, session: 'Paper 2', paperLabel: 'JEE Advanced 2017', sourceLabel: 'Official JEE Advanced archive' }
  const built = questionsFromOfficialPyqExtract(extracted, meta)
  const questions = built.questions.map((q) => {
    const enriched = enrichParsedWithAnswerProvenance(q, q.text, { paperOnly: true })
    return { ...enriched, answerSource: enriched.answerSource || 'unknown' }
  })
  localStorage.clear()
  const paper = importQuestionsToOfficialPyqPending({ ...meta, preparedText: built.preparedText, questions })
  const cards = paper.questions
  assert.equal(cards.length, 54)
  assert.equal(paper.status, 'pending_review')
  const fromPaper = cards.filter((q) => q.answerSource === 'from_paper')
  assert.equal(fromPaper.length, 49, 'every printed answer sits in its card')
  assert.equal(cards[2].correctIndex, 3, 'Q3 (D)')
  assert.equal(cards[3].correctIndex, 0, 'Q4 (A)')
  assert.deepEqual(cards[30].correctIndices, [0, 3], 'Q31 (A) and (D)')
  assert.equal(cards[50].correctIndex, 0, 'Q51 (A)')
  for (const n of [14, 17, 29, 44, 45]) {
    const q = cards[n - 1]
    assert.equal(q.answerSource, 'unknown', `Q${n} has no single printed answer`)
    assert.ok(q.correctIndex == null && !q.correctIndices?.length && q.correctInteger == null, `Q${n} stays empty`)
  }
  for (const q of cards) {
    assert.doesNotMatch(JSON.stringify([q.text, q.options, q.passageText]), /Ans\s+for\s+Q/i, `Q${q.pyqSlot} shows no answer box`)
  }
  assert.match(String(paper.preparedText), /Ans for Q\.3: \(D\)/, 'the key is stored with the paper so a re-parse keeps it')
  localStorage.clear()
})
if (failed) {
  console.error(`\n${failed} recurrence test(s) failed`)
  process.exit(1)
}
console.log('\nOfficial PYQ recurrence tests passed')
process.exit(0)
