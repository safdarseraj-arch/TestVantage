/**
 * JEE Advanced 2012 Paper 2 review report: Q4 lost its circuit, Q9 showed the option drawings
 * twice, Q13/14 hid half the passage, Q22 option D lost "and CO respectively.", and the organic
 * structures (Q26, 28, 33, 34, 40) were drawn from the scan's SMILES codes.
 * Run: node scripts/test-official-pyq-2012-p2-cards.mjs
 */
import { readFileSync } from 'node:fs'

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
globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} }
globalThis.window = globalThis

const { parseQuestionText } = await import('../src/utils/parseQuestionText.js')
const { trimTrailingProseAfterMath } = await import('../src/utils/optionStemLeak.js')
const { paperItemsFromMathpixOcr } = await import('../src/utils/mathpixQuestionSplit.js')
const { dropOptionFigureRepeatingStem } = await import('../src/utils/optionRepeatsStemFigure.js')
const { findOptionsBlockStart } = await import('../src/utils/mcqOptionMarkers.js')
const { officialPyqScanStructureReason, officialPyqScanStructurePlace } = await import('../src/utils/officialPyqScanStructures.js')
const { officialPyqDraftFromSuggestion } = await import('../src/utils/officialPyqCardEdit.js')
const { repairOfficialPyqUntilQuality } = await import('../src/utils/officialPyqLocalQuality.js')

let failed = 0
function check(name, ok, detail = '') {
  if (ok) console.log(`ok   ${name}`)
  else {
    failed += 1
    console.log(`FAIL ${name}${detail ? `\n     ${detail}` : ''}`)
  }
}

