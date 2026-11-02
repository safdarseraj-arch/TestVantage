import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import InsightPageHero from '../components/InsightPageHero'
import { EXAM_PULSE_CATEGORIES } from '../data/examPulseCurated.js'
import {
  formatExamPulseUpdatedAt,
  getExamPulseItems,
  getExamPulseMeta,
  getExamPulsePortals,
  getLikedExamPulseCategories,
  refreshExamPulseInBackground,
  scheduleExamPulseBackgroundRefresh,
  toggleLikedExamPulseCategory,
} from '../utils/examPulseBrain.js'
import { examPulseBadgeLabel, ensureWhyItMatters } from '../utils/examPulseNormalize.js'

/** @typedef {import('../data/examPulseCurated.js').ExamPulseCategory} ExamPulseCategory */

export default function ExamPulse() {
  const [items, setItems] = useState(() => getExamPulseItems())
  const [meta, setMeta] = useState(() => getExamPulseMeta())
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [category, setCategory] = useState(/** @type {ExamPulseCategory | 'all'} */ ('all'))
  const [liked, setLiked] = useState(() => getLikedExamPulseCategories())

  const syncLocal = () => {
    setItems(getExamPulseItems())
    setMeta(getExamPulseMeta())
  }

  useEffect(() => {
    scheduleExamPulseBackgroundRefresh()
    const t = setTimeout(() => syncLocal(), 2500)
    return () => clearTimeout(t)
  }, [])

  const onRefresh = async () => {
    setRefreshing(true)
    setError('')
    try {
      await refreshExamPulseInBackground({ force: true })
      syncLocal()
      const next = getExamPulseMeta()
      if (next.source === 'curated') {
        setError(
          'API briefing unreachable — showing curated official + student notes. Keep the bottom terminal open (F5), then refresh again.',
        )
      }
    } catch {
      setError('Refresh did not finish. Keep the bottom terminal open, then try again.')
    } finally {
      setRefreshing(false)
    }
  }

  const filtered = useMemo(() => {
    const base = category === 'all' ? items : items.filter((i) => i.category === category)
    if (!liked.length || category !== 'all') return base
    const rank = (cat) => (liked.includes(cat) ? 0 : 1)
    return [...base].sort((a, b) => rank(a.category) - rank(b.category))
  }, [items, category, liked])

  const portals = getExamPulsePortals()

  return (
    <div className="page exam-pulse-page insight-portal-page insight-portal-page--exam-pulse student-portal-page">
      <InsightPageHero
        pageId="exam-pulse"
        actions={
          <>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onRefresh}
              disabled={refreshing}
            >
              {refreshing ? 'Refreshing…' : 'Refresh briefing'}
            </button>
            <Link to="/form-forecast" className="btn btn-ghost btn-sm">
              Form Forecast
            </Link>
            <Link to="/career-compass" className="btn btn-primary btn-sm">
              Career Compass
            </Link>
          </>
        }
      />

      <div className="ep-status-bar" role="status">
        <span className={`ep-ai-badge${meta.aiUsed ? ' ep-ai-badge--on' : ''}`}>
          {meta.aiUsed ? 'AI refreshed' : 'Curated feed'}
        </span>
        <span className="ep-status-detail">
          Updated: <strong>{formatExamPulseUpdatedAt(meta.updatedAt)}</strong>
          {' · '}
          {meta.itemCount} stories · mode: {meta.mode || 'curated'}
        </span>
      </div>

      <p className="ep-meta form-hint">
        Exam updates, counselling news, placements, and student motivation — not live TV news.
        Auto-refreshes in the background about every 6 hours when the app is running; use{' '}
        <strong>Refresh briefing</strong> for a fresh pull now. Always confirm dates on official
        NTA / JoSAA / CSAB / MCC sites.
      </p>

      <div className="ep-portals" aria-label="Official portals">
        {portals.map((p) => (
          <a key={p.id} href={p.url} target="_blank" rel="noreferrer noopener" className="ep-portal-chip">
            {p.label} ↗
          </a>
        ))}
      </div>

      <div className="ep-tabs" role="tablist" aria-label="Exam Pulse categories">
        <button
          type="button"
          role="tab"
          aria-selected={category === 'all'}
          className={`ep-tab${category === 'all' ? ' is-active' : ''}`}
          onClick={() => setCategory('all')}
        >
          All
        </button>
        {EXAM_PULSE_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={category === c.id}
            className={`ep-tab${category === c.id ? ' is-active' : ''}${
              liked.includes(c.id) ? ' is-liked' : ''
            }`}
            onClick={() => setCategory(/** @type {ExamPulseCategory} */ (c.id))}
            onContextMenu={(e) => {
              e.preventDefault()
              setLiked(toggleLikedExamPulseCategory(c.id))
            }}
            title={
              liked.includes(c.id)
                ? 'Preferred category (right-click to unpin)'
                : 'Right-click to prefer this category when viewing All'
            }
          >
            {c.label}
            <span className="ep-tab-hint">{c.hint}</span>
          </button>
        ))}
      </div>

      {liked.length ? (
        <p className="ep-liked-hint form-hint">
          Preferred: {liked.map((id) => labelForCategory(id)).join(' · ')} — shown first in All.
          Right-click a tab to pin or unpin.
        </p>
      ) : null}

      {error ? (
        <div className="ep-banner ep-banner--warn" role="alert">
          {error}
        </div>
      ) : null}

      {!items.length ? (
        <div className="insight-empty-state">
          <div className="insight-empty-icon">📡</div>
          <h2>Briefing is empty right now</h2>
          <p>
            Press Refresh briefing while the app is running, or open an official portal below. Keep
            the bottom terminal open (start with F5).
          </p>
          <div className="insight-empty-actions">
            <button type="button" className="btn btn-primary" onClick={onRefresh} disabled={refreshing}>
              {refreshing ? 'Refreshing…' : 'Refresh briefing'}
            </button>
            <a
              className="btn btn-ghost"
              href="https://nta.ac.in/"
              target="_blank"
              rel="noreferrer noopener"
            >
              Open NTA
            </a>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="insight-empty-state">
          <div className="insight-empty-icon">🔎</div>
          <h2>Nothing in this category yet</h2>
          <p>Try All, or refresh the briefing for a fuller mix across exams and admissions.</p>
          <div className="insight-empty-actions">
            <button type="button" className="btn btn-primary" onClick={() => setCategory('all')}>
              Show all
            </button>
          </div>
        </div>
      ) : (
        <ul className="ep-feed">
          {filtered.map((item) => {
            const why = ensureWhyItMatters(item.whyItMatters, item.summary, item.category)
            return (
              <li key={item.id} className="ep-card">
                <div className="ep-card-top">
                  <span className={`ep-badge ep-badge--${item.badge || 'news'}`}>
                    {examPulseBadgeLabel(item.badge)}
                  </span>
                  <span className="ep-cat">{labelForCategory(item.category)}</span>
                  <time className="ep-date" dateTime={item.publishedAt}>
                    {formatDate(item.publishedAt)}
                  </time>
                </div>
                <h3 className="ep-card-title">
                  <a href={item.sourceUrl} target="_blank" rel="noreferrer noopener">
                    {item.title}
                  </a>
                </h3>
                <p className="ep-card-summary">{item.summary}</p>
                <p className="ep-why">
                  <span className="ep-why-label">Why it matters</span>
                  {why}
                </p>
                <div className="ep-card-foot">
                  <span className="ep-source">{item.source}</span>
                  <a
                    className="ep-read"
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Open source ↗
                  </a>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <aside className="ep-disclaimer" aria-label="Limits">
        <strong>Honest limits:</strong>{' '}
        {meta.disclaimer ||
          'Curated headlines and optional AI summary — not a live news ticker. Verify every date on official sites.'}
      </aside>
    </div>
  )
}

/** @param {string} cat */
function labelForCategory(cat) {
  return EXAM_PULSE_CATEGORIES.find((c) => c.id === cat)?.label ?? cat
}

/** @param {string} iso */
function formatDate(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}
