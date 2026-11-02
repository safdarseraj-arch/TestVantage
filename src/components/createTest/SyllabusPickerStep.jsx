import { useMemo } from 'react'
import { getSubjectsForPattern } from '../../data/subjects'
import { getExamPattern } from '../../data/examPatterns'
import {
  buildSyllabusTree,
  listChaptersForUnit,
  listTopicsForChapter,
  listUnitsForSubject,
  syllabusSubjectLabel,
} from '../../utils/syllabusMeta'
/**
 * @param {{
 *   examPatternId: string
 *   bankQuestions: import('../../data/tests').Question[]
 *   syllabus: import('../../utils/syllabusMeta').SyllabusSelection
 *   testTypeId?: string
 *   onChange: (s: import('../../utils/syllabusMeta').SyllabusSelection) => void
 * }} props
 */
export default function SyllabusPickerStep({
  examPatternId,
  bankQuestions,
  syllabus,
  testTypeId = 'chapter',
  onChange,
}) {
  const patternSubjects = getSubjectsForPattern(examPatternId)
  const allowedSubjectIds = patternSubjects.map((s) => s.id)
  const bankCountBySubject = useMemo(() => {
    /** @type {Map<string, number>} */
    const counts = new Map()
    for (const q of bankQuestions) {
      const id = String(q.subject ?? '').trim()
      if (!id) continue
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    return counts
  }, [bankQuestions])
  const tree = buildSyllabusTree(
    bankQuestions.filter((q) => allowedSubjectIds.includes(q.subject)),
  )

  const toggle = (key, value) => {
    const list = syllabus[key]
    const adding = !list.includes(value)
    const next = adding ? [...list, value] : list.filter((x) => x !== value)
    let patch = { ...syllabus, [key]: next }
    if (key === 'subjects') {
      if (testTypeId === 'part') {
        patch = {
          ...patch,
          subjects: adding ? [value] : [],
          sections: [],
          chapters: [],
          topics: [],
        }
      } else if (!adding) {
        patch.sections = []
        patch.chapters = []
        patch.topics = []
      }
    }
    onChange(patch)
  }

  const typeHint =
    testTypeId === 'part'
      ? 'Subject Proficiency: tick exactly one subject (e.g. Mathematics). Do not leave Subject empty — otherwise Chemistry/Biology questions also appear.'
      : testTypeId === 'chapter'
        ? 'Chapter Proficiency: pick one subject, then one or more chapters.'
        : 'Select Subject → Unit(s) → Chapter(s). Topic is optional. Leave all empty only for a full-syllabus mock.'

  return (
    <section className="create-section card">
      <h2>Syllabus (meta tags)</h2>
      <p className="form-hint">{typeHint}</p>
      <p className="form-hint syllabus-exam-scope-hint">
        Subjects for <strong>{getExamPattern(examPatternId)?.name ?? 'this exam'}</strong> — change
        exam on the next step if needed.
      </p>
      <div className="syllabus-picker-grid">
        <div className="syllabus-col">
          <h3>Subject</h3>
          {patternSubjects.length === 0 && (
            <p className="form-hint">No subjects for this exam pattern.</p>
          )}
          {patternSubjects.map(({ id, label }) => {
            const inBank = bankCountBySubject.get(id) ?? 0
            return (
              <label key={id} className={`syllabus-check${inBank === 0 ? ' syllabus-check-empty' : ''}`}>
                <input
                  type="checkbox"
                  checked={syllabus.subjects.includes(id)}
                  onChange={() => toggle('subjects', id)}
                />
                <span className="syllabus-check-label">
                  {label}
                  <span className="syllabus-meta-count" title="Published questions in your bank for this exam">
                    {inBank} in bank
                  </span>
                </span>
              </label>
            )
          })}
          {patternSubjects.length > 0 && bankCountBySubject.size === 0 && (
            <p className="form-hint">No published questions yet — you can still pick a subject, then upload in Question Bank.</p>
          )}
        </div>

        <div className="syllabus-col">
          <h3>Unit(s)</h3>
          {syllabus.subjects.map((sub) => (
            <div key={sub} className="syllabus-sub-block">
              <strong>{syllabusSubjectLabel(sub)}</strong>
              {listUnitsForSubject(bankQuestions, sub).map((unit) => (
                <label key={`${sub}-${unit}`} className="syllabus-check">
                  <input
                    type="checkbox"
                    checked={syllabus.sections.includes(unit)}
                    onChange={() => toggle('sections', unit)}
                  />
                  {unit}
                </label>
              ))}
            </div>
          ))}
          {!syllabus.subjects.length && (
            <p className="form-hint">Pick at least one subject to filter units.</p>
          )}
        </div>

        <div className="syllabus-col">
          <h3>Chapter(s)</h3>
          {syllabus.subjects.flatMap((sub) =>
            (syllabus.sections.length
              ? syllabus.sections
              : [...(tree.get(sub)?.keys() ?? [])]
            ).map((unit) => (
              <div key={`${sub}-${unit}`} className="syllabus-sub-block">
                <strong>
                  {syllabusSubjectLabel(sub)} · {unit}
                </strong>
                {listChaptersForUnit(bankQuestions, sub, unit === '(no unit)' ? '' : unit).map(
                  (ch) => (
                    <label key={`${sub}-${unit}-${ch}`} className="syllabus-check">
                      <input
                        type="checkbox"
                        checked={syllabus.chapters.includes(ch)}
                        onChange={() => toggle('chapters', ch)}
                      />
                      {ch}
                    </label>
                  ),
                )}
              </div>
            )),
          )}
        </div>

        <div className="syllabus-col">
          <h3>Topic (optional)</h3>
          {syllabus.subjects.flatMap((sub) =>
            syllabus.chapters.map((ch) => (
              <div key={`${sub}-${ch}`} className="syllabus-sub-block">
                <strong>{ch}</strong>
                {listTopicsForChapter(bankQuestions, sub, ch).map((tp) => (
                  <label key={tp} className="syllabus-check">
                    <input
                      type="checkbox"
                      checked={syllabus.topics.includes(tp)}
                      onChange={() => toggle('topics', tp)}
                    />
                    {tp}
                  </label>
                ))}
              </div>
            )),
          )}
          {!syllabus.chapters.length && (
            <p className="form-hint">Select chapters to narrow by topic.</p>
          )}
        </div>
      </div>
    </section>
  )
}
