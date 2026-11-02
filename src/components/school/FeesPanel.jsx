import { useMemo, useState } from 'react'
import {
  computeFeeDues,
  createFeePlan,
  deleteFeePlan,
  loadFeePayments,
  loadFeePlans,
  recordFeePayment,
} from '../../utils/schoolFeesStore'

export default function FeesPanel({
  schoolId,
  schoolClasses,
  students,
  onMessage,
  onRefreshLocal,
}) {
  const [tick, setTick] = useState(0)
  const refresh = () => {
    setTick((n) => n + 1)
    onRefreshLocal?.()
  }

  const plans = useMemo(() => loadFeePlans(schoolId), [schoolId, tick])
  const payments = useMemo(() => loadFeePayments(schoolId), [schoolId, tick])
  const dues = useMemo(
    () => computeFeeDues(schoolId, schoolClasses, students),
    [schoolId, schoolClasses, students, tick],
  )

  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('5000')
  const [dueDate, setDueDate] = useState('')
  const [classIds, setClassIds] = useState([])
  const [showAdd, setShowAdd] = useState(false)

  const toggleClass = (id) => {
    setClassIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const addPlan = (e) => {
    e.preventDefault()
    if (!title.trim()) {
      onMessage?.('error', 'Enter a fee name (e.g. Term fee).')
      return
    }
    createFeePlan({
      schoolId,
      title: title.trim(),
      amount: Number(amount) || 0,
      dueDate,
      classIds,
    })
    setTitle('')
    setAmount('5000')
    setDueDate('')
    setClassIds([])
    setShowAdd(false)
    onMessage?.('success', 'Fee plan created.')
    refresh()
  }

  const markPaid = (due) => {
    recordFeePayment({
      schoolId,
      feeId: due.feeId,
      studentId: due.studentId,
      amount: due.amount,
      method: 'cash',
    })
    onMessage?.('success', `Marked paid for ${due.studentName}.`)
    refresh()
  }

  const removePlan = (id) => {
    if (!window.confirm('Delete this fee plan and its payment records?')) return
    deleteFeePlan(id)
    onMessage?.('success', 'Fee plan removed.')
    refresh()
  }

  return (
    <div className="school-module">
      <div className="school-panel-head">
        <div>
          <h3>Fees & collections</h3>
          <p className="form-hint">
            Create fee plans for classes, track who still owes, and mark payments. Stored on this device.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setShowAdd((v) => !v)}
        >
          {showAdd ? 'Close' : '+ New fee plan'}
        </button>
      </div>

      <div className="school-stats-strip school-stats-strip--compact">
        <div className="school-stat-card">
          <strong>{plans.length}</strong>
          <span>Plans</span>
        </div>
        <div className="school-stat-card school-stat-card--warn">
          <strong>{dues.length}</strong>
          <span>Open dues</span>
        </div>
        <div className="school-stat-card school-stat-card--ok">
          <strong>{payments.length}</strong>
          <span>Payments</span>
        </div>
      </div>

      {showAdd && (
        <form className="school-inline-form" onSubmit={addPlan}>
          <h4>New fee plan</h4>
          <div className="school-form-grid">
            <label className="school-field school-field--full">
              <span>Name</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Term fee — April"
                required
              />
            </label>
            <label className="school-field">
              <span>Amount (₹)</span>
              <input
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label className="school-field">
              <span>Due date</span>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
            <div className="school-field school-field--full">
              <span>Applies to classes (leave empty = all)</span>
              <div className="school-teacher-chips">
                {schoolClasses.map((c) => (
                  <label key={c.id} className="school-teacher-chip">
                    <input
                      type="checkbox"
                      checked={classIds.includes(c.id)}
                      onChange={() => toggleClass(c.id)}
                    />
                    {c.name}
                  </label>
                ))}
                {schoolClasses.length === 0 && (
                  <span className="form-hint">Add classes first.</span>
                )}
              </div>
            </div>
          </div>
          <div className="school-form-actions">
            <button type="submit" className="btn btn-primary btn-sm">
              Save plan
            </button>
          </div>
        </form>
      )}

      <h4 className="school-module-subhead">Open dues</h4>
      {dues.length === 0 ? (
        <p className="form-hint">
          {plans.length === 0
            ? 'No fee plans yet. Create one to start tracking dues.'
            : 'All enrolled students are marked paid for current plans.'}
        </p>
      ) : (
        <ul className="school-assign-cards">
          {dues.map((d) => (
            <li key={`${d.feeId}-${d.studentId}`} className="school-assign-card">
              <div>
                <strong>{d.studentName}</strong>
                <p className="form-hint" style={{ margin: '0.2rem 0 0' }}>
                  {d.title}
                  {d.dueDate ? ` · due ${d.dueDate}` : ''} · ₹
                  {Number(d.amount).toLocaleString('en-IN')}
                </p>
              </div>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => markPaid(d)}>
                Mark paid
              </button>
            </li>
          ))}
        </ul>
      )}

      <h4 className="school-module-subhead">Fee plans</h4>
      {plans.length === 0 ? (
        <div className="school-empty-state school-empty-state--compact">
          <span className="school-empty-icon" aria-hidden>
            ₹
          </span>
          <h4>No fee plans</h4>
          <p className="form-hint">Add a term fee or transport fee to track collections.</p>
        </div>
      ) : (
        <ul className="school-assign-cards">
          {plans.map((p) => (
            <li key={p.id} className="school-assign-card">
              <div>
                <strong>{p.title}</strong>
                <p className="form-hint" style={{ margin: '0.2rem 0 0' }}>
                  ₹{Number(p.amount).toLocaleString('en-IN')}
                  {p.dueDate ? ` · due ${p.dueDate}` : ''}
                  {p.classIds?.length
                    ? ` · ${p.classIds.length} class(es)`
                    : ' · all classes'}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm school-btn-danger"
                onClick={() => removePlan(p.id)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
