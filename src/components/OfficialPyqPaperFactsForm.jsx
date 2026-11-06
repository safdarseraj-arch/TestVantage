import { useState } from 'react'
import {
  FACT_SUBJECTS,
  FACT_TYPES,
  adminFactsMatchingScan,
  defaultOptionsFor,
  draftAdminFacts,
  emptyFactRow,
  subjectLabel,
  validateAdminFacts,
} from '../utils/officialPyqAdminFacts.js'
import {
  getOfficialPyqPendingOcrText,
  getOfficialPyqPendingPaper,
  getOfficialPyqPendingPreviewPaper,
} from '../utils/officialPyqPendingStore.js'

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function loadDraft(paperId, fresh = false) {
  const paper = getOfficialPyqPendingPaper(paperId)
  if (!paper) return null
  const ocr = getOfficialPyqPendingOcrText(paperId) || String(paper.preparedText ?? '')
  if (!fresh && paper.adminFacts) return clone(adminFactsMatchingScan(paper.adminFacts, ocr))
  return draftAdminFacts(ocr, paper.questions)
}

function numberOrBlank(value) {
  const t = String(value ?? '').trim()
  if (!t) return ''
  const n = Number(t)
  return Number.isFinite(n) ? n : ''
}

/**
 * @param {{ block: { rows: any[], passages: string }, title: string, onChange: (block: any) => void, disabled?: boolean }} props
 */
