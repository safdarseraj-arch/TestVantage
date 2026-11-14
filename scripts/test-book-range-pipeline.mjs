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
 *   Pages to read ("1-100, 151-175" or all) become ranges cut at chapter starts; pages read stay read.
 *   A separate solutions PDF, or a key printed before its exercise is read, is kept and goes on
 *   the exercise (same chapter, same name, same number) whichever is read first.
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

const { parsePageList, planBookRanges, describePages } = await import('../src/utils/bookPagePlan.js')
const { splitBookSolutionsText } = await import('../src/utils/bookRangeSplit.js')
const { importSolutionsRange } = await import('../src/utils/bookRangeImport.js')
const { chapterRelation, findSolutionTargets } = await import('../src/utils/bookSolutions.js')

await test('pages to read: "1-100, 151-175", words, "all", overlaps joined, mistakes said plainly', () => {
  assert.deepEqual(parsePageList('1-100, 151-175', 400).intervals, [[1, 100], [151, 175]])
  assert.deepEqual(parsePageList('pages 151 to 175 and 200', 400).intervals, [[151, 175], [200, 200]])
  assert.deepEqual(parsePageList('1 - 40; 41-60', 400).intervals, [[1, 60]])
  assert.deepEqual(parsePageList('90-110, 100–120', 400).intervals, [[90, 120]])
  assert.deepEqual(parsePageList('20-10', 400).intervals, [[10, 20]])
  assert.deepEqual(parsePageList('380-999', 400).intervals, [[380, 400]])
  assert.deepEqual(parsePageList('350-end', 400).intervals, [[350, 400]])
  assert.deepEqual(parsePageList('all', 400).intervals, [[1, 400]])
  assert.match(String(parsePageList('chapter five', 400).error), /not a page/)
  assert.match(String(parsePageList('500', 400).error), /outside the book \(1-400\)/)
  assert.match(String(parsePageList('  ', 400).error), /Type the pages/)
})

await test('planned ranges: cut at chapter starts, at most the chosen size, read pages never planned again', () => {
  const chapters = [
    { title: 'Ch 1', page: 1 },
    { title: 'Ch 2', page: 61 },
    { title: 'Ch 3', page: 150 },
  ]
  const done = { start: 1, end: 20, title: 'Ch 1', chapter: 'Ch 1', status: 'done', paperIds: ['p1'] }
  const later = { start: 300, end: 320, title: 'Pages 300-320', chapter: '', status: 'new', paperIds: [] }
  const plan = planBookRanges({ pages: 400, chapters, ranges: [done, later], wanted: [[1, 100], [151, 175]], rangePages: 20, mode: 'only' })
  assert.deepEqual(
    plan.ranges.map((r) => [r.start, r.end, r.title, r.status]),
    [
      [1, 20, 'Ch 1', 'done'],
      [21, 40, 'Ch 1 (part 1 of 2)', 'new'],
      [41, 60, 'Ch 1 (part 2 of 2)', 'new'],
      [61, 80, 'Ch 2 (part 1 of 2)', 'new'],
      [81, 100, 'Ch 2 (part 2 of 2)', 'new'],
      [151, 163, 'Ch 3 (part 1 of 2)', 'new'],
      [164, 175, 'Ch 3 (part 2 of 2)', 'new'],
    ],
  )
  assert.equal(plan.ranges[1].chapter, 'Ch 1')
  assert.deepEqual([plan.added, plan.addedPages, plan.alreadyRead, plan.dropped], [6, 105, 20, 1])
  const add = planBookRanges({ pages: 400, chapters, ranges: [done, later], wanted: [[151, 160]], rangePages: 20, mode: 'add' })
  assert.deepEqual(add.ranges.map((r) => [r.start, r.end]), [[1, 20], [151, 160], [300, 320]], '"add" keeps the ranges not read yet')
  const skipped = { ...later, status: 'skipped' }
  const again = planBookRanges({ pages: 400, chapters: [], ranges: [skipped], wanted: [[300, 310]], rangePages: 20, mode: 'add' })
  assert.deepEqual(again.ranges.map((r) => [r.start, r.end, r.status]), [[300, 310, 'new']], 'a skipped range typed again is read')
  const none = planBookRanges({ pages: 400, chapters, ranges: [done], wanted: [[5, 15]], rangePages: 20, mode: 'add' })
  assert.deepEqual([none.added, none.alreadyRead], [0, 11])
  assert.equal(describePages([done, { start: 21, end: 40 }, { start: 61, end: 61 }]), '1-40, 61')
})

