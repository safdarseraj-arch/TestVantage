/**
 * Quick Revision: exam/subject/chapter filter, sheet shape, watermark flag.
 * Does not touch the question-bank localStorage key.
 */
import assert from 'node:assert/strict'
import { getChapterOptions, getSectionOptions } from '../src/utils/curriculumOptions.js'
import { getSubjectOptionsForPicker } from '../src/utils/questionMetadata.js'

if (typeof globalThis.localStorage === 'undefined') {
  const mem = new Map()
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  }
}

const BANK_KEY = 'testvantage-uploaded-questions'
localStorage.setItem(BANK_KEY, JSON.stringify({ questions: [{ id: 'keep-me', text: 'do not wipe' }] }))

const {
  QUESTION_BANK_STORE_KEY,
  QUICK_REVISION_STORE_KEY,
  buildStarterRevisionSheet,
  buildWatermarkedRevisionHtml,
  canImproveRevisionSheet,
  canRegenerateRevisionSheet,
  mergeImprovedSheet,
  getDisplayedRevisionSheet,
  isRevisionSheetShape,
  listRevisionChapters,
  listRevisionExams,
  listRevisionSubjects,
  loadSavedRevisionSheet,
  parseAiRevisionSheet,
  revisionPrintFileName,
  revisionSheetHasWatermark,
  saveRevisionSheet,
  QUICK_REVISION_AI_INSTRUCTION,
  QUICK_REVISION_IMPROVE_INSTRUCTION,
} = await import('../src/utils/quickRevision.js')

assert.equal(QUESTION_BANK_STORE_KEY, BANK_KEY)
assert.equal(QUICK_REVISION_STORE_KEY, 'testvantage-quick-revision-sheets')

assert.deepEqual(listRevisionSubjects(''), [])
assert.deepEqual(listRevisionChapters('', 'physics'), [])
assert.deepEqual(listRevisionChapters('jee-main', ''), [])

const exams = listRevisionExams()
assert.ok(exams.some((e) => e.id === 'jee-main'))
assert.ok(exams.some((e) => e.id === 'jee-advanced'))
assert.ok(exams.some((e) => e.id === 'neet'))

const jeeSubjects = listRevisionSubjects('jee-main').map((s) => s.id)
assert.ok(jeeSubjects.includes('mathematics'))
assert.ok(jeeSubjects.includes('physics'))
assert.ok(!jeeSubjects.includes('botany'))
assert.ok(!jeeSubjects.includes('zoology'))

const neetSubjects = listRevisionSubjects('neet').map((s) => s.id)
assert.ok(neetSubjects.includes('botany'))
assert.ok(neetSubjects.includes('zoology'))
assert.ok(!neetSubjects.includes('mathematics'))

assert.deepEqual(listRevisionChapters('jee-main', 'botany'), [])
assert.deepEqual(listRevisionChapters('neet', 'mathematics'), [])

const mathChapters = listRevisionChapters('jee-main', 'mathematics')
assert.ok(mathChapters.some((c) => c.chapter === 'Quadratic Equations'))
assert.ok(mathChapters.every((c) => c.section && c.chapter && Array.isArray(c.topics)))
assert.deepEqual(
  listRevisionSubjects('jee-main').map((s) => s.id),
  getSubjectOptionsForPicker(['jee-main']).map((s) => s.id),
)
const firstUnit = getSectionOptions('mathematics')[0]
const firstChapter = getChapterOptions('mathematics', firstUnit)[0]
assert.equal(mathChapters[0].section, firstUnit)
assert.equal(mathChapters[0].chapter, firstChapter)

const kin = mathChapters.find((c) => c.chapter === 'Quadratic Equations')
assert.ok(kin)

const sheet = buildStarterRevisionSheet({
  examId: 'jee-main',
  subject: 'mathematics',
  chapter: 'Quadratic Equations',
})
assert.ok(sheet)
assert.ok(isRevisionSheetShape(sheet))
assert.equal(sheet.examId, 'jee-main')
assert.equal(sheet.subject, 'mathematics')
assert.equal(sheet.chapter, 'Quadratic Equations')
assert.ok(sheet.definitions.length >= 1)
assert.ok(sheet.formulas.length >= 1)
assert.ok(Array.isArray(sheet.extraFormulas))
assert.ok(sheet.points.length >= 1)
assert.equal(sheet.watermark, true)
assert.equal(revisionSheetHasWatermark(sheet), true)
assert.equal(sheet.source, 'starter')

