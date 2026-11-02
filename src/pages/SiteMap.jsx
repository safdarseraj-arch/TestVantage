import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import PortalPage from '../components/PortalPage'
import {
  SITE_MAP_GO_LIVE_NOTE,
  SITE_MAP_JOURNEYS,
  SITE_MAP_NAV_JUMPS,
  SITE_MAP_STUDENT_FLOW,
  SITE_MAP_TEACHER_FLOW,
} from '../data/testVantageSiteMap'

function FlowStrip({ steps }) {
  return (
    <ol className="sitemap-flow-strip" aria-label="Flow steps">
      {steps.map((step, i) => (
        <li key={`${step}-${i}`}>
          <span className="sitemap-flow-step">{step}</span>
          {i < steps.length - 1 && <span className="sitemap-flow-arrow" aria-hidden>
            →
          </span>}
        </li>
      ))}
    </ol>
  )
}

function SectionBlock({ section }) {
  return (
    <section className="sitemap-section card" id={`sitemap-${section.id}`}>
      <header className="sitemap-section-head">
        <span className="sitemap-section-icon" aria-hidden>
          {section.icon}
        </span>
        <div>
          <h2>
            {section.title}
            {section.staffOnly ? (
              <span className="sitemap-staff-badge">Staff only</span>
            ) : null}
          </h2>
          <p className="form-hint">{section.summary}</p>
        </div>
      </header>

      {section.flowSteps?.length > 0 && <FlowStrip steps={section.flowSteps} />}

      <div className="sitemap-table-wrap">
        <table className="sitemap-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>What it is</th>
              <th className="sitemap-col-where">Where</th>
              <th className="sitemap-col-open">Open</th>
            </tr>
          </thead>
          <tbody>
            {section.pages.map((page) => {
              const isDynamic = page.to.includes(':')
              const canOpen = page.openable !== false && !isDynamic
              return (
                <tr key={`${section.id}-${page.label}-${page.to}`}>
                  <td>
                    <span className="sitemap-page-label">{page.label}</span>
                    <code className="sitemap-path">{page.pathLabel ?? page.to}</code>
                  </td>
                  <td>{page.desc}</td>
                  <td className="sitemap-col-where">{page.where ?? '—'}</td>
                  <td className="sitemap-col-open">
                    {canOpen ? (
                      <Link to={page.to} className="btn btn-ghost btn-sm sitemap-open-btn">
                        Open
                      </Link>
                    ) : (
                      <span className="sitemap-open-na" title="Opens from another step">
                        —
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function SiteMap() {
  const { isAdmin } = useAuth()
  const handlePrint = () => window.print()

  return (
    <PortalPage
      role="platform"
      className="page sitemap-page"
      eyebrow="Help & guide"
      title="TestVantages Tour"
      subtitle="Clear names, what’s inside, where to find it, and an Open link — grouped like the real top nav."
      actions={
        <button type="button" className="btn btn-primary btn-sm sitemap-print-btn" onClick={handlePrint}>
          Print this tour
        </button>
      }
    >
      <div className="sitemap-intro card">
        <ul className="sitemap-at-a-glance" aria-label="Platform at a glance">
          {[
            { value: '5', label: 'Top nav tabs' },
            { value: '30+', label: 'Student tools' },
            { value: '6', label: 'Question types' },
            { value: 'JEE·NEET', label: 'Both exams' },
          ].map((g) => (
            <li key={g.label} className="sitemap-glance-item">
              <strong>{g.value}</strong>
              <span>{g.label}</span>
            </li>
          ))}
        </ul>
        <p>
          Follow the <strong>top navigation</strong>: Home → Question Bank → Prepare → Compete →
          Insights. Each row below has a name, what you get inside, where to click (path + nav), and
          Open when the page can load directly. The top banner is marketing only. Question Bank sits
          next to Home for staff (and before you sign in). Students never see it. Teaching appears
          after Teacher sign-in. Old link <code>/prep-hub</code> redirects to{' '}
          <code>/prepare</code>.
        </p>
        <p className="form-hint sitemap-live-note">{SITE_MAP_GO_LIVE_NOTE}</p>
      </div>

      <nav className="sitemap-jump card" aria-label="Jump to tab">
        <h2 className="sitemap-jump-title">Jump to a tab</h2>
        <ul className="sitemap-jump-list">
          {SITE_MAP_NAV_JUMPS.map((j) => (
            <li key={j.id}>
              <a href={`#sitemap-${j.id}`} className="sitemap-jump-link">
                {j.label}
                {j.staffOnly ? <span className="sitemap-jump-staff">staff</span> : null}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <section className="sitemap-journeys card">
        <h2>Quick journeys</h2>
        <div className="sitemap-journey-grid">
          {SITE_MAP_JOURNEYS.map((j) => (
            <article key={j.id} className="sitemap-journey-card">
              <h3>{j.label}</h3>
              <FlowStrip steps={j.steps} />
            </article>
          ))}
        </div>
      </section>

      <div className="sitemap-role-block">
        <h2 className="sitemap-role-title">Student tabs</h2>
        {SITE_MAP_STUDENT_FLOW.map((section) => (
          <SectionBlock key={section.id} section={section} />
        ))}
      </div>

      <div className="sitemap-role-block">
        <h2 className="sitemap-role-title">Staff tabs</h2>
        <p className="form-hint sitemap-staff-lead">
          Question Bank is in the top bar next to Home. Open it, then sign in as Admin or Teacher if
          asked. Students never see this tab.
        </p>
        {SITE_MAP_TEACHER_FLOW.map((section) => (
          <SectionBlock key={section.id} section={section} />
        ))}
      </div>

      <footer className="sitemap-footer card">
        <h3>Bookmark these while testing</h3>
        <ul className="sitemap-bookmarks">
          <li>
            <Link to="/tour">TestVantages Tour</Link> — <code>/tour</code> (same as{' '}
            <code>/site-map</code>)
          </li>
          <li>
            <Link to="/home">Home</Link> — <code>/home</code>
          </li>
          <li>
            <Link to="/prepare">Prepare centre</Link> — <code>/prepare</code>
          </li>
          <li>
            <Link to="/todays-drill">Compete · Today’s Drill</Link> — <code>/todays-drill</code>
          </li>
          <li>
            <Link to="/my-results">Insights · My Results</Link> — <code>/my-results</code>
          </li>
          <li>
            <Link to="/form-forecast">Form Forecast</Link> — <code>/form-forecast</code>
          </li>
          <li>
            <Link to="/analytics">Analytics</Link> — <code>/analytics</code>
          </li>
          <li>
            <Link to="/career-compass">Career Compass</Link> — <code>/career-compass</code>
          </li>
          <li>
            <Link to="/profile">Profile &amp; invites</Link> — <code>/profile</code>
          </li>
          <li>
            <Link to="/question-bank">Question Bank (staff)</Link> — <code>/question-bank</code>
          </li>
          {isAdmin ? (
            <li>
              <Link to="/go-live-guide">Go live guide</Link> — <code>/go-live-guide</code>
            </li>
          ) : null}
        </ul>
        <p className="form-hint">
          Use <strong>http://127.0.0.1:5173/tour</strong> in Cursor&apos;s browser. Press{' '}
          <strong>F5</strong> to refresh after updates. Keep the bottom terminal panel open while you
          use the site.
        </p>
      </footer>
    </PortalPage>
  )
}
