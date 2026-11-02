/**
 * Upload any named paper (not Official PYQ). Same extract/clean as official,
 * then review and Approve & Publish.
 */

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ANY_PAPER_FILE_ACCEPT,
  importAnyPaperFile,
} from '../utils/anyPaperImport.js'
import {
  countFilledAnyPaperQuestions,
  getAnyPaperPending,
  listAnyPaperPending,
  removeAnyPaperPending,
  updateAnyPaperPending,
} from '../utils/anyPaperPendingStore.js'
import { approveAnyPaperAsync, unapproveAnyPaper, validateAnyPaperForApprove } from '../utils/anyPaperApproval.js'
import {
  namedPaperTitleError,
  normalizeNamedPaperTitle,
  suggestedPaperNameFromFile,
} from '../utils/bankMathpixUpload.js'
import { localQualityListMark } from '../utils/officialPyqLocalQuality.js'
import { officialPyqContentReviewMessages } from '../utils/officialPyqReviewFlags.js'
import { peelOfficialPyqCardForDisplay } from '../utils/passage.js'
import { formatOfficialPyqProgress } from '../utils/pyqGeminiExtract.js'
import { healUploadQuestionCard } from '../utils/uploadQualityGuards.js'

const OfficialPyqPreviewMath = lazy(() => import('./OfficialPyqPreviewMath.jsx'))

