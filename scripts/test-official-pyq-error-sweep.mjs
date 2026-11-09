/**
 * Every error class an Official PYQ upload has shown is flagged by the local quality check and,
 * where the scan settles it, repaired by auto-fix so the paper passes:
 *   math that does not draw ("$\beta^{-}$-decay", "9~\mu\mathrm{C}" — 2016 P1 Q25, 2025 P2 Q23);
 *   the printed marker left in front of the text ("Q. 12 Choose", "3 As shown" — 2019 P1 Q30, 2025 P2 Q19);
 *   the card's own options repeated in the stem ("[A] … [D]" — 2017 P2 Q48);
 *   answer choices in the stem while the option boxes hold the drawings (2017 P2 Q25);
 *   two options glued into one box (2016 P2 Q5) and an MCQ with an option missing;
 *   a first word the scan printed in lower case ("light of wavelength" — 2016 P2 Q8);
 *   "Space for rough work" glued to an option or the stem (2016 P2 Q27, 2017 P1 Q10);
 *   a picture shown twice (2026 P1 Q31) and "equal$s_$" for "equals ____" (2019 P2 Q45);
 *   a tabular List-II copied again from the scan with "PART-2 CHEMISTRY" (2014 P2 Q20);
 *   a figure caption "(A)" for "Figure (a)" that reads like an option letter (2022 P1 Q27);
 *   options printed as one $$\begin{array}$$ row (2025 P2 Q19), a piecewise "\right." left after
 *   cases (2015 P1 Q46) and a "$" after an English ")" taken as stray (2016 P1 Q40).
 */
import assert from 'node:assert/strict'

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    get length() {
      return store.size
    },
    key: (i) => [...store.keys()][i] ?? null,
  }
}
if (typeof globalThis.sessionStorage === 'undefined') {
  globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} }
}
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis

const { localOfficialPyqQualityCheck, repairOfficialPyqUntilQuality } = await import('../src/utils/officialPyqLocalQuality.js')
const { officialPyqDrawnProblems } = await import('../src/utils/officialPyqDrawnCheck.js')
const { officialPyqAlertGoTo } = await import('../src/utils/officialPyqAutoFix.js')
const tidy = await import('../src/utils/officialPyqCardTidy.js')
const { officialPyqCompareCardKey } = await import('../src/utils/officialPyqCompareFreshness.js')
const { peelGluedMcqOptions } = await import('../src/utils/peelGluedMcqOptions.js')
const { sanitizeStemForDisplay } = await import('../src/utils/sanitizeStemForDisplay.js')
const { parseMatchingListForDisplay } = await import('../src/utils/parseMatchingListDisplay.js')
const { healUploadQuestionCard } = await import('../src/utils/uploadQualityGuards.js')
const { paperItemsFromMathpixOcr } = await import('../src/utils/mathpixQuestionSplit.js')

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

const mcq = (text, options, extra = {}) => ({ questionType: 'single_correct', subject: 'physics', text, options, printedNumber: 1, ...extra })
const PIC = (y) => `\\includegraphics{https://cdn.mathpix.com/cropped/abc-23.jpg?height=270&width=420&top_left_y=${y}&top_left_x=1240}`

/** The card is flagged before auto-fix and passes after it; returns the repaired card. */
function flaggedThenFixed(card, ocr, reason) {
  const check = localOfficialPyqQualityCheck({ questions: [card], preparedText: ocr })
  assert.deepEqual(check.failedGoTo, [1], `flagged: ${check.lines.join(' | ')}`)
  if (reason) assert.match(check.lines.join(' | '), reason)
  const fixed = repairOfficialPyqUntilQuality({ questions: [card], preparedText: ocr })
  assert.deepEqual(fixed.quality.failedGoTo, [], `still flagged after auto-fix: ${fixed.quality.lines.join(' | ')}`)
  return fixed.paper.questions[0]
}