const NEXT = `\n\\item[Q.] 23 Next question text here is long enough to count as one?\n(A) one\n(B) two\n(C) three\n(D) four`
const hasPicture = (t) => /\\includegraphics|!\[[^\]]*\]\(/.test(String(t ?? ''))

// Q22: the printed key under option D must not cut the option's words.
{
  const d = trimTrailingProseAfterMath('$\\mathrm{HNO}_{3}$ and CO respectively. ANSWER: B')
  check('Q22: key line after the last option keeps its words', d === '$\\mathrm{HNO}_{3}$ and CO respectively.', d)
  check(
    'Q22: a formula with junk after it is still trimmed',
    trimTrailingProseAfterMath('$\\frac{1}{2}$ Space for rough work') === '$\\frac{1}{2}$',
  )
  const parsed = parseQuestionText(`In the cyanide extraction process, the agents used are
(A) $\\mathrm{O}_{2}$ and CO respectively.
(B) $\\mathrm{O}_{2}$ and Zn dust respectively.
(C) $\\mathrm{HNO}_{3}$ and Zn dust respectively.
(D) $\\mathrm{HNO}_{3}$ and CO respectively.
ANSWER: B`)
  check('Q22: option D is whole', parsed.options[3] === '$\\mathrm{HNO}_{3}$ and CO respectively.', JSON.stringify(parsed.options))
}

// Q4: a stem picture inside \begin{itemize} with math in the first sentence stays.
{
  const raw = `\\begin{itemize}
\\item[Q.] 4 In the given circuit, a charge of $+80 \\mu \\mathrm{C}$ is given to the upper plate of the $4 \\mu \\mathrm{~F}$ capacitor. Then in the steady state, the charge on the upper plate of the $3 \\mu \\mathrm{~F}$ capacitor is
![](https://cdn.mathpix.com/cropped/c4f65ba7-6219-4725-8c20-3dee6f0a4fa9-02.jpg?height=594&width=460&top_left_y=1180&top_left_x=256)
(A) $+32 \\mu \\mathrm{C}$
(B) $+40 \\mu \\mathrm{C}$
(C) $+48 \\mu \\mathrm{C}$
(D) $+80 \\mu \\mathrm{C}$
\\end{itemize}

\\section*{ANSWER: C}`
  const q = paperItemsFromMathpixOcr(raw + NEXT, { examLabel: 'JEE Advanced' })[0]
  check('Q4: the circuit stays on the stem', hasPicture(q?.text), q?.text)
  check('Q4: four options', (q?.options || []).filter((o) => String(o).trim()).length === 4, JSON.stringify(q?.options))
}

// Q9: one scan picture of all four option drawings goes once the options are page crops.
{
  const crop = (id, y0, y1, x0, x1) =>
    `\\includegraphics{/api/official-pyq/original/crops/opyq-x-p5-${id}.png?page=5&x0=${x0}&y0=${y0}&x1=${x1}&y1=${y1}}`
  const options = [
    crop('a', 0.5132, 0.6948, 0.1234, 0.3678),
    crop('b', 0.5132, 0.6965, 0.5127, 0.7571),
    crop('c', 0.694, 0.8739, 0.1257, 0.3796),
    crop('d', 0.6932, 0.8722, 0.5151, 0.7607),
  ]
  const stem = 'For light incident from air on a meta-material, the appropriate ray diagram is'
  const big = '\\includegraphics{https://cdn.mathpix.com/cropped/c4f65ba7-05.jpg?height=1049&width=1416&top_left_y=1515&top_left_x=189}'
  const fixed = dropOptionFigureRepeatingStem({ text: `${stem}\n${big}`, options })
  check('Q9: the stem loses the picture of the options', fixed.text === stem, fixed.text)
  const other = '\\includegraphics{https://cdn.mathpix.com/cropped/c4f65ba7-05.jpg?height=300&width=600&top_left_y=300&top_left_x=189}'
  const kept = dropOptionFigureRepeatingStem({ text: `${stem}\n${other}`, options })
  check('Q9: a stem figure elsewhere on the page stays', hasPicture(kept.text), kept.text)
  const otherPage = big.replace('-05.jpg', '-06.jpg')
  check(
    'Q9: a picture from another page stays',
    hasPicture(dropOptionFigureRepeatingStem({ text: `${stem}\n${otherPage}`, options }).text),
  )
}

// Q13/14: "Case (a) … Case (b)" in a passage is not an option list.
{
  const passage =
    'The general motion of a rigid body can be considered to be a combination of two motions, as described here. ' +
    'Now consider two similar systems as shown in the figure: Case (a) the disc with its face vertical; ' +
    'Case (b) the disc with its face making an angle of $45^{\\circ}$ with $x-y$ plane.'
  check('Q13: "Case (a)" is not where options start', findOptionsBlockStart(passage) === -1, String(findOptionsBlockStart(passage)))
  const realOptions = 'Which statement is correct about the motion described above in detail?\n(a) first\n(b) second\n(c) third\n(d) fourth'
  check('Q13: real (a)–(d) options are still found', findOptionsBlockStart(realOptions) > 0)
}

// Structures drawn from scan codes.
{
  const smilesCard = {
    text: 'The compound that undergoes decarboxylation most readily under mild condition is',
    options: ['<smiles>O=C(O)CC1CCCCC1C(=O)O</smiles>', '<smiles>O=C(O)C1CCCCC1=O</smiles>', 'x', 'y'],
  }
  check('SMILES options are flagged', officialPyqScanStructurePlace(smilesCard) === 'options' && officialPyqScanStructureReason(smilesCard) !== '')
  check('An approved card is not flagged', officialPyqScanStructureReason({ ...smilesCard, adminApproved: true }) === '')
  const stemCard = { text: 'Which statement about M is correct?\n<smiles>CC(O)C(O)Cl</smiles>', options: ['a', 'b', 'c', 'd'] }
  check('SMILES in the stem are flagged', officialPyqScanStructurePlace(stemCard) === 'text')
  const listCard = {
    text: 'Match List I with List II\nList I\n(P) <smiles>CCO</smiles>\nList II\n(1) alcohol',
    options: ['P-1', 'P-2', 'P-3', 'P-4'],
  }
  check('Match-list structures are left alone', officialPyqScanStructurePlace(listCard) === '')
  check('A card without codes is not flagged', officialPyqScanStructureReason({ text: 'Plain words here', options: ['1', '2'] }) === '')
}

// Auto-fix: a key read with new option pictures is checked against those options (2012 P2 Q9).
{
  const card = {
    text: 'For light incident from air on a meta-material, the appropriate ray diagram is',
    options: ['', '', '', ''],
    questionType: 'single_correct',
    answerSource: 'unknown',
  }
  const crops = ['a', 'b', 'c', 'd'].map((id) => [`/api/official-pyq/original/crops/opyq-x-p5-${id}.png?page=5&x0=0.1&y0=0.5&x1=0.3&y1=0.6`])
  const draft = officialPyqDraftFromSuggestion(card, {
    verdict: 'differs',
    printedAnswer: 'C',
    suggestedFigures: { text: [], passage: [], options: crops },
  })
  check('Auto-fix keeps the printed key with the new option pictures', draft.answerKey === 'C', JSON.stringify(draft.answerKey))
}

// The stored 2012 P2 paper: the quality run puts back Q4's circuit, drops Q9's repeat, mends Q22 and flags the structures.
{
  const paper = JSON.parse(readFileSync(new URL('./fixtures/jee-advanced-2012-p2-pending.json', import.meta.url), 'utf8'))
  const byNumber = (list, n) => list.find((q) => Number(q.printedNumber ?? q.questionNumber) === n)
  const run = repairOfficialPyqUntilQuality({ ...paper, status: 'pending_review' })
  const q4 = byNumber(run.paper.questions, 4)
  check('Paper: Q4 has its circuit again', /c4f65ba7-6219-4725-8c20-3dee6f0a4fa9-02\.jpg/.test(String(q4?.text)), String(q4?.text).slice(-160))
  const q9 = byNumber(run.paper.questions, 9)
  check('Paper: Q9 stem has no picture of the options', !/-05\.jpg/.test(String(q9?.text)), String(q9?.text))
  const q22 = byNumber(run.paper.questions, 22)
  check('Paper: Q22 option D is whole', /and CO respectively/.test(String(q22?.options?.[3])), JSON.stringify(q22?.options))
  const failedGoTo = run.quality.failedGoTo.map(Number)
  const goTo = (n) => run.paper.questions.findIndex((q) => Number(q.printedNumber ?? q.questionNumber) === n) + 1
  const flagged = [26, 28, 33, 40].filter((n) => failedGoTo.includes(goTo(n)))
  check('Paper: structure questions are flagged for Auto-fix', flagged.length === 4, `flagged ${JSON.stringify(failedGoTo)}`)
  for (const n of [26, 28]) {
    const q = byNumber(run.paper.questions, n)
    check(`Paper: a structure flag leaves Q${n}'s text alone`, !/\{\s*(?:SECTION\b[^\n]*)?$/.test(String(q?.text)), JSON.stringify(String(q?.text).slice(-60)))
  }
  const broken = paper.questions.map((q) => {
    const n = Number(q.printedNumber ?? q.questionNumber)
    if (n === 26) return { ...q, text: `${q.text}\n\n{` }
    if (n === 28) return { ...q, text: `${q.text}\n\n{\n\n{SECTION II :` }
    return q
  })
  const mended = repairOfficialPyqUntilQuality({ ...paper, questions: broken, status: 'pending_review' })
  for (const n of [26, 28]) {
    const before = byNumber(paper.questions, n)
    const after = byNumber(mended.paper.questions, n)
    check(`Paper: heading leftovers saved in Q${n} are removed`, String(after?.text).trim() === String(before?.text).trim(), JSON.stringify(String(after?.text).slice(-60)))
  }
  const approved = repairOfficialPyqUntilQuality({ ...paper, status: 'approved' })
  const approvedFlags = approved.quality.failedGoTo.map(Number)
  check('Paper: an approved paper gets no new structure alerts', !approvedFlags.includes(goTo(26)), JSON.stringify(approvedFlags))
}

if (failed) {
  console.log(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll 2012 P2 card checks passed')
