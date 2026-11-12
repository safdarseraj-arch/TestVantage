import { getSlotMarking } from '../data/examPatterns.js'
import { getTestPattern } from './patternResolver.js'
import { getQuestionType } from '../data/questionTypes.js'
import { getSubjectsForPattern } from '../data/subjects.js'
import { isAnswerAttempted } from './answers.js'
import { formatCorrectAnswer, formatUserAnswer } from './formatAnswer.js'
import { getAnswerableQuestions } from './passage.js'
import { matrixAnswersEqual } from './matrixMatch.js'
import { gridFieldsOf, isMatrixGridCard, scoreMatrixGridRows } from './matrixGridPyq.js'
import { DEFAULT_MSQ_MARKING, scoreMsqAnswer } from './msqMarking.js'
import { passageQuestionUsesNumerical } from './passageSubAnswer.js'
import { letterAlternativesOf, numericAnswerMatches } from './answerAlternatives.js'

/**
 * @param {import('../data/tests').Question} q
 * @param {import('../data/examPatterns').ExamPattern} pattern
 */
function getMarking(q, pattern) {
  if (q.msqMarking && (q.questionType === 'multiple_correct')) {
    return { correct: q.msqMarking.full, wrong: q.msqMarking.wrongAny, unattempted: q.msqMarking.unattempted }
  }
  if (q.marking) return q.marking
  return getSlotMarking(pattern, q.questionType ?? 'single_correct')
}

/**
 * @param {import('../data/tests').Question} q
 * @param {unknown} answer
 * @param {import('../data/examPatterns').ExamPattern} pattern
 * @returns {{ grade: 'correct' | 'partial' | 'wrong' | 'unattempted', marks: number }}
 */
function gradeQuestion(q, answer, pattern) {
  /** The paper printed "MARKS TO ALL": every candidate gets full marks, answered or not. */
  if (q.bonusMarksToAll === true) return { grade: 'correct', marks: getMaxMarks(q, pattern) }
  if (!isAnswerAttempted(answer, q)) {
    const m = getMarking(q, pattern)
    return { grade: 'unattempted', marks: m.unattempted ?? 0 }
  }

  const type = q.questionType ?? 'single_correct'

  switch (type) {
    case 'passage_integer': {
      const m = getMarking(q, pattern)
      if (passageQuestionUsesNumerical(q)) {
        const n = parseFloat(String(answer))
        if (Number.isNaN(n)) return { grade: 'wrong', marks: m.wrong }
        return numericAnswerMatches({ ...q, correctNumerical: q.correctNumerical ?? 0, numericalTolerance: q.numericalTolerance ?? 0.01 }, n)
          ? { grade: 'correct', marks: m.correct }
          : { grade: 'wrong', marks: m.wrong }
      }
      const n = parseFloat(String(answer))
      if (Number.isNaN(n)) return { grade: 'wrong', marks: m.wrong }
      return n === q.correctInteger || numericAnswerMatches({ numericalAlternatives: q.numericalAlternatives }, n, 0)
        ? { grade: 'correct', marks: m.correct }
        : { grade: 'wrong', marks: m.wrong }
    }

    case 'single_correct':
    case 'true_false':
    case 'passage':
    case 'passage_scq':
      return answer === q.correctIndex
        ? { grade: 'correct', marks: getMarking(q, pattern).correct }
        : { grade: 'wrong', marks: getMarking(q, pattern).wrong }

    case 'multiple_correct': {
      const scheme = q.msqMarking ?? DEFAULT_MSQ_MARKING
      const selected = Array.isArray(answer) ? answer : []
      const sets = [q.correctIndices ?? [], ...letterAlternativesOf(q)]
      const result = sets
        .map((set) => scoreMsqAnswer(selected, set, scheme))
        .reduce((best, r) => (r.marks > best.marks ? r : best))
      return { grade: result.grade, marks: result.marks }
    }

    case 'integer': {
      const n = parseInt(String(answer), 10)
      const m = getMarking(q, pattern)
      if (Number.isNaN(n)) return { grade: 'wrong', marks: m.wrong }
      return n === q.correctInteger || numericAnswerMatches({ numericalAlternatives: q.numericalAlternatives }, n, 0)
        ? { grade: 'correct', marks: m.correct }
        : { grade: 'wrong', marks: m.wrong }
    }

    case 'numerical': {
      const n = parseFloat(String(answer))
      const m = getMarking(q, pattern)
      if (Number.isNaN(n)) return { grade: 'wrong', marks: m.wrong }
      return numericAnswerMatches({ ...q, correctNumerical: q.correctNumerical ?? 0, numericalTolerance: q.numericalTolerance ?? 0.01 }, n)
        ? { grade: 'correct', marks: m.correct }
        : { grade: 'wrong', marks: m.wrong }
    }

    case 'matrix_match': {
      if (gridMarkedPerRow(q)) {
        const r = scoreMatrixGridRows(answer, q, q.matrixMarking)
        if (r.rowsRight === r.rows) return { grade: 'correct', marks: r.marks }
        return { grade: r.rowsRight > 0 ? 'partial' : 'wrong', marks: r.marks }
      }
      const m = getMarking(q, pattern)
      return matrixAnswersEqual(answer, q)
        ? { grade: 'correct', marks: m.correct }
        : { grade: 'wrong', marks: m.wrong }
    }

    default:
      return { grade: 'wrong', marks: getMarking(q, pattern).wrong }
  }
}

