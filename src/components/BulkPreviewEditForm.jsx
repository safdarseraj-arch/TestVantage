import { useState } from 'react'
import { TRUE_FALSE_OPTIONS } from '../data/questionTypes'

/**
 * Inline editor for one bulk-import preview row.
 * @param {{
 *   question: Record<string, unknown>
 *   typeOptions: { id: string, name: string }[]
 *   onSave: (patch: Record<string, unknown>) => void
 *   onCancel: () => void
 * }} props
 */
export default function BulkPreviewEditForm({ question, typeOptions, onSave, onCancel }) {
  const [text, setText] = useState(String(question.text ?? ''))
  const [options, setOptions] = useState(() => {
    const opts = [...(question.options ?? ['', '', '', ''])]
    while (opts.length < 4) opts.push('')
    return opts.slice(0, 4)
  })
  const [solution, setSolution] = useState(String(question.solution ?? ''))
  const [questionType, setQuestionType] = useState(String(question.questionType ?? 'single_correct'))
  const [correctIndex, setCorrectIndex] = useState(Number(question.correctIndex ?? 0))
  const [correctIndices, setCorrectIndices] = useState(() => {
    const from = question.correctIndices
    if (Array.isArray(from) && from.length) return [...from]
    return [Number(question.correctIndex ?? 0)]
  })
  const [correctInteger, setCorrectInteger] = useState(
    question.correctInteger != null && question.correctInteger !== ''
      ? String(question.correctInteger)
      : '',
  )
  const [correctNumerical, setCorrectNumerical] = useState(
    question.correctNumerical != null && question.correctNumerical !== ''
      ? String(question.correctNumerical)
      : '',
  )

  const isMcq = questionType === 'single_correct' || questionType === 'multiple_correct'
  const isTf = questionType === 'true_false'
  const isMsq = questionType === 'multiple_correct'

  const setOption = (idx, value) => {
    setOptions((prev) => prev.map((o, i) => (i === idx ? value : o)))
  }

  const toggleMsq = (idx) => {
    setCorrectIndices((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx].sort((a, b) => a - b),
    )
  }

  const handleSave = () => {
    const stem = text.trim()
    if (!stem) return
    /** @type {Record<string, unknown>} */
    const patch = {
      text: stem,
      questionType,
      solution: solution.trim() || undefined,
    }
    if (isMcq) {
      patch.options = options.map((o) => String(o ?? ''))
      if (isMsq) {
        patch.correctIndices = correctIndices.length ? correctIndices : [0]
        patch.correctIndex = patch.correctIndices[0]
      } else {
        patch.correctIndex = correctIndex
        patch.correctIndices = [correctIndex]
      }
    } else if (isTf) {
      patch.options = [...TRUE_FALSE_OPTIONS]
      patch.correctIndex = correctIndex === 1 ? 1 : 0
      patch.correctIndices = [patch.correctIndex]
    } else if (questionType === 'integer') {
      patch.correctInteger =
        correctInteger.trim() !== '' ? Number(correctInteger) : question.correctInteger
    } else if (questionType === 'numerical') {
      patch.correctNumerical =
        correctNumerical.trim() !== '' ? Number(correctNumerical) : question.correctNumerical
    }
    onSave(patch)
  }

  return (
    <div className="bulk-preview-edit-form">
      <p className="form-hint bulk-preview-edit-hint">
        Fix stem, options, or solution below, then <strong>Save changes</strong>.
      </p>
      <label className="bulk-preview-edit-field">
        <span>Question stem</span>
        <textarea
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
        />
      </label>
      <label className="bulk-preview-edit-field">
        <span>Type</span>
        <select
          value={questionType}
          onChange={(e) => {
            const next = e.target.value
            setQuestionType(next)
            if (next === 'true_false') {
              setOptions([...TRUE_FALSE_OPTIONS])
              setCorrectIndex(0)
            }
          }}
        >
          {typeOptions.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      {isMcq && (
        <div className="bulk-preview-edit-options">
          <span className="bulk-preview-edit-options-label">Options A–D</span>
          {options.map((opt, oi) => {
            const letter = String.fromCharCode(65 + oi)
            return (
              <label key={letter} className="bulk-preview-edit-option">
                <span>{letter}</span>
                {isMsq ? (
                  <input
                    type="checkbox"
                    checked={correctIndices.includes(oi)}
                    onChange={() => toggleMsq(oi)}
                    title={`Mark ${letter} correct`}
                  />
                ) : (
                  <input
                    type="radio"
                    name={`bulk-correct-${question.id}`}
                    checked={correctIndex === oi}
                    onChange={() => setCorrectIndex(oi)}
                    title={`Mark ${letter} correct`}
                  />
                )}
                <textarea
                  rows={2}
                  value={opt}
                  onChange={(e) => setOption(oi, e.target.value)}
                  placeholder={`Option ${letter}`}
                  spellCheck={false}
                />
              </label>
            )
          })}
        </div>
      )}
      {isTf && (
        <div className="bulk-preview-edit-options true-false-options">
          <span className="bulk-preview-edit-options-label">Correct answer</span>
          {TRUE_FALSE_OPTIONS.map((label, oi) => (
            <label key={label} className="bulk-preview-edit-option true-false-row">
              <input
                type="radio"
                name={`bulk-tf-${question.id}`}
                checked={correctIndex === oi}
                onChange={() => setCorrectIndex(oi)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      )}
      {questionType === 'integer' && (
        <label className="bulk-preview-edit-field">
          <span>Correct integer answer</span>
          <input
            type="text"
            inputMode="numeric"
            value={correctInteger}
            onChange={(e) => setCorrectInteger(e.target.value)}
          />
        </label>
      )}
      {questionType === 'numerical' && (
        <label className="bulk-preview-edit-field">
          <span>Correct numerical answer</span>
          <input
            type="text"
            inputMode="decimal"
            value={correctNumerical}
            onChange={(e) => setCorrectNumerical(e.target.value)}
          />
        </label>
      )}
      <label className="bulk-preview-edit-field">
        <span>Solution (optional)</span>
        <textarea
          rows={4}
          value={solution}
          onChange={(e) => setSolution(e.target.value)}
          spellCheck={false}
        />
      </label>
      <div className="bulk-preview-edit-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={handleSave}>
          Save changes
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
