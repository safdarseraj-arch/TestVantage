import { normalizeSource } from './questionMetadata.js'
import {
  loadUploadedQuestions,
  updateUploadedQuestion,
} from './questionBank.js'
import { teacherUploadLinks } from './questionBankUploadRoutes.js'

/** Canonical Source tag for lecture / classroom questions. */
export const LECTURE_SOURCE = 'Lecture'

/** @param {import('../data/tests').Question | null | undefined} q */
export function isLectureQuestion(q) {
  if (!q) return false
  const source = normalizeSource(q.source)
  if (source && source.toLowerCase() === LECTURE_SOURCE.toLowerCase()) return true
  const tags = Array.isArray(q.examIds) ? q.examIds : []
  return tags.some((t) => String(t).trim().toLowerCase() === LECTURE_SOURCE.toLowerCase())
}

/** @returns {import('../data/tests').Question[]} */
export function listLectureQuestions() {
  return loadUploadedQuestions().filter(isLectureQuestion)
}

/**
 * Tag an existing bank question as Lecture (keeps other fields).
 * @param {string} id
 */
export function markQuestionAsLecture(id) {
  return updateUploadedQuestion(id, { source: LECTURE_SOURCE })
}

/** Upload deep-links — same Question Bank upload hub, Source = Lecture. */
const lectureUploads = teacherUploadLinks({
  source: LECTURE_SOURCE,
  from: 'lecture',
})

export const LECTURE_UPLOAD_LINKS = {
  image: lectureUploads.image,
  bulk: lectureUploads.bulk,
  pdf: lectureUploads.pdf,
  csv: lectureUploads.csv,
  root: lectureUploads.root,
  bankView: `/question-bank?hub=view&view=draft&source=${encodeURIComponent(LECTURE_SOURCE)}&owner=teacher`,
}
