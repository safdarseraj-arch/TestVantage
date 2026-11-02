import { useEffect, useMemo, useState } from 'react'

import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { useAuth } from '../context/AuthContext'
import ExamPatternCard from '../components/ExamPatternCard'
import PracticeSyllabusPicker from '../components/practice/PracticeSyllabusPicker'
import StudentMockPaperSummary from '../components/StudentMockPaperSummary'
import PreparePageHero from '../components/PreparePageHero'
import TestTypeCard from '../components/TestTypeCard'
import { narrateMockBuilderPlan } from '../utils/mockBuilderAiAssist.js'

import { EXAM_PATTERNS } from '../data/examPatterns'
import { TEST_TYPES } from '../data/testTypes'
import { loadPublishedUploadedQuestions } from '../utils/questionBank'
import { filterQuestionsForNonCdfUse } from '../utils/cdfOnlyQuestions.js'
import {
  filterQuestionsByExam,
  filterQuestionsForPracticeSyllabusTree,
} from '../utils/practiceFilters'
import { preferredStudentExamId } from '../utils/userProfiles'
import { isDemoStudentIdentity, DEMO_SAMPLE_TEST_IDS } from '../utils/demoStudentAccess.js'

const STUDENT_MOCK_TYPE_IDS = /** @type {const} */ (['full', 'part', 'chapter', 'calibrated'])

const EMPTY_SYLLABUS = {
  subjects: [],
  sections: [],
  chapters: [],
  topics: [],
}

const STUDENT_MOCK_TYPES = TEST_TYPES.filter((t) => STUDENT_MOCK_TYPE_IDS.includes(t.id))

