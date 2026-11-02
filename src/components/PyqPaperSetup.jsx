import { useMemo } from 'react'
import { PYQ_EXAMS } from '../data/pyqCatalog.js'
import { buildPyqPaperIds, jeeMainPaperSlotOptions, validatePyqPaperSetup } from '../utils/pyqPaperDefaults.js'

const YEAR_OPTIONS = [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019]

/**
 * @param {{
 *   value: import('../utils/pyqPaperDefaults.js').PyqPaperDefaults
 *   onChange: (next: import('../utils/pyqPaperDefaults.js').PyqPaperDefaults) => void
 *   compact?: boolean
 * }} props
 */
export default function PyqPaperSetup({ value, onChange, compact = false }) {
  const isJeeMain = value.examPatternId === 'jee-main'
  const jeeSlots = useMemo(
    () => jeeMainPaperSlotOptions(value.pyqYear),
    [value.pyqYear],
  )
  const validation = validatePyqPaperSetup(value)
  const previewIds = buildPyqPaperIds(value)

  const patch = (p) => {
    const next = { ...value, ...p }
    const ids = buildPyqPaperIds(next)
    onChange({ ...next, ...ids })
  }

  const pickJeeSlot = (paperId) => {
    const slot = jeeSlots.find((s) => s.paperId === paperId)
    if (!slot) return
    onChange({
      ...value,
      paperId: slot.paperId,
      paperLabel: slot.paperLabel,
      pyqDate: slot.pyqDate,
      pyqShift: slot.pyqShift,
      pyqSession: slot.pyqSession,
    })
  }

  return (
    <div className={`pyq-paper-setup ${compact ? 'is-compact' : ''}`}>
      <h4>{compact ? 'Paper' : 'Step 1 — Pick exam & paper'}</h4>
      {!compact && (
        <p className="form-hint">
          Set this <strong>before</strong> adding questions. Subject and chapter can be filled later
          on each question or in bulk.
        </p>
      )}

      <div className="pyq-paper-setup-grid">
        <label>
          Exam *
          <select
            value={value.examPatternId}
            onChange={(e) =>
              patch({
                examPatternId: e.target.value,
                pyqDate: '',
                pyqShift: undefined,
                pyqSession: '',
              })
            }
          >
            {PYQ_EXAMS.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Year *
          <select
            value={value.pyqYear}
            onChange={(e) => patch({ pyqYear: Number(e.target.value) })}
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>

        {isJeeMain ? (
          <label className="pyq-paper-setup-wide">
            Date &amp; shift * (JEE Main)
            <select
              value={
                value.paperId && jeeSlots.some((s) => s.paperId === value.paperId)
                  ? value.paperId
                  : ''
              }
              onChange={(e) => pickJeeSlot(e.target.value)}
            >
              <option value="">Choose date and shift…</option>
              {jeeSlots.map((s) => (
                <option key={s.paperId} value={s.paperId}>
                  {s.paperLabel}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            Session / paper name
            <input
              value={value.pyqSession ?? ''}
              onChange={(e) => patch({ pyqSession: e.target.value })}
              placeholder={value.examPatternId === 'jee-advanced' ? 'Paper 1' : 'Session 1'}
            />
          </label>
        )}

        <label>
          Subject <span className="form-hint">(optional now)</span>
          <input
            value={value.subject ?? ''}
            onChange={(e) => onChange({ ...value, subject: e.target.value })}
            placeholder="e.g. Mathematics"
          />
        </label>

        <label>
          Chapter <span className="form-hint">(optional now)</span>
          <input
            value={value.chapter ?? ''}
            onChange={(e) => onChange({ ...value, chapter: e.target.value })}
            placeholder="e.g. Quadratic Equations"
          />
        </label>
      </div>

      <p className="form-hint pyq-paper-setup-preview">
        Paper ID: <strong>{previewIds.paperId || '—'}</strong>
        {' · '}
        Label: <strong>{previewIds.paperLabel || '—'}</strong>
      </p>

      {!validation.ok && (
        <p className="form-error pyq-paper-setup-error">{validation.error}</p>
      )}
      {validation.ok && !compact && (
        <p className="upload-success">Paper ready — choose an upload method below.</p>
      )}
    </div>
  )
}

export { validatePyqPaperSetup }
