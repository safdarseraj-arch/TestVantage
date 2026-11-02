import { useEffect, useMemo, useState } from 'react'

import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import ExamPatternCard from '../components/ExamPatternCard'

import TestTypeCard from '../components/TestTypeCard'

import CreateTestStepper from '../components/createTest/CreateTestStepper'
import SelectedSyllabusBanner from '../components/createTest/SelectedSyllabusBanner'

import SyllabusPickerStep from '../components/createTest/SyllabusPickerStep'

import TypeCountStep from '../components/createTest/TypeCountStep'

import SpeedDurationStep from '../components/createTest/SpeedDurationStep'

import SpeedPaperSummary from '../components/createTest/SpeedPaperSummary'

import MarkingSchemeStep from '../components/createTest/MarkingSchemeStep'

import PaperPrepareStep from '../components/createTest/PaperPrepareStep'

import { EXAM_PATTERNS, getExamPattern } from '../data/examPatterns'

import { TEST_TYPES, TEACHER_CREATABLE_TEST_TYPES } from '../data/testTypes'


import { addCustomTest, getCustomTestById, updateCustomTest } from '../utils/customTests'

import { prepareQuestionsForTest } from '../utils/testQuestionClone'

import { validatePaperReadiness } from '../utils/questionReadiness.js'

import { validatePaperForPublish, computePaperQualityScore, validateCalibratedPaperForPublish, computeCalibratedPaperQualityScore, createPublishSnapshot } from '../utils/paperPublish.js'

import PaperPublishChecklist from '../components/PaperPublishChecklist.jsx'

import PaperReviewStep from '../components/createTest/PaperReviewStep.jsx'

import { persistQuestionForBank } from '../utils/persistUpload.js'

import { buildCalibratedTestFromPool, resolveCalibratedSubjectOrder } from '../utils/buildCalibratedTest'
import { planCalibratedPaperFromExam } from '../utils/calibratedPaperPlan.js'

import { computeTestDuration } from '../utils/testConfig'

import { loadPublishedUploadedQuestions } from '../utils/questionBank'
import { filterQuestionsForNonCdfUse } from '../utils/cdfOnlyQuestions.js'
import { useAuth } from '../context/AuthContext'
import {
  canAccessMainQuestionBank,
  filterQuestionsForCreatePaper,
} from '../utils/teacherQuestionBank.js'

import { filterQuestionsBySyllabus, syllabusSelectionEmpty, validateSyllabusForTestType, formatSyllabusDisplay } from '../utils/syllabusMeta'
import { filterQuestionsForTeacherExam } from '../utils/practiceFilters.js'
import { buildTeacherPaperPool, interleavePyqQuestions } from '../utils/pyqTeacherPool.js'

import { aiTunePaper } from '../utils/aiPaperTuning.js'

import {
  buildSpeedPaperForDuration,
  filterQuestionsForSpeedTest,
  normalizeSpeedDurationChoice,
  SPEED_TEST_MAX_TOUGHNESS } from '../utils/speedTest.js'

import {

  applySlotMarkingToQuestion,

  autoAssemblePaper,

  defaultSlotsForExam,

  totalSlotCount,

  validateManualSelection } from '../utils/paperAssembly'

import { effectiveQuestionTypeId } from '../utils/bankListFilters'

import { getAnswerableQuestions } from '../utils/passage'



const EMPTY_SYLLABUS = {

  subjects: [],

  sections: [],

  chapters: [],

  topics: [] }



