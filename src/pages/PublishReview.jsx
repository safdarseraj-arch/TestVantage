import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import PaperReviewStep from '../components/createTest/PaperReviewStep.jsx'
import { getCustomTestById, publishCustomTest } from '../utils/customTests'
import { persistQuestionForBank } from '../utils/persistUpload.js'
import { getAnswerableQuestions } from '../utils/passage.js'

export default function PublishReview() {
  const { testId } = useParams()
  const navigate = useNavigate()
  const [reviewApproved, setReviewApproved] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const test = testId ? getCustomTestById(testId) : null
  const questions = useMemo(() => {
    if (!test?.questions?.length) return []
    return test.questions.map((q) => persistQuestionForBank(q, test.questions))
  }, [test])

  const handlePublish = () => {
    setError('')
    if (!testId || !test) return
    if (!reviewApproved) {
      setError('Confirm you reviewed every question before publishing.')
      return
    }
    const result = publishCustomTest(testId)
    if (!result.ok) {
      setError(result.error ?? 'Publish failed.')
      return
    }
    setMessage('Paper published — download manifest or assign to a class.')
    setTimeout(() => navigate(`/paper-manifest/${testId}`), 400)
  }

  if (!test) {
    return (
      <div className="page">
        <h1>Paper not found</h1>
        <Link to="/edit-test" className="btn btn-primary btn-sm">
          Back to Edit Test
        </Link>
      </div>
    )
  }

  return (
    <div className="page publish-review-page">
      <header className="edit-test-hero">
        <div>
          <h1>Pre-publish review</h1>
          <p className="tests-lead">{test.title}</p>
          <p className="form-hint">
            {getAnswerableQuestions(questions).length} questions · SME checklist before students see
            this paper.
          </p>
        </div>
        <Link to="/edit-test" className="btn btn-ghost btn-sm">
          ← Edit Test list
        </Link>
      </header>

      {message && <p className="upload-success">{message}</p>}
      {error && <p className="upload-error">{error}</p>}

      <PaperReviewStep
        questions={questions}
        slots={test.paperBlueprint ?? []}
        reviewedOk={reviewApproved}
        onReviewedOkChange={setReviewApproved}
      />

      <div className="create-wizard-nav">
        <Link to={`/create-test?edit=${encodeURIComponent(test.id)}`} className="btn btn-secondary">
          Modify paper
        </Link>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!reviewApproved}
          onClick={handlePublish}
        >
          Publish to students
        </button>
      </div>
    </div>
  )
}
