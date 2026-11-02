import { Link, useNavigate } from 'react-router-dom'
import { savePracticePrefill } from '../utils/aiMastery.js'

/**
 * Sticky next-step strip with real navigation only.
 */
export default function ResultNextSteps({
  testId,
  examPatternId,
  topWeakChapter,
  topWeakSubjects = [],
  testTypeId,
}) {
  const navigate = useNavigate()

  const onPractice = () => {
    savePracticePrefill(
      topWeakChapter
        ? { examPatternId, chapters: [topWeakChapter], subjects: topWeakSubjects }
        : { examPatternId },
    )
    navigate('/practice')
  }

  return (
    <nav className="si-next-steps" aria-label="Recommended next steps">
      <p className="si-next-steps-label">What next?</p>
      <div className="si-next-steps-grid">
        <button type="button" className="si-next-step si-next-step--primary" onClick={onPractice}>
          <span className="si-next-step-icon" aria-hidden>
            🎯
          </span>
          <span className="si-next-step-text">
            <strong>{topWeakChapter ? `Practice ${topWeakChapter}` : 'Practice weak topics'}</strong>
            <small>Targeted chapter drill</small>
          </span>
        </button>

        <Link to="/analytics" className="si-next-step">
          <span className="si-next-step-icon" aria-hidden>
            📈
          </span>
          <span className="si-next-step-text">
            <strong>Full analytics</strong>
            <small>Trends and study path</small>
          </span>
        </Link>

        <Link to="/form-forecast" className="si-next-step">
          <span className="si-next-step-icon" aria-hidden>
            🎯
          </span>
          <span className="si-next-step-text">
            <strong>Form Forecast</strong>
            <small>Exam Fit and Revision Ladder</small>
          </span>
        </Link>

        {testTypeId === 'practice' ? (
          <Link to="/practice" className="si-next-step">
            <span className="si-next-step-icon" aria-hidden>
              📚
            </span>
            <span className="si-next-step-text">
              <strong>Another practice</strong>
              <small>Syllabus drill</small>
            </span>
          </Link>
        ) : (
          <Link to="/mock-test" className="si-next-step">
            <span className="si-next-step-icon" aria-hidden>
              📝
            </span>
            <span className="si-next-step-text">
              <strong>Another mock</strong>
              <small>AI Mock Builder</small>
            </span>
          </Link>
        )}

        <Link to={`/exam/${testId}`} className="si-next-step si-next-step--ghost">
          <span className="si-next-step-icon" aria-hidden>
            ↻
          </span>
          <span className="si-next-step-text">
            <strong>Retake this test</strong>
            <small>Same paper again</small>
          </span>
        </Link>
      </div>
    </nav>
  )
}