const physics = buildStarterRevisionSheet({
  examId: 'jee-main',
  subject: 'physics',
  chapter: 'Kinematics',
})
assert.ok(physics)
assert.ok(physics.formulas.some((f) => /sin/.test(f.latex) || /u \+ at/.test(f.latex) || f.name.includes('SUVAT')))
assert.ok(physics.extraFormulas.length >= 1)

const missing = buildStarterRevisionSheet({
  examId: 'jee-main',
  subject: 'physics',
  chapter: 'Not A Real Chapter',
})
assert.equal(missing, null)

const generic = buildStarterRevisionSheet({
  examId: 'neet',
  subject: 'botany',
  chapter: 'Plant Kingdom',
})
assert.ok(generic)
assert.ok(isRevisionSheetShape(generic))
assert.ok(generic.points.some((p) => /NEET/i.test(p)))

const saved = saveRevisionSheet({
  ...sheet,
  source: 'ai',
  definitions: [...sheet.definitions, { term: 'Extra', meaning: 'Saved AI extra.' }],
})
assert.ok(saved)
assert.equal(saved.source, 'ai')
assert.equal(saved.watermark, true)

const again = getDisplayedRevisionSheet('jee-main', 'mathematics', 'Quadratic Equations')
assert.equal(again.source, 'ai')
assert.ok(again.definitions.some((d) => d.term === 'Extra'))

const parsed = parseAiRevisionSheet(
  {
    definitions: [{ term: 'Root', meaning: 'Solution of the quadratic.' }],
    formulas: [{ name: 'Sum of roots', latex: '\\alpha+\\beta=-b/a', note: 'Monic form too.' }],
    extraFormulas: [
      { name: 'Common root', latex: 'a_1\\alpha^2+b_1\\alpha+c_1=0', note: 'Two quadratics.' },
    ],
    points: ['Watch the sign of the sum.'],
  },
  sheet,
)
assert.equal(parsed.source, 'ai')
assert.equal(parsed.watermark, true)
assert.equal(parsed.chapter, 'Quadratic Equations')
assert.ok(parsed.definitions.some((d) => d.term === 'Root'))
assert.ok(parsed.extraFormulas.some((f) => f.name === 'Common root'))
assert.ok(QUICK_REVISION_AI_INSTRUCTION.includes('extraFormulas'))
assert.ok(/IMPROVE|missing/i.test(QUICK_REVISION_IMPROVE_INSTRUCTION))
assert.ok(/non-standard|NON-STANDARD/i.test(QUICK_REVISION_AI_INSTRUCTION))

const longOnly = parseAiRevisionSheet(
  {
    definitions: [{ term: 'A', meaning: 'One.' }],
    formulas: Array.from({ length: 16 }, (_, i) => ({
      name: `F${i + 1}`,
      latex: `x_${i}`,
      note: i > 11 ? 'trick formula' : 'standard',
    })),
    points: ['Pitfall.'],
  },
  sheet,
)
assert.ok(longOnly.formulas.some((f) => f.name === 'F1'))
assert.ok(longOnly.extraFormulas.some((f) => f.name === 'F16'), 'split extras from a long formulas-only Gemini dump')

const dumped = parseAiRevisionSheet(
  {
    definitions: [{ term: 'A', meaning: 'One.' }],
    formulas: Array.from({ length: 16 }, (_, i) => ({
      name: `S${i + 1}`,
      latex: `y_${i}`,
      note: 'standard',
    })),
    extraFormulas: [],
    points: ['Pitfall.'],
  },
  sheet,
)
assert.ok(dumped.formulas.length === 12)
assert.ok(dumped.extraFormulas.some((f) => f.name === 'S16'))

const parsedFromText = parseAiRevisionSheet(
  JSON.stringify({
    definitions: [{ term: 'D', meaning: 'Discriminant.' }],
    formulas: [{ name: 'D', latex: 'b^2-4ac' }],
    points: ['Sign of D.'],
  }),
  sheet,
)
assert.ok(parsedFromText.definitions.some((d) => d.term === 'D'))

const html = buildWatermarkedRevisionHtml(sheet)
assert.ok(html.includes('TestVantages'))
assert.ok(html.includes('wm-layer'))
assert.ok(html.includes('Standard formulas'))
assert.ok(html.includes('Extra / non-standard formulas'))
assert.ok(html.includes('Quadratic Equations'))
assert.ok(/watermark|TestVantages/i.test(html))
assert.ok(revisionPrintFileName(sheet).includes('quick-revision'))
assert.ok(revisionPrintFileName(sheet).endsWith('.html'))

