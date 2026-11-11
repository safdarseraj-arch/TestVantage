/**
 * Error types found while checking JEE Advanced 2013 P1 and the stored papers against their
 * original pages. Each is caught on upload where the scan allows, flagged by the local quality
 * check, reported by Compare, and repaired by Auto-fix:
 *   "(III)" dropped after a formula option (2013 P1 Q26);
 *   pictures under the last option taken as that option (2013 P1 Q32);
 *   an option that repeats the question's figure (2013 P1 Q15), and no false alarm on a line break;
 *   an answer key the paper prints but the scan lost (2013 P1 Q2, Q8, Q12–Q15, Q23, Q32, Q33),
 *   filled from the original page, on a hand-edited card the answer only;
 *   an option cut at "(-2," (2018 P2 Q38) and options the scan prints longer;
 *   List-I / List-II layout: empty rows, a lost or merged List-II row named by the codes, one
 *   drawing under two labels, rows of the two lists mixed, a List heading inside a row.
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
if (typeof globalThis.sessionStorage === 'undefined') globalThis.sessionStorage = globalThis.localStorage

const { addOfficialPyqPendingPaper, clearOfficialPyqPendingPapers, getOfficialPyqPendingPaper, updateOfficialPyqPendingPaper } =
  await import('../src/utils/officialPyqPendingStore.js')
const { localOfficialPyqQualityCheck, repairOfficialPyqUntilQuality, officialPyqPrintedKeyMissingGoTo } = await import(
  '../src/utils/officialPyqLocalQuality.js'
)
const { officialPyqDrawnProblems } = await import('../src/utils/officialPyqDrawnCheck.js')
const { officialPyqMatchListLayoutProblems, withoutHeadingOnRowLabel } = await import('../src/utils/matchListLayoutCheck.js')
const {
  officialPyqPrintedAnswerFields,
  officialPyqPrintedAnswerPatch,
  officialPyqDraftFromSuggestion,
  formatOfficialPyqAnswerKey,
  parseOfficialPyqAnswerKey,
} = await import('../src/utils/officialPyqCardEdit.js')
const { formatCorrectAnswer } = await import('../src/utils/formatAnswer.js')
const { evaluateTest } = await import('../src/utils/scoring.js')
const { healUploadQuestionCard } = await import('../src/utils/uploadQualityGuards.js')
const { withPrintedAnswerDifference, officialPyqCardScreenProblems } = await import('../src/utils/officialPyqOriginalCompare.js')
const { autoFixFlaggedOfficialPyqCards, officialPyqAutoFixTodo } = await import('../src/utils/officialPyqAutoFix.js')
const { dropOptionFigureRepeatingStem } = await import('../src/utils/optionRepeatsStemFigure.js')
const { parseQuestionText } = await import('../src/utils/parseQuestionText.js')
const { trimQuestionLeakFromOption } = await import('../src/utils/optionStemLeak.js')
const { paperItemsFromMathpixOcr } = await import('../src/utils/mathpixQuestionSplit.js')
const { parseMatchingListForDisplay } = await import('../src/utils/parseMatchingListDisplay.js')

let failed = 0
async function test(name, fn) {
  try {
    await fn()
    console.log(`ok - ${name}`)
  } catch (err) {
    failed += 1
    console.error(`FAIL - ${name}\n${err?.stack || err}`)
  }
}

const PIC = (n) => `\\includegraphics{https://cdn.mathpix.com/cropped/err-types-${n}.jpg?height=200&width=300&top_left_y=${100 * n}&top_left_x=200}`
const mcq = (text, options, extra = {}) => ({ questionType: 'single_correct', subject: 'chemistry', text, options, printedNumber: 1, ...extra })
const failedOf = (questions, preparedText = '') => localOfficialPyqQualityCheck({ questions, preparedText }).failedGoTo

/** Eight questions in the 2013 scan's shape; the key lines under the listed ones were lost. */
function scanWithKeys(...lost) {
  const blocks = []
  for (let n = 1; n <= 8; n += 1) {
    blocks.push(
      `\\begin{itemize}\n\\item[Q.] ${n} A body of mass ${n} kg moves on a smooth floor under a constant force. Its speed after ${n} s is\n(A) $${n} \\mathrm{~m} / \\mathrm{s}$\n(B) $${n + 1} \\mathrm{~m} / \\mathrm{s}$\n(C) $${n + 2} \\mathrm{~m} / \\mathrm{s}$\n(D) $${n + 3} \\mathrm{~m} / \\mathrm{s}$\n\\end{itemize}\n`,
    )
    if (!lost.includes(n)) blocks.push(`\\section*{ANSWER : ${'ABCD'[n % 4]}}\n`)
  }
  return `SECTION - 1 : (Only One option correct Type)\n\n${blocks.join('\n')}`
}

