import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getGuestId, getOwnerKey, saveAttempt } from '../utils/attemptHistory'
import { postTestResultsForBloomAnalytics } from '../utils/testResultsHybrid'
import { buildTestSnapshot } from '../utils/resolveTestForResult'
import { recordItemResponsesFromResult } from '../utils/itemResponseStats.js'
import {
  clearExamProgress,
  examProgressAutosaveMs,
  findExamProgressAsync,
  saveExamProgress,
  secondsLeftFromDeadline,
} from '../utils/examProgressStore'
import { isPlatformScaleEnabled } from '../config/platform.js'
import { submitAttemptRemote } from '../utils/examApi.js'
import { formatTime } from '../utils/formatTime'
import { recordGlobalScore } from '../utils/leaderboard'
import { awardMeritFromAttempt } from '../utils/meritStrideStore'
import { getOrCreateSparCode } from '../utils/peerPulseStore'
import { markDrillProgress } from '../utils/todaysDrillStore'
import { estimateAIR, getExamAirPoolSize, scoreToPercentile } from '../utils/percentile'
import { groupQuestionsBySubject, shouldUseSectionMode } from '../utils/sectionExam'
import {
  evaluateCalibratedSection,
  deliverCalibratedItems,
  gradeCalibratedItem,
  standingFromSections,
} from '../utils/calibratedExam'
import { calibratedSectionQuota } from '../utils/calibratedPaperPlan.js'
import { nextSectionDifficulty, difficultyLabel } from '../utils/adaptiveTest'
import {
  DEFAULT_ABILITY,
  abilityForNextSubject,
  blendStandingWithLiveAbility,
  standingFromLiveAbility,
  updateAbilityAfterItem,
} from '../utils/aiAdaptiveEngine'
import CalibratedStandingPanel from '../components/CalibratedStandingPanel'
import PatternBlueprint from '../components/PatternBlueprint'
import PaperReadinessIssuesPanel from '../components/PaperReadinessIssuesPanel'
import QuestionInput from '../components/QuestionInput'
import QuestionPalette from '../components/QuestionPalette'
import Timer from '../components/Timer'
import {
  EXAM_ACTION_EVENT,
  EXAM_INTEGER_ANSWER_EVENT,
  EXAM_MATRIX_ANSWER_EVENT,
  EXAM_MCQ_ANSWER_EVENT,
  runExamAction,
} from '../utils/examClickBridge.js'
import { normalizeMatrixAnswerKey, toggleMatrixGridCell } from '../utils/matrixMatch.js'
import { getTestPattern } from '../utils/patternResolver'
import { getQuestionType } from '../data/questionTypes'
import { getTestType } from '../data/testTypes'
import { getSubjectsForPattern } from '../data/subjects'
import { getTestById } from '../data/tests'
import { persistQuestionForBank } from '../utils/persistUpload.js'
import { dedupeQuestionsForExam } from '../utils/testQuestionClone.js'
import { validatePaperForPublish, isTestPublished, isCustomTestPaper } from '../utils/paperPublish.js'
import { getExamAccess, examAccessBlockMessage } from '../utils/examAccess.js'
import { PERMS } from '../utils/permissions'
import { getAssignedTestIdsForClasses } from '../utils/assignmentsStore.js'
import { getClassesForStudent } from '../utils/classesStore.js'
import { getUserById } from '../utils/users.js'
import { buildInitialAnswers } from '../utils/answers'
import { countPendingQuestions, getOrderedPendingIndices } from '../utils/examPending'
import { getAnswerableQuestions } from '../utils/passage'
import { evaluateTest } from '../utils/scoring'
import {
  applyExamQuestionOrder,
  buildExamShuffleLayout,
  extendExamShuffleLayout,
  getOptionPermForQuestion,
  shouldShuffleExamForTest,
} from '../utils/examShuffle'
import {
  countPracticePoolRemaining,
  extendPracticeSession,
} from '../utils/practiceTest.js'
import { extendPyqPracticeSession } from '../utils/pyqStudentSession.js'
import { getPyqStudyPool } from '../utils/pyqStudentTest.js'
import { healExamQuestionsForStudent } from '../utils/examQuestionHeal.js'
import {
  isExamProctoringEnabled,
  isRecoverableExamExit,
  PROCTOR_TAB_SWITCH_GRACE_MS,
  showExamProctorInstructions,
} from '../utils/examProctor.js'
import SpeedPaperSummary from '../components/createTest/SpeedPaperSummary'
import CdfPaperSummary from '../components/createTest/CdfPaperSummary'
import { formatSpeedTestTimingSummary, SPEED_TEST_MAX_TOUGHNESS, normalizeSpeedDurationChoice } from '../utils/speedTest.js'
import {
  formatCdfTestTimingSummary,
  CDF_TEST_TOUGHNESS,
  cdfSecondsForQuestion,
  normalizeCdfDurationChoice,
} from '../utils/cdfTest.js'
import { loadPublishedUploadedQuestions } from '../utils/questionBank.js'

export default function Exam() {
  const { testId } = useParams()
  const navigate = useNavigate()
  const { session, hasPermission, isUser } = useAuth()
  const canManagePapers = session?.role === 'admin' || hasPermission(PERMS.CREATE_PAPER)

  const studentClassIds = useMemo(() => {
    if (!isUser || !session?.userId) return []
    const user = getUserById(session.userId)
    if (user?.classIds?.length) return user.classIds
    return getClassesForStudent(session.userId).map((c) => c.id)
  }, [isUser, session?.userId])
  const test = useMemo(() => {
    try {
      return getTestById(testId)
    } catch (err) {
      console.error('[Exam] could not load test', testId, err)
      return undefined
    }
  }, [testId])
  const isCalibrated = test?.testTypeId === 'calibrated'
  const isSpeed = test?.testTypeId === 'speed'
  const isCdf = test?.testTypeId === 'cdf'
  const isPractice = test?.testTypeId === 'practice'
  const startedAtRef = useRef(null)
  const questionEnteredAtRef = useRef(Date.now())
  const cdfQuestionTimerFiredRef = useRef(/** @type {string | null} */ (null))
  const cdfTimerArmedRef = useRef(false)
  const saveNextRef = useRef(/** @type {() => void} */ (() => {}))
  const submittedRef = useRef(false)
  const proctorFiredRef = useRef(false)
  const proctorGraceTimerRef = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null))
  const latestProgressRef = useRef(/** @type {object | null} */ (null))
  const deadlineAtRef = useRef(null)
  const skipCalibratedInitRef = useRef(false)
  const examNavRef = useRef(/** @type {Record<string, unknown>} */ ({}))
  const ownerKey = getOwnerKey(session?.userId)

  const [liveQuestions, setLiveQuestions] = useState(/** @type {import('../data/tests').Question[]} */ ([]))
  const [practiceQuestions, setPracticeQuestions] = useState(
    /** @type {import('../data/tests').Question[]} */ ([]),
  )
  const [practiceSession, setPracticeSession] = useState(
    /** @type {import('../data/tests').Test | null} */ (null),
  )
  const [practiceBatchStartIndex, setPracticeBatchStartIndex] = useState(0)
  const [calMeta, setCalMeta] = useState(/** @type {import('../data/tests').CalibratedMeta | null} */ (null))
  const [calibratedSectionResults, setCalibratedSectionResults] = useState(
    /** @type {import('../utils/adaptiveTest').SectionResult[]} */ ([]),
  )

  const [examLayout, setExamLayout] = useState(/** @type {import('../utils/examShuffle').ExamShuffleLayout | null} */ (null))
  const [resumeOffer, setResumeOffer] = useState(null)
  const shuffleEnabled = test ? shouldShuffleExamForTest(test) : false

  useEffect(() => {
    if (!test || !testId) return
    let cancelled = false
    findExamProgressAsync(testId, {
      ownerKey,
      guestId: getGuestId(),
      email: session?.email,
    }).then((saved) => {
      if (!cancelled) setResumeOffer(saved)
    })
    return () => {
      cancelled = true
    }
  }, [testId, test, ownerKey, session?.email])

  const allAnswerable = useMemo(() => {
    if (!test) return []
    const raw =
      isCalibrated && liveQuestions.length > 0
        ? liveQuestions
        : isPractice && practiceQuestions.length > 0
          ? practiceQuestions
          : getAnswerableQuestions(test.questions)
    return dedupeQuestionsForExam(raw.map((q) => persistQuestionForBank(q, raw)))
  }, [test, isCalibrated, liveQuestions, isPractice, practiceQuestions])

