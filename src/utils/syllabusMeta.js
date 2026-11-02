import { hierarchyFields } from './bankListFilters.js'
import { resolveQuestionHierarchy } from './curriculumOptions.js'
import { ALL_SUBJECTS, LEGACY_SUBJECTS } from '../data/subjects.js'

/**
 * @typedef {{
 *   subjects: string[]
 *   sections: string[]
 *   chapters: string[]
 *   topics: string[]
 * }} SyllabusSelection
 */

/**
 * @param {import('../data/tests').Question[]} questions
 */
export function buildSyllabusTree(questions) {
  /** @type {Map<string, Map<string, Map<string, Set<string>>>>} */
  const tree = new Map()

  for (const q of questions) {
    const subject = String(q.subject ?? '').trim()
    if (!subject) continue
    const { section, chapter, topic } = hierarchyFields(q)
    if (!tree.has(subject)) tree.set(subject, new Map())
    const subj = tree.get(subject)
    const unitKey = section || '(no unit)'
    if (!subj.has(unitKey)) subj.set(unitKey, new Map())
    const unit = subj.get(unitKey)
    const chapKey = chapter || '(whole unit)'
    if (!unit.has(chapKey)) unit.set(chapKey, new Set())
    if (topic) unit.get(chapKey).add(topic)
  }

  return tree
}