clearOfficialPyqPendingPapers()

await test('upload keeps "(III)" after a formula option (2013 P1 Q26)', () => {
  const parsed = parseQuestionText(
    'Upon treatment with ammoniacal $H_{2} S$, the metal ion that precipitates as a sulfide is\n(A) $F e$ (III)\n(B) $A l$ (III)\n(C) $\\operatorname{Mg}(\\mathrm{II})$\n(D) $\\operatorname{Zn}(\\mathrm{II})$',
  )
  assert.deepEqual(parsed.options.slice(0, 2), ['$F e$ (III)', '$A l$ (III)'])
})

await test('upload sends pictures under the last option to the question (2013 P1 Q32)', () => {
  const parsed = parseQuestionText(
    `The schemes P, Q, R and S below are possible reaction routes. The correct schemes are\n(A) P\n(B) Q\n(C) R\n(D) S\n${PIC(1)}\n${PIC(2)}`,
  )
  assert.deepEqual(parsed.options.map((o) => o.trim()), ['P', 'Q', 'R', 'S'])
  assert.ok(String(parsed.text ?? parsed.stem).includes('err-types-1') || !parsed.options.join(' ').includes('err-types'))
})

await test('upload keeps "(-2, 7) lies in E1"; the ")" is not a question number (2018 P2 Q38)', () => {
  assert.equal(trimQuestionLeakFromOption('The point (-2, 7) lies in $E_{1}$'), 'The point (-2, 7) lies in $E_{1}$')
  assert.equal(trimQuestionLeakFromOption('$12$ 3. Value of the sum is'), '$12$')
})

await test('an option repeating the question figure is flagged and repaired; a trailing line break is not', () => {
  const text = `Two capacitors are connected as shown.\n${PIC(3)}`
  const bad = mcq(text, ['$2 C V_{0}$', '$C V_{0}$', '0', `$-C V_{0}$\n${PIC(3)}`])
  assert.deepEqual(failedOf([bad]), [1])
  const fixed = repairOfficialPyqUntilQuality({ questions: [bad], preparedText: '' }).paper.questions[0]
  assert.equal(fixed.options[3].includes('err-types-3'), false)
  const clean = mcq(text, ['$P$', '$Q$', '$R$', '$S$\n'])
  assert.equal(dropOptionFigureRepeatingStem(clean), clean)
})

