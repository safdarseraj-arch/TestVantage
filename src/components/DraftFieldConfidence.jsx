import {
  compactConfidenceBadge,
  formatEverydayConfidenceLabel,
  knownConfidenceScore,
  resolveQuestionFieldConfidence,
} from '../utils/uploadFieldConfidence.js'

const BREAKDOWN_FIELDS = ['stem', 'options', 'answer', 'solution', 'meta']

/**
 * @param {number | null | undefined} n
 */
function toneClass(n) {
  if (n == null) return 'is-unknown'
  if (n < 55) return 'is-low'
  if (n < 75) return 'is-mid'
  return 'is-ok'
}

/**
 * Confidence % for draft questions (and teacher bank). Everyday labels, not jargon.
 *
 * @param {{
 *   question?: object | null
 *   fieldConfidence?: object | null
 *   variant?: 'compact' | 'breakdown'
 *   alwaysShow?: boolean
 *   showUnknown?: boolean
 * }} props
 */
export default function DraftFieldConfidence({
  question = null,
  fieldConfidence = null,
  variant = 'compact',
  alwaysShow = false,
  showUnknown = true,
}) {
  const resolved = resolveQuestionFieldConfidence({
    ...(question && typeof question === 'object' ? question : {}),
    ...(fieldConfidence && typeof fieldConfidence === 'object'
      ? {
          fieldConfidence,
          uploadFieldConfidence: fieldConfidence.overall ?? question?.uploadFieldConfidence,
          answerConfidence: fieldConfidence.fields?.answer ?? question?.answerConfidence,
          solutionConfidence: fieldConfidence.fields?.solution ?? question?.solutionConfidence,
          generationConfidence: fieldConfidence.generation ?? question?.generationConfidence,
        }
      : {}),
  })

  const hasAny =
    resolved.overall != null ||
    resolved.generation != null ||
    Object.values(resolved.fields).some((n) => n != null)

  if (!hasAny && !alwaysShow && !showUnknown) return null

  if (variant === 'compact') {
    const label = compactConfidenceBadge(resolved)
    const n =
      resolved.overall ??
      resolved.fields.stem ??
      resolved.fields.options ??
      resolved.fields.answer ??
      resolved.generation
    return (
      <span
        className={`draft-conf-badge draft-conf-badge--compact ${toneClass(n)}`}
        title="How sure the upload or generator was about this question. Not scored means no OCR or model score was stored."
      >
        {label}
      </span>
    )
  }

  const optionBits = (resolved.optionScores ?? [])
    .map((n, i) => {
      if (n == null) return null
      return `${String.fromCharCode(65 + i)} ${n}%`
    })
    .filter(Boolean)

  return (
    <div className="draft-conf-breakdown" aria-label="Confidence percentages">
      <span className="draft-conf-breakdown-title">Confidence</span>
      {BREAKDOWN_FIELDS.map((field) => {
        const n = resolved.fields[field]
        const core = field === 'stem' || field === 'options' || field === 'solution'
        if (n == null && field === 'meta') return null
        if (n == null && field === 'answer' && !alwaysShow && !showUnknown) return null
        if (n == null && !core && !alwaysShow) return null
        const extra =
          field === 'options' && optionBits.length ? ` (${optionBits.join(', ')})` : ''
        return (
          <span key={field} className={`draft-conf-badge ${toneClass(n)}`}>
            {formatEverydayConfidenceLabel(field, n)}
            {extra}
          </span>
        )
      })}
      {resolved.generation != null && resolved.overall !== resolved.generation ? (
        <span className={`draft-conf-badge ${toneClass(resolved.generation)}`}>
          {formatEverydayConfidenceLabel('generation', resolved.generation)}
        </span>
      ) : null}
    </div>
  )
}

/**
 * Single field % next to a form heading: "Question 72%" or "Question —".
 * @param {{ field: string, score?: unknown, alwaysShow?: boolean }} props
 */
export function FieldConfidenceInline({ field, score, alwaysShow = true }) {
  const n = knownConfidenceScore(score)
  if (n == null && !alwaysShow) return null
  return (
    <em
      className={`draft-conf-inline ${toneClass(n)}`}
      title={formatEverydayConfidenceLabel(field, n)}
    >
      {n == null ? '—' : `${n}%`}
    </em>
  )
}
