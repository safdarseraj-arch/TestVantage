import { formatMarkingLabel } from '../../data/questionTypes'
import { listPaperPatterns } from '../../utils/paperPatternStore'
import { getQuestionType } from '../../data/questionTypes'

/**
 * @param {{
 *   examPatternId: string
 *   slots: import('../../data/examPatterns').QuestionTypeSlot[]
 *   paperTemplateId: string
 *   onSlotsChange: (slots: import('../../data/examPatterns').QuestionTypeSlot[]) => void
 *   onTemplateChange: (id: string) => void
 * }} props
 */
export default function MarkingSchemeStep({
  examPatternId,
  slots,
  paperTemplateId,
  onSlotsChange,
  onTemplateChange,
}) {
  const templates = listPaperPatterns(examPatternId)
  const isJeeAdv = examPatternId === 'jee-advanced'

  const applyTemplate = (id) => {
    onTemplateChange(id)
    const tpl = templates.find((p) => p.id === id)
    if (tpl?.slots?.length) {
      onSlotsChange(tpl.slots.map((s) => ({ ...s, marking: { ...s.marking } })))
    }
  }

  const updateMarking = (index, field, value) => {
    onSlotsChange(
      slots.map((s, i) =>
        i === index
          ? { ...s, marking: { ...s.marking, [field]: Number(value) || 0 } }
          : s,
      ),
    )
  }

  return (
    <section className="create-section card">
      <h2>Marking scheme</h2>
      {isJeeAdv && (
        <>
          <p className="form-hint">
            JEE Advanced papers can use different marking per type. Pick a last-year style template
            or edit marks below.
          </p>
          <label className="create-template-pick">
            JEE Adv paper template
            <select
              value={paperTemplateId}
              onChange={(e) => applyTemplate(e.target.value)}
            >
              <option value="">Custom marking (edit table)</option>
              {templates.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      {!isJeeAdv && (
        <p className="form-hint">
          Set correct, wrong, and unattempted marks per question type. MCQ partial = +1/+2/+3 tier
          base.
        </p>
      )}

      <table className="create-slots-table create-marking-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Count</th>
            <th>Correct (+)</th>
            <th>Wrong (−)</th>
            <th>Unattempted</th>
            <th>MCQ partial base</th>
            <th>Preview</th>
          </tr>
        </thead>
        <tbody>
          {slots.map((slot, i) => {
            const def = getQuestionType(slot.questionTypeId)
            const m = slot.marking ?? def.defaultMarking
            const isMcq = slot.questionTypeId === 'multiple_correct'
            return (
              <tr key={i}>
                <td>
                  <strong>{def.shortName}</strong>
                  {slot.section ? <span className="form-hint"> · {slot.section}</span> : null}
                </td>
                <td>{slot.count}</td>
                <td>
                  <input
                    type="number"
                    step="0.5"
                    value={m.correct}
                    onChange={(e) => updateMarking(i, 'correct', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.5"
                    value={m.wrong}
                    onChange={(e) => updateMarking(i, 'wrong', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.5"
                    value={m.unattempted ?? 0}
                    onChange={(e) => updateMarking(i, 'unattempted', e.target.value)}
                  />
                </td>
                <td>
                  {isMcq ? (
                    <input
                      type="number"
                      step="0.5"
                      value={m.partial ?? 1}
                      onChange={(e) => updateMarking(i, 'partial', e.target.value)}
                    />
                  ) : (
                    '—'
                  )}
                </td>
                <td className="marking-preview-cell">{formatMarkingLabel(m)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
