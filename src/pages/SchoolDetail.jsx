import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import PortalPage from '../components/PortalPage'
import OrgServerSyncPanel from '../components/OrgServerSyncPanel'
import SchoolFormPanel from '../components/school/SchoolFormPanel'
import ClassManagementPanel from '../components/school/ClassManagementPanel'
import StudentManagementPanel from '../components/school/StudentManagementPanel'
import AssignTestsPanel from '../components/school/AssignTestsPanel'
import SchoolDashboardPanel from '../components/school/SchoolDashboardPanel'
import AttendancePanel from '../components/school/AttendancePanel'
import FeesPanel from '../components/school/FeesPanel'
import TimetablePanel from '../components/school/TimetablePanel'
import StaffPanel from '../components/school/StaffPanel'
import SchoolReportsPanel from '../components/school/SchoolReportsPanel'
import { useOrgData } from '../hooks/useOrgData'
import { getSchoolById } from '../utils/schoolsStore'
import { statsForSchool } from '../utils/schoolUi'
import { ensureSchoolErpDemo, schoolDashboardSnapshot } from '../utils/schoolErp'
import { getAllTests } from '../data/tests'

const TABS = [
  { id: 'overview', label: 'Dashboard', group: 'home' },
  { id: 'classes', label: 'Classes', group: 'people' },
  { id: 'students', label: 'Students', group: 'people' },
  { id: 'staff', label: 'Staff', group: 'people' },
  { id: 'attendance', label: 'Attendance', group: 'ops' },
  { id: 'fees', label: 'Fees', group: 'ops' },
  { id: 'timetable', label: 'Timetable', group: 'ops' },
  { id: 'exams', label: 'Exams', group: 'learn' },
  { id: 'reports', label: 'Reports', group: 'learn' },
]

const TAB_IDS = new Set(TABS.map((t) => t.id))

