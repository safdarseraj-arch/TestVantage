import { compressImageFile } from '../utils/imageQuestion'

/**
 * Drop zone for one hybrid question image slot.
 * @param {Object} props
 * @param {string} props.label
 * @param {string} [props.hint]
 * @param {string | null} props.dataUrl
 * @param {string} [props.fileName]
 * @param {(url: string, name: string) => void} props.onSet
 * @param {() => void} props.onClear
 * @param {boolean} [props.required]
 * @param {boolean} [props.busy]
 * @param {'stem' | 'option' | 'passage' | 'solution'} [props.imageRole]
 */
export default function HybridImageSlot({
  label,
  hint,
  dataUrl,
  fileName,
  onSet,
  onClear,
  required = false,
  busy = false,
  imageRole = 'stem',
}) {
  const inputId = `hybrid-slot-${label.replace(/\W+/g, '-').toLowerCase()}`

  const handleFile = async (file) => {
    if (!file?.type.startsWith('image/')) return
    const url = await compressImageFile(file, { role: imageRole })
    onSet(url, file.name)
  }

  return (
    <div className={`hybrid-image-slot ${dataUrl ? 'has-image' : ''}`}>
      <div className="hybrid-slot-head">
        <strong>
          {label}
          {required && <span className="required-mark"> *</span>}
        </strong>
        {hint && <span className="form-hint hybrid-slot-hint">{hint}</span>}
      </div>
      {dataUrl ? (
        <div className="hybrid-slot-preview">
          <img src={dataUrl} alt={label} className="question-content-img" />
          {fileName && <p className="dropzone-file">{fileName}</p>}
          <div className="extract-actions">
            <label className="btn btn-ghost btn-sm file-btn">
              Replace
              <input
                type="file"
                hidden
                accept="image/png,image/jpeg,image/jpg,image/webp"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFile(f)
                  e.target.value = ''
                }}
              />
            </label>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClear} disabled={busy}>
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div
          className="upload-dropzone upload-dropzone-sm hybrid-dropzone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            if (!busy) handleFile(e.dataTransfer.files[0])
          }}
          onClick={() => !busy && document.getElementById(inputId)?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && !busy && document.getElementById(inputId)?.click()}
        >
          <input
            id={inputId}
            type="file"
            hidden
            accept="image/png,image/jpeg,image/jpg,image/webp"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
              e.target.value = ''
            }}
          />
          <p className="dropzone-title">{busy ? 'Processing…' : 'Drop image or click'}</p>
        </div>
      )}
    </div>
  )
}
