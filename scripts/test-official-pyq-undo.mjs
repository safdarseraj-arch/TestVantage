/**
 * Official PYQ admin edits: Undo last edit, Go back to the scanned version,
 * crop pictures that stay valid markup, and Compare that does not say
 * "matches" while the card still shows a problem.
 */
import assert from 'node:assert/strict'

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
if (typeof globalThis.sessionStorage === 'undefined') {
  globalThis.sessionStorage = globalThis.localStorage
}

const {
  addOfficialPyqPendingPaper,
  clearOfficialPyqPendingPapers,
  getOfficialPyqPendingPaper,
  updateOfficialPyqPendingPaper,
} = await import('../src/utils/officialPyqPendingStore.js')
const {
  OFFICIAL_PYQ_EDIT_HISTORY_MAX,
  approveOfficialPyqCard,
  insertOfficialPyqCropFigure,
  officialPyqCompareHasSuggestion,
  officialPyqDraftFigureProblem,
  officialPyqDraftFromSuggestion,
  officialPyqSuggestedFigures,
  officialPyqFigureMarkupProblem,
  restoreOfficialPyqCardFromScan,
  saveOfficialPyqCardEdit,
  undoOfficialPyqCardEdit,
} = await import('../src/utils/officialPyqCardEdit.js')
const {
  honestOfficialPyqCompareResult,
  officialPyqCardScreenProblems,
  officialPyqDrawnRawCode,
  officialPyqDrawnText,
  saveOfficialPyqCompareResult,
} = await import('../src/utils/officialPyqOriginalCompare.js')
const { officialPyqDrawnCutOff, officialPyqDrawnProblems } = await import('../src/utils/officialPyqDrawnCheck.js')
const { localOfficialPyqQualityCheck, repairOfficialPyqUntilQuality } = await import('../src/utils/officialPyqLocalQuality.js')
const { withoutRepeatedListTwoText } = await import('../src/utils/matchListTidy.js')
const { prepareTextForMathTextDisplay } = await import('../src/utils/prepareMathForRender.js')
const { dedupeRepeatedStemPhrase } = await import('../src/utils/dedupeStemText.js')
const { splitMathpixMediaSegments } = await import('../src/utils/mathpixMedia.js')
const { extendOfficialPyqHealCard } = await import('../src/utils/extendTruncatedStem.js')
const { enrichMatchListsFromOcr } = await import('../src/utils/restoreMatchListsOcr.js')
const { parseMatchingListForDisplay } = await import('../src/utils/parseMatchingListDisplay.js')
const { stemWithoutGraphAxisLeftovers } = await import('../src/utils/officialPyqCardTidy.js')
const { paperItemsFromMathpixOcr } = await import('../src/utils/mathpixQuestionSplit.js')
const { healUploadQuestionCard } = await import('../src/utils/uploadQualityGuards.js')

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

const CROP = '/api/official-pyq/original/crops/opyq-1-p21-a1d9e0b674ab1dc1.png'
const CROP_WITH_PLACE = `${CROP}?page=21&x0=0.1200&y0=0.3000&x1=0.8000&y1=0.5000`

function freshPaper(year, extra = {}) {
  const cards = Array.from({ length: 10 }, (_, i) => ({
    id: `card-${year}-${i + 1}`,
    text: `Question ${i + 1}: find the value of $x$ when $x + ${i} = ${i + 2}$.`,
    options: ['$1$', '$2$', '$3$', '$4$'],
    correctIndex: 1,
    pyqSlot: i + 1,
    questionNumber: i + 1,
  }))
  return addOfficialPyqPendingPaper({
    exam: 'jee-advanced',
    year,
    session: 'Paper 1',
    sourceLabel: 'test',
    questions: cards,
    ...extra,
  })
}

clearOfficialPyqPendingPapers()

test('undo restores the previous card, one save at a time, back to the scanned card', () => {
  const paper = freshPaper(2091)
  const original = getOfficialPyqPendingPaper(paper.id).questions[2]
  assert.equal(saveOfficialPyqCardEdit(paper.id, 2, { text: 'First fix of Q3: $x=1$.', options: original.options, answerKey: 'B' }).ok, true)
  assert.equal(saveOfficialPyqCardEdit(paper.id, 2, { text: 'Second fix of Q3: $x=2$.', options: original.options, answerKey: 'C' }).ok, true)
  let card = getOfficialPyqPendingPaper(paper.id).questions[2]
  assert.equal(card.editHistory.length, 2)
  assert.equal(card.correctIndex, 2)

  let out = undoOfficialPyqCardEdit(paper.id, 2)
  assert.equal(out.ok, true, out.error)
  card = getOfficialPyqPendingPaper(paper.id).questions[2]
  assert.equal(card.text, 'First fix of Q3: $x=1$.')
  assert.equal(card.correctIndex, 1)
  assert.equal(card.adminEdited, true)
  assert.equal(card.editHistory.length, 1)
  assert.ok(out.paper.localQuality, 'quality re-run after undo')

  out = undoOfficialPyqCardEdit(paper.id, 2)
  assert.equal(out.ok, true, out.error)
  assert.equal(out.restoredScan, true)
  card = getOfficialPyqPendingPaper(paper.id).questions[2]
  assert.equal(card.text, original.text)
  assert.equal(card.adminEdited, undefined)
  assert.equal(card.adminEditedAt, undefined)
  assert.equal(card.editHistory, undefined)

  const reparsed = getOfficialPyqPendingPaper(paper.id).questions.map((q) => ({ ...q, text: `${q.text} (re-parsed)` }))
  updateOfficialPyqPendingPaper(paper.id, { questions: reparsed })
  assert.match(getOfficialPyqPendingPaper(paper.id).questions[2].text, /re-parsed/, 'undone card is no longer locked')

  assert.equal(undoOfficialPyqCardEdit(paper.id, 2).ok, false, 'nothing left to undo')
})

test('edit history keeps only the last few versions and approve can be undone too', () => {
  const paper = freshPaper(2092)
  for (let n = 1; n <= OFFICIAL_PYQ_EDIT_HISTORY_MAX + 2; n += 1) {
    assert.equal(saveOfficialPyqCardEdit(paper.id, 4, { text: `Q5 version ${n}: $y=${n}$.`, options: ['$1$', '$2$', '$3$', '$4$'], answerKey: 'B' }).ok, true)
  }
  let card = getOfficialPyqPendingPaper(paper.id).questions[4]
  assert.equal(card.editHistory.length, OFFICIAL_PYQ_EDIT_HISTORY_MAX)
  assert.ok(card.editHistory.every((h) => !h.card.editHistory), 'snapshots never nest')

  assert.equal(approveOfficialPyqCard(paper.id, 4).ok, true)
  card = getOfficialPyqPendingPaper(paper.id).questions[4]
  assert.equal(card.adminApproved, true)
  assert.equal(undoOfficialPyqCardEdit(paper.id, 4).ok, true)
  card = getOfficialPyqPendingPaper(paper.id).questions[4]
  assert.equal(card.adminApproved, undefined)
  assert.match(card.text, /version 7/)
})

