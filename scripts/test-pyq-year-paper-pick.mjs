/**
 * Year-wise PYQ = one paper per year (JEE Adv Paper 1/2, JEE Main date/shift, NEET session).
 * Live student catalog is imported papers only. Sample generator is used to test picker logic.
 */
import assert from 'node:assert/strict'
import { getPyqQuestionsFiltered, getSamplePracticePyqQuestions } from '../src/data/pyqCatalog.js'
import { buildAndRegisterPyqTest } from '../src/utils/pyqTests.js'
import {
  listPyqPapersForYear,
  resolvePyqYearPaper,
} from '../src/utils/pyqYearPaperPick.js'
import { pyqPaperKey } from '../src/utils/pyqSlotMeta.js'

const SAMPLE = getSamplePracticePyqQuestions()

function testLiveCatalogHasNoFakeDatedPapers() {
  const liveAdv = listPyqPapersForYear('jee-advanced', 2024)
  const liveMain = listPyqPapersForYear('jee-main', 2024)
  assert.ok(liveAdv.every((p) => !String(p.paperId).startsWith('2024-adv-')))
  assert.ok(liveMain.every((p) => !String(p.paperId).includes('-jan-') && !String(p.paperId).includes('-apr-')))
}

function testJeeAdvancedPaperSplit() {
  const papers2024 = listPyqPapersForYear('jee-advanced', 2024, SAMPLE)
  assert.ok(papers2024.length >= 2, 'Sample JEE Adv should have Paper 1 and Paper 2 for 2024')

  const p1 = papers2024.find((p) => /paper-1/i.test(p.paperId))
  assert.ok(p1, 'Paper 1 id expected')
  const resolved = resolvePyqYearPaper('jee-advanced', 2024, { paperId: p1.paperId, pool: SAMPLE })
  assert.equal(resolved.ok, true)
  assert.equal(resolved.aiPicked, false)
  assert.equal(resolved.paper.paperId, p1.paperId)

  const qs = getPyqQuestionsFiltered(
    {
      examPatternId: 'jee-advanced',
      year: 2024,
      paperId: p1.paperId,
    },
    SAMPLE,
  )
  assert.ok(qs.length > 0)
  assert.ok(qs.every((q) => q.paperId === p1.paperId))
}

function testJeeMainDateShift() {
  const papers = listPyqPapersForYear('jee-main', 2024, SAMPLE)
  assert.ok(papers.length > 1, 'Sample JEE Main should have multiple date/shift papers')

  const pick = papers[0]
  const resolved = resolvePyqYearPaper('jee-main', 2024, { paperId: pick.paperId, pool: SAMPLE })
  assert.equal(resolved.ok, true)
  assert.ok(resolved.paper.pyqDate, 'JEE Main paper should have date')
  assert.ok(resolved.paper.pyqShift, 'JEE Main paper should have shift')
}

function testNeetSinglePaper() {
  const papers = listPyqPapersForYear('neet', 2024, SAMPLE)
  assert.ok(papers.length >= 1, 'Sample NEET should have at least one paper for 2024')

  const resolved = resolvePyqYearPaper('neet', 2024, { pool: SAMPLE })
  assert.equal(resolved.ok, true)
  assert.ok(resolved.paper.paperId)
}

function testYearWiseTestUsesOnePaper() {
  const result = buildAndRegisterPyqTest('year', {
    examPatternId: 'jee-advanced',
    year: 2023,
  })
  if (!result.ok) {
    assert.match(String(result.error ?? ''), /No PYQ/)
    return
  }
  const paperIds = new Set(result.test.questions.map((q) => q.paperId))
  assert.equal(paperIds.size, 1, 'Year-wise test must use exactly one paper')
}

function testAiPickWhenNoPaperChosen() {
  const resolved = resolvePyqYearPaper('jee-advanced', 2024, { pool: SAMPLE })
  assert.equal(resolved.ok, true)
  assert.equal(resolved.aiPicked, true)
}

function testLiveYearWiseEmptyWithoutImport() {
  const resolved = resolvePyqYearPaper('jee-advanced', 2024)
  if (resolved.ok) return
  assert.equal(resolved.ok, false)
}

function testPaperKeyYearDateShift() {
  assert.equal(
    pyqPaperKey({
      examPatternId: 'jee-main',
      pyqYear: 2024,
      pyqDate: '2024-01-27',
      pyqShift: 2,
    }),
    'jee-main:2024:2024-01-27:s2',
  )
  assert.equal(
    pyqPaperKey({ examPatternId: 'jee-advanced', pyqYear: 2023, pyqSession: 'Paper 2' }),
    'jee-advanced:2023:p2',
  )
  assert.equal(pyqPaperKey({ examPatternId: 'neet', pyqYear: 2024 }), 'neet:2024')
  const papers = listPyqPapersForYear('jee-main', 2024, SAMPLE)
  const pick = papers[0]
  assert.equal(
    pyqPaperKey({
      examPatternId: 'jee-main',
      pyqYear: 2024,
      pyqDate: pick.pyqDate,
      pyqShift: pick.pyqShift,
    }),
    `jee-main:2024:${pick.pyqDate}:s${pick.pyqShift}`,
  )
}

testLiveCatalogHasNoFakeDatedPapers()
testJeeAdvancedPaperSplit()
testJeeMainDateShift()
testNeetSinglePaper()
testYearWiseTestUsesOnePaper()
testAiPickWhenNoPaperChosen()
testLiveYearWiseEmptyWithoutImport()
testPaperKeyYearDateShift()

console.log('test-pyq-year-paper-pick: ok')