await test('a key the paper prints but the scan lost is flagged; Compare reports it; Auto-fix fills it', async () => {
  const ocr = scanWithKeys(7, 8)
  const items = paperItemsFromMathpixOcr(ocr, { examLabel: 'JEE Advanced' })
  assert.equal(items.length, 8)
  const questions = items.map((q) => ({ ...q }))
  questions[6] = { ...questions[6], text: `${questions[6].text} (typed by the admin)`, adminEdited: true }
  assert.deepEqual(officialPyqPrintedKeyMissingGoTo({ questions, preparedText: ocr }), [7, 8])
  const check = localOfficialPyqQualityCheck({ questions, preparedText: ocr })
  assert.ok(check.failedGoTo.includes(8), check.lines.join(' | '))

  const compared = withPrintedAnswerDifference({ verdict: 'matches', textMatches: true, printed_answer: 'C', differences: [] }, questions[7])
  assert.equal(compared.verdict, 'differs')
  assert.ok(compared.differences.some((d) => d.kind === 'wrong_answer'))

  const paper = addOfficialPyqPendingPaper({ exam: 'jee-advanced', year: 2093, session: 'Paper 1', sourceLabel: 'test', preparedText: ocr, questions })
  updateOfficialPyqPendingPaper(paper.id, { localQuality: localOfficialPyqQualityCheck({ ...getOfficialPyqPendingPaper(paper.id), preparedText: ocr }) })
  assert.deepEqual(officialPyqAutoFixTodo(getOfficialPyqPendingPaper(paper.id)).sort(), [7, 8])
  const printed = { 7: 'B', 8: 'C' }
  const out = await autoFixFlaggedOfficialPyqCards(paper.id, {
    compare: async (_id, index) => ({ verdict: 'matches', textMatches: true, printed_answer: printed[index + 1] ?? '', differences: [], pages: [1] }),
  })
  assert.equal(out.ok, true, out.error)
  assert.deepEqual(out.needsAdmin, [])
  const after = getOfficialPyqPendingPaper(paper.id)
  assert.equal(after.questions[7].correctIndex, 2)
  assert.equal(after.questions[7].answerSource, 'from_paper')
  assert.equal(after.questions[6].correctIndex, 1)
  assert.equal(after.questions[6].text, questions[6].text, 'a hand-edited card keeps its wording')
  assert.notEqual(after.questions[6].editSource, 'auto_compare', 'a hand-edited card stays hand-edited')
  assert.equal(after.questions[6].editHistory.length, 1, 'the answer fill can be undone')
  assert.deepEqual(after.localQuality.failedGoTo, [])
})

await test('a page that prints no key stops the missing-key alert after one Compare', async () => {
  const ocr = scanWithKeys(8)
  const questions = paperItemsFromMathpixOcr(ocr, { examLabel: 'JEE Advanced' }).map((q) => ({ ...q }))
  const paper = addOfficialPyqPendingPaper({ exam: 'jee-advanced', year: 2094, session: 'Paper 1', sourceLabel: 'test', preparedText: ocr, questions })
  updateOfficialPyqPendingPaper(paper.id, { localQuality: localOfficialPyqQualityCheck({ ...getOfficialPyqPendingPaper(paper.id), preparedText: ocr }) })
  const out = await autoFixFlaggedOfficialPyqCards(paper.id, {
    compare: async () => ({ verdict: 'matches', textMatches: true, printed_answer: '', differences: [], pages: [1] }),
  })
  assert.deepEqual(out.needsAdmin, [])
  assert.deepEqual(getOfficialPyqPendingPaper(paper.id).localQuality.failedGoTo, [])
})

await test('a try made before Compare read answer keys does not block the key fill; the retry happens once (2013 P2)', async () => {
  const ocr = scanWithKeys(8)
  const questions = paperItemsFromMathpixOcr(ocr, { examLabel: 'JEE Advanced' }).map((q) => ({ ...q }))
  const paper = addOfficialPyqPendingPaper({ exam: 'jee-advanced', year: 2095, session: 'Paper 1', sourceLabel: 'test', preparedText: ocr, questions })
  updateOfficialPyqPendingPaper(paper.id, { localQuality: localOfficialPyqQualityCheck({ ...getOfficialPyqPendingPaper(paper.id), preparedText: ocr }) })
  const unread = async () => ({ verdict: 'differs', textMatches: false, differences: [{ kind: 'other', note: 'x' }], pages: [1] })
  const asOldRecord = () =>
    updateOfficialPyqPendingPaper(paper.id, {
      questions: getOfficialPyqPendingPaper(paper.id).questions.map((q, i) =>
        i === 7 ? { ...q, autoFix: { outcome: q.autoFix.outcome, tried: q.autoFix.tried, at: q.autoFix.at } } : q,
      ),
    })
  const first = await autoFixFlaggedOfficialPyqCards(paper.id, { compare: unread })
  assert.deepEqual(first.needsAdmin.map((n) => n.goTo), [8])
  assert.deepEqual(officialPyqAutoFixTodo(getOfficialPyqPendingPaper(paper.id)), [], 'a try that did not read the key is not repeated')
  asOldRecord()
  assert.deepEqual(officialPyqAutoFixTodo(getOfficialPyqPendingPaper(paper.id)), [8], 'a try from before keys were read is retried')
  const second = await autoFixFlaggedOfficialPyqCards(paper.id, { compare: unread })
  assert.deepEqual(second.needsAdmin.map((n) => n.goTo), [8])
  assert.deepEqual(officialPyqAutoFixTodo(getOfficialPyqPendingPaper(paper.id)), [], 'only one extra try')
  asOldRecord()
  const third = await autoFixFlaggedOfficialPyqCards(paper.id, {
    compare: async () => ({ verdict: 'matches', textMatches: true, printed_answer: 'A', differences: [], pages: [1] }),
  })
  assert.deepEqual(third.fixed, [8])
  assert.equal(getOfficialPyqPendingPaper(paper.id).questions[7].correctIndex, 0)
})