test('crop insert produces valid picture markup; a cut-off picture line cannot be saved', () => {
  const draft = { text: 'The total number of chiral molecules is $____$.', passageText: '', options: ['', '', '', ''] }
  const withPic = insertOfficialPyqCropFigure(draft, 'text', CROP_WITH_PLACE)
  assert.equal(withPic.text, `${draft.text}\n\\includegraphics{${CROP_WITH_PLACE}}`)
  assert.equal(officialPyqFigureMarkupProblem(withPic.text), '')
  assert.deepEqual(splitMathpixMediaSegments(withPic.text.split('\n')[1]), [{ kind: 'img', value: CROP_WITH_PLACE }])
  const optPic = insertOfficialPyqCropFigure(draft, '2', CROP)
  assert.equal(optPic.options[2], `\\includegraphics{${CROP}}`)
  assert.equal(officialPyqDraftFigureProblem(optPic), '')
  assert.throws(() => insertOfficialPyqCropFigure(draft, 'text', '/api/official-pyq/original/crops/opyq-1-p'))

  const cut = `${draft.text}\n\\includegraphics{/api/official-pyq/original/crops/opyq-1791600203377-1ynbz3j-p`
  assert.match(officialPyqFigureMarkupProblem(cut), /cut off/)
  assert.match(officialPyqFigureMarkupProblem(`${draft.text}\n\\includegraphics\${/api/official-pyq/original/crops/x-p`), /cut off/)
  assert.match(officialPyqFigureMarkupProblem(`see ![](${CROP}`), /cut off/)
  assert.match(officialPyqFigureMarkupProblem('\\includegraphics{/api/official-pyq/original/crops/opyq-1-p21}'), /cut off or wrong/)
  assert.equal(officialPyqFigureMarkupProblem('\\includegraphics{https://cdn.mathpix.com/cropped/x-12.jpg?height=171&width=186&top_left_y=2164&top_left_x=1210}'), '')

  const paper = freshPaper(2093)
  const before = getOfficialPyqPendingPaper(paper.id).questions[1].text
  const bad = saveOfficialPyqCardEdit(paper.id, 1, { text: cut, options: ['$1$', '$2$', '$3$', '$4$'], answerKey: 'B' })
  assert.equal(bad.ok, false)
  assert.match(bad.error, /cut off/)
  assert.equal(getOfficialPyqPendingPaper(paper.id).questions[1].text, before, 'broken picture line was not saved')
  const good = saveOfficialPyqCardEdit(paper.id, 1, { ...withPic, options: ['$1$', '$2$', '$3$', '$4$'], answerKey: 'B' })
  assert.equal(good.ok, true, good.error)
  assert.match(getOfficialPyqPendingPaper(paper.id).questions[1].text, /p21-a1d9e0b674ab1dc1\.png\?page=21&x0=0\.1200&y0=0\.3000&x1=0\.8000&y1=0\.5000\}$/)
})

test('Go back to the scanned version rebuilds the card from the stored scan and can be undone', () => {
  const scan = [
    '\\section*{CHEMISTRY}',
    '\\begin{itemize}',
    ...Array.from({ length: 10 }, (_, i) =>
      i === 7
        ? '\\item[Q.] 8 The total number of chiral molecules formed from one molecule of P on complete ozonolysis $\\left(\\mathrm{O}_{3}, \\mathrm{Zn} / \\mathrm{H}_{2} \\mathrm{O}\\right)$ is \\_\\_\\_\\_.'
        : `\\item[Q.] ${i + 1} Find the number of moles of gas number ${i + 1} formed when the sample is heated strongly in air. The value is \\_\\_\\_\\_.`,
    ),
    '\\end{itemize}',
  ].join('\n')
  const paper = freshPaper(2094, { preparedText: scan })
  const questions = getOfficialPyqPendingPaper(paper.id).questions.map((q, i) =>
    i === 7
      ? {
          ...q,
          printedNumber: 8,
          options: [],
          text: `The total number of chiral molecules formed from one molecule of P on complete ozonolysis is $____$.\n\\includegraphics{/api/official-pyq/original/crops/opyq-1-p`,
          adminEdited: true,
          adminEditedAt: Date.now(),
        }
      : q,
  )
  updateOfficialPyqPendingPaper(paper.id, { questions })
  const broken = getOfficialPyqPendingPaper(paper.id).questions[7]
  assert.equal(broken.adminEdited, true)

  const out = restoreOfficialPyqCardFromScan(paper.id, 7)
  assert.equal(out.ok, true, out.error)
  let card = getOfficialPyqPendingPaper(paper.id).questions[7]
  assert.equal(card.adminEdited, undefined)
  assert.match(card.text, /chiral molecules formed from one molecule of P on complete ozonolysis/)
  assert.doesNotMatch(card.text, /includegraphics/)
  assert.equal(card.editHistory.length, 1)

  assert.equal(undoOfficialPyqCardEdit(paper.id, 7).ok, true)
  card = getOfficialPyqPendingPaper(paper.id).questions[7]
  assert.equal(card.adminEdited, true)
  assert.equal(card.text, broken.text)

  const integerQuestions = getOfficialPyqPendingPaper(paper.id).questions.map((q, i) =>
    i === 7 ? { ...q, questionType: 'integer' } : q,
  )
  updateOfficialPyqPendingPaper(paper.id, { questions: integerQuestions })
  const saved = saveOfficialPyqCardEdit(paper.id, 7, {
    text: 'The total number of chiral molecules formed from one molecule of P is $\\_\\_\\_\\_$.',
    options: ['', '', '', ''],
  })
  assert.equal(saved.ok, true, saved.error)
  assert.deepEqual(getOfficialPyqPendingPaper(paper.id).questions[7].options, [])
})

test('Compare does not say "matches" while the card is flagged or shows raw code', () => {
  const drawnBroken = officialPyqDrawnText(
    'is $____$.\n\\includegraphics${/api/official-pyq/original/crops/opyq-1791600203377-1ynbz3j-p',
  )
  assert.ok(officialPyqDrawnRawCode(drawnBroken).some((p) => /picture line is broken/.test(p)))
  assert.deepEqual(officialPyqDrawnRawCode(officialPyqDrawnText('The value of n is $____$.')), [])
  assert.equal(officialPyqDrawnText('the speed is $____ \\mathrm{m} \\mathrm{s}^{-1}$.'), 'the speed is ____ ms−1.')
  assert.deepEqual(officialPyqDrawnRawCode(officialPyqDrawnText(`Molecule P\n<smiles>CC(O)C</smiles>\n\\includegraphics{${CROP}}`)), [])
  assert.ok(officialPyqDrawnRawCode('$$f(\\theta)=\\frac{1}{2}\\left|$$').length, 'math that does not draw is flagged')

  const paper = {
    localQuality: { failedGoTo: [44], lines: ['Go to Q 44. An integer or numerical question should have no options.'] },
  }
  const flagged = officialPyqCardScreenProblems(paper, 43, { text: 'clean text', passage: '', options: [] })
  assert.equal(flagged.length, 1)
  assert.match(flagged[0], /quality check flags Q44: An integer or numerical question should have no options/)
  assert.deepEqual(officialPyqCardScreenProblems(paper, 2, { text: 'clean text', options: [] }), [])

  const gemini = { verdict: 'matches', differences: [], suggested_text: '', pages: [21] }
  assert.equal(honestOfficialPyqCompareResult(gemini, []), gemini)
  const honest = honestOfficialPyqCompareResult(gemini, [...flagged, ...officialPyqDrawnRawCode(drawnBroken)])
  assert.equal(honest.verdict, 'differs')
  assert.equal(honest.textMatches, true)
  assert.ok(honest.differences.every((d) => d.kind === 'card_problem' && /words match the original, but/.test(d.detail)))
  const differs = { verdict: 'differs', differences: [{ kind: 'wrong_number', detail: '3 vs 5' }] }
  assert.equal(honestOfficialPyqCompareResult(differs, flagged), differs)

  const stored = freshPaper(2095)
  const saved = saveOfficialPyqCompareResult(stored.id, 3, honest)
  assert.equal(saved.questions[3].originalCompare.verdict, 'differs')
  assert.equal(saved.questions[3].originalCompare.textMatches, true)
  const fromServer = saveOfficialPyqCompareResult(stored.id, 4, { verdict: 'differs', text_matches: true, differences: [] })
  assert.equal(fromServer.questions[4].originalCompare.textMatches, true)
})