test('"$\\beta^{-}$-decay" and "9~\\mu\\mathrm{C}" draw on the card', () => {
  assert.deepEqual(officialPyqDrawnProblems(mcq('Decay mode', ['$\\beta^{-}$-decay ($\\beta$ emission)', 'orbital or $K$-electron capture', 'neutron emission', '$\\beta^{+}$-decay (positron emission)'])), [])
  assert.deepEqual(officialPyqDrawnProblems(mcq('If $\\sigma_{0}=9~\\mu\\mathrm{C} / \\mathrm{m}^{2}$, then the field is', ['1', '2', '3', '4'])), [])
})

test('math that does not draw fails the quality check, the same as the alert list', () => {
  const card = mcq('A block of mass $m$ slides down an incline. The value of $\\frac{1}{2 is', ['$1$', '$2$', '$3$', '$4$'])
  const check = localOfficialPyqQualityCheck({ questions: [card], preparedText: '' })
  assert.deepEqual(check.failedGoTo, [1], check.lines.join(' | '))
  assert.deepEqual(officialPyqAlertGoTo({ questions: [card], localQuality: check }), [1])
})

test('"Q. 12" / "3 " printed marker in front of the text is flagged and removed', () => {
  const ocr = '\\item[Q.] 12 Choose the correct option(s) for the following set of reactions\n\\item[Q.] 3 As shown in the figures, a uniform rod is hinged at one end.'
  const q12 = flaggedThenFixed(
    mcq('Q. 12 Choose the correct option(s) for the following set of reactions', ['alpha', 'beta', 'gamma', 'delta'], { printedNumber: 12, questionType: 'multiple_correct' }),
    ocr,
    /starts with its printed question number/,
  )
  assert.match(q12.text, /^Choose the correct option/)
  const q3 = flaggedThenFixed(
    mcq(`3 As shown in the figures, a uniform rod is hinged at one end.\n${PIC(900)}`, ['$2$', '$\\sqrt{2}$', '$\\sqrt{3}$', '$1$'], { printedNumber: 3 }),
    ocr,
  )
  assert.match(q3.text, /^As shown in the figures/)
  const real = mcq('3 moles of an ideal gas expand isothermally at 300 K. The work done is', ['1', '2', '3', '4'], { printedNumber: 3 })
  assert.equal(tidy.stemWithoutPrintedNumber(real, '\\item[Q.] 3 Three moles of an ideal gas'), '', 'a number that is not the scan marker stays')
})

test("the card's own options repeated as [A] … [D] lines in the stem are removed", () => {
  const options = ['$f^{\\prime}(x)=0$ at exactly three points', '$f^{\\prime}(x)=0$ at more than three points', '$f(x)$ attains its maximum at $x=0$', '$f(x)$ attains its minimum at $x=0$']
  const text = `If $f(x)=\\sin x$, then\n\n${options.map((o, i) => `[${'ABCD'[i]}] ${o}`).join('\n')}`
  const fixed = flaggedThenFixed(mcq(text, options, { questionType: 'multiple_correct' }), '', /options are repeated inside the question text/)
  assert.equal(fixed.text, 'If $f(x)=\\sin x$, then')
})

test('answer choices left in the stem while the options hold the drawings I–IV are put back (2017 P2 Q25)', () => {
  const drawings = ['<smiles>CC(=N)N</smiles>', '<smiles>C1=NCCN1</smiles>', '<smiles>c1c[nH]cn1</smiles>', '<smiles>N=C(N)N</smiles>']
  const text = 'The order of basicity among the following compounds is\n\nIII\n\n[A] II $>$ I $>$ IV $>$ III\n[B] IV > II > III > I\n[C] IV $>$ I $>$ II $>$ III\n[D] I $>$ IV $>$ III $>$ II\n\nSpace for rough work'
  const fixed = flaggedThenFixed(mcq(text, drawings, { subject: 'chemistry' }), '', /answer choices are inside the question text/)
  assert.deepEqual(fixed.options, ['II $>$ I $>$ IV $>$ III', 'IV > II > III > I', 'IV $>$ I $>$ II $>$ III', 'I $>$ IV $>$ III $>$ II'])
  assert.match(fixed.text, /<smiles>CC\(=N\)N<\/smiles>\nI\n<smiles>C1=NCCN1<\/smiles>\nII\n/)
  assert.doesNotMatch(fixed.text, /Space for rough work|\[A\]/)
})

