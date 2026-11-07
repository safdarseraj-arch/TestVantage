import { OptionBody } from './QuestionMediaLite.jsx'
import { toggleMatrixGridCell } from '../utils/matrixMatch.js'
import { acceptedGridSets, gridColLabels } from '../utils/matrixGridPyq.js'

function ticksOf(map, row) {
  const cols = map && typeof map === 'object' ? map[row] : null
  return Array.isArray(cols) ? cols.map(Number) : Number.isInteger(cols) ? [cols] : []
}

function markingHint(marking) {
  if (!marking?.perRow) return ''
  const wrong = Number(marking.wrong) || 0
  return `Each Column I row: +${marking.correct} if exactly right, ${wrong < 0 ? `−${-wrong}` : wrong} for any other ticks, 0 if left blank.`
}

/**
 * Column I and Column II side by side, then the tick grid.
 * - `onChange`: the grid is editable (admin answer key).
 * - `answer` with `showKey`: the student's ticks against the key (results).
 * - `showKey` alone: the key, read-only (preview).
 * @param {{
 *   question: any
 *   answer?: Record<number, number[]> | null
 *   showKey?: boolean
 *   onChange?: (key: Record<number, number[]>) => void
 *   highlightProblems?: boolean
 * }} props
 */
export default function MatrixGridView({ question, answer = null, showKey = false, onChange, highlightProblems = false }) {
  const rows = Array.isArray(question?.matrixRows) ? question.matrixRows : []
  const cols = Array.isArray(question?.matrixCols) ? question.matrixCols : []
  const labels = gridColLabels(question)
  const editable = typeof onChange === 'function'
  const key = question?.matrixAnswerKey || {}
  const studentView = !editable && answer != null
  const ticked = editable ? key : answer || {}
  const hint = markingHint(question?.matrixMarking)
  const alternates = rows
    .map((_, r) => {
      const [, ...alts] = acceptedGridSets(question, r)
      if (!alts.length) return ''
      return `${String.fromCharCode(65 + r)} → ${alts.map((set) => set.map((c) => labels[c]).join(', ')).join(' / ')}`
    })
    .filter(Boolean)

  return (
    <div className="matrix-match matrix-grid-view">
      <div className="matrix-match-columns">
        <div className="matrix-match-col-block">
          <h4 className="matrix-match-col-title">Column I</h4>
          {rows.length ? (
            <ol className="matrix-match-list matrix-match-list-rows" type="A">
              {rows.map((row, i) => (
                <li key={i} value={i + 1}>
                  <OptionBody text={String(row ?? '')} highlightProblems={highlightProblems} />
                </li>
              ))}
            </ol>
          ) : (
            <p className="form-hint">Column I is missing.</p>
          )}
        </div>
        <div className="matrix-match-col-block">
          <h4 className="matrix-match-col-title">Column II</h4>
          {cols.length ? (
            <ul className="matrix-match-list matrix-match-list-cols">
              {cols.map((col, j) => (
                <li key={j}>
                  <span className="matrix-col-num">({labels[j]})</span>
                  <OptionBody text={String(col ?? '')} highlightProblems={highlightProblems} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="form-hint">Column II is missing.</p>
          )}
        </div>
      </div>

      {rows.length && cols.length ? (
        <div className="matrix-grid-wrap">
          <table className="matrix-grid-table matrix-grid-view-table" aria-label="Answer grid">
            <thead>
              <tr>
                <th scope="col" className="matrix-grid-corner">
                  <span className="sr-only">Row / Column</span>
                </th>
                {cols.map((_, j) => (
                  <th key={j} scope="col" className="matrix-grid-col-head">
                    {labels[j]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((_, i) => {
                const picked = ticksOf(ticked, i)
                const right = ticksOf(key, i)
                return (
                  <tr key={i}>
                    <th scope="row" className="matrix-grid-row-head">
                      <span className="matrix-row-letter">{String.fromCharCode(65 + i)}</span>
                    </th>
                    {cols.map((__, j) => {
                      const isKey = right.includes(j)
                      const isPicked = picked.includes(j)
                      let cls = ''
                      let mark = ''
                      if (studentView) {
                        if (isPicked && isKey) [cls, mark] = ['matrix-grid-cell--right', '✓']
                        else if (isPicked) [cls, mark] = ['matrix-grid-cell--wrong', '✗']
                        else if (showKey && isKey) [cls, mark] = ['matrix-grid-cell--missed', '○']
                      } else if (!editable && showKey && isKey) [cls, mark] = ['matrix-grid-cell--right', '✓']
                      return (
                        <td key={j} className={`matrix-grid-cell ${cls}`.trim()}>
                          {editable ? (
                            <label className="matrix-grid-check">
                              <input
                                type="checkbox"
                                checked={isPicked}
                                onChange={() => onChange(toggleMatrixGridCell(ticked, i, j))}
                                aria-label={`Row ${String.fromCharCode(65 + i)} matches ${labels[j]}`}
                              />
                            </label>
                          ) : (
                            <span aria-label={mark ? `${String.fromCharCode(65 + i)} ${labels[j]} ${cls.replace('matrix-grid-cell--', '')}` : undefined}>
                              {mark}
                            </span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
          {studentView ? (
            <p className="form-hint">✓ your right tick · ✗ your wrong tick · ○ a right box you missed</p>
          ) : null}
          {(showKey || editable) && alternates.length ? (
            <p className="form-hint">The paper also accepts: {alternates.join(' · ')}</p>
          ) : null}
          {hint ? <p className="form-hint">{hint}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
