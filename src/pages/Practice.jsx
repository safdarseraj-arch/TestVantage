import { useEffect, useMemo, useState } from 'react'

import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '../context/AuthContext'
import ExamPatternCard from '../components/ExamPatternCard'
import AiPracticePickBanner from '../components/AiPracticePickBanner'
import PreparePageHero from '../components/PreparePageHero'
import PracticeSyllabusPicker from '../components/practice/PracticeSyllabusPicker'

import { EXAM_PATTERNS } from '../data/examPatterns'

import { loadPublishedUploadedQuestions } from '../utils/questionBank'
import { filterQuestionsForNonCdfUse } from '../utils/cdfOnlyQuestions.js'
import { loadPracticePrefill } from '../utils/aiMastery.js'
import { preferredStudentExamId } from '../utils/userProfiles'
import { isDemoStudentIdentity, DEMO_SAMPLE_TEST_IDS } from '../utils/demoStudentAccess.js'

import { filterQuestionsByExam, filterQuestionsForPracticeSyllabusTree } from '../utils/practiceFilters'



const EMPTY_SYLLABUS = {

  subjects: [],

  sections: [],

  chapters: [],

  topics: [],

}



export default function Practice() {

  const navigate = useNavigate()
  const { session } = useAuth()
  const demoStudent = isDemoStudentIdentity(session)

  const [examPatternId, setExamPatternId] = useState(() => preferredStudentExamId(session))

  const [syllabus, setSyllabus] = useState(EMPTY_SYLLABUS)

  const [questionCount, setQuestionCount] = useState(10)

  const [error, setError] = useState('')

  useEffect(() => {
    const prefill = loadPracticePrefill()
    if (!prefill) return
    if (prefill.examPatternId) setExamPatternId(prefill.examPatternId)
    if (prefill.subjects?.length || prefill.sections?.length || prefill.chapters?.length || prefill.topics?.length) {
      setSyllabus({
        subjects: prefill.subjects ?? [],
        sections: prefill.sections ?? [],
        chapters: prefill.chapters ?? [],
        topics: prefill.topics ?? [],
      })
    }
  }, [])

  const [bank, setBank] = useState(/** @type {import('../data/tests').Question[]} */ ([]))
  const [bankReady, setBankReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      try {
        const rows = filterQuestionsForNonCdfUse(loadPublishedUploadedQuestions())
        if (!cancelled) setBank(rows)
      } catch (err) {
        console.error('Practice: could not load question bank', err)
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
    setSyllabus((prev) => ({
      ...prev,
      subjects,
    }))
  }, [demoStudent, bankReady, examBank, syllabus.subjects.length])

  const syllabusBank = useMemo(
    () => filterQuestionsForPracticeSyllabusTree(bank, examPatternId),
    [bank, examPatternId],
  )

  const [pool, setPool] = useState(/** @type {import('../data/tests').Question[]} */ ([]))

  useEffect(() => {
    if (!bankReady || !syllabus.subjects.length) {
      setPool([])
      return
    }
    let cancelled = false
    const run = async () => {
      try {
        const { buildPracticePickPoolAnswerable } = await import('../utils/practicePickPool.js')
        const rows = buildPracticePickPoolAnswerable(examBank, syllabus, examPatternId)
        if (!cancelled) setPool(rows)
      } catch (err) {
        console.error('Practice: pool build failed', err)
        if (!cancelled) setPool([])
      }
    }
    if (typeof requestIdleCallback === 'function') {
      const idleId = requestIdleCallback(() => { run() }, { timeout: 250 })
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
  }, [bankReady, examBank, syllabus, examPatternId])

  const [aiPickPreview, setAiPickPreview] = useState(null)

  useEffect(() => {
    if (!bankReady || !pool.length || !syllabus.subjects.length) {
      setAiPickPreview(null)
      return
    }
    let cancelled = false
    const count = Math.min(questionCount, pool.length)
    const run = async () => {
      try {
        const { previewAiPracticePick } = await import('../utils/practiceTest.js')
        const report = previewAiPracticePick(pool, count).report
        if (!cancelled) setAiPickPreview(report)
      } catch (err) {
        console.error('Practice: AI pick preview failed', err)
        if (!cancelled) setAiPickPreview(null)
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
  }, [bankReady, pool, syllabus.subjects.length, questionCount])

  const onExamChange = (id) => {
    setExamPatternId(id)
    setSyllabus(EMPTY_SYLLABUS)
    setError('')
  }



  const startPractice = async () => {

    setError('')

    if (!examPatternId) {

      setError('Select an exam.')

      return

    }

    if (!syllabus.subjects.length) {

      setError('Select at least one subject.')

      return

    }

    if (pool.length === 0) {

      setError(

        'No questions match this exam and syllabus. Check question tags (Exam, Subject, Unit, Chapter) in the bank.',

      )

      return

    }

    const count = Math.min(questionCount, pool.length)

    try {
      const { createPracticeSession } = await import('../utils/practiceTest.js')
      const test = createPracticeSession({

        syllabus,

        questionCount: count,

        examPatternId,

      })
      navigate(`/exam/${test.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start practice.')
    }

  }



  const examPattern = EXAM_PATTERNS.find((p) => p.id === examPatternId)



  return (

    <div className="page practice-page student-portal-page prepare-mode-page prepare-mode-page--syllabus-practice">

      <PreparePageHero
        modeId="syllabus-practice"
        lead={
          <>
            Self-paced — no timer. Pick exam and syllabus (Subject → Unit → Chapter).{' '}
            <span className="ai-tune-badge">AI</span> smart pick mixes chapters and difficulty,
            including <strong>10–25% PYQ</strong> when available.
          </>
        }
      />

      {!bankReady && (
        <p className="form-hint">Loading question bank…</p>
      )}

      <section className="card create-section">

        <h2>1. Select exam</h2>

        <p className="form-hint">

          Practice uses questions tagged with this exam in Question Bank (

          <strong>{examBank.length}</strong> in bank).

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



      <section className="card create-section">

        <h2>2. Select syllabus</h2>

        {!bankReady ? (

          <p className="form-hint">Loading syllabus options…</p>

        ) : bank.length === 0 ? (

          <p className="form-hint">

            Question bank is empty. Ask your teacher to upload questions in the{' '}

            <Link to="/question-bank">Question Bank</Link>.

          </p>

        ) : (

          <>

            {examBank.length === 0 && (

              <p className="form-hint">

                No questions tagged for <strong>{examPattern?.name}</strong> yet. Units and chapters

                below come from all bank questions for this exam&apos;s subjects — tag questions with

                this exam to practice them.

              </p>

            )}

            <PracticeSyllabusPicker

              bankQuestions={syllabusBank}

              countQuestions={examBank}

              examPatternId={examPatternId}

              syllabus={syllabus}

              onChange={setSyllabus}

            />

          </>

        )}

      </section>



      <section className="card create-section">

        <h2>3. Session size</h2>

        <p className="form-hint">

          Questions per batch. After each batch you can <strong>Submit</strong> for results or{' '}

          <strong>Continue</strong> for more until you submit.

        </p>

        <label>

          Number of questions

          <input

            type="number"

            min={1}

            max={Math.max(1, pool.length)}

            value={Math.min(questionCount, Math.max(1, pool.length || 1))}

            onChange={(e) => setQuestionCount(Math.max(1, Number(e.target.value) || 1))}

            disabled={pool.length === 0}

          />

        </label>

        <p className="form-hint">

          Matching questions ({examPattern?.shortName} + syllabus): <strong>{pool.length}</strong>

          {pool.length > 0 && (

            <>

              {' '}

              · Practice time ~{' '}

              <strong>{Math.max(10, Math.ceil(Math.min(questionCount, pool.length) * 2.5))}</strong>{' '}

              min

            </>

          )}

        </p>

        {bank.length === 0 && (

          <p className="form-hint">

            Question bank is empty. <Link to="/tests">Try mock tests</Link> or ask your teacher to

            upload questions.

          </p>

        )}

      </section>



      {error && <p className="upload-error">{error}</p>}

      {demoStudent && bankReady && pool.length === 0 ? (
        <p className="form-hint">
          No tagged practice questions for this exam yet. You can still{' '}
          <Link to={`/exam/${DEMO_SAMPLE_TEST_IDS[0]}`}>start a sample mock</Link>
          {' '}or pick subjects above if the bank has them.
        </p>
      ) : null}

      {aiPickPreview && <AiPracticePickBanner report={aiPickPreview} />}

      <button

        type="button"

        className="btn btn-primary"

        onClick={startPractice}

        disabled={!examPatternId || !syllabus.subjects.length || pool.length === 0}

      >

        Start practice

      </button>

    </div>

  )

}