test('two options glued into one box are split; three filled options are flagged', () => {
  const card = mcq('The coordinates of the final image are', ['$(0,0)$', '$(50-25 \\sqrt{3}, 25)(25,25 \\sqrt{3})$', '$(125 / 3,25 / \\sqrt{3})$', ''])
  const fixed = flaggedThenFixed(card, '', /glued together in one box/)
  assert.deepEqual(fixed.options, ['$(0,0)$', '$(50-25 \\sqrt{3}, 25)$', '$(25,25 \\sqrt{3})$', '$(125 / 3,25 / \\sqrt{3})$'])
  const missing = mcq('The coordinates of the final image are', ['$(0,0)$', '$(1,2)$', '$(3,4)$', ''])
  const check = localOfficialPyqQualityCheck({ questions: [missing], preparedText: '' })
  assert.deepEqual(check.failedGoTo, [1])
  assert.match(check.lines.join(' | '), /An MCQ option is empty/)
})

test('a first word the scan printed in lower case after its marker is capitalised', () => {
  const ocr = '\\item[Q.] 8 light of wavelength $\\lambda$ falls on a cathode plate inside a vacuum tube.'
  const fixed = flaggedThenFixed(
    mcq('light of wavelength $\\lambda$ falls on a cathode plate inside a vacuum tube.', ['one', 'two', 'three', 'four'], { printedNumber: 8 }),
    ocr,
    /first word looks cut off/,
  )
  assert.match(fixed.text, /^Light of wavelength/)
})

test('"Space for rough work" on an option or on its own line is removed', () => {
  const fixed = flaggedThenFixed(mcq('For an arbitrary triangle $P Q R$, the point $S$ is its', ['centroid', 'circumcentre', 'incentre', 'orthocenter Space for rough work']), '')
  assert.deepEqual(fixed.options, ['centroid', 'circumcentre', 'incentre', 'orthocenter'])
  const integer = {
    questionType: 'integer',
    subject: 'physics',
    printedNumber: 1,
    options: [],
    text: `A light ray enters a glass stack at an angle of thirty degrees. Find the largest layer number reached.\n\n${PIC(669)}\n\nSpace for rough work`,
  }
  const clean = flaggedThenFixed(integer, '')
  assert.doesNotMatch(clean.text, /rough work/)
})

test('a picture shown twice keeps the copy on its own labelled row (2026 P1 Q31)', () => {
  const text = [
    'List-I has four loops and List-II the induced current. Choose the correct match.',
    '(P)',
    PIC(562),
    '(Q)',
    PIC(975),
    '(1)',
    PIC(575),
    '(2)',
    PIC(948),
    'List-II',
    `(1) ${PIC(575)}`,
    `(2) ${PIC(948)}`,
  ].join('\n')
  const once = tidy.stemWithoutRepeatedPictures(text)
  assert.equal((once.match(/top_left_y=575/g) || []).length, 1)
  assert.equal((once.match(/top_left_y=948/g) || []).length, 1)
  assert.match(once, /\(1\) \\includegraphics/)
  assert.match(once, /\(P\)\n\\includegraphics/, 'List-I keeps its labels')
  assert.doesNotMatch(once, /^\(1\)$/m, 'the loose label of the extra copy goes')
  const fake = ['List-II', '(1) Scheme I', PIC(575), '(2) Scheme II', PIC(948), `(2) ${PIC(575)}`].join('\n')
  const kept = tidy.stemWithoutRepeatedPictures(fake)
  assert.match(kept, /\(1\) Scheme I\n\\includegraphics\{[^}]*top_left_y=575/, 'a labelled copy whose label another row uses is the extra one')
  assert.doesNotMatch(kept, /\(2\) \\includegraphics/)
})

