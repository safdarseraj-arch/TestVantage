import { useMemo, useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getAllStudentAttemptsAsync } from '../utils/attemptHistory'
import { getClassesForTeacher } from '../utils/classesStore'
import { formatTime } from '../utils/formatTime'
import { isPlatformScaleEnabled } from '../config/platform.js'
import {
  DEMO_BATCH_TEST_TITLE,
  DEMO_SUBJECTS,
  buildRankedBatchRows,
  seedDemoBatchResults,
  purgeDemoBatchResultsIfLive,
  summarizeDemoBatch,
} from '../utils/seedDemoBatchResults.js'
import PortalPage from '../components/PortalPage.jsx'
import OrgServerSyncPanel from '../components/OrgServerSyncPanel.jsx'

/** @typedef {'overall'|'Physics'|'Chemistry'|'Maths'} RankBy */

/**
 * @param {{
 *   sub?: { attempted: number, correct: number, negativeMarks: number, totalMarks: number } | null
 *   tone?: 'physics' | 'chemistry' | 'maths'
 * }} props
 */
function SubjectCols({ sub, tone = 'physics' }) {
  const cls = `teacher-batch-sub teacher-batch-sub--${tone}`
  if (!sub) {
    return (
      <>
        <td className={cls}>—</td>
        <td className={cls}>—</td>
        <td className={cls}>—</td>
        <td className={cls}>—</td>
      </>
    )
  }
  return (
    <>
      <td className={cls}>{sub.attempted}</td>
      <td className={cls}>{sub.correct}</td>
      <td className={cls}>−{sub.negativeMarks}</td>
      <td className={cls}>
        <strong>{sub.totalMarks}</strong>
      </td>
    </>
  )
}

const SUBJECT_TONE = {
  Physics: 'physics',
  Chemistry: 'chemistry',
  Maths: 'maths',
}

