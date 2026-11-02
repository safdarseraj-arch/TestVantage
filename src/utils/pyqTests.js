import { getPyqExamLabel, getPyqQuestionsFiltered } from '../data/pyqCatalog.js'
import { isOfficialPyq, isSimilarToPyq } from './pyqDetect.js'
import { assembleChapterPyqByPattern } from './pyqChapterAssembly.js'
import { resolvePyqYearPaper } from './pyqYearPaperPick.js'
import { computeTestDuration } from './testConfig.js'
import { loadDynamicTestMap, saveDynamicTestMap } from './dynamicTestStorage.js'
import { enforce_parent_child_exclusion } from './parentChildExclusion.js'
import { SUB_BANK_TYPE_PYQ, SUB_BANK_TYPE_SIMILAR_PYQ } from './subBankType.js'
import { filterMasterPoolBySubBank, getMasterQuestionPool } from './masterPool.js'

const SESSION_KEY = 'testvantage-pyq-tests'

function loadMap() {
  return loadDynamicTestMap(SESSION_KEY)
}

function saveMap(map) {
  saveDynamicTestMap(SESSION_KEY, map)
}

/**
 * Published official paper for one year + paper id, in paper order.
 * Sample and other-bank questions are left out.
 * @param {import('../data/tests').Question[]} pool
 * @param {{ examPatternId?: string, year?: number | string, paperId?: string }} filters
 */
