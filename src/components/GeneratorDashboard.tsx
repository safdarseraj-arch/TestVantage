import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { queueBatch } from '../utils/hybridAiClient.js'
import './generator-dashboard.css'

const EXAMS = ['JEE Main', 'JEE Advanced', 'NEET'] as const
type Exam = (typeof EXAMS)[number]

const SUBJECTS_BY_EXAM: Record<Exam, readonly string[]> = {
  'JEE Main': ['Physics', 'Chemistry', 'Mathematics'],
  'JEE Advanced': ['Physics', 'Chemistry', 'Mathematics'],
  NEET: ['Physics', 'Chemistry', 'Botany', 'Zoology'],
}

const CHAPTERS_BY_SUBJECT: Record<string, readonly string[]> = {
  Physics: [
    'Kinematics',
    'Laws of Motion',
    'Work, Energy and Power',
    'Rotational Motion',
    'Gravitation',
    'Thermodynamics',
    'Electrostatics',
    'Current Electricity',
    'Magnetic Effects of Current',
    'Electromagnetic Induction',
    'Optics',
    'Modern Physics',
  ],
  Chemistry: [
    'Atomic Structure',
    'Chemical Bonding',
    'Thermodynamics',
    'Equilibrium',
    'Redox Reactions',
    'Organic Chemistry — Basics',
    'Hydrocarbons',
    'Electrochemistry',
    'Chemical Kinetics',
    'Coordination Compounds',
  ],
  Mathematics: [
    'Sets and Relations',
    'Complex Numbers',
    'Quadratic Equations',
    'Sequences and Series',
    'Binomial Theorem',
    'Vector Algebra',
    'Three Dimensional Geometry',
    'Definite Integration',
    'Differential Equations',
    'Probability',
  ],
  Botany: [
    'Plant Morphology',
    'Plant Anatomy',
    'Cell — Structure and Function',
    'Plant Physiology',
    'Reproduction in Plants',
    'Genetics and Evolution',
    'Ecology',
  ],
  Zoology: [
    'Human Physiology',
    'Reproduction',
    'Genetics',
    'Evolution',
    'Biotechnology',
    'Human Health and Disease',
    'Ecology and Environment',
  ],
}

const QUESTION_TYPES = ['Single Choice', 'Multiple Choice', 'Numerical'] as const
const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const

type Toast = { type: 'ok' | 'error'; text: string } | null

export default function GeneratorDashboard() {
  const [exam, setExam] = useState<Exam>('JEE Main')
  const [subject, setSubject] = useState<string>(SUBJECTS_BY_EXAM['JEE Main'][0])
  const [chapter, setChapter] = useState<string>(CHAPTERS_BY_SUBJECT.Mathematics[0])
  const [questionType, setQuestionType] = useState<(typeof QUESTION_TYPES)[number]>('Single Choice')
  const [difficulty, setDifficulty] = useState<(typeof DIFFICULTIES)[number]>('Medium')
  const [toast, setToast] = useState<Toast>(null)

  const subjects = SUBJECTS_BY_EXAM[exam]

  const chapters = useMemo(() => {
    const list = CHAPTERS_BY_SUBJECT[subject]
    return list?.length ? list : CHAPTERS_BY_SUBJECT.Mathematics
  }, [subject])

  useEffect(() => {
    if (!subjects.includes(subject)) {
      setSubject(subjects[0])
    }
  }, [exam, subject, subjects])

  useEffect(() => {
    if (!chapters.includes(chapter)) {
      setChapter(chapters[0])
    }
  }, [chapter, chapters])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 4000)
    return () => window.clearTimeout(timer)
  }, [toast])

  const queueBatch = () => {
    setToast({ type: 'ok', text: 'Job Queued' })

    const payload = {
      exam,
      subject,
      chapter,
      difficulty,
      question_type: questionType,
      count: 1,
    }

    void queueBatch(payload)
      .then((data) => {
        setToast({ type: 'ok', text: String(data.status || 'Job Queued') })
      })
      .catch(() => {
        setToast({
          type: 'error',
          text: 'Hybrid AI API not reachable. Press F5 and keep the bottom panel open (port 8000).',
        })
      })
  }

  return (
    <div className="page gen-dash-root">
      {toast && (
        <div
          role="status"
          className={`gen-dash-toast ${toast.type === 'ok' ? 'gen-dash-toast--ok' : 'gen-dash-toast--error'}`}
        >
          {toast.text}
        </div>
      )}

      <header className="gen-dash-header">
        <p className="gen-dash-eyebrow">
          <Link to="/question-bank" className="gen-dash-crumb">
            Question Bank
          </Link>
          <span aria-hidden="true"> · </span>
          TestVantages
        </p>
        <h1 className="gen-dash-title">Hybrid AI</h1>
        <p className="gen-dash-subtitle">
          AI generation — pick exam, subject, chapter, type, and difficulty, then queue one draft. Jobs run in the
          background and land in your bank after review.
        </p>
      </header>

      <div className="gen-dash-card">
        <div className="gen-dash-field">
          <label htmlFor="gen-exam">Exam</label>
          <select
            id="gen-exam"
            className="gen-dash-select"
            value={exam}
            onChange={(e) => setExam(e.target.value as Exam)}
          >
            {EXAMS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <div className="gen-dash-field">
          <label htmlFor="gen-subject">Subject</label>
          <select
            id="gen-subject"
            className="gen-dash-select"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          >
            {subjects.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <div className="gen-dash-field">
          <label htmlFor="gen-chapter">Chapter</label>
          <select
            id="gen-chapter"
            className="gen-dash-select"
            value={chapter}
            onChange={(e) => setChapter(e.target.value)}
          >
            {chapters.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <div className="gen-dash-field">
          <label htmlFor="gen-qtype">Question type</label>
          <select
            id="gen-qtype"
            className="gen-dash-select"
            value={questionType}
            onChange={(e) => setQuestionType(e.target.value as (typeof QUESTION_TYPES)[number])}
          >
            {QUESTION_TYPES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <div className="gen-dash-field">
          <label htmlFor="gen-difficulty">Difficulty</label>
          <select
            id="gen-difficulty"
            className="gen-dash-select"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as (typeof DIFFICULTIES)[number])}
          >
            {DIFFICULTIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <button type="button" onClick={queueBatch} className="gen-dash-submit">
          Queue AI batch
        </button>
      </div>
    </div>
  )
}