// eslint-disable-next-line react-hooks/exhaustive-deps
  const questionBank = useMemo(() => loadPublishedUploadedQuestions(), [test?.id])

  const healResult = useMemo(() => {
    if (!test || canManagePapers) {
      return { questions: allAnswerable, swapped: [], ok: true }
    }
    return healExamQuestionsForStudent(allAnswerable, test, questionBank)
  }, [allAnswerable, test, questionBank, canManagePapers])

  const examQuestions = healResult.questions

  const assignedTestIds = useMemo(
    () => getAssignedTestIdsForClasses(studentClassIds),
    [studentClassIds],
  )

  const paperReadiness = useMemo(
    () =>
      validatePaperForPublish(allAnswerable, {
        slots: test?.paperBlueprint ?? [],
        strictKeys: true,
      }),
    [allAnswerable, test?.paperBlueprint],
  )

  const isDraftPaper = Boolean(test && isCustomTestPaper(test) && !isTestPublished(test))

  const examAccess = useMemo(
    () =>
      getExamAccess(testId, test, {
        session,
        canManagePapers,
        studentClassIds,
        assignedTestIds,
      }),
    [testId, test, session, canManagePapers, studentClassIds, assignedTestIds],
  )

  const examStartBlocked =
    !examAccess.allowed ||
    examQuestions.length === 0 ||
    (isDraftPaper && !canManagePapers)

  const paperQuestions = useMemo(() => {
    if (!shuffleEnabled || !examLayout?.enabled) return examQuestions
    return applyExamQuestionOrder(examQuestions, examLayout)
  }, [examQuestions, examLayout, shuffleEnabled])

  const pattern = test ? getTestPattern(test) : null
  const testType = test ? getTestType(test.testTypeId) : null
