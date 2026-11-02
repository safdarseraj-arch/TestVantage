/**
 * Thin first paint for Question Bank. The heavy compose/upload file loads after
 * this page is already on screen, so Loading Question Bank can finish.
 */

import { useEffect, useState } from 'react'

export default function QuestionBankRoute() {
  const [Page, setPage] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    let loaded = false
    const timer = setTimeout(() => {
      if (!cancelled && !loaded) {
        setError('Question Bank took too long to open.')
      }
    }, 12_000)
    import('./QuestionBank.jsx')
      .then((mod) => {
        if (cancelled) return
        loaded = true
        clearTimeout(timer)
        setError('')
        setPage(() => mod.default)
      })
      .catch((err) => {
        if (cancelled) return
        loaded = true
        clearTimeout(timer)
        setError(err instanceof Error ? err.message : 'Could not load — retry')
      })
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  if (error && !Page) {
    return (
      <div className="page boot-error-page">
        <h1>Could not load — retry</h1>
        <p className="form-hint">
          <strong>Question Bank</strong> did not open. Press <strong>F5</strong> or use Retry.
        </p>
        <pre className="boot-error-pre">{error}</pre>
        <p>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            Retry
          </button>
        </p>
      </div>
    )
  }

  if (!Page) {
    return (
      <div className="page route-loading">
        <h2 style={{ margin: 0, color: 'var(--text-h, #0f172a)' }}>Question Bank</h2>
        <p className="form-hint">Opening saved questions…</p>
      </div>
    )
  }

  return <Page />
}