await test('solutions PDF text cut per exercise: chapter headings, "Solutions to …", text continuing from the last range', () => {
  const text = [
    '\\section*{Chapter 3 Motion in a Straight Line}',
    '\\section*{HINTS \\& SOLUTIONS}',
    '\\section*{EXERCISE 3.1}',
    '1. (b) Since $v=u+a t$, $v=10$.',
    '2. (c)',
    '\\section*{Solutions to Exercise 3.2}',
    '1. (a)',
    '\\section*{Chapter 4 Laws of Motion}',
    'EXERCISE 4.1',
    '1. (d)',
  ].join('\n')
  const { blocks, last } = splitBookSolutionsText(text)
  assert.deepEqual(
    blocks.map((b) => [b.title, b.chapter, b.key]),
    [
      ['EXERCISE 3.1', 'Chapter 3 Motion in a Straight Line', 'exercise31'],
      ['Exercise 3.2', 'Chapter 3 Motion in a Straight Line', 'exercise32'],
      ['EXERCISE 4.1', 'Chapter 4 Laws of Motion', 'exercise41'],
    ],
  )
  assert.match(blocks[0].text, /^1\. \(b\) Since[\s\S]*2\. \(c\)$/)
  assert.deepEqual(last, { title: 'EXERCISE 4.1', chapter: 'Chapter 4 Laws of Motion' })
  const next = splitBookSolutionsText('2. (a)\n3. (b)\n\\section*{EXERCISE 4.2}\n1. (c)', { continues: last })
  assert.deepEqual(next.blocks.map((b) => [b.title, b.chapter, Boolean(b.continued)]), [
    ['EXERCISE 4.1', 'Chapter 4 Laws of Motion', true],
    ['EXERCISE 4.2', 'Chapter 4 Laws of Motion', false],
  ])
})

await test('chapters told apart by number or name; "Exercise 1" of another chapter is never used', () => {
  assert.equal(chapterRelation('Chapter 3: Motion in One Dimension', 'Chapter 3 Kinematics'), 'same')
  assert.equal(chapterRelation('Chapter 4', 'Chapter 3 Kinematics'), 'different')
  assert.equal(chapterRelation('Unit III', '3. Kinematics'), 'same')
  assert.equal(chapterRelation('Kinematics', 'Chapter 3 Kinematics'), 'same')
  assert.equal(chapterRelation('', 'Chapter 3 Kinematics'), 'unknown')
  const papers = [
    { id: 'a', bookExercise: 'EXERCISE 1', bookChapter: 'Chapter 3 Kinematics', status: 'pending_review' },
    { id: 'b', bookExercise: 'Exercise - I (continued, Q 21-40)', bookChapter: 'Chapter 3 Kinematics', status: 'pending_review' },
    { id: 'c', bookExercise: 'Exercise 1', bookChapter: 'Chapter 5 Gravitation', status: 'pending_review' },
  ]
  const ids = (r) => r.targets.map((p) => p.id)
  assert.deepEqual(ids(findSolutionTargets({ key: 'exercise1', chapter: 'Chapter 3', title: 'Exercise 1', text: '1. (a)' }, papers)), ['a', 'b'])
  assert.deepEqual(findSolutionTargets({ key: 'exercise1', chapter: 'Chapter 4', title: 'Exercise 1', text: '1. (a)' }, papers).reason, 'chapter')
  assert.deepEqual(findSolutionTargets({ key: 'exercise1', chapter: '', title: 'Exercise 1', text: '1. (a)' }, papers).reason, 'several-chapters')
  assert.deepEqual(ids(findSolutionTargets({ key: 'exercise1', chapter: '', title: 'Exercise 1', text: '1. (a)' }, papers.slice(2))), ['c'])
  assert.deepEqual(findSolutionTargets({ key: 'exercise2', chapter: 'Chapter 3', title: 'Exercise 2', text: '1. (a)' }, papers).reason, 'waiting')
})