await test('printed keys are read like the answer box: letters, numbers, ranges; "A or C" is not guessed', () => {
  assert.deepEqual(officialPyqPrintedAnswerFields('BD'), { correctIndices: [1, 3] })
  assert.deepEqual(officialPyqPrintedAnswerFields('ANSWER : AD'), { correctIndices: [0, 3] })
  assert.deepEqual(officialPyqPrintedAnswerFields('B', { questionType: 'multiple_correct' }), { correctIndices: [1] })
  assert.deepEqual(officialPyqPrintedAnswerFields('5', { questionType: 'integer' }), { correctInteger: 5 })
  assert.deepEqual(officialPyqPrintedAnswerFields('2.25 to 2.30'), { correctNumerical: 2.275, numericalTolerance: 0.025 })
  assert.equal(officialPyqPrintedAnswerFields('A or C or AC'), null)
  assert.equal(officialPyqPrintedAnswerFields(''), null)
  const card = mcq('Q', ['a', 'b', 'c', 'd'], { correctIndex: 1 })
  assert.equal(officialPyqPrintedAnswerPatch(card, { printedAnswer: 'B' }), null)
  assert.deepEqual(officialPyqPrintedAnswerPatch(card, { printedAnswer: 'C' }), { correctIndex: 2 })
  assert.equal(officialPyqPrintedAnswerPatch({ ...card, options: [] , questionType: 'integer' }, { printedAnswer: 'C' }), null)
  const draft = officialPyqDraftFromSuggestion(card, { printedAnswer: 'D', suggestedText: 'Q', suggestedOptions: ['a', 'b', 'c', 'd'] })
  assert.equal(draft.answerKey, 'D')
  assert.equal(draft.answerFromPage, true)
})

