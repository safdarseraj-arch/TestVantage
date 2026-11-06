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
const { splitMathpixMediaSegments } = await import('../src/utils/mathpixMedia.js')

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

  const twoMarks = officialPyqDraftFromSuggestion(card, {
    suggestedText: 'First [figure] then [figure 2] and [figure 3].',
    suggestedOptions: ['(A) Q: [figure]', '', '', ''],
    suggestedFigures: { text: [A, B], options: [[B]] },
  })
  assert.equal(twoMarks.text, `First\n\\includegraphics{${A}}\nthen\n\\includegraphics{${B}}\nand .`)
  assert.equal(twoMarks.options[0], `Q:\n\\includegraphics{${B}}`)

  const textOnly = officialPyqDraftFromSuggestion(card, { suggestedText: 'Fixed words [figure]', suggestedFigures: {} })
  assert.equal(textOnly.text, 'Fixed words\n![](https://cdn.mathpix.com/cropped/y-1.jpg)', 'without crops the old picture stays')

  const honest = honestOfficialPyqCompareResult({ verdict: 'matches', suggested_figures: { text: [A] } }, ['flagged'])
  assert.equal(honest.suggested_figures, undefined)
})
if (failed) {
  console.error(`\n${failed} official PYQ undo test(s) failed`)
  process.exit(1)
}
console.log('\nAll official PYQ undo / crop / compare-honesty tests passed')
