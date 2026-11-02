function formatTypeCountsLite(typeCounts, fallback) {
  if (fallback) return fallback
  const entries = Object.entries(typeCounts || {}).filter(([, n]) => n > 0)
  if (!entries.length) return '—'
  return entries.map(([id, n]) => `${n} ${String(id).replace(/_/g, ' ')}`).join(', ')
}

/**
 * Verify table: PDF/OCR markers vs LaTeX vs split cards.
 * @param {{ report: object | null, compact?: boolean }} props
 */
export default function ExtractionSummaryTable({ report, compact = false }) {
  if (!report) return null
  const rows = [
    {
      layer: 'PDF / scan (OCR markers)',
      questions: report.pdf.questionCount,
      types: '—',
      figures: report.pdf.figureQuestions,
      extra: report.pdf.instructionBlocks
        ? `${report.pdf.instructionBlocks} instruction block(s) in text`
        : 'Instructions excluded from count',
      status:
        report.split.questionCount > 0 && Math.abs(report.pdf.questionCount - report.split.questionCount) <= 2
          ? 'ok'
          : report.pdf.questionCount > 0
            ? 'warn'
            : 'bad',
    },
    {
      layer: 'Stored LaTeX (Mathpix OCR)',
      questions: `${report.latex.questionCount} (${report.latex.markers} markers)`,
      types: '—',
      figures: report.latex.figureQuestions,
      extra: report.latex.errors
        ? `${report.latex.errors} OCR warning(s) · ${report.latex.charCount.toLocaleString()} chars`
        : `${report.latex.charCount.toLocaleString()} chars`,
      status: report.latex.errors ? 'warn' : 'ok',
    },
    {
      layer: 'Split cards (verify here)',
      questions: report.split.questionCount,
      types: formatTypeCountsLite(report.split.typeCounts, report.split.typeSummary),
      figures: report.split.figureQuestions,
      extra: `${report.split.correct} OK · ${report.split.partial} partial · ${report.split.incorrect} need fix${
        report.split.instructionsFiltered ? ` · ${report.split.instructionsFiltered} instructions dropped` : ''
      }`,
      status: report.split.matchExpected && report.split.incorrect === 0 ? 'ok' : report.split.incorrect ? 'bad' : 'warn',
    },
  ]

  return (
    <div className={`extraction-summary-table-wrap${compact ? ' extraction-summary-compact' : ''}`}>
      <h4 className="extraction-summary-title">
        Extraction summary
        {report.expected ? (
          <span className="extraction-summary-expected"> — detected ~{report.expected} questions in this file</span>
        ) : null}
      </h4>
      <table className="extraction-summary-table">
        <thead>
          <tr>
            <th>Layer</th>
            <th>Questions</th>
            {!compact && <th>Types</th>}
            <th>Figures / graphs</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.layer} className={`extraction-row extraction-row-${row.status}`}>
              <td>{row.layer}</td>
              <td>{row.questions}</td>
              {!compact && <td>{row.types}</td>}
              <td>{row.figures || '—'}</td>
              <td>{row.extra}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {report.split.matchExpected ? (
        <p className="form-hint extraction-summary-hint ok">
          Split count matches detected paper size. Review cards below, then approve.
        </p>
      ) : (
        <p className="form-hint extraction-summary-hint warn">
          Split has {report.split.questionCount} card(s) but the catalog expects ~
          {report.expected || report.pdf.questionCount}.
          {Number(report.latex?.charCount) > 0
            ? ' Use Re-parse stored OCR only if this same paper still has saved text.'
            : ' There is no stored OCR on this row — Re-parse cannot invent questions.'}
        </p>
      )}
    </div>
  )
}
