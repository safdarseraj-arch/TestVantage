import { useRef } from 'react'
import MathText from './MathText'

/**
 * Side-by-side LaTeX source editor and rendered preview.
 * @param {{
 *   label: string
 *   value: string
 *   onChange: (value: string) => void
 *   rows?: number
 *   size?: 'default' | 'large'
 *   placeholder?: string
 *   questionContext?: string
 *   previewText?: string
 *   inputRef?: import('react').RefObject<HTMLTextAreaElement | null>
 *   onTextareaRef?: (el: HTMLTextAreaElement | null) => void
 *   onFocus?: () => void
 *   onBlur?: () => void
 *   disabled?: boolean
 * }} props
 */
export default function LatexDualEditField({
  label,
  value,
  onChange,
  rows = 8,
  size = 'large',
  placeholder,
  questionContext,
  previewText,
  inputRef,
  onTextareaRef,
  onFocus,
  onBlur,
  disabled = false,
}) {
  const localRef = useRef(null)
  const setRef = (el) => {
    localRef.current = el
    if (inputRef) inputRef.current = el
    onTextareaRef?.(el)
  }
  const ctx = questionContext ?? value
  const rendered = previewText ?? value

  return (
    <div className={`latex-dual-edit ${size === 'large' ? 'latex-dual-edit-large' : ''}`}>
      <div className="latex-dual-edit-source">
        <label className="saved-content-field">
          <span>{label} — LaTeX / source</span>
          <textarea
            ref={setRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
            rows={rows}
            placeholder={placeholder}
            disabled={disabled}
            className="latex-dual-textarea"
          />
        </label>
      </div>
      <div className="latex-dual-edit-preview form-preview">
        <span className="latex-dual-preview-label">Preview</span>
        {value.trim() ? (
          <MathText text={rendered} questionContext={ctx} />
        ) : (
          <p className="form-hint">Nothing to preview yet — type LaTeX in the source box.</p>
        )}
      </div>
    </div>
  )
}
