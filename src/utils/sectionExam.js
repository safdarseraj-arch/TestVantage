/** @param {import('../data/tests').Question[]} questions @param {string[]} subjectOrder */
export function groupQuestionsBySubject(questions, subjectOrder) {
  const groups = {}
  for (const id of subjectOrder) groups[id] = []
  for (const q of questions) {
    if (!groups[q.subject]) groups[q.subject] = []
    groups[q.subject].push(q)
  }
  return subjectOrder
    .filter((id) => groups[id]?.length)
    .map((id) => ({ subjectId: id, questions: groups[id] }))
}

/** @param {string} testTypeId @param {string} examPatternId */
export function shouldUseSectionMode(testTypeId, examPatternId) {
  if (testTypeId === 'calibrated') return true
  return testTypeId === 'full' && (examPatternId === 'jee-main' || examPatternId === 'neet')
}