await test('"ABCD or BCD" printed for a one-or-more-correct question is saved as either answer and scored (2013 P2 Q3)', async () => {
  const multi = mcq('Q', ['a', 'b', 'c', 'd'], { questionType: 'multiple_correct' })
  assert.deepEqual(officialPyqPrintedAnswerFields('ABCD or BCD', multi), { correctIndices: [0, 1, 2, 3], correctIndicesAlternatives: [[1, 2, 3]] })
  assert.equal(officialPyqPrintedAnswerFields('A or C', mcq('Q', ['a', 'b', 'c', 'd'])), null, 'a one-answer card is not guessed')
  const saved = { ...multi, correctIndices: [0, 1, 2, 3], correctIndicesAlternatives: [[1, 2, 3]] }
  assert.equal(formatOfficialPyqAnswerKey(saved), 'A, B, C, D OR B, C, D')
  assert.deepEqual(parseOfficialPyqAnswerKey('A, B, C, D OR B, C, D', multi).patch.correctIndicesAlternatives, [[1, 2, 3]])
  assert.equal(formatCorrectAnswer(saved), 'A, B, C, D or B, C, D')
  const paperTest = { id: 't', patternId: 'jee-advanced', questions: [{ ...saved, id: 'q1', subject: 'physics' }] }
  const full = evaluateTest(paperTest, { q1: [0, 1, 2, 3] })
  const either = evaluateTest(paperTest, { q1: [1, 2, 3] })
  assert.equal(full.correct, 1)
  assert.equal(either.correct, 1, 'the second printed answer scores in full')
  assert.equal(either.score, full.score)
  assert.equal(evaluateTest(paperTest, { q1: [0] }).correct, 0)

  const ocr = scanWithKeys(8)
  const questions = paperItemsFromMathpixOcr(ocr, { examLabel: 'JEE Advanced' }).map((q, i) => (i === 7 ? { ...q, questionType: 'multiple_correct' } : { ...q }))
  const paper = addOfficialPyqPendingPaper({ exam: 'jee-advanced', year: 2096, session: 'Paper 2', sourceLabel: 'test', preparedText: ocr, questions })
  updateOfficialPyqPendingPaper(paper.id, { localQuality: localOfficialPyqQualityCheck({ ...getOfficialPyqPendingPaper(paper.id), preparedText: ocr }) })
  const out = await autoFixFlaggedOfficialPyqCards(paper.id, {
    compare: async () => ({ verdict: 'matches', textMatches: true, printed_answer: 'ABCD or BCD', differences: [], pages: [1] }),
  })
  assert.deepEqual(out.fixed, [8], JSON.stringify(out))
  const card = getOfficialPyqPendingPaper(paper.id).questions[7]
  assert.deepEqual(card.correctIndices, [0, 1, 2, 3])
  assert.deepEqual(card.correctIndicesAlternatives, [[1, 2, 3]])

  // A key Compare already read (saved before it could be used) is filled with no new Gemini request.
  const again = addOfficialPyqPendingPaper({ exam: 'jee-advanced', year: 2097, session: 'Paper 2', sourceLabel: 'test', preparedText: ocr, questions })
  updateOfficialPyqPendingPaper(again.id, { localQuality: localOfficialPyqQualityCheck({ ...getOfficialPyqPendingPaper(again.id), preparedText: ocr }) })
  await autoFixFlaggedOfficialPyqCards(again.id, {
    compare: async () => ({ verdict: 'differs', textMatches: false, printed_answer: 'Q', differences: [], pages: [1] }),
  })
  const tried = getOfficialPyqPendingPaper(again.id).questions[7]
  assert.equal(tried.originalCompare?.printedAnswer, 'Q')
  updateOfficialPyqPendingPaper(again.id, {
    questions: getOfficialPyqPendingPaper(again.id).questions.map((q, i) =>
      i === 7 ? { ...q, originalCompare: { ...q.originalCompare, printedAnswer: 'ABCD or BCD' } } : q,
    ),
  })
  assert.deepEqual(officialPyqAutoFixTodo(getOfficialPyqPendingPaper(again.id)), [8])
  const reused = await autoFixFlaggedOfficialPyqCards(again.id, {
    compare: async () => {
      throw new Error('Compare must not run again')
    },
  })
  assert.deepEqual(reused.fixed, [8], JSON.stringify(reused))
  assert.deepEqual(getOfficialPyqPendingPaper(again.id).questions[7].correctIndicesAlternatives, [[1, 2, 3]])
})

await test('checking a hand-edited match card without the scan keeps its List-I pictures (2013 P2 Q37)', () => {
  const row = (y) => `\\includegraphics{https://cdn.mathpix.com/cropped/err-types-q37.jpg?height=107&width=515&top_left_y=${y}&top_left_x=428}`
  const card = {
    ...mcq(
      `Match the chemical conversions in List I with the appropriate reagents in List II and select the correct answer using the code given below the lists :\n\nList I\n\n(P) \n${row(952)}\n\n(Q) \n${row(1064)}\n\n(R) \n${row(1187)}\n\n(S) \n${row(1301)}\n\nList II\n\n(1) NaBH4\n\n(2) NaOEt\n\n(3) Et-Br\n\n(4) BH3\n\nCodes :`,
      ['P-2, Q-3, R-1, S-4', 'P-3, Q-2, R-1, S-4', 'P-2, Q-3, R-4, S-1', 'P-3, Q-2, R-4, S-1'],
      { questionType: 'matrix_match', adminEdited: true, correctIndex: 0 },
    ),
  }
  assert.equal((healUploadQuestionCard(card, '').text.match(/includegraphics/g) || []).length, 4)
  assert.deepEqual(failedOf([card]), [])
})

