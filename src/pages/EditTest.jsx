import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getExamPattern } from '../data/examPatterns'
import { getTestType } from '../data/testTypes'
import { loadCustomTests, removeCustomTest, publishCustomTest } from '../utils/customTests'
import { getTestPublishStatus } from '../utils/paperPublish.js'

/** @typedef {'modify' | 'delete' | 'none'} PaperAction */

export default function EditTest() {
  const navigate = useNavigate()
  const [revision, setRevision] = useState(0)
  const [actions, setActions] = useState(/** @type {Record<string, PaperAction>} */ ({}))
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const papers = useMemo(() => {
    void revision
    return loadCustomTests()
  }, [revision])

  const setAction = (id, action) => {
    setActions((prev) => ({ ...prev, [id]: action }))
    setMessage('')
    setError('')
  }

  const handleEditNow = (id) => {
    navigate(`/create-test?edit=${encodeURIComponent(id)}`)
  }

  const handlePublishNow = (test) => {
    const result = publishCustomTest(test.id)
    if (!result.ok) {
      setError(result.error ?? 'Could not publish.')
      setMessage('')
      return
    }
    setError('')
    setMessage(`Published "${test.title}" — open manifest to save PDF.`)
    setRevision((n) => n + 1)
    navigate(`/paper-manifest/${encodeURIComponent(test.id)}`)
  }

  const handleDeleteNow = (test) => {
    const ok = window.confirm(
      `Delete "${test.title}"?\n\nQuestions stay in the Question Bank. Only this paper is removed.`,
    )
    if (!ok) return
    removeCustomTest(test.id)
    setActions((prev) => {
      const next = { ...prev }
      delete next[test.id]
      return next
    })
    setMessage(`Deleted "${test.title}".`)
    setError('')
    setRevision((n) => n + 1)
  }

  const handleApply = () => {
    setMessage('')
    setError('')

    const toDelete = papers.filter((p) => actions[p.id] === 'delete')
    const toModify = papers.filter((p) => actions[p.id] === 'modify')

    if (!toDelete.length && !toModify.length) {
      setMessage('No changes selected — all papers left as they are.')
      return
    }

    if (toModify.length > 1) {
      setError('Choose Modify for only one paper at a time, then click Apply. Or use Edit now on a single row.')
      return
    }

    toDelete.forEach((p) => removeCustomTest(p.id))

    if (toDelete.length) {
      setMessage(
        toModify.length
          ? `Deleted ${toDelete.length} paper(s). Opening editor…`
          : `Deleted ${toDelete.length} paper(s).`,
      )
      setActions({})
      setRevision((n) => n + 1)
    }

    if (toModify.length === 1) {
      navigate(`/create-test?edit=${encodeURIComponent(toModify[0].id)}`)
      return
    }

    if (toDelete.length) {
      setActions({})
    }
  }

  return (
    <div className="page edit-test-page">
      <header className="edit-test-hero">
        <div>
          <p className="tests-eyebrow">Paper manager</p>
          <h1>Edit test papers</h1>
          <p className="tests-lead">
            Pick an action for each paper you created: modify, delete, or leave unchanged. Then click
            Apply changes — or use the buttons on each row for a quick action.
          </p>
        </div>
        <div className="tests-hero-actions">
          <Link to="/home" className="btn btn-ghost btn-sm">
            ← Dashboard
          </Link>
          <Link to="/create-test" className="btn btn-primary btn-sm">
            + Create new paper
          </Link>
        </div>
      </header>

      {message && <p className="upload-success edit-test-banner">{message}</p>}
      {error && <p className="upload-error edit-test-banner">{error}</p>}

      {papers.length === 0 ? (
        <div className="card edit-test-empty">
          <span className="tests-empty-icon">📝</span>
          <strong>No papers to edit yet</strong>
          <p>Create a paper first, then return here to modify or delete it.</p>
          <Link to="/create-test" className="btn btn-primary btn-sm">
            Create test paper
          </Link>
        </div>
      ) : (
        <>
          <p className="edit-test-count">
            {papers.length} paper{papers.length === 1 ? '' : 's'} — default is <strong>No change</strong>
          </p>

          <ul className="edit-test-list">
            {papers.map((test) => {
              const pattern = getExamPattern(test.examPatternId)
              const type = getTestType(test.testTypeId)
              const action = actions[test.id] ?? 'none'
              const publishStatus = getTestPublishStatus(test)
              const isDraft = publishStatus === 'draft'
              return (
                <li key={test.id} className={`edit-test-row card ${action !== 'none' ? 'edit-test-row--active' : ''}`}>
                  <div className="edit-test-row-main">
                    <div className="edit-test-badges">
                      <span className="badge badge-exam" style={{ background: pattern.color }}>
                        {pattern.shortName}
                      </span>
                      <span className="badge badge-type">
                        {type.icon} {type.name}
                      </span>
                      {isDraft ? (
                        <span className="badge badge-draft">Draft</span>
                      ) : (
                        <span className="badge badge-published">
                          Published{test.qualityScore != null ? ` · TQS ${test.qualityScore}` : ''}
                        </span>
                      )}
                    </div>
                    <h2 className="edit-test-title">{test.title}</h2>
                    <p className="edit-test-meta">
                      {test.totalQuestions} questions · {test.durationMinutes} min ·{' '}
                      {pattern.name}
                    </p>
                    {test.description && <p className="form-hint edit-test-desc">{test.description}</p>}
                  </div>

                  <fieldset className="edit-test-actions">
                    <legend className="sr-only">Action for {test.title}</legend>
                    <label className={`edit-test-choice ${action === 'modify' ? 'selected' : ''}`}>
                      <input
                        type="radio"
                        name={`action-${test.id}`}
                        checked={action === 'modify'}
                        onChange={() => setAction(test.id, 'modify')}
                      />
                      <span>1. Modify / Edit</span>
                    </label>
                    <label className={`edit-test-choice edit-test-choice--danger ${action === 'delete' ? 'selected' : ''}`}>
                      <input
                        type="radio"
                        name={`action-${test.id}`}
                        checked={action === 'delete'}
                        onChange={() => setAction(test.id, 'delete')}
                      />
                      <span>2. Delete</span>
                    </label>
                    <label className={`edit-test-choice ${action === 'none' ? 'selected' : ''}`}>
                      <input
                        type="radio"
                        name={`action-${test.id}`}
                        checked={action === 'none'}
                        onChange={() => setAction(test.id, 'none')}
                      />
                      <span>3. No change</span>
                    </label>
                  </fieldset>

                  <div className="edit-test-quick">
                    {isDraft && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => navigate(`/publish-review/${encodeURIComponent(test.id)}`)}
                      >
                        Full review & publish
                      </button>
                    )}
                    {isDraft && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => handlePublishNow(test)}
                      >
                        Quick publish
                      </button>
                    )}
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleEditNow(test.id)}>
                      Edit now
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm edit-test-quick-delete"
                      onClick={() => handleDeleteNow(test)}
                    >
                      Delete now
                    </button>
                    <Link to={`/exam/${test.id}`} className="btn btn-ghost btn-sm">
                      Preview
                    </Link>
                    {!isDraft && (
                      <Link
                        to={`/paper-manifest/${encodeURIComponent(test.id)}`}
                        className="btn btn-ghost btn-sm"
                      >
                        PDF manifest
                      </Link>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>

          <div className="edit-test-footer card">
            <p className="form-hint">
              Review your choices above. <strong>No change</strong> keeps the paper as it is. Deleting
              cannot be undone.
            </p>
            <div className="edit-test-footer-btns">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setActions({})
                  setMessage('All papers set to No change.')
                  setError('')
                }}
              >
                Reset all to No change
              </button>
              <button type="button" className="btn btn-primary" onClick={handleApply}>
                Apply changes
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