assert.equal(canRegenerateRevisionSheet({ role: 'admin' }), true)
assert.equal(canRegenerateRevisionSheet({ role: 'teacher' }), true)
assert.equal(canRegenerateRevisionSheet({ role: 'user' }), false)
assert.equal(canImproveRevisionSheet({ role: 'admin' }), true)
assert.equal(canImproveRevisionSheet({ role: 'teacher' }), true)
assert.equal(canImproveRevisionSheet({ role: 'user' }), false)
assert.equal(canImproveRevisionSheet(null), false)

const merged = mergeImprovedSheet(sheet, {
  ...sheet,
  definitions: [...sheet.definitions, { term: 'NewTerm', meaning: 'Added by improve.' }],
  extraFormulas: [...(sheet.extraFormulas ?? []), { name: 'ExtraTrick', latex: 'x=1', note: 'trick' }],
})
assert.ok(merged.definitions.some((d) => d.term === 'NewTerm'))
assert.ok(merged.definitions.some((d) => d.term === sheet.definitions[0].term))
assert.ok(merged.extraFormulas.some((f) => f.name === 'ExtraTrick'))

const improvedSaved = saveRevisionSheet(merged, { keepPrevious: sheet })
assert.ok(improvedSaved.previous)
assert.ok(improvedSaved.improvedAt)
assert.ok(improvedSaved.previous.definitions.length >= 1)
const loadedImproved = loadSavedRevisionSheet('jee-main', 'mathematics', 'Quadratic Equations')
assert.ok(loadedImproved.previous)
assert.ok(loadedImproved.improvedAt)

const bankAfter = JSON.parse(localStorage.getItem(BANK_KEY))
assert.equal(bankAfter.questions[0].id, 'keep-me')
assert.ok(localStorage.getItem(QUICK_REVISION_STORE_KEY))
assert.notEqual(QUICK_REVISION_STORE_KEY, BANK_KEY)

const {
  STRATEGY_STORE_KEY,
  STRATEGY_AI_INSTRUCTION,
  attachPyqProvenance,
  buildStarterStrategyPack,
  buildWatermarkedStrategyHtml,
  canEditStrategyPack,
  compactPyqsForAssist,
  getDisplayedStrategyPack,
  listChapterStrategyPyqs,
  mergeImprovedStrategyPack,
  parseAiStrategyPack,
  saveStrategyPack,
  strategyPrintFileName,
} = await import('../src/utils/quickRevisionStrategy.js')

assert.notEqual(STRATEGY_STORE_KEY, BANK_KEY)
assert.notEqual(STRATEGY_STORE_KEY, QUICK_REVISION_STORE_KEY)
assert.ok(/PYQ/i.test(STRATEGY_AI_INSTRUCTION))
assert.ok(/Cluster/i.test(STRATEGY_AI_INSTRUCTION))
assert.ok(!/template|foundation|generic|problem types|variants of these/i.test(STRATEGY_AI_INSTRUCTION))
assert.equal(canEditStrategyPack({ role: 'admin' }), true)
assert.equal(canEditStrategyPack({ role: 'user' }), false)

const emptyStrat = buildStarterStrategyPack({
  examId: 'jee-main',
  subject: 'physics',
  chapter: 'Kinematics',
})
assert.ok(emptyStrat)
assert.equal(emptyStrat.items.length, 0)
assert.equal(listChapterStrategyPyqs('jee-main', 'physics', 'Kinematics').length, 0)

localStorage.setItem(
  'testvantage-pyq-imported',
  JSON.stringify({
    questions: [
      {
        id: 'imp-kin-1',
        subject: 'physics',
        chapter: 'Kinematics',
        text: 'A car starts from rest and accelerates at 2 m/s^2 for 5 s. The distance travelled is',
        options: ['10 m', '25 m', '50 m', '5 m'],
        pyqYear: 2023,
        examPatternId: 'jee-main',
        paperLabel: '24 Jan 2023 · Shift 1',
        officialPyq: true,
        imported: true,
      },
    ],
  }),
)
const bankNow = JSON.parse(localStorage.getItem(BANK_KEY))
bankNow.questions.push({
  id: 'bank-pyq-kin',
  subject: 'physics',
  chapter: 'Kinematics',
  text: 'A particle has v = 4t - 2. Displacement in first 2 s from rest is',
  options: ['4 m', '6 m', '8 m', '12 m'],
  examIds: ['jee-main'],
  examPatternId: 'jee-main',
  pyqYear: 2022,
  paperLabel: '6 Apr 2022 · Shift 2',
  bankSource: 'official_pyq',
  officialPyq: true,
  bankStatus: 'published',
})
localStorage.setItem(BANK_KEY, JSON.stringify(bankNow))