export default function StudentMockTest() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { session } = useAuth()
  const demoStudent = isDemoStudentIdentity(session)

  const [testTypeId, setTestTypeId] = useState('full')
  const [examPatternId, setExamPatternId] = useState(() => preferredStudentExamId(session))
  const [syllabus, setSyllabus] = useState(EMPTY_SYLLABUS)
  const [paperPatternId, setPaperPatternId] = useState('')
  const [paperLabel, setPaperLabel] = useState('')
  const [error, setError] = useState('')
  const [mockNarrative, setMockNarrative] = useState(
    /** @type {{ text: string, badge: string, disclaimer?: string, cloudError?: string } | null} */ (null),
  )
  const [narrativeLoading, setNarrativeLoading] = useState(false)

  useEffect(() => {
    const type = searchParams.get('type')
    if (type && STUDENT_MOCK_TYPE_IDS.includes(type)) setTestTypeId(type)
  }, [searchParams])

  const [bank, setBank] = useState(/** @type {import('../data/tests').Question[]} */ ([]))
  const [bankReady, setBankReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      try {
        const rows = filterQuestionsForNonCdfUse(loadPublishedUploadedQuestions())
        if (!cancelled) setBank(rows)
      } catch (err) {
        console.error('Mock test: could not load question bank', err)
        if (!cancelled) setBank([])
      } finally {
        if (!cancelled) setBankReady(true)
      }
    }
    if (typeof requestIdleCallback === 'function') {
      const idleId = requestIdleCallback(load, { timeout: 120 })
      return () => {
        cancelled = true
        cancelIdleCallback(idleId)
      }
    }
    const t = setTimeout(load, 0)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [])

  const examBank = useMemo(
    () => filterQuestionsByExam(bank, examPatternId),
    [bank, examPatternId],
  )

  useEffect(() => {
    if (!demoStudent || !bankReady || syllabus.subjects.length) return
    const subjects = [...new Set(examBank.map((q) => String(q.subject ?? '').trim().toLowerCase()).filter(Boolean))]
    if (!subjects.length) return
    setSyllabus((prev) => ({ ...prev, subjects }))
  }, [demoStudent, bankReady, examBank, syllabus.subjects.length])

  const syllabusBank = useMemo(
    () => filterQuestionsForPracticeSyllabusTree(bank, examPatternId),
    [bank, examPatternId],
  )

  const [eligiblePool, setEligiblePool] = useState(/** @type {import('../data/tests').Question[]} */ ([]))

  useEffect(() => {
    if (!bankReady || !syllabus.subjects.length) {
      setEligiblePool([])
      return
    }
    let cancelled = false
    const run = async () => {
      try {
        const { getStudentMockEligiblePool } = await import('../utils/studentMockTest.js')
        const rows = getStudentMockEligiblePool(bank, examPatternId, syllabus)
        if (!cancelled) setEligiblePool(rows)
      } catch (err) {
        console.error('Mock test: eligible pool failed', err)
        if (!cancelled) setEligiblePool([])
      }
    }
    if (typeof requestIdleCallback === 'function') {
      const idleId = requestIdleCallback(run, { timeout: 250 })
      return () => {
        cancelled = true
        cancelIdleCallback(idleId)
      }
    }
    const t = setTimeout(run, 0)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [bankReady, bank, examPatternId, syllabus])

  const [mockHelpers, setMockHelpers] = useState(null)

  useEffect(() => {
    import('../utils/studentMockTest.js').then(setMockHelpers).catch((err) => {
      console.error('Mock test: helpers failed to load', err)
    })
  }, [])

  useEffect(() => {
    if (examPatternId !== 'jee-advanced') {
      setPaperPatternId('')
      setPaperLabel('')
      return
    }
    if (!mockHelpers) return
    const picked = mockHelpers.pickJeeAdvancedPaperTemplate()
    setPaperPatternId(picked.paperPatternId)
    setPaperLabel(picked.paperLabel)
  }, [examPatternId, mockHelpers])

  const [mockPlan, setMockPlan] = useState(null)

  useEffect(() => {
    if (!bankReady || !examPatternId || !syllabus.subjects.length) {
      setMockPlan(null)
      return
    }
    let cancelled = false
    const run = async () => {
      try {
        const { previewStudentMockPaper } = await import('../utils/studentMockSession.js')
        const plan = previewStudentMockPaper({
          testTypeId,
          examPatternId,
          syllabus,
          paperPatternId: examPatternId === 'jee-advanced' ? paperPatternId : undefined,
          bank,
        })
        if (!cancelled) setMockPlan(plan)
      } catch (err) {
        console.error('Mock test: paper preview failed', err)
        if (!cancelled) setMockPlan(null)
      }
    }
    if (typeof requestIdleCallback === 'function') {
      const idleId = requestIdleCallback(run, { timeout: 200 })
      return () => {
        cancelled = true
        cancelIdleCallback(idleId)
      }
    }
    const t = setTimeout(run, 0)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [bankReady, testTypeId, examPatternId, syllabus, paperPatternId, bank, eligiblePool.length])

  const durationMinutes = useMemo(
    () =>
      mockPlan?.durationMinutes ??
      (mockHelpers
        ? mockHelpers.resolveStudentMockDurationMinutes(
            testTypeId,
            examPatternId,
            0,
            undefined,
            syllabus.subjects.length,
          )
        : 0),
    [mockPlan?.durationMinutes, mockHelpers, testTypeId, examPatternId, syllabus.subjects.length],
  )

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

  const reshuffleJeePaper = () => {
    if (!mockHelpers) return
    const picked = mockHelpers.pickJeeAdvancedPaperTemplate()
    setPaperPatternId(picked.paperPatternId)
    setPaperLabel(picked.paperLabel)
  }

  const startMock = async () => {
    setError('')
    if (!syllabus.subjects.length) {
      setError('Select at least one subject.')
      return
    }
    if (!eligiblePool.length) {
      setError('No ready questions match this exam and syllabus.')
      return
    }
    if (!planReady) {
      setError('AI could not build this paper. Widen syllabus or add more questions.')
      return
    }
    try {
      const { createStudentMockSession } = await import('../utils/studentMockSession.js')
      const test = createStudentMockSession({
        testTypeId,
        examPatternId,
        syllabus,
        paperPatternId: examPatternId === 'jee-advanced' ? paperPatternId : undefined,
      })
      navigate(`/exam/${test.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start test.')
    }
  }

  const examPattern = EXAM_PATTERNS.find((p) => p.id === examPatternId)
  const selectedType = TEST_TYPES.find((t) => t.id === testTypeId)
  const planReady = mockHelpers ? mockHelpers.studentMockPlanReady(mockPlan) : false
  const canStart =
    syllabus.subjects.length > 0 && eligiblePool.length > 0 && planReady

  return (
    <div className="page student-mock-page student-portal-page prepare-mode-page prepare-mode-page--ai-mock-builder">
      <PreparePageHero
        modeId="ai-mock-builder"
        lead={
          <>
            Build a personalized NTA-style paper — choose type, exam, and syllabus.{' '}
            <span className="ai-tune-badge">AI</span> assembles questions with{' '}
            <strong>10–25% PYQ</strong> when available. Time scales with question count (real exam
            pace).
          </>
        }
      />
      {!bankReady && <p className="form-hint">Loading question bank…</p>}

      <section className="card create-section">
        <h2>1. Test paper type</h2>
        <div className="type-grid">
          {STUDENT_MOCK_TYPES.map((t) => (
            <TestTypeCard
              key={t.id}
              typeId={t.id}
              selected={testTypeId === t.id}
              onSelect={setTestTypeId}
            />
          ))}
        </div>
        {testTypeId === 'calibrated' && (
          <p className="form-hint ai-session-hint">
            <span className="ai-tune-badge">AI</span> After each answer, the next question is chosen
            live to find your true level (GRE-style).
          </p>
        )}
      </section>

      <section className="card create-section">
        <h2>2. Select exam</h2>
        <p className="form-hint">
          Marking and allowed question types follow this pattern (
          <strong>{examBank.length}</strong> questions in bank).
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
        {examPatternId === 'jee-advanced' && paperLabel && (
          <p className="form-hint ai-session-hint">
            <span className="ai-tune-badge">AI</span> JEE Advanced: one session uses{' '}
            <strong>{paperLabel}</strong> (Paper 1 or Paper 2 style from recent-year templates).{' '}
            <button type="button" className="btn btn-ghost btn-sm" onClick={reshuffleJeePaper}>
              Pick another paper
            </button>
          </p>
        )}
      </section>

      <section className="card create-section">
        <h2>3. Select syllabus</h2>
        {!bankReady ? (
          <p className="form-hint">Loading syllabus options…</p>
        ) : bank.length === 0 ? (
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
        <h2>4. Duration</h2>
        <p className="form-hint">
          {testTypeId === 'calibrated' ? (
            <>
              <strong>Real-Time Calibrated</strong> time: <strong>60 min</strong> per subject selected
              (1 → 60, 2 → 120, 3 → 180 for PCM). Question types and counts follow the real{' '}
              <strong>{examPattern?.name}</strong> pattern.
            </>
          ) : (
            <>
              Time follows <strong>real exam minutes × (your questions ÷ full exam questions)</strong>{' '}
              for <strong>{selectedType?.name}</strong> · <strong>{examPattern?.name}</strong>:
            </>
          )}
        </p>
        <p className="student-mock-duration-badge">
          <strong>{durationMinutes} minutes</strong> —{' '}
          {mockHelpers
            ? mockHelpers.formatStudentMockDurationLabel(
                testTypeId,
                examPatternId,
                mockPlan?.targetTotal ?? 0,
                examPatternId === 'jee-advanced' ? paperPatternId : undefined,
                syllabus.subjects.length,
              )
            : '…'}
        </p>
        <p className="form-hint">{syllabusSummaryLabel}</p>
        <p className="form-hint">
          Eligible pool: <strong>{eligiblePool.length}</strong> ready question
          {eligiblePool.length === 1 ? '' : 's'}
        </p>
      </section>

      {syllabus.subjects.length > 0 && (
        <section className="card create-section">
          <h2>5. AI paper preview</h2>
          <p className="form-hint">
            Review what AI selected before you start{' '}
            <strong>{selectedType?.name}</strong> · <strong>{examPattern?.name}</strong>.
          </p>
          {mockPlan && (
            <>
              <StudentMockPaperSummary
                title={`${selectedType?.name ?? 'Mock'} preview`}
                durationMinutes={mockPlan.durationMinutes}
                slots={mockPlan.slots}
                questions={mockPlan.questions}
                paperLabel={examPatternId === 'jee-advanced' ? paperLabel : undefined}
                adaptive={mockPlan.kind === 'calibrated'}
                targetTotal={mockPlan.targetTotal}
                pyqMix={mockPlan.tuneReport?.pyqMix}
              />
              <div style={{ marginTop: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={narrativeLoading}
                  onClick={async () => {
                    setNarrativeLoading(true)
                    try {
                      const tr = mockPlan.tuneReport ?? {}
                      const chapters = [
                        ...new Set(
                          (mockPlan.questions ?? [])
                            .map((q) => String(q.chapter ?? '').trim())
                            .filter(Boolean),
                        ),
                      ].slice(0, 8)
                      const result = await narrateMockBuilderPlan({
                        examId: examPatternId,
                        profileLabel: tr.profileLabel ?? selectedType?.name,
                        questionCount: mockPlan.questions?.length ?? mockPlan.targetTotal,
                        syllabusCoverage: tr.syllabusCoverage,
                        difficultyFit: tr.difficultyFit,
                        qualityScore: tr.qualityScore ?? tr.score,
                        pyqShare: tr.pyqMix?.percent ?? tr.pyqShare,
                        chapterHints: chapters,
                        notes: tr.notes ?? tr.warnings,
                      })
                      setMockNarrative(result)
                    } catch {
                      setMockNarrative({
                        text: 'Could not build plan notes. Your paper preview above is still ready.',
                        badge: 'Local AI',
                      })
                    } finally {
                      setNarrativeLoading(false)
                    }
                  }}
                >
                  {narrativeLoading ? 'Writing…' : 'Explain this mock (AI)'}
                </button>
                {mockNarrative && (
                  <div className="card-inner" style={{ marginTop: '0.5rem' }}>
                    <span
                      className="ocr-engine-badge"
                      data-engine={mockNarrative.badge?.includes('Cloud') ? 'cloud' : 'local'}
                    >
                      {mockNarrative.badge}
                    </span>
                    <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: '0.5rem 0 0' }}>
                      {mockNarrative.text}
                    </pre>
                    {mockNarrative.disclaimer && (
                      <p className="form-hint">{mockNarrative.disclaimer}</p>
                    )}
                    {mockNarrative.cloudError && (
                      <p className="form-hint" style={{ color: 'var(--danger, #b33)' }}>
                        Cloud tried and failed — showing Local AI. {mockNarrative.cloudError}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      )}

      {error && <p className="upload-error">{error}</p>}

      {demoStudent && !canStart ? (
        <p className="form-hint">
          AI Mock Builder needs tagged bank questions. You can still{' '}
          <Link to={`/exam/${DEMO_SAMPLE_TEST_IDS[0]}`}>start a sample mock</Link>
          {' '}from Mock Tests.
        </p>
      ) : null}

      <button type="button" className="btn btn-primary" onClick={startMock} disabled={!canStart}>
        Start {selectedType?.shortName ?? 'test'}
      </button>
    </div>
  )
}

