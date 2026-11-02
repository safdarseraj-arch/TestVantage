import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import MathText from '../MathText'
import {
  analyzeDifficultyProfile,
  buildCalibratedPublishChecklist,
  buildPaperReviewManifest,
  buildPublishChecklist,
  computeCalibratedPaperQualityScore,
  computePaperQualityScore,
  computeQualityBreakdown,
  qualityScoreLabel,
  validateCalibratedPaperForPublish,
  validatePaperForPublish,
} from '../../utils/paperPublish.js'
import { getQuestionType } from '../../data/questionTypes'
import { effectiveQuestionTypeId } from '../../utils/bankListFilters'
import { getAnswerableQuestions } from '../../utils/passage.js'
import BankPickQuestionPreview from './BankPickQuestionPreview'

/** @param {import('../../data/tests').Question} q */
function formatAnswerKey(q) {
  const type = effectiveQuestionTypeId(q)
  if (type === 'single_correct' || type === 'multiple_correct' || type === 'passage_scq') {
    if (q.correctIndex != null && q.correctIndex >= 0) {
      return `Option ${String.fromCharCode(65 + q.correctIndex)}`
    }
    if (Array.isArray(q.correctIndices) && q.correctIndices.length) {
      return q.correctIndices.map((i) => String.fromCharCode(65 + i)).join(', ')
    }
  }
  if (type === 'integer' || type === 'passage_integer') {
    if (q.correctInteger != null) return String(q.correctInteger)
    if (q.correctNumerical != null) return String(q.correctNumerical)
  }
  if (type === 'numerical' && q.correctNumerical != null) {
    return String(q.correctNumerical)
  }
  if (type === 'matrix_match' && Array.isArray(q.matrixAnswer) && q.matrixAnswer.length) {
    return q.matrixAnswer.join(', ')
  }
  return null
}

/**
 * SME-style pre-publish review (QC checklist + TQS).
 * @param {{
 *   questions: import('../../data/tests').Question[]
 *   slots?: import('../../data/examPatterns').QuestionTypeSlot[]
 *   reviewedOk: boolean
 *   onReviewedOkChange: (v: boolean) => void
 *   showApproveGate?: boolean
 *   calibratedDraft?: import('../../data/tests').Test | null
 *   targetTotal?: number
 * }} props
 */