export default function SchoolDetail() {
  const { schoolId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab') || 'overview'
  const tab = rawTab === 'assign' ? 'exams' : TAB_IDS.has(rawTab) ? rawTab : 'overview'
  const classParam = searchParams.get('class') || ''

  const { schools, classes, visibleClasses, assignments, students, teachers, isAdmin, session, refresh } =
    useOrgData()
  const [msg, setMsg] = useState({ type: '', text: '' })
  const [selectedClassId, setSelectedClassId] = useState(classParam)
  const [editingSchool, setEditingSchool] = useState(false)
  const [erpTick, setErpTick] = useState(0)

  const school = useMemo(
    () => schools.find((s) => s.id === schoolId) ?? getSchoolById(schoolId),
    [schools, schoolId],
  )

  const schoolClasses = useMemo(
    () => visibleClasses.filter((c) => c.schoolId === schoolId),
    [visibleClasses, schoolId],
  )

  const stats = useMemo(
    () => (school ? statsForSchool(school.id, classes, students) : null),
    [school, classes, students],
  )

  const testsById = useMemo(() => {
    const map = {}
    for (const t of getAllTests()) map[t.id] = t
    return map
  }, [])

  useEffect(() => {
    if (!school?.id || schoolClasses.length === 0) return
    ensureSchoolErpDemo(school.id, schoolClasses, students, teachers)
    setErpTick((n) => n + 1)
  }, [school?.id, schoolClasses.length])

  const snapshot = useMemo(() => {
    if (!school) return null
    return schoolDashboardSnapshot({
      schoolId: school.id,
      schoolClasses,
      students,
      teachers,
      assignments,
      testsById,
    })
  }, [school, schoolClasses, students, teachers, assignments, testsById, erpTick])

  useEffect(() => {
    if (classParam) setSelectedClassId(classParam)
    else if (!selectedClassId && schoolClasses[0]) setSelectedClassId(schoolClasses[0].id)
  }, [classParam, schoolClasses, selectedClassId])

  const setTab = (id) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', id)
      return next
    })
    setMsg({ type: '', text: '' })
  }

  const selectClass = (id) => {
    setSelectedClassId(id)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (id) next.set('class', id)
      else next.delete('class')
      return next
    })
  }

  const bumpErp = () => setErpTick((n) => n + 1)

  if (!school) {
    return (
      <PortalPage role="school" title="School not found" className="page school-portal-page">
        <p className="form-hint">This school may have been removed.</p>
        <Link to="/admin/schools" className="btn btn-primary">
          Back to School Management
        </Link>
      </PortalPage>
    )
  }

  if (!isAdmin && schoolClasses.length === 0) {
    return (
      <PortalPage role="school" title="Access restricted" className="page school-portal-page">
        <p className="form-hint">You do not have any classes in this school.</p>
        <Link to="/admin/schools" className="btn btn-primary">
          Back to School Management
        </Link>
      </PortalPage>
    )
  }

  return (
    <PortalPage
      role="school"
      className="page school-portal-page school-detail-page"
      eyebrow="School Management"
      title={school.name}
      subtitle={
        [school.code, school.address].filter(Boolean).join(' · ') ||
        'Complete school workspace — people, attendance, fees, timetable, and exams.'
      }
      actions={
        <>
          <Link to="/admin/schools" className="btn btn-ghost btn-sm">
            ← All schools
          </Link>
          <Link to="/teacher/results" className="btn btn-ghost btn-sm">
            Student results
          </Link>
        </>
      }
    >
      <OrgServerSyncPanel onRefresh={refresh} onMessage={(type, text) => setMsg({ type, text })} />

      {stats && snapshot && (
        <div className="school-stats-strip">
          <div className="school-stat-card school-stat-card--accent">
            <strong>{stats.classCount}</strong>
            <span>Classes</span>
          </div>
          <div className="school-stat-card">
            <strong>{stats.studentCount}</strong>
            <span>Students</span>
          </div>
          <div className="school-stat-card">
            <strong>{snapshot.counts.staff}</strong>
            <span>Staff</span>
          </div>
          <div className="school-stat-card school-stat-card--warn">
            <strong>{snapshot.fees.duesCount}</strong>
            <span>Fee dues</span>
          </div>
          <div className="school-stat-card school-stat-card--ok">
            <strong>{snapshot.attendance.present || '—'}</strong>
            <span>Present today</span>
          </div>
        </div>
      )}

      <nav className="school-detail-tabs" aria-label="School modules">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`school-detail-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {msg.text && (
        <p className={msg.type === 'error' ? 'upload-error' : 'upload-success'}>{msg.text}</p>
      )}

      {tab === 'overview' && snapshot && (
        <section className="card school-overview-card">
          <SchoolDashboardPanel
            snapshot={snapshot}
            schoolName={school.name}
            onGoTab={setTab}
          />

          <div className="school-profile-block">
            <div className="school-panel-head">
              <div>
                <h3>School profile</h3>
                <p className="form-hint">Name, code, and address for this institution.</p>
              </div>
              {!editingSchool && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setEditingSchool(true)}
                >
                  Edit profile
                </button>
              )}
            </div>
            {editingSchool ? (
              <SchoolFormPanel
                school={school}
                classes={classes}
                onMessage={(type, text) => setMsg({ type, text })}
                onDone={() => {
                  setEditingSchool(false)
                  refresh()
                }}
                onCancel={() => setEditingSchool(false)}
              />
            ) : (
              <dl className="school-profile-dl">
                <div>
                  <dt>Name</dt>
                  <dd>{school.name}</dd>
                </div>
                <div>
                  <dt>Code</dt>
                  <dd>{school.code ? <code>{school.code}</code> : '—'}</dd>
                </div>
                <div>
                  <dt>Address</dt>
                  <dd>{school.address || '—'}</dd>
                </div>
              </dl>
            )}
          </div>
        </section>
      )}

      {tab === 'classes' && (
        <section className="card">
          <ClassManagementPanel
            schoolId={school.id}
            schoolClasses={schoolClasses}
            teachers={teachers}
            isAdmin={isAdmin}
            selectedClassId={selectedClassId}
            onSelectClass={selectClass}
            onMessage={(type, text) => setMsg({ type, text })}
            onRefresh={refresh}
          />
        </section>
      )}

      {tab === 'students' && (
        <section className="card">
          <StudentManagementPanel
            schoolClasses={schoolClasses}
            students={students}
            selectedClassId={selectedClassId}
            onSelectClass={selectClass}
            session={session}
            onMessage={(type, text) => setMsg({ type, text })}
            onRefresh={refresh}
          />
        </section>
      )}

      {tab === 'staff' && (
        <section className="card">
          <StaffPanel schoolClasses={schoolClasses} teachers={teachers} isAdmin={isAdmin} />
        </section>
      )}

      {tab === 'attendance' && (
        <section className="card">
          <AttendancePanel
            schoolId={school.id}
            schoolClasses={schoolClasses}
            students={students}
            selectedClassId={selectedClassId}
            onSelectClass={selectClass}
            onMessage={(type, text) => {
              setMsg({ type, text })
              if (type === 'success') bumpErp()
            }}
          />
        </section>
      )}

      {tab === 'fees' && (
        <section className="card">
          <FeesPanel
            schoolId={school.id}
            schoolClasses={schoolClasses}
            students={students}
            onMessage={(type, text) => setMsg({ type, text })}
            onRefreshLocal={bumpErp}
          />
        </section>
      )}

      {tab === 'timetable' && (
        <section className="card">
          <TimetablePanel
            schoolId={school.id}
            schoolClasses={schoolClasses}
            teachers={teachers}
            selectedClassId={selectedClassId}
            onSelectClass={selectClass}
            onMessage={(type, text) => setMsg({ type, text })}
            onRefreshLocal={bumpErp}
          />
        </section>
      )}

      {tab === 'exams' && (
        <section className="card">
          <AssignTestsPanel
            schoolClasses={schoolClasses}
            assignments={assignments}
            session={session}
            onMessage={(type, text) => setMsg({ type, text })}
            onRefresh={refresh}
          />
        </section>
      )}

      {tab === 'reports' && snapshot && (
        <section className="card">
          <SchoolReportsPanel snapshot={snapshot} onGoTab={setTab} />
        </section>
      )}

      <section className="card school-tip-card">
        <h3>How students take exams</h3>
        <p className="form-hint">
          After you enroll students and assign a test under <strong>Exams</strong>, they open{' '}
          <Link to="/tests">Mock Tests</Link> → <strong>Assigned to me</strong>. Share each
          student&apos;s User ID and password from the Students tab.
        </p>
      </section>
    </PortalPage>
  )
}
