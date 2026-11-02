/**
 * Founder-only product map. Not routed in the live app — do not add /how-we-compare
 * to nav or public pages. Accidental visits redirect to /home.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import PortalPage from '../components/PortalPage'
import {
  COMPARE_OUR_LIST,
  COMPARE_ROWS,
  COMPARE_SOURCES,
  COMPARE_THEIR_LIST,
} from '../data/howWeCompare'
import { ARKE_ROWS, ARKE_SOURCES, ARKE_THEIR_LIST } from '../data/howWeCompareArke'

const PRODUCTS = [
  {
    id: 'acadza',
    label: 'Acadza',
    theirTitle: 'Their features (Acadza, public)',
    their: COMPARE_THEIR_LIST,
    rows: COMPARE_ROWS,
    sources: COMPARE_SOURCES,
    sessionNote: 'Acadza session: My Formula Sheet, PYQ paper calendar, doubt-on-question, Today’s Target.',
  },
  {
    id: 'arke',
    label: 'ARKE Scholars',
    theirTitle: 'Their features (ARKE Scholars, public)',
    their: ARKE_THEIR_LIST,
    rows: ARKE_ROWS,
    sources: ARKE_SOURCES,
    sessionNote:
      'ARKE session: Daily Practice Sheet, Placement check, Series calendar. Live class studio and 30-minute video desk skipped.',
  },
]

export default function HowWeCompare() {
  const [productId, setProductId] = useState('arke')
  const product = PRODUCTS.find((p) => p.id === productId) ?? PRODUCTS[0]

  return (
    <PortalPage
      role="platform"
      className="page how-we-compare-page"
      eyebrow="Help · product map"
      title="How we compare"
      subtitle="A plain map of public JEE/NEET prep products versus TestVantages. Facts from their public pages only — not a review, not an attack, and not a copy of their papers or brand."
      actions={
        <>
          <Link to="/tour" className="btn btn-ghost btn-sm">
            TestVantages Tour
          </Link>
          <Link to="/prepare" className="btn btn-primary btn-sm">
            Prepare centre
          </Link>
        </>
      }
    >
      <section className="card compare-note">
        <p>
          <strong>How to read this:</strong> Pick a product. “They” means features they advertise in
          public. “We” means what is in TestVantages today. We do not copy their question text, papers,
          or logo.
        </p>
        <div className="compare-product-tabs qr-subject-row" role="tablist" aria-label="Product to compare">
          {PRODUCTS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={productId === p.id}
              className={`qr-chip${productId === p.id ? ' is-active' : ''}`}
              onClick={() => setProductId(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="form-hint">{product.sources}</p>
      </section>

      <div className="compare-two-col">
        <section className="card compare-list-card compare-list-card--theirs">
          <h2>{product.theirTitle}</h2>
          <ol className="compare-feature-list">
            {product.their.map((item) => (
              <li key={item.title}>
                <strong>{item.title}.</strong> {item.detail}
              </li>
            ))}
          </ol>
        </section>
        <section className="card compare-list-card compare-list-card--ours">
          <h2>Our features (TestVantages)</h2>
          <ol className="compare-feature-list">
            {COMPARE_OUR_LIST.map((item) => (
              <li key={item.title}>
                <strong>{item.title}.</strong> {item.detail}
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="card">
        <h2>Gap table</h2>
        <p className="form-hint">{product.sessionNote}</p>
        <div className="qr-subject-row" style={{ margin: '0.75rem 0 1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <Link to="/daily-sheet" className="btn btn-ghost btn-sm">
            Daily Practice Sheet
          </Link>
          <Link to="/placement-check" className="btn btn-ghost btn-sm">
            Placement check
          </Link>
          <Link to="/test-series" className="btn btn-ghost btn-sm">
            Series calendar
          </Link>
          <Link to="/formula-sheet" className="btn btn-ghost btn-sm">
            My Formula Sheet
          </Link>
          <Link to="/daily-target" className="btn btn-ghost btn-sm">
            Today’s Target
          </Link>
        </div>
        <div className="sitemap-table-wrap compare-table-wrap">
          <table className="sitemap-table compare-table">
            <thead>
              <tr>
                <th>Area</th>
                <th>They have</th>
                <th>We have</th>
                <th>This session</th>
                <th>Skip / why</th>
              </tr>
            </thead>
            <tbody>
              {product.rows.map((row) => (
                <tr key={row.area}>
                  <td>
                    <strong>{row.area}</strong>
                  </td>
                  <td>{row.they}</td>
                  <td>{row.we}</td>
                  <td>{row.session}</td>
                  <td>{row.skip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </PortalPage>
  )
}