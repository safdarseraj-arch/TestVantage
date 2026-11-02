import { Link, useNavigate, useParams } from 'react-router-dom'
import { getTestById } from '../data/tests'
import { getExamPattern } from '../data/examPatterns'
import { buildPaperManifestData } from '../utils/paperManifest.js'
import { openPaperManifestPrint } from '../utils/paperManifest.js'

export default function PaperManifestPage() {
  const { testId } = useParams()
  const navigate = useNavigate()
  const test = testId ? getTestById(testId) : undefined
  const data = test ? buildPaperManifestData(test) : null
  const pattern = test ? getExamPattern(test.examPatternId) : null

  if (!test || !data) {
    return (
      <div className="page">
        <h1>Paper not found</h1>
        <Link to="/edit-test" className="btn btn-primary btn-sm">
          Back to Edit Test
        </Link>
      </div>
    )
  }

  const handlePrint = () => openPaperManifestPrint(test)

  return (
    <div className="page paper-manifest-page">
      <header className="edit-test-hero">
        <div>
          <p className="tests-eyebrow">Published paper</p>
          <h1>Paper manifest</h1>
          <p className="tests-lead">{test.title}</p>
          <p className="form-hint">
            {pattern?.name} · {data.totalQuestions} questions · TQS {data.qualityScore}/100 · v
            {data.publishVersion}
          </p>
        </div>
      </header>

      <div className="paper-manifest-actions card">
        <p>
          <strong>Save as PDF</strong> — opens a print-friendly page. Choose <em>Save as PDF</em> in
          the print dialog.
        </p>
        <div className="edit-test-footer-btns">
          <button type="button" className="btn btn-primary" onClick={handlePrint}>
            Save as PDF / Print
          </button>
          <Link to={`/exam/${test.id}`} className="btn btn-secondary">
            Preview exam
          </Link>
          <Link to="/admin/schools" className="btn btn-ghost">
            Assign to class
          </Link>
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/edit-test')}>
            ← Edit Test list
          </button>
        </div>
      </div>

      <div className="card paper-manifest-preview">
        <h2>Blueprint</h2>
        {data.slotProgress.length > 0 ? (
          <table className="paper-manifest-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Selected</th>
                <th>Required</th>
              </tr>
            </thead>
            <tbody>
              {data.slotProgress.map((s) => (
                <tr key={s.type}>
                  <td>{s.type}</td>
                  <td>{s.have}</td>
                  <td>{s.need}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="form-hint">No blueprint slots stored for this paper.</p>
        )}

        <h2>Questions ({data.questions.length})</h2>
        <ol className="paper-manifest-qlist">
          {data.questions.map((q) => (
            <li key={q.index} className={q.ready ? '' : 'bad'}>
              <span className="paper-review-qnum">Q{q.index}</span>
              <span className="paper-review-type">{q.type}</span>
              <span>{q.ready ? '✓' : `✗ ${q.issues[0] ?? 'Fix'}`}</span>
              <p className="form-hint">{q.stem}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