/** A grid card whose paper marks each Column I row on its own. */
function gridMarkedPerRow(q) {
  return isMatrixGridCard(q) && q.matrixMarking?.perRow === true && Number.isFinite(q.matrixMarking.correct)
}

function getMaxMarks(q, pattern) {
  if (q.questionType === 'multiple_correct' && q.msqMarking) {
    return q.msqMarking.full
  }
  if (gridMarkedPerRow(q)) {
    return (Array.isArray(q.matrixRows) ? q.matrixRows.length : 0) * q.matrixMarking.correct
  }
  return getMarking(q, pattern).correct
}

/**
 * @param {import('../data/tests').Test} test
 * @param {Record<string, unknown>} answers
 */
export function evaluateTest(test, answers, options = {}) {
  const pattern = getTestPattern(test)
  const subjects = getSubjectsForPattern(pattern.id)
  const questions = options.answerableOnly
    ? getAnswerableQuestions(test.questions)
    : test.questions
  const markedSet = new Set(options.marked ?? [])

  let correct = 0
  let partial = 0
  let wrong = 0
  let unattempted = 0
  let score = 0
  let maxScore = 0
  let markedCount = 0

  const bySubject = {}
  const byQuestionType = {}
  const byChapter = {}
  const perQuestion = []

  for (const s of subjects) {
    bySubject[s.id] = { correct: 0, wrong: 0, unattempted: 0, partial: 0, score: 0, maxScore: 0 }
  }

  for (const q of questions) {
    maxScore += getMaxMarks(q, pattern)

    const typeId = q.questionType ?? 'single_correct'
    if (!byQuestionType[typeId]) {
      byQuestionType[typeId] = {
        correct: 0,
        wrong: 0,
        unattempted: 0,
        partial: 0,
        score: 0,
        maxScore: 0,
      }
    }
    byQuestionType[typeId].maxScore += getMaxMarks(q, pattern)

    const sub = bySubject[q.subject] ?? {
      correct: 0,
      wrong: 0,
      unattempted: 0,
      partial: 0,
      score: 0,
    }
    if (!bySubject[q.subject]) bySubject[q.subject] = sub

    const { grade, marks } = gradeQuestion(q, answers[q.id], pattern)
    const qt = byQuestionType[typeId]
    const maxQ = getMaxMarks(q, pattern)

    sub.maxScore += maxQ
    if (markedSet.has(q.id)) markedCount++

    if (q.chapter) {
      if (!byChapter[q.chapter]) {
        byChapter[q.chapter] = { correct: 0, wrong: 0, unattempted: 0, partial: 0, score: 0, maxScore: 0, total: 0 }
      }
      byChapter[q.chapter].maxScore += maxQ
      byChapter[q.chapter].total++
    }

    const timeSpent = options.questionTimes?.[q.id]

    perQuestion.push({
      questionId: q.id,
      index: perQuestion.length + 1,
      subject: q.subject,
      questionType: typeId,
      chapter: q.chapter,
      topic: q.topic,
      text: q.text,
      questionImage: q.questionImage,
      optionsImage: q.optionsImage,
      optionImages: q.optionImages,
      solution: q.solution,
      solutionImage: q.solutionImage,
      videoSolution: q.videoSolution,
      timeSpentSeconds: timeSpent,
      grade,
      marks,
      maxMarks: maxQ,
      userAnswer: answers[q.id],
      userAnswerLabel: formatUserAnswer(q, answers[q.id]),
      correctAnswerLabel: formatCorrectAnswer(q),
      marked: markedSet.has(q.id),
      ...(isMatrixGridCard(q) ? gridFieldsOf(q) : {}),
    })

    score += marks
    sub.score += marks
    qt.score += marks

    if (q.chapter && byChapter[q.chapter]) {
      byChapter[q.chapter].score += marks
      if (grade === 'correct') byChapter[q.chapter].correct++
      else if (grade === 'partial') byChapter[q.chapter].partial++
      else if (grade === 'wrong') byChapter[q.chapter].wrong++
      else byChapter[q.chapter].unattempted++
    }

    if (grade === 'unattempted') {
      unattempted++
      sub.unattempted++
      qt.unattempted++
    } else if (grade === 'correct') {
      correct++
      sub.correct++
      qt.correct++
    } else if (grade === 'partial') {
      partial++
      sub.partial = (sub.partial ?? 0) + 1
      qt.partial = (qt.partial ?? 0) + 1
    } else {
      wrong++
      sub.wrong++
      qt.wrong++
    }
  }

  const attempted = correct + wrong + partial
  const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0

  return {
    correct,
    partial,
    wrong,
    unattempted,
    score,
    maxScore,
    accuracy,
    bySubject,
    byQuestionType,
    total: questions.length,
    markedCount,
    perQuestion,
    byChapter,
    examPatternId: pattern.id,
    examPatternName: pattern.name,
    markingLabel:
      pattern.questionSlots.length === 1
        ? getQuestionType(pattern.questionSlots[0].questionTypeId).markingLabel
        : 'Per question type',
    blueprint: pattern.questionSlots,
  }
}
