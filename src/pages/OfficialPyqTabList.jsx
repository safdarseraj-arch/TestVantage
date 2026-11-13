/**
 * Official PYQ tab + paper rows. Owns filter so a tab click does not
 * re-render import tools, KaTeX preview, or extraction.
 */

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { getOfficialPyqExamLabel } from '../data/officialPyqSources'
import { localQualityListMark } from '../utils/officialPyqLocalQuality.js'
import {
  countOfficialPyqPendingByStatus,
  listOfficialPyqPendingSummaries,
  officialPyqPaperQuestionCount,
} from '../utils/officialPyqPendingStore'

const TABS = [
  ['pending_review', 'Pending approval'],
  ['approved', 'Approved'],
  ['published', 'Published'],
  ['rejected', 'Rejected'],
  ['all', 'All'],
]

const UI_KEY = 'testvantage-official-pyq-ui'

const VALID_FILTERS = new Set(TABS.map(([id]) => id))

function readUi(key = UI_KEY) {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeUi(patch, key = UI_KEY) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ ...readUi(key), ...patch }))
  } catch {
    /* ignore */
  }
}

function statusLabel(status) {
  if (status === 'pending_review') return 'Pending approval'
  if (status === 'approved') return 'Approved'
  if (status === 'published') return 'Published'
  if (status === 'rejected') return 'Rejected'
  return String(status || 'Unknown')
}

function rowKey(paper) {
  return String(paper?.id || paper?.paperId || paper?.paperLabel || '').trim()
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

function OfficialPyqTabList({
  kind = 'official',
  uiKey = UI_KEY,
  selectedId = null,
  listTick = 0,
  onOpen,
  onDelete,
  onQualityFix,
  qualityBusyId = '',
}) {
  const [filter, setFilter] = useState(() => {
    const saved = readUi(uiKey).filter
    return VALID_FILTERS.has(saved)
      ? saved
      : 'pending_review'
  })

  useEffect(() => {
    const saved = readUi(uiKey).filter
    if (VALID_FILTERS.has(saved)) {
      setFilter((cur) => (cur === saved ? cur : saved))
    }
  }, [listTick, uiKey])

  const papers = useMemo(() => {
    void listTick
    try {
      return listOfficialPyqPendingSummaries(filter === 'all' ? 'all' : filter, kind)
    } catch {
      return []
    }
  }, [filter, listTick, kind])

  const tabCounts = useMemo(() => {
    void listTick
    try {
      return countOfficialPyqPendingByStatus(kind)
    } catch {
      return {}
    }
  }, [listTick, kind])

  const changeFilter = useCallback((next) => {
    if (next === filter) return
    setFilter(next)
    writeUi({ filter: next }, uiKey)
  }, [filter, uiKey])

  return (
    <>
      <div className="bank-tabs official-pyq-list-tabs" role="tablist" aria-label="Paper lists">
        {TABS.map(([id, label]) => (
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

      {papers.length === 0 ? (
        <p className="form-hint">
          {filter === 'pending_review' &&
          (Number(tabCounts.approved) > 0 || Number(tabCounts.published) > 0 || Number(tabCounts.rejected) > 0)
            ? 'No papers waiting here. Click Approved, Published, or Rejected above — your papers moved there.'
            : 'No papers in this list yet.'}
        </p>
      ) : (
        <ul className="official-pyq-paper-list">
          {papers.map((p) => {
            const paperKey = rowKey(p)
            const isRowSelected = selectedId != null && paperKey === String(selectedId)
            return (
              <li
                key={paperKey}
                className={`official-pyq-paper-item${isRowSelected ? ' is-selected' : ''}`}
              >
                <div className="official-pyq-paper-row">
                  <button
                    type="button"
                    className="official-pyq-paper-open"
                    data-testid="official-pyq-open-row"
                    aria-expanded={isRowSelected}
                    onPointerDown={(e) => {
                      if (e.button != null && e.button !== 0) return
                      e.preventDefault()
                      e.stopPropagation()
                      onOpen(p)
                    }}
                    onClick={(e) => {
                      if (e.detail > 0) return
                      e.preventDefault()
                      e.stopPropagation()
                      onOpen(p)
                    }}
                  >
                    <span className="official-pyq-paper-pick">{paperListTitle(p)}</span>
                    <span className="bank-review-badge">
                      {statusLabel(p.status)} · {officialPyqPaperQuestionCount(p)} Q ·{' '}
                      {getOfficialPyqExamLabel(p.exam)} {p.year}
                      {p.session ? ` · ${p.session}` : ''}
                    </span>
                    <span className="cc-sub official-pyq-paper-source">{p.sourceLabel}</span>
                    {localQualityListMark(p.localQuality) ? (
                      <span className="cc-sub" data-testid="official-pyq-local-quality">
                        {localQualityListMark(p.localQuality)}
                      </span>
                    ) : p.status === 'pending_review' ? (
                      <span className="cc-sub" data-testid="official-pyq-local-quality">
                        Quality check by local AI is running
                      </span>
                    ) : null}
                    <span className="official-pyq-open-label">Open preview</span>
                  </button>
                  {p.status === 'pending_review' || p.status === 'rejected' ? (
                    <div className="official-pyq-row-actions">
                      {p.status === 'pending_review' && onQualityFix ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          data-testid="official-pyq-quality-rerun"
                          disabled={qualityBusyId === paperKey}
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            onQualityFix(p)
                          }}
                        >
                          {qualityBusyId === paperKey ? 'Checking…' : 'Run quality check and fix'}
                        </button>
                      ) : null}
                      {onDelete ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm official-pyq-row-remove"
                          onClick={() => onDelete(p)}
                        >
                          {p.status === 'rejected' ? 'Delete permanently' : 'Remove from list'}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

export default memo(OfficialPyqTabList)