export default function CreateTest() {

  const navigate = useNavigate()

  const [searchParams] = useSearchParams()

  const { session, isAdmin } = useAuth()

  const accessMain = isAdmin || canAccessMainQuestionBank(session)

  const poolParam = searchParams.get('pool')

  const [paperPoolScope, setPaperPoolScope] = useState(() => {
    if (poolParam === 'main' && accessMain) return 'main'
    return 'mine'
  })

  const editId = searchParams.get('edit')?.trim() || ''

  const editingTest = editId ? getCustomTestById(editId) : null

  const isEditing = Boolean(editingTest)

  const [step, setStep] = useState(0)

  const [testTypeId, setTestTypeId] = useState('chapter')

  const [syllabus, setSyllabus] = useState(EMPTY_SYLLABUS)

  const [examPatternId, setExamPatternId] = useState('jee-main')

  const [slots, setSlots] = useState(() =>

    defaultSlotsForExam('jee-main', getExamPattern('jee-main')),

  )

  const [paperTemplateId, setPaperTemplateId] = useState('')

  const [pickMode, setPickMode] = useState(/** @type {'bank' | 'upload' | 'auto' | null} */ (null))

  const [selectedIds, setSelectedIds] = useState(/** @type {string[]} */ ([]))

  const [autoPreview, setAutoPreview] = useState(/** @type {import('../data/tests').Question[]} */ ([]))

  const [toughnessTarget, setToughnessTarget] = useState(5)

  const [pyqPercent, setPyqPercent] = useState(15)

  const [paperSource, setPaperSource] = useState(/** @type {'mixed' | 'pyq-only' | 'bank-only'} */ ('mixed'))

  const [title, setTitle] = useState('')

  const [antiCheatShuffle, setAntiCheatShuffle] = useState(true)

  const [speedDurationMinutes, setSpeedDurationMinutes] = useState(30)

  const [reviewApproved, setReviewApproved] = useState(false)

  const [error, setError] = useState('')

  useEffect(() => {
    if (!editingTest) return
    const patternId = editingTest.examPatternId ?? 'jee-main'
    setTestTypeId(editingTest.testTypeId ?? 'chapter')
    setSyllabus(editingTest.syllabusFilter ?? EMPTY_SYLLABUS)
    setExamPatternId(patternId)
    setSlots(
      editingTest.paperBlueprint?.length
        ? editingTest.paperBlueprint
        : defaultSlotsForExam(patternId, getExamPattern(patternId)),
    )
    setPaperTemplateId(editingTest.paperPatternId ?? '')
    setTitle(editingTest.title ?? '')
    setAntiCheatShuffle(editingTest.antiCheatShuffle ?? true)
    if (editingTest.testTypeId === 'speed') {
      setSpeedDurationMinutes(
        normalizeSpeedDurationChoice(editingTest.speedDurationMinutes ?? editingTest.durationMinutes),
      )
    }
    if (editingTest.testTypeId === 'calibrated' || editingTest.testTypeId === 'speed') {
      setStep(6)
    } else {
      setPickMode('bank')
      setSelectedIds(
        getAnswerableQuestions(editingTest.questions ?? [])
          .map((q) => q.id)
          .filter(Boolean),
      )
      setAutoPreview([])
      setStep(5)
    }
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId])

  const uploaded = useMemo(() => {
    const all = filterQuestionsForNonCdfUse(loadPublishedUploadedQuestions())
    return filterQuestionsForCreatePaper(all, {
      session,
      scope: accessMain && paperPoolScope === 'main' ? 'main' : 'mine',
    })
  }, [session, accessMain, paperPoolScope])

  const examBank = useMemo(
    () => filterQuestionsForTeacherExam(uploaded, examPatternId),
    [uploaded, examPatternId],
  )

  const syllabusPool = useMemo(
    () => {
      const filtered = filterQuestionsBySyllabus(examBank, syllabus)
      return buildTeacherPaperPool(filtered, examPatternId, syllabus, {
        pyqPercent: paperSource === 'mixed' ? pyqPercent : 0,
        pyqOnly: paperSource === 'pyq-only',
      })
    },
    [examBank, syllabus, examPatternId, pyqPercent, paperSource],
  )

  const pattern = EXAM_PATTERNS.find((p) => p.id === examPatternId)

  const syllabusSummaryLabel = useMemo(
    () => formatSyllabusDisplay(syllabus).summary,
    [syllabus],
  )



  const needTotal = totalSlotCount(slots)

  const calibratedActiveSubjects = useMemo(() => {
    if (testTypeId !== 'calibrated') return []
    return resolveCalibratedSubjectOrder(
      syllabusPool.length ? syllabusPool : uploaded,
      examPatternId,
      syllabus,
    ).subjectOrder
  }, [testTypeId, syllabusPool, uploaded, examPatternId, syllabus])

  const calibratedPlan = useMemo(() => {
    if (testTypeId !== 'calibrated' || !calibratedActiveSubjects.length) return null
    return planCalibratedPaperFromExam(slots, calibratedActiveSubjects, examPatternId)
  }, [testTypeId, calibratedActiveSubjects, slots, examPatternId])

  const calibratedDraft = useMemo(() => {
    if (testTypeId !== 'calibrated' || !calibratedPlan) return null
    return buildCalibratedTestFromPool(syllabusPool.length ? syllabusPool : uploaded, examPatternId, {
      questionsPerSection: calibratedPlan.questionsPerSection,
      questionsPerSectionBySubject: calibratedPlan.questionsPerSectionBySubject,
      syllabus,
      targetTotal: calibratedPlan.targetTotal })
  }, [testTypeId, syllabusPool, uploaded, examPatternId, calibratedPlan, syllabus])

  const skipsPrepareStep = testTypeId === 'calibrated' || testTypeId === 'speed'

  const skipsMarkingStep = testTypeId === 'speed'

  const speedPool = useMemo(() => {
    if (testTypeId !== 'speed') return []
    const base = syllabusPool.length ? syllabusPool : uploaded
    return filterQuestionsForSpeedTest(base)
  }, [testTypeId, syllabusPool, uploaded])

  const speedPaperPlan = useMemo(() => {
    if (testTypeId !== 'speed' || !speedDurationMinutes) return null
    const pool = syllabusPool.length ? syllabusPool : uploaded
    return buildSpeedPaperForDuration(speedDurationMinutes, pool, syllabus, examPatternId)
  }, [testTypeId, speedDurationMinutes, syllabusPool, uploaded, syllabus, examPatternId])

  const speedAiPreview = speedPaperPlan?.questions ?? []
  const speedSlots = speedPaperPlan?.slots ?? []

  useEffect(() => {
    if (testTypeId !== 'speed' || !speedSlots.length) return
    setSlots(speedSlots.map((s) => ({ ...s, marking: { ...s.marking } })))
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testTypeId, speedDurationMinutes, examPatternId, speedAiPreview.length])

  const mapWizardStep = (n) => {
    if (testTypeId === 'speed' && (n === 4 || n === 5)) return 6
    if (testTypeId === 'calibrated' && n === 5) return 6
    return n
  }
 

  const goToStep = (n) => {
    setStep(mapWizardStep(n))
  }

  const nextStep = () => {
    setStep((s) => {
      let n = s + 1
      if (testTypeId === 'speed' && n === 4) n = 6
      else if (skipsPrepareStep && n === 5) n = 6
      return Math.min(n, 7)
    })
  }

  const prevStep = () => {
    setStep((s) => {
      let n = s - 1
      if (testTypeId === 'speed' && (n === 5 || n === 4)) n = 3
      else if (testTypeId === 'calibrated' && n === 5) n = 4
      return Math.max(n, 0)
    })
  }

  const duration = useMemo(() => {
    if (testTypeId === 'speed') {
      return speedDurationMinutes
    }
    if (testTypeId === 'calibrated' && calibratedDraft) {
      return calibratedDraft.durationMinutes
    }
    return computeTestDuration(
      examPatternId,
      testTypeId,
      needTotal || 10,
      paperTemplateId || undefined,
    )
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    testTypeId,
    speedAiPreview,
    calibratedDraft,
    examPatternId,
    needTotal,
    paperTemplateId,
 
  ])



  const goExam = (id) => {

    setExamPatternId(id)

    setSlots(defaultSlotsForExam(id, getExamPattern(id)))

    setPaperTemplateId('')

    setPickMode(null)

    setSelectedIds([])

    setAutoPreview([])

  }



  const buildFinalQuestions = () => {

    if (testTypeId === 'speed') {
      return speedAiPreview
    }

    if (pickMode === 'auto' || pickMode === 'upload') {

      if (autoPreview.length) return autoPreview

      if (pickMode === 'auto') {
        const { questions } = aiTunePaper(syllabusPool, slots, syllabus, {
          profileId: paperSource === 'pyq-only' ? 'pyq_focus' : 'balanced',
          toughnessTarget,
          examPatternId,
          pyqPercent: paperSource === 'mixed' ? pyqPercent : paperSource === 'pyq-only' ? 100 : 0,
        })
        return interleavePyqQuestions(
          questions,
          paperSource === 'mixed' ? pyqPercent : paperSource === 'pyq-only' ? 100 : 0,
        )
      }

      const { questions } = autoAssemblePaper(syllabusPool, slots, syllabus, {

        toughnessTarget,

        examPatternId })

      return questions

    }

    const picked = uploaded.filter((q) => selectedIds.includes(q.id))

    const withMarking = getAnswerableQuestions(picked).map((q) => {

      const slot = slots.find((s) => {

        const types = s.questionTypeId === 'passage' ? ['passage_scq', 'passage_integer'] : [s.questionTypeId]

        return types.includes(effectiveQuestionTypeId(q))

      })

      return slot ? applySlotMarkingToQuestion(q, slot) : q

    })

    const parents = uploaded.filter(

      (q) => q.passageText && withMarking.some((c) => c.passageId === q.id),

    )

    return [...parents, ...withMarking]

  }



  const handleSavePaper = (mode) => {

    setError('')

    if (needTotal < 1) {

      setError('Add at least one question type with count ≥ 1.')

      return

    }



    const type = TEST_TYPES.find((t) => t.id === testTypeId)

    const syllabusLabel = syllabusSelectionEmpty(syllabus)

      ? 'Full bank'

      : [

          syllabus.subjects.join(', '),

          syllabus.sections.length ? `Units: ${syllabus.sections.join(', ')}` : '',

          syllabus.chapters.length ? `Chapters: ${syllabus.chapters.join(', ')}` : '',

        ]

          .filter(Boolean)

          .join(' · ')



    const testTitle =

      title.trim() ||

      `${pattern?.name} — ${type?.name}${syllabusLabel !== 'Full bank' ? ` (${syllabusLabel})` : ''}`



    const isPublish = mode === 'publish'

    if (isPublish && !reviewApproved) {
      setError('Check the box on the Review step to confirm you reviewed every question.')
      return
    }



    if (testTypeId === 'calibrated') {

      const built = buildCalibratedTestFromPool(syllabusPool.length ? syllabusPool : uploaded, examPatternId, {

        title: testTitle,

        questionsPerSection: calibratedPlan?.questionsPerSection ?? 8,

        questionsPerSectionBySubject: calibratedPlan?.questionsPerSectionBySubject,

        syllabus,

        targetTotal: calibratedPlan?.targetTotal ?? needTotal })

      if (!built) {

        setError('Need enough questions across subjects for a calibrated paper.')

        return

      }

      if (isPublish) {
        const pub = validateCalibratedPaperForPublish(built, { targetTotal: needTotal })
        if (!pub.ok) {
          const first = pub.problems[0]
          setError(`Cannot publish: ${first?.issues[0]?.message ?? 'fix questions in Question Bank.'}`)
          return
        }
      }

      const payload = {
        ...built,
        title: testTitle,
        antiCheatShuffle,
        paperBlueprint: slots,
        syllabusFilter: syllabusSelectionEmpty(syllabus) ? undefined : syllabus,
        status: isPublish ? 'published' : 'draft',
        qualityScore: isPublish
          ? computeCalibratedPaperQualityScore(built, { targetTotal: needTotal })
          : undefined }

      const test = isEditing
        ? updateCustomTest(editId, payload)
        : addCustomTest(payload)

      if (!test) {
        setError('Could not save paper — it may have been deleted. Go to Edit Test and try again.')
        return
      }

      navigate(isPublish ? `/paper-manifest/${test.id}` : '/edit-test')

      return

    }



    if (pickMode === 'bank') {

      const errs = validateManualSelection(

        uploaded.filter((q) => selectedIds.includes(q.id)),

        slots,

      )

      if (errs.length) {

        setError(errs.join(' '))

        return

      }

    }



    const rawQuestions = buildFinalQuestions()

    if (!rawQuestions.length) {

      setError(
        testTypeId === 'speed'
          ? `No AI-tuned speed paper could be built. Add more questions at toughness level ${SPEED_TEST_MAX_TOUGHNESS} or below in your syllabus.`
          : 'No questions selected. Use bank pick, upload, or auto-generate.',
      )

      return

    }

    const sourceBank =
      paperSource === 'pyq-only' ? [...uploaded, ...syllabusPool] : uploaded
    const prepared = prepareQuestionsForTest(sourceBank, rawQuestions).map((q) =>
      persistQuestionForBank(q, sourceBank),
    )

    const paperDuration =
      testTypeId === 'speed'
        ? speedDurationMinutes
        : duration

    if (isPublish) {
      const pub = validatePaperForPublish(prepared, { slots, strictKeys: true })
      if (!pub.ok) {
        const first = pub.problems[0]
        setError(
          `Cannot publish: Q${first?.index ?? '?'} — ${first?.issues[0]?.message ?? 'fix in Question Bank first.'}`,
        )
        return
      }
    } else {
      const draftCheck = validatePaperReadiness(prepared)
      if (!draftCheck.ok && prepared.length === 0) {
        setError('Add at least one question before saving.')
        return
      }
    }

    const paperPayload = {
      title: testTitle,
      description: `${type?.name} · ${needTotal} Q · ${syllabusLabel}`,
      examPatternId,
      paperPatternId: paperTemplateId || undefined,
      testTypeId,
      paperBlueprint: slots,
      syllabusFilter: syllabusSelectionEmpty(syllabus) ? undefined : syllabus,
      speedDurationMinutes: testTypeId === 'speed' ? speedDurationMinutes : undefined,
      questions: prepared,
      durationMinutes: paperDuration,
      totalQuestions: getAnswerableQuestions(prepared).length,
      antiCheatShuffle: testTypeId === 'practice' ? false : antiCheatShuffle,
      status: isPublish ? 'published' : 'draft',
      qualityScore: isPublish ? computePaperQualityScore(prepared, slots) : undefined,
      pyqMixMeta: {
        paperSource,
        pyqPercent: paperSource === 'mixed' ? pyqPercent : paperSource === 'pyq-only' ? 100 : 0,
      },
    }

    if (isPublish) {
      const snap = createPublishSnapshot(
        { ...paperPayload, publishVersion: isEditing ? editingTest?.publishVersion : 0 },
        prepared,
      )
      Object.assign(paperPayload, snap)
    }

    const test = isEditing ? updateCustomTest(editId, paperPayload) : addCustomTest(paperPayload)

    if (!test) {
      setError('Could not save paper — it may have been deleted. Go to Edit Test and try again.')
      return
    }

    navigate(isPublish ? `/paper-manifest/${test.id}` : '/edit-test')

  }



  const handleCreate = () => handleSavePaper('publish')



  const previewQuestions = useMemo(() => {
    if (testTypeId === 'calibrated') {
      return calibratedDraft?.questions ?? []
    }
    if (testTypeId === 'speed') {
      return speedAiPreview.length
        ? prepareQuestionsForTest(uploaded, speedAiPreview).map((q) =>
            persistQuestionForBank(q, uploaded),
          )
        : []
    }
    if (step < 6) return []
    try {
      const raw = buildFinalQuestions()
      return raw.length
        ? prepareQuestionsForTest(uploaded, raw).map((q) => persistQuestionForBank(q, uploaded))
        : []
    } catch {
      return []
    }
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    step,
    testTypeId,
    calibratedDraft,
    speedAiPreview,
    pickMode,
    selectedIds,
    autoPreview,
    uploaded,
    slots,
    syllabus,
    examPatternId,
    toughnessTarget,
  ])
 

  const syllabusError = validateSyllabusForTestType(testTypeId, syllabus)

  const canNext = () => {

    if (step === 1) {
      const err = validateSyllabusForTestType(testTypeId, syllabus)
      if (err) return false
    }

    if (step === 3) {
      if (testTypeId === 'speed') return speedDurationMinutes > 0 && speedPool.length > 0
      return needTotal > 0
    }

    if (step === 5) {

      if (!pickMode) return false

      if (pickMode === 'bank') {

        return (

          validateManualSelection(

            uploaded.filter((q) => selectedIds.includes(q.id)),

            slots,

          ).length === 0

        )

      }

      if (pickMode === 'auto') {
        if (!autoPreview.length) return false
        return (
          validateManualSelection(autoPreview, slots).length === 0 &&
          validatePaperForPublish(autoPreview, { slots, strictKeys: false }).blueprintOk
        )
      }

      if (pickMode === 'upload') return syllabusPool.length > 0

      return false

    }

    if (step === 6) {
      if (testTypeId === 'calibrated') return Boolean(calibratedDraft)
      if (testTypeId === 'speed') {
        return (
          speedAiPreview.length > 0 &&
          validateManualSelection(speedAiPreview, slots).length === 0 &&
          validatePaperForPublish(speedAiPreview, { slots, strictKeys: false }).blueprintOk
        )
      }
      return previewQuestions.length > 0
    }

    return true

  }



  if (editId && !editingTest) {
    return (
      <div className="page create-test-page">
        <h1>Paper not found</h1>
        <p className="upload-error">This paper may have been deleted or the link is old.</p>
        <p>
          <Link to="/edit-test" className="btn btn-primary btn-sm">
            Back to Edit Test
          </Link>
        </p>
      </div>
    )
  }

  return (

    <div className="page create-test-page create-wizard-page">

      <h1>{isEditing ? 'Modify test paper' : 'Create test paper'}</h1>

      <p className="lead">
        {isEditing
          ? `Editing: ${editingTest?.title ?? 'paper'}. Change steps below, then save.`
          : 'Step-by-step: paper type → syllabus → exam → blueprint → marking → prepare paper.'}
      </p>

      <p className="form-hint create-pool-scope">
        Question pool: <strong>{paperPoolScope === 'main' ? 'Main bank (published)' : 'Your questions (published)'}</strong>
        {' · '}
        {uploaded.length} ready
        {accessMain ? (
          <>
            {' · '}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setPaperPoolScope((s) => (s === 'mine' ? 'main' : 'mine'))}
            >
              {paperPoolScope === 'mine' ? 'Use main bank' : 'Use my questions only'}
            </button>
          </>
        ) : (
          ' · Ask an admin for main bank access to pick from the shared bank.'
        )}
      </p>

      {isEditing && (
        <p className="form-hint">
          <Link to="/edit-test">← Back to Edit Test list</Link>
        </p>
      )}



      <CreateTestStepper step={step} maxStep={7} onGo={goToStep} testTypeId={testTypeId} />

      {step >= 1 && (
        <SelectedSyllabusBanner
          syllabus={syllabus}
          poolCount={syllabusPool.length}
          testTypeId={testTypeId}
          examPatternName={step >= 2 ? pattern?.name : undefined}
          onEdit={step > 1 ? () => goToStep(1) : undefined}
        />
      )}



      {step === 0 && (

        <section className="create-section card">

          <h2>1. Test paper type</h2>

          <div className="type-grid">

            {TEACHER_CREATABLE_TEST_TYPES.map((t) => (

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
              <span className="ai-tune-badge">AI</span> Each question is picked live from student
              responses (GRE-style CAT) — AI finds the student&apos;s true level question by question.
            </p>
          )}

          {testTypeId === 'speed' && (
            <p className="form-hint ai-session-hint">
              <span className="ai-tune-badge">AI</span> Pick exam duration (15–60 min) — AI tunes
              questions up to <strong>toughness level {SPEED_TEST_MAX_TOUGHNESS}</strong> from your
              syllabus and shows question count + marking before start.
            </p>
          )}

          <p className="form-hint">
            <strong>Syllabus Practice</strong> and <strong>Precision Speed Test</strong> are for
            students only — they start them from <Link to="/practice">Syllabus Practice</Link> or{' '}
            <Link to="/speed-test">Speed Test</Link> on Home, not from Create Test. Students can also
            self-start Comprehensive, Subject, Chapter, and Calibrated papers from{' '}
            <Link to="/mock-test">AI Mock Builder</Link>.
          </p>

        </section>

      )}



      {step === 1 && (
        <>
          <SyllabusPickerStep
            examPatternId={examPatternId}
            bankQuestions={examBank}
            syllabus={syllabus}
            testTypeId={testTypeId}
            onChange={setSyllabus}
          />
          {syllabusError && (
            <p className="upload-error" role="alert">
              {syllabusError}
            </p>
          )}
        </>
      )}



      {step === 2 && (

        <section className="create-section card">

          <h2>2. Exam</h2>

          <p className="form-hint">Which exam pattern should marking and allowed question types follow?</p>

          <div className="pattern-grid">

            {EXAM_PATTERNS.map((p) => (

              <ExamPatternCard

                key={p.id}

                patternId={p.id}

                selected={examPatternId === p.id}

                onSelect={goExam}

              />

            ))}

          </div>

          {uploaded.length === 0 && (

            <p className="form-hint">

              <Link to="/question-bank">Upload questions</Link> to build papers from your bank.

            </p>

          )}

        </section>

      )}



      {step === 3 && testTypeId === 'speed' && (
        <SpeedDurationStep
          durationMinutes={speedDurationMinutes}
          onChange={setSpeedDurationMinutes}
          syllabusLabel={syllabusSummaryLabel}
          poolCount={speedPool.length}
        />
      )}

      {step === 3 && testTypeId !== 'speed' && (
        <TypeCountStep
          examPatternId={examPatternId}
          slots={slots}
          onChange={setSlots}
          bankPool={syllabusPool}
          syllabusLabel={syllabusSummaryLabel}
        />
      )}



      {step === 4 && !skipsMarkingStep && (

        <MarkingSchemeStep

          examPatternId={examPatternId}

          slots={slots}

          paperTemplateId={paperTemplateId}

          onSlotsChange={setSlots}

          onTemplateChange={setPaperTemplateId}

        />

      )}



      {step === 5 && !skipsPrepareStep && (

        <PaperPrepareStep

          pattern={pattern ?? EXAM_PATTERNS[0]}

          slots={slots}

          durationMinutes={duration}

          pickMode={pickMode}

          onModeChange={setPickMode}

          pool={examBank}

          syllabus={syllabus}

          examPatternId={examPatternId}

          toughnessTarget={toughnessTarget}

          onToughnessChange={setToughnessTarget}

          selectedIds={selectedIds}

          onSelectedIdsChange={setSelectedIds}

          onAutoResult={setAutoPreview}

          autoPreview={autoPreview}

          pyqPercent={pyqPercent}

          onPyqPercentChange={setPyqPercent}

          paperSource={paperSource}

          onPaperSourceChange={setPaperSource}

          syllabusPool={syllabusPool}

        />

      )}



      {step === 6 && (

        <section className="create-section card">

          <h2>Title &amp; summary</h2>

          <label>

            Test title (optional)

            <input

              type="text"

              value={title}

              onChange={(e) => setTitle(e.target.value)}

              placeholder="e.g. Rotational Motion — Chapter Test"

            />

          </label>

          {testTypeId !== 'practice' && (
            <label className="create-shuffle-toggle">
              <input
                type="checkbox"
                checked={antiCheatShuffle}
                onChange={(e) => setAntiCheatShuffle(e.target.checked)}
              />
              <span>
                <strong>Anti-cheat shuffle</strong> — each student gets a different question order
                and MCQ option order (recommended for class tests).
              </span>
            </label>
          )}

          <div className="create-preview-box">

            <p>

              {testTypeId === 'calibrated' ? (
                <>
                  Blueprint timing reference: <strong>{needTotal}</strong> question types ·{' '}
                  <strong>{duration}</strong> min · {pattern?.name} · pool after syllabus:{' '}
                  <strong>{syllabusPool.length}</strong>
                </>
              ) : testTypeId === 'speed' ? (
                <>
                  <strong>{speedDurationMinutes}</strong> min exam · {pattern?.name} · speed pool
                  (toughness ≤ {SPEED_TEST_MAX_TOUGHNESS}): <strong>{speedPool.length}</strong>
                </>
              ) : (
                <>
                  <strong>{needTotal}</strong> questions · <strong>{duration}</strong> min ·{' '}
                  {pattern?.name} · pool after syllabus: <strong>{syllabusPool.length}</strong>
                </>
              )}

            </p>

            {testTypeId === 'speed' && (
              <SpeedPaperSummary
                durationMinutes={speedDurationMinutes}
                slots={speedSlots}
                questions={previewQuestions}
              />
            )}

            {testTypeId === 'calibrated' && (
              <>
                <p className="form-hint ai-session-hint">
                  <span className="ai-tune-badge">AI</span> Paper is{' '}
                  <strong>AI tuned live</strong> (GRE-style) — questions are chosen from your syllabus
                  pool as each student answers. No manual pick step needed.
                </p>
                {calibratedDraft ? (
                  <p className="form-hint">
                    Adaptive target: <strong>{calibratedPlan?.targetTotal ?? needTotal}</strong> items ·{' '}
                    <strong>{calibratedActiveSubjects.length}</strong> subject
                    {calibratedActiveSubjects.length === 1 ? '' : 's'} ·{' '}
                    <strong>{calibratedPlan?.durationMinutes ?? calibratedDraft.durationMinutes}</strong> min ·{' '}
                    <strong>{calibratedDraft.questions?.length ?? 0}</strong> starter loaded now
                    (more appear during the exam)
                  </p>
                ) : (
                  <p className="upload-error">
                    Need more ready questions across subjects in your syllabus pool for a calibrated
                    paper.
                  </p>
                )}
              </>
            )}

            {testTypeId !== 'calibrated' && testTypeId !== 'speed' && pickMode === 'bank' && (

              <p className="form-hint">

                Source: <strong>Question bank</strong> — {selectedIds.length} selected (published
                questions only)

              </p>

            )}

            {testTypeId !== 'calibrated' && testTypeId !== 'speed' && pickMode === 'auto' && (

              <p className="form-hint">

                Source: <strong>AI tuned</strong>

                {autoPreview.length > 0 ? ` — ${autoPreview.length} questions` : ''}

              </p>

            )}

            {testTypeId !== 'calibrated' && testTypeId !== 'speed' && pickMode === 'upload' && (

              <p className="form-hint">

                Source: <strong>Uploaded questions</strong> — use bank pick or auto-fill if needed

              </p>

            )}

            {testTypeId !== 'practice' && (
              <p className="form-hint">
                Anti-cheat shuffle: <strong>{antiCheatShuffle ? 'On' : 'Off'}</strong>
              </p>
            )}

          </div>

          {previewQuestions.length > 0 && testTypeId !== 'calibrated' && (
            <PaperPublishChecklist questions={previewQuestions} slots={slots} strict />
          )}

          {testTypeId === 'calibrated' && calibratedDraft && (
            <PaperPublishChecklist
              questions={previewQuestions}
              calibrated
              calibratedDraft={calibratedDraft}
              targetTotal={needTotal}
            />
          )}

        </section>

      )}



      {step === 7 && (
        <PaperReviewStep
          questions={previewQuestions}
          slots={slots}
          reviewedOk={reviewApproved}
          onReviewedOkChange={setReviewApproved}
          calibratedDraft={testTypeId === 'calibrated' ? calibratedDraft : null}
          targetTotal={needTotal}
        />
      )}



      {error && <p className="upload-error">{error}</p>}



      <div className="create-wizard-nav">

        {step > 0 && (

          <button type="button" className="btn btn-secondary" onClick={prevStep}>

            Back

          </button>

        )}

        {step < 7 && (

          <button

            type="button"

            className="btn btn-primary"

            disabled={!canNext()}

            onClick={nextStep}

          >

            Next

          </button>

        )}

        {step === 6 && (

          <button type="button" className="btn btn-secondary" onClick={() => handleSavePaper('draft')}>

            Save as draft

          </button>

        )}

        {step === 7 && (

          <>
            <button type="button" className="btn btn-secondary" onClick={() => handleSavePaper('draft')}>

              Save as draft

            </button>

            <button
              type="button"
              className="btn btn-primary"
              disabled={!reviewApproved}
              onClick={handleCreate}
            >

              {isEditing ? 'Publish changes' : 'Publish paper'}

            </button>
          </>

        )}

      </div>

    </div>

  )

}




