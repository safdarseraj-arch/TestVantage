import { useCallback, useEffect, useState } from 'react'
import { pingBankApi } from '../utils/bankApi.js'
import { getBankSaveMode, setBankSaveMode } from '../utils/bankSaveMode.js'

/**
 * @param {{ onModeChange?: (mode: 'offline' | 'online') => void }} props
 */
export default function BankSaveModeBar({ onModeChange }) {
  const [mode, setMode] = useState(() => getBankSaveMode())
  const [apiOnline, setApiOnline] = useState(null)
  const [checking, setChecking] = useState(true)

  const refreshApiStatus = useCallback(async () => {
    setChecking(true)
    const ok = await pingBankApi()
    setApiOnline(ok)
    setChecking(false)
  }, [])

  useEffect(() => {
    refreshApiStatus()
    const id = window.setInterval(refreshApiStatus, 20000)
    return () => window.clearInterval(id)
  }, [refreshApiStatus])

  const pickMode = (next) => {
    setBankSaveMode(next)
    setMode(next)
    onModeChange?.(next)
  }

  return (
    <div className="bank-save-mode-bar card">
      <div className="bank-save-mode-head">
        <h3>Save mode</h3>
        <span
          className={`bank-api-pill ${apiOnline ? 'bank-api-pill--on' : 'bank-api-pill--off'}`}
          title={apiOnline ? 'Server is reachable' : 'Start API with npm run api'}
        >
          {checking ? 'Checking server…' : apiOnline ? 'Server online' : 'Server offline'}
        </span>
      </div>
      <p className="form-hint">
        <strong>Online</strong> (default) — saves here and pushes to the server when API port 3001 is
        running. <strong>Offline</strong> — this device only until you Sync.
      </p>
      <div className="bank-save-mode-toggle" role="radiogroup" aria-label="Save mode">
        <label className={`bank-save-mode-option ${mode === 'offline' ? 'active' : ''}`}>
          <input
            type="radio"
            name="bank-save-mode"
            checked={mode === 'offline'}
            onChange={() => pickMode('offline')}
          />
          <strong>Offline</strong>
          <span>Prepare on device — sync when ready</span>
        </label>
        <label className={`bank-save-mode-option ${mode === 'online' ? 'active' : ''}`}>
          <input
            type="radio"
            name="bank-save-mode"
            checked={mode === 'online'}
            onChange={() => pickMode('online')}
          />
          <strong>Online</strong>
          <span>Save to server (live bank)</span>
        </label>
      </div>
    </div>
  )
}
