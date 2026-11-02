import { Link } from 'react-router-dom'
import { studentInitials } from '../../utils/schoolUi'

/**
 * Staff view for a school — teachers linked to classes + link to create accounts.
 */
export default function StaffPanel({ schoolClasses, teachers, isAdmin }) {
  const teacherIds = new Set(schoolClasses.flatMap((c) => c.teacherIds ?? []))
  const linked = teachers.filter((t) => teacherIds.has(t.id))
  const unlinked = teachers.filter((t) => !teacherIds.has(t.id))

  const classesForTeacher = (tid) =>
    schoolClasses.filter((c) => (c.teacherIds ?? []).includes(tid))

  return (
    <div className="school-module">
      <div className="school-panel-head">
        <div>
          <h3>Staff & teachers</h3>
          <p className="form-hint">
            Teachers linked to this school&apos;s classes. Link more teachers from the Classes tab.
          </p>
        </div>
        {isAdmin && (
          <Link to="/admin" className="btn btn-ghost btn-sm">
            Manage teacher accounts
          </Link>
        )}
      </div>

      <div className="school-stats-strip school-stats-strip--compact">
        <div className="school-stat-card">
          <strong>{linked.length}</strong>
          <span>Linked here</span>
        </div>
        <div className="school-stat-card">
          <strong>{teachers.length}</strong>
          <span>All teachers</span>
        </div>
        <div className="school-stat-card">
          <strong>{schoolClasses.length}</strong>
          <span>Classes</span>
        </div>
      </div>

      {linked.length === 0 ? (
        <div className="school-empty-state school-empty-state--compact">
          <span className="school-empty-icon" aria-hidden>
            🧑‍🏫
          </span>
          <h4>No teachers linked yet</h4>
          <p className="form-hint">
            Open <strong>Classes</strong>, pick a class, and attach a teacher account.
            {isAdmin && (
              <>
                {' '}
                Create accounts under <Link to="/admin">OCR settings / Admin</Link> → Teacher accounts.
              </>
            )}
          </p>
        </div>
      ) : (
        <ul className="school-student-list">
          {linked.map((t) => {
            const cls = classesForTeacher(t.id)
            return (
              <li key={t.id} className="school-student-card">
                <span className="school-student-avatar" aria-hidden>
                  {studentInitials(t.name)}
                </span>
                <div className="school-student-info">
                  <strong>{t.name}</strong>
                  <code>{t.email}</code>
                  <span className="form-hint" style={{ margin: 0 }}>
                    {cls.map((c) => c.name).join(' · ') || 'No classes'}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {unlinked.length > 0 && (
        <>
          <h4 className="school-module-subhead">Available teacher accounts (not linked yet)</h4>
          <ul className="school-teacher-chips">
            {unlinked.map((t) => (
              <li key={t.id} className="school-teacher-chip" style={{ listStyle: 'none' }}>
                {t.name}
              </li>
            ))}
          </ul>
          <p className="form-hint">Link them from the Classes tab.</p>
        </>
      )}
    </div>
  )
}
