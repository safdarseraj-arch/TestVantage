import {
  WRONG_REASON_TAGS,
  suggestWrongReasonFromAuto,
} from '../utils/wrongReasonTags.js'

/**
 * Easy chip picker: “Why I got it wrong” for a single wrong / partial question.
 * Soft-suggests from auto Error DNA; student pick is source of truth when saved.
 *
 * @param {{
 *   value?: string | null
 *   autoType?: string | null
 *   onChange: (tagId: string | null) => void
 *   compact?: boolean
 * }} props
 */
export default function WhyWrongTagPicker({
  value = null,
  autoType = null,
  onChange,
  compact = false,
}) {
  const suggested = value ? null : suggestWrongReasonFromAuto(autoType)

  return (
    <div className={`rqw-why ${compact ? 'rqw-why--compact' : ''}`}>
      <div className="rqw-why-head">
        <strong className="rqw-why-title">Why I got it wrong</strong>
        <span className="rqw-why-hint">
          {value
            ? 'Saved — tap another to change'
            : suggested
              ? 'Suggested from time pattern — tap to confirm or pick another'
              : 'Tap the reason that fits best'}
        </span>
      </div>
      <div className="rqw-why-chips" role="group" aria-label="Why I got it wrong">
        {WRONG_REASON_TAGS.map((tag) => {
          const selected = value === tag.id
          const soft = !value && suggested === tag.id
          return (
            <button
              key={tag.id}
              type="button"
              className={`rqw-why-chip${selected ? ' active' : ''}${soft ? ' suggested' : ''}`}
              title={tag.hint}
              aria-pressed={selected}
              onClick={() => onChange(selected ? null : tag.id)}
            >
              {tag.label}
              {soft && !selected ? <span className="rqw-why-soft">Suggested</span> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