export default function AnyPaperPending() {
  const [paperName, setPaperName] = useState('')
  const [nameError, setNameError] = useState('')
  const [pendingFile, setPendingFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [approveBusy, setApproveBusy] = useState(false)
  const [progressPct, setProgressPct] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)
  const [selectedId, setSelectedId] = useState(null)
  const [page, setPage] = useState(0)
  const fileRef = useRef(null)

  const papers = useMemo(() => {
    void tick
    return listAnyPaperPending()
  }, [tick])
  const selected = selectedId ? getAnyPaperPending(selectedId) : null
  const filled = countFilledAnyPaperQuestions(selected?.questions)
  const questions = Array.isArray(selected?.questions) ? selected.questions : []
  const current = questions[page] || null
  const contentErrors = useMemo(() => {
    if (!questions.length) return []
    const ocr = selected?.preparedText || ''
    const shown = questions.map((q) => {
      try {
        return peelOfficialPyqCardForDisplay(healUploadQuestionCard(q, ocr), ocr)
      } catch {
        return q
      }
    })
    return officialPyqContentReviewMessages(shown)
  }, [questions, selected?.preparedText])
  const qualityFailedNums = Array.isArray(selected?.localQuality?.failedGoTo)
    ? selected.localQuality.failedGoTo
    : []
  const qualityPassed =
    selected?.localQuality?.passed === true &&
    qualityFailedNums.length === 0 &&
    contentErrors.length === 0
  const gate = selected ? validateAnyPaperForApprove(selected) : { ok: false, errors: [] }
  const canApprove = Boolean(gate.ok && qualityPassed)

  useEffect(() => {
    if (!selected?.id || !contentErrors.length) return
    if (selected.localQuality?.passed !== true) return
    updateAnyPaperPending(selected.id, {
      localQuality: { ...selected.localQuality, passed: false },
    })
    setTick((t) => t + 1)
  }, [selected?.id, selected?.localQuality, contentErrors])

  function askFile(file) {
    if (!file) return
    const named = normalizeNamedPaperTitle(paperName) || suggestedPaperNameFromFile(file)
    if (!normalizeNamedPaperTitle(paperName) && named) {
      setPaperName(named)
    }
    const err = namedPaperTitleError(named)
    if (err) {
      setPendingFile(file)
      setNameError(err)
      setError('')
      return
    }
    setPendingFile(file)
    setNameError('')
    setError('')
    void startUpload(file, named)
  }

  async function startUpload(fileArg, nameArg) {
    const file = fileArg || pendingFile
    const named = normalizeNamedPaperTitle(nameArg || paperName)
    const err = namedPaperTitleError(named)
    if (err) {
      setNameError(err)
      return
    }
    if (!file) {
      setError('Pick a PDF or image first.')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    setProgressPct(2)
    setProgressLabel('Starting...')
    try {
      const { paper, filled: n } = await importAnyPaperFile(
        file,
        { paperName: named },
        {
          onProgress: (pct, label) => {
            const formatted = formatOfficialPyqProgress(pct, label)
            if (formatted.pct >= 0) setProgressPct(formatted.pct)
            if (formatted.label) setProgressLabel(formatted.label)
          },
        },
      )
      setSelectedId(paper.id)
      setPage(0)
      setPendingFile(null)
      setMessage(
        `Extracted ${n} question(s) into "${paper.paperName}". Review the cards, then Approve & Publish. Nothing is published yet.`,
      )
      setTick((t) => t + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setBusy(false)
      setProgressPct(0)
      setProgressLabel('')
    }
  }

  async function onApprove() {
    if (!selected || approveBusy) return
    setApproveBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await approveAnyPaperAsync(selected.id, {
        onProgress: (pct, label) => {
          setProgressPct(pct)
          setProgressLabel(label)
        },
      })
      if (!result.ok) {
        setError(result.errors.join(' ') || 'Could not approve.')
        return
      }
      setMessage(
        `Published ${result.bankCount} question(s) to the Question Bank under "${selected.paperName}".`,
      )
      setTick((t) => t + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not approve.')
    } finally {
      setApproveBusy(false)
      setProgressPct(0)
      setProgressLabel('')
    }
  }

  return (
    <div className="page official-pyq-page" data-testid="any-paper-page">
      <header className="page-header">
        <h1>Upload any paper</h1>
        <p className="form-hint">
          Add a class test, mock, or school paper. This is <strong>not</strong> Official PYQ.
          Extract and clean use the same Local AI as official papers. Review the cards, then
          <strong> Approve &amp; Publish</strong>.
          {' '}
          Official archive stays on <Link to="/official-pyq">Approve official papers</Link>.
        </p>
      </header>

      {error ? <p className="upload-error">{error}</p> : null}
      {message ? <p className="form-hint upload-success-hint">{message}</p> : null}

      <section className="card official-pyq-import">
        <h2>1. Name and upload</h2>
        <label>
          Name of this paper
          <input
            type="text"
            value={paperName}
            onChange={(e) => {
              setPaperName(e.target.value)
              if (nameError) setNameError('')
            }}
            placeholder="e.g. Class test 12 April"
            data-testid="any-paper-name-input"
          />
        </label>
        {nameError ? (
          <p className="upload-error" role="alert">
            {nameError}
          </p>
        ) : (
          <p className="form-hint">Required. Cards are saved under this name.</p>
        )}
        <div className="official-pyq-actions">
          <label
            className="btn btn-primary btn-sm"
            onClick={(e) => {
              const err = namedPaperTitleError(paperName)
              if (err) {
                e.preventDefault()
                setNameError(err)
              }
            }}
          >
            {busy ? progressLabel || 'Working...' : 'Upload paper'}
            <input
              ref={fileRef}
              type="file"
              accept={ANY_PAPER_FILE_ACCEPT}
              hidden
              disabled={busy}
              data-testid="any-paper-file"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) askFile(f)
              }}
            />
          </label>
          {pendingFile && !busy ? (
            <button type="button" className="btn btn-primary" onClick={() => void startUpload()}>
              Extract "{normalizeNamedPaperTitle(paperName) || 'this paper'}"
            </button>
          ) : null}
        </div>
        {pendingFile ? <p className="form-hint">File: {pendingFile.name}</p> : null}
        {busy ? (
          <p className="official-pyq-progress" role="status">
            {progressLabel} {Math.round(progressPct)}%
          </p>
        ) : null}
      </section>

      <section className="card official-pyq-list">
        <h2>2. Review pending papers</h2>
        {papers.length === 0 ? (
          <p className="form-hint">No named papers yet.</p>
        ) : (
          <ul className="official-pyq-paper-list">
            {papers.map((p) => (
              <li key={p.id} className="official-pyq-paper-item">
                <button
                  type="button"
                  className="official-pyq-paper-open"
                  onClick={() => {
                    setSelectedId(p.id)
                    setPage(0)
                  }}
                >
                  <strong>{p.paperName}</strong>
                  {' '}
                  <span className="cc-sub">
                    {p.status === 'approved' ? 'Published' : 'Pending review'} ·{' '}
                    {countFilledAnyPaperQuestions(p.questions)} Q
                  </span>
                  {localQualityListMark(p.localQuality) ? (
                    <span className="cc-sub" data-testid="any-paper-local-quality">
                      {localQualityListMark(p.localQuality)}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    if (window.confirm(`Remove "${p.paperName}" from this list?`)) {
                      removeAnyPaperPending(p.id)
                      if (selectedId === p.id) setSelectedId(null)
                      setTick((t) => t + 1)
                    }
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected ? (
        <section className="card official-pyq-preview-panel">
          <h3>Preview -- {selected.paperName}</h3>
          <p className="form-hint" role="status">
            {filled} filled question(s). Not published until you click Approve &amp; Publish.
          </p>
          {questions.length ? (
            <>
              <p className="form-hint">
                Question {page + 1} of {questions.length}
              </p>
              <div className="official-pyq-preview">
                <Suspense fallback={<p className="form-hint">Loading question...</p>}>
                  <OfficialPyqPreviewMath q={current} sourceText={selected.preparedText || ''} />
                </Suspense>
              </div>
              <div className="official-pyq-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={page <= 0}
                  onClick={() => setPage((n) => Math.max(0, n - 1))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={page >= questions.length - 1}
                  onClick={() => setPage((n) => Math.min(questions.length - 1, n + 1))}
                >
                  Next
                </button>
              </div>
            </>
          ) : (
            <p className="form-hint">No cards yet. Upload the paper file above.</p>
          )}
          {selected.localQuality || contentErrors.length || gate.errors.some((line) => /Quality checked|Quality check/i.test(line)) ? (
            <p
              className={qualityPassed ? 'form-hint' : 'upload-error'}
              data-testid="any-paper-quality"
            >
              {qualityPassed
                ? localQualityListMark(selected.localQuality)
                : contentErrors.length
                  ? `Quality checked by local AI — not passed. ${contentErrors.join(' ')}`
                  : localQualityListMark(selected.localQuality) ||
                    'Quality check by local AI has not passed.'}
            </p>
          ) : null}
          {selected.status === 'pending_review' ? (
            <div className="official-pyq-actions">
              {approveBusy ? (
                <p className="official-pyq-progress" role="status">
                  {progressLabel} {Math.round(progressPct)}%
                </p>
              ) : null}
              <button
                type="button"
                className="btn btn-primary"
                data-testid="any-paper-approve"
                disabled={!canApprove || approveBusy}
                onClick={() => void onApprove()}
              >
                {approveBusy ? 'Publishing...' : 'Approve & Publish'}
              </button>
            </div>
          ) : null}
          {selected.status === 'approved' || gate.errors.some((line) => /already published/i.test(line)) ? (
            <div className="official-pyq-actions">
              <p className="form-hint">This paper is already published. Unapprove it before approving again.</p>
              <button
                type="button"
                className="btn btn-ghost"
                data-testid="any-paper-unapprove"
                onClick={() => {
                  const result = unapproveAnyPaper(selected.id)
                  if (!result.ok) {
                    setError(result.error || 'Could not unapprove.')
                    return
                  }
                  setMessage(`"${selected.paperName}" is back in review. It is not published.`)
                  setTick((t) => t + 1)
                }}
              >
                Unapprove
              </button>
            </div>
          ) : null}
          {!gate.ok && selected.status === 'pending_review' ? (
            <p className="upload-error" data-testid="any-paper-approve-error">
              {gate.errors.join(' ')}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
