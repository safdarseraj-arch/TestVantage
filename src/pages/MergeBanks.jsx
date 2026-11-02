import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { mergeBankBackup, loadUploadedQuestions } from '../utils/questionBank'
import { navigateCopyBankFromLocalhost } from '../utils/bankOriginRedirect'

const ALLOWED_ORIGINS = new Set([
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
])

/**
 * Merge question banks from another dev port (e.g. 5174 → 5173).
 */
export default function MergeBanks() {
  const navigate = useNavigate()
  const popupRef = useRef(null)
  const mergePendingRef = useRef(false)
  const [localCount, setLocalCount] = useState(0)
  const [status, setStatus] = useState({ type: '', text: '' })
  const [merging, setMerging] = useState(false)

  const refreshCount = useCallback(() => {
    setLocalCount(loadUploadedQuestions().length)
  }, [])

  useEffect(() => {
    refreshCount()
  }, [refreshCount])

  const applyMerge = useCallback(
    (payload, sourceLabel) => {
      try {
        const { added, skipped, total } = mergeBankBackup(payload)
        refreshCount()
        setStatus({
          type: 'success',
          text: `Merged from ${sourceLabel}: ${added} added, ${skipped} skipped (same id). Possible duplicates are kept as drafts to compare. You now have ${total} question(s) on port 5173.`,
        })
        setTimeout(() => navigate('/question-bank'), 2000)
      } catch (e) {
        setStatus({
          type: 'error',
          text: e instanceof Error ? e.message : 'Merge failed',
        })
      } finally {
        mergePendingRef.current = false
        setMerging(false)
      }
    },
    [navigate, refreshCount],
  )

  useEffect(() => {
    const onMessage = (event) => {
      if (!ALLOWED_ORIGINS.has(event.origin)) return
      if (event.data?.type !== 'testvantage-bank-merge') return
      mergePendingRef.current = true
      setMerging(true)
      applyMerge(event.data.payload, event.origin)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [applyMerge])

  const mergeFromRelay = (exportUrl, popupName, blockedHint) => {
    setStatus({ type: '', text: 'Opening export window… allow popups if blocked.' })
    mergePendingRef.current = true
    setMerging(true)
    popupRef.current = window.open(exportUrl, popupName, 'width=480,height=320')
    if (!popupRef.current) {
      mergePendingRef.current = false
      setMerging(false)
      setStatus({ type: 'error', text: blockedHint })
    } else {
      setTimeout(() => {
        if (mergePendingRef.current && popupRef.current?.closed) {
          mergePendingRef.current = false
          setMerging(false)
          setStatus({
            type: 'error',
            text: 'Export window closed — start the other server once, or use Merge from backup file.',
          })
        }
      }, 12000)
    }
  }

  const mergeFrom5174 = () =>
    mergeFromRelay(
      `${window.location.protocol}//${window.location.hostname}:5174/port-bank-export.html?relay=1`,
      'testvantage-export-5174',
      'Popup blocked. Open http://localhost:5174/port-bank-export.html?relay=1 while this page stays open.',
    )

  const mergeFromLocalhost = () => {
    setStatus({ type: '', text: 'Opening localhost to copy your bank…' })
    navigateCopyBankFromLocalhost('/merge-banks')
  }

  const handleFile = (f) => {
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => {
      setMerging(true)
      try {
        applyMerge(JSON.parse(String(reader.result)), f.name)
      } catch (e) {
        setMerging(false)
        setStatus({ type: 'error', text: e instanceof Error ? e.message : 'Invalid JSON' })
      }
    }
    reader.readAsText(f)
  }

  return (
    <div className="card bank-panel" style={{ maxWidth: 640, margin: '0 auto 2rem' }}>
      <h2>Merge question banks</h2>
      <p className="form-hint">
        This page uses <strong>{window.location.origin}</strong>. You have{' '}
        <strong>{localCount}</strong> question(s) here.
      </p>
      <p className="form-hint">
        <code>localhost:5173</code> and <code>127.0.0.1:5173</code> are <strong>different</strong>{' '}
        browser storage. If questions are missing after switching URL, merge from localhost below.
      </p>

      {status.text && (
        <p className={status.type === 'error' ? 'parse-status partial' : 'parse-status complete'}>
          {status.text}
        </p>
      )}

      <div className="extract-actions" style={{ marginTop: '1rem' }}>
        <button type="button" className="btn btn-primary" disabled={merging} onClick={mergeFromLocalhost}>
          Copy from localhost:5173
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={merging}
          onClick={() =>
            mergeFromRelay(
              'http://localhost:5173/export-bank?relay=1',
              'testvantage-export-localhost',
              'Popup blocked. Use Copy from localhost instead.',
            )
          }
        >
          Merge via popup
        </button>
        <button type="button" className="btn btn-ghost" disabled={merging} onClick={mergeFrom5174}>
          Merge from port 5174
        </button>
        <label className="btn btn-ghost file-btn">
          Merge from backup file
          <input
            type="file"
            accept=".json,application/json"
            hidden
            disabled={merging}
            onChange={(e) => {
              handleFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
        <Link to="/question-bank" className="btn btn-ghost">
          Question Bank
        </Link>
      </div>

      <details className="form-hint" style={{ marginTop: '1.25rem' }}>
        <summary>Manual steps</summary>
        <ol>
          <li>
            On{' '}
            <a href="http://localhost:5174/port-bank-export.html">localhost:5174/port-bank-export.html</a>
            , download
            backup (or use relay button above).
          </li>
          <li>On this page, choose <strong>Merge from backup file</strong>.</li>
          <li>Use only <a href="http://localhost:5173/question-bank">localhost:5173</a> afterward.</li>
        </ol>
      </details>
    </div>
  )
}
