import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import PracticeSyllabusPicker from './practice/PracticeSyllabusPicker'
import StudentMockPaperSummary from './StudentMockPaperSummary'
import { EXAM_PATTERNS } from '../data/examPatterns'
import { PYQ_EXAMS, getAllPyqQuestions, getPyqExamLabel, getPyqQuestionsFiltered } from '../data/pyqCatalog'
import { questionsForPyqPracticeTab } from '../utils/pyqDetect'
import { filterMasterPoolBySubBank, getMasterQuestionPool, getSubBankYears } from '../utils/masterPool'
import {
  SUB_BANK_TYPE_PYQ,
  SUB_BANK_TYPE_SIMILAR_PYQ,
  subBankPracticeLabel,
  subBankPracticeRoutePrefix,
} from '../utils/subBankType'
import { filterQuestionsForPracticeSyllabusTree } from '../utils/practiceFilters'
import { downloadWatermarkedPaper } from '../utils/paperDownload'
import { buildAndRegisterPyqTest, officialYearPaperQuestions } from '../utils/pyqTests'
import { resolvePyqYearPaper, groupPyqPapersForCalendar } from '../utils/pyqYearPaperPick'
import {
  pyqStudyModeHint,
  pyqStudyModeLabel,
  pyqStudyPlanReady,
  getPyqStudyPool,
} from '../utils/pyqStudentTest'
import { SUB_BANK_PATHWAY_IDS } from '../utils/subBankPathways'
import { createPyqStudySession, previewPyqStudyPaper } from '../utils/pyqStudentSession'
import { pickJeeAdvancedPaperTemplate } from '../utils/studentMockTest'

/** @typedef {import('../utils/pyqStudentTest.js').PyqStudyModeId | 'year-wise-paper'} PyqPanelModeId */

/** @type {{ id: PyqPanelModeId, icon: string }[]} */
const PYQ_ALL_MODES = SUB_BANK_PATHWAY_IDS.map((id) => ({
  id,
  icon:
    id === 'syllabus-practice'
      ? '📖'
      : id === 'full'
        ? '🎯'
        : id === 'part'
          ? '🧪'
          : id === 'chapter'
            ? '📚'
            : id === 'calibrated'
              ? '⚡'
              : '📅',
}))

const EMPTY_SYLLABUS = { subjects: [], sections: [], chapters: [], topics: [] }

/**
 * All six PYQ study modes in one place — pick mode first, then syllabus or year/paper.
 * @param {{ subBankType?: import('../utils/subBankType.js').SubBankType, refreshKey?: number, onError?: (msg: string) => void }} props
 */
