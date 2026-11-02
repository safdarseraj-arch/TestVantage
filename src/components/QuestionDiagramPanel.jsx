import { useCallback, useRef, useState } from 'react'

/**
 * Diagram attach / split controls for Question Bank single-question form.
 * Supports click upload, drag-drop, and paste (Ctrl+V) for diagram-only images.
 */
export default function QuestionDiagramPanel({
  passageBundle,
  stemNeedsDiagram,
  questionImage,
  stemTextInImage,
  splitCropSourceUrl,
  loading,
  onDiagramOnlyFile,
  onFullScreenshotFile,
  onOpenDiagramSplit,
  onOpenFullSplit,
  onRemoveDiagram,
  onStemTextInImageChange,
}) {
  const dropRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)

  const takeImageFile = useCallback((fileList) => {
    const files = [...(fileList ?? [])]
    return files.find((f) => f?.type?.startsWith('image/')) ?? null
  }, [])

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault()
      e.stopPropagation()
      setDragOver(false)
      if (loading) return
      const file = takeImageFile(e.dataTransfer?.files)
      if (file) onDiagramOnlyFile(file)
    },
    [loading, onDiagramOnlyFile, takeImageFile],
  )

  const handlePaste = useCallback(
    (e) => {
      if (loading) return
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type?.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            e.preventDefault()
            onDiagramOnlyFile(file)
            return
          }
        }
      }
    },
    [loading, onDiagramOnlyFile],
  )

  if (passageBundle) {
    return (
      <p className="form-hint">
        Diagram for this upload belongs in the passage panel above (shared for all sub-questions).
      </p>
    )
  }

  return (
    <>
      <div className="question-diagram-panel">
        <h4 className="question-diagram-heading">Question diagram (optional)</h4>
        <p className="form-hint">
          <strong>1.</strong> OCR or type question text above. <strong>2.</strong> Add the figure:
          click, drag, or paste (Ctrl+V) a <strong>diagram-only</strong> image — or split from the
          screenshot below.
        </p>
        {stemNeedsDiagram && !questionImage && (
          <p className="parse-status partial">
            {splitCropSourceUrl
              ? 'This question needs a figure — crop the graph or upload a diagram-only PNG/JPG.'
              : 'Upload a screenshot for OCR first, or use Upload diagram only.'}
          </p>
        )}
        <div
          ref={dropRef}
          className={`question-diagram-dropzone${dragOver ? ' is-dragover' : ''}`}
          tabIndex={0}
          role="group"
          aria-label="Diagram drop or paste zone"
          onDragEnter={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={(e) => {
            if (!dropRef.current?.contains(e.relatedTarget)) setDragOver(false)
          }}
          onDrop={handleDrop}
          onPaste={handlePaste}
        >
          <p className="form-hint question-diagram-drop-hint">
            Drop or paste image here · or use the buttons
          </p>
          <div className="question-diagram-attach">
            <label className="btn btn-primary btn-sm file-btn">
              {questionImage && !stemTextInImage ? 'Replace diagram image' : 'Upload diagram only'}
              <input
                type="file"
                hidden
                accept="image/png,image/jpeg,image/jpg,image/webp"
                disabled={loading}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) onDiagramOnlyFile(f)
                  e.target.value = ''
                }}
              />
            </label>
            {splitCropSourceUrl && (
              <>
                {stemNeedsDiagram && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={loading}
                    onClick={onOpenDiagramSplit}
                  >
                    ✂ Split graph from screenshot
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={loading}
                  onClick={onOpenFullSplit}
                >
                  ✂ Split stem &amp; options
                </button>
              </>
            )}
            <label className="btn btn-ghost btn-sm file-btn">
              {questionImage && stemTextInImage ? 'Replace full screenshot' : 'Upload full screenshot'}
              <input
                type="file"
                hidden
                accept="image/png,image/jpeg,image/jpg,image/webp"
                disabled={loading}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) onFullScreenshotFile(f)
                  e.target.value = ''
                }}
              />
            </label>
            {questionImage && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={onRemoveDiagram}>
                Remove diagram
              </button>
            )}
          </div>
        </div>
      </div>
      {questionImage && (
        <div className="question-diagram-preview">
          <p className="form-hint">Attached diagram (shown with question text in tests):</p>
          <img
            src={questionImage}
            alt="Question diagram preview"
            className="upload-preview-img question-stem-img"
          />
          <label className="stem-text-in-image-toggle">
            <input
              type="checkbox"
              checked={stemTextInImage}
              onChange={(e) => onStemTextInImageChange(e.target.checked)}
            />
            Text is already inside this image — hide duplicate text in preview &amp; tests
          </label>
          {!stemTextInImage && (
            <p className="form-hint">
              For <strong>Split graph from screenshot</strong>, draw the box around the circuit or
              figure only (exclude question wording). Question text stays in the box above.
            </p>
          )}
        </div>
      )}
    </>
  )
}
