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

const { paperItemsFromMathpixOcr, restoreGluedQuestionNumbers } = await import('../src/utils/mathpixQuestionSplit.js')
const { mathDrawFailure } = await import('../src/utils/mathDrawCheck.js')
const { prepareTextForMathTextDisplay } = await import('../src/utils/prepareMathForRender.js')
const { stripImageWatermarkOcr } = await import('../src/utils/stripImageWatermarkOcr.js')
const { stripStrayMathDelimiters } = await import('../src/utils/wrapBareLatexRuns.js')
const { reviewOfficialPyqCards } = await import('../src/utils/officialPyqUnifiedCheck.js')
const { healUploadQuestionCard } = await import('../src/utils/uploadQualityGuards.js')
const { looksLikeMatchingListStem, parseMatchingListForDisplay } = await import('../src/utils/parseMatchingListDisplay.js')
const { validateMathpixQuestion } = await import('../src/utils/mathpixCleanPipeline.js')
const { officialPyqDrawnRawCode, officialPyqDrawnText } = await import('../src/utils/officialPyqOriginalCompare.js')

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

if (failed) {
  console.error(`\n${failed} recurrence test(s) failed`)
  process.exit(1)
}
console.log('\nOfficial PYQ recurrence tests passed')
process.exit(0)
