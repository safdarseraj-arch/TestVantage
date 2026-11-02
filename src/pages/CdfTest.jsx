import { useEffect, useMemo, useState } from 'react'

import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '../context/AuthContext'
import ExamPatternCard from '../components/ExamPatternCard'
import PreparePageHero from '../components/PreparePageHero'
import PracticeSyllabusPicker from '../components/practice/PracticeSyllabusPicker'
import CdfDurationStep from '../components/createTest/CdfDurationStep'
import CdfPaperSummary from '../components/createTest/CdfPaperSummary'

import { EXAM_PATTERNS } from '../data/examPatterns'
import { loadPublishedUploadedQuestions } from '../utils/questionBank'
import {
  createCdfSession,
  getCdfEligiblePool,
  previewCdfPaper,
} from '../utils/cdfTestSession.js'
import {
  filterQuestionsByExam,
  filterQuestionsForPracticeSyllabusTree,
} from '../utils/practiceTest'
import { CDF_TEST_TOUGHNESS } from '../utils/cdfTest.js'
import { preferredStudentExamId } from '../utils/userProfiles'
import { isDemoStudentIdentity, DEMO_SAMPLE_TEST_IDS } from '../utils/demoStudentAccess.js'

const EMPTY_SYLLABUS = {
  subjects: [],
  sections: [],
  chapters: [],
  topics: [],
}

