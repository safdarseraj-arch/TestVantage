import { Link } from 'react-router-dom'

/**
 * Lightweight school reports — attendance, fees, exams at a glance.
 */
export default function SchoolReportsPanel({ snapshot, onGoTab }) {
  const { attendance, fees, counts, upcomingExams, schedule } = snapshot

  const rows = [
    {
      label: 'Classes',
      value: String(counts.classes),
      hint: 'Active batches',
      tab: 'classes',
    },
    {
      label: 'Students enrolled',
      value: String(counts.students),
      hint: 'Across all classes',
      tab: 'students',
    },
    {
      label: 'Staff linked',
      value: String(counts.staff),
      hint: 'Teachers on classes',
      tab: 'staff',
    },
    {
      label: 'Today attendance marked',
      value: `${attendance.marked} / ${attendance.enrolled || 0}`,
      hint: `${attendance.present} present · ${attendance.absent} absent · ${attendance.late} late`,
      tab: 'attendance',
    },
    {
      label: 'Fee outstanding',
      value: `₹${fees.outstanding.toLocaleString('en-IN')}`,
      hint: `${fees.duesCount} open dues · ₹${fees.collected.toLocaleString('en-IN')} collected`,
      tab: 'fees',
    },
    {
      label: 'Live exam assignments',
      value: String(counts.activeAssignments),
      hint: `${upcomingExams.length} upcoming shown on dashboard`,
      tab: 'exams',
    },
    {
      label: `Timetable (${schedule.day})`,
      value: String(schedule.slots.length),
      hint: 'Periods scheduled today',
      tab: 'timetable',
    },
  ]

  return (
    <div className="school-module">
      <div className="school-panel-head">
        <div>
          <h3>School reports</h3>
          <p className="form-hint">
            Snapshot for parents&apos; meetings and principal review. Detailed attempt analysis is under
            Student results.
          </p>
        </div>
        <Link to="/teacher/results" className="btn btn-primary btn-sm">
          Open student results
        </Link>
      </div>

      <div className="school-report-table-wrap">
        <table className="school-report-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th>Value</th>
              <th>Notes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td>
                  <strong>{r.value}</strong>
                </td>
                <td className="form-hint">{r.hint}</td>
                <td>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onGoTab(r.tab)}>
                    Open
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {upcomingExams.length > 0 && (
        <>
          <h4 className="school-module-subhead">Upcoming exams</h4>
          <ul className="school-assign-cards">
            {upcomingExams.map((e) => (
              <li key={e.id} className="school-assign-card">
                <div>
                  <strong>{e.testTitle}</strong>
                  <p className="form-hint" style={{ margin: '0.2rem 0 0' }}>
                    {e.className}
                    {e.dueAt ? ` · due ${new Date(e.dueAt).toLocaleDateString('en-IN')}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
