import { useCallback, useEffect, useRef, useState } from 'react'
import { cropFromDisplayedImage, displayRectToNatural } from '../utils/cropImageRegion'

const FULL_STEPS = [
  { key: 'stem', label: 'Question (stem + diagram)', field: 'questionImage' },
  { key: 'A', label: 'Option A', index: 0 },
  { key: 'B', label: 'Option B', index: 1 },
  { key: 'C', label: 'Option C', index: 2 },
  { key: 'D', label: 'Option D', index: 3 },
]

const DIAGRAM_STEPS = [
  { key: 'diagram', label: 'Graph / diagram only', field: 'questionImage' },
]

/**
 * Crop stem and/or options A–D from one screenshot (question + options in same image).
 * @param {Object} props
 * @param {'full' | 'diagram'} [props.mode] — `diagram`: graph crop only (text from OCR)
 */
export default function ImageSplitCropper({ sourceUrl, onClose, onComplete, mode = 'full' }) {
  const STEPS = mode === 'diagram' ? DIAGRAM_STEPS : FULL_STEPS
  const imgWrapRef = useRef(null)
  const imgRef = useRef(null)
  const dragRef = useRef(null)

  const [stepIndex, setStepIndex] = useState(0)
  const [displayRect, setDisplayRect] = useState(null)
  const [dims, setDims] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState({
    questionImage: null,
    optionImages: [null, null, null, null],
  })

  const step = STEPS[stepIndex]

  const measureImage = useCallback(() => {
    const img = imgRef.current
    const wrap = imgWrapRef.current
    if (!img || !wrap || !img.complete) return
    const displayWidth = img.clientWidth
    const displayHeight = img.clientHeight
    if (!displayWidth || !displayHeight) return
    setDims({
      displayWidth,
      displayHeight,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
    })
  }, [])

  useEffect(() => {
    const onResize = () => measureImage()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [measureImage])

  useEffect(() => {
    setStepIndex(0)
    setDisplayRect(null)
    setError('')
    setResults({ questionImage: null, optionImages: [null, null, null, null] })
  }, [mode, sourceUrl])

  useEffect(() => {
    setDisplayRect(null)
    setError('')
  }, [stepIndex])

  const pointerPos = (e) => {
    const wrap = imgWrapRef.current
    if (!wrap) return null
    const box = wrap.getBoundingClientRect()
    const x = Math.max(0, Math.min(e.clientX - box.left, box.width))
    const y = Math.max(0, Math.min(e.clientY - box.top, box.height))
    return { x, y }
  }

  const onPointerDown = (e) => {
    if (busy) return
    e.preventDefault()
    const pos = pointerPos(e)
    if (!pos) return
    dragRef.current = { start: pos, current: pos }
    setDisplayRect({ left: pos.x, top: pos.y, width: 0, height: 0 })
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  const onPointerMove = (e) => {
    const drag = dragRef.current
    if (!drag) return
    const pos = pointerPos(e)
    if (!pos) return
    drag.current = pos
    const left = Math.min(drag.start.x, pos.x)
    const top = Math.min(drag.start.y, pos.y)
    const width = Math.abs(pos.x - drag.start.x)
    const height = Math.abs(pos.y - drag.start.y)
    setDisplayRect({ left, top, width, height })
  }

  const onPointerUp = (e) => {
    if (dragRef.current) {
      dragRef.current = null
      e.currentTarget.releasePointerCapture?.(e.pointerId)
    }
  }

  const applyCrop = async () => {
    if (!displayRect || displayRect.width < 6 || displayRect.height < 6) {
      setError('Drag a box around the area to crop.')
      return
    }
    if (!dims) {
      setError('Image not ready — wait a moment and try again.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const natural = displayRectToNatural(displayRect, dims)
      const imgEl = imgRef.current
      const dataUrl = await cropFromDisplayedImage(imgEl, natural, {
        srcHint: sourceUrl,
      })
      if (step.field === 'questionImage') {
        setResults((r) => ({ ...r, questionImage: dataUrl }))
      } else {
        const idx = step.index
        setResults((r) => {
          const optionImages = [...r.optionImages]
          optionImages[idx] = dataUrl
          return { ...r, optionImages }
        })
      }
      setDisplayRect(null)
      if (stepIndex < STEPS.length - 1) {
        setStepIndex((i) => i + 1)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Crop failed.')
    } finally {
      setBusy(false)
    }
  }

  const skipStep = () => {
    setDisplayRect(null)
    setError('')
    if (stepIndex < STEPS.length - 1) setStepIndex((i) => i + 1)
  }

  const finish = () => {
    onComplete?.({
      questionImage: results.questionImage,
      optionImages: results.optionImages,
    })
    onClose?.()
  }

  const stemDone = !!results.questionImage
  const optionsDone = results.optionImages.filter(Boolean).length

  return (
    <div
      className="modal-overlay image-split-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-split-title"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div className="image-split-modal" onClick={(e) => e.stopPropagation()}>
        <div className="image-split-head">
          <h3 id="image-split-title">Split question &amp; options from image</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="form-hint">
          {mode === 'diagram' ? (
            <>
              Question <strong>text is already extracted</strong> into the form. Drag a box around{' '}
              <strong>only the graph or diagram</strong> (not the text line below). Students will see
              OCR text + this image.
            </>
          ) : (
            <>
              One screenshot often has the <strong>question on top</strong> and <strong>A–D below</strong>.
              Drag a rectangle on each part — crop the stem first, then each option (skip any step you do
              not need).
            </>
          )}
        </p>

        <div className="image-split-step-bar">
          {STEPS.map((s, i) => (
            <button
              key={s.key}
              type="button"
              className={`image-split-step-pill ${i === stepIndex ? 'active' : ''} ${
                (s.field === 'questionImage' ? results.questionImage : results.optionImages[s.index])
                  ? 'done'
                  : ''
              }`}
              onClick={() => setStepIndex(i)}
            >
              {s.label}
            </button>
          ))}
        </div>

        <p className="image-split-current-step">
          Step {stepIndex + 1}/{STEPS.length}: <strong>{step.label}</strong>
        </p>

        <div
          ref={imgWrapRef}
          className="image-split-canvas-wrap"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <img
            ref={imgRef}
            src={sourceUrl}
            alt="Crop source"
            className="image-split-source"
            draggable={false}
            onLoad={measureImage}
          />
          {displayRect && displayRect.width > 0 && displayRect.height > 0 && (
            <div
              className="image-split-selection"
              style={{
                left: displayRect.left,
                top: displayRect.top,
                width: displayRect.width,
                height: displayRect.height,
              }}
            />
          )}
        </div>

        {error && <p className="upload-error">{error}</p>}

        <div className="image-split-actions">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={applyCrop}>
            {busy ? 'Cropping…' : `Apply crop for ${step.label}`}
          </button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={skipStep}>
            Skip this step
          </button>
        </div>

        <div className="image-split-previews">
          <span className="form-hint">Cropped so far:</span>
          <div className="image-split-thumb-row">
            {stemDone && (
              <figure className="image-split-thumb">
                <img src={results.questionImage} alt="Question crop" />
                <figcaption>Question</figcaption>
              </figure>
            )}
            {results.optionImages.map(
              (url, i) =>
                url && (
                  <figure key={i} className="image-split-thumb">
                    <img src={url} alt={`Option ${String.fromCharCode(65 + i)}`} />
                    <figcaption>{String.fromCharCode(65 + i)}</figcaption>
                  </figure>
                ),
            )}
            {!stemDone && !optionsDone && (
              <span className="form-hint">No crops yet — drag on the image above.</span>
            )}
          </div>
        </div>

        <div className="image-split-footer">
          <button
            type="button"
            className="btn btn-primary"
            onClick={finish}
            disabled={mode === 'diagram' ? !stemDone : !stemDone && !optionsDone}
          >
            {mode === 'diagram' ? 'Use diagram in form' : 'Use crops in form'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
