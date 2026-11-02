import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  SCQ_TRIAL_COUNT,
  listTrialChapters,
  pickSmokeChapter,
  subjectLabel,
  PYQ_STYLE_YEARS,
  trialExamLabel,
  stemPreview,
} from '../utils/geminiScqTrial.js'
import { buildBatchPayloadFromTrialJob, queueBatch } from '../utils/hybridAiClient.js'
import { syncHybridAiAfterJob } from '../utils/hybridAiSync.js'
import {
  listPyqStyleSlots,
  formatPyqDatePretty,
  uniquePyqDatesFromSlots,
  geminiPyqJobIsReady,
  pyqPaperKey,
  formatPyqSlotLabel,
  groupPyqQuestionsByPaper,
} from '../utils/pyqSlotMeta.js'
import { getAllPyqQuestions } from '../data/pyqCatalog.js'
import { isOfficialPyq, canSeedSimilarFromPyq } from '../utils/pyqDetect.js'
import PyqMakeSimilarPanel from './PyqMakeSimilarPanel.jsx'
import PyqReplicaPaperPanel from './PyqReplicaPaperPanel.jsx'

/**
 * Admin PYQ generate: exam -> year -> date+shift (Main) / Paper 1-2 (Advanced) / year (NEET).
 * Saves into the PYQ bank under that paper. Not the 40/30/30 practice mix.
 */
