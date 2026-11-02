import { useLayoutEffect, useMemo, useEffect } from 'react'
import MathText from './MathText'
import { matrixRowsForUi } from '../utils/parseMatchColumnUpload.js'
import {
  MATRIX_ROW_COUNT,
  matrixGridSize,
  toggleMatrixGridCell } from '../utils/matrixMatch.js'
import { BANK_MATRIX_GRID_EVENT } from '../utils/examClickBridge.js'

/**
 * Authoring UI for matrix match questions in Question Bank.
 * @param {{
 *   rows: string[]
 *   cols: string[]
 *   colCount: 4 | 5
 *   onRowsChange: (rows: string[]) => void
 *   onColsChange: (cols: string[]) => void
 *   onColCountChange: (n: 4 | 5) => void
 *   useOptions: boolean
 *   onUseOptionsChange: (v: boolean) => void
 *   options: string[]
 *   onOptionsChange: (opts: string[]) => void
 *   correctIndex: number
 *   onCorrectIndexChange: (i: number) => void
 *   colLabels: string[]
 *   onColLabelsChange: (labels: string[]) => void
 *   gridKey: Record<number, number[]>
 *   onGridKeyChange: (key: Record<number, number[]>) => void
 *   ocrRaw?: string
 *   disabled?: boolean
 * }} props
 */
