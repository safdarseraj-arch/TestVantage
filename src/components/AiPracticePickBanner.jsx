/**
 * Shows AI practice pick preview before starting a session.
 * @param {{ report: { aiScore?: number, summary?: string, masteryAware?: boolean, toughnessTarget?: number, pyqMix?: { pyqSummary?: string } } | null }} props
 */
export default function AiPracticePickBanner({ report }) {
  if (!report) return null

  const score = report.aiScore ?? 0
  const tone = score >= 70 ? 'ok' : score >= 50 ? 'warn' : 'bad'

  return (
    <div className={`ai-upload-assist ai-upload-assist--${tone} ai-practice-pick`}>
      <div className="ai-upload-assist-head">
        <div>
          <strong>AI Practice Pick</strong>
          <span className="ai-upload-assist-score">{score}/100</span>
        </div>
        {report.masteryAware && <span className="ai-tune-badge">Weak-topic smart</span>}
      </div>
      {report.summary && <p className="form-hint ai-upload-assist-summary">{report.summary}</p>}
      {report.pyqMix?.pyqSummary && report.pyqMix.pyqAvailable > 0 && (
        <p className="form-hint ai-pyq-mix-note">{report.pyqMix.pyqSummary}</p>
      )}
      <p className="form-hint">
        Toughness target ~{report.toughnessTarget ?? 5}/10 · mixed chapters · exam-ready questions only
      </p>
    </div>
  )
}
