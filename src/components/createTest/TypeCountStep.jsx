import { Link } from 'react-router-dom'
import { getAllowedQuestionTypeIdsForExams } from '../../data/examPatterns'
import { CANONICAL_QUESTION_TYPE_IDS, getQuestionType } from '../../data/questionTypes'
import {
  bankShortageWarnings,
  countPoolForSlot,
  summarizeBankCountsByType,
} from '../../utils/paperAssembly'

/**
 * @param {{
 *   examPatternId: string
 *   slots: import('../../data/examPatterns').QuestionTypeSlot[]
 *   onChange: (slots: import('../../data/examPatterns').QuestionTypeSlot[]) => void
 *   bankPool?: import('../../data/tests').Question[]
 *   syllabusLabel?: string
 * }} props
 */
export default function TypeCountStep({
  examPatternId,
  slots,
  onChange,
  bankPool = [],
  syllabusLabel = 'Full question bank',
}) {
  const allowed = getAllowedQuestionTypeIdsForExams([examPatternId]) ?? CANONICAL_QUESTION_TYPE_IDS
  const typeOptions = CANONICAL_QUESTION_TYPE_IDS.filter((id) => allowed.includes(id))
  const bankByType = summarizeBankCountsByType(bankPool, typeOptions)
  const bankTotal = bankPool.length
  const shortages = bankShortageWarnings(slots, bankPool)

  const updateSlot = (index, patch) => {
    onChange(slots.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }

  const addSlot = () => {
    const def = getQuestionType(typeOptions[0] ?? 'single_correct')
    onChange([
      ...slots,
      {
        section: '',
        questionTypeId: typeOptions[0] ?? 'single_correct',
        count: 1,
        marking: { ...def.defaultMarking },
      },
    ])
  }

  const removeSlot = (index) => {
    onChange(slots.filter((_, i) => i !== index))
  }

  const total = slots.reduce((s, x) => s + (Number(x.count) || 0), 0)

  return (
    <section className="create-section card">
      <h2>Question types &amp; counts</h2>
      <p className="form-hint">
        Set how many questions of each type this paper needs. Add rows for mixed papers (e.g. JEE
        Advanced).
      </p>

      <div className="create-bank-type-summary">
        <div className="create-bank-type-summary-head">
          <strong>In Question Bank for your syllabus</strong>
          <span className="badge">{bankTotal} total</span>
        </div>
        <p className="form-hint create-bank-type-summary-scope">{syllabusLabel}</p>
        {bankTotal === 0 ? (
          <p className="upload-error create-bank-type-empty">
            No questions match this syllabus yet.{' '}
            <Link to="/question-bank">Upload in Question Bank</Link> or go back and widen the
            syllabus.
          </p>
        ) : (
          <div className="create-bank-type-grid">
            {bankByType.map(({ typeId, count, typeLabel, typeName }) => (
              <div
                key={typeId}
                className={`create-bank-type-chip${count === 0 ? ' empty' : ''}`}
                title={typeName}
              >
                <span className="create-bank-type-chip-label">{typeLabel}</span>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
        )}
      </div>

      <table className="create-slots-table">
        <thead>
          <tr>
            <th>Section label (optional)</th>
            <th>Type</th>
            <th>Count</th>
            <th>In bank</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {slots.map((slot, i) => {
            const inBank = countPoolForSlot(bankPool, slot)
            const need = Number(slot.count) || 0
            const short = need > inBank
            return (
              <tr key={i} className={short && need > 0 ? 'create-slot-short' : ''}>
                <td>
                  <input
                    type="text"
                    value={slot.section ?? ''}
                    placeholder="e.g. Physics — SCQ"
                    onChange={(e) => updateSlot(i, { section: e.target.value })}
                  />
                </td>
                <td>
                  <select
                    value={slot.questionTypeId}
                    onChange={(e) => {
                      const def = getQuestionType(e.target.value)
                      updateSlot(i, {
                        questionTypeId: e.target.value,
                        marking: { ...def.defaultMarking },
                      })
                    }}
                  >
                    {typeOptions.map((id) => {
                      const t = getQuestionType(id)
                      const avail = bankByType.find((b) => b.typeId === id)?.count ?? 0
                      return (
                        <option key={id} value={id}>
                          {t.shortName} — {t.name} ({avail} in bank)
                        </option>
                      )
                    })}
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    max={200}
                    value={slot.count}
                    onChange={(e) =>
                      updateSlot(i, { count: Math.max(0, Number(e.target.value) || 0) })
                    }
                  />
                </td>
                <td>
                  <span
                    className={`create-bank-in-slot${short && need > 0 ? ' warn' : ''}`}
                    title={
                      short && need > 0
                        ? `Only ${inBank} available for this syllabus — upload more or lower count`
                        : `${inBank} available in bank`
                    }
                  >
                    {inBank}
                    {short && need > 0 ? ' ⚠' : ''}
                  </span>
                </td>
                <td>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeSlot(i)}>
                    Remove
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {shortages.length > 0 && (
        <div className="upload-error create-bank-shortage-warn">
          {shortages.map((w) => (
            <div key={w}>{w}</div>
          ))}
          <Link to="/question-bank" className="btn btn-secondary btn-sm">
            Open Question Bank
          </Link>
        </div>
      )}

      <div className="create-slots-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={addSlot}>
          + Add type row
        </button>
        <span className="form-hint">
          Paper total: <strong>{total}</strong>
          {bankTotal > 0 && (
            <>
              {' '}
              · Bank has <strong>{bankTotal}</strong> in syllabus
            </>
          )}
        </span>
      </div>
    </section>
  )
}
