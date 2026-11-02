import { Link } from 'react-router-dom'

/** @type {{ id: string, icon: string, title: string, desc: string, to: string, accent?: string }[]} */
export const STUDENT_STUDY_MODES = [
  {
    id: 'syllabus-practice',
    icon: '📖',
    title: 'Syllabus Practice',
    desc: 'Self-paced drills by syllabus. AI mixes bank + 10–25% PYQ from your exam only.',
    to: '/practice',
    accent: '#16a34a',
  },
  {
    id: 'pyq-year',
    icon: '📅',
    title: 'PYQ — Year-wise',
    desc: 'One official paper from that year (Paper 1/2, date & shift, or AI pick).',
    to: '/pyq',
    accent: '#ca8a04',
  },
  {
    id: 'mock-full',
    icon: '🎯',
    title: 'Comprehensive Mock Test',
    desc: 'Full-length AI paper — 10–25% PYQ from your exam when available.',
    to: '/mock-test?type=full',
    accent: '#4f46e5',
  },
  {
    id: 'mock-part',
    icon: '🧪',
    title: 'Subject Proficiency Test',
    desc: 'One or more subjects — AI paper with exam-only PYQ mix.',
    to: '/mock-test?type=part',
    accent: '#7c3aed',
  },
  {
    id: 'mock-chapter',
    icon: '📚',
    title: 'Chapter Proficiency Test',
    desc: 'Focused chapter drill — exam-only PYQ in the 10–25% mix.',
    to: '/mock-test?type=chapter',
    accent: '#0891b2',
  },
  {
    id: 'mock-calibrated',
    icon: '⚡',
    title: 'Real-Time Calibrated Test',
    desc: 'Adaptive difficulty — PYQ from your exam only in the mix.',
    to: '/mock-test?type=calibrated',
    accent: '#dc2626',
  },
]

/**
 * Student hub — six ways to study with PYQ and AI picks.
 * @param {{ compact?: boolean, title?: string }} props
 */
export default function StudentStudyModes({ compact = false, title = 'How to study' }) {
  return (
    <section className={`student-study-modes${compact ? ' student-study-modes--compact' : ''}`}>
      <h2>{title}</h2>
      <p className="form-hint student-study-modes-lead">
        When AI builds a test paper or practice batch, it uses <strong>10–25% PYQ</strong> from{' '}
        <strong>your chosen exam only</strong> when enough previous-year questions match your
        syllabus.
      </p>
      <div className="student-study-modes-grid">
        {STUDENT_STUDY_MODES.map((mode) => (
          <Link
            key={mode.id}
            to={mode.to}
            className="student-study-mode-card"
            style={{ '--mode-accent': mode.accent }}
          >
            <span className="student-study-mode-icon" aria-hidden>
              {mode.icon}
            </span>
            <div>
              <strong>{mode.title}</strong>
              <p>{mode.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
