import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { downloadFullBankBackup } from '../utils/csvQuestions'
import { loadQuestionBank } from '../utils/questionBank'

const RELAY_TARGETS = ['http://localhost:5173', 'http://127.0.0.1:5173']

/**
 * Open from the merge wizard on :5173 with ?relay=1 to post the bank back to the opener.
 * Without relay, downloads a JSON backup file.
 */
export default function ExportBankRelay() {
  const [params] = useSearchParams()
  const relay = params.get('relay') === '1'
  const [status, setStatus] = useState('Preparing export…')

  useEffect(() => {
    const bank = loadQuestionBank()
    const count = bank.questions?.length ?? 0
    if (relay) {
      const recipients = [window.opener, window.parent !== window ? window.parent : null].filter(
        Boolean,
      )
      let sent = false
      for (const recipient of recipients) {
        for (const target of RELAY_TARGETS) {
          try {
            recipient.postMessage({ type: 'testvantage-bank-merge', payload: bank }, target)
            sent = true
            setStatus(`Sent ${count} question(s) to ${target}. This tab can close.`)
            setTimeout(() => window.close(), 800)
            break
          } catch {
            /* try next origin */
          }
        }
        if (sent) break
      }
      if (sent) return
      setStatus(
        'Could not reach Question Bank on port 5173. Open http://localhost:5173/merge-banks first, then try again.',
      )
      return
    }

    downloadFullBankBackup(bank)
    setStatus(
      count
        ? `Downloaded backup (${count} questions). Open http://localhost:5173/merge-banks and use Merge backup.`
        : 'No questions saved on this port.',
    )
  }, [relay])

  return (
    <div className="card" style={{ maxWidth: 520, margin: '2rem auto', padding: '1.5rem' }}>
      <h2>Export question bank</h2>
      <p className="form-hint">{status}</p>
      <p className="form-hint">
        Port: <strong>{window.location.port || 'default'}</strong> — storage is separate from other
        localhost ports.
      </p>
      <Link to="/question-bank" className="btn btn-ghost btn-sm">
        Back to Question Bank
      </Link>
    </div>
  )
}