function SectionRows({ block, title, onChange, disabled }) {
  const rows = Array.isArray(block?.rows) ? block.rows : []

  function setRow(i, patch) {
    const next = rows.map((r, j) => (j === i ? { ...r, ...patch } : r))
    onChange({ ...block, rows: next })
  }

  function addRow() {
    const last = rows[rows.length - 1]
    const from = last && Number(last.to) > 0 ? Number(last.to) + 1 : rows.length ? '' : 1
    onChange({ ...block, rows: [...rows, emptyFactRow(from)] })
  }

  function removeRow(i) {
    onChange({ ...block, rows: rows.filter((_, j) => j !== i) })
  }

  return (
    <fieldset className="official-pyq-facts-block" disabled={disabled}>
      <legend>{title}</legend>
      <table className="official-pyq-facts-table">
        <thead>
          <tr>
            <th>Section</th>
            <th>From Q</th>
            <th>To Q</th>
            <th>Type</th>
            <th>Options</th>
            <th>List-I items</th>
            <th>List-II items</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const noOptions = r.type === 'integer' || r.type === 'numerical'
            const isMatch = r.type === 'matrix_match'
            return (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>
                  <input
                    type="number"
                    min="1"
                    value={r.from}
                    onChange={(e) => setRow(i, { from: numberOrBlank(e.target.value) })}
                    aria-label={`Section ${i + 1} from question`}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min="1"
                    value={r.to}
                    onChange={(e) => setRow(i, { to: numberOrBlank(e.target.value) })}
                    aria-label={`Section ${i + 1} to question`}
                  />
                </td>
                <td>
                  <select
                    value={r.type}
                    onChange={(e) =>
                      setRow(i, { type: e.target.value, options: defaultOptionsFor(e.target.value) })
                    }
                    aria-label={`Section ${i + 1} type`}
                  >
                    {FACT_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  {noOptions ? (
                    <span className="form-hint">none</span>
                  ) : (
                    <input
                      type="number"
                      min="2"
                      value={r.options}
                      onChange={(e) => setRow(i, { options: numberOrBlank(e.target.value) })}
                      aria-label={`Section ${i + 1} options`}
                    />
                  )}
                </td>
                <td>
                  {isMatch ? (
                    <input
                      type="number"
                      min="1"
                      placeholder="e.g. 4"
                      value={r.listI}
                      onChange={(e) => setRow(i, { listI: numberOrBlank(e.target.value) })}
                      aria-label={`Section ${i + 1} List-I items`}
                    />
                  ) : null}
                </td>
                <td>
                  {isMatch ? (
                    <input
                      type="number"
                      min="1"
                      placeholder="e.g. 5"
                      value={r.listII}
                      onChange={(e) => setRow(i, { listII: numberOrBlank(e.target.value) })}
                      aria-label={`Section ${i + 1} List-II items`}
                    />
                  ) : null}
                </td>
                <td>
                  {rows.length > 1 ? (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeRow(i)}>
                      Remove
                    </button>
                  ) : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <button type="button" className="btn btn-ghost btn-sm" onClick={addRow}>
        Add section
      </button>
      <label className="official-pyq-facts-passages">
        Questions that share a passage (e.g. 13-14, 15-16), or leave empty:
        <input
          type="text"
          value={block?.passages ?? ''}
          placeholder="13-14, 15-16"
          onChange={(e) => onChange({ ...block, passages: e.target.value })}
        />
      </label>
    </fieldset>
  )
}

/**
 * Admin fills / confirms the paper facts. Approve stays locked until confirmed.
 * @param {{ paperId: string, onChanged?: () => void }} props
 */
export default function OfficialPyqPaperFactsForm({ paperId, onChanged }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(/** @type {any} */ (null))
  const [errors, setErrors] = useState(/** @type {string[]} */ ([]))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  let light = null
  try {
    light = getOfficialPyqPendingPreviewPaper(paperId)
  } catch {
    light = null
  }
  const confirmedAt = Number(light?.adminFacts?.confirmedAt) || 0
  const published = String(light?.status ?? '') === 'approved' || String(light?.status ?? '') === 'published'
  if (published && !confirmedAt) return null

  function onToggle(e) {
    const isOpen = e.currentTarget.open
    setOpen(isOpen)
    if (isOpen && !draft) {
      setDraft(loadDraft(paperId))
      setErrors([])
    }
  }

  function patch(p) {
    setDraft((d) => ({ ...d, ...p }))
    setErrors([])
  }

  function setOrder(k, id) {
    const order = [...(draft?.subjectOrder || [])]
    order[k] = id
    const bySubject = { ...(draft?.bySubject || {}) }
    if (!bySubject[id]) bySubject[id] = { rows: [emptyFactRow(1)], passages: '' }
    patch({ subjectOrder: order, bySubject })
  }

  function onRefill() {
    setDraft(loadDraft(paperId, true))
    setErrors([])
    setNote('Filled again from the paper’s printed instructions. Check every row, then confirm.')
  }

  async function onConfirm() {
    if (busy || !draft) return
    const check = validateAdminFacts(draft)
    if (check.errors.length) {
      setErrors(check.errors)
      return
    }
    setBusy(true)
    setErrors([])
    setNote('Saving the paper facts and checking every question…')
    try {
      const { confirmOfficialPyqPaperFacts } = await import('../utils/officialPyqAdminFactsApply.js')
      const out = confirmOfficialPyqPaperFacts(paperId, draft)
      if (!out.ok) {
        setErrors(out.errors)
        setNote('')
        return
      }
      const q = out.quality
      const goTo = Array.isArray(q?.failedGoTo) ? q.failedGoTo : []
      const lines = Array.isArray(q?.lines) ? q.lines : []
      setNote(
        `Saved. Questions: ${out.before} → ${out.after} (paper facts say ${out.expected}). ` +
          (q?.passed
            ? 'Quality check passed.'
            : `Quality check not passed.${goTo.length ? ` Go to Q ${goTo.slice(0, 24).join(', ')}.` : ''} ${lines[0] || ''}`),
      )
      setDraft(loadDraft(paperId))
      onChanged?.()
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Could not save the paper facts.'])
      setNote('')
    } finally {
      setBusy(false)
    }
  }

  const order = Array.isArray(draft?.subjectOrder) ? draft.subjectOrder : []
  const same = draft?.samePattern !== false
  const live = draft ? validateAdminFacts(draft) : null

  return (
    <details
      className="official-pyq-facts"
      data-testid="official-pyq-paper-facts"
      open={open}
      onToggle={onToggle}
    >
      <summary>
        <strong>Paper facts</strong>{' '}
        {confirmedAt ? (
          <span className="bank-review-badge">
            Confirmed {new Date(confirmedAt).toLocaleString()}
          </span>
        ) : (
          <span className="upload-error">Not confirmed — needed before Approve</span>
        )}
      </summary>

      {!draft ? (
        <p className="form-hint">{open ? 'Loading…' : ''}</p>
      ) : (
        <div className="official-pyq-facts-body">
          <p className="form-hint">
            Copy these from the paper’s printed instructions.{' '}
            {draft.readFromPaper
              ? 'They were filled in from the instructions — check every row.'
              : 'The instructions could not be read, so fill them in.'}{' '}
            Splitting, the quality check and the Approve lock follow what you confirm here.
          </p>

          <fieldset disabled={published || busy}>
            <label>
              Total questions printed on the paper:{' '}
              <input
                type="number"
                min="1"
                value={draft.totalQuestions}
                onChange={(e) => patch({ totalQuestions: numberOrBlank(e.target.value) })}
              />
            </label>

            <div className="official-pyq-facts-order">
              Subject order:{' '}
              {[0, 1, 2].map((k) => (
                <select
                  key={k}
                  value={order[k] || ''}
                  onChange={(e) => setOrder(k, e.target.value)}
                  aria-label={`Subject ${k + 1}`}
                >
                  <option value="">—</option>
                  {FACT_SUBJECTS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              ))}
            </div>

            <div className="official-pyq-facts-numbering">
              Question numbers:{' '}
              <label>
                <input
                  type="radio"
                  name={`facts-numbering-${paperId}`}
                  checked={draft.numbering !== 'continuous'}
                  onChange={() => patch({ numbering: 'restart', numberingFromScan: false })}
                />{' '}
                restart at Q1 in each subject
              </label>{' '}
              <label>
                <input
                  type="radio"
                  name={`facts-numbering-${paperId}`}
                  checked={draft.numbering === 'continuous'}
                  onChange={() => patch({ numbering: 'continuous', numberingFromScan: false })}
                />{' '}
                run straight through all subjects
              </label>
              {draft.numberingFromScan ? (
                <p className="form-hint" data-testid="official-pyq-facts-numbering-from-scan">
                  Set from the scan: the paper prints{' '}
                  {draft.numbering === 'continuous'
                    ? 'numbers that run on past one subject.'
                    : 'Q.1 again at the start of each subject.'}
                </p>
              ) : null}
            </div>

            <label>
              <input
                type="checkbox"
                checked={same}
                onChange={(e) => patch({ samePattern: e.target.checked })}
              />{' '}
              Same section pattern for all subjects
            </label>
          </fieldset>

          {same ? (
            <SectionRows
              title={`Section pattern (write the numbers as printed in ${subjectLabel(order[0]) || 'the first subject'})`}
              block={draft.pattern}
              disabled={published || busy}
              onChange={(block) => patch({ pattern: block })}
            />
          ) : (
            order.filter(Boolean).map((id) => (
              <SectionRows
                key={id}
                title={`${subjectLabel(id)} (numbers as printed)`}
                block={draft.bySubject?.[id] || { rows: [emptyFactRow(1)], passages: '' }}
                disabled={published || busy}
                onChange={(block) =>
                  patch({ bySubject: { ...(draft.bySubject || {}), [id]: block } })
                }
              />
            ))
          )}

          {live && !live.errors.length ? (
            <p className="form-hint" role="status">
              Adds up to {live.slots.length} questions
              {order.filter(Boolean).length
                ? ` (${order
                    .filter(Boolean)
                    .map((id) => `${subjectLabel(id)} ${live.slots.filter((s) => s.subject === id).length}`)
                    .join(', ')})`
                : ''}
              .
            </p>
          ) : null}

          {errors.length ? (
            <ul className="upload-error" role="alert">
              {errors.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
          {note ? (
            <p className="form-hint" role="status">
              {note}
            </p>
          ) : null}

          {!published ? (
            <div className="official-pyq-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                data-testid="official-pyq-facts-confirm"
                disabled={busy}
                onClick={() => void onConfirm()}
              >
                {busy ? 'Saving…' : 'Confirm facts and apply to questions'}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onRefill}>
                Fill again from the paper’s instructions
              </button>
            </div>
          ) : null}
        </div>
      )}
    </details>
  )
}
