import { Link } from 'react-router-dom'
import { savePracticePrefill } from '../utils/aiMastery.js'

/**
 * AI learning path panel — chapter strength + personalised next steps.
 * @param {{ studyPlan: ReturnType<import('../utils/aiMastery.js').buildAiStudyPlan> }} props
 */
export default function AiStudyPlanPanel({ studyPlan }) {
  if (!studyPlan) return null

  const { mastery, steps, summary } = studyPlan

  return (
    <section className="card si-study-plan">
      <div className="si-study-plan-head">
        <span className="ai-tune-badge">AI</span>
        <div>
          <h2>Your learning path</h2>
          <p className="form-hint">{summary.replace(/\*\*/g, '')}</p>
        </div>
        <div className="si-mastery-pill" title="Overall chapter strength">
          <strong>{mastery.overallMastery}%</strong>
          <span>strength</span>
        </div>
      </div>

      {mastery.weakCount > 0 && (
        <p className="si-study-plan-weak">
          {mastery.weakCount} chapter{mastery.weakCount === 1 ? '' : 's'} need focused practice
        </p>
      )}

      <div className="si-study-plan-steps">
        {steps.map((step) => (
          <Link
            key={`${step.title}-${step.chapter ?? ''}`}
            to={step.to}
            className="si-study-plan-step"
            onClick={() => {
              if (step.chapter || step.subject) {
                savePracticePrefill({
                  subjects: step.subject ? [step.subject] : [],
                  chapters: step.chapter ? [step.chapter] : [],
                })
              }
            }}
          >
            <span className="si-study-plan-icon" aria-hidden>
              {step.icon}
            </span>
            <div>
              <strong>{step.title}</strong>
              <p>{step.detail}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