await test('an option the scan prints longer is flagged and put back ("$F e$" for "$F e$ (III)")', () => {
  const ocr = scanWithKeys().replace('(A) $1 \\mathrm{~m} / \\mathrm{s}$', '(A) $1 \\mathrm{~m} / \\mathrm{s}$ (III)')
  const questions = paperItemsFromMathpixOcr(ocr, { examLabel: 'JEE Advanced' }).map((q) => ({ ...q }))
  assert.ok(questions[0].options[0].endsWith('(III)'), questions[0].options[0])
  questions[0] = { ...questions[0], options: ['$1 \\mathrm{~m} / \\mathrm{s}$', ...questions[0].options.slice(1)] }
  assert.deepEqual(failedOf(questions, ocr), [1])
  const fixed = repairOfficialPyqUntilQuality({ questions, preparedText: ocr }).paper.questions[0]
  assert.ok(fixed.options[0].endsWith('(III)'), fixed.options[0])
})

await test('an option cut at "(-2," or an open bracket is flagged on screen', () => {
  const card = mcq('Then which statement is TRUE?', ['The point (-2,', 'b', 'c', 'd'])
  assert.ok(officialPyqDrawnProblems(card).some((p) => p.includes('option A stops')))
  const open = mcq('Then which statement is TRUE?', ['The point (-2, 7', 'b', 'c', 'd'])
  assert.ok(officialPyqDrawnProblems(open).some((p) => p.includes('option A stops')))
  const interval = mcq('The range is', ['$x$ in (0, 1]', 'b', 'c', 'd'])
  assert.equal(officialPyqDrawnProblems(interval).length, 0)
})

const listCard = (listI, listII, options, intro = 'Match each entry in List-I with the appropriate entry in List-II and choose the correct option.') => ({
  questionType: 'matrix_match',
  subject: 'chemistry',
  printedNumber: 1,
  text: `${intro}\n\nList-I\n\n${listI.join('\n\n')}\n\nList-II\n\n${listII.join('\n\n')}`,
  options,
})
const CODES = ['P-1, Q-2, R-3, S-4', 'P-2, Q-1, R-4, S-3', 'P-3, Q-4, R-1, S-2', 'P-4, Q-3, R-2, S-1']
const ROWS_I = ['(P)\nAn ideal gas', '(Q)\nA real gas', '(R)\nA liquid', '(S)\nA solid']
const ROWS_II = ['(1)\nHas no volume', '(2)\nHas fixed shape', '(3)\nFlows freely', '(4)\nObeys PV = nRT']

await test('a clean match card shows no layout problem', () => {
  assert.deepEqual(officialPyqMatchListLayoutProblems(listCard(ROWS_I, ROWS_II, CODES)), [])
})

/** 2024 P1 Q50 as saved: rows Q–S lost their pictures, "List-II" printed beside row (1). */
const emptyRowsCard = () => ({
  ...listCard([], [], CODES),
  text: `List-I contains various reaction sequences and List-II contains the possible products. Match each entry in List-I with the appropriate entry in List-II and choose the correct option.\n\nList-I\n(P) ${PIC(7)}\n\n(Q) iv) a) $\\mathrm{BH}_{3}$, b) $\\mathrm{H}_{2} \\mathrm{O}_{2}, \\mathrm{NaOH}$\n\n(R) \n(S) \n\nList-II\n(1) List-II\n\n${PIC(8)}\n\n(2) <smiles>CC1C(O)CCC1CO</smiles>\n(3) <smiles>OCC1CCCC1O</smiles>\n(4) <smiles>CC1(O)CCCC1O</smiles>\n(5) <smiles>CC(O)C1CCCC1O</smiles>`,
})

