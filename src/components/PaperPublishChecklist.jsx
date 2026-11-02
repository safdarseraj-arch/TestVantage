import {
  buildCalibratedPublishChecklist,
  buildPublishChecklist,
  computeCalibratedPaperQualityScore,
  computePaperQualityScore,
  qualityScoreLabel,
  validateCalibratedPaperForPublish,
  validatePaperForPublish,
} from '../utils/paperPublish.js'

/**
 * Pre-publish review panel (Test Quality Score).
 * @param {{
 *   questions: import('../data/tests').Question[]
 *   slots?: import('../data/examPatterns').QuestionTypeSlot[]
 *   strict?: boolean
 *   calibrated?: boolean
 *   calibratedDraft?: import('../data/tests').Test | null
 *   targetTotal?: number
 * }}
 */
export default function PaperPublishChecklist({
  questions,
  slots = [],
  strict = true,
  calibrated = false,
  calibratedDraft = null,
  targetTotal = 0,
}) {
  if (calibrated && calibratedDraft) {
    const result = validateCalibratedPaperForPublish(calibratedDraft, { targetTotal })
    const score = computeCalibratedPaperQualityScore(calibratedDraft, { targetTotal })
    const ql = qualityScoreLabel(score)
    const items = buildCalibratedPublishChecklist(result, score)

    return (
      <div className={`paper-publish-checklist paper-publish-checklist--${ql.tone}`}>
        <div className="paper-publish-score">
          <span className="paper-publish-score-num">{score}</span>
          <div>
            <strong>Test Quality Score</strong>
            <p className="form-hint">{ql.label} — aim for 75+ before publishing to students.</p>
          </div>
        </div>
        <ul className="paper-publish-items">
          {items.map((item) => (
            <li key={item.id} className={item.ok ? 'ok' : 'fail'}>
              <span aria-hidden="true">{item.ok ? '✓' : '✗'}</span>
              {item.label}
            </li>
          ))}
        </ul>
        {!result.ok && result.problems.length > 0 && (
          <div className="paper-publish-fix-list">
            <strong>Fix before publish:</strong>
            <ul>
              {result.problems.slice(0, 6).map((p) => (
                <li key={`${p.id ?? 'x'}-${p.index}`}>
                  {p.index > 0 ? `Q${p.index}: ` : ''}
                  {p.issues[0]?.message ?? 'Incomplete'}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  const result = validatePaperForPublish(questions, { slots, strictKeys: strict })
  const score = computePaperQualityScore(questions, slots)
  const ql = qualityScoreLabel(score)
  const items = buildPublishChecklist(result, score)

  return (
    <div className={`paper-publish-checklist paper-publish-checklist--${ql.tone}`}>
      <div className="paper-publish-score">
        <span className="paper-publish-score-num">{score}</span>
        <div>
          <strong>Test Quality Score</strong>
          <p className="form-hint">{ql.label} — aim for 75+ before publishing to students.</p>
        </div>
      </div>
      <ul className="paper-publish-items">
        {items.map((item) => (
          <li key={item.id} className={item.ok ? 'ok' : 'fail'}>
            <span aria-hidden="true">{item.ok ? '✓' : '✗'}</span>
            {item.label}
          </li>
        ))}
      </ul>
      {!result.ok && result.problems.length > 0 && (
        <div className="paper-publish-fix-list">
          <strong>Fix before publish:</strong>
          <ul>
            {result.problems.slice(0, 6).map((p) => (
              <li key={`${p.id ?? 'x'}-${p.index}`}>
                {p.index > 0 ? `Q${p.index}: ` : ''}
                {p.issues[0]?.message ?? 'Incomplete'}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
