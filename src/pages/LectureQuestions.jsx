import { useCallback, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import PortalPage from '../components/PortalPage.jsx'
import { PERMS } from '../utils/permissions'
import { loadUploadedQuestions, updateUploadedQuestion } from '../utils/questionBank.js'
import {
  LECTURE_SOURCE,
  LECTURE_UPLOAD_LINKS,
  isLectureQuestion,
  listLectureQuestions,
  markQuestionAsLecture,
} from '../utils/lectureQuestions.js'
import { effectiveBankStatus } from '../utils/questionUploadFilter.js'

function stemPreview(q) {
  const text = String(q?.text ?? q?.stem ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return '(Image / empty stem)'
  return text.length > 120 ? `${text.slice(0, 117)}…` : text
}

/**
 * Organise classroom / lecture questions (Source tag = Lecture).
 * Reuses the question bank store — no separate OCR pipeline.
 */
export default function LectureQuestions() {
  const { isAdmin, isTeacher, isLoggedIn, hasPermission, session } = useAuth()
  const [tick, setTick] = useState(0)
  const [tagId, setTagId] = useState('')
  const [message, setMessage] = useState('')

  const canUpload = isAdmin || hasPermission(PERMS.UPLOAD_QUESTIONS)
  const forceMine = isTeacher && !isAdmin

  const refresh = useCallback(() => {
    setTick((n) => n + 1)
  }, [])

  const lectureList = useMemo(() => {
    void tick
    const all = listLectureQuestions()
    if (!forceMine) return all
    const tid = String(session?.userId ?? '').trim()
    return all.filter((q) => !tid || String(q.uploadedById ?? '') === tid)
  }, [tick, forceMine, session?.userId])

  const untaggedCandidates = useMemo(() => {
    void tick
    let rows = loadUploadedQuestions().filter((q) => !isLectureQuestion(q) && !q.isPassageHeader)
    if (forceMine) {
      const tid = String(session?.userId ?? '').trim()
      rows = rows.filter((q) => !tid || String(q.uploadedById ?? '') === tid)
    }
    return rows.slice(0, 40)
  }, [tick, forceMine, session?.userId])

  if (!isLoggedIn) {
    return <Navigate to="/login" state={{ from: '/teacher/lecture-questions' }} replace />
  }
  if (!isTeacher && !isAdmin) {
    return <Navigate to="/home" replace />
  }
  if (!canUpload) {
    return <Navigate to="/teacher" replace />
  }

  const handleMark = (id) => {
    setMessage('')
    const ok = markQuestionAsLecture(id)
    if (ok) {
      setMessage(`Tagged as “${LECTURE_SOURCE}”.`)
      refresh()
    } else {
      setMessage('Could not update that question.')
    }
  }

  const handleUntag = (id) => {
    setMessage('')
    const ok = updateUploadedQuestion(id, { source: '' })
    if (ok) {
      setMessage('Removed Lecture tag.')
      refresh()
    } else {
      setMessage('Could not update that question.')
    }
  }

  const handleTagById = (e) => {
    e.preventDefault()
    const id = tagId.trim()
    if (!id) return
    handleMark(id)
    setTagId('')
  }

  return (
    <PortalPage
      role="teacher"
      eyebrow="Lecture questions"
      title="Organise lecture questions"
      subtitle={`Questions tagged Source = “${LECTURE_SOURCE}” stay in your bank but are easy to filter for classroom use.`}
      actions={
        <>
          <Link to="/teacher" className="btn btn-ghost btn-sm">
            ← Teacher home
          </Link>
          <Link to="/teacher/lecture-planner" className="btn btn-ghost btn-sm">
            Lecture Planner
          </Link>
          <Link to={LECTURE_UPLOAD_LINKS.bankView} className="btn btn-ghost btn-sm">
            Open in question bank
          </Link>
        </>
      }
      className="lecture-questions-page"
    >
      <section className="lecture-upload-row" aria-label="Add lecture questions">
        <h2>Add to lecture set</h2>
        <p className="form-hint">
          Uploads open the usual convert tools and set Source to “{LECTURE_SOURCE}” for you.
        </p>
        <div className="teacher-hub-upload-links">
          <Link to={LECTURE_UPLOAD_LINKS.image} className="teacher-hub-chip">
            From image
          </Link>
          <Link to={LECTURE_UPLOAD_LINKS.pdf} className="teacher-hub-chip">
            From PDF / Word
          </Link>
          <Link to={LECTURE_UPLOAD_LINKS.bulk} className="teacher-hub-chip">
            Bulk text
          </Link>
          <Link to={LECTURE_UPLOAD_LINKS.csv} className="teacher-hub-chip">
            CSV
          </Link>
        </div>
      </section>

      {message ? <p className="form-hint lecture-msg">{message}</p> : null}

      <section className="lecture-list-section">
        <div className="sl-section-head">
          <h2>Lecture set ({lectureList.length})</h2>
          <p>Edit or remove the Lecture tag anytime.</p>
        </div>
        {lectureList.length === 0 ? (
          <p className="form-hint">
            No lecture questions yet. Upload above, or tag an existing bank question below.
          </p>
        ) : (
          <ul className="lecture-q-list">
            {lectureList.map((q) => (
              <li key={q.id} className="lecture-q-item">
                <div>
                  <strong>{stemPreview(q)}</strong>
                  <span className="form-hint">
                    {[q.subject, q.chapter, effectiveBankStatus(q)].filter(Boolean).join(' · ')}
                  </span>
                </div>
                <div className="lecture-q-actions">
                  <Link
                    to={`/question-bank?hub=view&view=${effectiveBankStatus(q)}&edit=${encodeURIComponent(q.id)}`}
                    className="btn btn-ghost btn-sm"
                  >
                    Edit
                  </Link>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleUntag(q.id)}>
                    Remove tag
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="lecture-tag-section">
        <h2>Tag an existing question</h2>
        <form className="lecture-tag-form" onSubmit={handleTagById}>
          <label>
            Question ID
            <input
              type="text"
              value={tagId}
              onChange={(e) => setTagId(e.target.value)}
              placeholder="Paste question id from the bank"
            />
          </label>
          <button type="submit" className="btn btn-primary btn-sm">
            Mark as Lecture
          </button>
        </form>

        {untaggedCandidates.length > 0 ? (
          <>
            <p className="form-hint">Recent bank questions (not yet Lecture):</p>
            <ul className="lecture-q-list lecture-q-list--compact">
              {untaggedCandidates.map((q) => (
                <li key={q.id} className="lecture-q-item">
                  <div>
                    <strong>{stemPreview(q)}</strong>
                    <span className="form-hint">{q.subject || 'Untagged'}</span>
                  </div>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => handleMark(q.id)}>
                    Mark Lecture
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>
    </PortalPage>
  )
}
