import { useEffect } from 'react'
import { formatTime } from '../utils/formatTime'

export default function Timer({ secondsLeft, onExpire, warningAt = 300, label = 'Time left', className = '' }) {
  useEffect(() => {
    if (secondsLeft <= 0 && onExpire) onExpire()
  }, [secondsLeft, onExpire])

  const urgent = secondsLeft <= warningAt

  return (
    <div
      className={`timer timer-display ${urgent ? 'warning timer-urgent' : ''} ${className}`.trim()}
      role="timer"
    >
      <span className="timer-label">{label}</span>
      <span className="timer-value">{formatTime(secondsLeft)}</span>
    </div>
  )
}
