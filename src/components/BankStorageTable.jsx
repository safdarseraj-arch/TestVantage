import { useMemo, useState } from 'react'
import {
  formatStorageSize,
  getBankStorageSlots,
  getExportFormatRows,
  getQuestionStorageRow,
} from '../utils/bankStorageReport.js'
import { getBankStorageDiagnostics } from '../utils/bankStorageRecovery.js'
import { slimStoredBankImages } from '../utils/bankImageSlim.js'
import { formatImageSize } from '../utils/imageQuestion.js'

/**
 * @param {{
 *   questions: import('../data/tests').Question[],
 *   onRefresh?: () => void,
 *   onMessage?: (type: string, text: string) => void,
 * }} props
 */
export default function BankStorageTable({ questions, onRefresh, onMessage }) {
  const [showEach, setShowEach] = useState(false)
  const [compressing, setCompressing] = useState(false)
  const report = useMemo(() => {
    const diag = getBankStorageDiagnostics()
    return {
      questionCount: questions?.length ?? 0,
      slots: getBankStorageSlots(),
      exportFormats: getExportFormatRows(),
      summary: {
        mainBankBytes: diag.bytes,
        backupBytes: diag.backupBytes ?? 0,
      },
    }
  }, [questions?.length])
  const rows = useMemo(
    () => (showEach ? (questions ?? []).map(getQuestionStorageRow) : []),
    [showEach, questions],
  )

  if (!questions?.length) return null

  const runCompress = async () => {
    setCompressing(true)
    try {
      const result = await slimStoredBankImages({ force: true })
      onRefresh?.()
      if (result.savedBytes > 0) {
        onMessage?.(
          'success',
          `Compressed images — freed about ${formatImageSize(result.savedBytes)}.`,
        )
      } else {
        onMessage?.('info', 'Images are already compressed as much as we can without losing quality.')
      }
    } catch (e) {
      onMessage?.(
        'error',
        e instanceof Error ? e.message : 'Could not compress images.',
      )
    } finally {
      setCompressing(false)
    }
  }

  return (
    <div className="bank-storage-tables">
      <div className="bank-storage-tables-head">
        <h4 className="bank-storage-tables-title">Storage &amp; save format</h4>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={compressing}
          onClick={runCompress}
        >
          {compressing ? 'Compressing…' : 'Compress images to save space'}
        </button>
      </div>
      <p className="form-hint">
        Questions are saved inside your browser as JSON. Images use the most space — new uploads are
        auto-compressed; use the button above to shrink older saves.
      </p>

      <div className="bank-storage-table-block">
        <h5>Where it is saved</h5>
        <div className="bank-storage-table-wrap">
          <table className="bank-storage-table">
            <thead>
              <tr>
                <th>What</th>
                <th>Location</th>
                <th>Storage key</th>
                <th>Format</th>
                <th>Space used</th>
              </tr>
            </thead>
            <tbody>
              {report.slots.map((slot) => (
                <tr key={slot.key}>
                  <td>{slot.name}</td>
                  <td>{slot.location}</td>
                  <td>
                    <code>{slot.key}</code>
                  </td>
                  <td>{slot.format}</td>
                  <td>{slot.bytes ? formatStorageSize(slot.bytes) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bank-storage-table-block">
        <h5>Export formats (when you download)</h5>
        <div className="bank-storage-table-wrap">
          <table className="bank-storage-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>File format</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {report.exportFormats.map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td>
                    <code>{row.format}</code>
                  </td>
                  <td>{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bank-storage-summary-row">
        <span>
          All <strong>{report.questionCount}</strong> questions in this browser
        </span>
        <span>
          Main bank file: <strong>{formatStorageSize(report.summary.mainBankBytes)}</strong>
        </span>
      </div>

      <div className="bank-storage-table-block">
        <h5>Each saved question</h5>
        {!showEach ? (
          <p className="form-hint">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setShowEach(true)}
            >
              Show size of each question
            </button>{' '}
            (can take a moment with a large bank)
          </p>
        ) : (
        <div className="bank-storage-table-wrap bank-storage-table-wrap--scroll">
          <table className="bank-storage-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Subject</th>
                <th>Type</th>
                <th>Save format</th>
                <th>Text size</th>
                <th>Image size</th>
                <th>Total size</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <code>{row.id}</code>
                  </td>
                  <td>{row.subject}</td>
                  <td>{row.type}</td>
                  <td className="bank-storage-format-cell">{row.format}</td>
                  <td>{formatStorageSize(row.textBytes)}</td>
                  <td>{row.imageBytes ? formatStorageSize(row.imageBytes) : '—'}</td>
                  <td>
                    <strong>{formatStorageSize(row.totalBytes)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>
    </div>
  )
}
