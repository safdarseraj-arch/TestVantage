import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { API_BASE } from '../config/platform.js'
import {
  buildBatchPayloadFromTrialJob,
  queueBatch,
  HYBRID_AI_ROUTE,
} from '../utils/hybridAiClient.js'
import {
  clearHybridAiJobPending,
  fetchHybridAiPoolCount,
  hybridJobFailedAfterQueueMessage,
  hybridSyncUserMessage,
  markHybridAiJobPending,
  postgresHasNoHybridAiRows,
  syncHybridAiAfterJob,
} from '../utils/hybridAiSync.js'
import { peekUploadedQuestions } from '../utils/questionBank.js'
import { countHybridAiDrafts } from '../utils/questionBankSubBank.js'
import {
  TRIAL_DEFAULT_COUNT,
  TRIAL_COUNT_OPTIONS,
  TRIAL_COUNT_CUSTOM,
  TRIAL_COUNT_MIN,
  TRIAL_COUNT_MAX,
  TRIAL_GENERATABLE_TYPE_IDS,
  SCQ_TRIAL_GAP_MS,
  listTrialChapters,
  resolveTrialJobs,
  trialSelectionScopeLabel,
  listAllTrialJobs,
  trialJobKey,
  subjectLabel,
  resolveTrialCount,
  trialTypeMixLabel,
  sleepMs,
  isQuotaError,
  quotaBackoffMs,
  PYQ_STYLE_YEARS,
  toughnessMixHint,
  trialExamLabel,
} from '../utils/geminiScqTrial.js'
import { getQuestionType } from '../data/questionTypes.js'
import {
  listPyqStyleSlots,
  formatPyqDatePretty,
  uniquePyqDatesFromSlots,
  geminiPyqJobIsReady,
} from '../utils/pyqSlotMeta.js'
import { getSectionOptions, getChapterOptions } from '../utils/curriculumOptions.js'

function phaseLabel(phase) {
  if (phase === 'calling-hybrid-ai') return 'queuing Hybrid AI'
  if (phase === 'calling-gemini') return 'calling Gemini'
  if (phase === 'waiting-quota') return 'waiting (429 quota)'
  if (phase === 'parse-retry') return 'parse retry'
  if (phase === 'saved') return 'saved'
  if (phase === 'error') return 'error'
  if (phase === 'starting') return 'starting'
  return phase || ''
}

/**
 * Teacher-side practice generation — queues TestVantages Hybrid AI batch jobs per chapter.
 * Legacy Gemini /vision/scq-trial script paths are retired; use Generate buttons or Hybrid AI nav.
 */
