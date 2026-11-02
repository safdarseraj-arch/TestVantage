import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  SIMILAR_FROM_PYQ_COUNTS,
  SIMILAR_FROM_PYQ_DEFAULT_COUNT,
} from '../utils/geminiScqTrial.js'
import { canSeedSimilarFromQuestion } from '../utils/pyqDetect.js'
import { HYBRID_AI_ROUTE } from '../utils/hybridAiClient.js'
import { CloneModalTrigger } from './CloneModal.jsx'

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
  const [log, setLog] = useState('')

  if (!seed || !canSeedSimilarFromQuestion(seed)) return null

  return (
    <div className={`pyq-make-similar-inline${compact ? ' compact' : ''}`}>
      {!compact && (
        <p className="form-hint cc-sub">
          Optional: single-question similar (smaller action). For full papers use{' '}
          <strong>Create replica papers (Hybrid AI)</strong> above, or open{' '}
          <Link to={HYBRID_AI_ROUTE}>Hybrid AI</Link>.
        </p>
      )}
      <CloneModalTrigger
        seed={seed}
        count={count}
        onCountChange={setCount}
        countOptions={SIMILAR_FROM_PYQ_COUNTS}
        compact={compact}
        onSaved={() => {
          setLog(
            `Hybrid AI queued ${count} similar clone(s). Clones save to the AI bank when the job finishes — review before students see them. Parent: ${seed.id}.`,
          )
          onSaved?.()
        }}
      />
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
