/**
 * Tiny first paint for /official-pyq — paper list only, no Mathpix/Gemini/heal imports.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  listOfficialPyqPendingSummaries,
  countOfficialPyqPendingByStatus,
  officialPyqPaperQuestionCount,
  countOfficialPyqPendingReview,
} from '../utils/officialPyqPendingStore'
import { getOfficialPyqExamLabel } from '../data/officialPyqSources'

const OFFICIAL_PYQ_UI_KEY = 'testvantage-official-pyq-ui'

function readOfficialPyqUi() {
  try {
    const raw = sessionStorage.getItem(OFFICIAL_PYQ_UI_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeOfficialPyqUi(patch) {
  try {
    sessionStorage.setItem(OFFICIAL_PYQ_UI_KEY, JSON.stringify({ ...readOfficialPyqUi(), ...patch }))
  } catch {
    /* ignore quota */
  }
}

function officialPyqStatusLabel(status) {
  switch (status) {
    case 'pending_review':
      return 'Pending approval'
    case 'approved':
      return 'Published PYQ'
    case 'rejected':
      return 'Rejected'
    default:
      return String(status || 'Unknown')
  }
}

function paperQuestionCount(paper) {
  return officialPyqPaperQuestionCount(paper)
}

/** Show Paper 1 / Paper 2 even when paperLabel is only "JEE Advanced 2024". */
function paperListTitle(paper) {
  const label = String(paper?.paperLabel || '').trim() || 'Paper'
  const session = String(paper?.session || '').trim()
  if (!session) return label
  const sessionNorm = session.replace(/\s+/g, ' ')
  if (new RegExp(sessionNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*'), 'i').test(label)) {
    return label
  }
  return `${label} · ${sessionNorm}`
}

export default function OfficialPyqPendingBootstrap({
  toolsLoading = false,
  toolsError = '',
  onRetryTools,
}) {
  const [tick, setTick] = useState(0)
  const bump = useCallback(() => setTick((t) => t + 1), [])
  const [filter, setFilter] = useState(() => {
    const saved = readOfficialPyqUi().filter
    return saved === 'all' || saved === 'approved' || saved === 'rejected' || saved === 'pending_review'
      ? saved
      : 'pending_review'
  })
  const [listReady, setListReady] = useState(false)
  const [listError, setListError] = useState('')
  const [queuedOpenId, setQueuedOpenId] = useState(() => String(readOfficialPyqUi().openId ?? '').trim())

  useEffect(() => {
    let cancelled = false
    try {
      void listOfficialPyqPendingSummaries('all')
      setListError('')
      setListReady(true)
    } catch {
      setListReady(true)
      setListError('Could not load — retry')
    }
    return () => {
      cancelled = true
    }
  }, [tick])

  const papers = useMemo(() => {
    void tick
    if (!listReady) return []
    try {
      return listOfficialPyqPendingSummaries(filter === 'all' ? 'all' : filter)
    } catch {
      return []
    }
  }, [tick, filter, listReady])

  const pendingCount = useMemo(() => {
    void tick
    if (!listReady) return 0
    try {
      return countOfficialPyqPendingReview()
    } catch {
      return 0
    }
  }, [tick, listReady])

  const tabCounts = useMemo(() => {
    void tick
    if (!listReady) return {}
    try {
      return countOfficialPyqPendingByStatus()
    } catch {
      return {}
    }
  }, [tick, listReady])

  const changeFilter = useCallback((next) => {
    if (next === filter) return
    setFilter(next)
    setQueuedOpenId((id) => (id ? '' : id))
    writeOfficialPyqUi({ filter: next, openId: null })
  }, [filter])

  const queueOpenPaper = useCallback((paper) => {
    const openId = String(paper.id || paper.paperId || paper.paperLabel || '').trim()
    if (!openId) return
    setQueuedOpenId(openId)
    writeOfficialPyqUi({ openId, filter })
  }, [filter])

  return (
    <div className="page official-pyq-page">
      <header className="page-header">
        <h1>Approve official papers</h1>
        <p className="form-hint">
          Pull or upload <strong>official</strong> previous-year papers (NTA / JEE Advanced archive). They stay in
          this separate bank until you <strong>Approve &amp; publish</strong> — then they go to student{' '}
          <Link to="/pyq">PYQ Bank</Link> and Question Bank. Coaching-site scrapes are not allowed.
        </p>
        <p className="form-hint">
          <Link to="/pyq">PYQ Bank</Link>
          {' · '}
          <Link to="/question-bank">Question Bank</Link>
          {' · '}
          <span className="bank-review-badge bank-review-badge-needs-review">
            {pendingCount} pending approval
          </span>
        </p>
      </header>

      {toolsError ? (
        <section className="card official-pyq-tools-status">
          <p className="upload-error">
            {toolsError}{' '}
            {typeof onRetryTools === 'function' ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={onRetryTools}>
                Retry
              </button>
            ) : null}
          </p>
        </section>
      ) : toolsLoading ? (
        <section className="card official-pyq-tools-status">
          <p className="form-hint" role="status">
            Loading import and review tools…
          </p>
        </section>
      ) : null}

      <section className="card official-pyq-list">
        <h2>2. Review &amp; approve</h2>
        {listError ? (
          <p className="upload-error">
            {listError}{' '}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setListError('')
                setListReady(false)
                bump()
              }}
            >
              Retry
            </button>
          </p>
        ) : null}
        {!listReady && !listError ? (
          <p className="form-hint" role="status">
            Loading paper list…
          </p>
        ) : null}
        <div className="bank-tabs official-pyq-list-tabs" role="tablist" aria-label="Paper lists">
          {[
            ['pending_review', 'Pending approval'],
            ['approved', 'Published PYQ'],
            ['rejected', 'Rejected'],
            ['all', 'All'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={filter === id}
              data-testid={`official-pyq-tab-${id}`}
              className={`bank-tab${filter === id ? ' active' : ''}`}
              onPointerDown={(e) => {
                if (e.button != null && e.button !== 0) return
                e.preventDefault()
                e.stopPropagation()
                changeFilter(id)
              }}
              onClick={(e) => {
                if (e.detail > 0) return
                e.preventDefault()
                e.stopPropagation()
                changeFilter(id)
              }}
            >
              {label}
              {tabCounts[id] != null ? ` (${tabCounts[id]})` : ''}
            </button>
          ))}
        </div>

        {queuedOpenId && toolsLoading ? (
          <p className="form-hint" role="status">
            Preview is queued. It opens as soon as review tools finish loading.
          </p>
        ) : null}
        {listReady && papers.length === 0 && !listError ? (
          <p className="form-hint">No papers in this list yet.</p>
        ) : listReady && papers.length > 0 ? (
          <ul className="official-pyq-paper-list">
            {papers.map((p) => (
              <li key={p.id || p.paperId || p.paperLabel} className="official-pyq-paper-item">
                <div className="official-pyq-paper-row">
                  <button
                    type="button"
                    className="official-pyq-paper-open"
                    data-testid="official-pyq-open-row"
                    onPointerDown={(e) => {
                      if (e.button != null && e.button !== 0) return
                      e.preventDefault()
                      e.stopPropagation()
                      queueOpenPaper(p)
                    }}
                    onClick={(e) => {
                      if (e.detail > 0) return
                      e.preventDefault()
                      e.stopPropagation()
                      queueOpenPaper(p)
                    }}
                  >
                    <span className="official-pyq-paper-pick">{paperListTitle(p)}</span>
                    <span className="bank-review-badge">
                      {officialPyqStatusLabel(p.status)} · {paperQuestionCount(p)} Q ·{' '}
                      {getOfficialPyqExamLabel(p.exam)} {p.year}
                      {p.session ? ` · ${p.session}` : ''}
                    </span>
                    <span className="cc-sub official-pyq-paper-source">{p.sourceLabel}</span>
                    <span className="official-pyq-open-label">
                      {queuedOpenId && String(p.id || p.paperId || p.paperLabel || '') === queuedOpenId
                        ? 'Opening preview…'
                        : 'Open preview'}
                    </span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  )
}
