import MathText from './MathText'

/**
 * @param {object} props
 * @param {'bulk' | 'single'} [props.mode]
 * @param {string} [props.questionLabel] — e.g. Q1 for single-question mode
 */
export default function PyqLatexReview({
  fileName = 'upload',
  latexText,
  onLatexChange,
  onApplyPolish,
  onReRunOcr,
  onSplit,
  onDiscard,
  mode = 'bulk',
  questionLabel = '',
}) {
  const charCount = latexText?.length ?? 0
  const lineCount = latexText ? latexText.split('\n').length : 0
  const isSingle = mode === 'single'
  const step2 = isSingle ? 'Parse question' : 'Split questions'
  const primaryLabel = isSingle ? 'Parse question →' : 'Split into questions →'

  return (
    <div className="card bulk-preview-panel pyq-latex-review">
      <div className="pyq-step-header">
        <span className="pyq-step-badge active">Step 1</span>
        <h3>
          Review LaTeX / OCR text
          {questionLabel ? ` — ${questionLabel}` : ''}
        </h3>
        <span className="pyq-step-badge muted">Step 2 — {step2}</span>
      </div>
      <p className="form-hint">
        {isSingle ? (
          <>
            From <strong>{fileName}</strong>. Fix symbols and <code>$…$</code> math, check options
            (A)–(D), then click <strong>Parse question</strong>.
          </>
        ) : (
          <>
            From <strong>{fileName}</strong>. Fix symbols, add missing <code>$…$</code> math, and
            check question numbers (e.g. <code>Q.3</code>, <code>1.</code>). When it looks right,
            click <strong>Split into questions</strong>.
          </>
        )}
      </p>

      <div className="latex-dual-edit latex-dual-edit-large pyq-latex-dual">
        <div className="latex-dual-edit-source">
          <label className="latex-dual-preview-label" htmlFor="pyq-latex-source">
            LaTeX source (editable)
          </label>
          <textarea
            id="pyq-latex-source"
            className="extract-raw latex-dual-textarea"
            rows={14}
            value={latexText}
            onChange={(e) => onLatexChange(e.target.value)}
            placeholder="OCR LaTeX will appear here…"
            spellCheck={false}
          />
          <p className="form-hint pyq-latex-meta">
            {charCount.toLocaleString()} characters · {lineCount} lines
          </p>
        </div>
        <div>
          <span className="latex-dual-preview-label">Rendered preview</span>
          <div className="latex-dual-edit-preview pyq-latex-render">
            {latexText?.trim() ? (
              <MathText text={latexText} />
            ) : (
              <p className="form-hint">Preview appears here as you edit.</p>
            )}
          </div>
        </div>
      </div>

      <div className="extract-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!latexText?.trim()}
          onClick={onSplit}
        >
          {primaryLabel}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!latexText?.trim()}
          onClick={onApplyPolish}
        >
          Re-apply OCR polish
        </button>
        {onReRunOcr && (
          <button type="button" className="btn btn-ghost" onClick={onReRunOcr}>
            Re-run LaTeX OCR
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={onDiscard}>
          Discard
        </button>
      </div>
    </div>
  )
}