const pyqRows = listChapterStrategyPyqs('jee-main', 'physics', 'Kinematics')
assert.ok(pyqRows.length >= 2)
assert.ok(pyqRows.some((q) => q.id === 'imp-kin-1'))
assert.ok(pyqRows.some((q) => q.id === 'bank-pyq-kin'))
assert.equal(listChapterStrategyPyqs('jee-main', 'physics', 'Thermodynamics').length, 0)
assert.ok(compactPyqsForAssist(pyqRows)[0].id)

const strat = buildStarterStrategyPack({
  examId: 'jee-main',
  subject: 'physics',
  chapter: 'Kinematics',
})
assert.ok(strat)
assert.ok(strat.items.length >= 1)
assert.ok(strat.items.every((it) => it.source === 'pyq'))
assert.ok(!strat.items.some((it) => /template|generic|problem type/i.test(`${it.typeName} ${it.problem}`)))

const parsedStrat = parseAiStrategyPack(
  {
    items: [
      {
        familyName: 'Constant acceleration',
        typeName: 'Car from rest',
        problem: 'A car starts from rest and accelerates at 2 m/s^2 for 5 s. The distance travelled is',
        options: ['10 m', '25 m', '50 m', '5 m'],
        steps: ['u = 0, a = 2, t = 5.', 's = ut + 1/2 at^2 = 25 m.'],
        outline: 'Distance is 25 m.',
        source: 'pyq',
        questionId: 'imp-kin-1',
      },
      {
        familyName: 'Missing variation',
        typeName: 'Extra only',
        problem: 'A body is thrown vertically up with 20 m/s. Time to return is',
        options: ['2 s', '4 s', '6 s', '8 s'],
        steps: ['Use v = u - gt and return time 2u/g.'],
        outline: 'Time is 4 s.',
        source: 'extra',
      },
    ],
  },
  strat,
  pyqRows,
)
assert.equal(parsedStrat.source, 'ai')
assert.equal(parsedStrat.items.find((it) => it.questionId === 'imp-kin-1')?.source, 'pyq')
assert.equal(parsedStrat.items.find((it) => it.typeName === 'Extra only')?.source, 'extra')
const fakePyq = attachPyqProvenance(
  [{ typeName: 'Fake', problem: 'Invented stem with no bank match at all here.', source: 'pyq', steps: ['x'], outline: 'y' }],
  pyqRows,
)
assert.equal(fakePyq[0].source, 'extra')

const mergedStrat = mergeImprovedStrategyPack(strat, parsedStrat)
assert.ok(mergedStrat.items.some((it) => it.source === 'pyq'))
assert.ok(mergedStrat.items.length >= strat.items.length)

const savedStrat = saveStrategyPack(mergedStrat, { keepPrevious: strat })
assert.ok(savedStrat.previous)
assert.ok(getDisplayedStrategyPack('jee-main', 'physics', 'Kinematics').items.some((it) => it.source === 'pyq'))
const stratHtml = buildWatermarkedStrategyHtml(savedStrat)
assert.ok(stratHtml.includes('Problem solving strategy'))
assert.ok(stratHtml.includes('Questions grouped by how you solve them. PYQ first.'))
assert.ok(stratHtml.includes('How to solve this question'))
assert.ok(stratHtml.includes('PYQ'))
assert.ok(stratHtml.includes('extra (no PYQ yet)'))
assert.ok(!/template|generic problem/i.test(stratHtml))
assert.ok(stratHtml.includes('TestVantages'))
assert.ok(strategyPrintFileName(savedStrat).includes('problem-strategy'))
assert.equal(JSON.parse(localStorage.getItem(BANK_KEY)).questions[0].id, 'keep-me')

const { JEE_COMPLETE_STRATEGY_HTML, JEE_COMPLETE_STRATEGY_TITLE } = await import(
  '../src/content/jeeCompleteProblemSolvingHtml.js'
)
assert.ok(/Ten Core Strategies/i.test(JEE_COMPLETE_STRATEGY_HTML))
assert.ok(/Four-Phase Problem-Solving Process/i.test(JEE_COMPLETE_STRATEGY_HTML))
assert.ok(!/\.docx/i.test(JEE_COMPLETE_STRATEGY_HTML))
assert.ok(!/<a\b/i.test(JEE_COMPLETE_STRATEGY_HTML))
assert.ok(/JEE/i.test(JEE_COMPLETE_STRATEGY_TITLE))

console.log('test-quick-revision: ok')