export default function CdfTest() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const demoStudent = isDemoStudentIdentity(session)

  const [syllabus, setSyllabus] = useState(EMPTY_SYLLABUS)
  const [examPatternId, setExamPatternId] = useState(() => preferredStudentExamId(session))
  const [durationMinutes, setDurationMinutes] = useState(15)
  const [error, setError] = useState('')

  const bank = loadPublishedUploadedQuestions()

  const examBank = useMemo(
    () => filterQuestionsByExam(bank, examPatternId),
    [bank, examPatternId],
  )

  useEffect(() => {
    if (!demoStudent || syllabus.subjects.length) return
    const subjects = [...new Set(examBank.map((q) => String(q.subject ?? '').trim().toLowerCase()).filter(Boolean))]
    if (!subjects.length) return
    setSyllabus((prev) => ({ ...prev, subjects }))
  }, [demoStudent, examBank, syllabus.subjects.length])

  const syllabusBank = useMemo(
    () => filterQuestionsForPracticeSyllabusTree(bank, examPatternId),
    [bank, examPatternId],
  )

  const cdfPool = useMemo(
    () => getCdfEligiblePool(bank, examPatternId, syllabus),
    [bank, examPatternId, syllabus],
  )

  const cdfPlan = useMemo(() => {
    if (!examPatternId || !syllabus.subjects.length || !cdfPool.length) return null
    return previewCdfPaper({
      syllabus,
      examPatternId,
      durationMinutes,
      bank,
    })
  }, [syllabus, examPatternId, durationMinutes, cdfPool.length, bank])

  const syllabusSummaryLabel = useMemo(() => {
    const parts = [
      syllabus.subjects.length ? `Subjects: ${syllabus.subjects.join(', ')}` : '',
      syllabus.sections.length ? `Units: ${syllabus.sections.join(', ')}` : '',
      syllabus.chapters.length ? `Chapters: ${syllabus.chapters.join(', ')}` : '',
      syllabus.topics.length ? `Topics: ${syllabus.topics.join(', ')}` : '',
    ].filter(Boolean)
    return parts.length ? parts.join(' · ') : 'No syllabus selected'
  }, [syllabus])

  const onExamChange = (id) => {
    setExamPatternId(id)
    setSyllabus(EMPTY_SYLLABUS)
    setError('')
  }

  const startCdfTest = () => {
    setError('')
    if (!syllabus.subjects.length) {
      setError('Select at least one subject.')
      return
    }
    if (!cdfPool.length) {
      setError(
        `No toughness level ${CDF_TEST_TOUGHNESS} SCQ or T/F questions match this exam and syllabus.`,
      )
      return
    }
    if (!cdfPlan?.questions?.length) {
      setError('AI could not build a paper for this time slot. Try a shorter slot or wider syllabus.')
      return
    }
    try {
      const test = createCdfSession({ syllabus, examPatternId, durationMinutes })
      navigate(`/exam/${test.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start CDF test.')
    }
  }

  const examPattern = EXAM_PATTERNS.find((p) => p.id === examPatternId)
  const canStart =
    syllabus.subjects.length > 0 && cdfPool.length > 0 && (cdfPlan?.questions?.length ?? 0) > 0

  return (
    <div className="page cdf-test-page student-portal-page prepare-mode-page prepare-mode-page--cdf-test">
      <PreparePageHero
        modeId="cdf-test"
        lead={
          <>
            <strong>CDF</strong> = Concept, Definition &amp; Formula. Pick syllabus, exam, and a
            15–45 min slot. <span className="ai-tune-badge">AI</span> uses level-1 SCQ/T-F only.
            Each question has its own countdown — ideal for revision sprints.
          </>
        }
      />

      <section className="card create-section">
        <h2>1. Select syllabus</h2>
        {bank.length === 0 ? (
          <p className="form-hint">
            Question bank is empty. Ask your teacher to upload questions in the{' '}
            <Link to="/question-bank">Question Bank</Link>.
          </p>
        ) : (
          <PracticeSyllabusPicker
            bankQuestions={syllabusBank}
            countQuestions={examBank}
            examPatternId={examPatternId}
            syllabus={syllabus}
            onChange={setSyllabus}
          />
        )}
      </section>

      <section className="card create-section">
        <h2>2. Select exam</h2>
        <p className="form-hint">
          Marking follows this exam pattern (<strong>{examBank.length}</strong> questions tagged in
          bank).
        </p>
        <div className="pattern-grid">
          {EXAM_PATTERNS.map((p) => (
            <ExamPatternCard
              key={p.id}
              patternId={p.id}
              selected={examPatternId === p.id}
              onSelect={onExamChange}
            />
          ))}
        </div>
      </section>

      <CdfDurationStep
        durationMinutes={durationMinutes}
        onChange={setDurationMinutes}
        syllabusLabel={syllabusSummaryLabel}
        poolCount={cdfPool.length}
      />

      {syllabus.subjects.length > 0 && (
        <section className="card create-section">
          <h2>4. AI paper preview</h2>
          <p className="form-hint">
            Review what AI selected for <strong>{examPattern?.name}</strong> ·{' '}
            <strong>{durationMinutes} min</strong> before you start.
          </p>
          {cdfPlan && (
            <CdfPaperSummary
              durationMinutes={cdfPlan.effectiveDurationMinutes ?? durationMinutes}
              requestedDurationMinutes={durationMinutes}
              plannedQuestionCount={cdfPlan.plannedQuestionCount ?? 0}
              slots={cdfPlan.slots}
              questions={cdfPlan.questions}
            />
          )}
          {!cdfPlan?.questions?.length && cdfPool.length > 0 && (
            <p className="upload-error">
              Not enough level-1 SCQ/T/F questions for {durationMinutes} minutes. Pick a shorter
              time slot or add more toughness level {CDF_TEST_TOUGHNESS} questions.
            </p>
          )}
        </section>
      )}

      {error && <p className="upload-error">{error}</p>}

      {demoStudent && !canStart ? (
        <p className="form-hint">
          CDF needs level-1 tagged questions. You can still{' '}
          <Link to={`/exam/${DEMO_SAMPLE_TEST_IDS[0]}`}>start a sample mock</Link>.
        </p>
      ) : null}

      <button
        type="button"
        className="btn btn-primary"
        onClick={startCdfTest}
        disabled={!canStart}
      >
        Start Concept Definition and Formula test
      </button>
    </div>
  )
}
