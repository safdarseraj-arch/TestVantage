import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PortalPage from '../components/PortalPage'
import OrgServerSyncPanel from '../components/OrgServerSyncPanel'
import SchoolFormPanel from '../components/school/SchoolFormPanel'
import { useOrgData } from '../hooks/useOrgData'
import { useAuth } from '../context/AuthContext'
import { PERMS } from '../utils/permissions'
import { schoolOrgStats, statsForSchool } from '../utils/schoolUi'
import { feesSummary } from '../utils/schoolFeesStore'
import { todayAttendanceSummary } from '../utils/schoolAttendanceStore'

const MODULES = [
  {
    title: 'People',
    items: ['Classes & batches', 'Students & logins', 'Staff / teachers'],
  },
  {
    title: 'Daily ops',
    items: ['Attendance', 'Fees & dues', 'Weekly timetable'],
  },
  {
    title: 'Learning',
    items: ['Assign mock exams', 'Student results', 'School reports'],
  },
]

export default function SchoolSetup() {
  const { hasPermission } = useAuth()
  const canManageSchools = hasPermission(PERMS.MANAGE_SCHOOLS)
  const { schools, classes, students, visibleClasses, isAdmin, refresh } = useOrgData()
  const [msg, setMsg] = useState({ type: '', text: '' })
  const [showAddForm, setShowAddForm] = useState(false)

  const visibleSchools = useMemo(() => {
    if (isAdmin) return schools
    const ids = new Set(visibleClasses.map((c) => c.schoolId))
    return schools.filter((s) => ids.has(s.id))
  }, [schools, visibleClasses, isAdmin])

  const totals = schoolOrgStats(visibleSchools, classes, students)

  return (
    <PortalPage
      role="school"
      className="page school-portal-page"
      eyebrow="Complete school solution"
      title="School Management"
      subtitle="One place for schools, classes, students, attendance, fees, timetable, exams, and reports."
      actions={
        <Link to="/teacher/results" className="btn btn-ghost btn-sm">
          Student results
        </Link>
      }
    >
      <OrgServerSyncPanel onRefresh={refresh} onMessage={(type, text) => setMsg({ type, text })} />

      <div className="school-stats-strip">
        <div className="school-stat-card school-stat-card--accent">
          <strong>{totals.schoolCount}</strong>
          <span>Schools</span>
        </div>
        <div className="school-stat-card">
          <strong>{totals.totalClasses}</strong>
          <span>Classes</span>
        </div>
        <div className="school-stat-card">
          <strong>{totals.totalStudents}</strong>
          <span>Students</span>
        </div>
      </div>

      <section className="school-module-map" aria-label="What you can manage">
        {MODULES.map((m) => (
          <div key={m.title} className="school-module-map-item">
            <h3>{m.title}</h3>
            <ul>
              {m.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {msg.text && (
        <p className={msg.type === 'error' ? 'upload-error' : 'upload-success'}>{msg.text}</p>
      )}

      <section className="card school-hub-add">
        <div className="school-panel-head">
          <div>
            <h2>Add a school</h2>
            <p className="form-hint">
              Create the school, then open it for dashboard, attendance, fees, and exams.
            </p>
          </div>
          {canManageSchools && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setShowAddForm((v) => !v)}
            >
              {showAddForm ? 'Close' : '+ New school'}
            </button>
          )}
        </div>
        {showAddForm && canManageSchools && (
          <SchoolFormPanel
            classes={classes}
            onMessage={(type, text) => setMsg({ type, text })}
            onDone={() => {
              setShowAddForm(false)
              refresh()
            }}
            onCancel={() => setShowAddForm(false)}
          />
        )}
      </section>

      {visibleSchools.length === 0 ? (
        <section className="card school-empty-state">
          <span className="school-empty-icon" aria-hidden>
            🏫
          </span>
          <h2>No schools yet</h2>
          <p className="form-hint">
            Click <strong>New school</strong> above to add your first institution.
          </p>
          <ol className="school-workflow-list" style={{ textAlign: 'left', display: 'inline-block' }}>
            <li>Add the school</li>
            <li>Create classes and enroll students</li>
            <li>Mark attendance, set fees, build timetable</li>
            <li>Assign mock exams from TestVantages</li>
          </ol>
        </section>
      ) : (
        <section className="school-hub-grid" aria-label="All schools">
          {visibleSchools.map((s) => {
            const stats = statsForSchool(s.id, classes, students)
            const schoolCls = classes.filter((c) => c.schoolId === s.id)
            const att = todayAttendanceSummary(s.id, schoolCls, students)
            const fees = feesSummary(s.id, schoolCls, students)
            return (
              <Link key={s.id} to={`/admin/schools/${s.id}`} className="school-hub-card">
                <div className="school-hub-card-glow" aria-hidden />
                <div className="school-hub-card-top">
                  <span className="school-hub-mark" aria-hidden>
                    {String(s.name || 'S')
                      .trim()
                      .slice(0, 1)
                      .toUpperCase()}
                  </span>
                  <div>
                    <h3>{s.name}</h3>
                    {s.code && <code className="school-hub-code">{s.code}</code>}
                  </div>
                </div>
                {s.address && <p className="school-hub-address">{s.address}</p>}
                <div className="school-hub-card-stats">
                  <span>{stats.classCount} classes</span>
                  <span>{stats.studentCount} students</span>
                </div>
                <div className="school-hub-card-meta">
                  <span>
                    Today: {att.marked > 0 ? `${att.present} present` : 'attendance open'}
                  </span>
                  <span>
                    {fees.duesCount > 0
                      ? `${fees.duesCount} fee dues`
                      : fees.planCount > 0
                        ? 'Fees clear'
                        : 'Fees ready'}
                  </span>
                </div>
                <span className="school-hub-card-cta">Open school →</span>
              </Link>
            )
          })}
        </section>
      )}

      <section className="card school-tip-card">
        <h3>Suggested flow</h3>
        <ol className="school-workflow-list">
          <li>Add a school on this page</li>
          <li>Open the school → Classes → Students</li>
          <li>Use Attendance, Fees, and Timetable for daily ops</li>
          <li>Exams tab → assign TestVantages mock papers</li>
          <li>Reports + Student results for monitoring</li>
        </ol>
        <p className="form-hint">
          Students see assigned tests under <Link to="/tests">Mock Tests</Link> →{' '}
          <strong>Assigned to me</strong>.
        </p>
      </section>
    </PortalPage>
  )
}
