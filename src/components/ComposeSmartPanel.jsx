import { useState } from 'react'
import { COMPOSE_SHORTCUTS } from '../utils/composeSmartAssist.js'

/**
 * Smart Compose tools: soft validation, similarity warning, AI assist, shortcuts.
 *
 * @param {{
 *   softIssues: { blockers: string[], warnings: string[], ready: boolean }
 *   similarWarning?: string
 *   assistBusy?: boolean
 *   assistBadge?: string
 *   disabled?: boolean
 *   onImproveStem: () => void
 *   onSuggestLatex: () => void
 *   onPolishOptions: () => void
 *   showPolishOptions?: boolean
 * }} props
 */
export default function ComposeSmartPanel({
  softIssues,
  similarWarning = '',
  assistBusy = false,
  assistBadge = '',
  disabled = false,
  onImproveStem,
  onSuggestLatex,
  onPolishOptions,
  showPolishOptions = true,
}) {
  const [legendOpen, setLegendOpen] = useState(false)
  const { blockers = [], warnings = [], ready } = softIssues ?? {
    blockers: [],
    warnings: [],
    ready: false,
  }

  return (
    <div className="compose-smart-panel" aria-label="Smart Compose tools">
      <div className="compose-smart-panel-head">
        <div>
          <h4 className="compose-smart-title">Smart Compose</h4>
          <p className="form-hint compose-smart-sub">
            Live checks · math assist · tags stay after Save — never blocks Save when you are ready.
          </p>
        </div>
        <span
          className={`compose-ready-chip ${ready ? 'is-ready' : 'is-blocked'}`}
          title={ready ? 'Looks ready to save' : 'Fix the items listed below'}
        >
          {ready ? 'Ready' : 'Needs attention'}
        </span>
      </div>

      {(blockers.length > 0 || warnings.length > 0) && (
        <ul className="compose-soft-list">
          {blockers.map((msg) => (
            <li key={`b-${msg}`} className="compose-soft-blocker">
              {msg}
            </li>
          ))}
          {warnings.map((msg) => (
            <li key={`w-${msg}`} className="compose-soft-warn">
              {msg}
            </li>
          ))}
        </ul>
      )}

      {similarWarning ? (
        <p className="compose-similar-warn" role="status">
          {similarWarning}
        </p>
      ) : null}

      <div className="compose-assist-row" role="group" aria-label="AI assist">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={disabled || assistBusy}
          onClick={onImproveStem}
          title="Tidy spacing and math formatting (Cloud when available, else local)"
        >
          Improve / format stem
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={disabled || assistBusy}
          onClick={onSuggestLatex}
          title="Convert symbols toward LaTeX $…$"
        >
          Suggest LaTeX
        </button>
        {showPolishOptions ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={disabled || assistBusy}
            onClick={onPolishOptions}
            title="Polish option A–D text"
          >
            Polish options
          </button>
        ) : null}
        {assistBusy ? (
          <span className="form-hint">Working…</span>
        ) : assistBadge ? (
          <span className="compose-assist-badge">{assistBadge}</span>
        ) : null}
      </div>

      <details
        className="compose-shortcut-legend"
        open={legendOpen}
        onToggle={(e) => setLegendOpen(e.currentTarget.open)}
      >
        <summary>Shortcut keys</summary>
        <ul className="compose-shortcut-list">
          {COMPOSE_SHORTCUTS.map((row) => (
            <li key={row.keys}>
              <kbd>{row.keys}</kbd>
              <span>{row.action}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
