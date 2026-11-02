import { useState } from 'react'
import {
  isLiveOrgSyncEnabled,
  pullOrgFromServer,
  pushOrgToServer,
} from '../utils/orgServerSync.js'

/**
 * @param {{ onRefresh?: () => void, onMessage?: (type: string, text: string) => void }} props
 */
export default function OrgServerSyncPanel({ onRefresh, onMessage }) {
  const [busy, setBusy] = useState(false)

  if (!isLiveOrgSyncEnabled()) {
    return (
      <div className="card org-server-sync-panel">
        <h3>Live school sync</h3>
        <p className="form-hint">
          Schools, classes, and assignments sync to the server when{' '}
          <strong>VITE_PLATFORM_SCALE=1</strong> is set in your production build and the API is
          running.
        </p>
      </div>
    )
  }

  const runPull = async () => {
    setBusy(true)
    try {
      const result = await pullOrgFromServer()
      if (result.ok) {
        onRefresh?.()
        onMessage?.(
          'success',
          `Pulled live data — ${result.counts?.schools ?? 0} schools, ${result.counts?.classes ?? 0} classes.`,
        )
      } else {
        onMessage?.('error', result.error ?? 'Pull failed')
      }
    } finally {
      setBusy(false)
    }
  }

  const runPush = async () => {
    setBusy(true)
    try {
      const result = await pushOrgToServer()
      if (result.ok) {
        onMessage?.('success', 'School & teacher data pushed to the live server.')
      } else {
        onMessage?.('error', result.error ?? 'Push failed')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card org-server-sync-panel">
      <div className="bank-server-sync-head">
        <h3>Live school sync</h3>
        <div className="launch-checklist-toolbar-actions">
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={runPull}>
            {busy ? 'Working…' : 'Pull from server'}
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={runPush}>
            Push to server
          </button>
        </div>
      </div>
      <p className="form-hint">
        Changes auto-push after you save. Use <strong>Pull</strong> when opening on a new device, or{' '}
        <strong>Push</strong> to upload this browser&apos;s schools and classes to the live server.
      </p>
    </div>
  )
}
