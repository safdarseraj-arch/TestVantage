import { loadPublishedUploadedQuestions } from './questionBank.js'
import { getAnswerableQuestions } from './passage.js'
import { validateQuestionReadiness } from './questionReadiness.js'
import {
  prepareQuestionsForTest,
  resolveBankQuestionForTestRow,
} from './testQuestionClone.js'
import { filterQuestionsByExam, filterQuestionsByPracticeSyllabus } from './practiceTest.js'
import { filterQuestionsBySyllabus } from './syllabusMeta.js'

/** @param {import('../data/tests').Question} q */
export function questionIsExamReady(q) {
  return validateQuestionReadiness(q).ok
}

/**
 * @param {import('../data/tests').Question} q
 * @param {import('../data/tests').Question[]} [bank]
 */
export function resolveQuestionBankId(q, bank = loadPublishedUploadedQuestions()) {
  const bankById = new Map(bank.map((row) => [row.id, row]))
  return resolveBankQuestionForTestRow(q, bankById, new Map(), bank)?.id ?? q.id
}

/** @param {import('../data/tests').Test} test @param {import('../data/tests').Question[]} bank */
export function buildSubstitutePoolForTest(test, bank) {
  let pool = bank
  if (test?.examPatternId) {
    pool = filterQuestionsByExam(pool, test.examPatternId)
  }
  if (test?.practiceMeta?.syllabus?.subjects?.length) {
    pool = filterQuestionsByPracticeSyllabus(
      pool,
      test.practiceMeta.syllabus,
      test.examPatternId,
    )
  } else if (test?.syllabusFilter?.subjects?.length) {
    pool = filterQuestionsBySyllabus(pool, test.syllabusFilter)
  }
  return getAnswerableQuestions(pool).filter((q) => questionIsExamReady(q))
}

/**
 * Replace broken paper rows with ready questions from the syllabus pool (students only).
 * @param {import('../data/tests').Question[]} questions
 * @param {import('../data/tests').Test} test
 * @param {import('../data/tests').Question[]} [bank]
 */
export function healExamQuestionsForStudent(questions, test, bank = loadPublishedUploadedQuestions()) {
  const answerable = getAnswerableQuestions(questions ?? [])
  if (test?.pyqOfficialPaper === true || test?.pyqMode === 'year') {
    return { questions: answerable, swapped: [], ok: true }
  }
  const pool = buildSubstitutePoolForTest(test, bank)
  const usedBankIds = new Set()
  /** @type {import('../data/tests').Question[]} */
  const healed = []
  /** @type {{ from: import('../data/tests').Question, to: import('../data/tests').Question | null, issues: import('./questionReadiness.js').ReadinessIssue[] }[]} */
  const swapped = []

  for (const q of answerable) {
    const { ok, issues } = validateQuestionReadiness(q)
    if (ok) {
      healed.push(q)
      usedBankIds.add(resolveQuestionBankId(q, bank))
      continue
    }

    const typeId = q.questionType ?? 'single_correct'
    const replacement =
      pool.find(
        (candidate) =>
          !usedBankIds.has(candidate.id) &&
          candidate.subject === q.subject &&
          (candidate.questionType ?? 'single_correct') === typeId,
      ) ??
      pool.find(
        (candidate) =>
          !usedBankIds.has(candidate.id) && candidate.subject === q.subject,
      ) ??
      pool.find((candidate) => !usedBankIds.has(candidate.id))

    if (replacement) {
      const prepared = prepareQuestionsForTest(
        bank,
        [replacement],
        `heal-${Date.now()}-${healed.length}`,
      )
      const row = prepared[0]
      if (row && questionIsExamReady(row)) {
        healed.push(row)
        usedBankIds.add(replacement.id)
        swapped.push({ from: q, to: row, issues: issues.filter((i) => i.severity === 'error') })
        continue
      }
    }

    swapped.push({ from: q, to: null, issues: issues.filter((i) => i.severity === 'error') })
  }

  const ok =
    healed.length > 0 &&
    healed.every((q) => questionIsExamReady(q)) &&
    swapped.every((s) => s.to != null)

  return { questions: healed, swapped, ok }
}

/** @param {string} bankId */
export function questionBankEditUrl(bankId) {
  const id = String(bankId ?? '').trim()
  if (!id) return '/question-bank?hub=upload'
  return `/question-bank?hub=upload&edit=${encodeURIComponent(id)}`
}