await test('layout: empty List-I rows are flagged (2024 P1 Q50)', () => {
  const card = emptyRowsCard()
  const problems = officialPyqMatchListLayoutProblems(card)
  assert.ok(problems.some((p) => p.includes('(Q) of List-I is empty')), problems.join(' | '))
  assert.ok(officialPyqDrawnProblems(card).some((p) => p.includes('List-I / List-II layout')))
  assert.deepEqual(failedOf([card]), [1])
})

await test('layout: answer codes naming a List-II row the card lost are flagged (2018 P2 Q16, Q33)', () => {
  const lost = listCard(ROWS_I, ROWS_II.slice(0, 3), CODES)
  assert.ok(officialPyqMatchListLayoutProblems(lost).some((p) => p.includes('row (4)')))
  const merged = listCard(ROWS_I, [...ROWS_II.slice(0, 3), '(4)\n$200$\n$461$'], ['P → 4; Q → 5', 'P → 1; Q → 2', 'P → 2; Q → 3', 'P → 3; Q → 4'])
  assert.ok(officialPyqMatchListLayoutProblems(merged).some((p) => p.includes('row (5)')))
  const bold = listCard(ROWS_I, ROWS_II, ['P → 4; $\\mathbf{Q} \\rightarrow \\mathbf{3}$', 'P → 1; Q → 2', 'P → 2; Q → 3', 'P → 3; Q → 4'])
  assert.deepEqual(officialPyqMatchListLayoutProblems(bold), [])
})

await test('a List-II with six rows draws six rows; row (6) is not shown inside row (5) (2018 P2 Q52)', () => {
  const card = listCard(ROWS_I, ['(1) 136', '(2) 189', '(3) 192', '(4) 200', '(5) 381', '(6) 461'], ['P → 4; Q → 6; R → 2; S → 1', 'P → 1; Q → 4; R → 2; S → 3', 'P → 4; Q → 6; R → 5; S → 2', 'P → 4; Q → 2; R → 3; S → 1'])
  const parsed = parseMatchingListForDisplay(card.text, card.options)
  assert.equal(parsed?.listII?.length, 6)
  assert.equal(parsed.listII[4].text, '381')
  assert.deepEqual(officialPyqMatchListLayoutProblems(card), [])
})

await test("the scan's List-II is not copied again when it has the same rows as the card (2018 P2 Q16)", () => {
  const text = `Given $m_{1} / m_{2}=2$, match the ratios in List-I to the numbers in List-II.\n\nLIST-I\n\n(P)\n$\\frac{v_{1}}{v_{2}}$\n\n(Q)\n$\\frac{L_{1}}{L_{2}}$\n\n(R)\n$\\frac{K_{1}}{K_{2}}$\n\n(S)\n$\\frac{T_{1}}{T_{2}}$\n\nLIST-II\n\n(1)\n$\\frac{1}{8}$\n\n(2)\n1\n\n(3)\n2`
  const ocr = `SECTION - 3\n\n\\begin{itemize}\n\\item[Q.] 16 ${text}\n\\end{itemize}\n(A) P → 4; Q → 2; R → 1; S → 3\n(B) P → 3; Q → 2; R → 4; S → 1\n(C) P → 2; Q → 3; R → 1; S → 4\n(D) P → 2; Q → 3; R → 4; S → 1\n`
  const card = { ...listCard([], [], []), text, options: ['P → 4; Q → 2; R → 1; S → 3', 'P → 3; Q → 2; R → 4; S → 1', 'P → 2; Q → 3; R → 1; S → 4', 'P → 2; Q → 3; R → 4; S → 1'], printedNumber: 16 }
  const fixed = repairOfficialPyqUntilQuality({ questions: [card], preparedText: ocr }).paper.questions[0]
  assert.equal((fixed.text.match(/^[ \t]*List\s*-?\s*II[ \t]*$/gim) || []).length, 1, fixed.text)
})

