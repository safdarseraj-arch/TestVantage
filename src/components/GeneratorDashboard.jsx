import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CURRICULUM_TREE } from '../data/curriculum.js'
import { queueBatch, HYBRID_AI_ROUTE } from '../utils/hybridAiClient.js'
import { resolveHybridCurriculumTags } from '../utils/hybridMetadata.js'
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

const EXAMS = ['JEE Main', 'JEE Advanced', 'NEET']
const SUBJECTS = ['Physics', 'Chemistry', 'Mathematics', 'Botany', 'Zoology']
const QUESTION_TYPES = ['Single Choice', 'Multiple Choice', 'Numerical']
const DIFFICULTIES = ['Easy', 'Medium', 'Hard']
const TOUGHNESS_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const BATCH_COUNT = 1

const SUBJECT_TO_CURRICULUM = {
  Physics: 'physics',
  Chemistry: 'chemistry',
  Mathematics: 'mathematics',
  Botany: 'biology',
  Zoology: 'biology',
}

const FALLBACK_CHAPTERS = {
  Physics: ['Kinematics', 'Electrostatics', 'Rotation'],
  Chemistry: ['Organic Chemistry', 'Thermodynamics', 'Equilibrium'],
  Mathematics: ['Vector Algebra', 'Definite Integration', 'Probability'],
  Botany: ['Plant Physiology', 'Morphology of Flowering Plants'],
  Zoology: ['Human Physiology', 'Reproduction'],
}

/** @param {string} subjectLabel */
function chaptersForSubject(subjectLabel) {
  const treeKey = SUBJECT_TO_CURRICULUM[subjectLabel]
  const tree = treeKey ? CURRICULUM_TREE[treeKey] : null
  if (!tree) return FALLBACK_CHAPTERS[subjectLabel] ?? ['General']

  const names = []
  for (const section of Object.values(tree)) {
    for (const chapter of Object.keys(section)) {
      names.push(chapter)
    }
  }
  const unique = [...new Set(names)].sort((a, b) => a.localeCompare(b))
  if (subjectLabel === 'Botany') {
    return unique.filter((c) => /plant|botany|morphology|cell|genetics/i.test(c)).slice(0, 40)
  }
  if (subjectLabel === 'Zoology') {
    return unique.filter((c) => /human|animal|reproduction|health|biotechnology/i.test(c)).slice(0, 40)
  }
  return unique.length ? unique : FALLBACK_CHAPTERS[subjectLabel] ?? ['General']
}

