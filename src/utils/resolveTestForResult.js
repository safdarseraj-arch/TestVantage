/**
 * Rebuild question stubs from scored per-question rows (for review when paper session is gone).
 * @param {object[]} perQuestion
 */
export function questionsFromPerQuestion(perQuestion = []) {
  return perQuestion.map((pq) => ({
    id: pq.questionId,
    subject: pq.subject,
    questionType: pq.questionType,
    chapter: pq.chapter,
    topic: pq.topic,
    text: pq.text,
    options: pq.options,
    questionImage: pq.questionImage,
    optionsImage: pq.optionsImage,
    optionImages: pq.optionImages,
    solution: pq.solution,
    solutionImage: pq.solutionImage,
    videoSolution: pq.videoSolution,
  }))
}

/**
 * Build a test object from a stored attempt when the live paper session is gone.
 * @param {string} testId
 * @param {object | null | undefined} attempt
 * @param {object | null | undefined} resultData
 */
export function buildTestFromAttempt(testId, attempt, resultData) {
  if (attempt?.testSnapshot?.id) return attempt.testSnapshot

  const perQ =
    resultData?.result?.perQuestion ??
    attempt?.resultSnapshot?.result?.perQuestion ??
    []

  if (!testId && perQ.length === 0) return null

  const title =
    resultData?.title ??
    attempt?.title ??
    attempt?.resultSnapshot?.title ??
    'Past test'

  const examPatternId =
    resultData?.examPatternId ?? attempt?.examPatternId ?? 'jee-main'

  const testTypeId = resultData?.testTypeId ?? attempt?.testTypeId ?? 'full'

  return {
    id: testId,
    title,
    examPatternId,
    testTypeId,
    durationMinutes:
      attempt?.durationSeconds != null
        ? Math.max(1, Math.ceil(attempt.durationSeconds / 60))
        : 60,
    questions: questionsFromPerQuestion(perQ),
    status: 'published',
  }
}

/**
 * Resolve test metadata for the Result page — live session, saved snapshot, or attempt rebuild.
 * @param {string} testId
 * @param {object | null | undefined} attempt
 * @param {object | null | undefined} resultData
 * @param {import('../data/tests').Test | null | undefined} [liveTest]
 */
export function resolveTestForResult(testId, attempt, resultData, liveTest) {
  if (liveTest) return liveTest
  return buildTestFromAttempt(testId, attempt, resultData)
}

/**
 * Compact test payload stored on each attempt for My Results → Analysis after reload.
 * @param {import('../data/tests').Test} test
 */
export function buildTestSnapshot(test) {
  if (!test?.id) return null
  return {
    id: test.id,
    title: test.title,
    examPatternId: test.examPatternId,
    testTypeId: test.testTypeId,
    durationMinutes: test.durationMinutes,
    paperBlueprint: test.paperBlueprint,
    paperPatternId: test.paperPatternId,
    syllabusFilter: test.syllabusFilter,
    questions: test.questions ?? [],
  }
}
