import { Link } from 'react-router-dom'

/** @type {Record<string, { title: string, lead: string, bullets: string[], links?: { to: string, label: string }[] }>} */
const PAGE_INTROS = {
  practice: {
    title: 'About syllabus practice',
    lead: 'Self-paced drills — no full exam timer. You choose exam and syllabus; AI builds each batch.',
    bullets: [
      'Pick Subject → Unit → Chapter (same tags as Question Bank).',
      'AI mixes ready bank questions with 10–25% PYQ from your exam only.',
      'Set batch size, answer at your pace, then Submit or Continue for more.',
    ],
    links: [
      { to: '/mock-test', label: 'Want a timed mock instead? →' },
      { to: '/pyq', label: 'Full previous-year papers →' },
    ],
  },
  'mock-test': {
    title: 'About AI Mock Builder',
    lead: 'Timed papers built by AI from your syllabus — same pace as the real exam.',
    bullets: [
      'Comprehensive Mock — full-length paper for your exam pattern.',
      'Subject / Chapter Proficiency — focused papers with easier chapter tuning.',
      'Real-Time Calibrated — adaptive difficulty per subject after each answer.',
      'Every mock uses 10–25% PYQ from your chosen exam when enough PYQs match.',
    ],
    links: [
      { to: '/practice', label: 'Self-paced syllabus practice →' },
      { to: '/pyq', label: 'PYQ Bank · year-wise papers →' },
    ],
  },
  pyq: {
    title: 'About PYQ on this page',
    lead: 'Pick one of six modes, then choose syllabus (modes 1–5) or year/paper (mode 6).',
    bullets: [
      'Syllabus Practice — untimed PYQ batches.',
      'Comprehensive / Subject / Chapter / Calibrated — timed PYQ papers with real exam timing.',
      'Year-wise Paper — one official paper (Paper 1/2, date & shift, or AI pick).',
    ],
    links: [
      { to: '/mock-test', label: 'Bank + PYQ mock (10–25% mix) →' },
      { to: '/practice', label: 'Bank syllabus practice →' },
    ],
  },
}

/**
 * Page-specific help — not the full six-mode hub.
 * @param {{ page: 'practice' | 'mock-test' | 'pyq' }} props
 */
export default function StudyPageIntro({ page }) {
  const intro = PAGE_INTROS[page]
  if (!intro) return null

  return (
    <section className="study-page-intro card glass-card">
      <h2>{intro.title}</h2>
      <p className="form-hint study-page-intro-lead">{intro.lead}</p>
      <ul className="study-page-intro-list">
        {intro.bullets.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {intro.links?.length ? (
        <div className="study-page-intro-links">
          {intro.links.map((link) => (
            <Link key={link.to} to={link.to} className="study-page-intro-link">
              {link.label}
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  )
}