/** @param {import('../data/tests').Question[]} questions @param {string} subject */
export function listUnitsForSubject(questions, subject) {
  const set = new Set()
  for (const q of questions) {
    if (q.subject !== subject) continue
    const { section, chapter } = hierarchyFields(q)
    const unit = section || chapter
    if (unit) set.add(unit)
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

/** @param {import('../data/tests').Question[]} questions @param {string} subject @param {string} [unit] */
export function listChaptersForUnit(questions, subject, unit) {
  const set = new Set()
  for (const q of questions) {
    if (q.subject !== subject) continue
    const h = hierarchyFields(q)
    const unitKey = h.section || h.chapter
    if (unit && unitKey !== unit) continue
    if (h.chapter && h.section) set.add(h.chapter)
    else if (!h.section && h.chapter) set.add('(whole unit)')
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

/** @param {import('../data/tests').Question[]} questions @param {string} subject @param {string} chapter */
export function listTopicsForChapter(questions, subject, chapter) {
  const set = new Set()
  for (const q of questions) {
    if (q.subject !== subject) continue
    const h = hierarchyFields(q)
    if (chapter !== '(whole unit)' && h.chapter !== chapter) continue
    if (h.topic) set.add(h.topic)
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

/** @param {SyllabusSelection} sel */
export function syllabusSelectionEmpty(sel) {
  return (
    !sel.subjects.length &&
    !sel.sections.length &&
    !sel.chapters.length &&
    !sel.topics.length
  )
}

/** @param {string | undefined} subject */
function normSubjectId(subject) {
  return String(subject ?? '').trim().toLowerCase()
}

/**
 * Syllabus rules for teacher Create Test wizard.
 * @param {string} testTypeId
 * @param {SyllabusSelection} syllabus
 * @returns {string} error message, or '' when valid
 */
export function validateSyllabusForTestType(testTypeId, syllabus) {
  if (testTypeId === 'part') {
    if (syllabus.subjects.length !== 1) {
      return 'Subject Proficiency: tick exactly one subject (e.g. Mathematics only). Otherwise questions from all subjects appear.'
    }
  }
  if (testTypeId === 'chapter') {
    if (!syllabus.subjects.length) {
      return 'Chapter Proficiency: pick a subject first.'
    }
    if (!syllabus.chapters.length) {
      return 'Chapter Proficiency: pick at least one chapter.'
    }
  }
  return ''
}

/** @param {string} subjectId */
export function syllabusSubjectLabel(subjectId) {
  const id = String(subjectId ?? '').trim()
  return (
    [...ALL_SUBJECTS, ...LEGACY_SUBJECTS].find((s) => s.id === id)?.label ??
    id.replace(/^\w/, (c) => c.toUpperCase())
  )
}

/**
 * Structured syllabus for create-test banners.
 * @param {SyllabusSelection} syllabus
 */
export function formatSyllabusDisplay(syllabus) {
  if (!syllabus || syllabusSelectionEmpty(syllabus)) {
    return {
      empty: true,
      rows: [],
      summary: 'Full question bank (no syllabus filter)',
    }
  }
  /** @type {{ key: string, label: string, values: string[] }[]} */
  const rows = []
  if (syllabus.subjects.length) {
    rows.push({
      key: 'subjects',
      label: syllabus.subjects.length === 1 ? 'Subject' : 'Subjects',
      values: syllabus.subjects.map(syllabusSubjectLabel),
    })
  }
  if (syllabus.sections.length) {
    rows.push({
      key: 'sections',
      label: syllabus.sections.length === 1 ? 'Unit' : 'Units',
      values: [...syllabus.sections],
    })
  }
  if (syllabus.chapters.length) {
    rows.push({
      key: 'chapters',
      label: syllabus.chapters.length === 1 ? 'Chapter' : 'Chapters',
      values: [...syllabus.chapters],
    })
  }
  if (syllabus.topics.length) {
    rows.push({
      key: 'topics',
      label: syllabus.topics.length === 1 ? 'Topic' : 'Topics',
      values: [...syllabus.topics],
    })
  }
  const summary = rows
    .map((row) => `${row.label}: ${row.values.join(', ')}`)
    .join(' · ')
  return { empty: false, rows, summary }
}

/**
 * @param {import('../data/tests').Question[]} questions
 * @param {SyllabusSelection} syllabus
 */
export function filterQuestionsBySyllabus(questions, syllabus) {
  if (!syllabus || syllabusSelectionEmpty(syllabus)) return questions

  const selectedSubjects = syllabus.subjects.map(normSubjectId).filter(Boolean)

  return questions.filter((q) => {
    const qSubject = normSubjectId(q.subject)
    if (selectedSubjects.length && !selectedSubjects.includes(qSubject)) return false
    const h = hierarchyFields(q)
    const unit = h.section || h.chapter || ''
    if (syllabus.sections.length && !syllabus.sections.includes(unit)) return false
    const chap = h.chapter || (h.section ? '' : h.chapter) || '(whole unit)'
    if (syllabus.chapters.length) {
      const match =
        syllabus.chapters.includes(chap) ||
        (syllabus.chapters.includes('(whole unit)') && !h.chapter && h.section)
      if (!match) return false
    }
    if (syllabus.topics.length && (!h.topic || !syllabus.topics.includes(h.topic))) return false
    return true
  })
}

/**
 * @param {import('../data/tests').Question[]} questions
 * @param {string[]} allowedSubjects
 */
export function collectSubjectsFromBank(questions, allowedSubjects) {
  const set = new Set()
  for (const q of questions) {
    if (allowedSubjects.includes(q.subject)) set.add(q.subject)
  }
  return [...set].sort()
}

/**
 * Count bank questions matching meta-tag filters (uses same hierarchy as upload).
 * @param {import('../data/tests').Question[]} questions
 * @param {{ subject?: string, section?: string, chapter?: string, topic?: string }} filter
 */
export function countQuestionsForMetaTag(questions, filter) {
  let count = 0
  for (const q of questions) {
    if (filter.subject && q.subject !== filter.subject) continue
    const r = resolveQuestionHierarchy(q.subject, q.section, q.chapter, q.topic)
    if (filter.section && r.section !== filter.section) continue
    if (filter.chapter && r.chapter !== filter.chapter) continue
    if (filter.topic && r.topic !== filter.topic) continue
    count++
  }
  return count
}

/**
 * One pass over the bank so Manage meta can paint without scanning every tag.
 * @param {import('../data/tests').Question[]} questions
 */
export function buildMetaTagCountIndex(questions) {
  /** @type {Map<string, number>} */
  const map = new Map()
  const bump = (key) => map.set(key, (map.get(key) ?? 0) + 1)
  for (const q of questions ?? []) {
    const subject = String(q?.subject ?? '').trim()
    if (!subject) continue
    const r = resolveQuestionHierarchy(subject, q.section, q.chapter, q.topic)
    bump(`s:${subject}`)
    if (r.section) {
      bump(`u:${subject}:${r.section}`)
      if (r.chapter) {
        bump(`c:${subject}:${r.section}:${r.chapter}`)
        if (r.topic) bump(`t:${subject}:${r.section}:${r.chapter}:${r.topic}`)
      }
    }
  }
  return {
    subject: (id) => map.get(`s:${id}`) ?? 0,
    section: (subject, unit) => map.get(`u:${subject}:${unit}`) ?? 0,
    chapter: (subject, unit, ch) => map.get(`c:${subject}:${unit}:${ch}`) ?? 0,
    topic: (subject, unit, ch, tp) => map.get(`t:${subject}:${unit}:${ch}:${tp}`) ?? 0,
  }
}
