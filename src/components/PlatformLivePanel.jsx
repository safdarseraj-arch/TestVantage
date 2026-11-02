import { useEffect, useState } from 'react'
import { fetchPlatformHealth, pingExamApi } from '../utils/examApi.js'
import { fetchLiveBackup } from '../utils/authApi.js'
import { loadAdminAccount } from '../utils/auth.js'
import { downloadTextFile } from '../utils/csvQuestions'
import {
  isPlatformScaleEnabled,
  platformModeLabel,
  TARGET_CONCURRENT_STUDENTS,
} from '../config/platform.js'

export default function PlatformLivePanel() {
  const [health, setHealth] = useState(null)
  const [apiUp, setApiUp] = useState(null)
  const [msg, setMsg] = useState({ type: '', text: '' })
  const [backingUp, setBackingUp] = useState(false)

  useEffect(() => {
    pingExamApi().then(setApiUp)
    fetchPlatformHealth().then(setHealth)
  }, [])

  const storage = health?.storage
  const liveMode = isPlatformScaleEnabled()

  const runBackup = async () => {
    const admin = loadAdminAccount()
    const password = window.prompt('Enter admin password to download live server backup:')
    if (!password) return
    setBackingUp(true)
    setMsg({ type: '', text: '' })
    try {
      const data = await fetchLiveBackup(admin.email, password)
      const filename = `testvantage-live-backup-${new Date().toISOString().slice(0, 10)}.json`
      downloadTextFile(filename, JSON.stringify(data, null, 2), 'application/json', {
        label: 'Live server backup',
      })
      setMsg({
        type: 'success',
        text: `Downloaded backup — ${data.questionCount ?? 0} questions, ${data.attemptCount ?? 0} attempts.`,
      })
    } catch (err) {
      setMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Backup failed — is API running?',
      })
    } finally {
      setBackingUp(false)
    }
  }

  return (
    <section className="card platform-live-panel">
      <div className="platform-live-head">
        <div>
          <h2>Live platform</h2>
          <p className="form-hint">
            Production target: <strong>{(TARGET_CONCURRENT_STUDENTS / 100000).toFixed(0)} lakh</strong>{' '}
            students · Mode: <strong>{platformModeLabel()}</strong>
            {apiUp === true && ' · API online'}
            {apiUp === false && ' · API offline'}
          </p>
        </div>
        <span className={`go-live-verdict ${liveMode ? 'go-live-verdict--ok' : 'go-live-verdict--warn'}`}>
          {liveMode ? 'Live build' : 'Dev build'}
        </span>
      </div>

      {storage && (
        <p className="form-hint platform-scale-stats">
          Backends: questions <strong>{storage.questions}</strong> · org{' '}
          <strong>{storage.orgData ?? 'file'}</strong> · sessions <strong>{storage.sessions}</strong>{' '}
          · attempts <strong>{storage.attempts}</strong>
          {storage.postgresOk && ' · PostgreSQL OK'}
          {storage.redisOk && ' · Redis OK'}
        </p>
      )}

      <ol className="platform-live-steps">
        <li>
          Copy <code>.env.production.example</code> → <code>.env.production</code> and set a strong{' '}
          <code>TESTVANTAGE_ADMIN_PASSWORD</code> on the server.
        </li>
        <li>
          Build for live: <code>npm run live:build</code> (sets <code>VITE_PLATFORM_SCALE=1</code>).
        </li>
        <li>
          Start stack: <code>npm run live:up</code> — PostgreSQL + Redis + 2 API servers + nginx on{' '}
          <strong>port 8080</strong>.
        </li>
        <li>
          Point your domain with HTTPS (see <code>deploy/nginx-ssl.conf.example</code>).
        </li>
      </ol>

      <div className="admin-action-row">
        <button type="button" className="btn btn-primary btn-sm" disabled={backingUp} onClick={runBackup}>
          {backingUp ? 'Downloading…' : 'Download live server backup'}
        </button>
      </div>

      {msg.text && (
        <p className={msg.type === 'error' ? 'upload-error' : 'upload-success'}>{msg.text}</p>
      )}

      {!liveMode && (
        <p className="form-hint">
          You are in <strong>dev mode</strong> — data stays on this browser. Run{' '}
          <code>npm run live:build</code> before <code>npm run live:up</code> on your cloud server.
        </p>
      )}
    </section>
  )
}
