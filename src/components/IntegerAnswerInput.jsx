const MAX_DIGITS = 4
const MAX_VALUE = 9999

/** @param {string | number | null | undefined} raw */
function digitsOnly(raw) {
  return String(raw ?? '')
    .replace(/\D/g, '')
    .slice(0, MAX_DIGITS)
}

/**
 * JEE-style non-negative integer entry (up to 4 digits).
 * Uncontrolled input — avoids React sync wiping keystrokes in the exam browser.
 * @param {Object} props
 * @param {string | number | null} props.value
 * @param {(value: string | null) => void} props.onChange
 * @param {boolean} [props.disabled]
 * @param {string} [props.label]
 * @param {string} [props.questionId]
 * @param {number} [props.resetKey]
 */
export default function IntegerAnswerInput({
  value,
  onChange,
  disabled = false,
  label = 'Enter your answer (0–9999)',
  questionId,
  resetKey = 0,
}) {
  const inputId = questionId ? `integer-${questionId}` : 'integer-answer'
  const mountKey = `${questionId ?? 'q'}-${resetKey}`

  const syncValue = (el) => {
    let s = digitsOnly(el.value)
    if (s !== '') {
      const n = parseInt(s, 10)
      if (!Number.isNaN(n) && n > MAX_VALUE) s = String(MAX_VALUE)
    }
    if (el.value !== s) el.value = s
    onChange(s === '' ? null : s)
  }

  return (
    <div className="integer-answer-input exam-answer-zone">
      <label className="integer-answer-label" htmlFor={inputId}>
        {label}
        <input
          key={mountKey}
          id={inputId}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          maxLength={MAX_DIGITS}
          className="integer-answer-field"
          defaultValue={digitsOnly(value)}
          disabled={disabled}
          placeholder="Type answer here (0–9999)"
          onInput={(e) => syncValue(e.currentTarget)}
          onChange={(e) => syncValue(e.currentTarget)}
          onPointerDown={(e) => e.stopPropagation()}
        />
      </label>
      <p className="form-hint integer-answer-hint">
        Non-negative integer, up to 4 digits. Leave blank if skipping.
      </p>
    </div>
  )
}

export { MAX_DIGITS, MAX_VALUE, digitsOnly }