export default function PaperReviewStep({
  questions,
  slots = [],
  reviewedOk,
  onReviewedOkChange,
  showApproveGate = true,
  calibratedDraft = null,
  targetTotal = 0,
}) {
  const [filter, setFilter] = useState('all')
  const [expanded, setExpanded] = useState(/** @type {Set<number>} */ (new Set()))

  const answerableQuestions = useMemo(
    () => getAnswerableQuestions(questions ?? []),
    [questions],
  )

  const isCalibrated = Boolean(calibratedDraft)

  const publishCheck = useMemo(
    () =>
      isCalibrated
        ? validateCalibratedPaperForPublish(calibratedDraft, { targetTotal })
        : validatePaperForPublish(questions, { slots, strictKeys: true }),
    [isCalibrated, calibratedDraft, targetTotal, questions, slots],
  )
  const score = useMemo(
    () =>
      isCalibrated
        ? computeCalibratedPaperQualityScore(calibratedDraft, { targetTotal })
        : computePaperQualityScore(questions, slots),
    [isCalibrated, calibratedDraft, targetTotal, questions, slots],
  )
  const breakdown = useMemo(() => {
    if (isCalibrated) {
      const poolPct = publishCheck.poolGaps?.length ? 0 : 100
      const starterPct = publishCheck.problems.filter((p) => p.index > 0).length ? 0 : 100
      return {
        completeness: starterPct,
        answerKeys: starterPct,
        blueprint: poolPct,
        questionCount: poolPct,
        total: score,
      }
    }
    return computeQualityBreakdown(questions, slots)
  }, [isCalibrated, publishCheck, questions, slots, score])
  const ql = qualityScoreLabel(score)
  const checklist = useMemo(
    () =>
      isCalibrated
        ? buildCalibratedPublishChecklist(publishCheck, score)
        : buildPublishChecklist(publishCheck, score),
    [isCalibrated, publishCheck, score],
  )
  const manifest = useMemo(() => buildPaperReviewManifest(questions, slots), [questions, slots])
  const difficulty = useMemo(() => analyzeDifficultyProfile(questions), [questions])

  useEffect(() => {
    setExpanded(new Set(manifest.map((r) => r.index)))
  }, [manifest])

  const filtered = manifest.filter((row) => {
    if (filter === 'issues') return !row.ready
    if (filter === 'ready') return row.ready
    return true
  })

  const issueCount = manifest.filter((r) => !r.ready).length

  const questionForRow = (row) =>
    answerableQuestions[row.index - 1] ?? row.question ?? null

  const toggleRow = (index) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const expandAll = () => {
    setExpanded((prev) => {
      const next = new Set(prev)
      for (const row of filtered) next.add(row.index)
      return next
    })
  }

  const collapseAll = () => {
    setExpanded((prev) => {
      const next = new Set(prev)
      for (const row of filtered) next.delete(row.index)
      return next
    })
  }

  return (
    <section className="create-section card paper-review-step">
      <h2>{isCalibrated ? 'Review calibrated paper before publish' : 'Review every question before publish'}</h2>
      <p className="form-hint">
        {isCalibrated ? (
          <>
            Calibrated papers deliver questions live (GRE-style). Review the starter question and
            confirm your syllabus pool is ready. Aim for Test Quality Score <strong>75+</strong>.
          </>
        ) : (
          <>
            Read each full question below — stem, options, diagram, and answer key. Aim for Test
            Quality Score <strong>75+</strong> (recommended minimum).
          </>
        )}
      </p>

      <div className={`paper-publish-checklist paper-publish-checklist--${ql.tone}`}>
        <div className="paper-publish-score">
          <span className="paper-publish-score-num">{score}</span>
          <div>
            <strong>Test Quality Score — {ql.label}</strong>
            <div className="paper-quality-bars">
              <div className="paper-quality-bar">
                <span>Complete</span>
                <div className="paper-quality-track">
                  <div className="paper-quality-fill" style={{ width: `${breakdown.completeness}%` }} />
                </div>
                <em>{breakdown.completeness}%</em>
              </div>
              <div className="paper-quality-bar">
                <span>Keys</span>
                <div className="paper-quality-track">
                  <div className="paper-quality-fill" style={{ width: `${breakdown.answerKeys}%` }} />
                </div>
                <em>{breakdown.answerKeys}%</em>
              </div>
              <div className="paper-quality-bar">
                <span>{isCalibrated ? 'Pool' : 'Blueprint'}</span>
                <div className="paper-quality-track">
                  <div className="paper-quality-fill" style={{ width: `${breakdown.blueprint}%` }} />
                </div>
                <em>{breakdown.blueprint}%</em>
              </div>
            </div>
          </div>
        </div>
        <ul className="paper-publish-items">
          {checklist.map((item) => (
            <li key={item.id} className={item.ok ? 'ok' : 'fail'}>
              <span aria-hidden="true">{item.ok ? '✓' : '✗'}</span>
              {item.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="paper-difficulty-summary card">
        <strong>Difficulty spread</strong>
        <span className="paper-difficulty-pills">
          <span>Easy: {difficulty.buckets.easy}</span>
          <span>Medium: {difficulty.buckets.medium}</span>
          <span>Hard: {difficulty.buckets.hard}</span>
          {difficulty.buckets.unknown > 0 && <span>Untagged: {difficulty.buckets.unknown}</span>}
        </span>
        {difficulty.average != null && (
          <p className="form-hint">Average toughness: {difficulty.average.toFixed(1)} / 10</p>
        )}
      </div>

      <div className="paper-review-toolbar">
        <label>
          Show
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All ({manifest.length})</option>
            <option value="issues">Needs fix ({issueCount})</option>
            <option value="ready">Ready ({manifest.length - issueCount})</option>
          </select>
        </label>
        <button type="button" className="btn btn-ghost btn-sm" onClick={expandAll}>
          Expand all
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={collapseAll}>
          Collapse all
        </button>
        <Link to="/question-bank" className="btn btn-ghost btn-sm">
          Fix in Question Bank
        </Link>
      </div>

      <ol className="paper-review-list">
        {filtered.map((row) => {
          const q = questionForRow(row)
          const isOpen = expanded.has(row.index)
          const answerKey = q ? formatAnswerKey(q) : null
          return (
            <li
              key={row.id ?? row.index}
              className={`paper-review-row ${row.ready ? 'ready' : 'bad'}${isOpen ? ' open' : ''}`}
            >
              <button
                type="button"
                className="paper-review-row-head"
                onClick={() => toggleRow(row.index)}
                aria-expanded={isOpen}
              >
                <span className="paper-review-qnum">Q{row.index}</span>
                <span className="paper-review-type">{getQuestionType(row.type).shortName}</span>
                {row.subject && <span className="paper-review-subj">{row.subject}</span>}
                {row.chapter && <span className="paper-review-chap">{row.chapter}</span>}
                {row.toughness != null && <span className="paper-review-tough">T{row.toughness}</span>}
                <span className={`paper-review-status ${row.ready ? 'ok' : 'fail'}`}>
                  {row.ready ? 'Ready' : 'Fix needed'}
                </span>
                <span className="paper-review-expand">{isOpen ? '▲ Hide' : '▼ Show'}</span>
              </button>
              {isOpen && (
                <div className="paper-review-row-body">
                  <div className="paper-review-stem">
                    {q ? (
                      <BankPickQuestionPreview question={q} showAllOptionSlots />
                    ) : (
                      <MathText text={row.stemPreview || '(Question text unavailable)'} />
                    )}
                  </div>
                  {answerKey && (
                    <p className="paper-review-answer-key">
                      <strong>Answer key:</strong> {answerKey}
                    </p>
                  )}
                  {row.issues.length > 0 && (
                    <ul className="paper-review-issues">
                      {row.issues.map((msg) => (
                        <li key={msg}>{msg}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ol>

      {showApproveGate && (
        <label className="paper-review-approve">
          <input
            type="checkbox"
            checked={reviewedOk}
            onChange={(e) => onReviewedOkChange(e.target.checked)}
            disabled={!publishCheck.ok}
          />
          <span>
            I reviewed every question — this paper is ready to publish to students
            {!publishCheck.ok && ' (fix all issues above first)'}
          </span>
        </label>
      )}
    </section>
  )
}
