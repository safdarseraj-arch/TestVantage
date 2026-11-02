import { EXAM_PATTERNS } from './examPatterns.js'

export const ALL_SUBJECTS = [
  { id: 'mathematics', label: 'Mathematics', color: '#dc2626' },
  { id: 'physics', label: 'Physics', color: '#2563eb' },
  { id: 'chemistry', label: 'Chemistry', color: '#16a34a' },
  { id: 'botany', label: 'Botany', color: '#15803d' },
  { id: 'zoology', label: 'Zoology', color: '#0d9488' },
]

/** Shown only when editing older bank entries */
export const LEGACY_SUBJECTS = [{ id: 'biology', label: 'Biology (legacy)', color: '#059669' }]

/** @param {string[]} subjectIds */
export function getSubjectsByIds(subjectIds) {
  return ALL_SUBJECTS.filter((s) => subjectIds.includes(s.id))
}

/** @param {string} examPatternId */
export function getSubjectsForPattern(examPatternId) {
  const pattern = EXAM_PATTERNS.find((p) => p.id === examPatternId)
  return pattern
    ? getSubjectsByIds(pattern.subjects)
    : getSubjectsByIds(['physics', 'chemistry', 'mathematics'])
}
