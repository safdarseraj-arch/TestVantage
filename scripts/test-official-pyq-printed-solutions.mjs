/**
 * Official PYQ papers that print the answer and the solution: under each question
 * ("Ans. (B)" then "Sol. …"), or after the whole paper ("ANSWER KEY" table, "HINTS & SOLUTIONS").
 *   Both layouts split into the right number of cards, with the printed answer and solution
 *   saved as from the paper and nothing of them left in the stem or the options.
 *   The end part is never counted as questions.
 *   Hybrid AI fills tags only when the answer and solution are printed, or when the admin
 *   marks the paper "printed answers and solutions".
 *   A bare "Answer: C" key line is no solution.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'

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
  const store = new Map()
  globalThis.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  }
}
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis

const { paperItemsFromMathpixOcr, countMathpixQuestionMarkers, sanitizeMathpixOcrText } = await import('../src/utils/mathpixQuestionSplit.js')
const { readEndAnswerSection, stripEndAnswerSection, storedEndAnswerSectionText, applyEndAnswerSection } = await import(
  '../src/utils/printedEndSolutions.js'
)
const { detectAnswerFromPaper } = await import('../src/utils/answerProvenance.js')
const { solutionIsOnlyPrintedKeyLine } = await import('../src/utils/printedAnswerKey.js')
const { buildPaperFacts } = await import('../src/utils/officialPyqPaperFacts.js')
const {
  applyHybridPatchToCard,
  fillOfficialPyqApprovedPaperPartByPart,
  hybridFillRequestForQuestion,
  officialPyqCardIsFilled,
  officialPyqCardTagsOnly,
} = await import('../src/utils/officialPyqPendingFill.js')
const { repairOfficialPyqUntilQuality, localOfficialPyqQualityCheck } = await import('../src/utils/officialPyqLocalQuality.js')
const { approveOfficialPyqPaper, importQuestionsToOfficialPyqPending } = await import('../src/utils/officialPyqApproval.js')
const { clearOfficialPyqPendingPapers, getOfficialPyqPendingPaper, updateOfficialPyqPendingPaper } = await import(
  '../src/utils/officialPyqPendingStore.js'
)

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

const inline = fs.readFileSync(new URL('./fixtures/printed-inline-solutions-mathpix.txt', import.meta.url), 'utf8')
const atEnd = fs.readFileSync(new URL('./fixtures/printed-end-solutions-mathpix.txt', import.meta.url), 'utf8')
const keyOnly = fs.readFileSync(new URL('./fixtures/jee-advanced-2025-p2-mathpix.txt', import.meta.url), 'utf8')

const LEAK_RE = /\b(?:Ans|Sol|Solution|Explanation|Hint)\s*[.:]|ANSWER KEY|HINTS|SOLUTIONS/
const EXPECTED = [
  { correctIndex: 1 },
  { correctIndex: 1 },
  { correctInteger: 2 },
  { correctIndex: 2 },
  { correctIndex: 2 },
  { correctInteger: 3 },
]
const SOLUTION_WORDS = ["Newton's second law", 'speed is zero', 'resistors in parallel', 'three oxygen atoms', 'insoluble calcium carbonate', 'fully ionised']

function checkPrintedCards(items, label) {
  assert.equal(items.length, 6, `${label}: card count`)
  items.forEach((q, i) => {
    for (const [field, value] of Object.entries(EXPECTED[i])) assert.equal(q[field], value, `${label} Q${i + 1} ${field}`)
    assert.equal(q.answerSource, 'from_paper', `${label} Q${i + 1} answerSource`)
    assert.ok(String(q.solution ?? '').includes(SOLUTION_WORDS[i]), `${label} Q${i + 1} solution: ${q.solution}`)
    assert.equal(q.solutionSource, 'from_paper', `${label} Q${i + 1} solutionSource`)
    assert.doesNotMatch(String(q.text), LEAK_RE, `${label} Q${i + 1} stem keeps no printed answer / solution`)
    for (const opt of q.options || []) assert.doesNotMatch(String(opt), LEAK_RE, `${label} Q${i + 1} option "${opt}"`)
  })
}

await test('inline layout: Ans./Sol./Explanation/Hint under each question become the card answer and solution', () => {
  checkPrintedCards(paperItemsFromMathpixOcr(inline), 'inline')
})

await test('inline layout: "(D) 80 m Ans. (B) Sol. …" on one line leaves option D clean', () => {
  const q2 = paperItemsFromMathpixOcr(inline)[1]
  assert.equal(q2.options[3], '$80 \\mathrm{~m}$')
})

await test('inline layout: question count is 6', () => {
  assert.equal(countMathpixQuestionMarkers(inline), 6)
})

await test('end layout: answer key table and HINTS & SOLUTIONS are read onto the cards', () => {
  checkPrintedCards(paperItemsFromMathpixOcr(atEnd), 'end')
})

await test('end layout: the answer / solution part is not counted as questions anywhere', () => {
  assert.equal(countMathpixQuestionMarkers(atEnd), 6)
  const sanitized = sanitizeMathpixOcrText(atEnd)
  assert.doesNotMatch(sanitized, /ANSWER KEY|HINTS/)
  assert.doesNotMatch(stripEndAnswerSection(atEnd), /ANSWER KEY|HINTS/)
  const facts = buildPaperFacts(atEnd)
  if (facts?.expectedQuestionCount) assert.equal(Number(facts.expectedQuestionCount), 6)
  const end = readEndAnswerSection(atEnd)
  assert.ok(end, 'end part found')
  assert.deepEqual(end.subjects, ['physics', 'chemistry'])
  assert.match(storedEndAnswerSectionText(atEnd), /ANSWER KEY[\s\S]*HINTS/, 'the removed part is kept for the stored text')
  assert.equal(countMathpixQuestionMarkers(`${atEnd}\n`), 6)
})

await test('end layout: the stored scan (questions + kept end part) splits to the same cards', () => {
  const stored = `${sanitizeMathpixOcrText(atEnd).trimEnd()}${storedEndAnswerSectionText(atEnd)}`
  checkPrintedCards(paperItemsFromMathpixOcr(stored), 'stored')
})

await test('end layout: numbering restarts per subject; each subject keeps its own key', () => {
  const raw = String.raw`\section*{PHYSICS}
\item[Q.] 1 The SI unit of force is
(A) joule
(B) newton
(C) watt
(D) pascal
\item[Q.] 2 The SI unit of power is
(A) joule
(B) newton
(C) watt
(D) pascal

\section*{SOLUTIONS}
PHYSICS
1. (B) Force is measured in newton.
2. (C) Power is measured in watt.
CHEMISTRY
1. (A) Sodium has atomic number 11.
2. (D) Chlorine has atomic number 17.
`
  const end = readEndAnswerSection(raw)
  assert.ok(end)
  const cards = [
    { printedNumber: 1, subject: 'physics', text: 'unit of force', options: ['a', 'b', 'c', 'd'] },
    { printedNumber: 2, subject: 'physics', text: 'unit of power', options: ['a', 'b', 'c', 'd'] },
    { printedNumber: 1, subject: 'chemistry', text: 'sodium', options: ['a', 'b', 'c', 'd'] },
    { printedNumber: 2, subject: 'chemistry', text: 'chlorine', options: ['a', 'b', 'c', 'd'] },
  ]
  const out = applyEndAnswerSection(cards, end)
  assert.deepEqual(out.map((q) => q.correctIndex), [1, 2, 0, 3])
  assert.match(out[2].solution, /Sodium/)
  assert.match(out[3].solution, /Chlorine/)
  assert.ok(out.every((q) => q.answerSource === 'from_paper' && q.solutionSource === 'from_paper'))
  const noSubjects = applyEndAnswerSection(cards.map(({ subject: _s, ...q }) => q), end)
  assert.deepEqual(noSubjects.map((q) => q.correctIndex), [1, 2, 0, 3], 'restart without subjects follows the end order')
})

await test('end layout: an admin edit and a hand-typed solution are never replaced', () => {
  const end = readEndAnswerSection(atEnd)
  const cards = paperItemsFromMathpixOcr(atEnd).map((q, i) =>
    i === 0 ? { ...q, correctIndex: 3, adminEdited: true, solution: 'Mine', solutionSource: 'admin_edit' } : i === 1 ? { ...q, solution: 'Typed', solutionSource: 'manual' } : q,
  )
  const out = applyEndAnswerSection(cards, end)
  assert.equal(out[0].correctIndex, 3)
  assert.equal(out[0].solution, 'Mine')
  assert.equal(out[1].solution, 'Typed')
})

await test('a "SOLUTIONS" chapter title before the questions is not an end part', () => {
  const raw = String.raw`\section*{SOLUTIONS}
\item[Q.] 1 The molality of a solution containing 1 mole of solute in 1 kg of water is
(A) 1
(B) 2
(C) 0.5
(D) 0.1
\item[Q.] 2 Raoult's law applies to
(A) ideal solutions
(B) all solutions
(C) solids
(D) gases
`
  assert.equal(readEndAnswerSection(raw), null)
  assert.equal(countMathpixQuestionMarkers(raw), 2)
})

await test('answer-key-only paper (2025 P2): unchanged count, and "Answer: C" is not saved as a solution', () => {
  const items = paperItemsFromMathpixOcr(keyOnly)
  assert.equal(items.length, 48)
  assert.equal(readEndAnswerSection(keyOnly), null)
  assert.equal(items[0].correctIndex, 2)
  assert.equal(items[0].answerSource, 'from_paper')
  assert.ok(items.every((q) => !q.solution || !solutionIsOnlyPrintedKeyLine(q.solution)), 'no key line saved as a solution')
  const read = detectAnswerFromPaper('Some stem\nAnswer: C')
  assert.equal(read.solution, undefined)
  assert.equal(read.solutionSource, undefined)
})

await test('tags-only request: no answer and no solution are sent; tags_only is set', () => {
  const card = { text: 'Stem', options: ['1', '2', '3', '4'], correctIndex: 1, answerSource: 'from_paper', solution: 'Printed working.', solutionSource: 'from_paper', subject: 'physics' }
  const full = hybridFillRequestForQuestion(card, 'jee-advanced')
  assert.ok('answer' in full && 'solution' in full)
  assert.equal(full.tags_only, undefined)
  const tags = hybridFillRequestForQuestion(card, 'jee-advanced', { tagsOnly: true })
  assert.equal(tags.tags_only, true)
  assert.equal('answer' in tags, false)
  assert.equal('solution' in tags, false)
  assert.equal(tags.question_text, 'Stem')
  assert.deepEqual(tags.options, ['1', '2', '3', '4'])
})

await test('tags-only applies when the answer and a real solution are kept, or when the paper is marked', () => {
  const printed = { text: 'S', correctIndex: 1, answerSource: 'from_paper', solution: 'Printed working.', solutionSource: 'from_paper' }
  assert.equal(officialPyqCardTagsOnly(printed, {}), true)
  assert.equal(officialPyqCardTagsOnly({ ...printed, solution: 'Answer: B' }, {}), false, 'a key line is no solution')
  assert.equal(officialPyqCardTagsOnly({ ...printed, solutionSource: 'hybrid_ai' }, {}), false)
  assert.equal(officialPyqCardTagsOnly({ ...printed, answerSource: 'ai_generated' }, {}), false)
  assert.equal(officialPyqCardTagsOnly({ ...printed, solutionSource: 'manual' }, {}), true)
  assert.equal(officialPyqCardTagsOnly({ text: 'S' }, { printedAnswersAndSolutions: true }), true)
  const tagged = { chapter: 'Kinematics', section: 'Mechanics', topic: 'Projectile', toughnessLevel: 5 }
  assert.equal(officialPyqCardIsFilled(tagged, { printedAnswersAndSolutions: true }), true)
  assert.equal(officialPyqCardIsFilled({ chapter: 'Kinematics' }, { printedAnswersAndSolutions: true }), false, 'every tag is needed')
  assert.equal(officialPyqCardIsFilled(tagged, {}), false)
})

await test('Hybrid AI answer that disagrees with the printed key is noted; the printed answer stays', () => {
  const card = { text: 'S', options: ['1', '2', '3', '4'], correctIndex: 1, answerSource: 'from_paper' }
  const out = applyHybridPatchToCard(card, { correctIndex: 2 })
  assert.equal(out.correctIndex, 1)
  assert.equal(out.answerSource, 'from_paper')
  assert.ok(out.hybridAnswerDisagrees)
  const agrees = applyHybridPatchToCard(out, { correctIndex: 1 })
  assert.equal(agrees.hybridAnswerDisagrees, undefined)
})

function login(role) {
  sessionStorage.setItem('testvantage-session', JSON.stringify({ role, email: `${role}@test`, name: role, loggedInAt: 1 }))
}

function printedPaper(day) {
  return {
    exam: 'jee-main',
    year: 2024,
    session: 'January Session · Shift 1',
    pyqDate: `2024-01-${day}`,
    pyqShift: 1,
    paperLabel: `JEE Main 2024 · 2024-01-${day} Shift 1 (printed solutions fixture)`,
    paperId: `jee-main-2024-01-${day}-s1-printed`,
    sourceLabel: 'Official NTA (test fixture)',
    questions: [
      {
        text: 'Printed fixture: acceleration of a $2\\,\\mathrm{kg}$ block under $10\\,\\mathrm{N}$ is',
        options: ['$2$', '$5$', '$10$', '$20$'],
        correctIndex: 1,
        answerSource: 'from_paper',
        solution: 'By Newton\'s second law $a=F/m=5$.',
        solutionSource: 'from_paper',
        subject: 'physics',
        pyqSlot: 1,
      },
      {
        text: 'Printed fixture: the determinant of $2A$ when $\\det A = 2$ for a $3\\times 3$ matrix is',
        options: ['$4$', '$16$', '$8$', '$2$'],
        subject: 'mathematics',
        pyqSlot: 2,
      },
    ],
  }
}

async function runFill(day, printedAll) {
  login('admin')
  const paper = importQuestionsToOfficialPyqPending(printedPaper(day))
  updateOfficialPyqPendingPaper(paper.id, { adminFacts: { confirmedAt: Date.now(), confirmedBy: 'test' } })
  const approved = approveOfficialPyqPaper(paper.id)
  assert.equal(approved.ok, true, approved.errors?.join(' '))
  if (printedAll) updateOfficialPyqPendingPaper(paper.id, { printedAnswersAndSolutions: true })
  const realFetch = globalThis.fetch
  const sent = []
  globalThis.fetch = async (_url, init) => {
    sent.push(JSON.parse(init.body))
    return new Response(
      JSON.stringify({
        ok: true,
        chapter: 'Laws of Motion',
        topic: 'Newton second law',
        correct_answer: 'C',
        step_by_step_solution: 'Use $\\det(kA)=k^3\\det A$.\n$\\det(2A)=8\\times 2=16$.\nAnswer: (B)',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }
  try {
    const run = await fillOfficialPyqApprovedPaperPartByPart(paper.id, { redoAll: true })
    return { run, sent, saved: getOfficialPyqPendingPaper(paper.id) }
  } finally {
    globalThis.fetch = realFetch
  }
}

await test('fill: a card with printed answer and solution gets tags only; the other card is fully filled', async () => {
  clearOfficialPyqPendingPapers()
  const { run, sent, saved } = await runFill('20', false)
  const printedReq = sent.find((b) => b.question_text.startsWith('Printed fixture: acceleration'))
  const otherReq = sent.find((b) => b.question_text.startsWith('Printed fixture: the determinant'))
  assert.equal(printedReq.tags_only, true)
  assert.equal('answer' in printedReq || 'solution' in printedReq, false)
  assert.equal(otherReq.tags_only, undefined)
  assert.equal(run.tagsOnly, 1)
  assert.deepEqual(run.noPrintedAnswer, [])
  const [q1, q2] = saved.questions
  assert.equal(q1.correctIndex, 1)
  assert.equal(q1.answerSource, 'from_paper')
  assert.equal(q1.solution, 'By Newton\'s second law $a=F/m=5$.')
  assert.equal(q1.solutionSource, 'from_paper')
  assert.equal(q1.chapter, 'Laws of Motion')
  assert.equal(q2.answerSource, 'hybrid_ai')
  assert.equal(q2.solutionSource, 'hybrid_ai')
})

await test('fill with "printed answers and solutions" on: tags only for every card; a card with no printed answer is listed, not AI-answered', async () => {
  clearOfficialPyqPendingPapers()
  const { run, sent, saved } = await runFill('21', true)
  assert.equal(sent.length, 2)
  assert.ok(sent.every((b) => b.tags_only === true && !('answer' in b) && !('solution' in b)))
  assert.equal(run.tagsOnly, 2)
  assert.deepEqual(run.noPrintedAnswer, [2])
  const [q1, q2] = saved.questions
  assert.equal(q1.correctIndex, 1)
  assert.equal(q1.solutionSource, 'from_paper')
  assert.notEqual(q2.answerSource, 'hybrid_ai')
  assert.equal(q2.correctIndex ?? null, null)
  assert.ok(!String(q2.solution ?? '').trim(), 'no AI solution on a tags-only paper')
  assert.equal(q2.chapter, 'Laws of Motion', 'tags are still filled')
})

await test('source labels: an unlabelled solution is no longer called "from the paper"', () => {
  for (const file of ['../src/utils/officialPyqApproval.js', '../src/utils/officialPyqLocalReparse.js']) {
    const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /solutionSource:\s*q\.solutionSource\s*\|\|\s*\(q\.solution\s*\?\s*'from_paper'/, file)
    assert.match(source, /q\.solutionSource \|\| \(q\.solution \? 'unknown' : undefined\)/, file)
  }
})

await test('server: tags-only prompt and schema drop the answer and the solution; 1500-token cap stays', () => {
  const py = fs.readFileSync(new URL('../ai_generator.py', import.meta.url), 'utf8')
  const tagsSchema = py.slice(py.indexOf('class PublishedPyqTagsOutput'), py.indexOf('@dataclass', py.indexOf('class PublishedPyqTagsOutput')))
  assert.ok(tagsSchema.includes('chapter'))
  assert.doesNotMatch(tagsSchema, /correct_answer|step_by_step_solution/)
  const prompt = py.slice(py.indexOf('def _published_tags_prompt'), py.indexOf('def _published_fill_prompt'))
  assert.doesNotMatch(prompt, /correct_answer|step_by_step_solution/)
  const fill = py.slice(py.indexOf('def fill_published_pyq_sync'), py.indexOf('def fill_published_pyq_sync') + 2500)
  assert.match(fill, /PublishedPyqTagsOutput if tags_only else PublishedPyqFillOutput/)
  assert.match(fill, /max_output_tokens=_MAX_OUTPUT_TOKENS/)
  const main = fs.readFileSync(new URL('../main.py', import.meta.url), 'utf8')
  assert.match(main, /tags_only: bool = Field/)
  assert.match(main, /"tags_only": body\.tags_only/)
  const vision = fs.readFileSync(new URL('../server/vision.js', import.meta.url), 'utf8')
  assert.match(vision, /"solutionPrinted": false/)
})

function qualityPaper(questions, preparedText = inline) {
  return { id: 'printed-quality', status: 'pending_review', officialPyq: true, preparedText, questions }
}

await test('quality: clean printed-solution cards raise none of the printed-solution flags', () => {
  const result = localOfficialPyqQualityCheck(qualityPaper(paperItemsFromMathpixOcr(inline)))
  assert.ok(!result.lines.some((l) => /printed answer line|inside the question|holds printed|printed on the paper was changed|reads like a solution|different answer/.test(l)), result.lines.join('\n'))
})

await test('quality: a saved "Answer: C" solution is cleared so Hybrid AI can write one', () => {
  const items = paperItemsFromMathpixOcr(keyOnly).map((q, i) => (i === 0 ? { ...q, solution: 'Answer: C', solutionSource: 'from_paper' } : q))
  const paper = qualityPaper(items, keyOnly)
  assert.ok(localOfficialPyqQualityCheck(paper).lines.some((l) => /^Go to Q 1\b.*printed answer line/.test(l)))
  const { paper: fixed } = repairOfficialPyqUntilQuality(paper)
  assert.equal(fixed.questions[0].solution, undefined)
  assert.equal(fixed.questions[0].solutionSource, undefined)
  assert.equal(fixed.questions[0].correctIndex, 2, 'the printed answer stays')
  const typed = qualityPaper(items.map((q, i) => (i === 0 ? { ...q, solutionSource: 'manual' } : q)), keyOnly)
  assert.equal(repairOfficialPyqUntilQuality(typed).paper.questions[0].solution, 'Answer: C', 'a hand-typed solution stays')
})

await test('quality: printed Ans./Sol. text in the stem moves to the solution; in an option it is removed', () => {
  const items = paperItemsFromMathpixOcr(inline)
  const broken = items.map((q, i) => {
    if (i === 1) {
      const { solution: _s, solutionSource: _src, ...rest } = q
      return { ...rest, text: `${q.text}\nAns. (B)\nSol. At the top the speed is zero, so $h=u^{2} / 2 g=400 / 20=20 \\mathrm{~m}$.` }
    }
    if (i === 3) return { ...q, options: [...q.options.slice(0, 3), `${q.options[3]} Ans. (C) Sol. Each formula unit has three oxygen atoms.`] }
    return q
  })
  const paper = qualityPaper(broken)
  const lines = localOfficialPyqQualityCheck(paper).lines
  assert.ok(lines.some((l) => /^Go to Q 2\b.*inside the question/.test(l)), lines.join('\n'))
  assert.ok(lines.some((l) => /^Go to Q 4\b.*holds printed/.test(l)), lines.join('\n'))
  const fixed = repairOfficialPyqUntilQuality(paper).paper.questions
  assert.doesNotMatch(fixed[1].text, LEAK_RE)
  assert.match(fixed[1].solution, /speed is zero/)
  assert.equal(fixed[1].solutionSource, 'from_paper')
  assert.equal(fixed[3].options[3], '4')
})

await test('quality: a printed solution replaced by another one is put back; an admin edit stays', () => {
  const items = paperItemsFromMathpixOcr(inline)
  const changed = items.map((q, i) => (i === 4 ? { ...q, solution: 'AI wrote this instead.', solutionSource: 'hybrid_ai' } : q))
  const paper = qualityPaper(changed)
  assert.ok(localOfficialPyqQualityCheck(paper).lines.some((l) => /^Go to Q 5\b.*printed on the paper was changed/.test(l)))
  const fixed = repairOfficialPyqUntilQuality(paper).paper.questions
  assert.match(fixed[4].solution, /insoluble calcium carbonate/)
  assert.equal(fixed[4].solutionSource, 'from_paper')
  const edited = qualityPaper(items.map((q, i) => (i === 4 ? { ...q, solution: 'Admin wording.', solutionSource: 'admin_edit', adminEdited: true } : q)))
  assert.equal(repairOfficialPyqUntilQuality(edited).paper.questions[4].solution, 'Admin wording.')
})

await test('quality: an overlong option that reads like a solution is flagged; an AI answer that disagrees is noted', () => {
  const items = paperItemsFromMathpixOcr(inline)
  const longOption = `Carbon dioxide reacts with calcium hydroxide. ${'The lime water turns milky because a white solid forms in it. '.repeat(6)}Hence the gas is carbon dioxide.`
  const paper = qualityPaper(
    items.map((q, i) => (i === 4 ? { ...q, options: [q.options[0], q.options[1], longOption, q.options[3]] } : i === 0 ? { ...q, hybridAnswerDisagrees: 'C' } : q)),
  )
  const result = localOfficialPyqQualityCheck(paper)
  assert.ok(result.lines.some((l) => /^Go to Q 5\b.*reads like a solution/.test(l)), result.lines.join('\n'))
  assert.ok(result.lines.some((l) => /^Go to Q 1\b.*different answer/.test(l)), result.lines.join('\n'))
  assert.ok(result.failedGoTo.includes(5))
  assert.ok(!result.failedGoTo.includes(1), 'the disagreement note alone does not fail the card')
})

if (failed) {
  console.error(`\n${failed} printed-solution test(s) failed`)
  process.exit(1)
}
console.log('\nOfficial PYQ printed answers and solutions: all tests passed')
