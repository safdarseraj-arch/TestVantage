/**
 * Lightweight practice syllabus filters — no AI pick or PYQ catalog imports.
 */

import { filterQuestionsBySyllabus } from './syllabusMeta.js'
import { getSubjectsForPattern } from '../data/subjects.js'

/** @typedef {import('./syllabusMeta.js').SyllabusSelection} PracticeSyllabus */

/** @param {import('../data/tests').Question} q */
function practiceSubjectId(q) {
  return String(q?.subject ?? '').trim().toLowerCase()
}

/** @param {import('../data/tests').Question[]} questions @param {string} [examPatternId] */
export function collectPracticeSubjects(questions, examPatternId) {
  if (examPatternId) {
    return getSubjectsForPattern(examPatternId).map((s) => s.id)
  }
  const set = new Set()
  for (const q of questions) {
    const sub = String(q.subject ?? '').trim()
    if (sub) set.add(sub)
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

/**
 * Teacher paper pool — questions tagged for this exam, or legacy rows with no exam tag.
 * @param {import('../data/tests').Question[]} questions
 * @param {string} examPatternId
 */
export function filterQuestionsForTeacherExam(questions, examPatternId) {
  if (!examPatternId) return questions
  return questions.filter((q) => {
    if (!q.examIds?.length) return true
    return q.examIds.includes(examPatternId)
  })
}

/**
 * Only questions explicitly tagged for this exam (examIds must include examPatternId).
 * @param {import('../data/tests').Question[]} questions
 * @param {string} examPatternId
 */
export function filterQuestionsByExam(questions, examPatternId) {
  if (!examPatternId) return questions
  return questions.filter((q) => q.examIds?.length && q.examIds.includes(examPatternId))
}

/**
 * Bank rows used to build chapter/topic pickers — all subjects for this exam.
 * @param {import('../data/tests').Question[]} questions
 * @param {string} examPatternId
 */
export function filterQuestionsForPracticeSyllabusTree(questions, examPatternId) {
  if (!examPatternId) return questions
  const allowed = new Set(getSubjectsForPattern(examPatternId).map((s) => s.id))
  return questions.filter((q) => allowed.has(practiceSubjectId(q)))
}

/**
 * Syllabus filter only (bank questions — PYQ merged separately in practicePickPool).
 * @param {import('../data/tests').Question[]} questions
 * @param {PracticeSyllabus} syllabus
 * @param {string} [examPatternId]
 */
export function filterQuestionsByPracticeSyllabus(questions, syllabus, examPatternId) {
  if (!syllabus?.subjects?.length) return []
  const byExam = examPatternId ? filterQuestionsByExam(questions, examPatternId) : questions
  return filterQuestionsBySyllabus(byExam, {
    subjects: syllabus.subjects,
    sections: syllabus.sections ?? [],
    chapters: syllabus.chapters ?? [],
    topics: syllabus.topics ?? [],
  })
}