export function officialYearPaperQuestions(pool, filters = {}, opts = {}) {
  const similar = opts.similar === true
  const rows = (pool ?? []).filter((q) => {
    if (similar) {
      if (!isSimilarToPyq(q)) return false
    } else if (!isOfficialPyq(q)) return false
    if (filters.examPatternId && String(q.examPatternId ?? '') !== String(filters.examPatternId)) {
      return false
    }
    if (filters.year != null && filters.year !== '' && Number(q.pyqYear) !== Number(filters.year)) {
      return false
    }
    if (filters.paperId && String(q.paperId ?? '') !== String(filters.paperId)) return false
    return true
  })
  const seen = new Set()
  return rows
    .slice()
    .sort((a, b) => (Number(a.pyqSlot) || 0) - (Number(b.pyqSlot) || 0))
    .filter((q) => {
      const slot = Number(q.pyqSlot)
      const key = slot > 0 ? `s${slot}` : `id:${q.id}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

/** @param {import('../data/tests').Test} test */
export function registerPyqTest(test) {
  const map = loadMap()
  map[test.id] = test
  saveMap(map)
  return test
}

/** @param {string} id */
export function getPyqTestById(id) {
  if (!id?.startsWith('pyq-')) return null
  return loadMap()[id] ?? null
}

/**
 * @param {'year' | 'chapter' | 'paper'} mode
 * @param {object} params
 */
export function buildAndRegisterPyqTest(mode, params) {
  const {
    examPatternId,
    paperPatternId,
    year,
    chapter,
    subject,
    paperId,
    paperLabel,
    subBankType = SUB_BANK_TYPE_PYQ,
    pool: paramPool,
  } = params

  const subBankPool =
    paramPool ?? filterMasterPoolBySubBank(getMasterQuestionPool(), subBankType)

  let resolvedPaperId = paperId
  let resolvedPaperLabel = paperLabel
  let yearPaperAiPicked = false

  if (mode === 'year' && year) {
    const resolved = resolvePyqYearPaper(examPatternId, year, { paperId, pool: subBankPool })
    if (!resolved.ok) return { ok: false, error: resolved.error }
    resolvedPaperId = resolved.paper.paperId
    resolvedPaperLabel = resolved.paper.paperLabel
    yearPaperAiPicked = resolved.aiPicked
  }

  let questions
  const similarYear = subBankType === SUB_BANK_TYPE_SIMILAR_PYQ
  if (mode === 'year') {
    const catalog = similarYear
      ? subBankPool
      : getPyqQuestionsFiltered({
          examPatternId,
          year,
          paperId: resolvedPaperId,
          provenance: 'official',
        })
    questions = officialYearPaperQuestions(
      catalog,
      {
        examPatternId,
        year,
        paperId: resolvedPaperId,
      },
      { similar: similarYear },
    )
  } else {
    questions = getPyqQuestionsFiltered(
      {
        examPatternId,
        year,
        chapter,
        subject,
        paperId,
        subBankType,
      },
      subBankPool,
    )
    questions = enforce_parent_child_exclusion(questions)
  }

  if (questions.length === 0) {
    return { ok: false, error: 'No PYQ questions found for this selection.' }
  }

  let chapterSample = null
  if (mode === 'chapter' || (paperPatternId && mode === 'paper')) {
    chapterSample = assembleChapterPyqByPattern(questions, examPatternId, paperPatternId || undefined)
    questions = chapterSample.questions
  }

  let title = 'PYQ Test'
  let testTypeId = 'part'
  let description = ''
  let id = `pyq-${mode}-${examPatternId}`

  const examLabel = getPyqExamLabel(examPatternId)

  if (mode === 'year') {
    id += `-${year}-${resolvedPaperId}`
    const paperNote = resolvedPaperLabel ?? resolvedPaperId
    title = yearPaperAiPicked
      ? `PYQ ${year} — ${examLabel} (${paperNote}, AI picked)`
      : `PYQ ${year} — ${examLabel} (${paperNote})`
    description = yearPaperAiPicked
      ? `One official ${examLabel} paper from ${year} — AI selected ${paperNote}.`
      : `One official ${examLabel} paper from ${year}: ${paperNote}.`
    testTypeId = 'full'
  } else if (mode === 'chapter') {
    const slug = `${subject}-${chapter}`.replace(/\s+/g, '-').slice(0, 40)
    id += `-${slug}`
    title = `PYQ Chapter — ${chapter}`
    const patternNote = chapterSample?.pattern?.note ?? ''
    const mix = chapterSample?.slotReport
      ?.map((s) => `${s.picked}/${s.requested} ${s.typeId}`)
      .join(', ')
    if (chapterSample?.capped) {
      description = `Chapter PYQ (${subject}): pattern mix (${mix}) from ${chapterSample.totalAvailable} bank Q. ${patternNote}`
    } else {
      description = `Chapter PYQ (${subject}): ${questions.length} Q as per exam pattern. ${patternNote}`
    }
    testTypeId = 'chapter'
  } else if (mode === 'paper') {
    id += `-${paperId}`
    title = `JEE Mains PYQ — ${paperLabel ?? paperId}`
    description = `Paper-wise PYQ mock (one NTA date & shift).`
    testTypeId = 'full'
  }

  const test = {
    id,
    title,
    description,
    examPatternId,
    paperPatternId: mode === 'year' ? undefined : paperPatternId || undefined,
    pyqOfficialPaper: mode === 'year',
    testTypeId,
    totalQuestions: questions.length,
    durationMinutes:
      mode === 'chapter' && chapterSample?.pattern?.durationMinutes
        ? chapterSample.pattern.durationMinutes
        : computeTestDuration(examPatternId, testTypeId, questions.length, paperPatternId),
    chapter: mode === 'chapter' ? chapter : undefined,
    questions: questions.map((q, i) => ({
      ...q,
      id: `${id}-q${i}`,
    })),
    pyqMode: mode,
    pyqPaperId: resolvedPaperId || paperId,
    pyqPaperLabel: resolvedPaperLabel || paperLabel,
    pyqYearPaperAiPicked: yearPaperAiPicked,
    pyqChapterCapped: chapterSample?.capped ?? false,
    pyqChapterTotalAvailable: chapterSample?.totalAvailable,
    pyqChapterLimit: chapterSample?.limit,
    pyqChapterPattern: chapterSample?.pattern,
    pyqChapterSlotReport: chapterSample?.slotReport,
  }

  registerPyqTest(test)
  return { ok: true, test }
}
