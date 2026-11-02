import { formatSyllabusDisplay } from '../../utils/syllabusMeta.js'

/**
 * Sticky summary of syllabus picks while creating a paper.
 * @param {{
 *   syllabus: import('../../utils/syllabusMeta').SyllabusSelection
 *   poolCount?: number
 *   testTypeId?: string
 *   examPatternName?: string
 *   onEdit?: () => void
 *   compact?: boolean
 * }} props
 */
export default function SelectedSyllabusBanner({
  syllabus,
  poolCount,
  testTypeId = 'chapter',
  examPatternName = '',
  onEdit,
  compact = false,
}) {
  const display = formatSyllabusDisplay(syllabus)
  const needsSubject =
    testTypeId === 'part' || testTypeId === 'chapter' ? syllabus.subjects.length === 0 : false

  return (
    <aside
      className={`create-syllabus-banner${display.empty ? ' create-syllabus-banner-empty' : ''}${compact ? ' create-syllabus-banner-compact' : ''}`}
      aria-label="Syllabus selected"
    >
      <div className="create-syllabus-banner-head">
        <div>
          <span className="create-syllabus-banner-eyebrow">Syllabus selected</span>
          {examPatternName && (
            <span className="create-syllabus-banner-exam">{examPatternName}</span>
          )}
        </div>
        <div className="create-syllabus-banner-actions">
          {typeof poolCount === 'number' && (
            <span className="badge create-syllabus-pool-badge">{poolCount} in pool</span>
          )}
          {onEdit && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onEdit}>
              Change syllabus
            </button>
          )}
        </div>
      </div>

      {display.empty ? (
        <p className="form-hint create-syllabus-banner-empty-text">
          {needsSubject
            ? 'No subject chosen yet — pick a subject on this step or questions from all subjects will appear.'
            : display.summary}
        </p>
      ) : (
        <dl className="create-syllabus-banner-rows">
          {display.rows.map((row) => (
            <div key={row.key} className="create-syllabus-banner-row">
              <dt>{row.label}</dt>
              <dd>
                {row.values.map((value) => (
                  <span key={`${row.key}-${value}`} className="create-syllabus-chip">
                    {value}
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </aside>
  )
}
