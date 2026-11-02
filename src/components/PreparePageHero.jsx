import { Link } from 'react-router-dom'
import { getPrepareModeById } from '../data/studentPrepareModes'

/**
 * Professional page header for each prepare mode (matches Prepare Centre branding).
 * @param {{
 *   modeId: string
 *   lead?: import('react').ReactNode
 *   actions?: import('react').ReactNode
 *   backTo?: string
 * }} props
 */
export default function PreparePageHero({ modeId, lead, actions, backTo = '/prepare' }) {
  const mode = getPrepareModeById(modeId)
  if (!mode) return null

  return (
    <header
      className="prepare-page-hero"
      style={{
        '--prepare-accent': mode.accent,
        '--prepare-accent-soft': mode.accentSoft,
      }}
    >
      <div className="prepare-page-hero-glow" aria-hidden="true" />
      <div className="prepare-page-hero-top">
        <Link to={backTo} className="prepare-page-back">
          ← Prepare centre
        </Link>
        {actions ? <div className="prepare-page-actions">{actions}</div> : null}
      </div>
      <div className="prepare-page-hero-body">
        <span className="prepare-page-icon" aria-hidden>
          {mode.icon}
        </span>
        <div className="prepare-page-copy">
          <p className="prepare-page-eyebrow">{mode.tagline}</p>
          <h1>{mode.title}</h1>
          <p className="prepare-page-lead">{lead ?? mode.desc}</p>
          <div className="prepare-mode-pills prepare-page-pills">
            {mode.pills.map((pill) => (
              <span key={pill} className="prepare-mode-pill">
                {pill}
              </span>
            ))}
          </div>
        </div>
      </div>
    </header>
  )
}
