import MathText from './MathText.jsx'
import { answerSourceBadgeLabel, solutionBadgeLabel } from '../utils/answerProvenance.js'
import { formatFieldConfidenceHint } from '../utils/uploadFieldConfidence.js'
import { ocrEngineBadgeLabel } from '../utils/cloudVisionClient.js'

/**
 * Side-by-side original upload image vs parsed stem/options for review before save.
 * @param {{
 *   sourceUrl?: string | null
 *   stem?: string
 *   options?: string[]
 *   answerSource?: string
 *   solutionSource?: string
 *   ocrEngine?: string
 *   solution?: string
 *   correctIndex?: number
 *   correctIndices?: number[]
 *   fieldConfidence?: any
 *   regeneratingSolution?: boolean
 *   onStemChange?: (text: string) => void
 *   onOptionChange?: (index: number, text: string) => void
 *   onRegenerateSolution?: () => void
 * }} props
 */
export default function UploadReviewCompare({
  sourceUrl,
  stem = '',
  options = [],
  answerSource,
  solutionSource,
  ocrEngine,
  solution = '',
  correctIndex,
  correctIndices,
  fieldConfidence,
  regeneratingSolution = false,
  onStemChange,
  onOptionChange,
  onRegenerateSolution,
}) {
  if (!sourceUrl && !stem?.trim()) return null

  const low = new Set(fieldConfidence?.lowConfidenceFields ?? [])
  const answerLabel = (() => {
    if (correctIndices?.length) {
      return correctIndices.map((i) => String.fromCharCode(65 + i)).join(', ')
    }
    if (correctIndex != null) return String.fromCharCode(65 + correctIndex)
    return '—'
  })()

  return (
    <div className={`upload-review-compare ${sourceUrl ? 'has-source-image' : ''}`}>
      {sourceUrl && (
        <figure className="upload-review-source">
          <figcaption>Original upload</figcaption>
          <img src={sourceUrl} alt="Uploaded paper or photo" />
        </figure>
      )}
      <div className="upload-review-parsed">
        <div className="upload-review-head">
          <strong>Parsed question — fix before save</strong>
          <div className="upload-review-badges">
            {ocrEngine && (
              <span
                className={`upload-answer-badge upload-answer-badge--${
                  ocrEngine === 'cloud-vision' ? 'cloud' : 'local'
                }`}
                title="How the page was read"
              >
                {ocrEngineBadgeLabel(ocrEngine)}
              </span>
            )}
            {answerSource && answerSource !== 'unknown' && (
              <span
                className={`upload-answer-badge upload-answer-badge--${answerSource}`}
                title="Where the correct answer came from"
              >
                Answer: {answerSourceBadgeLabel(answerSource)}
              </span>
            )}
            {solutionSource && solutionSource !== 'unknown' && (
              <span
                className={`upload-answer-badge upload-answer-badge--${solutionSource}`}
                title="Where the solution text came from"
              >
                Solution: {solutionBadgeLabel(solutionSource)}
              </span>
            )}
            {fieldConfidence?.needsManualCheck && (
              <span className="upload-answer-badge upload-answer-badge--warn">
                Low confidence
              </span>
            )}
          </div>
        </div>
        {fieldConfidence?.needsManualCheck && (
          <p className="form-hint upload-review-hint">{formatFieldConfidenceHint(fieldConfidence)}</p>
        )}
        {fieldConfidence?.mathFidelityIssues?.length > 0 && (
          <p className="form-hint upload-review-math-warn" role="alert">
            Parsed math may not match the image — keep the original photo visible and fix the
            stem before saving.
          </p>
        )}
        <label className={`upload-review-field ${low.has('stem') ? 'is-low' : ''}`}>
          <span>
            Question text
            {fieldConfidence?.fields?.stem != null && (
              <em> {fieldConfidence.fields.stem}/100</em>
            )}
          </span>
          <textarea
            className="upload-review-stem"
            rows={4}
            value={stem}
            onChange={(e) => onStemChange?.(e.target.value)}
            spellCheck={false}
          />
        </label>
        <div className={`upload-review-options ${low.has('options') ? 'is-low' : ''}`}>
          <span className="upload-review-options-label">
            Options
            {fieldConfidence?.fields?.options != null && (
              <em> {fieldConfidence.fields.options}/100</em>
            )}
          </span>
          {(options.length ? options : ['', '', '', '']).slice(0, 6).map((opt, i) => (
            <label key={i} className="upload-review-option-row">
              <span>({String.fromCharCode(65 + i)})</span>
              <input
                type="text"
                value={opt}
                onChange={(e) => onOptionChange?.(i, e.target.value)}
              />
            </label>
          ))}
        </div>
        <p className={`upload-review-answer ${low.has('answer') ? 'is-low' : ''}`}>
          <strong>Correct:</strong> {answerLabel}
          {fieldConfidence?.fields?.answer != null && (
            <em> · {fieldConfidence.fields.answer}/100</em>
          )}
        </p>
        <div className={`upload-review-solution ${low.has('solution') ? 'is-low' : ''}`}>
          <div className="upload-review-solution-head">
            <strong>
              Solution
              {fieldConfidence?.fields?.solution != null && (
                <em> {fieldConfidence.fields.solution}/100</em>
              )}
            </strong>
            {onRegenerateSolution && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={regeneratingSolution || !stem?.trim()}
                onClick={onRegenerateSolution}
              >
                {regeneratingSolution ? 'Writing steps…' : 'Regenerate solution'}
              </button>
            )}
          </div>
          {solution?.trim() ? (
            <div className="upload-review-solution-body">
              <MathText text={solution} questionContext={stem} />
            </div>
          ) : (
            <p className="form-hint">
              No solution yet — click <strong>Regenerate solution</strong> for step-by-step (cloud
              when API key is set).
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
