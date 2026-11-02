import { useCallback, useEffect, useState } from 'react'
import { ocrPdfCropRegion } from '../utils/pdfCropOcr.js'
import PdfCropOcrCompare from './PdfCropOcrCompare.jsx'
import { getOcrDisplayText, hasOcrDisplayText, ocrConfidenceBadgeLabel, patchOcrWithEditedText } from '../utils/ocrPreviewDisplay.js'

/**
 * Upload an image, run background OCR, compare image vs text, pick save mode.
 * Defaults to image if no choice (via resolvePdfCropOcrForSave at save time).
 *
 * @param {{
 *   label?: string
 *   hint?: string
 *   dataUrl: string | null
 *   onImageChange: (url: string | null) => void
 *   textValue: string
 *   onTextChange: (text: string) => void
 *   useTextChoice: boolean | null
 *   onUseTextChoice: (useText: boolean | null) => void
 *   parseStepKey?: string
 * }} props
 */
export default function ImageOcrChoicePanel({
  label = 'Image',
  hint,
  dataUrl,
  onImageChange,
  textValue,
  onTextChange,
  useTextChoice,
  onUseTextChoice,
  parseStepKey = 'solution',
}) {
  const [ocr, setOcr] = useState(null)
  const [busy, setBusy] = useState(false)

  const runOcr = useCallback(
    (url) => {
      if (!url) {
        setOcr(null)
        onUseTextChoice(null)
        return
      }
      setBusy(true)
      setOcr({ status: 'running' })
      onUseTextChoice(false)
      queueMicrotask(() => {
        ocrPdfCropRegion(url, parseStepKey, 'single_correct', { fast: true })
          .then((result) => {
            setOcr(result)
            if (result.trusted && result.useText == null) onUseTextChoice(null)
            else if (result.useText === false) onUseTextChoice(false)
          })
          .catch(() => setOcr({ status: 'failed', useText: false }))
          .finally(() => setBusy(false))
      })
    },
    [onUseTextChoice, parseStepKey],
  )

  useEffect(() => {
    if (!dataUrl) {
      setOcr(null)
      return
    }
    runOcr(dataUrl)
  }, [dataUrl, runOcr])

  const pickText = () => {
    onUseTextChoice(true)
    onTextChange(String(getOcrDisplayText(ocr) || textValue || '').trim())
    onImageChange(null)
  }

  const handleTextEdit = (value) => {
    setOcr((prev) => ({ ...(prev ?? {}), ...patchOcrWithEditedText(prev, value, parseStepKey) }))
  }

  const pickImage = () => {
    onUseTextChoice(false)
  }

  const hasText = hasOcrDisplayText(ocr)
  const canSaveText = hasText
  const needsReview = ocr?.status === 'done' && !ocr?.trusted && hasText

  return (
    <div className="image-ocr-choice-panel">
      <label className="image-ocr-choice-file">
        {label}
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            const reader = new FileReader()
            reader.onload = () => onImageChange(String(reader.result ?? ''))
            reader.readAsDataURL(f)
          }}
        />
      </label>
      {hint && <p className="form-hint">{hint}</p>}
      {dataUrl && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onImageChange(null)}>
          Clear image
        </button>
      )}
      {(busy || ocr?.status === 'running') && (
        <p className="form-hint pdf-crop-ocr-bg-hint">Reading text in background…</p>
      )}
      {dataUrl && ocr?.status === 'done' && (
        <div
          className={`pdf-crop-ocr-card ${ocr.trusted ? 'is-trusted' : needsReview ? 'needs-review' : ''} ${useTextChoice === true ? 'picked-text' : useTextChoice === false ? 'picked-image' : ''}`}
        >
          <div className="pdf-crop-ocr-card-head">
            <strong>Extracted preview</strong>
            <span className={`pdf-crop-ocr-badge ${hasText ? '' : 'no-text'}`}>
              {ocrConfidenceBadgeLabel(ocr.confidence, hasText)}
              {hasText && ocr.trusted ? ' · trusted' : hasText && needsReview ? ' · review' : ''}
            </span>
          </div>
          <PdfCropOcrCompare cropImg={dataUrl} ocr={ocr ?? {}} onTextEdit={handleTextEdit} />
          <div className="pdf-crop-ocr-actions">
            <button
              type="button"
              className={`btn btn-sm ${useTextChoice === true ? 'btn-primary' : 'btn-secondary'}`}
              disabled={!canSaveText}
              title={canSaveText ? undefined : 'Type or fix text in the box above, or keep as image'}
              onClick={pickText}
            >
              Save as text
            </button>
            <button
              type="button"
              className={`btn btn-sm ${useTextChoice === false ? 'btn-primary' : 'btn-ghost'}`}
              onClick={pickImage}
            >
              Keep as image
            </button>
          </div>
          <p className="form-hint">
            Edit the text box to fix OCR, then <strong>Save as text</strong>. No choice → image saved.
          </p>
        </div>
      )}
    </div>
  )
}