test('2013 P2 Q31: an option cut off after "and" is drawn in full, flagged when cut, and never "matches"', () => {
  const Q31_STEM = 'The pair(s) of coordination complexes/ions exhibiting the same kind of isomerism is(are)'
  const Q31_OPTIONS = [
    '$\\left[\\mathrm{Cr}\\left(\\mathrm{NH}_{3}\\right)_{5} \\mathrm{Cl}\\right] \\mathrm{Cl}_{2}$ and $\\left[\\mathrm{Cr}\\left(\\mathrm{NH}_{3}\\right)_{4} \\mathrm{Cl}_{2}\\right] \\mathrm{Cl}$',
    '$\\left[\\mathrm{Co}\\left(\\mathrm{NH}_{3}\\right)_{4} \\mathrm{Cl}_{2}\\right]^{+}$and $\\left[\\mathrm{Pt}\\left(\\mathrm{NH}_{3}\\right)_{2}\\left(\\mathrm{H}_{2} \\mathrm{O}\\right) \\mathrm{Cl}\\right]^{+}$',
    '$\\left[\\mathrm{CoBr}_{2} \\mathrm{Cl}_{2}\\right]^{2-}$ and $\\left[\\mathrm{PtBr}_{2} \\mathrm{Cl}_{2}\\right]^{2-}$',
    '$\\left[\\mathrm{Pt}\\left(\\mathrm{NH}_{3}\\right)_{3}\\left(\\mathrm{NO}_{3}\\right)\\right] \\mathrm{Cl}$ and $\\left[\\mathrm{Pt}\\left(\\mathrm{NH}_{3}\\right)_{3} \\mathrm{Cl}\\right] \\mathrm{Br}$',
  ]
  // Two complexes that start alike are not an OCR repeat: the display used to drop the second one.
  assert.equal(officialPyqDrawnText(Q31_OPTIONS[0]), '[Cr(NH3)5Cl]Cl2 and [Cr(NH3)4Cl2]Cl')
  assert.equal(officialPyqDrawnText(Q31_OPTIONS[3]), '[Pt(NH3)3(NO3)]Cl and [Pt(NH3)3Cl]Br')
  for (const opt of Q31_OPTIONS) assert.equal(prepareTextForMathTextDisplay(opt), opt)
  const chain = 'Packing efficiency of unit cell of $\\mathrm{x}>$ Packing efficiency of unit cell of $\\mathrm{y}>$ Packing efficiency of unit cell of z'
  assert.equal(dedupeRepeatedStemPhrase(chain), chain, '2023 P2 Q40: a phrase repeated with another letter is kept')
  const twice = 'Let ABC be a triangle with sides a, b and c opposite the angles. Let ABC be a triangle with sides a, b and c opposite the angles.'
  assert.equal(dedupeRepeatedStemPhrase(twice), 'Let ABC be a triangle with sides a, b and c opposite the angles.')

  const full = { text: Q31_STEM, options: Q31_OPTIONS, questionType: 'multiple_correct' }
  assert.deepEqual(officialPyqDrawnCutOff(full), [])
  assert.deepEqual(officialPyqDrawnProblems(full), [])
  const cut = { ...full, options: [Q31_OPTIONS[0].replace(/ \$\\left\[\\mathrm\{Cr\}.*\$$/, ' '), Q31_OPTIONS[1], Q31_OPTIONS[2], '$\\mathrm{X}$, '] }
  assert.match(cut.options[0], /\$ and $/)
  assert.deepEqual(officialPyqDrawnCutOff(cut), [
    'option A stops at “and” — the rest of the option is missing',
    'option D stops at “,” — the rest of the option is missing',
  ])
  assert.match(officialPyqDrawnProblems(cut)[0], /option A stops at “and”/)
  assert.deepEqual(officialPyqDrawnCutOff({ text: 'The output Y of the circuit is', options: ['AND', 'OR', 'NOR', 'NAND'] }), [])
  assert.deepEqual(
    officialPyqDrawnCutOff({
      text: 'Which one of the following statements is correct?',
      options: [
        'The balls will bounce back to the bottom plate carrying the same charge they went up with',
        'I → T, II → R, III → S, IV → Q,',
        'one or both',
        'The point (-2,',
      ],
    }),
    ['option D stops at “,” — the rest of the option is missing'],
  )
  assert.deepEqual(officialPyqDrawnCutOff({ text: 'Which of P and', options: [] }), [
    'the question stops at “and” — the rest of the question is missing',
  ])

  const withQ31 = (year, card) => {
    const made = freshPaper(year)
    const questions = getOfficialPyqPendingPaper(made.id).questions.map((q, i) =>
      i === 4 ? { ...q, subject: 'chemistry', ...card, correctIndices: [1, 3] } : q,
    )
    updateOfficialPyqPendingPaper(made.id, { questions })
    return getOfficialPyqPendingPaper(made.id)
  }
  const whole = localOfficialPyqQualityCheck(withQ31(2098, full))
  assert.ok(!whole.failedGoTo.includes(5), `the full card passes\n${whole.lines.join('\n')}`)
  const stored = withQ31(2097, cut)
  const quality = localOfficialPyqQualityCheck(stored)
  assert.ok(quality.failedGoTo.includes(5), 'the cut-off card fails the local check')
  assert.ok(quality.lines.some((l) => /^Go to Q 5\. On screen, option A stops at “and”/.test(l)), quality.lines.join('\n'))
  const approved = { ...stored, questions: stored.questions.map((q, i) => (i === 4 ? { ...q, adminApproved: true } : q)) }
  assert.ok(localOfficialPyqQualityCheck(approved).failedGoTo.includes(5), 'approving does not hide a cut-off option')

  const drawn = { text: officialPyqDrawnText(cut.text), passage: '', options: cut.options.map((o) => officialPyqDrawnText(o)) }
  const problems = officialPyqCardScreenProblems({ localQuality: { failedGoTo: [] } }, 4, drawn)
  assert.ok(problems.some((p) => /option A stops at “and”/.test(p)), 'Compare is told the option is cut off')
  const honest = honestOfficialPyqCompareResult({ verdict: 'matches', differences: [], pages: [22] }, problems)
  assert.equal(honest.verdict, 'differs')
  const saved = saveOfficialPyqCompareResult(stored.id, 4, honest, stored.questions[4])
  assert.notEqual(saved.questions[4].originalCompare.verdict, 'matches')

  const fromPage = officialPyqDraftFromSuggestion(stored.questions[4], {
    verdict: 'differs',
    suggestedOptions: ['(A) ' + Q31_OPTIONS[0], '', '', '(D) ' + Q31_OPTIONS[3]],
  })
  assert.deepEqual(fromPage.options, [Q31_OPTIONS[0], Q31_OPTIONS[1], Q31_OPTIONS[2], Q31_OPTIONS[3]], 'the page fills only the cut options')
  assert.deepEqual(officialPyqDrawnCutOff(fromPage), [])
})

test('Compare pictures cut from the original replace broken SMILES / pictures; Fix it now saves them and Undo works', () => {
  const at = (hex, y0, y1) =>
    `/api/official-pyq/original/crops/opyq-1-p22-${hex.repeat(16)}.png?page=22&x0=0.1960&y0=${y0}&x1=0.5410&y1=${y1}`
  const SCHEME = '/api/official-pyq/original/crops/opyq-1-p22-aaaaaaaaaaaaaaaa.png?page=22&x0=0.1620&y0=0.1140&x1=0.6900&y1=0.2530'
  const OPTS = [at('b', '0.2880', '0.4130'), at('c', '0.4440', '0.5490'), at('d', '0.5780', '0.6970'), at('e', '0.7260', '0.8530')]
  const SMILES = ['O=C1CCc2ccccc21', 'O=C(Cl)Cc1ccccc1', 'O=C(O)CCc1ccccc1', 'O=C1CCc2ccccc21'].map((s) => `<smiles>${s}</smiles>`)
  const paper = freshPaper(2096)
  const questions = getOfficialPyqPendingPaper(paper.id).questions.map((q, i) =>
    i === 2
      ? {
          ...q,
          subject: 'chemistry',
          questionType: 'multiple_correct',
          text: 'Consider the following reaction scheme and choose the correct option(s) for the major products Q, R and S.\n\\includegraphics{https://cdn.mathpix.com/cropped/x-22.jpg?height=179&width=1074&top_left_y=348&top_left_x=345}\n$$\\mathbf{P} \\xrightarrow[\\text { (ii) } \\mathrm{NaCN}]{\\text { (i) } \\mathrm{SOCl}_{2}}$$',
          options: SMILES,
          correctIndex: 0,
        }
      : q,
  )
  updateOfficialPyqPendingPaper(paper.id, { questions })
  const card = getOfficialPyqPendingPaper(paper.id).questions[2]

  const stem = 'Consider the following reaction scheme and choose the correct option(s) for the major products $\\mathbf{Q}$, $\\mathbf{R}$ and $\\mathbf{S}$.'
  const result = {
    verdict: 'differs',
    differences: [{ kind: 'missing_figure', detail: 'Each option shows three structures Q, R, S.' }],
    suggested_text: `${stem}\n[figure]`,
    suggested_options: [],
    suggested_figures: { text: [SCHEME], passage: [], options: OPTS.map((u) => [u]) },
  }
  const saved = saveOfficialPyqCompareResult(paper.id, 2, result)
  const compare = saved.questions[2].originalCompare
  assert.deepEqual(compare.suggestedFigures, { text: [SCHEME], passage: [], options: OPTS.map((u) => [u]) })
  assert.equal(officialPyqCompareHasSuggestion(compare), true, 'Fix it now is offered')
  assert.equal(
    officialPyqCompareHasSuggestion({ ...compare, suggestedText: '[figure]', suggestedFigures: undefined }),
    false,
    'a bare [figure] with no picture offers nothing',
  )
  assert.equal(officialPyqCompareHasSuggestion({ suggestedFigures: { options: [[], [OPTS[1]]] } }), true, 'pictures alone count')

  const draft = officialPyqDraftFromSuggestion(card, compare)
  assert.equal(draft.text, `${stem}\n\\includegraphics{${SCHEME}}`)
  assert.doesNotMatch(draft.text, /cdn\.mathpix|xrightarrow|\[figure\]/i, 'old picture and broken scheme are gone')
  assert.deepEqual(draft.options, OPTS.map((u) => `\\includegraphics{${u}}`), 'each option shows its crop instead of SMILES')
  assert.deepEqual(draft.options[0], insertOfficialPyqCropFigure({ text: '', passageText: '', options: [''] }, '0', OPTS[0]).options[0])
  assert.equal(officialPyqDraftFigureProblem(draft), '')
  assert.deepEqual(splitMathpixMediaSegments(draft.options[0]), [{ kind: 'img', value: OPTS[0] }])

  const fixed = saveOfficialPyqCardEdit(paper.id, 2, draft)
  assert.equal(fixed.ok, true, fixed.error)
  let now = getOfficialPyqPendingPaper(paper.id).questions[2]
  assert.equal(now.text, draft.text)
  assert.deepEqual(now.options, draft.options)
  assert.equal(now.originalCompare, undefined)
  assert.equal(now.editHistory.length, 1)
  assert.ok(!(fixed.paper.localQuality.failedGoTo || []).includes(3), 'quality check passes the fixed card')

  assert.equal(undoOfficialPyqCardEdit(paper.id, 2).ok, true)
  now = getOfficialPyqPendingPaper(paper.id).questions[2]
  assert.deepEqual(now.options, SMILES, 'Undo brings the old options back')
  assert.match(now.text, /cdn\.mathpix/)
})

test('Compare pictures: only crop addresses are kept, and [figure] marks decide where they go', () => {
  const A = '/api/official-pyq/original/crops/opyq-1-p3-1111111111111111.png?page=3&x0=0.1000&y0=0.2000&x1=0.4000&y1=0.3000'
  const B = '/api/official-pyq/original/crops/opyq-1-p3-2222222222222222.png?page=3&x0=0.5000&y0=0.2000&x1=0.8000&y1=0.3000'
  assert.deepEqual(
    officialPyqSuggestedFigures({ text: ['https://example.com/x.png', '/api/official-pyq/original/crops/opyq-1-p', A], options: [[], [B], []] }),
    { text: [A], passage: [], options: [[], [B]] },
  )
  assert.deepEqual(officialPyqSuggestedFigures(undefined), { text: [], passage: [], options: [] })

  const card = { text: 'See <smiles>CC</smiles> here and ![](https://cdn.mathpix.com/cropped/y-1.jpg) too.', options: ['<smiles>C</smiles>', 'water', '$3$', '$4$'] }
  const noWords = officialPyqDraftFromSuggestion(card, { suggestedFigures: { text: [A, B], options: [[A, B]] } })
  assert.equal(noWords.text, `See\n\\includegraphics{${A}}\n\\includegraphics{${B}}\nhere and too.`, 'crops go where the first old picture was')
  assert.equal(noWords.options[0], `\\includegraphics{${A}}\n\\includegraphics{${B}}`)
  assert.deepEqual(noWords.options.slice(1), ['water', '$3$', '$4$'], 'options without pictures stay')

  const C = '/api/official-pyq/original/crops/opyq-1-p3-4444444444444444.png?page=3&x0=0.1000&y0=0.5000&x1=0.4000&y1=0.6000'
  const twoMarks = officialPyqDraftFromSuggestion(card, {
    suggestedText: 'First [figure] then [figure 2] and [figure 3].',
    suggestedOptions: ['(A) Q: [figure]', '', '', ''],
    suggestedFigures: { text: [A, B], options: [[C]] },
  })
  assert.equal(twoMarks.text, `First\n\\includegraphics{${A}}\nthen\n\\includegraphics{${B}}\nand .`)
  assert.equal(twoMarks.options[0], `Q:\n\\includegraphics{${C}}`)
  // 2013 P1 Q15: the question's own picture is never kept as an option's picture.
  const repeated = officialPyqDraftFromSuggestion(card, {
    suggestedText: 'First [figure] then [figure 2].',
    suggestedOptions: ['(A) Q: [figure]', '', '', ''],
    suggestedFigures: { text: [A, B], options: [[B]] },
  })
  assert.equal(repeated.options[0].includes(B), false)

  const textOnly = officialPyqDraftFromSuggestion(card, { suggestedText: 'Fixed words [figure]', suggestedFigures: {} })
  assert.equal(textOnly.text, 'Fixed words\n![](https://cdn.mathpix.com/cropped/y-1.jpg)', 'without crops the old picture stays')

  // 2014 P2 Q37: Compare rewrites the lists as a code table. The pictures are kept; the lists are not.
  const scheme = '/api/official-pyq/original/crops/opyq-1-p25-3333333333333333.png?page=25&x0=0.1485&y0=0.2293&x1=0.8551&y1=0.5225'
  const structures = '/api/official-pyq/original/crops/opyq-1-p25-4444444444444444.png?page=25&x0=0.4273&y0=0.5265&x1=0.8351&y1=0.6907'
  const piece = (y, h, w, x) =>
    `\\includegraphics{https://cdn.mathpix.com/cropped/19934504-6d9e-413a-a44e-2618e323b5ad-25.jpg?height=${h}&width=${w}&top_left_y=${y}&top_left_x=${x}}`
  const q37 = {
    text: [
      'Different possible thermal decomposition pathways for peroxyesters are shown below. Match each pathway from List I with an appropriate structure from List II.',
      piece(645, 140, 355, 743),
      piece(867, 133, 851, 751),
      'compound ↑',
      piece(933, 180, 338, 321),
      '(Peroxyester)',
      piece(1080, 126, 856, 749),
      'compound ↑',
      piece(1292, 128, 722, 752),
      '',
      'List-I',
      '',
      '(P)',
      'Pathway P',
      '',
      '(Q)',
      'Pathway Q',
      '',
      '(R)',
      'Pathway R',
      '',
      '(S)',
      'Pathway S',
      '',
      'List-II',
      '',
      '(1)',
      '',
      '<smiles>COOC(=O)Cc1ccccc1</smiles>',
      '',
      '(4)',
      '',
      '<smiles>CC(C)(OOC(=O)c1ccccc1)c1ccccc1</smiles>',
    ].join('\n'),
    options: ['P-1, Q-3, R-4, S-2', 'P-2, Q-4, R-3, S-1', 'P-4, Q-1, R-2, S-3', 'P-3, Q-2, R-1, S-4'],
  }
  const rewritten = officialPyqDraftFromSuggestion(q37, {
    suggestedText: 'Different possible thermal decomposition pathways.\n[figure]\n\\begin{tabular}{ll}\nList-I & List-II \\\\\nP. Pathway P & [figure] \\\\\n\\end{tabular}\nCodes:\n\\begin{tabular}{lllll}\n & P & Q & R & S \\\\\n(A) & 1 & 3 & 4 & 2 \\\\\n\\end{tabular}',
    suggestedOptions: ['(A) P-1, Q-3, R-4, S-2'],
    suggestedFigures: { text: [scheme, structures], passage: [], options: [] },
  })
  assert.match(rewritten.text, new RegExp(scheme.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(rewritten.text, new RegExp(structures.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(rewritten.text, /\(P\)\nPathway P/)
  assert.doesNotMatch(rewritten.text, /compound|Peroxyester|smiles|tabular|Codes:/)
  assert.deepEqual(rewritten.options, q37.options)

  const kept = extendOfficialPyqHealCard(
    { ...rewritten, questionType: 'matrix_match' },
    `Q. 37 ${q37.text}\ncompound ↑\n(Peroxyester)\n<smiles>COOC(=O)Cc1ccccc1</smiles>`,
  )
  assert.equal(kept.text, rewritten.text, 'opening the paper does not paste the scan over the original-page pictures')
  const enriched = enrichMatchListsFromOcr(kept, `match List-II\n(1)\n<smiles>COOC(=O)Cc1ccccc1</smiles>`)
  assert.equal(enriched.text, rewritten.text)
  const shown = parseMatchingListForDisplay(rewritten.text, rewritten.options)
  assert.match(shown.intro, /3333333333333333/, 'the scheme stays above the lists')
  assert.deepEqual(
    shown.listI.map((row) => row.text.replace(/\s+/g, ' ').trim()),
    ['Pathway P', 'Pathway Q', 'Pathway R', 'Pathway S'],
  )
  assert.equal(shown.listII.length, 1)
  assert.match(shown.listII[0].text, /4444444444444444/)

  const honest = honestOfficialPyqCompareResult({ verdict: 'matches', suggested_figures: { text: [A] } }, ['flagged'])
  assert.equal(honest.suggested_figures, undefined)
})

test('2013 P2: a "Paragraphs for Questions" heading is no card of its own, and a plain "SECTION - 1" line ends the list section', () => {
  const ocr = [
    '\\section*{PART II : CHEMISTRY}',
    '\\section*{SECTION - 2 : (Paragraph Type) \\\\ -2 : }',
    'This section contains 4 paragraphs each describing theory, experiment, data etc. Each question has only one correct answer.',
    '\\section*{Paragraphs for Questions 35 and 36 \\\\ 35 36 }',
    '$P$ and $\\boldsymbol{Q}$ are isomers of dicarboxylic acid $\\mathrm{C}_{4} \\mathrm{H}_{4} \\mathrm{O}_{4}$. Both decolorize $\\mathrm{Br}_{2} / \\mathrm{H}_{2} \\mathrm{O}$. On heating, $\\boldsymbol{P}$ forms the cyclic anhydride.',
    '<smiles>O=C(O)C(O)C(O)C(=O)O</smiles>',
    '',
    '$\\boldsymbol{S}$',
    '\\begin{itemize}',
    '\\item[Q.] 35 Compounds formed from $\\boldsymbol{P}$ and $\\boldsymbol{Q}$ are, respectively',
    '(A) Optically active $\\boldsymbol{S}$ and optically active pair $(\\boldsymbol{T}, \\boldsymbol{U})$',
    '(B) Optically inactive $\\boldsymbol{S}$ and optically inactive pair $(\\boldsymbol{T}, \\boldsymbol{U})$',
    '(C) Optically active pair $(\\boldsymbol{T}, \\boldsymbol{U})$ and optically active $\\boldsymbol{S}$',
    '(D) Optically inactive pair $(\\boldsymbol{T}, \\boldsymbol{U})$ and optically inactive $\\boldsymbol{S}$',
    '\\end{itemize}',
    '',
    '\\section*{ANSWER : B}',
    '\\begin{itemize}',
    '\\item[Q.] 36 Which of the compounds $\\boldsymbol{S}, \\boldsymbol{T}$ or $\\boldsymbol{U}$ is formed from $\\boldsymbol{Q}$ on hydrogenation',
    '(A) only $\\boldsymbol{S}$',
    '(B) only $\\boldsymbol{T}$',
    '(C) only $\\boldsymbol{U}$',
    '(D) none of these',
    '\\end{itemize}',
    '',
    '\\section*{SECTION - 3 : (Matching List Type) \\\\ - 3 : }',
    'This section contains 4 multiple choice questions. Each question has matching lists. The codes for the lists have choices (A), (B), (C) and (D) out of which ONLY ONE is correct.',
    '\\begin{itemize}',
    '\\item[Q.] 37 Match the reactions in List I with the reagents in List II and select the correct answer using the code given below the lists :',
    'List I',
    '\\item[P.] reaction one',
    '\\item[Q.] reaction two',
    'List II',
    '\\item[1.] reagent one',
    '\\item[2.] reagent two',
    '(A) P-1, Q-2',
    '(B) P-2, Q-1',
    '(C) P-1, Q-1',
    '(D) P-2, Q-2',
    '\\end{itemize}',
    '',
    '\\section*{PART III : MATHEMATICS}',
    '',
    'SECTION - 1 : (One or more options correct Type)',
    'This section contains 8 multiple choice questions. Each question has four choices (A), (B), (C) and (D) out of which ONE or MORE are correct.',
    '\\begin{itemize}',
    '\\item[Q.] 41 If $3^{x}=4^{x-1}$, then $x=$',
    '(A) $\\frac{2 \\log _{3} 2}{2 \\log _{3} 2-1}$',
    '(B) $\\frac{2}{2-\\log _{2} 3}$',
    '(C) $\\frac{1}{1-\\log _{4} 3}$',
    '(D) $\\frac{2 \\log _{2} 3}{2 \\log _{2} 3-1}$',
    '\\end{itemize}',
    '',
    '\\section*{ANSWER : ABC}',
    '\\begin{itemize}',
    '\\item[Q.] 42 Let $f(x)=x \\sin \\pi x$, $x>0$. Then for all natural numbers $n$, $f^{\\prime}(x)$ vanishes at',
    '(A) a unique point in the interval $\\left(n, n+\\frac{1}{2}\\right)$',
    '(B) a unique point in the interval $\\left(n+\\frac{1}{2}, n+1\\right)$',
    '(C) a unique point in the interval $(n, n+1)$',
    '(D) two points in the interval $(n, n+1)$',
    '\\end{itemize}',
  ].join('\n')
  const cards = paperItemsFromMathpixOcr(ocr)
  assert.deepEqual(cards.map((q) => Number(q.printedNumber)), [35, 36, 37, 41, 42])
  assert.ok(cards.every((q) => !/^\s*Paragraphs?\s+for/i.test(String(q.text ?? ''))), 'the heading is not a card')
  for (const q of cards.slice(0, 2)) assert.match(String(q.passageText ?? ''), /isomers of dicarboxylic acid/)
  assert.equal(cards[2].questionType, 'matrix_match')
  assert.deepEqual(cards.slice(3).map((q) => q.questionType), ['multiple_correct', 'multiple_correct'])
})

test('2013 P2 Q36: options cut from the original page are kept, not dropped as stray pictures', () => {
  const crop = (n) => `\\includegraphics{/api/official-pyq/original/crops/opyq-1-p25-${n}.png?page=25&x0=0.2059&y0=0.2810&x1=0.4395&y1=0.3686}`
  const options = ['0a1b2c3d4e5f6a7b', '1a1b2c3d4e5f6a7b', '2a1b2c3d4e5f6a7b', '3a1b2c3d4e5f6a7b'].map(crop)
  const card = {
    id: 'q36',
    text: `In the following reaction sequences $V$ and $W$ are, respectively\n${crop('9a1b2c3d4e5f6a7b')}`,
    options,
    questionType: 'single_correct',
    printedNumber: 36,
    adminEdited: true,
  }
  const scan = [
    '\\section*{SECTION - 2 : (Paragraph Type) \\\\ -2 : }',
    '\\section*{Paragraph for Questions 35 and 36 \\\\ 35 36 }',
    '$P$ and $\\boldsymbol{Q}$ are isomers of dicarboxylic acid $\\mathrm{C}_{4} \\mathrm{H}_{4} \\mathrm{O}_{4}$. Both decolorize $\\mathrm{Br}_{2} / \\mathrm{H}_{2} \\mathrm{O}$. On heating, $\\boldsymbol{P}$ forms the cyclic anhydride.',
    '\\begin{itemize}',
    '\\item[Q.] 35 Compounds formed from $\\boldsymbol{P}$ and $\\boldsymbol{Q}$ are, respectively',
    '(A) Optically active $\\boldsymbol{S}$',
    '(B) Optically inactive $\\boldsymbol{S}$',
    '(C) Optically active pair $(\\boldsymbol{T}, \\boldsymbol{U})$',
    '(D) Optically inactive pair $(\\boldsymbol{T}, \\boldsymbol{U})$',
    '\\end{itemize}',
    '',
    '\\section*{ANSWER : B}',
    '\\begin{itemize}',
    '\\item[Q.] 36 In the following reaction sequences $\\boldsymbol{V}$ and $\\boldsymbol{W}$ are, respectively , $\\boldsymbol{V}$ $\\boldsymbol{W}$',
    '$$Q \\xrightarrow[\\Delta]{\\mathrm{H}_{2} / \\mathrm{Ni}} V$$',
    '![](https://cdn.mathpix.com/cropped/d2a1c4c0-25.jpg?height=130&width=915&top_left_y=648&top_left_x=338)',
    '\\begin{itemize}',
    '\\item[(A)]',
    '<smiles>O=C1CCC(=O)C(=O)O1</smiles>',
    'and/',
    '<smiles>O=C1CCCc2ccccc21</smiles>',
    '',
    '$\\boldsymbol{W}$',
    '\\item[(B)]',
    '<smiles>OC/C=C\\CCO</smiles>',
    'and/',
    '<smiles>C1=CC2=CCCC=C2CC1</smiles>',
    '\\end{itemize}',
    '\\end{itemize}',
    '',
    '\\section*{SECTION - 3 : (Matching List Type) \\\\ - 3 : }',
  ].join('\n')
  const healed = healUploadQuestionCard(card, scan)
  assert.deepEqual(healed.options, options)
  const paper = { id: 'p-q36', officialPyq: true, preparedText: scan, questions: [card] }
  assert.doesNotMatch(localOfficialPyqQualityCheck(paper).lines.join('\n'), /MCQ option is empty/)
})

const { detectAnswerFromPaper } = await import('../src/utils/answerProvenance.js')
const { stripBilingualScanLeftovers, bilingualLeftoversOnCard } = await import('../src/utils/bilingualScanLeftovers.js')
const { dropOptionFigureRepeatingStem } = await import('../src/utils/optionRepeatsStemFigure.js')
const { missingStructureLabels, restoreStructureLabels } = await import('../src/utils/structureLabels.js')
const { reviewOfficialPyqCards } = await import('../src/utils/officialPyqUnifiedCheck.js')
const { labelNumberedQuestions } = await import('../src/utils/numberedQuestionMarkers.js')

test('2013 P2: a multiple-correct key printed as glued letters ("ANSWER : AD") is read', () => {
  assert.deepEqual(detectAnswerFromPaper('ANSWER : AD').correctIndices, [0, 3])
  assert.deepEqual(detectAnswerFromPaper('\\section*{ANSWER : ACD}').correctIndices, [0, 2, 3])
  assert.equal(detectAnswerFromPaper('ANSWER : ABCD or BCD').answerSource, 'unknown')
  assert.equal(detectAnswerFromPaper('Answer: Bad luck').answerSource, 'unknown')
})

test('2013 P2: leftovers of the dropped Hindi copy are removed from the scan', () => {
  const scan = [
    '(2) $\\mu_{2}>\\mu_{1}$ and/ $\\mu_{2}>\\mu_{3}$',
    'List I / I',
    '(3) Warm/',
    '\\item[Q.] 26 In the following reaction, the product(s) formed is(are) /',
    '(A) $\\boldsymbol{P}$ (major) $\\boldsymbol{P}$',
    '\\item[Q.] 56 If chord $P Q$ subtends an angle $\\theta$ at the vertex of $y^{2}=4 a x$, then $\\tan \\theta=$ $P Q, y^{2}=4 a x$ $\\theta$ $\\tan \\theta=$',
  ].join('\n')
  assert.equal(
    stripBilingualScanLeftovers(scan),
    [
      '(2) $\\mu_{2}>\\mu_{1}$ and $\\mu_{2}>\\mu_{3}$',
      'List I',
      '(3) Warm',
      '\\item[Q.] 26 In the following reaction, the product(s) formed is(are)',
      '(A) $\\boldsymbol{P}$ (major)',
      '\\item[Q.] 56 If chord $P Q$ subtends an angle $\\theta$ at the vertex of $y^{2}=4 a x$, then $\\tan \\theta=$',
    ].join('\n'),
  )
  for (const english of [
    'A gas with $p=2$ and $V=3$ has $pV=6$, $p$, $V$ fixed.',
    'Let $\\vec{a}$, $\\vec{b}$, $\\vec{c}$ be unit vectors. Then the vectors $\\vec{a}$, $\\vec{b}$, $\\vec{c}$',
    '(A) $0$ and $0$',
    'Speed in km/h and/or m/s',
  ]) {
    assert.equal(stripBilingualScanLeftovers(english), english)
  }
  assert.ok(bilingualLeftoversOnCard({ text: 'List II / II\n(1) NO', options: ['P-1'] }).length)
  assert.deepEqual(bilingualLeftoversOnCard({ text: 'Find $x$ in km/h.', options: ['$1$', '$2$'] }), [])
})

test('2013 P2 Q30: the second A-D list that is the first one without its words is dropped', () => {
  const scan = [
    '(A) K to L and L to M',
    '(B) L to M and N to K',
    '(C) L to M and M to N',
    '(D) M to N and N to K',
    '(A) K L L M',
    '(B) L M N K',
    '(C) L M M N',
    '(D) M N N K',
  ].join('\n')
  assert.equal(stripBilingualScanLeftovers(scan), scan.split('\n').slice(0, 4).join('\n'))
})

test('2013 P2: a bilingual heading keeps no Hindi question numbers', () => {
  const out = labelNumberedQuestions('\\section*{Paragraph for Questions 9 and 10 \\\\ 9 10}\nA body moves.')
  assert.doesNotMatch(out, /\\\\\s*9 10/)
  assert.match(out, /Paragraph for Questions 9 and 10/)
})

test('2013 P2 Q2, Q3: an option does not repeat the stem figure; the check flags it', () => {
  const fig = 'https://cdn.mathpix.com/cropped/x-02.jpg?height=394&width=598&top_left_y=757&top_left_x=763'
  const card = {
    text: `At all points in the overlapping region,\n\\includegraphics{${fig}}`,
    questionType: 'multiple_correct',
    options: ['zero.', 'constant.', 'constant in magnitude.', `same direction. ![](${fig})`],
  }
  assert.equal(dropOptionFigureRepeatingStem(card).options[3], 'same direction.')
  assert.match(reviewOfficialPyqCards([card], '', null, { cardsOnly: true }).messages.join('\n'), /repeats the question's figure/)
  const own = { ...card, options: ['a', 'b', 'c', '![](https://cdn.mathpix.com/cropped/x-03.jpg)'] }
  assert.equal(dropOptionFigureRepeatingStem(own), own)
})

test('2013 P2 Q26, Q27: a lost letter label under the last drawing is restored and flagged', () => {
  const card = {
    text: [
      'The major product(s) of the following reaction is(are)',
      '<smiles>Oc1ccccc1</smiles>',
      '',
      '$\\boldsymbol{P}$',
      '<smiles>Oc1ccc(Br)cc1</smiles>',
      '',
      '$\\boldsymbol{Q}$',
      '<smiles>Oc1ccccc1Br</smiles>',
      '',
      '$\\boldsymbol{R}$',
      '<smiles>Oc1cccc(Br)c1</smiles>',
    ].join('\n'),
    questionType: 'multiple_correct',
    options: ['$\\boldsymbol{P}$', '$\\boldsymbol{Q}$', '$\\boldsymbol{R}$', '$\\boldsymbol{S}$'],
  }
  assert.deepEqual(missingStructureLabels(card), ['S'])
  assert.match(reviewOfficialPyqCards([card], '', null, { cardsOnly: true }).messages.join('\n'), /structures S/)
  const fixed = restoreStructureLabels(card)
  assert.match(fixed.text, /<smiles>Oc1cccc\(Br\)c1<\/smiles>\n\$\\boldsymbol\{S\}\$$/)
  assert.deepEqual(missingStructureLabels(fixed), [])
  const inPicture = { ...card, text: card.text.replace(/\n\$\\boldsymbol\{[PQR]\}\$/g, '') }
  assert.deepEqual(missingStructureLabels(inPicture), [])
})

test('2013 P2 Q36: S, T, U drawn as one SMILES are flagged (the scan lost the isomers)', () => {
  const tartaric = '<smiles>O=C(O)C(O)C(O)C(=O)O</smiles>'
  const card = {
    passageText: `P and Q could produce one or more than one from S, T and U.\n${tartaric}\n\n$\\boldsymbol{S}$\n${tartaric}\n\n$\\boldsymbol{T}$`,
    text: 'Compounds formed from P and Q are, respectively',
    questionType: 'single_correct',
    options: ['one', 'two', 'three', 'four'],
  }
  assert.match(reviewOfficialPyqCards([card], '', null, { cardsOnly: true }).messages.join('\n'), /same structure/)
  const distinct = { ...card, passageText: card.passageText.replace(tartaric, '<smiles>O=C(O)[C@@H](O)[C@H](O)C(=O)O</smiles>') }
  assert.doesNotMatch(reviewOfficialPyqCards([distinct], '', null, { cardsOnly: true }).messages.join('\n'), /same structure/)
})

test('2013 P2 Q60: an answer marked "from the paper" where the scan prints no key is flagged', () => {
  const scan = [
    '\\begin{itemize}',
    '\\item[Q.] 1 Find the value of $x$ when $x+1=3$ for the given equation here.',
    '(A) $1$',
    '(B) $2$',
    '(C) $3$',
    '(D) $4$',
    '\\end{itemize}',
    '',
    'ANSWER : B',
    '\\begin{itemize}',
    '\\item[Q.] 2 Find the value of $y$ when $y+2=6$ for the given equation here.',
    '(A) $1$',
    '(B) $2$',
    '(C) $3$',
    '(D) $4$',
    '\\end{itemize}',
  ].join('\n')
  const cards = paperItemsFromMathpixOcr(scan)
  assert.equal(cards.length, 2)
  assert.equal(cards[0].correctIndex, 1)
  assert.equal(cards[1].answerSource === 'from_paper', false)
  const carried = [cards[0], { ...cards[1], correctIndex: 0, answerSource: 'from_paper' }]
  const lines = localOfficialPyqQualityCheck({ id: 'p-q60', officialPyq: true, preparedText: scan, questions: carried }).lines.join('\n')
  assert.match(lines, /Go to Q 2\. The answer is marked “answer from the paper”, and the paper prints no answer/)
  const typed = [cards[0], { ...cards[1], correctIndex: 3, answerSource: 'admin_edit' }]
  assert.doesNotMatch(
    localOfficialPyqQualityCheck({ id: 'p-q60', officialPyq: true, preparedText: scan, questions: typed }).lines.join('\n'),
    /prints no answer/,
  )
  // 2025 P1 Q31: the scan lost the key, Compare read the same "A" on the original page.
  const onPage = [cards[0], { ...cards[1], correctIndex: 0, answerSource: 'from_paper', originalCompare: { verdict: 'differs', printedAnswer: 'A' } }]
  assert.doesNotMatch(
    localOfficialPyqQualityCheck({ id: 'p-q60', officialPyq: true, preparedText: scan, questions: onPage }).lines.join('\n'),
    /prints no answer/,
  )
  const otherOnPage = [cards[0], { ...cards[1], correctIndex: 0, answerSource: 'from_paper', originalCompare: { verdict: 'differs', printedAnswer: 'C' } }]
  assert.match(
    localOfficialPyqQualityCheck({ id: 'p-q60', officialPyq: true, preparedText: scan, questions: otherOnPage }).lines.join('\n'),
    /prints no answer/,
  )
  // The report went stale after a wording tidy; the page key it read was kept on the card.
  const keptKey = [cards[0], { ...cards[1], correctIndex: 0, answerSource: 'from_paper', pageAnswerKey: 'A' }]
  assert.doesNotMatch(
    localOfficialPyqQualityCheck({ id: 'p-q60', officialPyq: true, preparedText: scan, questions: keptKey }).lines.join('\n'),
    /prints no answer/,
  )
})

test('2025 P1 Q31: graph axis labels and a stray "(T)" between the list rows are removed', () => {
  const pic = (y, x) => `\\includegraphics{https://cdn.mathpix.com/cropped/9deb824d-21.jpg?height=120&width=450&top_left_y=${y}&top_left_x=${x}}`
  const text = [
    'A circuit with an electrical load having impedance $Z$ is connected with an AC source as shown in the diagram. List-I shows various options for the load. The possible currents $i(t)$ in the circuit are given in List-II.',
    pic(406, 886),
    'Choose the option that describes the correct match between the entries in List-I to those in List-II.',
    '',
    'List-I',
    `(P) ${pic(870, 462)}`,
    `(Q) ${pic(1160, 449)}`,
    '',
    '$i(t)$',
    `(R) ${pic(1439, 474)}`,
    '',
    '$i(t)$',
    `(S) ${pic(1740, 467)}`,
    '',
    '$i(t)$',
    '',
    'List-II',
    '(1) (T)',
    '',
    pic(868, 1293),
    `(2) ${pic(1150, 1312)}`,
    `(3) ${pic(1439, 1305)}`,
    `(4) ${pic(1748, 1312)}`,
    '',
    '$i(t)$',
    `(5) ${pic(2038, 1315)}`,
  ].join('\n')
  const tidy = stemWithoutGraphAxisLeftovers(text)
  assert.ok(tidy)
  assert.doesNotMatch(tidy, /^\$i\(t\)\$$/m)
  assert.doesNotMatch(tidy, /\(T\)/)
  assert.match(tidy, /currents \$i\(t\)\$ in the circuit/, 'the stem keeps its own i(t)')
  assert.match(tidy, /^\(1\) \\includegraphics/m)
  const shown = parseMatchingListForDisplay(tidy, ['P→3, Q→5, R→2, S→1', 'P→1, Q→5, R→2, S→3', 'P→3, Q→4, R→2, S→1', 'P→1, Q→4, R→2, S→5'])
  assert.equal(shown.listI.length, 4)
  assert.equal(shown.listII.length, 5)
  assert.ok(shown.listII.every((row) => /^\\includegraphics\{[^}]*\}$/.test(row.text.trim())), shown.listII.map((r) => r.text).join(' | '))
  const once = `(P) ${pic(870, 462)}\n\n$x$\n(Q) Two words`
  assert.equal(stemWithoutGraphAxisLeftovers(once), '', 'one short line after one picture is not an axis label')
})

test('2020 P1 Q24: the D-erythrose drawing and the table picture are not row (P) and row (1)', () => {
  const crop = (hash, box) =>
    `\\includegraphics{/api/official-pyq/original/crops/opyq-1793934592904-itk18sd-p14-${hash}.png?page=14&${box}}`
  const drawing = crop('2d6b478686b68f46', 'x0=0.4841&y0=0.0887&x1=0.5896&y1=0.1876')
  const table = crop('c8ec5a104eb47c7a', 'x0=0.3535&y0=0.2367&x1=0.7178&y1=0.5307')
  const sentence =
    'D-Erythrose and its isomers are listed as P, Q, R, and S in Column-I. Choose the correct relationship of P, Q, R, and S with D-erythrose from Column II.'
  const card = {
    text: ['The Fischer projection of D-erythrose is shown below.', drawing, sentence, table].join('\n'),
    options: [
      'P\\rightarrow 2, Q\\rightarrow 3, R\\rightarrow 2, S\\rightarrow 2',
      'P\\rightarrow 3, Q\\rightarrow 1, R\\rightarrow 1, S\\rightarrow 2',
      'P\\rightarrow 2, Q\\rightarrow 1, R\\rightarrow 1, S\\rightarrow 3',
      'P\\rightarrow 2, Q\\rightarrow 3, R\\rightarrow 3, S\\rightarrow 1',
    ],
    questionType: 'single_correct',
  }
  assert.equal(parseMatchingListForDisplay(card.text, card.options), null, 'the stem draws as written, sentence included')
  assert.equal(parseMatchingListForDisplay([card.text, crop('0000000000000000', 'page=14')].join('\n'), card.options), null)
  assert.deepEqual(officialPyqDrawnProblems(card), [])

  const textRows = { ...card, text: [card.text.replace(`\n${table}`, ''), '(1) Diastereomer', '(2) Identical', '(3) Enantiomer'].join('\n') }
  assert.match(
    officialPyqDrawnProblems(textRows).join('\n'),
    /List-I is drawn as one row \(P\) and question words are not shown/,
    'a one-row List-I that hides the sentence is flagged',
  )
})

test('2013 P2 Q19: List II is not added again when the scan dropped its heading', () => {
  const stem = [
    'Match List I with List II and select the correct answer using the codes given below the lists:',
    '(P) Boltzmann constant',
    '(Q) Coefficient of viscosity',
    '(R) Planck constant',
    '(S) Thermal conductivity',
    '(1) $\\left[\\mathrm{ML}^{2} \\mathrm{~T}^{-1}\\right]$',
    '(2) $\\left[\\mathrm{ML}^{-1} \\mathrm{~T}^{-1}\\right]$',
    '(3) $\\left[\\mathrm{MLT}^{-3} \\mathrm{~K}^{-1}\\right]$',
    '(4) $\\left[\\mathrm{ML}^{2} \\mathrm{~T}^{-2} \\mathrm{~K}^{-1}\\right]$',
  ].join('\n')
  const card = { text: stem, questionType: 'matrix_match', options: ['P-3, Q-1, R-2, S-4', 'P-3, Q-2, R-1, S-4', 'P-4, Q-2, R-1, S-3', 'P-4, Q-1, R-2, S-3'] }
  const scan = `\\item[Q.] 19 ${stem}\nList II\n${stem.split('\n').slice(5).join('\n')}`
  const enriched = enrichMatchListsFromOcr(card, scan)
  assert.equal((String(enriched.text).match(/\n\(1\)/g) || []).length, 1)
  const doubled = { ...card, text: `${stem}\nList II\n${stem.split('\n').slice(5).join('\n')}` }
  assert.match(reviewOfficialPyqCards([doubled], '', null, { cardsOnly: true }).messages.join('\n'), /List II is shown twice/)
})

test('2023 P1 Q17: a second List-II that repeats the first is removed by the auto-fix', () => {
  const lists = [
    'Let $z$ be a complex number satisfying $|z|^{3}+2 z^{2}+4 \\bar{z}-8=0$. Let the imaginary part of $z$ be nonzero.',
    'Match each entry in List-I to the correct entries in List-II.',
    '',
    'List-I',
    '',
    '(P)\n$|z|^{2}$ is equal to\n\n(Q)\n$|z-\\bar{z}|^{2}$ is equal to\n\n(R)\n$|z|^{2}+|z+\\bar{z}|^{2}$ is equal to\n\n(S)\n$|z+1|^{2}$ is equal to',
    '',
    'List-II',
    '',
    '(1)\n12\n\n(2)\n4\n\n(3)\n8\n\n(4)\n10\n\n(5)\n7',
  ].join('\n')
  const copy = '\n\nList-II\n(1) 12\n(2) 4\n(3) 8\n(4) 10\n(5) 7'
  assert.equal(withoutRepeatedListTwoText(lists + copy), lists)
  assert.equal(withoutRepeatedListTwoText(`${lists}${copy}\nChoose the correct option.`), `${lists}\n\nChoose the correct option.`)
  const other = '\n\nList-II\n(1) 12\n(2) 4\n(3) 9\n(4) 10\n(5) 7'
  assert.equal(withoutRepeatedListTwoText(lists + other), lists + other, 'a List-II with other rows is not a copy')
  assert.equal(withoutRepeatedListTwoText(lists), lists)
  const card = {
    id: 'q17',
    subject: 'mathematics',
    questionType: 'matrix_match',
    text: lists + copy,
    options: ['(P) → (1) (Q) → (3) (R) → (5) (S) → (4)', '(P) → (2) (Q) → (1) (R) → (3) (S) → (5)', '(P) → (2) (Q) → (4) (R) → (5) (S) → (1)', '(P) → (2) (Q) → (3) (R) → (5) (S) → (4)'],
    correctIndex: 3,
    answerSource: 'unknown',
  }
  const paper = { id: 'p-q17', officialPyq: true, preparedText: '', questions: [card] }
  assert.match(localOfficialPyqQualityCheck(paper).lines.join('\n'), /List II is shown twice/)
  const repaired = repairOfficialPyqUntilQuality(paper)
  assert.equal(repaired.paper.questions[0].text, lists)
  assert.doesNotMatch(repaired.quality.lines.join('\n'), /List II is shown twice|printed twice/)
})
if (failed) {
  console.error(`\n${failed} official PYQ undo test(s) failed`)
  process.exit(1)
}
console.log('\nAll official PYQ undo / crop / compare-honesty tests passed')