export default function GeneratorDashboard() {
  const [exam, setExam] = useState(EXAMS[0])
  const [subject, setSubject] = useState(SUBJECTS[2])
  const [chapter, setChapter] = useState('')
  const [questionType, setQuestionType] = useState(QUESTION_TYPES[0])
  const [difficulty, setDifficulty] = useState(DIFFICULTIES[1])
  const [toughnessLevel, setToughnessLevel] = useState(5)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [toastKind, setToastKind] = useState('info')

  const chapterOptions = useMemo(() => chaptersForSubject(subject), [subject])

  useEffect(() => {
    if (!chapterOptions.includes(chapter)) {
      setChapter(chapterOptions[0] ?? 'General')
    }
  }, [chapter, chapterOptions])

  useEffect(() => {
    if (!toast) return undefined
    const t = setTimeout(() => setToast(''), 4500)
    return () => clearTimeout(t)
  }, [toast])

  const queueBatchJob = async () => {
    if (busy) return
    setBusy(true)
    setToastKind('info')
    let baselinePoolAiCount = 0
    try {
      baselinePoolAiCount = await fetchHybridAiPoolCount()
    } catch (e) {
      setToastKind('error')
      setToast(e instanceof Error ? e.message : 'Hybrid AI pool check failed.')
      setBusy(false)
      return
    }
    markHybridAiJobPending({
      baselinePoolAiCount,
      questionsQueued: BATCH_COUNT,
    })
    try {
      const tags = resolveHybridCurriculumTags(subject, { chapter })
      const payload = {
        exam,
        subject,
        unit: tags.mapped ? tags.unit : undefined,
        chapter: tags.mapped ? tags.chapter : chapter || 'General',
        topic: tags.topic || undefined,
        difficulty,
        toughness_level: Number(toughnessLevel),
        question_type: questionType,
        count: BATCH_COUNT,
      }
      const queued = await queueBatch(payload)
      setToast('Job queued — Hybrid AI is drafting (usually 30–90s). Do not open Saved until this finishes…')
      let syncOut
      try {
        syncOut = await syncHybridAiAfterJob({
          attempts: 24,
          intervalMs: 5000,
          baselinePoolAiCount,
          jobId: queued?.job_id,
        })
      } catch (syncErr) {
        setToastKind('error')
        setToast(hybridJobFailedAfterQueueMessage(syncErr))
        return
      }
      const localHybrid = countHybridAiDrafts(peekUploadedQuestions())
      if (syncOut.added > 0) {
        setToastKind('success')
        setToast(
          `Synced ${syncOut.added} new draft(s) — open Saved → Draft → Hybrid AI sub-bank.`,
        )
      } else if (postgresHasNoHybridAiRows(syncOut)) {
        setToastKind('error')
        setToast(hybridJobFailedAfterQueueMessage(null))
      } else {
        setToastKind('info')
        setToast(
          hybridSyncUserMessage(syncOut, { localHybridDraftCount: localHybrid }) ??
            'Hybrid AI may still be drafting. Use Sync from Hybrid AI on Saved questions in a minute.',
        )
      }
    } catch (e) {
      setToastKind('error')
      setToast(e instanceof Error ? e.message : 'Could not queue batch.')
    } finally {
      clearHybridAiJobPending()
      setBusy(false)
    }
  }

  return (
    <div className="page generator-dashboard-page">
      <header className="generator-dashboard-header">
        <h1>Hybrid AI</h1>
        <p className="form-hint">
          Part of <strong>TestVantages</strong> — queue new questions into the AI sub_bank (pending review).
          No typing: pick exam metadata, then queue a batch. API:{' '}
          <code>/api/generate/batch</code> ·{' '}
          <Link to="/upload?type=book">Book / question bank PDF</Link>
        </p>
      </header>

      <section className="card gemini-scq-trial generator-dashboard-card">
        <h2>Queue AI batch</h2>
        <p className="form-hint">
          Each run queues <strong>{BATCH_COUNT}</strong> draft question(s) for the chapter you select. Keep the
          bottom terminal open (Ctrl+J then Ctrl+`) and press F5 so Hybrid AI stays running.
        </p>

        <div className="gemini-scq-trial-row generator-dashboard-grid">
          <label className="metadata-field">
            <span className="metadata-label">Exam</span>
            <select value={exam} disabled={busy} onChange={(e) => setExam(e.target.value)}>
              {EXAMS.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>

          <label className="metadata-field">
            <span className="metadata-label">Subject</span>
            <select value={subject} disabled={busy} onChange={(e) => setSubject(e.target.value)}>
              {SUBJECTS.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>

          <label className="metadata-field">
            <span className="metadata-label">Chapter</span>
            <select value={chapter} disabled={busy} onChange={(e) => setChapter(e.target.value)}>
              {chapterOptions.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>

          <label className="metadata-field">
            <span className="metadata-label">Question type</span>
            <select
              value={questionType}
              disabled={busy}
              onChange={(e) => setQuestionType(e.target.value)}
            >
              {QUESTION_TYPES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>

          <label className="metadata-field">
            <span className="metadata-label">Difficulty</span>
            <select value={difficulty} disabled={busy} onChange={(e) => setDifficulty(e.target.value)}>
              {DIFFICULTIES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>

          <label className="metadata-field">
            <span className="metadata-label">Toughness</span>
            <select
              value={toughnessLevel}
              disabled={busy}
              onChange={(e) => setToughnessLevel(Number(e.target.value))}
            >
              {TOUGHNESS_LEVELS.map((level) => (
                <option key={level} value={level}>
                  T{level}
                  {level <= 3 ? ' Easy' : level <= 7 ? ' Moderate' : ' Tough'}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="generator-dashboard-actions">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={queueBatchJob}>
            {busy ? 'Queuing…' : 'Queue TestVantages AI Batch'}
          </button>
          <Link to="/question-bank" className="btn btn-ghost">
            Question Bank
          </Link>
        </div>
      </section>

      {toast ? (
        <div
          className={`bank-page-toast ${
            toastKind === 'error'
              ? 'upload-error'
              : toastKind === 'success'
                ? 'upload-success'
                : 'upload-info'
          }`}
          role={toastKind === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          <p className="bank-page-toast-text">{toast}</p>
          <button type="button" className="bank-page-toast-close" aria-label="Dismiss" onClick={() => setToast('')}>
            ×
          </button>
        </div>
      ) : null}
    </div>
  )
}

export { HYBRID_AI_ROUTE }
