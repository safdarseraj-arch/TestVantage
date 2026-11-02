import { getSubjectsForPattern } from '../../data/subjects'
import {
  getChapterOptions,
  getSectionOptions,
  getTopicOptions,
} from '../../utils/curriculumOptions'
import { countQuestionsForMetaTag } from '../../utils/syllabusMeta'

function MetaCount({ n }) {
  if (!n) return <span className="syllabus-meta-count">0</span>
  return <span className="syllabus-meta-count">{n}</span>
}

/**
 * @param {{
 *   bankQuestions: import('../../data/tests').Question[]
 *   countQuestions?: import('../../data/tests').Question[]
 *   examPatternId: string
 *   syllabus: import('../../utils/syllabusMeta').SyllabusSelection
 *   onChange: (s: import('../../utils/syllabusMeta').SyllabusSelection) => void
 * }} props
 */
export default function PracticeSyllabusPicker({
  bankQuestions,
  countQuestions,
  examPatternId,
  syllabus,
  onChange,
}) {
  const counts = countQuestions ?? bankQuestions
  const subjectOptions = getSubjectsForPattern(examPatternId)
  const subjectLabel = Object.fromEntries(subjectOptions.map((sub) => [sub.id, sub.label]))
  const subjects = syllabus.subjects ?? []
  const sections = syllabus.sections ?? []
  const chapters = syllabus.chapters ?? []
  const topics = syllabus.topics ?? []

  const unitsForSubject = (sub) => {
    const available = getSectionOptions(sub, bankQuestions)
    return sections.filter((unit) => available.includes(unit))
  }

  const toggle = (key, value) => {
    const list = syllabus[key] ?? []
    const next = list.includes(value) ? list.filter((x) => x !== value) : [...list, value]
    const patch = { ...syllabus, [key]: next }
    if (key === 'subjects') {
      patch.sections = []
      patch.chapters = []
      patch.topics = []
    }
    if (key === 'sections') {
      patch.chapters = []
      patch.topics = []
    }
    if (key === 'chapters') {
      patch.topics = []
    }
    onChange(patch)
  }

  return (
    <>
      <p className="form-hint">
        Pick in order: <strong>Subject</strong> → <strong>Unit</strong> → <strong>Chapter</strong> →{' '}
        <strong>Topic</strong> (optional). Each step unlocks the next. Numbers = exam-tagged
        questions. Leave Unit/Chapter empty to include all in the subjects you pick.
      </p>
      <div className="syllabus-picker-grid practice-syllabus-grid practice-syllabus-cascade">
        <div className="syllabus-col">
          <h3>1. Subject</h3>
          {subjectOptions.map((sub) => (
            <label key={sub.id} className="syllabus-check">
              <input
                type="checkbox"
                checked={subjects.includes(sub.id)}
                onChange={() => toggle('subjects', sub.id)}
              />
              <span className="syllabus-check-label">
                {sub.label}
                <MetaCount n={countQuestionsForMetaTag(counts, { subject: sub.id })} />
              </span>
            </label>
          ))}
        </div>

        {subjects.length > 0 && (
          <div className="syllabus-col">
            <h3>2. Unit</h3>
            {subjects.map((sub) => (
              <div key={sub} className="syllabus-sub-block">
                <strong>{subjectLabel[sub] ?? sub}</strong>
                {getSectionOptions(sub, bankQuestions).map((unit) => (
                  <label key={`${sub}-${unit}`} className="syllabus-check">
                    <input
                      type="checkbox"
                      checked={sections.includes(unit)}
                      onChange={() => toggle('sections', unit)}
                    />
                    <span className="syllabus-check-label">
                      {unit}
                      <MetaCount
                        n={countQuestionsForMetaTag(counts, { subject: sub, section: unit })}
                      />
                    </span>
                  </label>
                ))}
                {getSectionOptions(sub, bankQuestions).length === 0 && (
                  <p className="form-hint">No units tagged for {subjectLabel[sub] ?? sub} yet.</p>
                )}
              </div>
            ))}
          </div>
        )}

        {subjects.length > 0 && sections.length > 0 && (
          <div className="syllabus-col">
            <h3>3. Chapter</h3>
            {subjects.flatMap((sub) =>
              unitsForSubject(sub).map((unit) => (
                <div key={`${sub}-${unit}`} className="syllabus-sub-block">
                  <strong>
                    {subjectLabel[sub] ?? sub} · {unit}
                  </strong>
                  {getChapterOptions(sub, unit, bankQuestions).map((ch) => (
                    <label key={`${sub}-${unit}-${ch}`} className="syllabus-check">
                      <input
                        type="checkbox"
                        checked={chapters.includes(ch)}
                        onChange={() => toggle('chapters', ch)}
                      />
                      <span className="syllabus-check-label">
                        {ch}
                        <MetaCount
                          n={countQuestionsForMetaTag(counts, {
                            subject: sub,
                            section: unit,
                            chapter: ch,
                          })}
                        />
                      </span>
                    </label>
                  ))}
                  {getChapterOptions(sub, unit, bankQuestions).length === 0 && (
                    <p className="form-hint">No chapters for this unit yet.</p>
                  )}
                </div>
              )),
            )}
          </div>
        )}

        {subjects.length > 0 && sections.length > 0 && chapters.length > 0 && (
          <div className="syllabus-col">
            <h3>4. Topic (optional)</h3>
            {subjects.flatMap((sub) =>
              unitsForSubject(sub).flatMap((unit) =>
                getChapterOptions(sub, unit, bankQuestions)
                  .filter((ch) => chapters.includes(ch))
                  .map((ch) => (
                    <div key={`${sub}-${unit}-${ch}`} className="syllabus-sub-block">
                      <strong>
                        {subjectLabel[sub] ?? sub} · {unit} · {ch}
                      </strong>
                      {getTopicOptions(sub, unit, ch, bankQuestions).map((tp) => (
                        <label key={tp} className="syllabus-check">
                          <input
                            type="checkbox"
                            checked={topics.includes(tp)}
                            onChange={() => toggle('topics', tp)}
                          />
                          <span className="syllabus-check-label">
                            {tp}
                            <MetaCount
                              n={countQuestionsForMetaTag(counts, {
                                subject: sub,
                                section: unit,
                                chapter: ch,
                                topic: tp,
                              })}
                            />
                          </span>
                        </label>
                      ))}
                      {getTopicOptions(sub, unit, ch, bankQuestions).length === 0 && (
                        <p className="form-hint">No topics for this chapter.</p>
                      )}
                    </div>
                  )),
              ),
            )}
          </div>
        )}
      </div>

      {subjects.length === 0 && (
        <p className="form-hint practice-syllabus-next-hint">Select at least one subject to continue.</p>
      )}
      {subjects.length > 0 && sections.length === 0 && (
        <p className="form-hint practice-syllabus-next-hint">
          Select one or more units (or skip units to practice the whole subject).
        </p>
      )}
    </>
  )
}
