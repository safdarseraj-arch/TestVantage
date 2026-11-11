import { formatMatrixCorrectAnswer, formatMatrixUserAnswer } from './matrixMatch.js'
import { passageQuestionUsesNumerical } from './passageSubAnswer.js'
import { formatLetterChoice, formatNumericChoice, letterAlternativesOf, numericalAlternativesOf } from './answerAlternatives.js'

/** @param {import('../data/tests').Question} q @param {unknown} answer */
export function formatUserAnswer(q, answer) {
  const type = q.questionType ?? 'single_correct'
  if (answer === null || answer === undefined) return '—'

  switch (type) {
    case 'passage_integer':
    case 'integer':
    case 'numerical':
      return String(answer)

    case 'single_correct':
    case 'passage':
    case 'passage_scq':
      if (typeof answer === 'number' && q.options?.[answer] != null) {
        return `${String.fromCharCode(65 + answer)}) ${q.options[answer]}`
      }
      return String(answer)

    case 'true_false':
      if (typeof answer === 'number') {
        return q.options?.[answer] ?? (answer === 0 ? 'TRUE' : 'FALSE')
      }
      return String(answer)

    case 'multiple_correct': {
      const indices = Array.isArray(answer) ? answer : []
      if (indices.length === 0) return '—'
      return indices
        .map((i) => `${String.fromCharCode(65 + i)}) ${q.options?.[i] ?? i}`)
        .join('; ')
    }

    case 'matrix_match':
      return formatMatrixUserAnswer(answer, q)

    default:
      return String(answer)
  }
}

/** @param {import('../data/tests').Question} q */
export function formatCorrectAnswer(q) {
  const type = q.questionType ?? 'single_correct'
  if (q.bonusMarksToAll === true) return 'Bonus — full marks to all'
  const alternatives = numericalAlternativesOf(q)
  if (alternatives.length && (q.correctNumerical != null || q.correctInteger != null)) {
    const main = { value: Number(q.correctNumerical ?? q.correctInteger), tolerance: q.numericalTolerance }
    return [main, ...alternatives].map(formatNumericChoice).join(' or ')
  }

  switch (type) {
    case 'passage_integer':
      return passageQuestionUsesNumerical(q)
        ? String(q.correctNumerical ?? '—')
        : String(q.correctInteger ?? '—')
    case 'integer':
      return String(q.correctInteger ?? '—')

    case 'single_correct':
    case 'passage':
    case 'passage_scq':
      if (q.correctIndex != null && q.options?.[q.correctIndex] != null) {
        return `${String.fromCharCode(65 + q.correctIndex)}) ${q.options[q.correctIndex]}`
      }
      return String(q.correctIndex ?? '—')

    case 'true_false':
      if (q.correctIndex != null) {
        return q.options?.[q.correctIndex] ?? (q.correctIndex === 0 ? 'TRUE' : 'FALSE')
      }
      return '—'

    case 'multiple_correct': {
      const indices = q.correctIndices ?? []
      const main = indices
        .map((i) => `${String.fromCharCode(65 + i)}) ${q.options?.[i] ?? i}`)
        .join('; ')
      const alternatives = letterAlternativesOf(q)
      return alternatives.length ? [formatLetterChoice(indices), ...alternatives.map(formatLetterChoice)].join(' or ') : main
    }

    case 'numerical':
      return String(q.correctNumerical ?? '—')

    case 'matrix_match':
      return formatMatrixCorrectAnswer(q)

    default:
      return '—'
  }
}