export default function GeminiScqTrialPanel({ questions = [], onRefresh, onMessage }) {
  const [examId, setExamId] = useState('jee-main')
  const [subject, setSubject] = useState('mathematics')
  const [selectedUnit, setSelectedUnit] = useState('')
  const [selectedChapters, setSelectedChapters] = useState([])
  const [countPicker, setCountPicker] = useState(String(TRIAL_DEFAULT_COUNT))
  const [customCount, setCustomCount] = useState('')
  const [typeMixMode, setTypeMixMode] = useState('all')
  const [selectedTypes, setSelectedTypes] = useState([])
  const [pyqStyle, setPyqStyle] = useState(false)
  const [pyqYear, setPyqYear] = useState(2024)
  const [pyqDate, setPyqDate] = useState('2024-01-27')
  const [pyqShift, setPyqShift] = useState(1)
  const [pyqSession, setPyqSession] = useState('Paper 1')
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState([])
  const [live, setLive] = useState(null)
  const [liveError, setLiveError] = useState('')
  const countResolved = useMemo(
    () => resolveTrialCount(countPicker, customCount),
    [countPicker, customCount],
  )
  const trialCount = countResolved.ok ? countResolved.count : TRIAL_DEFAULT_COUNT

  useEffect(() => {
    let cancelled = false
    const pingHybridApi = async () => {
      try {
        const res = await fetch(`${API_BASE}/health`, {
          signal: AbortSignal.timeout(8000),
        })
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (res.ok && data.ok !== false && data.database === 'ready') {
          setLiveError('')
          return
        }
        const detail =
          (typeof data.detail === 'string' && data.detail) ||
          (typeof data.error === 'string' && data.error) ||
          (data.database === 'unavailable'
            ? 'Hybrid AI Postgres is not ready. Start Postgres, press F5, then retry Generate. See POSTGRES-SETUP-SIMPLE.txt.'
            : res.status === 503
              ? 'TestVantages Hybrid AI is not running (port 8000). Press F5 and keep the bottom terminal open.'
              : `Hybrid AI health check failed (${res.status}).`)
        setLiveError(String(detail))
      } catch {
        if (!cancelled) {
          setLiveError(
            'TestVantages Hybrid AI is not running (port 8000). Press F5 and keep the bottom terminal open.',
          )
        }
      }
    }
    void pingHybridApi()
    const id = window.setInterval(() => void pingHybridApi(), 30_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  const subjectsForExam =
    examId === 'neet'
      ? ['physics', 'chemistry', 'biology']
      : ['mathematics', 'physics', 'chemistry']

  const chapters = useMemo(
    () => listTrialChapters(examId, subject),
    [examId, subject],
  )
  const sectionOptions = useMemo(
    () => getSectionOptions(subject, questions),
    [subject, questions],
  )
  const chapterOptions = useMemo(
    () => (selectedUnit ? getChapterOptions(subject, selectedUnit, questions) : []),
    [subject, selectedUnit, questions],
  )
  const syllabusScope = useMemo(
    () => ({
      section: selectedUnit || undefined,
      chapters: selectedChapters.length ? selectedChapters : undefined,
    }),
    [selectedUnit, selectedChapters],
  )
  const resolvedJobs = useMemo(
    () => resolveTrialJobs(examId, subject, syllabusScope),
    [examId, subject, syllabusScope],
  )
  const selectionLabel = useMemo(
    () => trialSelectionScopeLabel(syllabusScope, resolvedJobs, subject),
    [syllabusScope, resolvedJobs, subject],
  )
  const mainSlots = useMemo(
    () => (examId === 'jee-main' ? listPyqStyleSlots('jee-main', pyqYear) : []),
    [examId, pyqYear],
  )
  const mainDates = useMemo(() => uniquePyqDatesFromSlots(mainSlots), [mainSlots])
  const allJobsCount = useMemo(() => listAllTrialJobs().length, [])
  const subjectChapterCounts = useMemo(() => {
    const ids =
      examId === 'neet'
        ? ['physics', 'chemistry', 'biology']
        : ['mathematics', 'physics', 'chemistry']
    return Object.fromEntries(ids.map((id) => [id, listTrialChapters(examId, id).length]))
  }, [examId])

  const appendLog = (line, _extra = {}) => {
    setLog((prev) => [...prev.slice(-80), line])
  }

  const generateOneChapter = async (job) => {
    const resolved = resolveTrialCount(
      job.countPicker ?? countPicker,
      job.customCount ?? customCount,
    )
    if (!resolved.ok) throw new Error(resolved.error)
    const count = job.count ?? resolved.count
    const typeMix = job.typeMix ?? (typeMixMode === 'all' ? 'all' : selectedTypes)
    const payload = buildBatchPayloadFromTrialJob({ ...job, count, typeMix }, count, typeMix)
    const data = await queueBatch(payload)
    return {
      queued: count,
      jobId: data?.job_id || '',
      duplicates: 0,
      pyqBank: Boolean(job.pyqStyle),
      hybridQueued: true,
    }
  }

  const runJobs = async (jobs, label, opts = {}) => {
    if (!jobs.length) {
      onMessage?.('error', 'No curriculum chapters for that exam + subject.')
      return
    }
    if (typeMixMode === 'pick' && !selectedTypes.length) {
      onMessage?.('error', 'Pick at least one question type, or switch to All types mix.')
      return
    }
    const countCheck = resolveTrialCount(countPicker, customCount)
    if (!countCheck.ok) {
      onMessage?.('error', countCheck.error)
      return
    }
    const count = countCheck.count
    const usePyq = opts.pyqStyle != null ? Boolean(opts.pyqStyle) : pyqStyle
    if (usePyq) {
      const ready = geminiPyqJobIsReady({
        examId,
        pyqYear,
        pyqDate,
        pyqShift,
        pyqSession,
      })
      if (!ready.ok) {
        onMessage?.('error', ready.error)
        return
      }
    }
    const typeMix = typeMixMode === 'all' ? 'all' : selectedTypes
    const stamped = jobs.map((j) => ({
      ...j,
      count,
      countPicker,
      customCount,
      typeMix,
      pyqStyle: usePyq,
      pyqYear: usePyq ? pyqYear : undefined,
      pyqDate: usePyq && examId === 'jee-main' ? pyqDate : undefined,
      pyqShift: usePyq && examId === 'jee-main' ? pyqShift : undefined,
      pyqSession: usePyq && examId === 'jee-advanced' ? pyqSession : undefined,
    }))
    setBusy(true)
    setLog([
      `${label}: ${stamped.length} chapter(s), ${count} each.` +
        (usePyq
          ? ` PYQ-style (AI) into PYQ bank — ${trialExamLabel(examId)} ${pyqYear} (actual toughness, not 40/30/30).`
          : ` Types: ${trialTypeMixLabel(examId, typeMix)}.`),
    ])
    let totalQueued = 0
    let totalDup = 0
    let totalErr = 0
    const jobIds = []
    let baselinePoolAiCount = 0
    try {
      baselinePoolAiCount = await fetchHybridAiPoolCount()
    } catch (e) {
      onMessage?.('error', e instanceof Error ? e.message : 'Hybrid AI pool check failed.')
      setBusy(false)
      return
    }
    markHybridAiJobPending({ baselinePoolAiCount, questionsQueued: count * stamped.length })
    try {
      for (let i = 0; i < stamped.length; i++) {
        const job = stamped[i]
        const name = `${job.examLabel || job.examId} / ${subjectLabel(job.subject)} / ${job.chapter}`
        const running = {
          examId: job.examId,
          examLabel: job.examLabel,
          subject: job.subject,
          section: job.section,
          chapter: job.chapter,
          jobIndex: i + 1,
          jobCount: jobs.length,
          generatingIndex: 0,
          generatingOf: count,
          phase: 'calling-hybrid-ai',
        }
        appendLog(`[${i + 1}/${jobs.length}] ${name} — queuing Hybrid AI…`, { running })
        let attempt = 0
        while (attempt < 4) {
          try {
            const out = await generateOneChapter(job)
            totalQueued += out.queued
            totalDup += out.duplicates
            if (out.jobId) jobIds.push(out.jobId)
            appendLog(
              `  queued ${out.queued} for Hybrid AI` +
                (out.pyqBank ? ' (PYQ-style → AI sub_bank when done)' : ' (drafts after sync)') +
                (out.duplicates ? `, ${out.duplicates} duplicate_review` : ''),
              {
                running: { ...running, phase: 'saved', generatingIndex: out.queued },
                lastChapter: job.chapter,
                lastSubject: job.subject,
              },
            )
            break
          } catch (e) {
            if (isQuotaError(e) && attempt < 3) {
              const wait = quotaBackoffMs(attempt)
              appendLog(`  429 quota — wait ${Math.round(wait / 1000)}s then retry`, {
                running: { ...running, phase: 'waiting-quota' },
                level: 'error',
              })
              await sleepMs(wait)
              attempt += 1
              continue
            }
            totalErr += 1
            appendLog(`  ERROR: ${e instanceof Error ? e.message : String(e)}`, {
              running: { ...running, phase: 'error' },
              error: e instanceof Error ? e.message : String(e),
              errorKey: trialJobKey(job),
              level: 'error',
            })
            break
          }
        }
        onRefresh?.()
        if (i < jobs.length - 1) await sleepMs(SCQ_TRIAL_GAP_MS)
      }
      onMessage?.(
        totalErr && !totalQueued ? 'error' : 'info',
        totalErr && !totalQueued
          ? `Could not queue Hybrid AI (${totalErr} chapter error(s)).`
          : `Queued ${totalQueued} question(s) on Hybrid AI` +
              (totalErr ? ` (${totalErr} chapter error(s))` : '') +
              `. Waiting for Hybrid AI to finish in Postgres (30–90s)…`,
      )
      appendLog(
        `Queued ${totalQueued} on Hybrid AI. Duplicates ${totalDup}. Errors ${totalErr}. Waiting for Postgres…`,
      )
      let syncOut = { added: 0, ids: [], poolCount: undefined }
      if (totalQueued && !totalErr) {
        try {
          syncOut = await syncHybridAiAfterJob({
            attempts: 24,
            intervalMs: 5000,
            baselinePoolAiCount,
            jobIds,
          })
        } catch (syncErr) {
          const msg = hybridJobFailedAfterQueueMessage(syncErr)
          onMessage?.('error', msg)
          appendLog(`Sync error: ${msg}`, { level: 'error' })
        }
      }
      onRefresh?.()
      const hybridDrafts = countHybridAiDrafts(peekUploadedQuestions())
      if (syncOut.added > 0) {
        onMessage?.(
          'success',
          usePyq
            ? `Synced ${syncOut.added} PYQ-style Hybrid AI draft(s). Open Saved → Draft → Hybrid AI sub-bank.`
            : `Synced ${syncOut.added} Hybrid AI draft(s). Open Saved → Draft → Hybrid AI sub-bank.`,
        )
        appendLog(`Synced ${syncOut.added} draft(s) into the bank (${hybridDrafts} Hybrid AI drafts total).`)
      } else if (totalQueued && !totalErr) {
        if (postgresHasNoHybridAiRows(syncOut)) {
          const emptyMsg =
            hybridSyncUserMessage(syncOut, { localHybridDraftCount: hybridDrafts }) ??
            'Postgres still has 0 Hybrid AI rows — generation likely failed (check GEMINI_API_KEY).'
          onMessage?.('error', emptyMsg)
          appendLog(emptyMsg, { level: 'error' })
        } else {
          onMessage?.(
            'info',
            'Hybrid AI is still drafting. Open Saved questions → Sync from Hybrid AI in a minute, or wait for auto-sync.',
          )
          appendLog('No new rows yet — job may still be running. Use Sync from Hybrid AI on Saved questions.')
        }
      }
    } finally {
      setBusy(false)
      onRefresh?.()
    }
  }

  const startScript = async (_smoke) => {
    onMessage?.(
      'info',
      'Background Gemini script trial is retired. Use Generate buttons above (Hybrid AI batch queue) or open Hybrid AI in the nav.',
    )
  }

  const scriptRunning = Boolean(live?.scriptRunning || live?.running)
  const current = live?.current
  const liveLines = [
    ...(Array.isArray(live?.log) ? live.log.map((row) => row.text ?? '') : []),
    ...log,
  ]
    .filter(Boolean)
    .slice(-50)

  return (
    <section className="card gemini-scq-trial">
      <h3>Generate practice questions (Hybrid AI)</h3>
      <p className="form-hint">
        <strong>Hybrid AI</strong> queues <strong>{trialCount} question(s)</strong> per chapter via{' '}
        <code>/api/generate/batch</code> (AI sub_bank). {toughnessMixHint(trialCount)} PYQ-style runs
        use the same queue. For one-off picks use{' '}
        <Link to={HYBRID_AI_ROUTE}>Hybrid AI</Link> in the nav. Keep the bottom panel open (
        <strong>Ctrl+J</strong> then <strong>Ctrl+`</strong>) and press F5 if the API is not running.
      </p>
      <p className="form-hint">
        Jobs run on TestVantages Hybrid AI (same site, <code>/api</code> on 5173). About{' '}
        {Math.round(SCQ_TRIAL_GAP_MS / 1000)} seconds between chapter queues to avoid overload.
      </p>
      <p className="form-hint">
        Pick in order: <strong>Subject</strong> → <strong>Unit</strong> → <strong>Chapter(s)</strong>.
        Leave unit empty for the whole subject; leave chapters empty for the whole unit.
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
              setSelectedUnit('')
              setSelectedChapters([])
            }}
          >
            <option value="jee-main">JEE Main</option>
            <option value="jee-advanced">JEE Advanced</option>
            <option value="neet">NEET</option>
          </select>
        </label>
        <label className="metadata-field">
          <span className="metadata-label">Subject</span>
          <select
            value={subject}
            disabled={busy}
            onChange={(e) => {
              setSubject(e.target.value)
              setSelectedUnit('')
              setSelectedChapters([])
            }}
          >
            {subjectsForExam.map((id) => (
              <option key={id} value={id}>
                {subjectLabel(id)} ({subjectChapterCounts[id] ?? 0} chapters)
              </option>
            ))}
          </select>
        </label>
        <label className="metadata-field">
          <span className="metadata-label">Unit</span>
          <select
            value={selectedUnit}
            disabled={busy}
            onChange={(e) => {
              setSelectedUnit(e.target.value)
              setSelectedChapters([])
            }}
          >
            <option value="">All units — whole subject</option>
            {sectionOptions.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </label>
        <label className="metadata-field">
          <span className="metadata-label">PYQ-style (AI)</span>
          <select
            value={pyqStyle ? 'on' : ''}
            disabled={busy}
            onChange={(e) => setPyqStyle(Boolean(e.target.value))}
          >
            <option value="">Off — ordinary practice</option>
            <option value="on">On — imitate that sitting</option>
          </select>
        </label>
        {pyqStyle ? (
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
        ) : null}
        {pyqStyle && examId === 'jee-main' ? (
          <label className="metadata-field">
            <span className="metadata-label">Date</span>
            <select
              value={pyqDate}
              disabled={busy}
              onChange={(e) => setPyqDate(e.target.value)}
            >
              {mainDates.map((d) => (
                <option key={d} value={d}>
                  {formatPyqDatePretty(d)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {pyqStyle && examId === 'jee-main' ? (
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
        {pyqStyle && examId === 'jee-advanced' ? (
          <label className="metadata-field">
            <span className="metadata-label">Paper</span>
            <select
              value={pyqSession}
              disabled={busy}
              onChange={(e) => setPyqSession(e.target.value)}
            >
              <option value="Paper 1">Paper 1</option>
              <option value="Paper 2">Paper 2</option>
            </select>
          </label>
        ) : null}
      </div>
      {selectedUnit ? (
        <div className="gemini-scq-trial-row gemini-trial-chapter-picks">
          <p className="form-hint gemini-chapter-picks-hint">
            <strong>Chapters</strong> in {selectedUnit} — tick specific chapter(s), or leave all
            unchecked to generate for the <strong>whole unit</strong>.
          </p>
          {chapterOptions.map((ch) => {
            const checked = selectedChapters.includes(ch)
            const hasTrialJob = chapters.some((row) => row.section === selectedUnit && row.chapter === ch)
            return (
              <label key={ch} className="metadata-field gemini-type-check">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={busy || !hasTrialJob}
                  onChange={(e) => {
                    setSelectedChapters((prev) =>
                      e.target.checked ? [...prev, ch] : prev.filter((c) => c !== ch),
                    )
                  }}
                />
                <span>
                  {ch}
                  {!hasTrialJob ? ' (not in trial syllabus)' : ''}
                </span>
              </label>
            )
          })}
          {!chapterOptions.length ? (
            <p className="form-hint">No chapters listed for this unit yet.</p>
          ) : null}
        </div>
      ) : (
        <p className="form-hint">
          No unit selected — Hybrid AI will queue batches for the whole{' '}
          <strong>{subjectLabel(subject)}</strong>{' '}
          subject ({chapters.length} chapter{chapters.length === 1 ? '' : 's'}). Pick a unit to narrow
          down, then optionally tick chapter(s).
        </p>
      )}
      <p className="form-hint gemini-selection-summary">
        Scope: <strong>{selectionLabel}</strong> · {trialCount} question{trialCount === 1 ? '' : 's'}{' '}
        per chapter
      </p>
      <div className="gemini-scq-trial-row">
        <label className="metadata-field">
          <span className="metadata-label">Questions per chapter</span>
          <select
            value={countPicker}
            disabled={busy}
            onChange={(e) => setCountPicker(e.target.value)}
          >
            {TRIAL_COUNT_OPTIONS.map((n) => (
              <option key={n} value={String(n)}>
                {n}
              </option>
            ))}
            <option value={TRIAL_COUNT_CUSTOM}>Custom…</option>
          </select>
        </label>
        {countPicker === TRIAL_COUNT_CUSTOM ? (
          <label className="metadata-field">
            <span className="metadata-label">Custom count ({TRIAL_COUNT_MIN}–{TRIAL_COUNT_MAX})</span>
            <input
              type="number"
              min={TRIAL_COUNT_MIN}
              max={TRIAL_COUNT_MAX}
              step={1}
              value={customCount}
              disabled={busy}
              placeholder="e.g. 12"
              onChange={(e) => setCustomCount(e.target.value)}
            />
            {!countResolved.ok && customCount !== '' ? (
              <span className="form-hint gemini-count-error">{countResolved.error}</span>
            ) : null}
          </label>
        ) : null}
        <label className="metadata-field">
          <span className="metadata-label">Question types</span>
          <select
            value={typeMixMode}
            disabled={busy}
            onChange={(e) => setTypeMixMode(e.target.value)}
          >
            <option value="all">All types mix (exam-realistic)</option>
            <option value="pick">Pick specific type(s)</option>
          </select>
        </label>
      </div>
      {typeMixMode === 'pick' ? (
        <div className="gemini-scq-trial-row gemini-trial-type-picks">
          {TRIAL_GENERATABLE_TYPE_IDS.map((typeId) => {
            const def = getQuestionType(typeId)
            const checked = selectedTypes.includes(typeId)
            return (
              <label key={typeId} className="metadata-field gemini-type-check">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={busy}
                  onChange={(e) => {
                    setSelectedTypes((prev) =>
                      e.target.checked
                        ? [...prev, typeId]
                        : prev.filter((t) => t !== typeId),
                    )
                  }}
                />
                <span>
                  {def.shortName} — {def.name}
                </span>
              </label>
            )
          })}
        </div>
      ) : (
        <p className="form-hint">{trialTypeMixLabel(examId, 'all')}</p>
      )}
      <div className="gemini-scq-trial-row gemini-pyq-actions">
        <Link to="/official-pyq" className="btn btn-ghost">
          Import official PYQ
        </Link>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !resolvedJobs.length || !countResolved.ok}
          onClick={() => {
            if (!resolvedJobs.length) return
            runJobs(
              resolvedJobs,
              `${trialExamLabel(examId)} ${subjectLabel(subject)} — ${selectionLabel}`,
            )
          }}
        >
          {busy
            ? 'Generating…'
            : selectedChapters.length
              ? `Generate ${trialCount} for selected chapters (${resolvedJobs.length})`
              : selectedUnit
                ? `Generate ${trialCount} per chapter — whole unit (${resolvedJobs.length})`
                : `Generate ${trialCount} per chapter — whole subject (${resolvedJobs.length})`}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !resolvedJobs.length}
          onClick={() => {
            setPyqStyle(true)
            const smoke = resolvedJobs[0]
            if (!smoke) return
            runJobs([smoke], `PYQ-style ${trialExamLabel(examId)}`, { pyqStyle: true })
          }}
        >
          Generate PYQ-style (Hybrid AI)
        </button>
      </div>
      {pyqStyle ? (
        <p className="form-hint">
          Hybrid AI <strong>imitates</strong> {trialExamLabel(examId)}
          {examId === 'jee-main'
            ? ` ${formatPyqDatePretty(pyqDate)} Shift ${pyqShift}`
            : examId === 'jee-advanced'
              ? ` ${pyqYear} ${pyqSession}`
              : ` ${pyqYear}`}
          . Tags go on the PYQ bank paper (not generic drafts). This is <strong>not</strong> a
          licensed official NTA / IIT paper. Labels: <strong>PYQ-style (AI)</strong>. For real
          papers, use <Link to="/official-pyq">Import official PYQ</Link> (download from NTA /
          Advanced archive, then approve). Toughness follows the real sitting — no 40/30/30 mix.
        </p>
      ) : (
        <p className="form-hint">
          Need real previous-year papers? Use <Link to="/official-pyq">Import official PYQ</Link> —
          Hybrid AI cannot legally dump copyrighted NTA papers.
        </p>
      )}
      <p className="form-hint">
        Full PCM + NEET PCB trial is {allJobsCount} chapter jobs across all exams/subjects.
      </p>
      <div className="gemini-scq-trial-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={scriptRunning}
          onClick={() => startScript(false)}
        >
          {scriptRunning ? 'Trial running…' : 'Start trial (watch live)'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={scriptRunning}
          onClick={() => startScript(true)}
        >
          Start smoke (1 chapter)
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy || !resolvedJobs.length || !countResolved.ok}
          onClick={() => {
            const smoke = resolvedJobs[0]
            if (!smoke) return
            runJobs([smoke], `Smoke ${trialJobKey(smoke)}`)
          }}
        >
          Generate {trialCount} — smoke (1 chapter)
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy || !countResolved.ok}
          onClick={() => {
            if (
              !window.confirm(
                `Generate ${trialCount} trial drafts for every JEE Main P/C/M and NEET P/C/B chapter (${allJobsCount} API calls)? Drafts only.`,
              )
            ) {
              return
            }
            runJobs(listAllTrialJobs(), 'Full JEE Main PCM + NEET PCB')
          }}
        >
          Full JEE + NEET trial
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => {
            onMessage?.(
              'info',
              'Import from npm gemini:scq-trial is retired. Hybrid AI saves to the server bank — use Generate above or Hybrid AI nav.',
            )
          }}
        >
          Import last script run (retired)
        </button>
      </div>
      <div className="gemini-scq-trial-live" aria-live="polite">
        <h4>Live generation</h4>
        {liveError ? <p className="gemini-scq-trial-live-error">{liveError}</p> : null}
        <p className="gemini-scq-trial-now">
          {scriptRunning && current
            ? `${current.examLabel || current.examId || ''} / ${subjectLabel(current.subject)} / ${current.section ? `${current.section} / ` : ''}${current.chapter || '…'}`
            : 'Not running now. Last log is below. Press Start trial to resume (drafts stay).'}
        </p>
        {current ? (
          <p>
            generating {current.generatingIndex ?? 0}/{current.generatingOf ?? trialCount}
            {current.jobCount
              ? ` · chapter ${current.jobIndex}/${current.jobCount}`
              : ''}
            {current.phase ? ` · ${phaseLabel(current.phase)}` : ''}
          </p>
        ) : null}
        <p className="form-hint">
          File: {live?.totals?.drafts ?? 0} drafts · {live?.totals?.done ?? 0} chapters ok ·{' '}
          {live?.totals?.error ?? 0} errors
          {live?.totals?.duplicates ? ` · ${live.totals.duplicates} duplicate_review` : ''}
        </p>
        {live?.lastStem ? (
          <p className="gemini-scq-trial-stem">Last stem: {live.lastStem}</p>
        ) : null}
        {Array.isArray(live?.recentErrors) && live.recentErrors.length > 0 ? (
          <ul className="gemini-scq-trial-errors">
            {live.recentErrors.slice(-8).map((row) => (
              <li key={`${row.key}-${row.at}`}>
                {String(row.key ?? '').replace(/::/g, ' / ')}: {row.error}
              </li>
            ))}
          </ul>
        ) : null}
        <pre className="gemini-scq-trial-log">
          {liveLines.length ? liveLines.join('\n') : 'No live lines yet. Press Start trial or generate above.'}
        </pre>
      </div>
    </section>
  )
}