export default function MatrixMatchForm({
  rows,
  ocrRaw = '',
  cols,
  colCount,
  colLabels,
  onColLabelsChange,
  onRowsChange,
  onColsChange,
  onColCountChange,
  useOptions,
  onUseOptionsChange,
  options,
  onOptionsChange,
  correctIndex,
  onCorrectIndexChange,
  gridKey,
  onGridKeyChange,
  disabled = false }) {
  const { cols: gridCols } = matrixGridSize(colCount)
  const colHeads = colLabels.length
    ? colLabels
    : Array.from({ length: colCount }, (_, i) => `(${i + 1})`)

  const displayRows = useMemo(() => {
    const fixed = matrixRowsForUi(rows, ocrRaw)
    const out = [...fixed]
    while (out.length < MATRIX_ROW_COUNT) out.push('')
    return out.slice(0, MATRIX_ROW_COUNT)
  }, [rows, ocrRaw])

  const rowDRepaired =
    displayRows[3].length > String(rows[3] ?? '').trim().length + 4

  // Save completed row D into parent matrixRows (fixes preview stuck on truncated OCR).
  useLayoutEffect(() => {
    const raw = String(rows[3] ?? '').trim()
    const fixed = String(displayRows[3] ?? '').trim()
    if (!raw || !fixed || fixed === raw || fixed.length <= raw.length + 4) return
    const next = [...rows]
    while (next.length < MATRIX_ROW_COUNT) next.push('')
    next[3] = fixed
    onRowsChange(next.slice(0, MATRIX_ROW_COUNT))
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows[3], displayRows[3], onRowsChange])

  useEffect(() => {
 
    if (disabled || useOptions) return
    /** @param {Event} ev */
    const onBankGrid = (ev) => {
      const detail = /** @type {CustomEvent<{ row?: number, col?: number }>} */ (ev).detail
      const row = detail?.row
      const col = detail?.col
      if (!Number.isInteger(row) || !Number.isInteger(col)) return
      onGridKeyChange(toggleMatrixGridCell(gridKey, row, col))
    }
    window.addEventListener(BANK_MATRIX_GRID_EVENT, onBankGrid)
    return () => window.removeEventListener(BANK_MATRIX_GRID_EVENT, onBankGrid)
  }, [disabled, useOptions, gridKey, onGridKeyChange])

  const displayCols = [...cols]
  while (displayCols.length < colCount) displayCols.push('')

  const setRow = (i, val) => {
    const next = [...displayRows]
    next[i] = val
    onRowsChange(next.slice(0, MATRIX_ROW_COUNT))
  }

  const setCol = (i, val) => {
    const next = [...displayCols]
    next[i] = val
    onColsChange(next.slice(0, colCount))
  }

  const setOption = (i, val) => {
    const next = [...options]
    while (next.length < 4) next.push('')
    next[i] = val
    onOptionsChange(next.slice(0, 4))
  }

  return (
    <div className="matrix-match-form card-inner">
      <h4>Matrix match the column</h4>
      <p className="form-hint">
        Column I has four rows (A–D). Column II has four or five entries. Students answer with a{' '}
        <strong>{MATRIX_ROW_COUNT}×{gridCols} checkbox grid</strong> unless you provide options
        A–D (then they pick one option).
      </p>

      <div className="matrix-match-columns">
        <div className="matrix-match-col-block">
          <h4 className="matrix-match-col-title">Column I (4 rows)</h4>
          {displayRows.map((row, i) => (
            <label key={i} className="matrix-form-row-label">
              {String.fromCharCode(65 + i)}
              <textarea
                className="matrix-form-textarea matrix-form-textarea--row"
                rows={2}
                value={row}
                disabled={disabled}
                onChange={(e) => setRow(i, e.target.value)}
                placeholder={`Row ${String.fromCharCode(65 + i)} — LaTeX OK`}
              />
            </label>
          ))}
          <p className="form-hint matrix-form-edit-hint">
            Long stems wrap here; use <strong>Preview</strong> below to check rendered math.
          </p>
        </div>
        <div className="matrix-match-col-block">
          <h4 className="matrix-match-col-title">Column II</h4>
          <div className="matrix-col-count-toggle">
            <label>
              <input
                type="radio"
                name="matrix-col-count"
                checked={colCount === 4}
                disabled={disabled}
                onChange={() => {
                  onColCountChange(4)
                  onColLabelsChange(colHeads.slice(0, 4))
                }}
              />
              4 entries (4×4 grid)
            </label>
            <label>
              <input
                type="radio"
                name="matrix-col-count"
                checked={colCount === 5}
                disabled={disabled}
                onChange={() => {
                  onColCountChange(5)
                  const next = [...colHeads]
                  while (next.length < 5) next.push(String.fromCharCode(80 + next.length))
                  onColLabelsChange(next.slice(0, 5))
                }}
              />
              5 entries (4×5 grid) — e.g. P, Q, R, S, T
            </label>
          </div>
          {displayCols.slice(0, colCount).map((col, j) => (
            <label key={j} className="matrix-form-row-label">
              {colHeads[j] ?? `(${j + 1})`}
              <input
                type="text"
                className="matrix-form-col-input"
                value={col}
                disabled={disabled}
                onChange={(e) => setCol(j, e.target.value)}
                onClick={(e) => e.currentTarget.focus()}
                placeholder={`${colHeads[j] ?? `(${j + 1})`} e.g. $0$ or $-\\frac{3}{2}$`}
              />
            </label>
          ))}
        </div>
      </div>

      <label className="matrix-use-options-toggle">
        <input
          type="checkbox"
          checked={useOptions}
          disabled={disabled}
          onChange={(e) => onUseOptionsChange(e.target.checked)}
        />
        Use options A, B, C, D (instead of checkbox grid)
      </label>

      {useOptions ? (
        <div className="matrix-options-author">
          <h4>Options A–D (correct combination)</h4>
          {[...options, '', '', '', ''].slice(0, 4).map((opt, i) => (
            <div key={i} className="matrix-option-author-row">
              <label>
                {String.fromCharCode(65 + i)}
                <input
                  type="text"
                  value={opt}
                  disabled={disabled}
                  onChange={(e) => setOption(i, e.target.value)}
                  placeholder={`Option ${String.fromCharCode(65 + i)}`}
                />
              </label>
              <label className="msq-check">
                <input
                  type="radio"
                  name="matrix-correct-opt"
                  disabled={disabled}
                  checked={correctIndex === i}
                  onChange={() => onCorrectIndexChange(i)}
                />
                Correct
              </label>
            </div>
          ))}
        </div>
      ) : (
        <div className="matrix-grid-wrap">
          <h4>Correct matches (checkbox grid)</h4>
          <p className="form-hint">Tick every correct row–column pair for the answer key.</p>
          <table className="matrix-grid-table matrix-grid-table-author">
            <thead>
              <tr>
                <th className="matrix-grid-corner" />
                {Array.from({ length: gridCols }, (_, j) => (
                  <th key={j}>{colHeads[j] ?? `(${j + 1})`}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, i) => (
                <tr key={i}>
                  <th className="matrix-grid-row-head">{String.fromCharCode(65 + i)}</th>
                  {Array.from({ length: gridCols }, (_, j) => (
                    <td
                      key={j}
                      className="matrix-grid-cell"
                      data-bank-matrix-cell=""
                      data-bank-matrix-row={String(i)}
                      data-bank-matrix-col={String(j)}
                      data-bank-matrix-disabled={disabled ? '1' : '0'}
                    >
                      <label className="matrix-grid-check">
                        <input
                          type="checkbox"
                          disabled={disabled}
                          readOnly
                          tabIndex={-1}
                          checked={(gridKey[i] ?? []).includes(j)}
                          onChange={() =>
                            onGridKeyChange(toggleMatrixGridCell(gridKey, i, j))
                          }
                        />
                      </label>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {displayRows.some((r, i) => r.trim() && !(gridKey[i]?.length)) && (
            <p className="parse-status partial">Mark at least one column per row that has text.</p>
          )}
        </div>
      )}

      <div className="form-preview matrix-form-preview">
        <span>Preview:</span>
        {rowDRepaired && (
          <p className="parse-status success">
            Row D was completed automatically (OCR stopped at &ldquo;are in&rdquo;; added H.P. and
            &ldquo;will be in&rdquo;).
          </p>
        )}
        <div className="matrix-match-columns">
          <div>
            <strong>Column I</strong>
            <ol className="matrix-match-list matrix-match-list-rows" type="A">
              {displayRows.map((r, i) =>
                r.trim() ? (
                  <li key={i} value={String.fromCharCode(65 + i)}>
                    <MathText text={r} />
                  </li>
                ) : null,
              )}
            </ol>
          </div>
          <div>
            <strong>Column II</strong>
            <ul className="matrix-preview-col-list">
              {displayCols.slice(0, colCount).map((c, j) => (
                <li key={j} className={c.trim() ? '' : 'matrix-preview-col-empty'}>
                  <span className="matrix-col-num">{colHeads[j] ?? `(${j + 1})`}</span>{' '}
                  {c.trim() ? (
                    <MathText text={c} />
                  ) : (
                    <span className="form-hint">(empty — fill in Column II above)</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}


