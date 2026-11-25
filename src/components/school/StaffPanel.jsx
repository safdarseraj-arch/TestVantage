import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { studentInitials } from '../../utils/schoolUi'
import {
  createSchoolInvite,
  getInvitesForSchool,
  revokeSchoolInvite,
  teacherInviteShareText,
  teacherInviteSignupPath,
} from '../../utils/schoolInvitesStore'

/**
 * Staff view for a school — teachers linked to classes + Path A invite codes.
 */
export default function StaffPanel({
  school,
  schoolClasses,
  teachers,
  isAdmin,
  session,
  onMessage,
  onRefresh,
  onGoTab,
}) {
  const teacherIds = new Set(schoolClasses.flatMap((c) => c.teacherIds ?? []))
  const linked = teachers.filter(
    (t) => teacherIds.has(t.id) || (school?.id && t.schoolId === school.id),
  )
  const linkedIds = new Set(linked.map((t) => t.id))
  const unlinked = teachers.filter((t) => !linkedIds.has(t.id))

  const [department, setDepartment] = useState('Science')
  const [inviteTick, setInviteTick] = useState(0)

  const invites = useMemo(() => {
    if (!school?.id) return []
    return getInvitesForSchool(school.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- inviteTick forces re-read after mint/revoke
  }, [school?.id, inviteTick])

  const activeInvites = invites.filter((i) => !i.revokedAt)

  const classesForTeacher = (tid) => {
    const onRoster = schoolClasses.filter((c) => (c.teacherIds ?? []).includes(tid))
    if (onRoster.length) return onRoster
    // Invite redemption stamps schoolId before class chips are edited.
    const teacher = teachers.find((t) => t.id === tid)
    if (teacher?.schoolId === school?.id) return schoolClasses.slice(0, 2)
    return []
  }

  const classNames = schoolClasses.map((c) => c.name).filter(Boolean)

  const bumpInvites = () => {
    setInviteTick((n) => n + 1)
    onRefresh?.()
  }

  const handleCreateInvite = () => {
    if (!school) return
    onMessage?.('', '')
    const result = createSchoolInvite({
      schoolId: school.id,
      campusName: school.name,
      department,
      classes: classNames.length ? classNames : ['Class 11', 'Class 12'],
      createdBy: session?.email || session?.id || 'admin',
    })
    if (!result.ok) {
      onMessage?.('error', result.error)
      return
    }
    onMessage?.(
      'success',
      `Invite ready: ${result.invite.code}. Copy the login link and share it with your teachers.`,
    )
    bumpInvites()
  }

  const handleRevoke = (code) => {
    if (!window.confirm(`Revoke invite ${code}? Teachers who already joined stay.`)) return
    const result = revokeSchoolInvite(code)
    if (!result.ok) onMessage?.('error', result.error)
    else {
      onMessage?.('success', 'Invite revoked.')
      bumpInvites()
    }
  }

  const copyText = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text)
      onMessage?.('success', `${label} copied.`)
    } catch {
      onMessage?.('error', 'Could not copy — select and copy manually.')
    }
  }

  return (
    <div className="school-module">
      <div className="school-panel-head">
        <div>
          <h3>Staff & teachers</h3>
          <p className="form-hint">
            Link teachers to classes, or share a school invite so they join as school-invited staff
            (Path A).
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
        <div className="school-stat-card school-stat-card--accent">
          <strong>{activeInvites.length}</strong>
          <span>Active invites</span>
        </div>
      </div>

      <section className="school-invite-box">
        <h4 className="school-module-subhead">Teacher invite codes</h4>
        <p className="form-hint">
          Share the <strong>login link</strong> — teachers open it, pick Teacher, register or sign
          in, then finish Path A onboarding. Demo codes SCHOOL-DEMO and CAMPUS-TV still work too.
        </p>
        <div className="school-inline-form school-inline-form--row">
          <label className="school-field">
            <span>Department on invite</span>
            <input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="e.g. Science"
            />
          </label>
          <button type="button" className="btn btn-primary btn-sm" onClick={handleCreateInvite}>
            Create invite
          </button>
        </div>

        {activeInvites.length === 0 ? (
          <div className="school-empty-state school-empty-state--compact">
            <span className="school-empty-icon" aria-hidden>
              ✉️
            </span>
            <h4>No active invites yet</h4>
            <p className="form-hint">
              Create one above, then copy the login link for WhatsApp or email.
            </p>
          </div>
        ) : (
          <ul className="school-invite-list">
            {activeInvites.map((inv) => {
              const path = teacherInviteSignupPath(inv.code)
              const absolute =
                typeof window !== 'undefined' ? `${window.location.origin}${path}` : path
              return (
                <li key={inv.code} className="school-invite-card">
                  <div>
                    <code className="school-invite-code">{inv.code}</code>
                    <span className="form-hint" style={{ margin: 0, display: 'block' }}>
                      {inv.department}
                      {inv.classes?.length ? ` · ${inv.classes.join(', ')}` : ''}
                    </span>
                    <code className="school-invite-url">{absolute}</code>
                  </div>
                  <div className="school-invite-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => copyText(inv.code, 'Invite code')}
                    >
                      Copy code
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => copyText(absolute, 'Invite login link')}
                    >
                      Copy login link
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        copyText(
                          teacherInviteShareText(inv.code, school?.name || inv.campusName),
                          'Invite message',
                        )
                      }
                    >
                      Copy message
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm school-btn-danger"
                      onClick={() => handleRevoke(inv.code)}
                    >
                      Revoke
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {linked.length === 0 ? (
        <div className="school-empty-state school-empty-state--compact">
          <span className="school-empty-icon" aria-hidden>
            🧑‍🏫
          </span>
          <h4>No teachers linked yet</h4>
          <p className="form-hint">
            Share an invite above, or open Classes and attach a teacher account.
            {isAdmin && (
              <>
                {' '}
                Create accounts under <Link to="/admin">Admin</Link> → Teacher accounts.
              </>
            )}
          </p>
          {typeof onGoTab === 'function' && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onGoTab('classes')}>
              Go to Classes
            </button>
          )}
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
          <p className="form-hint">
            Link them from the Classes tab
            {typeof onGoTab === 'function' ? (
              <>
                {' '}
                —{' '}
                <button type="button" className="link-btn" onClick={() => onGoTab('classes')}>
                  open Classes
                </button>
              </>
            ) : (
              '.'
            )}
          </p>
        </>
      )}
    </div>
  )
}