export default function PyqGeminiGeneratePanel({ onImported }) {
  const [examId, setExamId] = useState('jee-main')
  const [subject, setSubject] = useState('mathematics')
  const [pyqYear, setPyqYear] = useState(2024)
  const [pyqDate, setPyqDate] = useState('2024-01-27')
  const [pyqShift, setPyqShift] = useState(2)
  const [pyqSession, setPyqSession] = useState('Paper 1')
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState('')
  const [seedId, setSeedId] = useState('')

  const subjects =
    examId === 'neet' ? ['physics', 'chemistry', 'biology'] : ['mathematics', 'physics', 'chemistry']
  const chapters = useMemo(() => listTrialChapters(examId, subject), [examId, subject])
  const mainSlots = useMemo(
    () => (examId === 'jee-main' ? listPyqStyleSlots('jee-main', pyqYear) : []),
    [examId, pyqYear],
  )
  const mainDates = useMemo(() => uniquePyqDatesFromSlots(mainSlots), [mainSlots])

  const slotJob = {
    examId,
    pyqYear,
    pyqDate: examId === 'jee-main' ? pyqDate : undefined,
    pyqShift: examId === 'jee-main' ? pyqShift : undefined,
    pyqSession: examId === 'jee-advanced' ? pyqSession : undefined,
  }
  const slotReady = geminiPyqJobIsReady(slotJob)
  const slotLabel = formatPyqSlotLabel({
    examPatternId: examId,
    pyqYear,
    pyqDate: slotJob.pyqDate,
    pyqShift: slotJob.pyqShift,
    pyqSession: slotJob.pyqSession,
  })
  const paperGroups = useMemo(() => {
    const all = getAllPyqQuestions().filter(
      (q) => q.examPatternId === examId && Number(q.pyqYear) === Number(pyqYear),
    )
    return groupPyqQuestionsByPaper(all)
  }, [examId, pyqYear, log])
  const seedOptions = useMemo(
    () =>
      paperGroups
        .flatMap((g) => g.questions)
        .filter(canSeedSimilarFromPyq)
        .slice(0, 80),
    [paperGroups],
  )
  const seedQuestion = seedOptions.find((q) => String(q.id) === String(seedId)) || seedOptions[0] || null

  async function onGenerate() {
    if (!slotReady.ok) {
      setLog(slotReady.error)
      return
    }
    const chapter = chapters[0] || pickSmokeChapter()
    if (!chapter) {
      setLog('No syllabus chapter for that exam + subject.')
      return
    }
    setBusy(true)
    setLog('Queuing Hybrid AI for ' + slotLabel + ' / ' + chapter.chapter + '…')
    const job = {
      ...chapter,
      examId,
      examLabel: trialExamLabel(examId),
      pyqStyle: true,
      pyqYear,
      pyqDate: slotJob.pyqDate,
      pyqShift: slotJob.pyqShift,
      pyqSession: slotJob.pyqSession,
    }
    try {
      const payload = buildBatchPayloadFromTrialJob(job, SCQ_TRIAL_COUNT, 'single_correct')
      const data = await queueBatch(payload)
      setLog(
        `Hybrid AI queued ${SCQ_TRIAL_COUNT} draft(s) for ${slotLabel} (${data.status || 'Job Queued'}). ` +
          'Waiting until Postgres has the new draft before sync.',
      )
      const synced = await syncHybridAiAfterJob({
        attempts: 24,
        intervalMs: 5000,
        jobId: data?.job_id,
      })
      setLog(
        synced?.added
          ? `Synced ${synced.added} draft(s). Open Saved → Draft → Hybrid AI (?subBank=ai).`
          : 'Hybrid AI finished. Open Saved → Draft → Hybrid AI (?subBank=ai) and use Sync if the new draft is not listed yet.',
      )
      onImported?.()
    } catch (e) {
      setLog(e instanceof Error ? e.message : 'Generate failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card gemini-scq-trial pyq-gemini-generate">
      <h3>Generate into PYQ bank</h3>
      <p className="form-hint">
        Pick <strong>JEE Main</strong>, <strong>JEE Advanced</strong>, or <strong>NEET</strong>, then
        the paper identity. <strong>Hybrid AI</strong> queues PYQ-style practice items (AI sub_bank).
        It cannot legally paste a copyrighted NTA PDF as Official PYQ. For real papers use{' '}
        <Link to="/official-pyq">Import official PYQ</Link>, then Approve.
      </p>
      <div className="gemini-scq-trial-row">
        <label className="metadata-field">
          <span className="metadata-label">Exam</span>
          <select
            value={examId}
            disabled={busy}
            onChange={(e) => {
              const next = e.target.value
              setExamId(next)
              setSubject(next === 'neet' ? 'biology' : 'mathematics')
            }}
          >
            <option value="jee-main">JEE Main</option>
            <option value="jee-advanced">JEE Advanced</option>
            <option value="neet">NEET</option>
          </select>
        </label>
        <label className="metadata-field">
          <span className="metadata-label">Subject</span>
          <select value={subject} disabled={busy} onChange={(e) => setSubject(e.target.value)}>
            {subjects.map((s) => (
              <option key={s} value={s}>
                {subjectLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="metadata-field">
          <span className="metadata-label">Year</span>
          <select
            value={String(pyqYear)}
            disabled={busy}
            onChange={(e) => {
              const y = Number(e.target.value)
              setPyqYear(y)
              const slots = listPyqStyleSlots('jee-main', y)
              if (slots[0]?.pyqDate) setPyqDate(slots[0].pyqDate)
            }}
          >
            {PYQ_STYLE_YEARS.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        </label>
        {examId === 'jee-main' ? (
          <label className="metadata-field">
            <span className="metadata-label">Date</span>
            <select value={pyqDate} disabled={busy} onChange={(e) => setPyqDate(e.target.value)}>
              {mainDates.map((d) => (
                <option key={d} value={d}>
                  {formatPyqDatePretty(d)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {examId === 'jee-main' ? (
          <label className="metadata-field">
            <span className="metadata-label">Shift</span>
            <select
              value={String(pyqShift)}
              disabled={busy}
              onChange={(e) => setPyqShift(Number(e.target.value))}
            >
              <option value="1">Shift 1</option>
              <option value="2">Shift 2</option>
            </select>
          </label>
        ) : null}
        {examId === 'jee-advanced' ? (
          <label className="metadata-field">
            <span className="metadata-label">Paper</span>
            <select value={pyqSession} disabled={busy} onChange={(e) => setPyqSession(e.target.value)}>
              <option value="Paper 1">Paper 1</option>
              <option value="Paper 2">Paper 2</option>
            </select>
          </label>
        ) : null}
      </div>
      <div className="gemini-scq-trial-row gemini-pyq-actions">
        <Link to="/official-pyq" className="btn btn-ghost">
          Import official PYQ
        </Link>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !chapters.length || !slotReady.ok}
          onClick={onGenerate}
        >
          {busy ? 'Queuing…' : 'Generate PYQ-style (Hybrid AI)'}
        </button>
      </div>
      <p className="form-hint">
        Paper: <strong>{slotLabel || 'pick year / date / paper'}</strong>. Toughness = estimated
        actual for each item (T1-T10). Practice 40/30/30 mix is only for non-PYQ trial SCQs.
      </p>
      {log ? <p className="form-hint">{log}</p> : null}
      {paperGroups.length ? (
        <ul className="form-hint">
          {paperGroups.slice(0, 8).map((g) => (
            <li key={g.key}>
              {g.paperLabel || g.key}: {g.questions.length} Q
              {g.questions.some((q) => !isOfficialPyq(q)) ? ' (includes AI)' : ' (official)'}
            </li>
          ))}
        </ul>
      ) : null}
      {paperGroups.filter((g) => g.questions.some(isOfficialPyq)).length ? (
        <div className="pyq-replica-section">
          <label className="metadata-field pyq-make-similar-seed">
            <span className="metadata-label">Official PYQ paper for replicas</span>
            <select
              value={seedQuestion ? String(paperGroups.find((g) => g.questions.includes(seedQuestion))?.key ?? '') : ''}
              disabled={busy}
              onChange={(e) => {
                const g = paperGroups.find((pg) => pg.key === e.target.value)
                if (g?.questions[0]) setSeedId(String(g.questions[0].id))
              }}
            >
              <option value="">— pick paper —</option>
              {paperGroups
                .filter((g) => g.questions.some(isOfficialPyq))
                .map((g) => (
                  <option key={g.key} value={g.key}>
                    {g.paperLabel || g.key} ({g.questions.filter(isOfficialPyq).length} official Q)
                  </option>
                ))}
            </select>
          </label>
          {(() => {
            const officialGroup = paperGroups.find(
              (g) => g.questions.some((q) => String(q.id) === String(seedId)) && g.questions.some(isOfficialPyq),
            )
            if (!officialGroup) return null
            return (
              <PyqReplicaPaperPanel
                paperGroup={{
                  ...officialGroup,
                  questions: officialGroup.questions.filter(isOfficialPyq),
                }}
                onSaved={() => {
                  setLog('Replica drafts saved — open Review and publish.')
                  onImported?.()
                }}
              />
            )
          })()}
        </div>
      ) : null}
      <div className="pyq-make-similar">
        <h4>Optional: make similar from one question</h4>
        <p className="form-hint">
          Smaller action: pick one PYQ and get <strong>3 or 5 similar drafts</strong> for that
          question only. For full papers use <strong>Create replica papers (Hybrid AI)</strong> above.
        </p>
        {seedOptions.length ? (
          <>
            <label className="metadata-field pyq-make-similar-seed">
              <span className="metadata-label">Seed PYQ</span>
              <select
                value={seedQuestion ? String(seedQuestion.id) : ''}
                disabled={busy}
                onChange={(e) => setSeedId(e.target.value)}
              >
                {seedOptions.map((q) => (
                  <option key={q.id} value={String(q.id)}>
                    {stemPreview(q.text, 90) || q.id}
                  </option>
                ))}
              </select>
            </label>
            <PyqMakeSimilarPanel seed={seedQuestion} paper={{ exam: examId, year: pyqYear }} compact />
          </>
        ) : (
          <p className="form-hint">
            No PYQ in this year yet. Import and approve an official paper first, or open a question
            on Approve official papers.
          </p>
        )}
      </div>
    </section>
  )
}