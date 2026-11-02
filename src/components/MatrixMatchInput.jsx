import { useMemo } from 'react'
import MathText from './MathText'
import { OptionBody } from './QuestionMedia'
import {
  MATRIX_ROW_COUNT,
  getMatrixColHeadLabels,
  getMatrixResponseMode,
  inferMatrixColCount,
  matrixGridSize,
  normalizeMatrixAnswerKey,
  toggleMatrixGridCell,
} from '../utils/matrixMatch.js'
import {
  matrixColEntryIsInvalid,
  matrixRowsForUi,
  resolveMatrixColsForDisplay,
  trimRowColumnIIBleed,
} from '../utils/parseMatchColumnUpload.js'

/**
 * @param {{
 *   question: import('../data/tests').Question
 *   answer: unknown
 *   onChange: (answer: unknown) => void
 *   disabled?: boolean
 * }} props
 */
export default function MatrixMatchInput({ question, answer, onChange, disabled = false }) {
  const healed = useMemo(
    () => resolveMatrixColsForDisplay(question),
// eslint-disable-next-line react-hooks/exhaustive-deps
    [question, question.id, question.matrixCols, question.matrixRows, question.text],
  )
  const rows = matrixRowsForUi(
    (healed.matrixRows ?? []).slice(0, MATRIX_ROW_COUNT).map((r) => trimRowColumnIIBleed(String(r ?? ''))),
  )
  const colCount = inferMatrixColCount(healed)
  const cols = Array.from({ length: colCount }, (_, i) => healed.matrixCols?.[i] ?? '')
  const colsMissing = cols.every((c) => matrixColEntryIsInvalid(c))
  const { cols: gridCols } = matrixGridSize(colCount)
  const mode = getMatrixResponseMode(healed)
  const colHeads = getMatrixColHeadLabels(healed)
  const gridAnswer = normalizeMatrixAnswerKey(
    mode === 'grid' ? /** @type {Record<number, number[]>} */ (answer) : {},
  )

  const colDisplayText = (col) => {
    const s = String(col ?? '').trim()
    return s && !matrixColEntryIsInvalid(s) ? s : ''
  }

  return (
    <div className="matrix-match">
      <div className="matrix-match-columns card-inner">
        <div className="matrix-match-col-block">
          <h4 className="matrix-match-col-title">Column I</h4>
          <p className="form-hint">List I — rows (horizontal)</p>
          <ol className="matrix-match-list matrix-match-list-rows" type="A">
            {rows.map((row, i) => (
              <li key={i} value={String.fromCharCode(65 + i)}>
                <MathText text={row || `Row ${String.fromCharCode(65 + i)}`} />
              </li>
            ))}
          </ol>
        </div>
        <div className="matrix-match-col-block">
          <h4 className="matrix-match-col-title">Column II</h4>
          <p className="form-hint">List II — entries (vertical in grid)</p>
          {colsMissing ? (
            <p className="form-hint">
              Column II is missing — open{' '}
              <a href="http://127.0.0.1:5173/question-bank">Question Bank</a>, re-parse the image,
              then Save.
            </p>
          ) : null}
          <ul className="matrix-match-list matrix-match-list-cols">
            {cols.map((col, j) => {
              const label = colDisplayText(col)
              return (
                <li key={j}>
                  <span className="matrix-col-num">{colHeads[j] ?? `(${j + 1})`}</span>
                  {label ? <MathText text={label} /> : <span className="matrix-col-missing">—</span>}
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      {mode === 'grid' ? (
        <div className="matrix-grid-wrap">
          <p className="form-hint">
            Mark matching pairs: each row (Column I) may match one or more columns in Column II.
            Grid is {MATRIX_ROW_COUNT}×{gridCols}.
          </p>
          <table className="matrix-grid-table" role="grid" aria-label="Matrix match response grid">
            <thead>
              <tr>
                <th scope="col" className="matrix-grid-corner">
                  <span className="sr-only">Row / Column</span>
                </th>
                {Array.from({ length: gridCols }, (_, j) => (
                  <th key={j} scope="col" className="matrix-grid-col-head">
                    {colHeads[j]}
                    {colDisplayText(cols[j]) ? (
                      <span className="matrix-grid-col-caption">
                        <MathText
                          text={
                            colDisplayText(cols[j]).slice(0, 40) +
                            (colDisplayText(cols[j]).length > 40 ? '…' : '')
                          }
                        />
                      </span>
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  <th scope="row" className="matrix-grid-row-head">
                    <span className="matrix-row-letter">{String.fromCharCode(65 + i)}</span>
                    {row?.trim() ? (
                      <span className="matrix-grid-row-caption">
                        <MathText text={row.slice(0, 36) + (row.length > 36 ? '…' : '')} />
                      </span>
                    ) : null}
                  </th>
                  {Array.from({ length: gridCols }, (_, j) => (
                    <td
                      key={j}
                      className="matrix-grid-cell"
                      data-exam-matrix-cell=""
                      data-exam-question-id={question.id ?? ''}
                      data-exam-matrix-row={String(i)}
                      data-exam-matrix-col={String(j)}
                      data-exam-matrix-disabled={disabled ? '1' : '0'}
                    >
                      <label className="matrix-grid-check">
                        <input
                          type="checkbox"
                          disabled={disabled}
                          readOnly
                          tabIndex={-1}
                          checked={(gridAnswer[i] ?? []).includes(j)}
                          onChange={() =>
                            onChange(toggleMatrixGridCell(gridAnswer, i, j))
                          }
                          aria-label={`Row ${String.fromCharCode(65 + i)} column ${j + 1}`}
                        />
                      </label>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="matrix-options-wrap">
          <p className="form-hint">Choose the correct combination (options A–D):</p>
          <div className="options-list" role="radiogroup">
            {(question.options ?? []).map((opt, i) =>
              opt?.trim() || question.optionImages?.[i] ? (
                <label
                  key={i}
                  className="option-label"
                  data-exam-matrix-option={String(i)}
                  data-exam-question-id={question.id ?? ''}
                  data-exam-matrix-disabled={disabled ? '1' : '0'}
                >
                  <input
                    type="radio"
                    name={`matrix-opt-${question.id}`}
                    disabled={disabled}
                    readOnly
                    tabIndex={-1}
                    checked={answer === i}
                    onChange={() => onChange(i)}
                  />
                  <span className="option-letter">{String.fromCharCode(65 + i)}</span>
                  <OptionBody
                    text={opt}
                    optionImage={question.optionImages?.[i]}
                    questionText={question.text}
                    allOptions={question.options}
                    optionLetter={String.fromCharCode(65 + i)}
                  />
                </label>
              ) : null,
            )}
          </div>
        </div>
      )}
    </div>
  )
}