// eslint-disable-next-line react-hooks/exhaustive-deps
  const subjects = test ? getSubjectsForPattern(test.examPatternId) : []
  const [lockedSections, setLockedSections] = useState(() => new Set())
  const [activeSectionId, setActiveSectionId] = useState(
    () => subjects[0]?.id ?? 'physics',
  )
  const sectionMode = test
    ? shouldUseSectionMode(test.testTypeId, test.examPatternId)
    : false
  const sectionOrder = useMemo(() => {
    if (isCalibrated && calMeta?.subjectOrder?.length) return calMeta.subjectOrder
    return subjects.map((s) => s.id)
  }, [isCalibrated, calMeta, subjects])

  const sectionGroups = useMemo(
    () =>
      sectionMode
        ? groupQuestionsBySubject(paperQuestions, sectionOrder).filter((g) => g.questions.length)
        : [],
    [sectionMode, paperQuestions, sectionOrder],
  )

  const liveStanding = useMemo(() => {
    if (!isCalibrated || !calMeta) return null
    if (calibratedSectionResults.length > 0) {
      const base = standingFromSections(calibratedSectionResults)
      const liveAb = calMeta.abilityBySubject?.[activeSectionId]
      if (liveAb != null && !lockedSections.has(activeSectionId)) {
        return blendStandingWithLiveAbility(base, liveAb)
      }
      return base
    }
    const ab = calMeta.abilityBySubject?.[activeSectionId] ?? DEFAULT_ABILITY
    return standingFromLiveAbility(ab, calMeta.itemHistory ?? [])
  }, [isCalibrated, calMeta, calibratedSectionResults, activeSectionId, lockedSections])

  const calibratedSectionNeedsMoreItems = useMemo(() => {
    if (!isCalibrated || !calMeta) return false
    const n = liveQuestions.filter((item) => item.subject === activeSectionId).length
    return n < calibratedSectionQuota(calMeta, activeSectionId)
  }, [isCalibrated, calMeta, liveQuestions, activeSectionId])

  const nextSectionDifficultyHint = useMemo(() => {
    if (!isCalibrated || !calMeta || calibratedSectionResults.length === 0) return null
    const last = calibratedSectionResults[calibratedSectionResults.length - 1]
    const nextIdx = calMeta.subjectOrder.indexOf(last.subjectId) + 1
    const nextSubject = calMeta.subjectOrder[nextIdx]
    if (!nextSubject) return null
    return nextSectionDifficulty(last.accuracy, last.difficulty)
  }, [isCalibrated, calMeta, calibratedSectionResults])

  const [started, setStarted] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState(() =>
    test ? buildInitialAnswers(allAnswerable) : {},
  )
  const [marked, setMarked] = useState(() => new Set())
  const [secondsLeft, setSecondsLeft] = useState(
    test ? test.durationMinutes * 60 : 0,
  )
  const [showSubmit, setShowSubmit] = useState(false)
  const [showPracticeBatchEnd, setShowPracticeBatchEnd] = useState(false)
  const [tabViolations, setTabViolations] = useState(0)
  const [questionTimes, setQuestionTimes] = useState({})
  const [questionSecondsLeft, setQuestionSecondsLeft] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [answerResetKey, setAnswerResetKey] = useState(0)
  const [forcedSubmitNotice, setForcedSubmitNotice] = useState(
    /** @type {null | 'timeout' | 'proctor'} */ (null),
  )
  const [networkOffline, setNetworkOffline] = useState(
    () => typeof navigator !== 'undefined' && !navigator.onLine,
  )
  const visitedIdsRef = useRef(new Set())

  useEffect(() => {
    if (!test || !isCalibrated || skipCalibratedInitRef.current) return
    const qs = getAnswerableQuestions(test.questions)
    setLiveQuestions(qs)
    setCalMeta(
      test.calibratedMeta ? JSON.parse(JSON.stringify(test.calibratedMeta)) : null,
    )
    setCalibratedSectionResults([])
    setLockedSections(new Set())
    setActiveSectionId(qs[0]?.subject ?? 'physics')
    setAnswers(buildInitialAnswers(qs))
    setCurrentIndex(0)
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [test?.id, isCalibrated])

  const answerable = useMemo(() => {
    if (!sectionMode) return paperQuestions
    return paperQuestions.filter((q) => q.subject === activeSectionId)
  }, [sectionMode, paperQuestions, activeSectionId])

  const globalIndex = useMemo(() => {
    const q = answerable[currentIndex]
    if (!q) return 0
    return paperQuestions.findIndex((x) => x.id === q.id)
  }, [answerable, currentIndex, paperQuestions])

  const q = answerable[currentIndex]

  const paletteQuestions = useMemo(
    () => (sectionMode ? answerable : paperQuestions),
    [sectionMode, answerable, paperQuestions],
  )

  const pendingIndices = useMemo(
    () => getOrderedPendingIndices(paletteQuestions, answers, marked),
    [paletteQuestions, answers, marked],
  )

  const pendingElsewhere = useMemo(
    () =>
      sectionMode
        ? countPendingQuestions(
            paperQuestions.filter((item) => item.subject !== activeSectionId),
            answers,
            marked,
          )
        : 0,
    [sectionMode, paperQuestions, activeSectionId, answers, marked],
  )

  const pendingAhead = useMemo(
    () => getOrderedPendingIndices(paletteQuestions, answers, marked, currentIndex),
    [paletteQuestions, answers, marked, currentIndex],
  )

  const isLastInView = currentIndex >= Math.max(0, answerable.length - 1)

  const practicePoolRemaining = useMemo(() => {
    if (!isPractice) return 0
    const sessionTest = practiceSession ?? test
    if (!sessionTest) return 0
    if (sessionTest.practiceMeta?.pyqOnly && sessionTest.id?.startsWith('pystudy-')) {
      const meta = sessionTest.practiceMeta
      const pool = getPyqStudyPool(meta.examPatternId, meta.syllabus)
      const used = new Set(meta.usedBankIds ?? [])
      return pool.filter((q) => !used.has(q.id)).length
    }
    return countPracticePoolRemaining(sessionTest)
  }, [isPractice, practiceSession, test])

  const practiceAtBatchEnd = useMemo(() => {
    if (!isPractice || !test?.practiceMeta?.batchSize) return false
    const batchSize = test.practiceMeta.batchSize
    const inBatch = currentIndex - practiceBatchStartIndex + 1
    return isLastInView && inBatch >= batchSize
  }, [isPractice, test?.practiceMeta?.batchSize, currentIndex, practiceBatchStartIndex, isLastInView])

  const subjectLabel = useMemo(() => {
    if (!q) return ''
    const sub = subjects.find((s) => s.id === q.subject)
    return sub?.label ?? ''
  }, [q, subjects])

  const cdfQuestionLimit = useMemo(() => {
    if (!isCdf || !q) return 0
    return cdfSecondsForQuestion(q)
  }, [isCdf, q])

  const recordQuestionTime = useCallback(() => {
    if (!q) return
    const elapsed = Math.round((Date.now() - questionEnteredAtRef.current) / 1000)
    if (elapsed > 0) {
      setQuestionTimes((prev) => ({
        ...prev,
        [q.id]: (prev[q.id] ?? 0) + elapsed,
      }))
    }
    questionEnteredAtRef.current = Date.now()
  }, [q])

  const processCalibratedItemResponse = useCallback(
    (question, forcedGrade) => {
      if (!isCalibrated || !calMeta || !test || !question) return
      if (calMeta.gradedDeliveredIds?.includes(question.id)) return

      const grade =
        forcedGrade ?? gradeCalibratedItem(test, question, answers[question.id])
      const subjectId = question.subject ?? activeSectionId
      const prevAbility = calMeta.abilityBySubject?.[subjectId] ?? DEFAULT_ABILITY
      const nextAbility = updateAbilityAfterItem(prevAbility, question, grade)

      setCalMeta((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          abilityBySubject: { ...prev.abilityBySubject, [subjectId]: nextAbility },
          gradedDeliveredIds: [...(prev.gradedDeliveredIds ?? []), question.id],
          itemHistory: [
            ...(prev.itemHistory ?? []),
            {
              questionId: question.id,
              subjectId,
              grade,
              abilityAfter: nextAbility,
              toughness: question.toughnessLevel,
            },
          ],
        }
      })
    },
    [isCalibrated, calMeta, test, answers, activeSectionId],
  )

  const appendNextCalibratedItem = useCallback(
    (subjectId) => {
      if (!isCalibrated || !calMeta || !test) return false
      const deliveredInSection = liveQuestions.filter((item) => item.subject === subjectId).length
      if (deliveredInSection >= calibratedSectionQuota(calMeta, subjectId)) return false

      const ability = calMeta.abilityBySubject?.[subjectId] ?? DEFAULT_ABILITY
      const result = deliverCalibratedItems(
        calMeta,
        test.id,
        subjectId,
        ability,
        liveQuestions,
        1,
      )
      if (!result.questions.length) return false

      setCalMeta((prev) =>
        prev
          ? {
              ...prev,
              deliveredIds: result.deliveredIds,
              deliveredBankIds: result.deliveredBankIds,
              sectionItemsDelivered: result.sectionItemsDelivered ?? prev.sectionItemsDelivered,
            }
          : prev,
      )
      setLiveQuestions((prev) => [...prev, ...result.questions])
      if (shuffleEnabled) {
        setExamLayout((prev) =>
          extendExamShuffleLayout(
            prev ?? { questionIds: [], optionPerms: {}, enabled: true },
            result.questions,
            `${test.id}::${ownerKey}::item::${subjectId}::${deliveredInSection}`,
          ),
        )
      }
      setAnswers((prev) => ({ ...prev, ...buildInitialAnswers(result.questions) }))
      return true
    },
    [isCalibrated, calMeta, test, liveQuestions, shuffleEnabled, ownerKey],
  )

  const submitTest = useCallback((source = 'manual') => {
    if (!test || submittedRef.current) return
    submittedRef.current = true
    setSubmitting(true)
    setShowSubmit(false)
    if (source === 'timeout') setForcedSubmitNotice('timeout')
    if (source === 'proctor') setForcedSubmitNotice('proctor')
    const proctorTabViolations = source === 'proctor' ? Math.max(tabViolations, 1) : tabViolations
    recordQuestionTime()
    const submittedAt = Date.now()
    const durationSeconds = test.durationMinutes * 60 - secondsLeft
    const examTest = isCalibrated ? { ...test, questions: examQuestions } : test
    const result = evaluateTest(examTest, answers, {
      answerableOnly: true,
      marked: [...marked],
      questionTimes,
    })
    const calibratedStanding = isCalibrated
      ? standingFromSections(
          calibratedSectionResults.length > 0
            ? calibratedSectionResults
            : sectionGroups.map((g) => {
                const partial = evaluateCalibratedSection(test, g.questions, answers, {
                  marked: [...marked],
                  questionTimes,
                })
                const entry = calMeta?.sectionPlan?.find((p) => p.subjectId === g.subjectId)
                return {
                  ...partial,
                  difficulty: entry?.difficulty ?? 'medium',
                }
              }),
        )
      : null
    const percentile = scoreToPercentile(result.score, result.maxScore)
    const airPoolSize = getExamAirPoolSize(test.examPatternId)
    const estimatedAIR = estimateAIR(percentile, test.examPatternId)
    clearExamProgress(test.id, ownerKey)
    const payload = {
      testId: test.id,
      title: test.title,
      examPatternId: test.examPatternId,
      testTypeId: test.testTypeId,
      answers,
      marked: [...marked],
      result,
      submittedAt,
      startedAt: startedAtRef.current ?? submittedAt - durationSeconds * 1000,
      durationSeconds,
      ownerKey,
      userEmail: session?.email,
      userName: session?.name,
      percentile,
      estimatedAIR,
      airPoolSize,
      tabViolations: proctorTabViolations,
      questionTimes,
      sectionMode,
      calibratedStanding,
      calibratedSectionResults: isCalibrated ? calibratedSectionResults : undefined,
      visitedIds: [...visitedIdsRef.current],
      submitReason: source,
    }
    sessionStorage.setItem(`testvantage-result-${test.id}`, JSON.stringify(payload))
    const attemptId = `att-${Date.now()}`
    const resultSnapshot = {
      title: test.title,
      durationSeconds,
      percentile,
      estimatedAIR,
      airPoolSize,
      tabViolations: proctorTabViolations,
      submitReason: source,
      questionTimes,
      visitedIds: [...visitedIdsRef.current],
      calibratedStanding,
      calibratedSectionResults: isCalibrated ? calibratedSectionResults : undefined,
      result: {
        score: result.score,
        maxScore: result.maxScore,
        accuracy: result.accuracy,
        correct: result.correct,
        wrong: result.wrong,
        partial: result.partial,
        unattempted: result.unattempted,
        markedCount: result.markedCount,
        bySubject: result.bySubject,
        byChapter: result.byChapter,
        byQuestionType: result.byQuestionType,
        perQuestion: result.perQuestion,
      },
    }
    postTestResultsForBloomAnalytics({
      attemptId,
      testId: test.id,
      studentId: ownerKey,
      perQuestion: result.perQuestion ?? [],
    }).catch(() => {})
    saveAttempt({
      id: attemptId,
      ownerKey,
      testId: test.id,
      title: test.title,
      examPatternId: test.examPatternId,
      testTypeId: test.testTypeId,
      userName: session?.name ?? 'Guest',
      userEmail: session?.email ?? null,
      score: result.score,
      maxScore: result.maxScore,
      accuracy: result.accuracy,
      correct: result.correct,
      wrong: result.wrong,
      partial: result.partial,
      unattempted: result.unattempted,
      durationSeconds,
      submittedAt,
      percentile,
      estimatedAIR,
      airPoolSize,
      tabViolations: proctorTabViolations,
      submitReason: source,
      bySubject: result.bySubject,
      byChapter: result.byChapter,
      byQuestionType: result.byQuestionType,
      markedCount: result.markedCount,
      resultSnapshot,
      testSnapshot: buildTestSnapshot(test),
    })
    recordItemResponsesFromResult(result.perQuestion ?? [])
    if (isPlatformScaleEnabled()) {
      submitAttemptRemote(
        {
          id: attemptId,
          ownerKey,
          testId: test.id,
          submittedAt,
        durationSeconds,
          score: result.score,
          maxScore: result.maxScore,
          resultSnapshot,
        },
        { ownerKey, studentEmail: session?.email },
      ).catch(() => {})
    }
    recordGlobalScore({
      id: attemptId,
      testId: test.id,
      ownerKey,
      userName: session?.name ?? 'Student',
      score: result.score,
      maxScore: result.maxScore,
      submittedAt,
      percentile,
    })
    try {
      awardMeritFromAttempt({
        ownerKey,
        attemptId,
        score: result.score,
        maxScore: result.maxScore,
        accuracy: result.accuracy,
        testId: test.id,
        title: test.title,
      })
      getOrCreateSparCode(ownerKey, { name: session?.name ?? 'Student' })
      if (String(test.id).startsWith('drill-') || test.drillMeta) {
        markDrillProgress({
          ownerKey,
          ownerLabel: session?.name ?? 'Student',
          examPatternId: test.examPatternId || test.drillMeta?.examPatternId || 'jee-main',
          testId: test.id,
          score: result.score,
          maxScore: result.maxScore,
          accuracy: result.accuracy,
          completed: true,
        })
      }
    } catch (err) {
      console.warn('Merit / drill progress update failed', err)
    }
    navigate(`/result/${test.id}?attempt=${attemptId}`)
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    test,
    answers,
    marked,
    navigate,
    secondsLeft,
    session,
    tabViolations,
    questionTimes,
    recordQuestionTime,
    sectionMode,
    isCalibrated,
    examQuestions,
    calibratedSectionResults,
    calMeta,
    sectionGroups,
  ])

  const buildProgressSnapshot = useCallback(() => {
    if (!test || !started || submittedRef.current) return null
    const deadlineAt =
      deadlineAtRef.current ?? Date.now() + Math.max(0, secondsLeft) * 1000
    deadlineAtRef.current = deadlineAt
    return {
      testId: test.id,
      ownerKey,
      guestOwnerKey: getGuestId(),
      userEmail: session?.email ?? null,
      userName: session?.name ?? null,
      testTitle: test.title,
      deadlineAt,
      startedAt: startedAtRef.current ?? Date.now(),
      answers,
      marked: [...marked],
      currentIndex,
      activeSectionId,
      lockedSections: [...lockedSections],
      questionTimes,
      visitedIds: [...visitedIdsRef.current],
      tabViolations,
      isCalibrated,
      liveQuestions: isCalibrated ? liveQuestions : undefined,
      calMeta: isCalibrated && calMeta ? JSON.parse(JSON.stringify(calMeta)) : undefined,
      calibratedSectionResults: isCalibrated ? calibratedSectionResults : undefined,
      examLayout: examLayout ?? undefined,
    }
  }, [
    test,
    started,
    ownerKey,
    session,
    answers,
    marked,
    currentIndex,
    activeSectionId,
    lockedSections,
    questionTimes,
    tabViolations,
    secondsLeft,
    isCalibrated,
    liveQuestions,
    calMeta,
    calibratedSectionResults,
    examLayout,
  ])

  const applyResume = useCallback(
    (saved) => {
      if (examStartBlocked) return
      skipCalibratedInitRef.current = true
      proctorFiredRef.current = false
      startedAtRef.current = saved.startedAt ?? Date.now()
      deadlineAtRef.current = saved.deadlineAt
      questionEnteredAtRef.current = Date.now()
      visitedIdsRef.current = new Set(saved.visitedIds ?? [])
      setAnswers(saved.answers ?? {})
      setMarked(new Set(saved.marked ?? []))
      setCurrentIndex(saved.currentIndex ?? 0)
      setActiveSectionId(saved.activeSectionId ?? subjects[0]?.id ?? 'physics')
      setLockedSections(new Set(saved.lockedSections ?? []))
      setQuestionTimes(saved.questionTimes ?? {})
      setTabViolations(saved.tabViolations ?? 0)
      setSecondsLeft(secondsLeftFromDeadline(saved.deadlineAt))
      if (saved.isCalibrated && saved.liveQuestions?.length) {
        setLiveQuestions(saved.liveQuestions)
        setCalMeta(saved.calMeta ? JSON.parse(JSON.stringify(saved.calMeta)) : null)
        setCalibratedSectionResults(saved.calibratedSectionResults ?? [])
      }
      setExamLayout(saved.examLayout ?? null)
      setResumeOffer(null)
      setStarted(true)
    },
    [subjects, examStartBlocked],
  )

  const beginFreshTest = useCallback(() => {
    if (!test || examStartBlocked) return
    clearExamProgress(test.id, ownerKey)
    setResumeOffer(null)
    skipCalibratedInitRef.current = false
    proctorFiredRef.current = false
    startedAtRef.current = Date.now()
    deadlineAtRef.current = Date.now() + test.durationMinutes * 60 * 1000
    visitedIdsRef.current = new Set()
    const first = examQuestions[0]
    if (first?.id) visitedIdsRef.current.add(first.id)
    setAnswers(buildInitialAnswers(examQuestions))
    setMarked(new Set())
    setCurrentIndex(0)
    setQuestionTimes({})
    setTabViolations(0)
    setSecondsLeft(test.durationMinutes * 60)
    if (shuffleEnabled) {
      setExamLayout(
        buildExamShuffleLayout({
          testId: test.id,
          ownerKey,
          questions: examQuestions,
          sectionMode,
          sectionOrder,
          enabled: true,
        }),
      )
    } else {
      setExamLayout(null)
    }
    if (isPractice) {
      setPracticeQuestions(test.questions)
      setPracticeSession(test)
      setPracticeBatchStartIndex(0)
    }
    setStarted(true)
  }, [test, ownerKey, examQuestions, shuffleEnabled, sectionMode, sectionOrder, examStartBlocked, isPractice])

  useEffect(() => {
    if (!test || !isPractice) return
    setPracticeQuestions(test.questions)
    setPracticeSession(test)
    setPracticeBatchStartIndex(0)
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [test?.id, isPractice])

  useEffect(() => {
    if (!started || !test || !deadlineAtRef.current) return
    const tick = () => {
      const left = secondsLeftFromDeadline(deadlineAtRef.current)
      setSecondsLeft(left)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [started, test])

  useEffect(() => {
    if (!started || !isCdf || !q) return
    cdfQuestionTimerFiredRef.current = null
    setQuestionSecondsLeft(cdfQuestionLimit)
    cdfTimerArmedRef.current = cdfQuestionLimit > 0
    questionEnteredAtRef.current = Date.now()
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, isCdf, q?.id, cdfQuestionLimit])

  useEffect(() => {
    if (!started || !isCdf || submitting || cdfQuestionLimit <= 0) return
    const id = setInterval(() => {
      setQuestionSecondsLeft((s) => Math.max(0, s - 1))
    }, 1000)
    return () => clearInterval(id)
  }, [started, isCdf, q?.id, submitting, cdfQuestionLimit])

  useEffect(() => {
    if (!started || !isCdf || submitting || !q || questionSecondsLeft > 0) return
    if (!cdfTimerArmedRef.current) return
    if (cdfQuestionTimerFiredRef.current === q.id) return
    cdfQuestionTimerFiredRef.current = q.id
    cdfTimerArmedRef.current = false
    saveNextRef.current()
  }, [started, isCdf, submitting, q, questionSecondsLeft])

  const flushExamProgress = useCallback(() => {
      const snap = buildProgressSnapshot()
    if (!snap) return
    latestProgressRef.current = snap
    saveExamProgress(snap)
  }, [buildProgressSnapshot])

  useEffect(() => {
    if (!started || !test || submittedRef.current) return
    flushExamProgress()
    const interval = setInterval(flushExamProgress, examProgressAutosaveMs())
    return () => clearInterval(interval)
  }, [started, test, flushExamProgress])

  useEffect(() => {
    if (!started || !test || submittedRef.current) return
    const t = window.setTimeout(flushExamProgress, 800)
    return () => clearTimeout(t)
  }, [answers, marked, currentIndex, questionTimes, tabViolations, started, test, flushExamProgress])

  useEffect(() => {
    if (!started || !test || submittedRef.current) return
    const emergencySave = () => {
      const snap = latestProgressRef.current ?? buildProgressSnapshot()
      if (snap) saveExamProgress(snap)
    }
    window.addEventListener('pagehide', emergencySave)
    return () => window.removeEventListener('pagehide', emergencySave)
  }, [started, test, buildProgressSnapshot])

  useEffect(() => {
    if (secondsLeft === 0 && started && test && !submittedRef.current) {
      submitTest('timeout')
    }
  }, [secondsLeft, started, test, submitTest])

  useEffect(() => {
    if (!started || submittedRef.current || isPractice || !isExamProctoringEnabled()) return

    const flushSave = () => {
      flushExamProgress()
    }

    const clearGrace = () => {
      if (proctorGraceTimerRef.current) {
        clearTimeout(proctorGraceTimerRef.current)
        proctorGraceTimerRef.current = null
      }
    }

    const forceSubmitForProctor = () => {
      if (submittedRef.current || proctorFiredRef.current) return
      if (isRecoverableExamExit()) {
        flushSave()
        return
      }
      proctorFiredRef.current = true
      flushSave()
      setTabViolations((n) => (n > 0 ? n : 1))
      submitTest('proctor')
    }

    const scheduleProctorSubmit = () => {
      if (isRecoverableExamExit()) return
      clearGrace()
      proctorGraceTimerRef.current = window.setTimeout(() => {
        proctorGraceTimerRef.current = null
        if (document.hidden) {
          forceSubmitForProctor()
        }
      }, PROCTOR_TAB_SWITCH_GRACE_MS)
    }

    const onVisibility = () => {
      if (document.hidden) {
        flushSave()
        if (!isRecoverableExamExit()) scheduleProctorSubmit()
      } else {
        clearGrace()
      }
    }

    const onBlur = () => {
      window.setTimeout(() => {
        const active = document.activeElement
        if (active?.closest?.('.exam-layout')) return
        if (document.hidden && !submittedRef.current && !proctorFiredRef.current) {
          flushSave()
          if (!isRecoverableExamExit()) scheduleProctorSubmit()
        }
      }, 120)
    }

    const onPageHide = () => {
      clearGrace()
      flushSave()
      forceSubmitForProctor()
    }

    const onOffline = () => {
      setNetworkOffline(true)
      clearGrace()
      flushSave()
    }

    const onOnline = () => {
      setNetworkOffline(false)
      flushSave()
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', onBlur)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    return () => {
      clearGrace()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
    }
  }, [started, submitTest, isPractice, flushExamProgress])

  useEffect(() => {
    if (!started || !test || !shuffleEnabled || examLayout) return
    const qs = examQuestions
    if (!qs.length) return
    setExamLayout(
      buildExamShuffleLayout({
        testId: test.id,
        ownerKey,
        questions: qs,
        sectionMode,
        sectionOrder,
        enabled: true,
      }),
    )
  }, [
    started,
    test,
    shuffleEnabled,
    examLayout,
    examQuestions,
    ownerKey,
    sectionMode,
    sectionOrder,
  ])

  const examPaperReady = !shuffleEnabled || Boolean(examLayout?.enabled)

  useEffect(() => {
    questionEnteredAtRef.current = Date.now()
  }, [q?.id])

  useEffect(() => {
    /** @param {Event} ev */
    const onExamAction = (ev) => {
      const detail = /** @type {CustomEvent<{ action?: string, arg?: string }>} */ (ev).detail
      const action = detail?.action
      const arg = detail?.arg
      const nav = /** @type {Record<string, any>} */ (examNavRef.current)
      if (!action || !nav.ready) return

      switch (action) {
        case 'begin-test':
        case 'begin-fresh':
          nav.beginFreshTest?.()
          break
        case 'resume-test':
          nav.applyResume?.()
          break
        case 'save-next':
          nav.handleSaveNext?.()
          break
        case 'previous':
          if (nav.currentIndex > 0) nav.go?.(nav.currentIndex - 1)
          break
        case 'skip':
          nav.handleSkip?.()
          break
        case 'clear':
          nav.clearResponse?.()
          break
        case 'mark':
          nav.toggleMark?.()
          break
        case 'jump-pending':
          nav.jumpToFirstPending?.()
          break
        case 'palette': {
          const idx = parseInt(arg ?? '', 10)
          if (!Number.isNaN(idx)) nav.go?.(idx)
          break
        }
        case 'submit-open':
          nav.setShowSubmit?.(true)
          break
        case 'submit-close':
          nav.setShowSubmit?.(false)
          break
        case 'submit-confirm':
          nav.submitTest?.()
          break
        case 'submit-section':
          nav.submitCurrentSection?.()
          break
        case 'section-tab': {
          const subjectId = arg
          if (!subjectId) break
          const delivered = nav.liveQuestions?.some((item) => item.subject === subjectId)
          const locked = nav.lockedSections?.has(subjectId) || !delivered
          const active = subjectId === nav.activeSectionId
          if (!locked || active) {
            nav.setActiveSectionId?.(subjectId)
            nav.setCurrentIndex?.(0)
          }
          break
        }
        default:
          break
      }
    }
    window.addEventListener(EXAM_ACTION_EVENT, onExamAction)
    return () => window.removeEventListener(EXAM_ACTION_EVENT, onExamAction)
  }, [])

  useEffect(() => {
    if (!started) return
    const onEnter = (e) => {
      if (e.key !== 'Enter' || e.repeat) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (!/** @type {HTMLElement} */ (e.target)?.closest?.('.exam-layout')) return
      e.preventDefault()
      runExamAction('save-next')
    }
    window.addEventListener('keydown', onEnter)
    return () => window.removeEventListener('keydown', onEnter)
  }, [started])

  useEffect(() => {
    /** @param {Event} ev */
    const onIntegerAnswer = (ev) => {
      const detail = /** @type {CustomEvent<{ questionId?: string, value?: string | null }>} */ (ev).detail
      const id = detail?.questionId
      if (!id) return
      setAnswers((prev) => ({ ...prev, [id]: detail.value ?? null }))
    }
    window.addEventListener(EXAM_INTEGER_ANSWER_EVENT, onIntegerAnswer)
    return () => window.removeEventListener(EXAM_INTEGER_ANSWER_EVENT, onIntegerAnswer)
  }, [])

  useEffect(() => {
    /** @param {Event} ev */
    const onMatrixAnswer = (ev) => {
      const detail = /** @type {CustomEvent<{ questionId?: string, mode?: string, row?: number, col?: number, optionIndex?: number }>} */ (
        ev
      ).detail
      const id = detail?.questionId
      if (!id) return
      if (detail.mode === 'grid') {
        const row = detail.row
        const col = detail.col
        if (!Number.isInteger(row) || !Number.isInteger(col)) return
        setAnswers((prev) => {
          const cur = normalizeMatrixAnswerKey(/** @type {Record<number, number[]>} */ (prev[id]))
          return { ...prev, [id]: toggleMatrixGridCell(cur, row, col) }
        })
      return
    }
      if (detail.mode === 'option') {
        const optionIndex = detail.optionIndex
        if (!Number.isInteger(optionIndex)) return
        setAnswers((prev) => ({ ...prev, [id]: optionIndex }))
      }
    }
    window.addEventListener(EXAM_MATRIX_ANSWER_EVENT, onMatrixAnswer)
    return () => window.removeEventListener(EXAM_MATRIX_ANSWER_EVENT, onMatrixAnswer)
  }, [])

  useEffect(() => {
    /** @param {Event} ev */
    const onMcqAnswer = (ev) => {
      const detail = /** @type {CustomEvent<{ questionId?: string, value?: number, mode?: string }>} */ (
        ev
      ).detail
      const id = detail?.questionId
      const value = detail?.value
      if (!id || typeof value !== 'number' || Number.isNaN(value)) return
      setAnswers((prev) => {
        if (detail.mode === 'multi') {
          const cur = Array.isArray(prev[id]) ? [...prev[id]] : []
          const pos = cur.indexOf(value)
          if (pos >= 0) cur.splice(pos, 1)
          else cur.push(value)
          cur.sort((a, b) => a - b)
          return { ...prev, [id]: cur }
        }
        return { ...prev, [id]: value }
      })
    }
    window.addEventListener(EXAM_MCQ_ANSWER_EVENT, onMcqAnswer)
    return () => window.removeEventListener(EXAM_MCQ_ANSWER_EVENT, onMcqAnswer)
  }, [])

  if (!test) {
    return (
      <div className="page">
        <h1>Test not found</h1>
        <p className="form-hint">
          This paper may have been removed or the link is old. Go back and pick the test again from
          the list.
        </p>
        <Link to={testId?.startsWith('pystudy-') ? '/pyq' : testId?.startsWith('practice-') ? '/practice' : testId?.startsWith('speed-') ? '/speed-test' : '/tests'} className="btn btn-primary">
          Back to tests
        </Link>
      </div>
    )
  }

  if (!started) {
    examNavRef.current = {
      ready: true,
      beginFreshTest,
      applyResume: () => {
        if (resumeOffer) applyResume(resumeOffer)
      },
    }
    return (
      <div className="page instructions-page exam-layout">
        <h1>{test.title}</h1>
        <div className="instructions-badges">
          <span className="badge badge-exam" style={{ background: pattern?.color }}>
            {pattern?.name}
          </span>
          <span className="badge badge-type">
            {testType?.icon} {testType?.name}
          </span>
          {sectionMode && !isCalibrated && (
            <span className="badge badge-pro">Section-wise NTA mode</span>
          )}
          {isCalibrated && (
            <span className="badge badge-pro">Item-level AI adaptive (GRE-style)</span>
          )}
        </div>
        {examQuestions.length === 0 && (
          <div className="upload-error card" role="alert">
            <strong>This paper has no questions.</strong> Create the test again from Question Bank or
            Create Test.
          </div>
        )}
        {examAccess.reason === 'not_assigned' && (
          <div className="upload-error card" role="alert">
            <strong>{examAccessBlockMessage(examAccess)}</strong>
            <p className="form-hint">
              <Link to="/tests">Go to Mock Tests</Link> and use <strong>Assigned to me</strong>.
            </p>
          </div>
        )}
        {examAccess.reason === 'staff_pool' && (
          <div className="upload-error card" role="alert">
            <strong>{examAccessBlockMessage(examAccess)}</strong>
            <p className="form-hint">
              <Link to="/tests">Go to Mock Tests</Link> and start a labelled sample paper.
            </p>
          </div>
        )}
        {isDraftPaper && canManagePapers && (
          <div className="card form-hint" style={{ marginBottom: '1rem' }}>
            <strong>Draft paper</strong> — only you can preview this. Publish from{' '}
            <Link to="/edit-test">Edit Test</Link> before assigning to students.
          </div>
        )}
        {isDraftPaper && !canManagePapers && (
          <div className="upload-error card" role="alert">
            <strong>This paper is not published yet.</strong> Ask your teacher to publish it from Edit
            Test before you can begin.
          </div>
        )}
        {!paperReadiness.ok && allAnswerable.length > 0 && canManagePapers && (
          <PaperReadinessIssuesPanel
            problems={paperReadiness.problems}
            questions={allAnswerable}
            bank={questionBank}
          />
        )}
        {!canManagePapers && healResult.swapped.length > 0 && (
          <p className="form-hint card">
            Some questions were swapped for ready ones from your syllabus so your practice is not
            interrupted.
          </p>
        )}
        {!canManagePapers && examQuestions.length === 0 && allAnswerable.length > 0 && (
          <div className="upload-error card" role="alert">
            <strong>No ready questions available for this paper right now.</strong> Ask your teacher
            to fix or add questions in the Question Bank.
          </div>
        )}
        {isCalibrated && (
          <p className="form-hint ai-session-hint">
            <span className="ai-tune-badge">AI</span> You start with one question per section. After
            each answer, AI picks the next to find your true level (GRE-style adaptive).
          </p>
        )}
        {isSpeed && (
          <p className="form-hint ai-session-hint">
            <span className="ai-tune-badge">AI</span> This paper is <strong>AI tuned</strong> from
            questions up to toughness level {SPEED_TEST_MAX_TOUGHNESS}. Pacing:{' '}
            {formatSpeedTestTimingSummary()}.
          </p>
        )}
        {isCdf && (
          <p className="form-hint ai-session-hint">
            <span className="ai-tune-badge">AI</span>{' '}
            <strong>Concept Definition and Formula (CDF)</strong> — level-{CDF_TEST_TOUGHNESS} SCQ and
            T/F only. Each question has its own timer ({formatCdfTestTimingSummary()}). You move on
            when time ends or tap <strong>Save and Next</strong> early.
          </p>
        )}
        <div className="instructions-box">
          {!isPractice && !isSpeed && !isCdf && !test.pyqOfficialPaper && (
            <>
          <h2>Exam pattern blueprint</h2>
          {pattern && <PatternBlueprint pattern={pattern} />}
            </>
          )}
          {test.pyqOfficialPaper && (
            <p className="form-hint">
              This is the published official paper for the year you chose, in that paper’s order,
              question types, and lists.
            </p>
          )}
          {isSpeed && (
            <SpeedPaperSummary
              durationMinutes={test.durationMinutes}
              requestedDurationMinutes={normalizeSpeedDurationChoice(
                test.speedDurationMinutes ?? test.durationMinutes,
              )}
              plannedQuestionCount={test.speedPlannedQuestionCount ?? 0}
              slots={test.paperBlueprint ?? []}
              questions={examQuestions}
              compact
            />
          )}
          {isCdf && (
            <CdfPaperSummary
              durationMinutes={test.durationMinutes}
              requestedDurationMinutes={normalizeCdfDurationChoice(
                test.cdfDurationMinutes ?? test.durationMinutes,
              )}
              plannedQuestionCount={test.cdfPlannedQuestionCount ?? 0}
              slots={test.paperBlueprint ?? []}
              questions={examQuestions}
              compact
            />
          )}
          <h2>
            {isPractice ? 'Your session' : isSpeed || isCdf ? 'Before you start' : 'Advanced features'}
          </h2>
          <ul>
            <li>
              Questions: <strong>{examQuestions.length}</strong> · Duration:{' '}
              <strong>{test.durationMinutes} min</strong>
            </li>
            {isCalibrated && calMeta && (
              <>
                <li>
                  <strong>AI item-level adaptation</strong> — after each answer, AI picks the next
                  question to match your live ability (like GRE / adaptive tests). Difficulty updates
                  question by question to find your true level.
                </li>
                <li>
                  <strong>Section flow</strong> — complete one subject block, then the next subject
                  opens with AI-chosen difficulty based on your section score.
                </li>
                <li>
                  Planned: <strong>{calMeta.subjectOrder.length}</strong> sections ×{' '}
                  <strong>{calMeta.questionsPerSection}</strong> questions (
                  <strong>{test.totalQuestions}</strong> total).
                </li>
                <li>
                  <strong>Live standing</strong> — your proficiency tier updates after each question
                  and section.
                </li>
              </>
            )}
            {isSpeed && (
              <>
                <li>
                  <strong>AI tuned paper</strong> — questions are level {SPEED_TEST_MAX_TOUGHNESS} or
                  easier for speed and accuracy practice.
                </li>
                <li>
                  Review the question types and marking above, then click <strong>Start test</strong>.
                </li>
              </>
            )}
            {isCdf && (
              <>
                <li>
                  <strong>Per-question timer</strong> — Math 30s, Physics 25s, Chemistry/Biology 20s.
                  The test auto-advances when time runs out.
                </li>
                <li>
                  <strong>CDF focus</strong> — Concept, Definition &amp; Formula at toughness level
                  1 (SCQ and True/False).
                </li>
                <li>
                  Tap <strong>Save and Next</strong> anytime to move on before the per-question timer
                  ends.
                </li>
              </>
            )}
            {sectionMode && !isCalibrated && !isPractice && (
              <li>
                <strong>Section-wise flow</strong> — submit Physics, then Chemistry, then Math (like
                NTA).
              </li>
            )}
            {isPractice && (
              <>
                <li>
                  <strong>AI practice pick</strong> — questions are chosen for quality, chapter
                  spread, and balanced difficulty (not random shuffle).
                </li>
                <li>
                  <strong>Practice mode</strong> — one question at a time from your selected
                  syllabus. No tab-lock proctoring.
                </li>
                <li>
                  Submit when done to see result analysis — or <strong>Continue</strong> after each
                  batch for more questions until you submit.
                </li>
              </>
            )}
            {!isPractice && shuffleEnabled && (
              <li>
                <strong>Anti-cheat shuffle</strong> — question order and MCQ option order are
                different for each student (same order if you resume this attempt).
              </li>
            )}
            {!isPractice && !shuffleEnabled && (
            <li>
                <strong>Fixed order</strong> — all students see the same question and option order
                (anti-cheat shuffle is off for this paper).
            </li>
            )}
            {!isPractice && showExamProctorInstructions() && (
            <li>
                <strong>Anti-cheat proctoring</strong> — opening another tab or app, or{' '}
                <strong>closing the browser or tab</strong>, auto-saves and{' '}
                <strong>submits</strong> your paper.
            </li>
            )}
            <li>
              <strong>Per-question timing</strong> — see time spent in result analysis.
            </li>
            <li>
              <strong>AIR & percentile</strong> — estimated rank after submit (leaderboard).
            </li>
          </ul>
          {!isPractice && showExamProctorInstructions() && (
            <div className="exam-auto-submit-warning" role="alert">
              <strong>Warning — auto-saved and submitted:</strong> If you open another tab or app,
              switch away from this window, or <strong>close the browser or tab</strong>, your paper
              is saved and <strong>submitted immediately</strong>. You cannot resume that attempt.
              Only a sudden power cut or internet drop lets you use <strong>Resume test</strong>.
            </div>
          )}
        </div>

        {resumeOffer && (
          <div className="exam-resume-card card">
            <h2>Resume your test?</h2>
            <p>
              A saved attempt was found on this device
              {resumeOffer.userName ? ` (${resumeOffer.userName})` : ''}. Remaining time:{' '}
              <strong>{formatTime(secondsLeftFromDeadline(resumeOffer.deadlineAt))}</strong>
            </p>
            <p className="form-hint">
              Your last answers and marked questions will be restored. The timer continues from
              when you left — not reset.
            </p>
            <div className="exam-resume-actions">
              <button
                type="button"
                className="btn btn-primary"
                data-exam-action="resume-test"
                onClick={() => applyResume(resumeOffer)}
              >
                Resume test
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                data-exam-action="begin-fresh"
                onClick={beginFreshTest}
              >
                Start fresh (discard saved attempt)
              </button>
            </div>
          </div>
        )}

        <div className="instructions-actions">
          <Link
            to={
              testId?.startsWith('pystudy-')
                ? '/pyq'
                : isPractice
                  ? '/practice'
                  : isSpeed
                    ? '/speed-test'
                    : isCdf
                      ? '/cdf-test'
                      : '/tests'
            }
            className="btn btn-ghost"
          >
            Back
          </Link>
          {!resumeOffer && examQuestions.length > 0 && (
            <button
              type="button"
              className="btn btn-primary"
              data-exam-action="begin-test"
              disabled={examStartBlocked}
              onClick={beginFreshTest}
            >
              {examStartBlocked
                ? examAccess.reason === 'not_assigned'
                  ? 'Not assigned to your class'
                  : 'Paper not ready — fix in Question Bank'
                : 'I am ready — begin test'}
            </button>
          )}
        </div>
      </div>
    )
  }

  if (!q) {
    return (
      <div className="page">
        <h1>Cannot open this question</h1>
        <p className="form-hint">Try going back and starting the test again.</p>
        <Link to="/tests" className="btn btn-primary">
          Back to tests
        </Link>
      </div>
    )
  }

  const clearResponse = () => {
    setAnswers((prev) => ({ ...prev, [q.id]: buildInitialAnswers([q])[q.id] }))
    setAnswerResetKey((k) => k + 1)
  }

  const toggleMark = () => {
    setMarked((prev) => {
      const next = new Set(prev)
      if (next.has(q.id)) next.delete(q.id)
      else next.add(q.id)
      return next
    })
  }

  const go = (index) => {
    recordQuestionTime()
    if (isCalibrated && q && index > currentIndex && calMeta && test) {
      processCalibratedItemResponse(q)
      const deliveredInSection = liveQuestions.filter((item) => item.subject === activeSectionId).length
      const atLastDelivered = currentIndex >= deliveredInSection - 1
      if (atLastDelivered && deliveredInSection < calibratedSectionQuota(calMeta, activeSectionId)) {
        if (appendNextCalibratedItem(activeSectionId)) {
          setCurrentIndex(currentIndex + 1)
          return
        }
      }
    }
    if (index >= 0 && index < answerable.length) {
      const nextQ = answerable[index]
      if (nextQ?.id) visitedIdsRef.current.add(nextQ.id)
      setCurrentIndex(index)
    }
  }

  const submitCurrentSection = () => {
    recordQuestionTime()
    if (isCalibrated && q) {
      processCalibratedItemResponse(q)
    }
    if (isCalibrated && calMeta && test) {
      const sectionQs = liveQuestions.filter((q) => q.subject === activeSectionId)
      const planEntry = calMeta.sectionPlan.find((p) => p.subjectId === activeSectionId)
      const difficulty = planEntry?.difficulty ?? 'medium'
      const partial = evaluateCalibratedSection(test, sectionQs, answers, {
        marked: [...marked],
        questionTimes,
      })
      const sectionResult = { ...partial, difficulty }
      const nextResults = [...calibratedSectionResults, sectionResult]
      setCalibratedSectionResults(nextResults)

      const nextLocked = new Set(lockedSections)
      nextLocked.add(activeSectionId)
      setLockedSections(nextLocked)

      const nextIdx = calMeta.subjectOrder.indexOf(activeSectionId) + 1
      const nextSubject = calMeta.subjectOrder[nextIdx]
      if (nextSubject) {
        const nextDiff = nextSectionDifficulty(sectionResult.accuracy, difficulty)
        const sectionAbility = calMeta.abilityBySubject?.[activeSectionId] ?? DEFAULT_ABILITY
        const nextAbility = abilityForNextSubject(sectionAbility, sectionResult.accuracy, nextDiff)
        const metaForNext = {
          ...calMeta,
          abilityBySubject: { ...calMeta.abilityBySubject, [nextSubject]: nextAbility },
        }
        const { questions, deliveredIds, deliveredBankIds, sectionItemsDelivered } =
          deliverCalibratedItems(metaForNext, test.id, nextSubject, nextAbility, liveQuestions, 1)
        setCalMeta({
          ...metaForNext,
          deliveredIds,
          deliveredBankIds: deliveredBankIds ?? calMeta.deliveredBankIds,
          sectionItemsDelivered: sectionItemsDelivered ?? calMeta.sectionItemsDelivered,
          sectionPlan: calMeta.sectionPlan.map((p) =>
            p.subjectId === nextSubject ? { ...p, difficulty: nextDiff } : p,
          ),
        })
        setLiveQuestions((prev) => [...prev, ...questions])
        if (shuffleEnabled) {
          setExamLayout((prev) =>
            extendExamShuffleLayout(
              prev ?? { questionIds: [], optionPerms: {}, enabled: true },
              questions,
              `${test.id}::${ownerKey}::section::${nextSubject}`,
            ),
          )
        }
        setAnswers((prev) => ({ ...prev, ...buildInitialAnswers(questions) }))
        setActiveSectionId(nextSubject)
        setCurrentIndex(0)
      } else {
        setShowSubmit(true)
      }
      return
    }

    const nextLocked = new Set(lockedSections)
    nextLocked.add(activeSectionId)
    setLockedSections(nextLocked)
    const nextSection = sectionGroups.find((g) => !nextLocked.has(g.subjectId))
    if (nextSection) {
      setActiveSectionId(nextSection.subjectId)
      setCurrentIndex(0)
    } else {
      setShowSubmit(true)
    }
  }

  const typeDef = getQuestionType(q.questionType ?? 'single_correct')
  const paletteIndex = sectionMode ? currentIndex : globalIndex

  const finishTest = () => {
    recordQuestionTime()
    if (isCalibrated && q) {
      processCalibratedItemResponse(q)
    }
    if (isPractice && practiceAtBatchEnd && practicePoolRemaining > 0) {
      setShowPracticeBatchEnd(true)
      return
    }
    if (sectionMode && !lockedSections.has(activeSectionId)) {
      submitCurrentSection()
    } else {
      setShowSubmit(true)
    }
  }

  const continuePracticeBatch = () => {
    if (!testId) return
    recordQuestionTime()
    const result = testId.startsWith('pystudy-')
      ? extendPyqPracticeSession(testId, { userId: session?.userId })
      : extendPracticeSession(testId, { userId: session?.userId })
    if (!result.ok) {
      setShowPracticeBatchEnd(false)
      setShowSubmit(true)
      return
    }
    const prevLen = getAnswerableQuestions(result.test.questions).length - result.addedCount
    setPracticeSession(result.test)
    setPracticeQuestions(result.test.questions)
    setPracticeBatchStartIndex(prevLen)
    setAnswers((prev) => ({
      ...prev,
      ...buildInitialAnswers(getAnswerableQuestions(result.addedQuestions)),
    }))
    const extraSec = Math.max(5, Math.ceil(result.addedCount * 2.5)) * 60
    deadlineAtRef.current = (deadlineAtRef.current ?? Date.now()) + extraSec * 1000
    setSecondsLeft((s) => s + extraSec)
    const firstNew = getAnswerableQuestions(result.addedQuestions)[0]
    if (firstNew?.id) visitedIdsRef.current.add(firstNew.id)
    setCurrentIndex(prevLen)
    setShowPracticeBatchEnd(false)
  }

  const handleSaveNext = () => {
    if (!isLastInView) {
      go(currentIndex + 1)
      return
    }
    if (pendingAhead.length > 0) {
      go(pendingAhead[0])
      return
    }
    if (isCalibrated && calibratedSectionNeedsMoreItems) {
      go(currentIndex + 1)
      return
    }
    finishTest()
  }

  saveNextRef.current = handleSaveNext

  /** Skip current question — leave unattempted and move forward. */
  const handleSkip = () => {
    recordQuestionTime()
    if (isCalibrated && q) {
      processCalibratedItemResponse(q, 'unattempted')
    }
    setAnswers((prev) => ({ ...prev, [q.id]: buildInitialAnswers([q])[q.id] }))
    setMarked((prev) => {
      if (!prev.has(q.id)) return prev
      const next = new Set(prev)
      next.delete(q.id)
      return next
    })
    if (!isLastInView) {
      go(currentIndex + 1)
      return
    }
    if (pendingAhead.length > 0) {
      go(pendingAhead[0])
      return
    }
    if (isCalibrated && calibratedSectionNeedsMoreItems) {
      go(currentIndex + 1)
      return
    }
    finishTest()
  }

  const saveNextLabel = (() => {
    if (!isLastInView) return 'Save and Next'
    if (pendingAhead.length > 0) return 'Review pending'
    if (isCalibrated && calibratedSectionNeedsMoreItems) return 'Save and Next'
    if (isPractice && practiceAtBatchEnd && practicePoolRemaining > 0) return 'Submit or Continue'
    if (sectionMode && !lockedSections.has(activeSectionId)) return 'Save and Next'
    if (isPractice) return 'Finish practice'
    return 'Finish test'
  })()

  const jumpToFirstPending = () => {
    if (pendingAhead.length > 0) go(pendingAhead[0])
  }

  examNavRef.current = {
    ready: true,
    currentIndex,
    handleSaveNext,
    handleSkip,
    clearResponse,
    toggleMark,
    jumpToFirstPending,
    go,
    finishTest,
    submitTest: () => submitTest('manual'),
    setShowSubmit,
    submitCurrentSection,
    activeSectionId,
    lockedSections,
    liveQuestions,
    setActiveSectionId,
    setCurrentIndex,
  }

  if (!examPaperReady) {
    return (
      <div className="exam-layout">
        <header className="exam-header">
          <div className="exam-header-left">
            <span className="exam-brand">TestVantages Pro</span>
            <span className="exam-title">{test.title}</span>
          </div>
          <Timer secondsLeft={secondsLeft} />
        </header>
        <div className="exam-body">
          <section className="question-panel">
            <p>Preparing your paper…</p>
          </section>
        </div>
      </div>
    )
  }

  return (
    <div className="exam-layout">
      <header className="exam-header">
        <div className="exam-header-left">
          <span className="exam-brand">TestVantages Pro</span>
          <span className="exam-title">{test.title}</span>
        </div>
        {sectionMode && (
          <div className="section-tabs">
            {(isCalibrated && calMeta ? calMeta.subjectOrder : sectionGroups.map((g) => g.subjectId)).map(
              (subjectId) => {
                const sub = subjects.find((s) => s.id === subjectId)
                const delivered = liveQuestions.some((q) => q.subject === subjectId)
                const locked = lockedSections.has(subjectId) || !delivered
                const active = subjectId === activeSectionId
                const planDiff = calMeta?.sectionPlan?.find((p) => p.subjectId === subjectId)
                  ?.difficulty
                const inSectionCount = liveQuestions.filter((item) => item.subject === subjectId).length
                return (
                  <button
                    key={subjectId}
                    type="button"
                    disabled={locked && !active}
                    className={`section-tab ${active ? 'active' : ''} ${locked ? 'locked' : ''}`}
                    data-exam-action="section-tab"
                    data-exam-arg={subjectId}
                    onClick={() => {
                      if (!locked || active) {
                        setActiveSectionId(subjectId)
                        setCurrentIndex(0)
                      }
                    }}
                  >
                    {sub?.label}
                    {isCalibrated && planDiff && delivered && (
                      <span className="section-tab-diff"> · {difficultyLabel(planDiff)}</span>
                    )}
                    {isCalibrated && active && calMeta && (
                      <span className="section-tab-progress">
                        {' '}
                        {inSectionCount}/{calibratedSectionQuota(calMeta, subjectId)}
                      </span>
                    )}
                    {lockedSections.has(subjectId) && ' ✓'}
                  </button>
                )
              },
            )}
          </div>
        )}
        {isCalibrated && liveStanding && (
          <CalibratedStandingPanel
            standing={liveStanding}
            sectionResults={calibratedSectionResults}
            nextDifficulty={nextSectionDifficultyHint ?? undefined}
            liveItemCount={calMeta?.itemHistory?.length ?? 0}
            compact
          />
        )}
        <Timer secondsLeft={secondsLeft} />
        {isCdf && (
          <Timer
            secondsLeft={questionSecondsLeft}
            warningAt={5}
            label="This question"
            className="cdf-question-timer-display"
          />
        )}
        {sectionMode && !lockedSections.has(activeSectionId) && answerable.length > 0 ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            data-exam-action="submit-section"
            onClick={submitCurrentSection}
          >
            Submit section
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={submitting}
            data-exam-action="submit-open"
            onClick={() => setShowSubmit(true)}
          >
            Submit test
          </button>
        )}
      </header>

      {forcedSubmitNotice === 'timeout' && submitting && (
        <div className="exam-timeout-banner" role="alert">
          Time is up — your test is being submitted automatically.
        </div>
      )}

      {forcedSubmitNotice === 'proctor' && submitting && (
        <div className="exam-timeout-banner exam-proctor-banner" role="alert">
          You left the exam window or closed the browser — your test is being submitted now.
        </div>
      )}

      {networkOffline && started && !submitting && (
        <div className="exam-timeout-banner exam-offline-banner" role="status">
          Internet disconnected — your answers are still auto-saved on this device. Reconnect and
          continue, or resume later from the same point.
        </div>
      )}

      <div className="exam-body">
        <section className="question-panel">
          <div className="question-toolbar">
            <span className="subject-tag">{subjectLabel}</span>
            <span className="q-type-tag">{typeDef.shortName}</span>
            <span className="q-counter">
              Q {paletteIndex + 1} / {paperQuestions.length}
            </span>
            {isCdf && (
              <span
                className={`cdf-question-timer-badge${questionSecondsLeft <= 5 ? ' cdf-question-timer-urgent' : ''}`}
                role="timer"
                aria-live="polite"
              >
                {questionSecondsLeft}s
              </span>
            )}
            <a
              href="#next"
              className="exam-toolbar-next btn btn-primary btn-sm"
              data-exam-action="save-next"
              onClick={(e) => e.preventDefault()}
            >
              {saveNextLabel} →
            </a>
            {questionTimes[q.id] > 0 && (
              <span className="q-time-spent">{questionTimes[q.id]}s on this Q</span>
            )}
          </div>

          <QuestionInput
            key={q.id}
            question={q}
            allQuestions={test.questions}
            answer={answers[q.id]}
            onChange={(val) => setAnswers((prev) => ({ ...prev, [q.id]: val }))}
            answerResetKey={answerResetKey}
            optionPerm={getOptionPermForQuestion(examLayout, q.id)}
          />

          <div className="question-actions exam-nav-primary">
            <a
              href="#next"
              className="btn btn-primary exam-save-next-btn"
              data-exam-action="save-next"
              onClick={(e) => e.preventDefault()}
            >
              {saveNextLabel} →
            </a>
            <a
              href="#prev"
              className={`btn btn-ghost exam-nav-link ${currentIndex === 0 ? 'exam-nav-disabled' : ''}`}
              data-exam-action="previous"
              onClick={(e) => e.preventDefault()}
            >
              Previous
            </a>
            <a
              href="#mark"
              className={`btn btn-ghost exam-nav-link ${marked.has(q.id) ? 'marked-active' : ''}`}
              data-exam-action="mark"
              onClick={(e) => e.preventDefault()}
            >
              {marked.has(q.id) ? 'Unmark review' : 'Mark for Review'}
            </a>
            <a
              href="#skip"
              className="btn btn-ghost btn-skip exam-nav-link"
              data-exam-action="skip"
              onClick={(e) => e.preventDefault()}
            >
              Skip
            </a>
            <a
              href="#clear"
              className="btn btn-ghost exam-nav-link"
              data-exam-action="clear"
              onClick={(e) => e.preventDefault()}
            >
              Clear Response
            </a>
            {pendingAhead.length > 0 && !isLastInView && (
              <a
                href="#pending"
                className="btn btn-ghost exam-review-pending-btn exam-nav-link"
                data-exam-action="jump-pending"
                onClick={(e) => e.preventDefault()}
              >
                Review pending ({pendingAhead.length})
              </a>
            )}
          </div>
          <p className="form-hint exam-nav-hint">
            Tap the blue <strong>{saveNextLabel}</strong> link (top bar or below answer). Press <strong>Enter</strong> if your keyboard works.
          </p>

          {pendingIndices.length > 0 && (
            <div className="exam-review-banner" role="status">
              <p>
                <strong>{pendingIndices.length}</strong> question
                {pendingIndices.length !== 1 ? 's' : ''} marked or not answered
                {sectionMode ? ' in this section' : ''}.
                {isLastInView
                  ? ' Review pending takes you to the first unanswered or marked question.'
                  : ' Use the palette or Review pending to revisit them.'}
              </p>
              {pendingElsewhere > 0 && sectionMode && (
                <p className="exam-review-banner-note">
                  {pendingElsewhere} more in other section
                  {pendingElsewhere !== 1 ? 's' : ''} (switch section tab to review).
                </p>
              )}
              {pendingAhead.length > 0 && (
            <button
              type="button"
                  className="btn btn-ghost btn-sm"
                  data-exam-action="jump-pending"
                  onClick={jumpToFirstPending}
                >
                  Review pending (Q {pendingAhead[0] + 1})
              </button>
            )}
          </div>
          )}
        </section>

        <QuestionPalette
          questions={paletteQuestions}
          subjects={subjects.filter((s) =>
            sectionMode ? s.id === activeSectionId : true,
          )}
          currentIndex={paletteIndex}
          answers={answers}
          marked={marked}
          onSelect={go}
        />
      </div>

      {showPracticeBatchEnd && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowPracticeBatchEnd(false)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Batch complete</h2>
            <p>
              You finished this batch ({test?.practiceMeta?.batchSize ?? '—'} questions). Submit now
              for results, or continue —{' '}
              <strong>{practicePoolRemaining}</strong> more question
              {practicePoolRemaining !== 1 ? 's' : ''} available in your syllabus.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setShowPracticeBatchEnd(false)
                  setShowSubmit(true)
                }}
              >
                Submit
              </button>
              <button type="button" className="btn btn-primary" onClick={continuePracticeBatch}>
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {showSubmit && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowSubmit(false)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Submit test?</h2>
            <p>Your answers will be saved and scored. You cannot change them after submission.</p>
            {pendingIndices.length > 0 && (
              <p className="upload-error">
                {pendingIndices.length} question{pendingIndices.length !== 1 ? 's' : ''} still marked
                or unanswered{sectionMode ? ' in this section' : ''}. You can continue the test to
                review them first.
              </p>
            )}
            {tabViolations > 0 && (
              <p className="upload-error">{tabViolations} tab switch(es) will be recorded.</p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                data-exam-action="submit-close"
                onClick={() => setShowSubmit(false)}
              >
                Continue test
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={submitting}
                data-exam-action="submit-confirm"
                onClick={() => submitTest('manual')}
              >
                {submitting ? 'Submitting…' : 'Submit now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

