import { useEffect, useState } from 'react'
import MathText from './MathText.jsx'
import { getOcrDisplayText } from '../utils/ocrPreviewDisplay.js'

/**
 * Side-by-side crop image + editable extracted text.
 * @param {{
 *   cropImg?: string | null
 *   ocr: { text?: string, rawOcr?: string, options?: string[], userEdited?: boolean, status?: string }
 *   imageAlt?: string
 *   cropCaption?: string
 *   onTextEdit?: (text: string) => void
 * }} props
 */
export default function PdfCropOcrCompare({
  cropImg,
  ocr,
  imageAlt = '',
  cropCaption = 'Cropped image',
  onTextEdit,
}) {
  const [draft, setDraft] = useState(() => getOcrDisplayText(ocr))

  useEffect(() => {
    if (ocr?.userEdited) {
      if (ocr.text != null) setDraft(ocr.text)
      return
    }
    if (ocr?.status === 'done') {
      setDraft(getOcrDisplayText(ocr))
    }
  }, [ocr])

  const handleChange = (value) => {
    setDraft(value)
    onTextEdit?.(value)
  }

  const hasDraft = draft.trim().length > 0
  const hadAutoText = getOcrDisplayText(ocr).length > 0

  return (
    <div className={`pdf-crop-ocr-compare ${cropImg ? 'has-source-image' : ''}`}>
      {cropImg && (
        <figure className="pdf-crop-ocr-source">
          <figcaption>{cropCaption}</figcaption>
          <img src={cropImg} alt={imageAlt} />
        </figure>
      )}
      <div className={`pdf-crop-ocr-preview pdf-crop-ocr-preview--editable ${hasDraft ? '' : 'is-empty'}`}>
        <div className="pdf-crop-ocr-edit-head">
          <strong>Extracted text</strong>
          <span className="pdf-crop-ocr-edit-hint">Editable — fix small OCR mistakes below</span>
        </div>
        <textarea
          className="pdf-crop-ocr-edit"
          value={draft}
          onChange={(e) => handleChange(e.target.value)}
          rows={7}
          spellCheck={false}
          placeholder={
            hadAutoText
              ? 'Edit extracted text…'
              : 'OCR found no text — type the option or formula here, or keep as image.'
          }
        />
        {!hadAutoText && !hasDraft && (
          <p className="pdf-crop-ocr-empty-msg">
            The percentage above is <strong>scan confidence</strong>, not converted text. Type manually
            here, re-crop with more padding, or use <strong>Keep as image</strong>.
          </p>
        )}
        {hasDraft && (
          <details className="pdf-crop-ocr-render-preview">
            <summary>Preview rendered math</summary>
            <div className="pdf-crop-ocr-render-body">
              <MathText text={draft} />
            </div>
          </details>
        )}
      </div>
    </div>
  )
}