await test('layout: one drawing under two labels is flagged (2020 P1 Q24, 2026 P1 Q47)', () => {
  const same = listCard(['(P)\n<smiles>CC1CCCC2=C1CCCC2C</smiles>', '(Q)\n<smiles>CC1CCCC2=C1CCCC2C</smiles>', '(R)\nA liquid', '(S)\nA solid'], ROWS_II, CODES)
  assert.ok(officialPyqMatchListLayoutProblems(same).some((p) => p.includes('(P) and (Q) of List-I are the same')))
  const pics = listCard([`(P)\n${PIC(5)}`, `(Q)\n${PIC(5)}`, '(R)\nA liquid', '(S)\nA solid'], ROWS_II, CODES)
  assert.ok(officialPyqMatchListLayoutProblems(pics).some((p) => p.includes('same')))
})

await test('layout: a List heading printed beside a row label is flagged and removed', () => {
  const headed = listCard(ROWS_I, [`(1) List-II\n\n${PIC(6)}`, ...ROWS_II.slice(1)], CODES)
  assert.ok(failedOf([headed]).includes(1))
  assert.ok(withoutHeadingOnRowLabel(headed.text) !== headed.text)
  const fixed = repairOfficialPyqUntilQuality({ questions: [headed], preparedText: '' }).paper.questions[0]
  assert.equal(/\(1\)\s*List-II/.test(fixed.text), false)
})

await test('layout: a whole List-II cropped from the original page is one complete list (2014 P2 Q37)', () => {
  const crop = '\\includegraphics{/api/official-pyq/original/crops/opyq-1-p25-7337371dd02d74fe.png?page=25&x0=0.4&y0=0.5&x1=0.8&y1=0.7}'
  const card = { ...listCard(ROWS_I, ['(1)'], CODES), text: `Match each pathway from List I with an appropriate structure from List II.\n\nList-I\n\n${ROWS_I.join('\n\n')}\n\n${crop}` }
  assert.equal(officialPyqMatchListLayoutProblems(card).filter((p) => p.includes('List-II')).length, 0)
})

await test('Compare lists layout problems so a "matches" is not taken as clean', () => {
  const card = emptyRowsCard()
  const problems = officialPyqCardScreenProblems({ questions: [card], localQuality: { failedGoTo: [] } }, 0, { text: card.text, options: card.options })
  assert.ok(problems.some((p) => p.includes('List-I / List-II layout')), problems.join(' | '))
})

await test('the quality run puts the scan lists back when the saved rows are broken and the scan is clean', () => {
  const clean = listCard(ROWS_I, ROWS_II, CODES)
  const ocr = `SECTION - 3 : (Matching List Type)\n\n\\begin{itemize}\n\\item[Q.] 1 ${clean.text}\n\\end{itemize}\nCodes :\n(A) ${CODES[0]}\n(B) ${CODES[1]}\n(C) ${CODES[2]}\n(D) ${CODES[3]}\n\n\\begin{itemize}\n\\item[Q.] 2 A body moves. Its speed is\n(A) 1\n(B) 2\n(C) 3\n(D) 4\n\\end{itemize}\n`
  const fresh = paperItemsFromMathpixOcr(ocr, { examLabel: 'JEE Advanced' })
  assert.equal(fresh.length, 2)
  assert.deepEqual(officialPyqMatchListLayoutProblems(fresh[0]), [])
  const broken = { ...fresh[0], text: fresh[0].text.replace(/\(4\)\nObeys PV = nRT/, '') }
  assert.ok(officialPyqMatchListLayoutProblems(broken).some((p) => p.includes('row (4)')))
  const fixed = repairOfficialPyqUntilQuality({ questions: [broken, fresh[1]], preparedText: ocr }).paper.questions[0]
  assert.deepEqual(officialPyqMatchListLayoutProblems(fixed), [])
})

clearOfficialPyqPendingPapers()
if (failed) {
  console.error(`\n${failed} error-type test(s) failed`)
  process.exit(1)
}
console.log('\nOfficial PYQ error-type tests passed')
process.exit(0)
