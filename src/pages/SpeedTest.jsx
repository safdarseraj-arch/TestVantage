import { useEffect, useMemo, useState } from 'react'

import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '../context/AuthContext'
import ExamPatternCard from '../components/ExamPatternCard'
import PreparePageHero from '../components/PreparePageHero'
import PracticeSyllabusPicker from '../components/practice/PracticeSyllabusPicker'
import SpeedDurationStep from '../components/createTest/SpeedDurationStep'
import SpeedPaperSummary from '../components/createTest/SpeedPaperSummary'

import { EXAM_PATTERNS } from '../data/examPatterns'
import { loadPublishedUploadedQuestions } from '../utils/questionBank'
import { filterQuestionsForNonCdfUse } from '../utils/cdfOnlyQuestions.js'
import {
  createSpeedSession,
  getSpeedEligiblePool,
  previewSpeedPaper } from '../utils/speedTestSession.js'
import {
  filterQuestionsByExam,
  filterQuestionsForPracticeSyllabusTree } from '../utils/practiceTest'
import { SPEED_TEST_MAX_TOUGHNESS } from '../utils/speedTest.js'
import { preferredStudentExamId } from '../utils/userProfiles'
import { isDemoStudentIdentity, DEMO_SAMPLE_TEST_IDS } from '../utils/demoStudentAccess.js'

const EMPTY_SYLLABUS = {
  subjects: [],
  sections: [],
  chapters: [],
  topics: [] }

export default function SpeedTest() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const demoStudent = isDemoStudentIdentity(session)

  const [syllabus, setSyllabus] = useState(EMPTY_SYLLABUS)
  const [examPatternId, setExamPatternId] = useState(() => preferredStudentExamId(session))
  const [durationMinutes, setDurationMinutes] = useState(30)
  const [error, setError] = useState('')

  const bank = filterQuestionsForNonCdfUse(loadPublishedUploadedQuestions())

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

  const speedPool = useMemo(
    () => getSpeedEligiblePool(bank, examPatternId, syllabus),
    [bank, examPatternId, syllabus],
  )

  const speedPlan = useMemo(() => {
    if (!examPatternId || !syllabus.subjects.length || !speedPool.length) return null
    return previewSpeedPaper({
      syllabus,
      examPatternId,
      durationMinutes,
      bank })
  }, [syllabus, examPatternId, durationMinutes, speedPool.length, bank])

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

  const startSpeedTest = () => {
    setError('')
    if (!syllabus.subjects.length) {
      setError('Select at least one subject.')
      return
    }
    if (!speedPool.length) {
      setError(
        `No toughness level 1–${SPEED_TEST_MAX_TOUGHNESS} questions match this exam and syllabus.`,
      )
      return
    }
    if (!speedPlan?.questions?.length) {
      setError('AI could not build a paper for this duration. Try a shorter time or wider syllabus.')
      return
    }
    try {
      const test = createSpeedSession({ syllabus, examPatternId, durationMinutes })
      navigate(`/exam/${test.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start speed test.')
    }
  }

  const examPattern = EXAM_PATTERNS.find((p) => p.id === examPatternId)
  const canStart =
    syllabus.subjects.length > 0 && speedPool.length > 0 && (speedPlan?.questions?.length ?? 0) > 0

  return (
    <div className="page speed-test-page student-portal-page prepare-mode-page prepare-mode-page--speed-test">
      <PreparePageHero
        modeId="speed-test"
        lead={
          <>
            Pick syllabus, exam, and duration (15–60 min).{' '}
            <span className="ai-tune-badge">AI</span> builds an easy–medium paper (toughness ≤{' '}
            {SPEED_TEST_MAX_TOUGHNESS}), shows count and marking, then you start the timed drill.
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
          Marking and question types follow this exam pattern (
          <strong>{examBank.length}</strong> questions tagged in bank).
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

      <SpeedDurationStep
        durationMinutes={durationMinutes}
        onChange={setDurationMinutes}
        syllabusLabel={syllabusSummaryLabel}
        poolCount={speedPool.length}
      />

      {syllabus.subjects.length > 0 && (
        <section className="card create-section">
          <h2>4. AI paper preview</h2>
          <p className="form-hint">
            Review what AI selected for <strong>{examPattern?.name}</strong> ·{' '}
            <strong>{durationMinutes} min</strong> before you start.
          </p>
          {speedPlan && (
            <SpeedPaperSummary
              durationMinutes={speedPlan.effectiveDurationMinutes ?? durationMinutes}
              requestedDurationMinutes={durationMinutes}
              plannedQuestionCount={speedPlan.plannedQuestionCount ?? 0}
              slots={speedPlan.slots}
              questions={speedPlan.questions}
            />
          )}
          {!speedPlan?.questions?.length && speedPool.length > 0 && (
            <p className="upload-error">
              Not enough easy questions for {durationMinutes} minutes. Pick a shorter duration or
              add more level 1–{SPEED_TEST_MAX_TOUGHNESS} questions to your syllabus.
            </p>
          )}
        </section>
      )}

      {error && <p className="upload-error">{error}</p>}

      {demoStudent && !canStart ? (
        <p className="form-hint">
          Speed drill needs easy tagged questions. You can still{' '}
          <Link to={`/exam/${DEMO_SAMPLE_TEST_IDS[0]}`}>start a sample mock</Link>.
        </p>
      ) : null}

      <button
        type="button"
        className="btn btn-primary"
        onClick={startSpeedTest}
        disabled={!canStart}
      >
        Start speed test
      </button>
    </div>
  )
}
