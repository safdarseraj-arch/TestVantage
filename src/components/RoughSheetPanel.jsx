import { useEffect, useState } from 'react'
import {
  getRoughSheet,
  saveRoughSheet,
  readRoughSheetImage,
  clearRoughSheet,
} from '../utils/roughSheetStore.js'

/**
 * Upload / note a rough sheet tagged to this attempt.
 * AI forensics is explicitly “coming” — we do not invent analysis.
 */
export default function RoughSheetPanel({ attemptId }) {
  const [note, setNote] = useState('')
  const [preview, setPreview] = useState(/** @type {string | null} */ (null))
  const [fileName, setFileName] = useState(/** @type {string | null} */ (null))
  const [status, setStatus] = useState(/** @type {string | null} */ (null))
  const [err, setErr] = useState(/** @type {string | null} */ (null))

  useEffect(() => {
    if (!attemptId) return
    const row = getRoughSheet(attemptId)
    if (!row) {
      setNote('')
      setPreview(null)
      setFileName(null)
      return
    }
    setNote(row.note || '')
    setPreview(row.imageDataUrl || null)
    setFileName(row.fileName || null)
  }, [attemptId])

  if (!attemptId) {
    return (
      <section className="card si-rough-sheet">
        <p className="si-weak-eyebrow">Rough sheet</p>
        <h2>Rough-sheet notes</h2>
        <p className="form-hint">
          Save this result with an attempt id (submit a timed mock) to attach a rough-sheet photo or
          note.
        </p>
      </section>
    )
  }

  const persist = (patch) => {
    saveRoughSheet(attemptId, patch)
    setStatus('Saved to this attempt on this device.')
    setErr(null)
  }

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const { dataUrl, fileName: name } = await readRoughSheetImage(file)
      setPreview(dataUrl)
      setFileName(name)
      persist({ imageDataUrl: dataUrl, fileName: name, note })
    } catch (ex) {
      setErr(ex?.message || 'Could not read image.')
    }
  }

  const onSaveNote = () => {
    persist({ note, imageDataUrl: preview, fileName })
  }

  const onClear = () => {
    clearRoughSheet(attemptId)
    setNote('')
    setPreview(null)
    setFileName(null)
    setStatus('Cleared rough sheet for this attempt.')
  }

  return (
    <section className="card si-rough-sheet" aria-label="Rough sheet">
      <div className="si-rough-head">
        <div>
          <p className="si-weak-eyebrow">Rough sheet</p>
          <h2>Upload rough-sheet note</h2>
          <p className="form-hint">
            Photo or short note tagged to this attempt. Stored on this device only.
          </p>
        </div>
        <span className="badge badge-type">AI forensics · coming</span>
      </div>

      <label className="si-rough-note">
        <span>What went wrong / what to revisit</span>
        <textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Misread the constraint on Q12; redo GOC next."
        />
      </label>

      <div className="si-rough-actions">
        <label className="btn btn-ghost btn-sm si-rough-file">
          {preview ? 'Replace photo' : 'Add photo'}
          <input type="file" accept="image/*" hidden onChange={onFile} />
        </label>
        <button type="button" className="btn btn-primary btn-sm" onClick={onSaveNote}>
          Save note
        </button>
        {(preview || note) && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClear}>
            Clear
          </button>
        )}
      </div>

      {preview && (
        <figure className="si-rough-preview">
          <img src={preview} alt={fileName || 'Rough sheet'} />
          {fileName && <figcaption className="form-hint">{fileName}</figcaption>}
        </figure>
      )}

      <p className="form-hint si-rough-ai">
        AI handwriting / error forensics is not live yet — this is a real upload hook so your note
        stays with the attempt. No fake analysis.
      </p>
      {err && (
        <p className="upload-error" role="alert">
          {err}
        </p>
      )}
      {status && (
        <p className="form-hint" role="status">
          {status}
        </p>
      )}
    </section>
  )
}
