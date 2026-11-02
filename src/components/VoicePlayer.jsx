import { useEffect, useRef, useState } from 'react'
import { formatVoiceDuration } from '../utils/voiceRecording'
import { createVoicePlaybackUrl, getVoiceClip } from '../utils/voiceStorage'

/**
 * @param {{ audioId: string, durationMs?: number, compact?: boolean }} props
 */
export default function VoicePlayer({ audioId, durationMs = 0, compact = false }) {
  const [url, setUrl] = useState(null)
  const [loadedMs, setLoadedMs] = useState(durationMs)
  const [error, setError] = useState('')
  const urlRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    setError('')
    ;(async () => {
      try {
        const clip = await getVoiceClip(audioId)
        if (cancelled) return
        if (!clip) {
          setError('Voice clip not found')
          return
        }
        if (urlRef.current) URL.revokeObjectURL(urlRef.current)
        const playback = createVoicePlaybackUrl(clip.blob)
        urlRef.current = playback
        setUrl(playback)
        setLoadedMs(clip.durationMs || durationMs)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load voice')
      }
    })()
    return () => {
      cancelled = true
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current)
        urlRef.current = null
      }
    }
  }, [audioId, durationMs])

  if (error) {
    return <p className="voice-error form-hint">{error}</p>
  }

  if (!url) {
    return <p className="form-hint">Loading voice…</p>
  }

  return (
    <div className={`voice-player ${compact ? 'voice-player-compact' : ''}`}>
      <span className="voice-player-label" aria-hidden="true">
        🎤
      </span>
      <audio controls preload="metadata" src={url} className="voice-audio">
        <track kind="captions" />
      </audio>
      {loadedMs > 0 && (
        <span className="voice-duration">{formatVoiceDuration(loadedMs)}</span>
      )}
    </div>
  )
}
