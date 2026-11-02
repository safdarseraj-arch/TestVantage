import { useState } from 'react'
import { loadOcrOutputFormat, saveOcrOutputFormat } from '../utils/ocrOutputFormat.js'

/**
 * LaTeX (default) vs Word / Mathpix markdown picker for uploads.
 * @param {{ id?: string, onChange?: (format: 'latex' | 'word') => void }} [props]
 */
export default function OcrOutputFormatPicker({ id = 'ocr-output-format', onChange }) {
  const [format, setFormat] = useState(loadOcrOutputFormat)

  const pick = (next) => {
    const saved = saveOcrOutputFormat(next)
    setFormat(saved)
    onChange?.(saved)
  }

  return (
    <fieldset className="ocr-output-format" id={id}>
      <legend className="form-hint">OCR output</legend>
      <label>
        <input
          type="radio"
          name={id}
          checked={format === 'latex'}
          onChange={() => pick('latex')}
        />
        LaTeX (default for questions)
      </label>
      <label>
        <input
          type="radio"
          name={id}
          checked={format === 'word'}
          onChange={() => pick('word')}
        />
        Word / Mathpix markdown
      </label>
    </fieldset>
  )
}
