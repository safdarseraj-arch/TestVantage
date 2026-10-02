import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  SIMILAR_FROM_PYQ_COUNTS,
  SIMILAR_FROM_PYQ_DEFAULT_COUNT,
} from '../utils/geminiScqTrial.js'
import { AI_SIMILAR_SOURCE } from '../utils/pyqDetect.js'
import { canSeedSimilarFromQuestion } from '../utils/pyqDetect.js'
import {
  queueCloneScaled,
  similarClonePayloadFromSeed,
  HYBRID_AI_ROUTE,
} from '../utils/hybridAiClient.js'

/**
 * SECONDARY: queue 3 or 5 similar clones from one question via Hybrid AI.
 * @param {{
 *   seed: import('../data/tests').Question | null
 *   paper?: object
 *   bankQuestions?: import('../data/tests').Question[]
 *   compact?: boolean
 *   onSaved?: () => void
 * }} props
 */
export default function PyqMakeSimilarPanel({
  seed,
  paper: _paper = {},
  bankQuestions: _bankQuestions = [],
  compact = false,
  onSaved,
}) {
  const [count, setCount] = useState(SIMILAR_FROM_PYQ_DEFAULT_COUNT)
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState('')

  if (!seed || !canSeedSimilarFromQuestion(seed)) return null

  const onGenerate = async () => {
    setBusy(true)
    setLog(`Queuing Hybrid AI for ${count} similar clone(s)…`)
    try {
      const payload = similarClonePayloadFromSeed(seed, { count, difficultyOffset: 1 })
      const data = await queueCloneScaled(payload)
      const batchId = data.batch_id ? ` (batch ${data.batch_id})` : ''
      setLog(
        `Hybrid AI queued ${count} ${AI_SIMILAR_SOURCE} clone job(s)${batchId}. Clones save to the AI bank when the job finishes — review before students see them. Parent: ${seed.id}.`,
      )
      onSaved?.()
    } catch (e) {
      setLog(e instanceof Error ? e.message : 'Similar generate failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`pyq-make-similar-inline${compact ? ' compact' : ''}`}>
      {!compact && (
        <p className="form-hint cc-sub">
          Optional: single-question similar (smaller action). For full papers use{' '}
          <strong>Create replica papers (Hybrid AI)</strong> above, or open{' '}
          <Link to={HYBRID_AI_ROUTE}>Hybrid AI</Link>.
        </p>
      )}
      <div className="pyq-make-similar-actions">
        <select
          value={String(count)}
          disabled={busy}
          onChange={(e) => setCount(Number(e.target.value))}
          aria-label="How many similar questions"
        >
          {SIMILAR_FROM_PYQ_COUNTS.map((n) => (
            <option key={n} value={String(n)}>
              {n} similar
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onGenerate}>
          {busy ? 'Queuing…' : `Make ${count} similar (Hybrid AI)`}
        </button>
      </div>
      {log ? <p className="form-hint">{log}</p> : null}
      {!compact && (
        <p className="form-hint cc-sub">
          Uses <code>/api/questions/clone-scaled</code> with parent id{' '}
          <strong>{seed.id}</strong>. Also see{' '}
          <Link to="/question-bank/review">Review and publish</Link>.
        </p>
      )}
    </div>
  )
}
