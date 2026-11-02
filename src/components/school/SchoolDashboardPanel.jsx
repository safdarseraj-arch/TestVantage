import { Link } from 'react-router-dom'

/**
 * School home dashboard — one glance: attendance, fees, exams, timetable, quick actions.
 */
export default function SchoolDashboardPanel({
  snapshot,
  onGoTab,
  schoolName,
}) {
  const { attendance, fees, schedule, upcomingExams, counts } = snapshot

  const attPct =
    attendance.enrolled > 0 && attendance.marked > 0
      ? Math.round((attendance.present / Math.max(attendance.marked, 1)) * 100)
      : null

  return (
    <div className="school-dash">
      <div className="school-dash-intro">
        <div>
          <h3>Today at {schoolName}</h3>
          <p className="form-hint">
            Attendance, fee dues, timetable, and upcoming exams — all in one place.
          </p>
        </div>
        <div className="school-dash-pill-row" aria-label="School counts">
          <span className="school-dash-pill">{counts.classes} classes</span>
          <span className="school-dash-pill">{counts.students} students</span>
          <span className="school-dash-pill">{counts.staff} staff</span>
          <span className="school-dash-pill">{counts.activeAssignments} live exams</span>
        </div>
      </div>

      <div className="school-dash-grid">
        <article className="school-dash-tile school-dash-tile--attend">
          <header>
            <span className="school-dash-kicker">Attendance</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onGoTab('attendance')}>
              Mark today
            </button>
          </header>
          {attendance.marked === 0 ? (
            <p className="school-dash-empty">
              No attendance marked yet for {attendance.date}. Open Attendance to mark a class.
            </p>
          ) : (
            <div className="school-dash-metrics">
              <div>
                <strong>{attPct != null ? `${attPct}%` : '—'}</strong>
                <span>Present rate</span>
              </div>
              <div>
                <strong>{attendance.present}</strong>
                <span>Present</span>
              </div>
              <div>
                <strong>{attendance.absent}</strong>
                <span>Absent</span>
              </div>
              <div>
                <strong>{attendance.late}</strong>
                <span>Late</span>
              </div>
            </div>
          )}
        </article>

        <article className="school-dash-tile school-dash-tile--fees">
          <header>
            <span className="school-dash-kicker">Fees</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onGoTab('fees')}>
              Open fees
            </button>
          </header>
          <div className="school-dash-metrics">
            <div>
              <strong>₹{fees.outstanding.toLocaleString('en-IN')}</strong>
              <span>Outstanding</span>
            </div>
            <div>
              <strong>{fees.duesCount}</strong>
              <span>Open dues</span>
            </div>
            <div>
              <strong>₹{fees.collected.toLocaleString('en-IN')}</strong>
              <span>Collected</span>
            </div>
          </div>
          {fees.dues?.length > 0 && (
            <ul className="school-dash-list">
              {fees.dues.slice(0, 3).map((d) => (
                <li key={`${d.feeId}-${d.studentId}`}>
                  <span>{d.studentName}</span>
                  <span>
                    {d.title} · ₹{Number(d.amount).toLocaleString('en-IN')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="school-dash-tile school-dash-tile--exams">
          <header>
            <span className="school-dash-kicker">Upcoming exams</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onGoTab('exams')}>
              Assign tests
            </button>
          </header>
          {upcomingExams.length === 0 ? (
            <p className="school-dash-empty">
              No active assignments. Assign a published mock paper to a class.
            </p>
          ) : (
            <ul className="school-dash-list">
              {upcomingExams.map((e) => (
                <li key={e.id}>
                  <span>{e.testTitle}</span>
                  <span>
                    {e.className}
                    {e.dueAt ? ` · due ${formatShort(e.dueAt)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="form-hint school-dash-foot">
            Results:{' '}
            <Link to="/teacher/results">Student results</Link>
          </p>
        </article>

        <article className="school-dash-tile school-dash-tile--tt">
          <header>
            <span className="school-dash-kicker">
              Timetable · {schedule.day === 'Sun' ? 'Sunday (off)' : schedule.day}
            </span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onGoTab('timetable')}>
              Edit
            </button>
          </header>
          {schedule.day === 'Sun' || schedule.slots.length === 0 ? (
            <p className="school-dash-empty">
              {schedule.day === 'Sun'
                ? 'Weekend — no periods scheduled.'
                : 'No periods for today. Add a weekly timetable.'}
            </p>
          ) : (
            <ul className="school-dash-list">
              {schedule.slots.slice(0, 5).map((s) => (
                <li key={s.id}>
                  <span>
                    {s.startTime}–{s.endTime} · {s.subject}
                  </span>
                  <span>
                    {s.className}
                    {s.teacherName ? ` · ${s.teacherName}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>

      <div className="school-quick-links school-dash-actions">
        <button type="button" className="school-quick-link" onClick={() => onGoTab('attendance')}>
          <span aria-hidden>📅</span>
          <div>
            <strong>Mark attendance</strong>
            <span>Class roll for today</span>
          </div>
        </button>
        <button type="button" className="school-quick-link" onClick={() => onGoTab('fees')}>
          <span aria-hidden>₹</span>
          <div>
            <strong>Collect fees</strong>
            <span>Plans & payments</span>
          </div>
        </button>
        <button type="button" className="school-quick-link" onClick={() => onGoTab('students')}>
          <span aria-hidden>👥</span>
          <div>
            <strong>Students</strong>
            <span>Accounts & enrollment</span>
          </div>
        </button>
        <button type="button" className="school-quick-link" onClick={() => onGoTab('exams')}>
          <span aria-hidden>📝</span>
          <div>
            <strong>Assign exam</strong>
            <span>Mock papers to classes</span>
          </div>
        </button>
        <button type="button" className="school-quick-link" onClick={() => onGoTab('reports')}>
          <span aria-hidden>📊</span>
          <div>
            <strong>Reports</strong>
            <span>At-a-glance summary</span>
          </div>
        </button>
        <button type="button" className="school-quick-link" onClick={() => onGoTab('classes')}>
          <span aria-hidden>📚</span>
          <div>
            <strong>Classes</strong>
            <span>Batches & teachers</span>
          </div>
        </button>
      </div>
    </div>
  )
}

function formatShort(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  } catch {
    return iso
  }
}
