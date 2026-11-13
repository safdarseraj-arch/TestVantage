/**
 * Book / question bank PDFs go through the Official PYQ pipeline, one page range at a time.
 *   Splitter: each exercise is a part, theory pages are left out, solved examples become
 *   questions with their printed solution, the answer key of each exercise is matched to it
 *   ("(b)" → B, "(3)" → C when the options are printed (1)–(4)).
 *   Import: every part is a pending paper of kind 'book' made by the same build step as a paper
 *   upload (Quality check runs), tagged with book, chapter, exercise and pages; the range PDF is
 *   stored as each part's original for Compare.
 *   An answer key printed in a later range reaches the exercise read earlier.
 *   A range that starts inside an exercise keeps those questions.
 *   Approve, then Publish: Question Bank only (no student test), tagged with the book.
 *   The Official PYQ / Any paper lists never show book parts.
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

const {
  classifyBookHeading,
  letterBookNumericOptions,
  markBookQuestionNumbers,
  normalizeBookAnswerKey,
  splitBookRangeText,
} = await import('../src/utils/bookRangeSplit.js')
const { importBookRange, bookPartPaperName } = await import('../src/utils/bookRangeImport.js')
const {
  clearOfficialPyqPendingPapers,
  getOfficialPyqPendingPaper,
  isBookPaper,
  isOtherPaper,
  listOfficialPyqPendingSummaries,
  officialPyqPaperKindMatches,
  updateOfficialPyqPendingPaper,
} = await import('../src/utils/officialPyqPendingStore.js')
const { approveOfficialPyqPaper, publishOfficialPyqPaper, unpublishOfficialPyqPaper } = await import(
  '../src/utils/officialPyqApproval.js'
)
const { BOOK_PAPER_BANK_SOURCE } = await import('../src/utils/officialPyqPublishFlow.js')
const { clearQuestionBank, loadQuestionBank } = await import('../src/utils/questionBank.js')
const { loadCustomTests } = await import('../src/utils/customTests.js')

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

const RANGE = fs.readFileSync(new URL('./fixtures/book-range-mathpix.txt', import.meta.url), 'utf8')
const BOOK = { id: 'bk-0123456789abcdef', name: 'HC Verma Part 1', pages: 400, ranges: [] }
const range = (start, end, chapter = '') => ({ start, end, title: `Pages ${start}-${end}`, chapter, status: 'new', paperIds: [] })
const login = () =>
  sessionStorage.setItem('testvantage-session', JSON.stringify({ role: 'admin', email: 'admin@test', name: 'admin', loggedInAt: 1 }))

clearOfficialPyqPendingPapers()
clearQuestionBank()

await test('headings: exercise, answers, examples, chapter; a lone "Solution" or "Problem 1" is no heading', () => {
  assert.equal(classifyBookHeading('\\section*{EXERCISE 3.1}')?.kind, 'exercise')
  assert.equal(classifyBookHeading('Exercise - II')?.kind, 'exercise')
  assert.equal(classifyBookHeading('\\section*{Answers}')?.kind, 'answers')
  assert.equal(classifyBookHeading('HINTS & SOLUTIONS')?.kind, 'answers')
  assert.equal(classifyBookHeading('Solution'), null)
  assert.equal(classifyBookHeading('Solution: Here u = 0.'), null)
  assert.equal(classifyBookHeading('Problem 1'), null)
  assert.equal(classifyBookHeading('\\section*{Solved Examples}')?.kind, 'examples')
  assert.equal(classifyBookHeading('\\section*{Chapter 3 Motion in a Straight Line}')?.kind, 'chapter')
  assert.equal(classifyBookHeading('\\section*{Single Correct Type}', true)?.kind, 'subtype')
  assert.equal(classifyBookHeading('\\section*{3.2 Equations of Motion}')?.kind, 'theory')
  assert.equal(classifyBookHeading('Example 4 A ball is thrown up.'), null)
})

await test('question numbers 1, 2, 3 become "Q. N"; a list inside a question does not', () => {
  const out = markBookQuestionNumbers('1. First question\n(a) x\n2. Second one\nsteps:\n1. not a question\n3. Third')
  assert.equal(out.count, 3)
  assert.match(out.text, /^Q\. 1 First question/)
  assert.match(out.text, /\nQ\. 3 Third/)
  assert.match(out.text, /\n1\. not a question/)
})

await test('options (1)–(4) read as (A)–(D); "equation (1)" in the stem stays', () => {
  const out = letterBookNumericOptions('Q. 1 From equation (1) the speed is\n(1) 2\n(2) 4\n(3) 6\n(4) 8')
  assert.match(out, /equation \(1\) the speed/)
  assert.match(out, /\(A\) 2\n\(B\) 4\n\(C\) 6\n\(D\) 8/)
  assert.equal(normalizeBookAnswerKey('1. (2) 2. (c) 3. d', { numericOptions: true }), '1. (B) 2. (C) 3. D')
  assert.equal(normalizeBookAnswerKey('1. (2)'), '1. (2)')
})

await test('splitter: two exercises and the solved examples; theory left out; each key on its exercise', () => {
  const { parts, skipped, unmatchedAnswers } = splitBookRangeText(RANGE)
  assert.deepEqual(
    parts.map((p) => [p.kind, p.title, p.questionCount]),
    [
      ['exercise', 'EXERCISE 3.1', 3],
      ['exercise', 'EXERCISE 3.2', 2],
      ['examples', 'Solved Examples', 2],
    ],
  )
  assert.ok(parts.every((p) => p.chapter === 'Chapter 3 Motion in a Straight Line'))
  assert.deepEqual(skipped.map((s) => s.title), ['3.1 Introduction', '3.2 Equations of Motion'])
  assert.equal(unmatchedAnswers.length, 0)
  assert.match(parts[0].text, /\\section\*\{ANSWER KEY\}\n1\. \(C\) 2\. \(B\) 3\. \(B\)/)
  assert.match(parts[1].text, /\\section\*\{ANSWER KEY\}\n1\. \(B\) 2\. \(C\)/)
  assert.doesNotMatch(parts[0].text, /Motion is a change in the position/)
  assert.match(parts[2].text, /Q\. 1 A car starts[\s\S]*Sol\. Here/)
})

const stored = []
let imported
await test('import: each part is a pending book paper built by the paper pipeline', async () => {
  imported = await importBookRange({
    book: BOOK,
    range: range(41, 52, 'Chapter 3 Motion in a Straight Line'),
    exam: 'jee-main',
    extracted: { engine: 'mathpix', text: RANGE, visionText: RANGE, pdfText: RANGE, questions: [] },
    file: new File([new Uint8Array([37, 80, 68, 70])], 'HC Verma Part 1 p41-52.pdf', { type: 'application/pdf' }),
    storeOriginal: async (id, file) => stored.push([id, file.name]),
  })
  assert.deepEqual(
    imported.parts.map((p) => [p.title, p.count, p.answered, p.solved, Boolean(p.error)]),
    [
      ['EXERCISE 3.1', 3, 3, 0, false],
      ['EXERCISE 3.2', 2, 2, 0, false],
      ['Solved Examples', 2, 0, 2, false],
    ],
  )
  assert.equal(imported.lastExercise, 'EXERCISE 3.2')
  const ex1 = getOfficialPyqPendingPaper(imported.parts[0].paperId)
  assert.equal(isBookPaper(ex1), true)
  assert.equal(isOtherPaper(ex1), true)
  assert.equal(ex1.status, 'pending_review')
  assert.equal(ex1.paperName, 'HC Verma Part 1 – Chapter 3 Motion in a Straight Line – EXERCISE 3.1')
  assert.equal(ex1.bookId, BOOK.id)
  assert.equal(ex1.bookName, 'HC Verma Part 1')
  assert.equal(ex1.bookChapter, 'Chapter 3 Motion in a Straight Line')
  assert.equal(ex1.bookExercise, 'EXERCISE 3.1')
  assert.equal(ex1.bookPageStart, 41)
  assert.equal(ex1.bookPageEnd, 52)
  assert.deepEqual(ex1.questions.map((q) => q.correctIndex), [2, 1, 1])
  assert.ok(ex1.localQuality, 'the Quality check ran on import, as for a paper')
  assert.match(String(ex1.preparedText), /Q\. 1 A body starts/)
  assert.doesNotMatch(String(ex1.preparedText), /EXERCISE 3\.2|A car starts/)
  const ex2 = getOfficialPyqPendingPaper(imported.parts[1].paperId)
  assert.deepEqual(ex2.questions.map((q) => q.correctIndex), [1, 2])
  assert.deepEqual(ex2.questions[0].options.slice(0, 2), ['$1 \\mathrm{~m} / \\mathrm{s}^{2}$', '$2 \\mathrm{~m} / \\mathrm{s}^{2}$'])
  const examples = getOfficialPyqPendingPaper(imported.parts[2].paperId)
  assert.equal(examples.bookPartKind, 'examples')
  assert.ok(examples.questions.every((q) => q.questionType === 'numerical' && q.solutionSource === 'from_paper'))
  assert.match(examples.questions[1].solution, /t=4/)
  assert.deepEqual(stored.map((s) => s[1]), Array(3).fill('HC Verma Part 1 p41-52.pdf'))
})

await test('lists: book parts only under Book; Official PYQ and Any paper never show them', () => {
  const ex1 = getOfficialPyqPendingPaper(imported.parts[0].paperId)
  assert.equal(officialPyqPaperKindMatches(ex1, 'book'), true)
  assert.equal(officialPyqPaperKindMatches(ex1, 'other'), false)
  assert.equal(officialPyqPaperKindMatches(ex1, 'official'), false)
  assert.equal(officialPyqPaperKindMatches({ paperKind: 'other' }, 'book'), false)
  assert.equal(listOfficialPyqPendingSummaries('all', 'book').length, 3)
  assert.equal(listOfficialPyqPendingSummaries('all', 'other').length, 0)
  assert.equal(listOfficialPyqPendingSummaries('all', 'official').length, 0)
})

await test('the same range read again updates its papers instead of adding new ones', async () => {
  const again = await importBookRange({
    book: BOOK,
    range: range(41, 52, 'Chapter 3 Motion in a Straight Line'),
    exam: 'jee-main',
    extracted: { engine: 'mathpix', text: RANGE, visionText: RANGE, questions: [] },
  })
  assert.deepEqual(again.parts.map((p) => p.paperId), imported.parts.map((p) => p.paperId))
  assert.equal(listOfficialPyqPendingSummaries('all', 'book').length, 3)
})

await test('a range starting inside an exercise keeps its questions; a key printed later reaches them', async () => {
  const first = await importBookRange({
    book: BOOK,
    range: range(53, 60, 'Chapter 3 Motion in a Straight Line'),
    exam: 'jee-main',
    extracted: {
      text: [
        '\\section*{EXERCISE 3.3}',
        '1. The dimensional formula of velocity is',
        '(a) $[L T^{-1}]$',
        '(b) $[L T^{-2}]$',
        '(c) $[M L T^{-1}]$',
        '(d) $[L^{2} T^{-1}]$',
        '2. Which one of the following is a vector quantity?',
        '(a) speed',
        '(b) distance',
        '(c) mass',
        '(d) displacement',
      ].join('\n'),
      questions: [],
    },
  })
  assert.deepEqual(first.parts.map((p) => [p.title, p.count, p.answered]), [['EXERCISE 3.3', 2, 0]])
  const next = await importBookRange({
    book: BOOK,
    range: range(61, 64, 'Chapter 3 Motion in a Straight Line'),
    exam: 'jee-main',
    continues: first.lastExercise,
    extracted: {
      text: [
        '3. A body covers equal distances in equal intervals of time. Its motion is',
        '(a) uniform',
        '(b) accelerated',
        '(c) retarded',
        '(d) circular',
        '4. The unit of acceleration in SI is',
        '(a) $\\mathrm{m} / \\mathrm{s}$',
        '(b) $\\mathrm{m} / \\mathrm{s}^{2}$',
        '(c) $\\mathrm{m}^{2} / \\mathrm{s}$',
        '(d) $\\mathrm{s} / \\mathrm{m}$',
        '',
        '\\section*{ANSWERS}',
        '',
        'EXERCISE 3.3',
        '1. (a) 2. (d) 3. (a) 4. (b)',
      ].join('\n'),
      questions: [],
    },
  })
  assert.deepEqual(next.parts.map((p) => [p.title, p.count]), [['EXERCISE 3.3 (continued, Q 3-4)', 2]])
  const cont = getOfficialPyqPendingPaper(next.parts[0].paperId)
  assert.match(cont.preparedText, /^Q\. 1 A body covers[\s\S]*\nQ\. 2 The unit of acceleration/)
  assert.deepEqual(cont.questions.map((q) => q.correctIndex), [0, 1], 'printed 3. (a) 4. (b) are this part’s Q 1 and Q 2')
  assert.deepEqual(next.lateAnswers.map((a) => [a.title, a.applied]), [['EXERCISE 3.3', true]])
  const earlier = getOfficialPyqPendingPaper(first.parts[0].paperId)
  assert.deepEqual(earlier.questions.map((q) => q.correctIndex), [0, 3], 'printed 1. (a) 2. (d) reach the part read before')
})

await test('a key split across the two parts: table and solution blocks are shifted too', async () => {
  const { shiftAnswerNumbers } = await import('../src/utils/bookRangeSplit.js')
  const table = shiftAnswerNumbers('\\begin{tabular}{|c|c|c|}\n\\hline 1 & 2 & 3 \\\\\n\\hline b & c & a \\\\\n\\hline\n\\end{tabular}', 2)
  assert.equal(table.mine, '1. a')
  assert.equal(table.earlier, '1. b\n2. c')
  const sol = shiftAnswerNumbers('1. Use $v=u+a t$.\nso $v=12$.\n3. Area gives displacement.', 2)
  assert.equal(sol.mine, '1. Area gives displacement.')
  assert.equal(sol.earlier, '1. Use $v=u+a t$.\nso $v=12$.')
})

await test('a key for an exercise read in an earlier range is put on that paper', async () => {
  const late = await importBookRange({
    book: BOOK,
    range: range(65, 66, 'Chapter 3 Motion in a Straight Line'),
    exam: 'jee-main',
    extracted: { text: '\\section*{ANSWERS}\n\nEXERCISE 3.1\n1. (b) 2. (b) 3. (c)\n', questions: [] },
  })
  assert.deepEqual(late.parts, [])
  assert.deepEqual(late.lateAnswers.map((a) => [a.title, a.applied]), [['EXERCISE 3.1', true]])
  const ex1 = listOfficialPyqPendingSummaries('all', 'book').find((p) => p.bookExercise === 'EXERCISE 3.1')
  assert.deepEqual(getOfficialPyqPendingPaper(ex1.id).questions.map((q) => q.correctIndex), [1, 1, 2])
  await importBookRange({
    book: BOOK,
    range: range(41, 52, 'Chapter 3 Motion in a Straight Line'),
    exam: 'jee-main',
    extracted: { engine: 'mathpix', text: RANGE, visionText: RANGE, questions: [] },
  })
  assert.deepEqual(getOfficialPyqPendingPaper(ex1.id).questions.map((q) => q.correctIndex), [2, 1, 1])
})

await test('publish: Question Bank only, tagged with book, chapter and exercise; no student test', () => {
  login()
  const id = imported.parts[0].paperId
  updateOfficialPyqPendingPaper(id, { adminFacts: { confirmedAt: Date.now(), confirmedBy: 'test' } })
  const ok = approveOfficialPyqPaper(id)
  assert.equal(ok.ok, true, JSON.stringify(ok.errors || ok.error))
  const testsBefore = loadCustomTests().length
  const pub = publishOfficialPyqPaper(id)
  assert.equal(pub.ok, true, JSON.stringify(pub.errors))
  assert.equal(pub.pyqCount, 0)
  assert.equal(pub.bankCount, 3)
  assert.equal(pub.testId, '')
  assert.equal(loadCustomTests().length, testsBefore)
  const rows = (loadQuestionBank().questions || []).filter((r) => r.bankSource === BOOK_PAPER_BANK_SOURCE)
  assert.equal(rows.length, 3)
  for (const row of rows) {
    assert.equal(row.source, 'HC Verma Part 1')
    assert.equal(row.bookName, 'HC Verma Part 1')
    assert.equal(row.bookChapter, 'Chapter 3 Motion in a Straight Line')
    assert.equal(row.bookExercise, 'EXERCISE 3.1')
    assert.equal(row.bookPages, '41-52')
    assert.equal(row.officialPyq, false)
    assert.deepEqual(row.tags.slice(0, 4), ['Book', 'HC Verma Part 1', 'Chapter 3 Motion in a Straight Line', 'EXERCISE 3.1'])
  }
  const paper = getOfficialPyqPendingPaper(id)
  assert.equal(paper.status, 'published')
  assert.equal(paper.publishAudience, undefined)
  const un = unpublishOfficialPyqPaper(id)
  assert.equal(un.ok, true)
  assert.equal((loadQuestionBank().questions || []).filter((r) => r.bankSource === BOOK_PAPER_BANK_SOURCE).length, 0)
})

await test('paper names do not repeat a part already in the book name', () => {
  assert.equal(bookPartPaperName('NCERT Physics', 'NCERT Physics', 'Exercise 2'), 'NCERT Physics – Exercise 2')
  assert.equal(bookPartPaperName('DC Pandey', '', 'Level 1'), 'DC Pandey – Level 1')
})

if (failed) {
  console.error(`\n${failed} book range check(s) failed`)
  process.exit(1)
}
console.log('\nall book range checks passed')
