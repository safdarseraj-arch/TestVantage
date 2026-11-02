import { EXAM_PATTERNS } from '../data/examPatterns.js'
import { ALL_SUBJECTS } from '../data/subjects.js'

const CUSTOM_SUBJECTS_KEY = 'testvantage-custom-subjects'
const CUSTOM_EXAMS_KEY = 'testvantage-custom-exams'

/** @returns {{ id: string, label: string, color?: string }[]} */
export function loadCustomSubjects() {
  try {
    const raw = localStorage.getItem(CUSTOM_SUBJECTS_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list.filter((s) => s?.id && s?.label) : []
  } catch {
    return []
  }
}

/** @param {{ id: string, label: string, color?: string }[]} list */
export function saveCustomSubjects(list) {
  localStorage.setItem(CUSTOM_SUBJECTS_KEY, JSON.stringify(list))
}

/** @param {string} label */
export function slugSubjectId(label) {
  return String(label ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * @param {string} label
 * @returns {{ ok: boolean, error?: string, subject?: { id: string, label: string, color: string } }}
 */
export function registerCustomSubject(label) {
  const trimmed = String(label ?? '').trim()
  if (!trimmed) return { ok: false, error: 'Subject name cannot be empty.' }
  const id = slugSubjectId(trimmed)
  if (!id) return { ok: false, error: 'Use letters or numbers in the subject name.' }

  const builtIn = ALL_SUBJECTS.find((s) => s.id === id)
  const list = loadCustomSubjects()
  if (builtIn) {
    return {
      ok: false,
      error: `"${trimmed}" is already a subject (id: ${builtIn.id}). Use Modify subject below to rename its label.`,
    }
  }
  if (list.some((s) => s.id === id)) {
    return { ok: false, error: `"${trimmed}" already exists.` }
  }

  const subject = { id, label: trimmed, color: '#64748b' }
  saveCustomSubjects([...list, subject])
  return { ok: true, subject }
}

/**
 * @param {string} subjectId
 * @param {string} newLabel
 * @returns {{ ok: boolean, error?: string }}
 */
export function renameCustomSubjectLabel(subjectId, newLabel) {
  const id = String(subjectId ?? '').trim()
  const label = String(newLabel ?? '').trim()
  if (!id || !label) return { ok: false, error: 'Name cannot be empty.' }

  const builtIn = ALL_SUBJECTS.find((s) => s.id === id)
  if (builtIn) {
    if (builtIn.label === label) return { ok: false, error: 'New name is the same.' }
    const list = loadCustomSubjects()
    const entry = list.find((s) => s.id === id) ?? { id, label, color: builtIn.color }
    const next = list.filter((s) => s.id !== id)
    next.push({ ...entry, label })
    saveCustomSubjects(next)
    return { ok: true }
  }

  const list = loadCustomSubjects()
  const idx = list.findIndex((s) => s.id === id)
  if (idx < 0) return { ok: false, error: 'Custom subject not found.' }
  if (list[idx].label === label) return { ok: false, error: 'New name is the same.' }
  list[idx] = { ...list[idx], label }
  saveCustomSubjects(list)
  return { ok: true }
}

/** @returns {import('../data/examPatterns').ExamPattern[]} */
export function loadCustomExams() {
  try {
    const raw = localStorage.getItem(CUSTOM_EXAMS_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list.filter((e) => e?.id && e?.name) : []
  } catch {
    return []
  }
}

/** @param {import('../data/examPatterns').ExamPattern[]} list */
export function saveCustomExams(list) {
  localStorage.setItem(CUSTOM_EXAMS_KEY, JSON.stringify(list))
}

/** @param {string} name @param {string[]} subjectIds */
export function registerCustomExam(name, subjectIds = ['physics', 'chemistry', 'mathematics']) {
  const trimmed = String(name ?? '').trim()
  if (!trimmed) return { ok: false, error: 'Exam name cannot be empty.' }
  const id = `custom-${slugSubjectId(trimmed)}`
  const all = getAllExamPatterns()
  if (all.some((p) => p.id === id)) return { ok: false, error: `"${trimmed}" already exists.` }

  const exam = {
    id,
    name: trimmed,
    shortName: trimmed.length > 12 ? `${trimmed.slice(0, 10)}…` : trimmed,
    description: 'Custom exam',
    subjects: subjectIds.length ? subjectIds : ['physics', 'chemistry', 'mathematics'],
    totalMinutes: 180,
    questionSlots: [],
    color: '#6366f1',
  }
  saveCustomExams([...loadCustomExams(), exam])
  return { ok: true, exam }
}

/** @returns {import('../data/examPatterns').ExamPattern[]} */
export function getAllExamPatterns() {
  return [...EXAM_PATTERNS, ...loadCustomExams()]
}

/** @param {string} examId */
export function findExamPattern(examId) {
  return getAllExamPatterns().find((p) => p.id === examId) ?? null
}

/**
 * @param {string} oldId
 * @param {string} newName
 * @returns {{ ok: boolean, error?: string }}
 */
export function renameCustomExam(oldId, newName) {
  const list = loadCustomExams()
  const idx = list.findIndex((e) => e.id === oldId)
  if (idx < 0) return { ok: false, error: 'Built-in exams cannot be renamed here.' }
  const name = String(newName ?? '').trim()
  if (!name) return { ok: false, error: 'Name cannot be empty.' }
  if (list[idx].name === name) return { ok: false, error: 'New name is the same.' }
  list[idx] = {
    ...list[idx],
    name,
    shortName: name.length > 12 ? `${name.slice(0, 10)}…` : name,
  }
  saveCustomExams(list)
  return { ok: true }
}
