import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { savePracticePrefill } from '../utils/aiMastery.js'

const SORT_OPTIONS = [
  { id: 'accuracy', label: 'Weakest first' },
  { id: 'wrong', label: 'Most wrong' },
  { id: 'chapter', label: 'A–Z' },
]

/**
 * Sortable weak-chapter focus list with one-click Practice.
 * @param {{
 *   topics: { chapter: string, accuracy: number, wrong: number, unattempted?: number, score?: number, maxScore?: number, tests?: number }[]
 *   examPatternId?: string
 *   chapterSubjects?: Record<string, string[]>
 *   title?: string
 *   subtitle?: string
 *   compact?: boolean
 *   maxRows?: number
 * }} props
 */
export default function WeakChaptersPanel({
  topics = [],
  examPatternId,
  chapterSubjects = {},
  title = 'Focus areas',
  subtitle = 'Chapters that need more practice — tap Practice to start a targeted session.',
  compact = false,
  maxRows,
}) {
  const navigate = useNavigate()
  const [sortBy, setSortBy] = useState('accuracy')

  const sorted = useMemo(() => {
    const list = [...topics]
    if (sortBy === 'accuracy') list.sort((a, b) => a.accuracy - b.accuracy)
    else if (sortBy === 'wrong') list.sort((a, b) => b.wrong - a.wrong)
    else list.sort((a, b) => a.chapter.localeCompare(b.chapter))
    return maxRows ? list.slice(0, maxRows) : list
  }, [topics, sortBy, maxRows])

  const onPractice = (chapter) => {
    savePracticePrefill({
      examPatternId,
      chapters: [chapter],
      subjects: chapterSubjects[chapter] ?? [],
    })
    navigate('/practice')
  }

  if (!topics.length) return null

  return (
    <section className={`card si-weak-panel${compact ? ' si-weak-panel--compact' : ''}`}>
      <header className="si-weak-panel-head">
        <div>
          <p className="si-weak-eyebrow">Weak chapters</p>
          <h2>{title}</h2>
          <p className="form-hint">{subtitle}</p>
        </div>
        <div className="si-weak-sort" role="group" aria-label="Sort chapters">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`si-weak-sort-btn${sortBy === opt.id ? ' active' : ''}`}
              onClick={() => setSortBy(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </header>

      <div className="si-weak-table-wrap">
        <table className="si-weak-table">
          <thead>
            <tr>
              <th>Chapter</th>
              <th>Accuracy</th>
              <th>Wrong</th>
              <th>Skipped</th>
              {topics.some((t) => t.tests != null) && <th>Tests</th>}
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => (
              <tr key={t.chapter} className={t.accuracy < 50 ? 'si-weak-row--low' : ''}>
                <td>
                  <strong>{t.chapter}</strong>
                </td>
                <td>
                  <span className={`si-weak-acc${t.accuracy < 50 ? ' low' : ''}`}>
                    {t.accuracy}%
                  </span>
                </td>
                <td className="text-wrong">{t.wrong}</td>
                <td>{t.unattempted ?? 0}</td>
                {topics.some((x) => x.tests != null) && <td>{t.tests ?? '—'}</td>}
                <td className="si-weak-action">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm si-practice-btn"
                    onClick={() => onPractice(t.chapter)}
                  >
                    Practice
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
