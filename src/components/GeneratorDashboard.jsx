import { useState } from 'react'
import { Link } from 'react-router-dom'
import { queueBatch } from '../utils/hybridAiClient.js'

const EXAMS = ['JEE Main', 'JEE Advanced', 'NEET']
const SUBJECTS = ['Mathematics', 'Physics', 'Chemistry', 'Botany', 'Zoology']
const DIFFICULTIES = ['Easy', 'Medium', 'Hard']
const QUESTION_TYPES = ['Single Choice', 'Multiple Choice', 'Numerical', 'MCQ']

/**
 * TestVantage Hybrid AI   batch question generation (FastAPI /api/generate/batch).
 */
export default function GeneratorDashboard() {
  const [exam, setExam] = useState('JEE Main')
  const [subject, setSubject] = useState('Mathematics')
  const [chapter, setChapter] = useState('')
  const [difficulty, setDifficulty] = useState('Medium')
  const [questionType, setQuestionType] = useState('Single Choice')
  const [count, setCount] = useState(5)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')

  const onSubmit = async (e) => {
    e.preventDefault()
    const chapterTrim = chapter.trim()
    if (!chapterTrim) {
      setStatus('Enter a chapter or topic name.')
      return
    }
    setBusy(true)
    setStatus('Queuing Hybrid AI batch job& ')
    try {
      const data = await queueBatch({
        exam,
        subject,
        chapter: chapterTrim,
        difficulty,
        question_type: questionType,
        count: Math.max(1, Math.min(100, Number(count) || 1)),
      })
      setStatus(
        `Hybrid AI queued ${count} item(s). Status: ${data.status || 'Job Queued'}. ` +
          'New drafts land in the AI sub_bank when the job finishes   review in Question Bank.',
      )
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Batch queue failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page generator-dashboard">
      <header className="page-header">
        <h1>Hybrid AI</h1>
        <p className="form-hint">
          Queue original exam-style questions via the TestVantage API (
          <code>/api/generate/batch</code>). Requires FastAPI on port 8000   start with F5 or{' '}
          <code>npm run server:start</code>.
        </p>
      </header>

      <section className="card">
        <h2>Batch generate</h2>
        <form className="generator-form" onSubmit={onSubmit}>
          <div className="gemini-scq-trial-row">
            <label className="metadata-field">
              Exam
              <select value={exam} onChange={(ev) => setExam(ev.target.value)} disabled={busy}>
                {EXAMS.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </label>
            <label className="metadata-field">
              Subject
              <select value={subject} onChange={(ev) => setSubject(ev.target.value)} disabled={busy}>
                {SUBJECTS.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="metadata-field">
            Chapter / topic
            <input
              type="text"
              value={chapter}
              onChange={(ev) => setChapter(ev.target.value)}
              placeholder="e.g. Electrostatics"
              disabled={busy}
              required
            />
          </label>
          <div className="gemini-scq-trial-row">
            <label className="metadata-field">
              Difficulty
              <select
                value={difficulty}
                onChange={(ev) => setDifficulty(ev.target.value)}
                disabled={busy}
              >
                {DIFFICULTIES.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </label>
            <label className="metadata-field">
              Question type
              <select
                value={questionType}
                onChange={(ev) => setQuestionType(ev.target.value)}
                disabled={busy}
              >
                {QUESTION_TYPES.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </label>
            <label className="metadata-field">
              Count (1 100)
              <input
                type="number"
                min={1}
                max={100}
                value={count}
                onChange={(ev) => setCount(ev.target.value)}
                disabled={busy}
              />
            </label>
          </div>
          <div className="gemini-scq-trial-actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Queuing& ' : 'Queue batch (Hybrid AI)'}
            </button>
            <Link to="/question-bank" className="btn btn-secondary">
              Question Bank
            </Link>
          </div>
        </form>
        {status ? (
          <p className="form-hint" aria-live="polite">
            {status}
          </p>
        ) : null}
      </section>

      <section className="card">
        <h3>Related flows</h3>
        <ul className="form-hint">
          <li>
            PYQ-style slots and curriculum trials   use Generate on the Question Bank Gemini trial card
            (Hybrid AI batch).
          </li>
          <li>
            Similar / replica PYQ   use panels on Official PYQ review (clone-scaled via Hybrid AI).
          </li>
        </ul>
      </section>
    </div>
  )
}
