import { useCallback, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import PortalPage from '../components/PortalPage.jsx'
import { PERMS } from '../utils/permissions'
import { loadUploadedQuestions, peekUploadedQuestions } from '../utils/questionBank.js'
import {
  canAccessMainQuestionBank,
  filterQuestionsForTeacherScope,
} from '../utils/teacherQuestionBank.js'
import {
  buildLecturePlanLocal,
  narrateLecturePlan,
  suggestedQuestionCount,
} from '../utils/lecturePlannerAi.js'
import { markQuestionAsLecture, LECTURE_UPLOAD_LINKS, LECTURE_SOURCE } from '../utils/lectureQuestions.js'
import { questionBankUploadUrl } from '../utils/questionBankUploadRoutes.js'
import { getSubjectsForPattern } from '../data/subjects'
import { hierarchyFields } from '../utils/bankListFilters.js'

/**
 * Lecture Planner — AI helps build a classroom plan, pick bank questions, and teaching order.
 */
export default function LecturePlanner() {
  const { isAdmin, isTeacher, isLoggedIn, hasPermission, session } = useAuth()
  const canUpload = isAdmin || hasPermission(PERMS.UPLOAD_QUESTIONS)
  const accessMain = isAdmin || canAccessMainQuestionBank(session)

  const [subject, setSubject] = useState('mathematics')
  const [chapter, setChapter] = useState('')
  const [topic, setTopic] = useState('')
  const [durationMinutes, setDurationMinutes] = useState(45)
  const [classNote, setClassNote] = useState('')
  const [poolScope, setPoolScope] = useState('mine')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [result, setResult] = useState(/** @type {Awaited<ReturnType<typeof narrateLecturePlan>> | null} */ (null))
  const [tagMsg, setTagMsg] = useState('')

  const pool = useMemo(() => {
    const all = peekUploadedQuestions().length
      ? peekUploadedQuestions()
      : loadUploadedQuestions()
    if (accessMain && poolScope === 'main') return all.filter((q) => !q.isPassageHeader)
    return filterQuestionsForTeacherScope(all, {
      session,
      forceMine: true,
    }).filter((q) => !q.isPassageHeader)
  }, [session, accessMain, poolScope])

  const chapterOptions = useMemo(() => {
    const set = new Set()
    for (const q of pool) {
      const ch = hierarchyFields(q).chapter
      if (ch) set.add(ch)
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [pool])

  const topicOptions = useMemo(() => {
    const set = new Set()
    for (const q of pool) {
      const h = hierarchyFields(q)
      if (chapter && h.chapter !== chapter) continue
      if (h.topic) set.add(h.topic)
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [pool, chapter])

  const subjects = getSubjectsForPattern('jee-advanced')

  if (!isLoggedIn) {
    return <Navigate to="/login" state={{ from: '/teacher/lecture-planner' }} replace />
  }
  if (!isTeacher && !isAdmin) {
    return <Navigate to="/home" replace />
  }
  if (!canUpload) {
    return <Navigate to="/teacher" replace />
  }

  const handleBuild = async (e) => {
    e.preventDefault()
    setError('')
    setTagMsg('')
    setLoading(true)
    setResult(null)
    try {
      const local = buildLecturePlanLocal({
        pool,
        subject,
        chapter,
        topic,
        durationMinutes,
        classNote,
        maxQuestions: suggestedQuestionCount(durationMinutes),
      })
      const narrated = await narrateLecturePlan(local)
      setResult(narrated)
      setDetailsOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build lecture plan.')
    } finally {
      setLoading(false)
    }
  }

  const handleTagLecture = useCallback(() => {
    const ids = result?.plan?.questionIds ?? []
    if (!ids.length) return
    let n = 0
    for (const id of ids) {
      if (markQuestionAsLecture(id)) n += 1
    }
    setTagMsg(
      n
        ? `Tagged ${n} question(s) as “${LECTURE_SOURCE}” for your lecture set.`
        : 'Could not tag questions.',
    )
  }, [result])

  const plan = result?.plan

  return (
    <PortalPage
      role="teacher"
      eyebrow="Teacher · Lecture Planner"
      title="Lecture Planner"
      subtitle="AI helps you plan the class, pick questions from your bank, suggest teaching order, and draft topic notes."
      actions={
        <>
          <Link to="/teacher" className="btn btn-ghost btn-sm">
            ← Teacher home
          </Link>
          <Link to="/teacher/lecture-questions" className="btn btn-ghost btn-sm">
            Lecture set
          </Link>
          <Link
            to={questionBankUploadUrl({ owner: 'teacher', from: 'lecture-planner', source: LECTURE_SOURCE })}
            className="btn btn-primary btn-sm"
          >
            Upload questions
          </Link>
        </>
      }
      className="lecture-planner-page"
    >
      <form className="lecture-planner-form card" onSubmit={handleBuild}>
        <h2>Plan inputs</h2>
        <p className="form-hint">
          Pool: <strong>{pool.length}</strong> question(s)
          {accessMain ? (
            <>
              {' · '}
              <label className="lecture-planner-inline">
                <select
                  value={poolScope}
                  onChange={(e) => setPoolScope(e.target.value === 'main' ? 'main' : 'mine')}
                >
                  <option value="mine">My bank</option>
                  <option value="main">Main bank</option>
                </select>
              </label>
            </>
          ) : (
            ' · your private bank (ask admin for main bank access)'
          )}
        </p>

        <div className="lecture-planner-grid">
          <label>
            Subject
            <select value={subject} onChange={(e) => setSubject(e.target.value)}>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Chapter
            <input
              list="lecture-planner-chapters"
              value={chapter}
              onChange={(e) => setChapter(e.target.value)}
              placeholder="e.g. Limits"
            />
            <datalist id="lecture-planner-chapters">
              {chapterOptions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label>
            Topic
            <input
              list="lecture-planner-topics"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. L’Hôpital"
            />
            <datalist id="lecture-planner-topics">
              {topicOptions.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </label>
          <label>
            Duration (minutes)
            <input
              type="number"
              min={15}
              max={120}
              step={5}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value) || 45)}
            />
          </label>
        </div>

        <label>
          Extra note for this class (optional)
          <textarea
            rows={2}
            value={classNote}
            onChange={(e) => setClassNote(e.target.value)}
            placeholder="e.g. Weak batch on algebra — keep warm-up gentle"
          />
        </label>

        <div className="lecture-planner-actions">
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Building plan…' : 'Build lecture plan with AI'}
          </button>
          <Link to={LECTURE_UPLOAD_LINKS.image} className="btn btn-ghost btn-sm">
            Need more questions? Upload
          </Link>
        </div>
        {error ? <p className="upload-error">{error}</p> : null}
      </form>

      {plan ? (
        <section className="lecture-planner-result card" aria-live="polite">
          <div className="lecture-planner-result-head">
            <h2>{plan.title}</h2>
            <span className="lecture-planner-ai-badge" title="Assisted wording">
              {result.badge || 'AI'}
            </span>
          </div>

          <h3>Topic to teach</h3>
          <p className="lecture-planner-short">{plan.shortDescription}</p>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setDetailsOpen((o) => !o)}
          >
            {detailsOpen ? 'Hide detailed notes' : 'Show detailed notes'}
          </button>

          {detailsOpen ? (
            <pre className="lecture-planner-details">{plan.detailedNotes}</pre>
          ) : null}

          <h3>Suggested teaching order</h3>
          {plan.teachingOrder.length === 0 ? (
            <p className="form-hint">
              No matching questions yet.{' '}
              <Link to={questionBankUploadUrl({ owner: 'teacher', from: 'lecture-planner', tab: 'single' })}>
                Upload via the shared Question Bank path
              </Link>
              .
            </p>
          ) : (
            <ol className="lecture-planner-order">
              {plan.teachingOrder.map((row) => (
                <li key={row.id}>
                  <div>
                    <strong>
                      {row.order}. {row.role}
                    </strong>
                    <span className="form-hint">{row.reason}</span>
                    <p>{row.snippet}</p>
                  </div>
                  <Link
                    to={`/question-bank?hub=view&view=draft&owner=teacher&edit=${encodeURIComponent(row.id)}`}
                    className="btn btn-ghost btn-sm"
                  >
                    Open
                  </Link>
                </li>
              ))}
            </ol>
          )}

          <div className="lecture-planner-result-actions">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!plan.questionIds?.length}
              onClick={handleTagLecture}
            >
              Assign picks to lecture set
            </button>
            <Link to="/teacher/lecture-questions" className="btn btn-ghost btn-sm">
              View lecture set
            </Link>
            <Link to="/create-test?pool=mine" className="btn btn-ghost btn-sm">
              Create paper from my bank
            </Link>
          </div>
          {tagMsg ? <p className="form-hint lecture-msg">{tagMsg}</p> : null}
          {result.cloudError ? (
            <p className="form-hint">AI used your on-device plan ({result.cloudError}).</p>
          ) : null}
        </section>
      ) : null}
    </PortalPage>
  )
}
