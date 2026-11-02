import { useState } from 'react'
import VoiceRecorder from './VoiceRecorder'
import {
  createPreviewUrl,
  extractTextFromFile,
  isImageFile,
  isPdfFile,
  isSupportedUpload,
  isWordFile,
} from '../utils/extractDocument'
import { friendlyUploadError } from '../utils/uploadFriendlyErrors.js'
import OcrOutputFormatPicker from './OcrOutputFormatPicker'

/**
 * Textarea + Word / PDF / image + optional voice (Ask Doubt).
 * @param {{
 *   value: string
 *   onChange: (v: string) => void
 *   rows?: number
 *   placeholder?: string
 *   label?: string
 *   enableVoice?: boolean
 *   voiceAudioId?: string | null
 *   voiceDurationMs?: number
 *   onVoiceChange?: (meta: { audioId: string, durationMs: number } | null) => void
 *   onSourceChange?: (meta: { fileName?: string, sourceType?: string, audioId?: string, durationMs?: number } | null) => void
 * }} props
 */
export default function TextWithFileUpload({
  value,
  onChange,
  rows = 5,
  placeholder = 'Type here or upload a file below…',
  label = 'Content',
  enableVoice = false,
  voiceAudioId = null,
  voiceDurationMs = 0,
  onVoiceChange,
  onSourceChange,
}) {
  const [mode, setMode] = useState('type')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [fileName, setFileName] = useState('')
  const [previewUrl, setPreviewUrl] = useState(null)
  const [extractError, setExtractError] = useState('')

  const handleFile = async (file) => {
    if (!file || !isSupportedUpload(file)) {
      setExtractError('Use .docx, .pdf, .png, or .jpg')
      return
    }
    setExtractError('')
    setFileName(file.name)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    if (isImageFile(file) && !isPdfFile(file) && !isWordFile(file)) {
      setPreviewUrl(createPreviewUrl(file))
    } else {
      setPreviewUrl(null)
    }

    setLoading(true)
    setProgress(0)
    try {
      const text = await extractTextFromFile(file, setProgress)
      if (!text.trim()) {
        setExtractError('No text found. Try a clearer image or typed PDF.')
        return
      }
      onChange(value.trim() ? `${value.trim()}\n\n${text}` : text)
      const sourceType = isWordFile(file) ? 'word' : isPdfFile(file) ? 'pdf' : 'image'
      onSourceChange?.({ fileName: file.name, sourceType, audioId: undefined, durationMs: undefined })
      setMode('type')
    } catch (e) {
      setExtractError(friendlyUploadError(e) ?? 'Extract failed')
    } finally {
      setLoading(false)
      setProgress(0)
    }
  }

  return (
    <div className="text-file-upload">
      <div className="text-file-tabs">
        <button
          type="button"
          className={mode === 'type' ? 'active' : ''}
          onClick={() => setMode('type')}
        >
          ✏️ Type
        </button>
        <button
          type="button"
          className={mode === 'file' ? 'active' : ''}
          onClick={() => setMode('file')}
        >
          📄 Word / PDF / Image
        </button>
        {enableVoice && (
          <button
            type="button"
            className={mode === 'voice' ? 'active' : ''}
            onClick={() => setMode('voice')}
          >
            🎤 Voice
          </button>
        )}
      </div>

      {mode === 'type' && (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          placeholder={placeholder}
        />
      )}

      {mode === 'file' && (
        <div className="text-file-panel">
          <OcrOutputFormatPicker id={`ocr-format-${label}`} />
          <div
            className="upload-dropzone upload-dropzone-sm"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              handleFile(e.dataTransfer.files[0])
            }}
            onClick={() => document.getElementById(`file-input-${label}`)?.click()}
          >
            <input
              id={`file-input-${label}`}
              type="file"
              hidden
              accept=".docx,.pdf,.png,.jpg,.jpeg,image/*,application/pdf"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <p className="dropzone-title">
              {loading ? `Extracting… ${progress}%` : 'Drop or click — Word, PDF, Image'}
            </p>
            {fileName && <p className="dropzone-file">{fileName}</p>}
          </div>
          {previewUrl && (
            <img src={previewUrl} alt="" className="upload-preview-img upload-preview-sm" />
          )}
          {extractError && <p className="upload-error">{extractError}</p>}
          <p className="form-hint">
            OCR: <strong>Mathpix</strong> (add MATHPIX_APP_ID and MATHPIX_APP_KEY in .env, then F5). Extracted text is added below.
          </p>
          {value.trim() && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode('type')}>
              Edit extracted text →
            </button>
          )}
        </div>
      )}

      {mode === 'file' && value.trim() && (
        <div className="extract-preview-snippet">
          <strong>Preview:</strong>
          <p>{value.slice(0, 200)}{value.length > 200 ? '…' : ''}</p>
        </div>
      )}

      {enableVoice && mode === 'voice' && (
        <VoiceRecorder
          label="Record your message"
          audioId={voiceAudioId}
          durationMs={voiceDurationMs}
          onRecorded={(meta) => {
            onVoiceChange?.(meta)
            if (meta) {
              onSourceChange?.({
                sourceType: 'voice',
                audioId: meta.audioId,
                durationMs: meta.durationMs,
              })
            } else {
              onSourceChange?.(value.trim() ? { sourceType: 'text' } : null)
            }
          }}
        />
      )}

      {enableVoice && mode !== 'voice' && voiceAudioId && (
        <p className="form-hint voice-attached-hint">
          🎤 Voice clip attached ({voiceDurationMs ? `${Math.round(voiceDurationMs / 1000)}s` : 'saved'}).
          Open the <strong>Voice</strong> tab to re-record or remove.
        </p>
      )}
    </div>
  )
}
