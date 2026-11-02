import { Link } from 'react-router-dom'
import { STUDENT_PREPARE_MODES } from '../data/studentPrepareModes'

const COMPETE_LINKS = [
  {
    to: '/todays-drill',
    icon: '🗓️',
    title: 'Today’s Drill',
    tagline: 'One mixed set today',
    desc: 'JEE or NEET daily mix from your bank — finish for Merit Points and a standing board.',
    accent: '#c2410c',
  },
  {
    to: '/doubts',
    icon: '💬',
    title: 'Ask Your Doubt',
    tagline: 'Question-linked help',
    desc: 'Post a doubt from a result question — text, file, or voice. Peers can reply.',
    accent: '#0369a1',
  },
  {
    to: '/peer-pulse',
    icon: '🔗',
    title: 'Peer Pulse',
    tagline: 'Spar Code · one peer',
    desc: 'Link a friend by Spar Code. Compare streak, accuracy, Merit Points, and today’s score.',
    accent: '#0f766e',
  },
  {
    to: '/merit-stride',
    icon: '✨',
    title: 'Merit Stride',
    tagline: 'Points · badges · focus',
    desc: 'Merit Points from practice, Stride Badges, and a daily Focus Goal.',
    accent: '#7c3aed',
  },
  {
    to: '/study-circle',
    icon: '👥',
    title: 'Study Circle',
    tagline: 'Cohort Code rooms',
    desc: 'Create or join a peer room with a Cohort Code — member board, not school ERP.',
    accent: '#1d4ed8',
  },
]

const STANDING_LINKS = [
  {
    to: '/form-forecast',
    icon: '🎯',
    title: 'Form Forecast',
    tagline: 'Practice AIR · Exam Fit · Insight Coach',
    desc: 'Practice-based AIR, Exam Fit /100, Revision Ladder, Precision Map, and Insight Coach from your attempts.',
    accent: '#b45309',
  },
  {
    to: '/career-compass',
    icon: '🧭',
    title: 'Career Compass',
    tagline: 'Exam-day colleges',
    desc: 'Marks → NTA AIR and college match — counselling depth beside practice form, not instead of it.',
    accent: '#0284c7',
  },
  {
    to: '/analytics',
    icon: '📈',
    title: 'Analytics',
    tagline: 'Trends · streak · study path',
    desc: 'Percentile trends, weak chapters, and AI study path. Open Form Forecast for practice AIR and Exam Fit.',
    accent: '#0d9488',
  },
]

