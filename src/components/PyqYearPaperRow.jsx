import { useMemo, useState } from 'react'
import { listPyqPapersForYear, yearWisePaperPickerHint } from '../utils/pyqYearPaperPick.js'

const AI_PICK = ''

/**
 * One year row — pick paper/date/shift or let AI choose, then start.
 * @param {{
 *   year: number
 *   examPatternId: string
 *   examLabel: string
 *   onStart: (opts: { year: number, paperId?: string }) => void
 *   onDownload: (opts: { year: number, paperId?: string }, title: string, subtitle: string) => void
 * }} props
 */
export default function PyqYearPaperRow({ year, examPatternId, examLabel, onStart, onDownload }) {
  const papers = useMemo(() => listPyqPapersForYear(examPatternId, year), [examPatternId, year])
  const [paperId, setPaperId] = useState(AI_PICK)

  const totalCount = papers.reduce((s, p) => s + p.count, 0)
  const selectedPaper = paperId ? papers.find((p) => p.paperId === paperId) : null
  const questionCount = selectedPaper?.count ?? totalCount
  const needsPicker = papers.length > 1

  const pickerLabel =
    examPatternId === 'jee-advanced'
      ? 'Paper'
      : examPatternId === 'jee-main'
        ? 'Date & shift'
        : 'Session'

  const startLabel = paperId
    ? `Start ${selectedPaper?.paperLabel ?? 'paper'} →`
    : needsPicker
      ? 'Start (AI picks paper) →'
      : 'Start year test →'

  return (
    <div className="pyq-year-card">
      <div className="pyq-year-card-head">
        <strong>{year}</strong>
        <span className="form-hint">
          {papers.length} paper{papers.length === 1 ? '' : 's'} · {totalCount} Q in bank
        </span>
      </div>

      {needsPicker && (
        <label className="pyq-year-paper-pick">
          {pickerLabel}
          <select value={paperId} onChange={(e) => setPaperId(e.target.value)}>
            <option value={AI_PICK}>AI pick for me</option>
            {papers.map((p) => (
              <option key={p.paperId} value={p.paperId}>
                {p.paperLabel} ({p.count} Q)
              </option>
            ))}
          </select>
          <span className="form-hint">{yearWisePaperPickerHint(examPatternId)}</span>
        </label>
      )}

      <div className="pyq-year-card-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => onStart({ year, paperId: paperId || undefined })}
        >
          {startLabel}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm pyq-download-btn"
          title="Watermarked paper (print to PDF)"
          onClick={() => {
            const sub = selectedPaper
              ? `${selectedPaper.paperLabel} · ${questionCount} questions`
              : `Year ${year} · one paper · ${questionCount} questions max`
            onDownload(
              { year, paperId: paperId || undefined },
              `${examLabel} PYQ ${year}`,
              sub,
            )
          }}
        >
          Download paper
        </button>
      </div>
    </div>
  )
}
