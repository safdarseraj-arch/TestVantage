import { applyUploadQualityGuards } from './uploadQualityGuards.js'

/** @param {unknown} raw */
function parseExamIdsFromImport(raw) {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean)
  if (typeof raw === 'string' && raw.trim()) {
    return raw
      .split(/[|,]/)
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return undefined
}

/**
 * Normalize JSON item to question shape
 * @param {Record<string, unknown>} item
 * @param {number} index
 */
export function normalizeJsonQuestion(item, index) {
  const options = Array.isArray(item.options)
    ? item.options.map(String)
    : item.optionA
      ? [item.optionA, item.optionB, item.optionC, item.optionD].filter(Boolean).map(String)
      : ['', '', '', '']

  let correctIndices = item.correctIndices
  if (typeof correctIndices === 'string') {
    correctIndices = correctIndices.split(/[|,]/).map((s) => {
      const t = String(s).trim().toUpperCase()
      if (t >= 'A' && t <= 'F') return t.charCodeAt(0) - 65
      return parseInt(t, 10)
    })
  }
  if (!Array.isArray(correctIndices)) correctIndices = undefined

  const questionType = String(item.questionType ?? item.type ?? 'single_correct')

  return {
    id: String(item.id ?? `json-${Date.now()}-${index}`),
    subject: String(item.subject ?? 'physics'),
    questionType,
    text: String(item.text ?? item.question ?? ''),
    options: options.filter((o) => o !== undefined),
    correctIndex:
      item.correctIndex != null
        ? Number(item.correctIndex)
        : item.answer != null
          ? String(item.answer).toUpperCase().charCodeAt(0) - 65
          : 0,
    correctIndices,
    correctInteger: item.correctInteger != null ? Number(item.correctInteger) : undefined,
    correctNumerical:
      item.correctNumerical != null ? Number(item.correctNumerical) : undefined,
    numericalTolerance:
      item.numericalTolerance != null ? Number(item.numericalTolerance) : undefined,
    section: item.section ? String(item.section) : undefined,
    chapter: item.chapter ? String(item.chapter) : undefined,
    topic: item.topic ? String(item.topic) : undefined,
    examIds: parseExamIdsFromImport(item.examIds ?? item.exams ?? item.exam),
    toughnessLevel:
      item.toughnessLevel != null && item.toughnessLevel !== ''
        ? Math.min(10, Math.max(1, Number(item.toughnessLevel)))
        : undefined,
    passageText: item.passageText ? String(item.passageText) : undefined,
    msqMarking: item.msqMarking ?? undefined,
    matrixRows: item.matrixRows,
    matrixCols: item.matrixCols,
    matrixAnswerKey: item.matrixAnswerKey,
    solution: item.solution ? String(item.solution) : item.explanation ? String(item.explanation) : undefined,
    solutionImage: item.solutionImage ? String(item.solutionImage) : undefined,
    contentMode: item.contentMode === 'hybrid' ? 'hybrid' : undefined,
    questionImage: item.questionImage ? String(item.questionImage) : undefined,
    optionsImage: item.optionsImage ? String(item.optionsImage) : undefined,
    optionImages: Array.isArray(item.optionImages)
      ? item.optionImages.map(String)
      : undefined,
    videoSolution: item.videoSolution ? String(item.videoSolution) : item.videoUrl ? String(item.videoUrl) : undefined }
}

/**
 * @param {string} jsonStr
 */
export function parseQuestionsFromJson(jsonStr) {
  const data = JSON.parse(jsonStr)
  const arr = Array.isArray(data) ? data : data.questions
  if (!Array.isArray(arr)) {
    throw new Error('JSON must be an array or { "questions": [...] }')
  }
  return applyUploadQualityGuards(
    arr.map((item, i) => normalizeJsonQuestion(item, i)).filter((q) => q.text.trim() || q.questionImage),
    '',
  )
}

export const JSON_TEMPLATE = JSON.stringify(
  {
    questions: [
      {
        subject: 'mathematics',
        section: 'Algebra',
        chapter: 'Binomial Theorem',
        topic: 'Greatest term',
        toughnessLevel: 5,
        examIds: ['jee-main', 'jee-advanced'],
        questionType: 'single_correct',
        text: 'In the expansion of (1 + x)^n, the greatest term occurs when the ratio of consecutive terms is ≥ 1. For n = 10 and x = 2, which term is greatest?',
        options: ['5th term', '6th term', '7th term', '8th term'],
        correctIndex: 2,
        solution: 'Use (n+1)|x|/(|x|+1) to locate the greatest term index.' },
      {
        subject: 'chemistry',
        questionType: 'multiple_correct',
        text: 'Which are polar?',
        options: ['H2O', 'CO2', 'NH3', 'CH4'],
        correctIndices: [0, 2],
        msqMarking: {
          full: 4,
          partial1: 1,
          partial2: 2,
          partial3: 3,
          wrongAny: -2,
          unattempted: 0 } },
    ] },
  null,
  2,
)