test('"equal$s_$" reads "equals ____"', () => {
  assert.equal(tidy.withAnswerBlankWord('Then $\\sum_{k=0}^{n} k$ equal$s_$'), 'Then $\\sum_{k=0}^{n} k$ equals ____')
})

test('a List-II kept in a table is not copied again from the scan with the next part heading (2014 P2 Q20)', () => {
  const text = [
    'The state of the lift is given in List I and the distance in List II. Match List I with List II.',
    '',
    '\\begin{tabular}{ll}',
    '\\textbf{List I} & \\textbf{List II} \\\\',
    'P. Lift is accelerating vertically up. & 1. $d = 1.2~m$ \\\\',
    'Q. Lift is accelerating vertically down. & 2. $d > 1.2~m$ \\\\',
    'R. Lift is moving up with constant speed. & 3. $d < 1.2~m$ \\\\',
    'S. Lift is falling freely. & 4. No water leaks out of the jar',
    '\\end{tabular}',
  ].join('\n')
  const ocr = [
    '\\item[Q.] 20 The state of the lift is given in List I and the distance in List II. Match List I with List II.',
    'List-I',
    '(P) Lift is accelerating vertically up.',
    '(Q) Lift is accelerating vertically down.',
    '(R) Lift is moving up with constant speed.',
    '(S) Lift is falling freely.',
    'List-II',
    '(1) $d=1.2 m$',
    '(2) $d>1.2 m$',
    '(3) $d<1.2 m$',
    '4. No water leaks out of the jar',
    '',
    'PART-2 CHEMISTRY',
    '',
    'SECTION -1 (Only One Option Correct Type)',
  ].join('\n')
  const card = mcq(text, ['P-2 Q-3 R-2 S-4', 'P-2 Q-3 R-1 S-4', 'P-1 Q-1 R-1 S-4', 'P-2 Q-3 R-1 S-1'], { printedNumber: 20 })
  const shown = healUploadQuestionCard(card, ocr).text
  assert.ok((shown.match(/^List-II$/gm) || []).length <= 1, shown)
  assert.equal((shown.match(/No water leaks/g) || []).length, 1, shown)
  assert.doesNotMatch(shown, /PART-2|SECTION -1/)
})

test('a part / section heading left on a card is flagged and removed', () => {
  const card = mcq('A block slides on a smooth floor under a constant force. Its acceleration is\n\nPART-2 CHEMISTRY\n\nSECTION -1 (Only One Option Correct Type)', ['$2$', '$5$', '$10$', '$20$'])
  const fixed = flaggedThenFixed(card, '')
  assert.equal(fixed.text, 'A block slides on a smooth floor under a constant force. Its acceleration is')
})

test('a figure caption "(A)" under a picture reads "(a)" when the text names Figure (a) (2022 P1 Q27)', () => {
  const text = `A capacitor is connected to a battery, as shown in Figure (a). The plates are moved, as shown in Figure (b).\n\n${PIC(408)}\n\n(A)\n\n${PIC(409)}\n\n(B)\nWhich of the following statement(s) is(are) correct?`
  const fixed = flaggedThenFixed(mcq(text, ['one', 'two', 'three', 'four'], { questionType: 'multiple_correct' }), '', /figure caption reads like an option letter/)
  assert.match(fixed.text, /\n\(a\)\n[\s\S]*\n\(b\)\n/)
  assert.equal(tidy.stemWithFigureCaptionCase(text.replace(/Figure \(([ab])\)/g, (_, l) => `Figure (${l.toUpperCase()})`)), '', 'a caption the text also writes as (A) stays')
})

