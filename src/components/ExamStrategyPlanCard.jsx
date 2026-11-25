import { useMemo, useState } from 'react'
import { getSubjectsForPattern } from '../data/subjects.js'
import {
  defaultExamStrategyPlan,
  saveExamStrategyPlan,
} from '../utils/examStrategyPlan.js'

/**
 * Light pre-test strategy lock-in: subject order + minute plan.
 */
export default function ExamStrategyPlanCard({
  testId,
  examPatternId,
  paperMinutes = 180,
  ownerKey = 'guest',
  initialPlan = null,
}) {
  const subjects = useMemo(() => getSubjectsForPattern(examPatternId), [examPatternId])
  const seed = useMemo(
    () => initialPlan || defaultExamStrategyPlan(examPatternId, paperMinutes),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once from props
    [examPatternId, paperMinutes, testId],
  )

  const [order, setOrder] = useState(() => [...(seed.subjectOrder || subjects.map((s) => s.id))])
  const [minutes, setMinutes] = useState(() => ({ ...(seed.minutesBySubject || {}) }))
  const [locked, setLocked] = useState(Boolean(initialPlan?.lockedAt))
  const [msg, setMsg] = useState('')

  const labelFor = (id) => subjects.find((s) => s.id === id)?.label || id

  const move = (index, dir) => {
    if (locked) return
    const next = [...order]
    const j = index + dir
    if (j < 0 || j >= next.length) return
    ;[next[index], next[j]] = [next[j], next[index]]
    setOrder(next)
  }

  const setMins = (id, value) => {
    if (locked) return
    const n = Math.max(0, Math.min(Number(paperMinutes) || 180, Number(value) || 0))
    setMinutes((prev) => ({ ...prev, [id]: n }))
  }

  const totalMins = order.reduce((s, id) => s + (Number(minutes[id]) || 0), 0)

  const onLock = () => {
    const plan = {
      subjectOrder: order,
      minutesBySubject: { ...minutes },
      lockedAt: Date.now(),
      paperMinutes: Number(paperMinutes) || 180,
    }
    saveExamStrategyPlan(testId, plan, ownerKey)
    setLocked(true)
    setMsg('Plan locked for this attempt. After submit, Result will show Plan Adherence %.')
  }

  const onUnlock = () => {
    setLocked(false)
    setMsg('Edit freely, then lock again before you begin.')
  }

  if (!subjects.length) return null

  return (
    <section className="card exam-strategy-plan" aria-label="Pre-test strategy plan">
      <div className="exam-strategy-head">
        <div>
          <p className="si-weak-eyebrow">Before you start</p>
          <h2>Lock your exam plan</h2>
          <p className="form-hint">
            Choose subject order and rough minutes. We compare this to how you actually moved after
            submit (Plan Adherence %).
          </p>
        </div>
        {locked && <span className="badge badge-pro">Locked</span>}
      </div>

      <ol className="exam-strategy-order">
        {order.map((id, i) => (
          <li key={id}>
            <span className="exam-strategy-rank">{i + 1}</span>
            <strong>{labelFor(id)}</strong>
            <label className="exam-strategy-mins">
              <span>min</span>
              <input
                type="number"
                min={0}
                max={paperMinutes}
                value={minutes[id] ?? 0}
                disabled={locked}
                onChange={(e) => setMins(id, e.target.value)}
              />
            </label>
            <div className="exam-strategy-move">
              <button type="button" className="btn btn-ghost btn-sm" disabled={locked || i === 0} onClick={() => move(i, -1)}>
                ↑
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={locked || i === order.length - 1}
                onClick={() => move(i, 1)}
              >
                ↓
              </button>
            </div>
          </li>
        ))}
      </ol>

      <p className={`form-hint${totalMins > paperMinutes ? ' text-wrong' : ''}`}>
        Planned minutes: <strong>{totalMins}</strong> / {paperMinutes}
        {totalMins > paperMinutes ? ' — trim a little so the plan fits the paper.' : ''}
      </p>

      <div className="exam-strategy-actions">
        {!locked ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={onLock}>
            Lock plan for this attempt
          </button>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onUnlock}>
            Edit plan
          </button>
        )}
      </div>
      {msg && (
        <p className="form-hint" role="status">
          {msg}
        </p>
      )}
    </section>
  )
}