/** Kept solutions, like the server's: one list, a range read again replaces its own blocks. */
function memoryStore() {
  /** @type {any[]} */
  const blocks = []
  return {
    blocks,
    load: async () => blocks.map((b) => ({ ...b })),
    save: async (_id, e) => {
      for (let i = blocks.length - 1; i >= 0; i -= 1) {
        if (blocks[i].source === e.source && blocks[i].start === e.start && blocks[i].end === e.end) blocks.splice(i, 1)
      }
      blocks.push(...e.blocks.map((b) => ({ ...b, source: e.source, start: e.start, end: e.end })))
    },
  }
}

const exerciseText = (chapter, title, n) =>
  [
    `\\section*{${chapter}}`,
    `\\section*{${title}}`,
    ...Array.from({ length: n }, (_, i) => [
      `${i + 1}. A particle moves with speed $${i + 2} \\mathrm{~m} / \\mathrm{s}$ for ${i + 3} seconds. Find the distance covered by it.`,
      `(a) ${i + 1} m`,
      `(b) ${i + 5} m`,
      `(c) ${(i + 2) * (i + 3)} m`,
      `(d) ${i + 30} m`,
    ]).flat(),
  ].join('\n')

await test('separate solutions PDF read after the exercise: answers and solutions go on it', async () => {
  const BOOK2 = { id: 'bk-00000000000000a2', name: 'DC Pandey Mechanics', pages: 300, ranges: [] }
  const SOL2 = { id: 'bk-00000000000000b2', name: 'DC Pandey Mechanics – Solutions', pages: 80, ranges: [], role: 'solutions' }
  const store = memoryStore()
  const q = await importBookRange({
    book: BOOK2,
    range: range(10, 20, ''),
    exam: 'jee-main',
    extracted: { text: exerciseText('Chapter 3 Kinematics', 'EXERCISE 1', 3), questions: [] },
    solutionStore: store,
  })
  assert.deepEqual(q.parts.map((p) => [p.title, p.count, p.answered]), [['EXERCISE 1', 3, 0]])
  const sol = await importSolutionsRange({
    book: BOOK2,
    solutionsBook: SOL2,
    range: range(1, 4, ''),
    text: [
      '\\section*{Chapter 3 Motion in One Dimension}',
      '\\section*{EXERCISE 1}',
      '1. (c) Distance $=$ speed $\\times$ time $=2 \\times 3=6 \\mathrm{~m}$.',
      '2. (c) Distance $=3 \\times 4=12 \\mathrm{~m}$.',
      '3. (c) Distance $=4 \\times 5=20 \\mathrm{~m}$.',
    ].join('\n'),
    solutionStore: store,
  })
  assert.equal(sol.blocks.length, 1)
  assert.equal(sol.blocks[0].applied.length, 1, JSON.stringify(sol.blocks))
  assert.equal(sol.blocks[0].applied[0].ok, true, JSON.stringify(sol.blocks))
  const paper = getOfficialPyqPendingPaper(q.parts[0].paperId)
  assert.deepEqual(paper.questions.map((x) => x.correctIndex), [2, 2, 2])
  assert.match(String(paper.questions[1].solution), /3 \\times 4=12/)
  assert.equal(store.blocks.length, 1, 'kept for a later read of the same exercise')

  await importBookRange({
    book: BOOK2,
    range: range(10, 20, ''),
    exam: 'jee-main',
    extracted: { text: exerciseText('Chapter 3 Kinematics', 'EXERCISE 1', 3), questions: [] },
    solutionStore: store,
  })
  assert.deepEqual(
    getOfficialPyqPendingPaper(q.parts[0].paperId).questions.map((x) => x.correctIndex),
    [2, 2, 2],
    'reading the exercise again keeps the solutions PDF answers',
  )
})

