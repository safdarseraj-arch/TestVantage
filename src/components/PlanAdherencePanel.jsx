import { useMemo } from 'react'
import { getSubjectsForPattern } from '../data/subjects.js'
import { buildPlanAdherence } from '../utils/examStrategyPlan.js'

function subjectLabel(id, subjects) {
  return subjects.find((s) => s.id === id)?.label || id
}

/**
 * Post-result Plan Adherence % vs locked pre-test strategy.
 */
export default function PlanAdherencePanel({
  plan,
  result,
  questionTimes,
  sessionTelemetry,
  examPatternId,
}) {
  const subjects = useMemo(() => getSubjectsForPattern(examPatternId), [examPatternId])
  const adherence = useMemo(
    () =>
      buildPlanAdherence({
        plan,
        result,
        questionTimes,
        sessionTelemetry,
        examPatternId,
      }),
    [plan, result, questionTimes, sessionTelemetry, examPatternId],
  )

  return (
    <section className="card si-plan-adhere" aria-label="Plan adherence">
      <div className="si-plan-adhere-head">
        <div>
          <p className="si-weak-eyebrow">Strategy check</p>
          <h2>Plan adherence</h2>
          <p className="form-hint">
            How closely you followed the subject order and time plan locked before the test.
          </p>
        </div>
        {adherence.pct != null && (
          <div className="si-plan-adhere-score">
            <strong>{adherence.pct}%</strong>
            <span>Adherence</span>
          </div>
        )}
      </div>

      {!adherence.ready ? (
        <p className="form-hint">{adherence.takeaway}</p>
      ) : (
        <>
          <div className="si-plan-compare">
            <div>
              <h3>Planned order</h3>
              <ol>
                {adherence.plannedOrder.map((id) => (
                  <li key={`p-${id}`}>
                    {subjectLabel(id, subjects)}
                    <em>{adherence.plannedMinutes[id] ?? 0} min</em>
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <h3>Actual path</h3>
              <ol>
                {(adherence.actualOrder.length
                  ? adherence.actualOrder
                  : ['—']
                ).map((id, i) => (
                  <li key={`a-${id}-${i}`}>
                    {id === '—' ? '—' : subjectLabel(id, subjects)}
                    {id !== '—' && <em>{adherence.actualMinutes[id] ?? 0} min</em>}
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <div className="si-plan-kpis">
            {adherence.order?.pct != null && (
              <div>
                <strong>{adherence.order.pct}%</strong>
                <span>Order match</span>
              </div>
            )}
            {adherence.time?.pct != null && (
              <div>
                <strong>{adherence.time.pct}%</strong>
                <span>Time mix</span>
              </div>
            )}
          </div>
          <p className="aqm-takeaway">{adherence.takeaway}</p>
        </>
      )}
    </section>
  )
}
