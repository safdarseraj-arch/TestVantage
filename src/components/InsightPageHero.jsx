import { Link } from 'react-router-dom'
import { getInsightPageById } from '../data/studentInsightPages'

/**
 * Professional hero for student insight pages (results, analytics, leaderboard).
 * @param {{
 *   pageId: string
 *   lead?: import('react').ReactNode
 *   actions?: import('react').ReactNode
 *   backTo?: string
 *   backLabel?: string
 * }} props
 */
export default function InsightPageHero({
  pageId,
  lead,
  actions,
  backTo = '/home',
  backLabel = '← Home',
}) {
  const page = getInsightPageById(pageId)
  if (!page) return null

  return (
    <header
      className="insight-page-hero"
      style={{
        '--insight-accent': page.accent,
        '--insight-accent-soft': page.accentSoft,
      }}
    >
      <div className="insight-page-hero-glow" aria-hidden="true" />
      <div className="insight-page-hero-mesh" aria-hidden="true" />
      <div className="insight-page-hero-top">
        <Link to={backTo} className="insight-page-back">
          {backLabel}
        </Link>
        {actions ? <div className="insight-page-actions">{actions}</div> : null}
      </div>
      <div className="insight-page-hero-body">
        <span className="insight-page-icon" aria-hidden>
          {page.icon}
        </span>
        <div className="insight-page-copy">
          <p className="insight-page-eyebrow">{page.tagline}</p>
          <h1>{page.title}</h1>
          <p className="insight-page-lead">{lead ?? page.desc}</p>
          <div className="insight-mode-pills insight-page-pills">
            {page.pills.map((pill) => (
              <span key={pill} className="insight-mode-pill">
                {pill}
              </span>
            ))}
          </div>
        </div>
      </div>
    </header>
  )
}
