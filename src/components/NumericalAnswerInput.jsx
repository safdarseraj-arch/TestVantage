import {
  MAX_NUMERICAL_DIGITS,
  sanitizeNumericalAnswerInput,
} from '../utils/numericalAnswer.js'

/**
 * Numerical value entry: optional minus, decimals, up to 6 digits (JEE-style).
 * Uncontrolled — reliable during live exams.
 * @param {Object} props
 * @param {string | number | null} props.value
 * @param {(value: string | null) => void} props.onChange
 * @param {boolean} [props.disabled]
 * @param {string} [props.label]
 * @param {string} [props.questionId]
 * @param {number} [props.resetKey]
 */
export default function NumericalAnswerInput({
  value,
  onChange,
  disabled = false,
  label = 'Your answer',
  questionId,
  resetKey = 0,
}) {
  const inputId = questionId ? `numerical-${questionId}` : 'numerical-answer'
  const mountKey = `${questionId ?? 'q'}-${resetKey}`

  const syncValue = (el) => {
    const next = sanitizeNumericalAnswerInput(el.value, { allowIncomplete: true })
    if (el.value !== next) el.value = next
    onChange(next === '' ? null : next)
  }

  return (
    <div className="numerical-answer-input exam-answer-zone">
      <label className="numerical-answer-label" htmlFor={inputId}>
        {label}
        <input
          key={mountKey}
          id={inputId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          className="numerical-answer-field"
          defaultValue={sanitizeNumericalAnswerInput(value ?? '', { allowIncomplete: true })}
          disabled={disabled}
          placeholder="e.g. 45.23 or -2.345"
          onInput={(e) => syncValue(e.currentTarget)}
          onChange={(e) => syncValue(e.currentTarget)}
          onPaste={(e) => {
            e.preventDefault()
            const el = e.currentTarget
            el.value = sanitizeNumericalAnswerInput(
              e.clipboardData?.getData('text') ?? '',
              { allowIncomplete: true },
            )
            syncValue(el)
          }}
          onPointerDown={(e) => e.stopPropagation()}
        />
      </label>
      <p className="form-hint numerical-answer-hint">
        Up to {MAX_NUMERICAL_DIGITS} digits; optional <code>-</code> and one decimal point (
        <code>0.0123</code>, <code>45.23</code>, <code>-1234</code>). Use <code>.</code> not comma.
      </p>
    </div>
  )
}
