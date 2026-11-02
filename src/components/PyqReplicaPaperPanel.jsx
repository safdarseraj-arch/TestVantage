import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAllPyqQuestions } from '../data/pyqCatalog.js'
import { peekUploadedQuestions } from '../utils/questionBank.js'
import {
  REPLICA_PAPER_COUNTS,
  REPLICA_PAPER_DEFAULT_COUNT,
  canGenerateReplicaFromQuestion,
  parentPaperFromGroup,
  replicaPaperLabel,
  nextReplicaIndices,
} from '../utils/pyqReplicaPaper.js'
import { formatQuestionSourceText, queueCloneScaled, HYBRID_AI_ROUTE } from '../utils/hybridAiClient.js'
import { syncHybridAiAfterJob } from '../utils/hybridAiSync.js'
import CloneModal from './CloneModal.jsx'

/**
 * PRIMARY staff flow: Hybrid AI clone-scaled jobs for every question in a PYQ paper.
 * @param {{
 *   paperGroup: { paperId?: string, paperLabel?: string, examPatternId?: string, pyqYear?: number, pyqDate?: string, pyqShift?: number, pyqSession?: string, questions?: import('../data/tests').Question[] }
 *   onSaved?: () => void
 *   compact?: boolean
 * }} props
 */
export default function PyqReplicaPaperPanel({ paperGroup, onSaved, compact = false }) {
  const [replicaCount, setReplicaCount] = useState(REPLICA_PAPER_DEFAULT_COUNT)
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState([])
  const [cloneModalOpen, setCloneModalOpen] = useState(false)

  const parent = useMemo(() => parentPaperFromGroup(paperGroup ?? {}), [paperGroup])
  const officialSeeds = useMemo(
    () => (parent.questions ?? []).filter((q) => canGenerateReplicaFromQuestion(q)),
    [parent.questions],
  )
  const canRun = officialSeeds.length > 0 && parent.paperId

  const previewNames = useMemo(() => {
    const pool = [...getAllPyqQuestions(), ...peekUploadedQuestions()]
    const indices = parent.paperId
      ? nextReplicaIndices(parent.paperId, pool, replicaCount)
      : Array.from({ length: replicaCount }, (_, i) => i + 1)
    return indices.map((i) => replicaPaperLabel(parent, i))
  }, [parent, replicaCount])

  const appendLog = (line) => setLog((prev) => [...prev.slice(-80), line])

  const runReplicaJobs = async (templatePayload) => {
    if (!canRun || busy) return
    setBusy(true)
    setLog([])
    appendLog(
      `Queuing Hybrid AI for ${replicaCount} clone(s) per question (${officialSeeds.length} parents)…`,
    )

    let queued = 0
    let failed = 0
    const jobIds = []
    try {
      for (let i = 0; i < officialSeeds.length; i++) {
        const seed = officialSeeds[i]
        appendLog(`[${i + 1}/${officialSeeds.length}] ${seed.id} — clone-scaled ×${replicaCount}…`)
        try {
          const data = await queueCloneScaled({
            ...templatePayload,
            parent_question_id: String(seed.id),
            source_question_text: formatQuestionSourceText(seed),
            count: replicaCount,
            difficulty_offset: 1,
            parent_is_pyq: true,
          })
          if (data?.job_id || data?.batch_id) jobIds.push(data.job_id || data.batch_id)
          queued += 1
        } catch (e) {
          failed += 1
          appendLog(`  ERROR: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
      appendLog(
        `Done. Queued ${queued} parent job(s)${failed ? `, ${failed} failed` : ''}. Replica paper names (when synced): ${previewNames.join(', ')}.`,
      )
      appendLog('Clones land in similar_pyq / AI bank via Hybrid AI — review before publish.')
      void syncHybridAiAfterJob({ attempts: 30, intervalMs: 5000, jobIds })
      onSaved?.()
    } catch (e) {
      appendLog(e instanceof Error ? e.message : 'Replica generation failed.')
    } finally {
      setBusy(false)
      setCloneModalOpen(false)
    }
  }

  if (!paperGroup) return null

  return (
    <section className={`pyq-replica-panel${compact ? ' pyq-replica-panel-compact' : ''}`}>
      <h4>Create replica papers (Hybrid AI)</h4>
      <p className="form-hint">
        Hybrid AI writes <strong>full new papers</strong> in the spirit of{' '}
        <strong>{parent.paperLabel || parent.paperId}</strong> — one scaled-clone job per official
        question ({replicaCount} variants each). Drafts only. Labelled <strong>AI replica paper</strong>{' '}
        (not Official PYQ). More control: <Link to={HYBRID_AI_ROUTE}>Hybrid AI</Link>.
      </p>
      {!canRun ? (
        <p className="form-hint">
          Approve an official PYQ paper first (or pick a paper that has official questions in the
          bank).
        </p>
      ) : (
        <>
          <div className="pyq-replica-actions gemini-scq-trial-row">
            <label className="metadata-field">
              <span className="metadata-label">How many replica papers?</span>
              <select
                value={String(replicaCount)}
                disabled={busy}
                onChange={(e) => setReplicaCount(Number(e.target.value))}
              >
                {REPLICA_PAPER_COUNTS.map((n) => (
                  <option key={n} value={String(n)}>
                    {n} papers
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => setCloneModalOpen(true)}
            >
              {busy
                ? `Queuing clone jobs… (${officialSeeds.length} questions)`
                : `Create ${replicaCount} replica papers (Hybrid AI)…`}
            </button>
          </div>
          <CloneModal
            open={cloneModalOpen}
            onClose={() => !busy && setCloneModalOpen(false)}
            seed={officialSeeds[0] ?? null}
            count={replicaCount}
            onCountChange={setReplicaCount}
            countOptions={REPLICA_PAPER_COUNTS}
            title={`Replica paper clones (×${replicaCount} per question)`}
            submitLabel={`Queue ${officialSeeds.length} parent jobs`}
            onSubmitPayload={(payload) => runReplicaJobs(payload)}
          />
          <p className="form-hint">
            Names: {previewNames.join(', ')}. Each parent id gets up to {replicaCount} child ids via{' '}
            <code>clone-scaled</code>.
          </p>
          <p className="form-hint">
            After jobs finish, open{' '}
            <Link to="/question-bank/review">Review and publish</Link> — drafts stay hidden from
            students until you publish.
          </p>
        </>
      )}
      {log.length > 0 && (
        <pre className="pyq-replica-log form-hint" aria-live="polite">
          {log.join('\n')}
        </pre>
      )}
    </section>
  )
}