export default function PyqStudyModesPanel({
  subBankType = SUB_BANK_TYPE_PYQ,
  refreshKey = 0,
  onError,
}) {
  const navigate = useNavigate()
  const [examId, setExamId] = useState('jee-main')
  const [studyMode, setStudyMode] = useState(/** @type {PyqPanelModeId} */ ('syllabus-practice'))
  const [syllabus, setSyllabus] = useState(EMPTY_SYLLABUS)
  const [questionCount, setQuestionCount] = useState(10)
  const [paperPatternId, setPaperPatternId] = useState('')
  const [paperLabel, setPaperLabel] = useState('')
  const [plan, setPlan] = useState(null)
  const [localError, setLocalError] = useState('')
  const [calendarYear, setCalendarYear] = useState(null)
  const bankLabel = subBankPracticeLabel(subBankType)

  const examLabel = getPyqExamLabel(examId)
  const pattern = EXAM_PATTERNS.find((p) => p.id === examId)
  const isYearWise = studyMode === 'year-wise-paper'

  const subBankMaster = useMemo(() => {
    void refreshKey
    return filterMasterPoolBySubBank(getMasterQuestionPool({ fresh: true }), subBankType)
  }, [refreshKey, subBankType])

  const pyqBank = useMemo(
    () => getPyqQuestionsFiltered({ examPatternId: examId, subBankType }, subBankMaster),
    [examId, subBankMaster, subBankType],
  )

  const syllabusBank = useMemo(
    () => filterQuestionsForPracticeSyllabusTree(pyqBank, examId),
    [pyqBank, examId],
  )

  const officialPyqCatalog = useMemo(() => {
    void refreshKey
    return questionsForPyqPracticeTab(getAllPyqQuestions(), subBankType)
  }, [refreshKey, subBankType])

  const years = useMemo(() => {
    void refreshKey
    if (isYearWise) {
      const set = new Set()
      for (const q of officialPyqCatalog) {
        if (String(q.examPatternId ?? '') !== examId) continue
        const y = Number(q.pyqYear)
        if (y) set.add(y)
      }
      return [...set].sort((a, b) => b - a)
    }
    return getSubBankYears(examId, subBankType)
  }, [examId, refreshKey, subBankType, isYearWise, officialPyqCatalog])

  const calendar = useMemo(
    () =>
      calendarYear
        ? groupPyqPapersForCalendar(examId, calendarYear, officialPyqCatalog)
        : null,
    [examId, calendarYear, officialPyqCatalog],
  )

  useEffect(() => {
    setCalendarYear(years[0] ?? null)
  }, [years])

  const poolSize = useMemo(() => {
    if (!syllabus.subjects.length) return 0
    return getPyqStudyPool(examId, syllabus, pyqBank, subBankType).length
  }, [examId, syllabus, pyqBank, subBankType])

  const setErr = (msg) => {
    setLocalError(msg)
    onError?.(msg)
  }

  const selectExam = (id) => {
    setExamId(id)
    setSyllabus(EMPTY_SYLLABUS)
    setErr('')
  }

  const selectMode = (id) => {
    setStudyMode(id)
    setSyllabus(EMPTY_SYLLABUS)
    setErr('')
  }

  useEffect(() => {
    if (examId !== 'jee-advanced' || isYearWise) {
      setPaperPatternId('')
      setPaperLabel('')
      return
    }
    const picked = pickJeeAdvancedPaperTemplate()
    setPaperPatternId(picked.paperPatternId)
    setPaperLabel(picked.paperLabel)
  }, [examId, studyMode, isYearWise])

  useEffect(() => {
    if (isYearWise || !syllabus.subjects.length) {
      setPlan(null)
      return
    }
    let cancelled = false
    try {
      const preview = previewPyqStudyPaper({
        mode: studyMode,
        examPatternId: examId,
        syllabus,
        questionCount,
        paperPatternId: examId === 'jee-advanced' ? paperPatternId : undefined,
        pool: pyqBank,
        subBankType,
      })
      if (!cancelled) setPlan(preview)
    } catch {
      if (!cancelled) setPlan(null)
    }
    return () => {
      cancelled = true
    }
  }, [studyMode, examId, syllabus, questionCount, paperPatternId, refreshKey, isYearWise, pyqBank, subBankType])

  const startSyllabusMode = () => {
    setErr('')
    try {
      const test = createPyqStudySession({
        mode: studyMode,
        examPatternId: examId,
        syllabus,
        questionCount,
        paperPatternId: examId === 'jee-advanced' ? paperPatternId : undefined,
        pool: pyqBank,
        subBankType,
      })
      navigate(`/exam/${test.id}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not start PYQ session.')
    }
  }

  const startYearPaper = ({ year, paperId }) => {
    setErr('')
    const result = buildAndRegisterPyqTest('year', {
      examPatternId: examId,
      year,
      paperId,
      subBankType,
      pool: subBankMaster,
    })
    if (!result.ok) {
      setErr(result.error ?? 'Could not create test')
      return
    }
    navigate(`/exam/${result.test.id}`)
  }

  const downloadYearPaper = (filters, title, subtitle) => {
    setErr('')
    try {
      let resolvedFilters = { examPatternId: examId, ...filters }
      if (filters.year && !filters.paperId) {
        const resolved = resolvePyqYearPaper(examId, filters.year, { pool: officialPyqCatalog })
        if (!resolved.ok) {
          setErr(resolved.error ?? 'Could not resolve paper')
          return
        }
        resolvedFilters = {
          ...resolvedFilters,
          paperId: resolved.paper.paperId,
          year: filters.year,
        }
      }
      const similarYear = subBankType === SUB_BANK_TYPE_SIMILAR_PYQ
      const questions = officialYearPaperQuestions(
        similarYear
          ? subBankMaster
          : getPyqQuestionsFiltered({ ...resolvedFilters, provenance: 'official' }),
        {
          examPatternId: examId,
          year: resolvedFilters.year,
          paperId: resolvedFilters.paperId,
        },
        { similar: similarYear },
      )
      downloadWatermarkedPaper(questions, { title, subtitle })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Download failed')
    }
  }

  const canStartSyllabus =
    !isYearWise && syllabus.subjects.length > 0 && poolSize > 0 && pyqStudyPlanReady(plan)

  return (
    <section className="card pyq-study-modes-panel">
      <h2>{bankLabel} study modes</h2>
      <p className="form-hint">
        Pick a mode below first. Modes 1–5: choose syllabus next. Mode 6 (Year-wise paper): pick
        year and paper / shift. Pool = master question bank filtered by{' '}
        <code>sub_bank_type={subBankType}</code>.
      </p>
      {pyqBank.length === 0 && (
        <p className="form-hint" role="status">
          No {bankLabel} questions for {examLabel} yet.
          {subBankType === SUB_BANK_TYPE_PYQ
            ? ' Ask a teacher to import NTA / Advanced / NEET PDFs under Approve official papers.'
            : ' Publish Hybrid AI similar / replica items from Question Bank.'}
        </p>
      )}

      <nav className="pyq-exam-subtabs" aria-label="PYQ exam">
        {PYQ_EXAMS.map((exam) => {
          const pat = EXAM_PATTERNS.find((p) => p.id === exam.id)
          return (
            <button
              key={exam.id}
              type="button"
              className={`pyq-exam-subtab ${examId === exam.id ? 'active' : ''}`}
              onClick={() => selectExam(exam.id)}
              style={
                examId === exam.id && pat?.color
                  ? { borderColor: pat.color, '--pyq-exam-accent': pat.color }
                  : undefined
              }
            >
              <strong>{exam.label}</strong>
            </button>
          )
        })}
      </nav>

      {pattern && (
        <p className="pyq-exam-active-hint">
          <span className="badge badge-exam" style={{ background: pattern.color }}>
            {pattern.name}
          </span>
          <span className="form-hint">{pattern.description}</span>
        </p>
      )}

      <p className="form-hint">
        {pyqBank.length} questions in this sub-bank for {examLabel}. Switch bank:{' '}
        <Link to={subBankPracticeRoutePrefix(SUB_BANK_TYPE_PYQ)}>PYQ</Link>
        {' · '}
        <Link to={subBankPracticeRoutePrefix(SUB_BANK_TYPE_SIMILAR_PYQ)}>Similar PYQ</Link>
      </p>

      <div className="pyq-study-mode-tabs pyq-study-mode-tabs-six" role="tablist" aria-label="PYQ study mode">
        {PYQ_ALL_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={studyMode === m.id}
            className={`pyq-study-mode-tab ${studyMode === m.id ? 'active' : ''}`}
            onClick={() => selectMode(m.id)}
          >
            <span className="pyq-mode-icon">{m.icon}</span>
            <strong>{pyqStudyModeLabel(m.id)}</strong>
            <span>{pyqStudyModeHint(m.id, examId)}</span>
          </button>
        ))}
      </div>

      <div className="pyq-study-setup">
        {isYearWise ? (
          <>
            <h3>Step 2 — Paper calendar</h3>
            <p className="form-hint">
              Pick a year, then a sitting (date &amp; shift for JEE Main, Paper 1/2 for Advanced,
              session for NEET). One timed test = <strong>one official paper</strong>.
            </p>
            {years.length === 0 ? (
              <p className="form-hint">
                {subBankType === SUB_BANK_TYPE_SIMILAR_PYQ
                  ? `No similar papers for ${examLabel} yet. They show here after an admin approves a similar paper.`
                  : `No official papers for ${examLabel} yet. Import via Approve official papers — we do not show a fake NTA date catalog.`}
              </p>
            ) : (
              <div className="pyq-calendar">
                <div className="pyq-calendar-years" role="tablist" aria-label="PYQ year">
                  {years.map((y) => (
                    <button
                      key={y}
                      type="button"
                      role="tab"
                      aria-selected={calendarYear === y}
                      className={`pyq-calendar-year${calendarYear === y ? ' is-active' : ''}`}
                      onClick={() => setCalendarYear(y)}
                    >
                      {y}
                    </button>
                  ))}
                </div>
                {calendar && (
                  <>
                    <p className="form-hint">
                      {calendar.total} paper{calendar.total === 1 ? '' : 's'} in {calendarYear} ·{' '}
                      {calendar.questions} Q in bank. Tap a paper to start that sitting.
                    </p>
                    {calendar.groups.map((group) => (
                      <section key={group.key} className="pyq-calendar-month">
                        <h4>{group.label}</h4>
                        <div className="pyq-calendar-grid">
                          {group.papers.map((paper) => (
                            <article key={paper.paperId} className="pyq-calendar-cell">
                              <strong>
                                {subBankType === SUB_BANK_TYPE_SIMILAR_PYQ
                                  ? paper.paperLabel
                                  : paper.dateLabel || paper.paperLabel}
                              </strong>
                              <span className="form-hint">
                                {paper.pyqShift ? `Shift ${paper.pyqShift} · ` : ''}
                                {paper.count} Q
                              </span>
                              <div className="pyq-year-card-actions">
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  onClick={() =>
                                    startYearPaper({ year: calendarYear, paperId: paper.paperId })
                                  }
                                >
                                  Start →
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  onClick={() =>
                                    downloadYearPaper(
                                      { year: calendarYear, paperId: paper.paperId },
                                      `${examLabel} PYQ ${calendarYear}`,
                                      `${paper.paperLabel} · ${paper.count} questions`,
                                    )
                                  }
                                >
                                  PDF
                                </button>
                              </div>
                            </article>
                          ))}
                        </div>
                      </section>
                    ))}
                  </>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <h3>Step 2 — Syllabus</h3>
            {pyqBank.length === 0 ? (
              <p className="form-hint">No PYQs for this exam yet. Import via admin panel.</p>
            ) : (
              <PracticeSyllabusPicker
                bankQuestions={syllabusBank}
                countQuestions={pyqBank}
                examPatternId={examId}
                syllabus={syllabus}
                onChange={setSyllabus}
              />
            )}

            {studyMode === 'syllabus-practice' && (
              <label className="pyq-study-batch-size">
                Questions per batch
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, poolSize || 1)}
                  value={Math.min(questionCount, Math.max(1, poolSize || 1))}
                  onChange={(e) => setQuestionCount(Math.max(1, Number(e.target.value) || 1))}
                  disabled={poolSize === 0}
                />
              </label>
            )}

            {examId === 'jee-advanced' && studyMode !== 'syllabus-practice' && paperLabel && (
              <p className="form-hint ai-session-hint">
                <span className="ai-tune-badge">AI</span> Paper template:{' '}
                <strong>{paperLabel}</strong>
              </p>
            )}

            {syllabus.subjects.length > 0 && (
              <p className="form-hint">
                Matching PYQs: <strong>{poolSize}</strong>
                {plan?.durationMinutes ? (
                  <>
                    {' '}
                    · Duration ~ <strong>{plan.durationMinutes} min</strong>
                  </>
                ) : null}
              </p>
            )}

            {studyMode !== 'syllabus-practice' && plan && syllabus.subjects.length > 0 && (
              <StudentMockPaperSummary
                title={`${pyqStudyModeLabel(studyMode)} preview`}
                durationMinutes={plan.durationMinutes ?? 0}
                slots={plan.slots ?? plan.test?.paperBlueprint ?? []}
                questions={plan.questions ?? plan.test?.questions ?? []}
                paperLabel={examId === 'jee-advanced' ? paperLabel : undefined}
                adaptive={plan.kind === 'calibrated'}
                targetTotal={plan.targetTotal}
                pyqMix={`100% ${bankLabel}`}
              />
            )}

            {(localError || (syllabus.subjects.length > 0 && poolSize === 0)) && (
              <p className="upload-error">
                {localError ||
                  'No PYQ questions match this syllabus. Widen selection or import more PYQs.'}
              </p>
            )}

            <button
              type="button"
              className="btn btn-primary"
              disabled={!canStartSyllabus}
              onClick={startSyllabusMode}
            >
              Start {pyqStudyModeLabel(studyMode)}
            </button>
          </>
        )}

        {isYearWise && localError && <p className="upload-error">{localError}</p>}
      </div>
    </section>
  )
}