export default function TeacherResults() {
  const { session, isAdmin } = useAuth()
  const [attempts, setAttempts] = useState([])
  const [loading, setLoading] = useState(true)
  const [demoNote, setDemoNote] = useState('')
  const [rankBy, setRankBy] = useState(/** @type {RankBy} */ ('overall'))

  const teacherId = session?.userId

  const teacherStudentIds = useMemo(() => {
    if (isAdmin || !teacherId) return null
    if (session?.role === 'teacher') {
      return getClassesForTeacher(teacherId).flatMap((c) => c.studentIds)
    }
    return []
  }, [isAdmin, session?.role, teacherId])

  const reload = useCallback(async () => {
    setLoading(true)
    const ownerKeys =
      teacherStudentIds && teacherStudentIds.length ? teacherStudentIds : undefined
    const rows = await getAllStudentAttemptsAsync(
      ownerKeys ? { ownerKeys, limit: 300 } : { limit: 300 },
    )
    if (teacherStudentIds === null) {
      setAttempts(rows)
    } else if (!teacherStudentIds.length) {
      setAttempts([])
    } else {
      const idSet = new Set(teacherStudentIds)
      setAttempts(
        rows.filter((a) => (a.ownerKey && idSet.has(a.ownerKey)) || a.isDemoBatch),
      )
    }
    setLoading(false)
  }, [teacherStudentIds])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      seedDemoBatchResults()
      purgeDemoBatchResultsIfLive()
      if (cancelled) return
      await reload()
    })()
    return () => {
      cancelled = true
    }
  }, [reload])

  const batchSummary = useMemo(() => summarizeDemoBatch(attempts), [attempts])
  const rankedRows = useMemo(
    () => buildRankedBatchRows(attempts, rankBy),
    [attempts, rankBy],
  )

  const loadDemoBatch = () => {
    const result = seedDemoBatchResults({ force: true })
    setDemoNote(
      result.seeded
        ? `Loaded ${result.count} demo students for “${DEMO_BATCH_TEST_TITLE}”.`
        : `Demo batch already present (${result.count} students).`,
    )
    void reload()
  }

  return (
    <PortalPage
      role="teacher"
      className="page teacher-results-page"
      eyebrow="Teacher dashboard"
      title="Student results"
      subtitle={
        isAdmin
          ? isPlatformScaleEnabled()
            ? 'All student attempts from the live server and this browser.'
            : 'All test attempts saved on this browser — registered students and guests.'
          : 'Results for students enrolled in your classes.'
      }
      actions={
        <>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={loadDemoBatch}
            title="Sample classroom data for practice only — not real students"
          >
            Load demo batch
          </button>
          <Link to="/admin/schools" className="btn btn-ghost btn-sm">
            School Management
          </Link>
        </>
      }
    >
      <OrgServerSyncPanel />

      {demoNote && (
        <p className="form-hint" role="status">
          {demoNote}
        </p>
      )}

      {batchSummary.count > 0 && (
        <div className="card teacher-batch-summary" style={{ marginBottom: '1rem' }}>
          <h3 style={{ marginTop: 0 }}>Demo batch — collective view</h3>
          <p className="form-hint" style={{ marginTop: 0 }}>
            Paper: <strong>{batchSummary.title}</strong>
            {' · '}
            Marking: <strong>+4 / −1</strong> (25 Q per subject)
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '0.75rem',
              marginBottom: '1rem',
            }}
          >
            <div>
              <div className="form-hint">Students</div>
              <strong>{batchSummary.count}</strong>
            </div>
            <div>
              <div className="form-hint">Class average</div>
              <strong>
                {batchSummary.avgScore}/{batchSummary.maxScore}
              </strong>{' '}
              ({batchSummary.avgPct}%)
            </div>
            <div>
              <div className="form-hint">Avg accuracy</div>
              <strong>{batchSummary.avgAccuracy}%</strong>
            </div>
            <div>
              <div className="form-hint">Topper</div>
              <strong>
                {batchSummary.topper?.userName} — {batchSummary.topper?.score}/
                {batchSummary.topper?.maxScore}
              </strong>
            </div>
            <div>
              <div className="form-hint">Lowest</div>
              <strong>
                {batchSummary.lowest?.userName} — {batchSummary.lowest?.score}/
                {batchSummary.lowest?.maxScore}
              </strong>
            </div>
          </div>

          {batchSummary.bySubject?.length > 0 && (
            <>
              <h4 style={{ marginBottom: '0.35rem' }}>Subject-wise (class average)</h4>
              <div className="attempts-table-wrap">
                <table className="attempts-table">
                  <thead>
                    <tr>
                      <th>Subject</th>
                      <th>Questions attempted</th>
                      <th>Correct questions</th>
                      <th>Negative marks</th>
                      <th>Total marks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchSummary.bySubject.map((s) => (
                      <tr key={s.subject}>
                        <td>
                          <strong>{s.subject}</strong>
                        </td>
                        <td>{s.questionsAttempted}</td>
                        <td>{s.correctQuestions}</td>
                        <td>−{s.negativeMarks}</td>
                        <td>
                          <strong>{s.totalMarks}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {loading ? (
        <div className="card">
          <p className="form-hint">Loading student results…</p>
        </div>
      ) : attempts.length === 0 ? (
        <div className="card">
          <p>
            {teacherStudentIds !== null && !teacherStudentIds.length
              ? 'No students in your classes yet. Enroll students under Schools, or load the demo batch.'
              : 'No student attempts yet. Load the demo batch, or ask students to take tests from Mock Tests.'}
          </p>
          <button type="button" className="btn btn-primary" onClick={loadDemoBatch}>
            Load demo batch (12 students)
          </button>
        </div>
      ) : rankedRows.length === 0 ? (
        <div className="attempts-table-wrap card">
          <p className="form-hint">No batch rows to rank. Click <strong>Load demo batch</strong>.</p>
        </div>
      ) : (
        <div className="card">
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
              marginBottom: '0.75rem',
            }}
          >
            <div>
              <h3 style={{ margin: 0 }}>Each student’s result</h3>
              <p className="form-hint" style={{ margin: '0.25rem 0 0' }}>
                S.No. is row order. Rank (next to Overall) allows ties. Subject columns stay
                colour-coded; rows alternate light shades. Use Rank by to reorder the list.
              </p>
            </div>
            <label className="form-hint" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              Rank by
              <select
                value={rankBy}
                onChange={(e) => setRankBy(/** @type {RankBy} */ (e.target.value))}
              >
                <option value="overall">Overall score</option>
                {DEMO_SUBJECTS.map((s) => (
                  <option key={s} value={s}>
                    {s} marks
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="attempts-table-wrap teacher-batch-wide-table">
            <table className="attempts-table teacher-batch-matrix">
              <thead>
                <tr>
                  <th rowSpan={2}>S.No.</th>
                  <th rowSpan={2}>Student</th>
                  <th rowSpan={2}>Overall</th>
                  <th rowSpan={2}>Rank</th>
                  <th rowSpan={2}>Accuracy</th>
                  {DEMO_SUBJECTS.map((s) => (
                    <th
                      key={s}
                      colSpan={5}
                      className={`teacher-batch-subject-head teacher-batch-sub--${SUBJECT_TONE[s] ?? 'physics'}`}
                    >
                      {s}
                    </th>
                  ))}
                  <th rowSpan={2}>Time</th>
                  <th rowSpan={2}></th>
                </tr>
                <tr>
                  {DEMO_SUBJECTS.flatMap((s) => {
                    const tone = SUBJECT_TONE[s] ?? 'physics'
                    const cls = `teacher-batch-sub teacher-batch-sub--${tone}`
                    return [
                      <th key={`${s}-att`} className={cls}>
                        Attempted
                      </th>,
                      <th key={`${s}-cor`} className={cls}>
                        Correct
                      </th>,
                      <th key={`${s}-neg`} className={cls}>
                        Neg. marks
                      </th>,
                      <th key={`${s}-tot`} className={cls}>
                        Total marks
                      </th>,
                      <th key={`${s}-rank`} className={cls}>
                        Subj. rank
                      </th>,
                    ]
                  })}
                </tr>
              </thead>
              <tbody>
                {rankedRows.map((a, index) => {
                  const pct = a.maxScore > 0 ? Math.round((a.score / a.maxScore) * 100) : 0
                  return (
                    <tr key={a.id}>
                      <td className="teacher-batch-sno">{index + 1}</td>
                      <td>
                        {a.userName ?? 'Guest'}
                        {a.isDemoBatch && (
                          <span className="demo-badge" style={{ marginLeft: '0.35rem' }}>
                            Demo
                          </span>
                        )}
                        {a.userEmail && (
                          <span className="form-hint" style={{ display: 'block' }}>
                            {a.userEmail}
                          </span>
                        )}
                      </td>
                      <td>
                        <strong>
                          {a.score}/{a.maxScore}
                        </strong>{' '}
                        ({pct}%)
                      </td>
                      <td className="teacher-batch-overall-rank">
                        <strong>#{a.overallRank}</strong>
                      </td>
                      <td>{a.accuracy}%</td>
                      <SubjectCols sub={a.subjectsByName?.Physics} tone="physics" />
                      <td className="teacher-batch-sub teacher-batch-sub--physics">
                        <strong>#{a.physicsRank}</strong>
                      </td>
                      <SubjectCols sub={a.subjectsByName?.Chemistry} tone="chemistry" />
                      <td className="teacher-batch-sub teacher-batch-sub--chemistry">
                        <strong>#{a.chemistryRank}</strong>
                      </td>
                      <SubjectCols sub={a.subjectsByName?.Maths} tone="maths" />
                      <td className="teacher-batch-sub teacher-batch-sub--maths">
                        <strong>#{a.mathsRank}</strong>
                      </td>
                      <td>{a.durationSeconds != null ? formatTime(a.durationSeconds) : '—'}</td>
                      <td>
                        <Link
                          to={`/result/${a.testId}?attempt=${a.id}`}
                          className="btn btn-ghost btn-sm"
                        >
                          Analysis
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PortalPage>
  )
}