await test('solutions read before the exercise wait for it; another chapter\'s "Exercise 1" is left alone', async () => {
  const BOOK3 = { id: 'bk-00000000000000a3', name: 'Cengage Physics', pages: 300, ranges: [] }
  const SOL3 = { id: 'bk-00000000000000b3', name: 'Cengage Physics – Solutions', pages: 80, ranges: [], role: 'solutions' }
  const store = memoryStore()
  const ch3 = await importBookRange({
    book: BOOK3,
    range: range(10, 20, ''),
    exam: 'jee-main',
    extracted: { text: exerciseText('Chapter 3 Kinematics', 'Exercise 1', 2), questions: [] },
    solutionStore: store,
  })
  const sol = await importSolutionsRange({
    book: BOOK3,
    solutionsBook: SOL3,
    range: range(5, 8, ''),
    text: '\\section*{Chapter 4 Laws of Motion}\n\\section*{Exercise 1}\n1. (a) First.\n2. (b) Second.',
    solutionStore: store,
  })
  assert.deepEqual(sol.blocks.map((b) => [b.title, b.applied.length, b.reason]), [['Exercise 1', 0, 'chapter']])
  assert.deepEqual(getOfficialPyqPendingPaper(ch3.parts[0].paperId).questions.map((x) => x.correctIndex ?? null), [null, null])
  const ch4 = await importBookRange({
    book: BOOK3,
    range: range(40, 50, ''),
    exam: 'jee-main',
    extracted: { text: exerciseText('Chapter 4 Laws of Motion', 'Exercise 1', 2), questions: [] },
    solutionStore: store,
  })
  assert.deepEqual(ch4.keptApplied.map((a) => a.title), ['Exercise 1'])
  assert.deepEqual(ch4.parts.map((p) => p.answered), [2], 'the result counts what the kept answers added')
  assert.deepEqual(getOfficialPyqPendingPaper(ch4.parts[0].paperId).questions.map((x) => x.correctIndex), [0, 1])
  assert.deepEqual(getOfficialPyqPendingPaper(ch3.parts[0].paperId).questions.map((x) => x.correctIndex ?? null), [null, null])
})

await test('an answer key printed in the book before its exercise is read is kept and used later', async () => {
  const BOOK4 = { id: 'bk-00000000000000a4', name: 'Arihant Chemistry', pages: 500, ranges: [] }
  const store = memoryStore()
  const keys = await importBookRange({
    book: BOOK4,
    range: range(480, 490, 'Chapter 5 Gaseous State'),
    exam: 'jee-main',
    extracted: { text: '\\section*{ANSWERS}\n\nEXERCISE 5.1\n1. (b) 2. (d)\n', questions: [] },
    solutionStore: store,
  })
  assert.deepEqual(keys.lateAnswers.map((a) => [a.title, a.applied, a.reason]), [['EXERCISE 5.1', false, 'waiting']])
  const ex = await importBookRange({
    book: BOOK4,
    range: range(100, 110, ''),
    exam: 'jee-main',
    extracted: { text: exerciseText('Chapter 5 Gaseous State', 'EXERCISE 5.1', 2), questions: [] },
    solutionStore: store,
  })
  assert.deepEqual(ex.keptApplied.map((a) => a.title), ['EXERCISE 5.1'])
  assert.deepEqual(getOfficialPyqPendingPaper(ex.parts[0].paperId).questions.map((x) => x.correctIndex), [1, 3])
})

await test('a part that continues an exercise remembers where its numbers start', () => {
  const cont = listOfficialPyqPendingSummaries('all', 'book').find((p) => /continued, Q 3-4/.test(p.bookExercise || ''))
  assert.ok(cont, 'continued part')
  assert.equal(getOfficialPyqPendingPaper(cont.id).bookNumberOffset, 2)
})

await test('solutions for an exercise read in two ranges: Q 3 and Q 4 go on the second part as its Q 1 and Q 2', async () => {
  const sol = await importSolutionsRange({
    book: BOOK,
    solutionsBook: { id: 'bk-00000000000000b1', name: 'HC Verma Solutions', pages: 50, ranges: [] },
    range: range(1, 2, ''),
    text: '\\section*{Chapter 3 Motion in a Straight Line}\n\\section*{EXERCISE 3.3}\n1. (b)\n2. (c)\n3. (d)\n4. (c)',
    solutionStore: memoryStore(),
  })
  assert.equal(sol.blocks[0].applied.length, 2)
  const parts = listOfficialPyqPendingSummaries('all', 'book').filter((p) => /^EXERCISE 3\.3/.test(p.bookExercise || ''))
  const first = parts.find((p) => !/continued/.test(p.bookExercise))
  const cont = parts.find((p) => /continued/.test(p.bookExercise))
  assert.deepEqual(getOfficialPyqPendingPaper(first.id).questions.map((q) => q.correctIndex), [1, 2])
  assert.deepEqual(getOfficialPyqPendingPaper(cont.id).questions.map((q) => q.correctIndex), [3, 2])
})

if (failed) {
  console.error(`\n${failed} book range check(s) failed`)
  process.exit(1)
}
console.log('\nall book range checks passed')
