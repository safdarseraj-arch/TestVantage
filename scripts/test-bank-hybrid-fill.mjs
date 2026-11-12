/**
 * Question-bank upload splits only; "Fill with Hybrid AI" on Draft questions fills later.
 *   Split-only mapping keeps the printed answer and printed solution, and nothing else.
 *   Deferring solutions keeps a solution printed on the paper.
 *   The fill sends Draft questions two at a time, keeps printed answers and solutions,
 *   asks for tags only when both are printed, and skips a question reworded meanwhile.
 * No live API: the Gemini request is a stub.
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

const { geminiStructuredItemToBankDraft, geminiStructureToBankDrafts } = await import('../src/utils/mathpixGeminiMap.js')
const { deferUnprintedSolution } = await import('../src/utils/mathpixGeminiPipeline.js')
const { bankDraftsToFill, bankHybridFillRequest, fillBankDraftsWithHybridAi } = await import('../src/utils/bankHybridFill.js')
const { addUploadedQuestionsBulk, clearQuestionBank, peekUploadedQuestions, updateUploadedQuestion } = await import(
  '../src/utils/questionBank.js'
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

const SOLUTION = 'Since $2+2=4$, the sum of the two numbers is $4$, so option (B) is correct.'
const AI_SOLUTION = 'Adding the numbers gives $3+3=6$, which is the value asked for, so the answer is (C).'

function reply(over = {}) {
  return {
    subject: 'Mathematics',
    unit: 'Algebra',
    chapter: 'Numbers',
    topic: 'Addition',
    question_type: 'single_correct',
    exam: 'JEE Main',
    toughness_level: '2',
    source: '',
    correct_answer: 'C',
    step_by_step_solution: AI_SOLUTION,
    ...over,
  }
}

function seed(rows) {
  clearQuestionBank()
  return addUploadedQuestionsBulk(rows)
}

const byText = (text) => peekUploadedQuestions().find((q) => q.text === text)

await test('split-only mapping keeps a printed answer and solution, and adds no AI tags', () => {
  const row = geminiStructuredItemToBankDraft(
    {
      text: 'The value of $2+2$ is',
      options: ['3', '4', '5', '6'],
      questionType: 'single_correct',
      correctIndex: 1,
      answerKeyVisible: true,
      solution: SOLUTION,
      solutionPrinted: true,
      chapter: 'Made-up chapter',
      topic: 'Made-up topic',
      toughnessLevel: 5,
    },
    { splitOnly: true },
  )
  assert.equal(row.correctIndex, 1)
  assert.equal(row.answerSource, 'from_paper')
  assert.equal(row.solution, SOLUTION)
  assert.equal(row.solutionSource, 'from_paper')
  assert.equal(row.chapter, 'General')
  assert.equal(row.topic, undefined)
  assert.equal(row.toughnessLevel, undefined)
  assert.equal(row.bankStatus, 'draft')
})

await test('split-only mapping drops an answer and solution the paper did not print', () => {
  const row = geminiStructuredItemToBankDraft(
    {
      text: 'The value of $3+3$ is',
      options: ['3', '4', '6', '8'],
      questionType: 'single_correct',
      correctIndex: 2,
      solution: AI_SOLUTION,
    },
    { splitOnly: true },
  )
  assert.equal(row.correctIndex, undefined)
  assert.equal(row.answerSource, 'unknown')
  assert.equal(row.solution, undefined)
  assert.equal(row.solutionSource, undefined)
})

await test('split-only mapping does not keep a bare "Answer: (B)" line as a printed solution', () => {
  const row = geminiStructuredItemToBankDraft(
    {
      text: 'The value of $2+2$ is',
      options: ['3', '4', '5', '6'],
      questionType: 'single_correct',
      correctIndex: 1,
      answerKeyVisible: true,
      solution: 'Answer: (B)',
      solutionPrinted: true,
    },
    { splitOnly: true },
  )
  assert.equal(row.correctIndex, 1)
  assert.equal(row.solution, undefined)
  assert.equal(row.solutionSource, undefined)
})

await test('geminiStructureToBankDrafts passes splitOnly to every row', () => {
  const { drafts } = geminiStructureToBankDrafts(
    {
      questions: [
        { text: 'The value of $2+2$ is', options: ['3', '4', '5', '6'], questionType: 'single_correct', correctIndex: 1 },
        { text: 'The value of $3+3$ is', options: ['3', '4', '6', '8'], questionType: 'single_correct', correctIndex: 2 },
      ],
    },
    { splitOnly: true },
  )
  assert.equal(drafts.length, 2)
  for (const d of drafts) {
    assert.equal(d.answerSource, 'unknown')
    assert.equal(d.correctIndex, undefined)
  }
})

await test('deferring solutions keeps one printed on the paper', () => {
  const printed = deferUnprintedSolution({ text: 'x', solution: SOLUTION, solutionSource: 'from_paper' })
  assert.equal(printed.solution, SOLUTION)
  assert.equal(printed.solutionPending, undefined)
  const ai = deferUnprintedSolution({ text: 'x', solution: AI_SOLUTION, solutionSource: 'ai_generated' })
  assert.equal(ai.solution, '')
  assert.equal(ai.solutionSource, undefined)
  assert.equal(ai.solutionPending, true)
})

await test('bankDraftsToFill picks unfilled Drafts only (all Drafts with redoAll)', () => {
  const rows = [
    { id: 'a', text: 'Q a', bankStatus: 'draft' },
    { id: 'b', text: 'Q b', bankStatus: 'published' },
    { id: 'c', text: '', bankStatus: 'draft' },
    { id: 'd', text: 'Q d', bankStatus: 'draft', placeholder: true },
    { id: 'e', text: 'Q e', bankStatus: 'draft', chapter: 'Numbers', correctIndex: 1, solution: SOLUTION },
    { id: 'f', text: 'Q f', bankStatus: 'draft', chapter: 'General', correctIndex: 1, solution: SOLUTION },
  ]
  assert.deepEqual(bankDraftsToFill(rows).map((q) => q.id), ['a', 'f'])
  assert.deepEqual(bankDraftsToFill(rows, { redoAll: true }).map((q) => q.id), ['a', 'e', 'f'])
  assert.deepEqual(bankDraftsToFill(null), [])
})

await test('bankHybridFillRequest sends the paragraph, and tags only when answer and solution are printed', () => {
  const body = bankHybridFillRequest({
    text: 'Find the speed.',
    passageText: 'A car moves 10 m in 2 s.',
    options: ['1', '5', '10', '20'],
    correctIndex: 1,
    answerSource: 'from_paper',
  })
  assert.match(body.question_text, /^Paragraph:\nA car moves 10 m in 2 s\.\n\nQuestion:\nFind the speed\.$/)
  assert.equal(body.tags_only, undefined)
  assert.equal(body.answer, 'B')
  const tagsOnly = bankHybridFillRequest({
    text: 'The value of $2+2$ is',
    options: ['3', '4', '5', '6'],
    correctIndex: 1,
    answerSource: 'from_paper',
    solution: SOLUTION,
    solutionSource: 'from_paper',
  })
  assert.equal(tagsOnly.tags_only, true)
  assert.equal('answer' in tagsOnly, false)
  assert.equal('solution' in tagsOnly, false)
})

await test('fill keeps a printed answer, fills the missing solution and tags, two at a time', async () => {
  const saved = seed([
    { text: 'Printed answer question', options: ['3', '4', '5', '6'], questionType: 'single_correct', correctIndex: 1, answerSource: 'from_paper', bankStatus: 'draft' },
    { text: 'Blank question one', options: ['3', '4', '6', '8'], questionType: 'single_correct', answerSource: 'unknown', bankStatus: 'draft' },
    { text: 'Blank question two', options: ['3', '4', '6', '8'], questionType: 'single_correct', answerSource: 'unknown', bankStatus: 'draft' },
  ])
  let inFlight = 0
  let maxInFlight = 0
  const result = await fillBankDraftsWithHybridAi(
    saved.map((q) => q.id),
    {
      fillOne: async () => {
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        await new Promise((r) => setTimeout(r, 5))
        inFlight -= 1
        return reply()
      },
    },
  )
  assert.equal(result.total, 3)
  assert.equal(result.filled, 3)
  assert.equal(maxInFlight, 2)
  const printed = byText('Printed answer question')
  assert.equal(printed.correctIndex, 1, 'printed answer stays')
  assert.equal(printed.answerSource, 'from_paper')
  assert.equal(printed.hybridAnswerDisagrees, 'C')
  assert.equal(printed.solution, AI_SOLUTION)
  assert.equal(printed.chapter, 'Numbers')
  const blank = byText('Blank question one')
  assert.equal(blank.correctIndex, 2)
  assert.equal(blank.answerSource, 'hybrid_ai')
  assert.equal(blank.solution, AI_SOLUTION)
  assert.equal(blank.solutionSource, 'hybrid_ai')
})

await test('fill asks for tags only and keeps both when answer and solution are printed', async () => {
  const saved = seed([
    {
      text: 'Fully printed question',
      options: ['3', '4', '5', '6'],
      questionType: 'single_correct',
      correctIndex: 1,
      answerSource: 'from_paper',
      solution: SOLUTION,
      solutionSource: 'from_paper',
      bankStatus: 'draft',
    },
  ])
  const bodies = []
  const result = await fillBankDraftsWithHybridAi([saved[0].id], {
    fillOne: async (body) => {
      bodies.push(body)
      return reply()
    },
  })
  assert.equal(bodies.length, 1)
  assert.equal(bodies[0].tags_only, true)
  assert.equal(result.tagsOnly, 1)
  const card = byText('Fully printed question')
  assert.equal(card.correctIndex, 1)
  assert.equal(card.answerSource, 'from_paper')
  assert.equal(card.solution, SOLUTION)
  assert.equal(card.solutionSource, 'from_paper')
  assert.equal(card.chapter, 'Numbers')
})

await test('fill skips a question reworded or published while the request runs', async () => {
  const saved = seed([
    { text: 'Will be reworded', options: ['3', '4', '6', '8'], questionType: 'single_correct', bankStatus: 'draft' },
    { text: 'Will be published', options: ['3', '4', '6', '8'], questionType: 'single_correct', bankStatus: 'draft' },
  ])
  const [reworded, published] = saved
  const result = await fillBankDraftsWithHybridAi([reworded.id, published.id], {
    fillOne: async (body) => {
      if (body.question_text === 'Will be reworded') {
        updateUploadedQuestion(reworded.id, { text: 'Reworded by hand' }, { silent: true, skipHistory: true })
      } else {
        updateUploadedQuestion(published.id, { bankStatus: 'published' }, { silent: true, skipHistory: true })
      }
      return reply()
    },
  })
  assert.equal(result.filled, 0)
  const a = byText('Reworded by hand')
  assert.ok(a, 'reworded card still there')
  assert.equal(a.solution ?? '', '')
  assert.notEqual(a.chapter, 'Numbers')
  const b = byText('Will be published')
  assert.equal(b.solution ?? '', '')
})

await test('a hint-like solution is not saved and the question is marked for a look', async () => {
  const saved = seed([{ text: 'What is the value of 3 plus 3?', options: ['3', '4', '6', '8'], questionType: 'single_correct', bankStatus: 'draft' }])
  const result = await fillBankDraftsWithHybridAi([saved[0].id], {
    fillOne: async () => reply({ step_by_step_solution: 'Hint: think about adding the two numbers together carefully.' }),
  })
  assert.equal(result.needsLook.length, 1)
  const [card] = peekUploadedQuestions()
  assert.equal(card.solution ?? '', '')
  assert.equal(card.correctIndex, 2)
})

await test('upload no longer calls the light Gemini enrich step; Draft view renders the button', () => {
  const pipeline = fs.readFileSync(new URL('../src/utils/mathpixGeminiPipeline.js', import.meta.url), 'utf8')
  assert.equal(pipeline.includes('enrichQuestionsLightClient'), false)
  assert.equal(pipeline.includes('enrich-ocr-light'), false)
  const page = fs.readFileSync(new URL('../src/pages/QuestionBank.jsx', import.meta.url), 'utf8')
  assert.match(page, /import BankHybridFill from '\.\.\/components\/BankHybridFill\.jsx'/)
  assert.match(page, /<BankHybridFill drafts=\{shownDrafts\} onChanged=\{refresh\} \/>/)
})

if (failed) {
  console.error(`\n${failed} bank Hybrid fill test(s) failed.`)
  process.exit(1)
}
console.log('\nAll bank Hybrid fill tests passed.')