test('options in one $$\\begin{array}$$ row split into four clean options (2025 P2 Q19)', () => {
  const ocr = [
    '\\item[Q.] 3 Ignoring gravity and assuming motion only in the plane of the diagram, the value of $\\frac{f_{1}}{f_{2}}$ is:',
    '$$\\begin{array}{|l|l|l|l|l|l|l|l|}',
    '\\hline \\text { (A) } & 2 & \\text { (B) } & \\sqrt{2} & \\text { (C) } & \\sqrt{\\frac{5}{2}} & \\text { (D) } & \\sqrt{\\frac{2}{5}} \\\\',
    '\\hline',
    '\\end{array}$$',
    'Answer: C',
    '\\item[Q.] 4 Consider a star of mass $m_{2}$ kg revolving in a circular orbit around another star.',
    '\\begin{tabular}[t]{|l|l|}',
    '\\hline (A) & one \\\\',
    '\\hline (B) & two \\\\',
    '\\hline (C) & three \\\\',
    '\\hline (D) & four \\\\',
    '\\hline',
    '\\end{tabular}',
  ].join('\n')
  const card = paperItemsFromMathpixOcr(ocr).find((q) => /value of/.test(q.text))
  assert.deepEqual(card.options, ['$2$', '$\\sqrt{2}$', '$\\sqrt{\\frac{5}{2}}$', '$\\sqrt{\\frac{2}{5}}$'])
  assert.doesNotMatch(card.text, /begin\{array\}|\\text \{/)
})

test('"\\left\\{\\begin{array} … \\right." and "( … $T_{1}$ ) $=10 P$" draw (2015 P1 Q46, 2016 P1 Q40)', () => {
  const piecewise = 'Let $f(x)=\\left\\{\\begin{array}{ll}{[x],} & x \\leq 2 \\\\ 0, & x>2\\end{array}\\right.$, where $[x]$ is the greatest integer. The value of $(4 I-1)$ is'
  assert.deepEqual(officialPyqDrawnProblems({ questionType: 'integer', text: piecewise, options: [] }), [])
  const paren = 'It is known that $P$ (computer is defective given plant $T_{1}$ ) $=10 P$ (computer is defective given plant $T_{2}$ ). The probability is'
  assert.deepEqual(officialPyqDrawnProblems(mcq(paren, ['$\\frac{36}{73}$', '$\\frac{47}{79}$', '$\\frac{78}{93}$', '$\\frac{75}{83}$'])), [])
})

test('"[Figure]" placeholders and glued words are removed / split; the structures stay (2014 P2 Q2, Q3, Q21, Q22)', () => {
  const chem = { subject: 'chemistry' }
  const q21 = flaggedThenFixed(
    mcq(`The acidic hydrolysis of ether (X) shown below is fastest when\n\n[Figure]\n\n${PIC(886)}`, ['one methyl group', 'one para-methoxyphenyl group', 'two para-methoxyphenyl groups', 'no change'], chem),
    '',
    /“\[Figure\]” placeholder/,
  )
  assert.equal(q21.text, `The acidic hydrolysis of ether (X) shown below is fastest when\n\n${PIC(886)}`)
  const hexane = `Isomers of hexane can be divided into three classes as shown in the figure.\n\n[Figure]\n\n${PIC(453)}\n<smiles>CC(C)C(C)C</smiles>\nand\n<smiles>CCC(C)(C)C</smiles>\n\nThe correct order of their boiling point is`
  const q22 = flaggedThenFixed(mcq(hexane, ['I > II > III', 'III > II > I', 'II > III > I', 'III > I > II'], chem), '')
  assert.equal((q22.text.match(/<smiles>/g) || []).length, 2, q22.text)
  const ocr = 'The galvanometer shows a null point. The least count of the metre bridge scale is 1 mm.'
  const q3 = flaggedThenFixed(
    mcq('A wire, whichpasses through a bead, is used in an experiment with ametre bridge using a resistance of $90~\\Omega$,as given. The unknown resistance is', ['$60 \\Omega$', '$135 \\Omega$', '$90 \\Omega$', '$45 \\Omega$']),
    ocr,
    /Words are glued together/,
  )
  assert.equal(q3.text, 'A wire, which passes through a bead, is used in an experiment with a metre bridge using a resistance of $90~\\Omega$, as given. The unknown resistance is')
  assert.equal(tidy.withGluedWordsSplit('A ray of achiral light along the axis, whichever is first', 'chiral light'), '', 'real words stay')
  assert.equal(tidy.withSpaceAfterComma('points $(x,y)$ and 1,2,3'), '', 'math and numbers keep their commas')
})

test('what only the original page can settle is flagged: a one-atom structure, "?" text, a cut condition, a missing label (2014 P2 Q22, Q38, Q57)', () => {
  assert.match(tidy.scanLossReason(mcq('List-I\n(P)\n<smiles>[CH]</smiles>\n(Q)\n<smiles>Oc1ccccc1</smiles>', ['1', '2', '3', '4'])), /structure drawing is broken/)
  assert.match(tidy.scanLossReason(mcq('(1) Scheme I\n? (iii) $\\mathrm{SOCl}_{2}$ (iv) $\\mathrm{NH}_{3}$', ['1', '2', '3', '4'])), /scan printed “\?”/)
  assert.match(tidy.scanLossReason(mcq('(P) For each $z_{k}$ there exists a $z_{j}$ such that $z_{k} \\cdot z_{j}$\n(Q) Another row', ['1', '2', '3', '4'])), /condition ends without/)
  assert.match(tidy.scanLossReason(mcq('three classes\n\nI\n\n<smiles>CCC</smiles>\n\nIII\n<smiles>CCCC</smiles>', ['1', '2', '3', '4'])), /Figure label II is missing/)
  assert.equal(tidy.scanLossReason(mcq('such that $z_{k} \\cdot z_{j}=1$ holds\nI\nII\nIII', ['1', '2', '3', '4'])), '')
  const card = mcq('List-I\n(P)\n<smiles>[CH]</smiles>\n(Q)\n<smiles>Oc1ccccc1</smiles>\nMatch the lists', ['P-1', 'P-2', 'P-3', 'P-4'], { subject: 'chemistry' })
  assert.deepEqual(localOfficialPyqQualityCheck({ questions: [card], preparedText: '' }).failedGoTo, [1])
})

test('a Compare that read the original and found the same words settles the flag; a stale one does not (2014 P2 Q57)', () => {
  const card = mcq(
    'Let $z_{k}=\\cos \\left(\\frac{2 k \\pi}{10}\\right)+i \\sin \\left(\\frac{2 k \\pi}{10}\\right) ; k=1,2, \\ldots, 9$.\n\nList-I\n(P) For each $z_{k}$ there exists a $z_{j}$ such that $z_{k} \\cdot z_{j}$\n(Q) There exists a $k \\in\\{1,2, \\ldots, 9\\}$ such that $z_{1} \\cdot z= z_{k}$ has no solution $z$ in the set of complex numbers.\n(R) $\\frac{\\left|1-z_{1}\\right| \\cdots\\left|1-z_{9}\\right|}{10}$ equals\n(S) $1-\\sum_{k=1}^{9} \\cos \\left(\\frac{2 k \\pi}{10}\\right)$ equals\n\nList-II\n(1) True\n(2) False\n(3) 1\n(4) 2',
    ['P-1, Q-2, R-4, S-3', 'P-2, Q-1, R-3, S-4', 'P-1, Q-2, R-3, S-4', 'P-2, Q-1, R-4, S-3'],
    { subject: 'mathematics' },
  )
  assert.deepEqual(localOfficialPyqQualityCheck({ questions: [card], preparedText: '' }).failedGoTo, [1])
  const confirmed = { ...card, originalCompare: { verdict: 'differs', textMatches: true, differences: [{ kind: 'card_problem' }], cardKey: officialPyqCompareCardKey(card) } }
  const settled = localOfficialPyqQualityCheck({ questions: [confirmed], preparedText: '' })
  assert.deepEqual(settled.failedGoTo, [], settled.lines.join(' | '))
  const stale = { ...confirmed, originalCompare: { ...confirmed.originalCompare, cardKey: '1:old' } }
  assert.deepEqual(localOfficialPyqQualityCheck({ questions: [stale], preparedText: '' }).failedGoTo, [1])
})

test('a "Codes:" table that repeats the options is removed whole, never cut after its heading (2014 P2 Q38)', () => {
  const table = (rows) => `Codes:\n\\begin{tabular}{ccccc}\n& P & Q & R & S \\\\\n${rows.join(' \\\\\n')}\n\\end{tabular}`
  const head = 'Match the four starting materials (P, Q, R, S) given in List I with the reaction schemes in List II.\n\\includegraphics{/api/official-pyq/original/crops/x-p26.png}'
  const options = ['P-1, Q-4, R-2, S-3', 'P-3, Q-1, R-4, S-2', 'P-3, Q-4, R-2, S-1', 'P-4, Q-1, R-3, S-2']
  const same = `${head}\n${table(['(A) & 1 & 4 & 2 & 3', '(B) & 3 & 1 & 4 & 2', '(C) & 3 & 4 & 2 & 1', '(D) & 4 & 1 & 3 & 2'])}`
  assert.equal(peelGluedMcqOptions(same, options).text, head)
  assert.equal(sanitizeStemForDisplay(same, options), head)
  const other = `${head}\n${table(['(A) & 2 & 4 & 2 & 3', '(B) & 3 & 1 & 4 & 2', '(C) & 3 & 4 & 2 & 1', '(D) & 4 & 1 & 3 & 2'])}`
  assert.equal(peelGluedMcqOptions(other, options).text, other)
})

test('a drawing printed just above List-I still shows with the two lists (2014 P2 Q17, Q19)', () => {
  const pic = '\\includegraphics{https://cdn.mathpix.com/cropped/19934504-6d9e-413a-a44e-2618e323b5ad-11.jpg?height=400&width=376&top_left_y=684&top_left_x=807}'
  const text = `A block of mass $m_{1}=1 \\mathrm{~kg}$ and another mass $m_{2}=2 \\mathrm{~kg}$ are placed together (see figure) on an inclined plane with angle of inclination $\\theta$. Match the correct expression of the friction in List II with the angles given in List I, and choose the correct option.\n${pic}\n\nList I\nP. $\\theta=5^{\\circ}$\nQ. $\\theta=10^{\\circ}$\nR. $\\theta=15^{\\circ}$\nS. $\\theta=20^{\\circ}$\n\nList II\n1. $m_{2} g \\sin \\theta$\n2. $\\left(m_{1}+m_{2}\\right) g \\sin \\theta$\n3. $\\mu m_{2} g \\cos \\theta$\n4. $\\mu\\left(m_{1}+m_{2}\\right) g \\cos \\theta$`
  const options = ['P-1, Q-1, R-1, S-3', 'P-2, Q-2, R-2, S-3', 'P-2, Q-2, R-2, S-4', 'P-2, Q-2, R-3, S-3']
  const parsed = parseMatchingListForDisplay(sanitizeStemForDisplay(text, options), options)
  assert.equal(parsed?.listI?.length, 4)
  assert.ok(parsed.intro.includes(pic), parsed.intro)
  const card = mcq(text, options, { subject: 'physics' })
  assert.deepEqual(localOfficialPyqQualityCheck({ questions: [card], preparedText: '' }).failedGoTo, [])
})

test('a clean card is not flagged and auto-fix leaves it as it is', () => {
  const card = mcq('A block of mass $2 \\mathrm{~kg}$ is pushed by a force of $10 \\mathrm{~N}$ on a smooth floor. Its acceleration is', ['$2$', '$5$', '$10$', '$20$'])
  assert.deepEqual(localOfficialPyqQualityCheck({ questions: [card], preparedText: '' }).failedGoTo, [])
  assert.deepEqual(repairOfficialPyqUntilQuality({ questions: [card], preparedText: '' }).paper.questions[0], card)
})

if (failed) {
  console.error(`\n${failed} error-sweep test(s) failed`)
  process.exit(1)
}
console.log('\nOfficial PYQ error-sweep tests passed')
process.exit(0)
