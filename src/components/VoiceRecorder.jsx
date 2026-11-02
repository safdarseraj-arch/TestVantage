import { useEffect, useRef, useState } from 'react'
import {
  MAX_VOICE_SECONDS,
  formatVoiceDuration,
  isVoiceRecordingSupported,
  pickRecorderMimeType,
} from '../utils/voiceRecording'
import { createVoicePlaybackUrl, deleteVoiceClip, saveVoiceClip } from '../utils/voiceStorage'

/**
 * @param {{
 *   label?: string
 *   audioId?: string | null
 *   durationMs?: number
 *   onRecorded: (meta: { audioId: string, durationMs: number } | null) => void
 * }} props
 */
export default function VoiceRecorder({ label = 'Voice', audioId, durationMs = 0, onRecorded }) {
  const [recording, setRecording] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [localDuration, setLocalDuration] = useState(durationMs)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const startRef = useRef(0)
  const previewRef = useRef(null)

  const supported = isVoiceRecordingSupported()

  useEffect(() => {
    return () => {
      stopTracks()
      if (timerRef.current) clearInterval(timerRef.current)
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    }
  }, [])

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  const revokePreview = () => {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current)
      previewRef.current = null
    }
    setPreviewUrl(null)
  }

  const startRecording = async () => {
    setError('')
    if (!supported) {
      setError('Voice recording is not supported in this browser.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []
      const mimeType = pickRecorderMimeType()
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)
      recorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        stopTracks()
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || mimeType || 'audio/webm',
        })
        if (blob.size < 100) {
          setError('Recording too short. Try again.')
          setRecording(false)
          return
        }
        setSaving(true)
        try {
          if (audioId) await deleteVoiceClip(audioId).catch(() => {})
          const duration = Date.now() - startRef.current
          const id = await saveVoiceClip(blob, { durationMs: duration })
          revokePreview()
          previewRef.current = createVoicePlaybackUrl(blob)
          setPreviewUrl(previewRef.current)
          setLocalDuration(duration)
          onRecorded({ audioId: id, durationMs: duration })
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Could not save voice')
        } finally {
          setSaving(false)
          setRecording(false)
          setElapsedMs(0)
        }
      }

      recorder.start(200)
      startRef.current = Date.now()
      setRecording(true)
      setElapsedMs(0)
      timerRef.current = setInterval(() => {
        const ms = Date.now() - startRef.current
        setElapsedMs(ms)
        if (ms >= MAX_VOICE_SECONDS * 1000) stopRecording()
      }, 200)
    } catch (e) {
      stopTracks()
      setError(
        e instanceof Error && e.name === 'NotAllowedError'
          ? 'Microphone permission denied. Allow mic access and try again.'
          : e instanceof Error
            ? e.message
            : 'Could not start recording',
      )
    }
  }

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop()
    } else {
      setRecording(false)
      stopTracks()
    }
  }

  const clearRecording = async () => {
    if (audioId) await deleteVoiceClip(audioId).catch(() => {})
    revokePreview()
    setLocalDuration(0)
    onRecorded(null)
  }

  const hasClip = Boolean(audioId || previewUrl)

  return (
    <div className="voice-recorder">
      <p className="voice-recorder-title">{label}</p>
      {!supported && (
        <p className="upload-error">Voice recording needs a modern browser with microphone access.</p>
      )}

      {supported && (
        <div className="voice-recorder-controls">
          {!recording ? (
            <button
              type="button"
              className="btn btn-primary voice-record-btn"
              onClick={startRecording}
              disabled={saving}
            >
              {hasClip ? 'Re-record' : 'Start recording'}
            </button>
          ) : (
            <button type="button" className="btn btn-danger voice-record-btn recording" onClick={stopRecording}>
              <span className="voice-pulse" aria-hidden="true" />
              Stop · {formatVoiceDuration(elapsedMs)}
            </button>
          )}
          {hasClip && !recording && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={clearRecording}>
              Remove voice
            </button>
          )}
        </div>
      )}

      <p className="form-hint">
        Max {MAX_VOICE_SECONDS}s per clip. You can combine voice with typed text or a file upload.
      </p>

      {recording && (
        <p className="voice-recording-hint">Recording… speak clearly near your microphone.</p>
      )}

      {saving && <p className="form-hint">Saving voice clip…</p>}

      {previewUrl && !recording && (
        <div className="voice-preview">
          <span className="voice-preview-label">Preview</span>
          <audio controls src={previewUrl} className="voice-audio" />
          {localDuration > 0 && (
            <span className="voice-duration">{formatVoiceDuration(localDuration)}</span>
          )}
        </div>
      )}

      {error && <p className="upload-error">{error}</p>}
    </div>
  )
}
