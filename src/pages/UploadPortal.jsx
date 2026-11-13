/**
 * /upload — one place to upload a PDF. Pick what the document is:
 *   Official PYQ   — a previous-year paper from NTA / JEE Advanced (admin only)
 *   Any paper      — class test, mock, another institute's paper
 *   Book / Q-bank  — a whole book or question bank, read one page range at a time
 * All three use the same pipeline and review screen (upload → Quality check → Auto-fix →
 * Compare → Approve → Hybrid AI → Publish), so an improvement to one reaches all three.
 */
import { useSearchParams } from 'react-router-dom'
import ErrorBoundary from '../components/ErrorBoundary.jsx'
import OfficialPyqPending from './OfficialPyqPending.jsx'
import { isAdminLoggedIn } from '../utils/auth.js'

export const UPLOAD_PORTAL_TYPES = [
  {
    id: 'official',
    kind: 'official',
    label: 'Official PYQ',
    hint: 'JEE Main / JEE Advanced / NEET previous-year paper from the official archive. Goes to the PYQ Bank and the Question Bank.',
    adminOnly: true,
  },
  {
    id: 'paper',
    kind: 'other',
    label: 'Any test paper',
    hint: 'Class test, mock, school paper or another institute’s paper. At Publish you choose whether students see the whole paper.',
  },
  {
    id: 'book',
    kind: 'book',
    label: 'Book / question bank PDF',
    hint: 'A whole book or question bank of any size, read in page ranges. Exercises and solved examples go to the Question Bank only.',
  },
]

export default function UploadPortal() {
  const [params, setParams] = useSearchParams()
  const admin = isAdminLoggedIn()
  const types = UPLOAD_PORTAL_TYPES.filter((t) => admin || !t.adminOnly)
  const asked = String(params.get('type') || '')
  const current = types.find((t) => t.id === asked) || types.find((t) => t.id === 'paper') || types[0]

  return (
    <div className="page upload-portal-page" data-testid="upload-portal">
      <header className="page-header">
        <h1>Upload a PDF</h1>
        <p className="form-hint">
          First choose what the document is. Every type goes through the same steps: questions are split, the{' '}
          <strong>Quality check</strong> and <strong>Auto-fix</strong> clean them, you compare with the pages,{' '}
          <strong>Approve</strong>, let <strong>Hybrid AI</strong> fill tags, answers and solutions, then{' '}
          <strong>Publish</strong>.
        </p>
      </header>
      <section className="card upload-portal-types" role="radiogroup" aria-label="Document type">
        <h2>Document type</h2>
        <div className="upload-portal-type-list">
          {types.map((t) => (
            <label key={t.id} className={`upload-portal-type${t.id === current.id ? ' is-active' : ''}`}>
              <input
                type="radio"
                name="upload-portal-type"
                value={t.id}
                checked={t.id === current.id}
                onChange={() => setParams({ type: t.id }, { replace: true })}
                data-testid={`upload-type-${t.id}`}
              />{' '}
              <strong>{t.label}</strong>
              <span className="form-hint">{t.hint}</span>
            </label>
          ))}
        </div>
      </section>
      <ErrorBoundary title={`${current.label} upload crashed`}>
        <OfficialPyqPending key={current.kind} kind={/** @type {any} */ (current.kind)} embedded />
      </ErrorBoundary>
    </div>
  )
}