export default function PrepareHub() {
  const featured = STUDENT_PREPARE_MODES.find((m) => m.featured)
  const rest = STUDENT_PREPARE_MODES.filter((m) => !m.featured)

  return (
    <div className="page prepare-hub-page">
      <header className="prepare-hero">
        <div className="prepare-hero-glow" aria-hidden="true" />
        <div className="prepare-hero-inner">
          <span className="prepare-eyebrow">TestVantages · Prepare</span>
          <h1>Your exam preparation centre</h1>
          <p className="prepare-hero-lead">
            Every practice mode in one place — mocks, syllabus, speed, CDF, revision, formula sheet,
            today’s target, daily sheet, placement check, series calendar, PYQ, and mock tests.
            Optional shortcuts below for Compete, Form Forecast, and Analytics.
          </p>
          <div className="prepare-hero-actions">
            <Link to="/mock-test" className="prepare-hero-btn prepare-hero-btn--primary">
              AI Mock Builder
            </Link>
            <Link to="/practice" className="prepare-hero-btn prepare-hero-btn--glass">
              Syllabus practice
            </Link>
            <Link to="/pyq" className="prepare-hero-btn prepare-hero-btn--glass">
              PYQ bank
            </Link>
          </div>
        </div>
      </header>

      <div className="prepare-stats-strip" aria-label="Prepare at a glance">
        {[
          { value: '12+', label: 'Practice modes' },
          { value: '6', label: 'PYQ study modes' },
          { value: 'AI', label: 'Mock builder' },
          { value: 'NTA', label: 'Style papers' },
        ].map((s) => (
          <div key={s.label} className="prepare-stat">
            <strong>{s.value}</strong>
            <span>{s.label}</span>
          </div>
        ))}
      </div>

      {featured && (
        <Link
          to={featured.to}
          className="prepare-mode-card prepare-mode-card--featured"
          style={{
            '--mode-accent': featured.accent,
            '--mode-accent-soft': featured.accentSoft,
          }}
        >
          <div className="prepare-mode-card-body">
            <span className="prepare-mode-badge">Recommended</span>
            <span className="prepare-mode-icon" aria-hidden>
              {featured.icon}
            </span>
            <div className="prepare-mode-text">
              <span className="prepare-mode-tagline">{featured.tagline}</span>
              <h2>{featured.title}</h2>
              <p>{featured.desc}</p>
              <div className="prepare-mode-pills">
                {featured.pills.map((pill) => (
                  <span key={pill} className="prepare-mode-pill">
                    {pill}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <span className="prepare-mode-cta">{featured.cta}</span>
        </Link>
      )}

      <div className="prepare-modes-grid">
        {rest.map((mode) => (
          <Link
            key={mode.id}
            to={mode.to}
            className="prepare-mode-card"
            style={{
              '--mode-accent': mode.accent,
              '--mode-accent-soft': mode.accentSoft,
            }}
          >
            <span className="prepare-mode-icon" aria-hidden>
              {mode.icon}
            </span>
            <div className="prepare-mode-text">
              <span className="prepare-mode-tagline">{mode.tagline}</span>
              <h2>{mode.title}</h2>
              <p>{mode.desc}</p>
              <div className="prepare-mode-pills">
                {mode.pills.map((pill) => (
                  <span key={pill} className="prepare-mode-pill">
                    {pill}
                  </span>
                ))}
              </div>
            </div>
            <span className="prepare-mode-cta">{mode.cta}</span>
          </Link>
        ))}
      </div>

      <section className="tv-prep-section">
        <h2 className="tv-prep-section-title">Compete &amp; habit</h2>
        <p className="form-hint" style={{ marginBottom: '1rem' }}>
          Same tools as the Compete tab — here as shortcuts so you don’t need a second hub.
        </p>
        <div className="prepare-modes-grid">
          {COMPETE_LINKS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="prepare-mode-card"
              style={{
                '--mode-accent': item.accent,
                '--mode-accent-soft': `${item.accent}22`,
              }}
            >
              <span className="prepare-mode-icon" aria-hidden>
                {item.icon}
              </span>
              <div className="prepare-mode-text">
                <span className="prepare-mode-tagline">{item.tagline}</span>
                <h2>{item.title}</h2>
                <p>{item.desc}</p>
              </div>
              <span className="prepare-mode-cta">Open →</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="tv-prep-section">
        <h2 className="tv-prep-section-title">Standing &amp; counselling</h2>
        <p className="form-hint" style={{ marginBottom: '1rem' }}>
          Practice form (Form Forecast) vs exam-day colleges (Career Compass) — plus trends in
          Analytics.
        </p>
        <div className="prepare-modes-grid">
          {STANDING_LINKS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="prepare-mode-card"
              style={{
                '--mode-accent': item.accent,
                '--mode-accent-soft': `${item.accent}22`,
              }}
            >
              <span className="prepare-mode-icon" aria-hidden>
                {item.icon}
              </span>
              <div className="prepare-mode-text">
                <span className="prepare-mode-tagline">{item.tagline}</span>
                <h2>{item.title}</h2>
                <p>{item.desc}</p>
              </div>
              <span className="prepare-mode-cta">Open →</span>
            </Link>
          ))}
        </div>
      </section>

      <footer className="prepare-hub-foot">
        <p>
          <span className="ai-tune-badge">AI</span> Mock Builder and Syllabus Practice include{' '}
          <strong>10–25% PYQ</strong> from your exam when enough previous-year questions match your
          syllabus.
        </p>
        <p>
          Teachers upload at <Link to="/question-bank">Question Bank</Link> (
          <code>http://127.0.0.1:5173/question-bank</code>). Students start here for ready practice.
        </p>
      </footer>
    </div>
  )
}
