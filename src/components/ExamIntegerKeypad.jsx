import { useEffect, useState } from 'react'
import { digitsOnly } from './IntegerAnswerInput.jsx'
import { syncIntegerDisplay } from '../utils/examIntegerAnswer.js'

/**
 * IVQ answer entry — on-screen number pad (document-level click bridge for Cursor browser).
 * @param {Object} props
 * @param {string | number | null} props.value
 * @param {(value: string | null) => void} props.onChange
 * @param {string} props.questionId
 * @param {number} [props.resetKey]
 */
export default function ExamIntegerKeypad({ value, onChange: _onChange, questionId, resetKey = 0 }) {
  const [display, setDisplay] = useState(() => digitsOnly(value))

  useEffect(() => {
    const d = digitsOnly(value)
    syncIntegerDisplay(questionId, d)
    setDisplay(d)
  }, [questionId, resetKey, value])

  return (
    <div
      className="integer-answer-input exam-answer-zone exam-integer-keypad"
      data-exam-question-id={questionId}
    >
      <span className="integer-answer-label">Your answer — tap a number below</span>

      <div
        className="exam-integer-display"
        data-exam-display={questionId}
        aria-live="polite"
        aria-atomic="true"
      >
        {display || '—'}
      </div>

      <div className="exam-integer-keys" role="group" aria-label="Enter digits">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((digit) => (
          <button key={digit} type="button" className="exam-integer-key" data-exam-key={digit}>
            {digit}
          </button>
        ))}
        <button type="button" className="exam-integer-key exam-integer-key-wide" data-exam-key="back">
          ⌫
        </button>
        <button type="button" className="exam-integer-key exam-integer-key-wide" data-exam-key="clear">
          Clear
        </button>
      </div>

      <p className="form-hint integer-answer-hint">
        Tap the number buttons. The large box above should change when a tap works.
      </p>

      {import.meta.env.DEV && (
        <p className="form-hint exam-answer-debug">
          Check: showing = {display || '(empty)'} · saved ={' '}
          {value == null || value === '' ? '(empty)' : String(value)}
        </p>
      )}
    </div>
  )
}
