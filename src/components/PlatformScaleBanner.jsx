import { useEffect, useState } from 'react'
import { fetchPlatformHealth, pingExamApi } from '../utils/examApi.js'
import {
  isPlatformScaleEnabled,
  platformModeLabel,
  TARGET_CONCURRENT_STUDENTS,
} from '../config/platform.js'

export default function PlatformScaleBanner() {
  const [health, setHealth] = useState(/** @type {object | null} */ (null))
  const [apiUp, setApiUp] = useState(null)

  useEffect(() => {
    pingExamApi().then(setApiUp)
    fetchPlatformHealth().then(setHealth)
  }, [])

  const storage = health?.storage

  return (
    <div className="platform-scale-banner card" role="status">
      <h3>Platform capacity (10 lakh target)</h3>
      <p className="form-hint">
        Designed for up to <strong>{(TARGET_CONCURRENT_STUDENTS / 100000).toFixed(0)} lakh</strong>{' '}
        students at once with cloud auto-scaling. Client mode:{' '}
        <strong>{platformModeLabel()}</strong>
        {apiUp === true && ' · API connected'}
        {apiUp === false && ' · API offline — run npm run api or npm run stack:up'}
      </p>
      {storage && (
        <p className="form-hint platform-scale-stats">
          Storage: questions <strong>{storage.questions}</strong> · sessions{' '}
          <strong>{storage.sessions}</strong> · attempts <strong>{storage.attempts}</strong> · rate
          limit <strong>{storage.rateLimit}</strong>
          {storage.postgresOk && ' · PostgreSQL OK'}
          {storage.redisOk && ' · Redis OK'}
        </p>
      )}
      {health && (
        <p className="form-hint platform-scale-stats">
          Live now on this server: <strong>{health.activeExamSessions ?? 0}</strong> exam sessions,{' '}
          <strong>{health.questionCount ?? 0}</strong> questions,{' '}
          <strong>{health.submittedAttempts ?? 0}</strong> submitted attempts.
        </p>
      )}
      <p className="form-hint">
        Full production stack: <code>npm run stack:up</code> (PostgreSQL + Redis + 2 API servers +
        nginx on port 8080). See <code>deploy/docker-compose.yml</code>.
      </p>
      {!isPlatformScaleEnabled() && (
        <p className="form-hint">
          For live exams at scale, copy <code>.env.production.example</code> to{' '}
          <code>.env.production</code>, set <code>VITE_PLATFORM_SCALE=1</code>, then{' '}
          <code>npm run build</code>.
        </p>
      )}
    </div>
  )
}
