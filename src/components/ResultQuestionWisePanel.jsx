import { useEffect, useMemo, useState } from 'react'
import { QuestionStem, SolutionMedia } from './QuestionMedia'
import QuestionPeerStatsBlock from './QuestionPeerStatsBlock'
import {
  shouldHideStemTextWithImage,
  shouldShowQuestionStemImage,
} from '../utils/stemDiagramDetect.js'
import { getQuestionType } from '../data/questionTypes'
import { filterPerQuestionForSubject } from '../utils/testAnalysis.js'
import ReportQuestionButton from './ReportQuestionModal.jsx'
import AskDoubtButton from './AskDoubtButton.jsx'

const GRADE_ICON = {
  correct: '✓',
  wrong: '✗',
  partial: '◐',
  unattempted: '—',
}

const GRADE_LABEL = {
  correct: 'Correct',
  wrong: 'Wrong',
  partial: 'Partial',
  unattempted: 'Skipped',
}

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'wrong', label: 'Wrong' },
  { id: 'correct', label: 'Correct' },
  { id: 'unattempted', label: 'Skipped' },
  { id: 'marked', label: 'Marked' },
  { id: 'slow', label: 'Time sinks' },
]

const DETAIL_TABS = [
  { id: 'question', label: 'View question', icon: '📄' },
  { id: 'answers', label: 'Your vs correct', icon: '⚖️' },
  { id: 'solution', label: 'Solution', icon: '💡' },
]

/**
 * Split-panel question-wise review — pick Q number, view question in place (no page change).
 * @param {{
 *   perQuestion: object[]
 *   subjectFilter?: string
 *   title?: string
 *   subtitle?: string
 *   peerStatsByQuestionId?: Map<string, object>
 *   initialQuestionId?: string | null
 * }} props
 */
export default function ResultQuestionWisePanel({
  perQuestion = [],
  subjectFilter = 'overall',
  title = 'Question-wise analysis',
  subtitle = 'Tap any question number to view it here — your result is colour-coded.',
  peerStatsByQuestionId,
  initialQuestionId = null,
}) {
  const [filter, setFilter] = useState('all')
  const [chapterFilter, setChapterFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(/** @type {string | null} */ (null))
  const [detailTab, setDetailTab] = useState('question')

  const bySubject = useMemo(
    () => filterPerQuestionForSubject(perQuestion, subjectFilter),
    [perQuestion, subjectFilter],
  )

  const chapters = useMemo(() => {
    const set = new Set()
    for (const q of bySubject) {
      if (q.chapter) set.add(q.chapter)
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [bySubject])

  const avgTime = useMemo(() => {
    const timed = bySubject
      .map((q) => Number(q.timeSpentSeconds ?? 0))
      .filter((s) => s > 0)
    if (!timed.length) return 0
    return Math.round(timed.reduce((s, t) => s + t, 0) / timed.length)
  }, [bySubject])

  const slowThreshold = Math.max(Math.round(avgTime * 1.4), avgTime + 12, 40)

  const filtered = useMemo(() => {
    let list = bySubject
    if (chapterFilter !== 'all') list = list.filter((q) => q.chapter === chapterFilter)
    if (filter === 'all') return list
    if (filter === 'marked') return list.filter((q) => q.marked)
    if (filter === 'slow') {
      return list.filter(
        (q) =>
          Number(q.timeSpentSeconds ?? 0) >= slowThreshold &&
          (q.grade === 'wrong' || q.grade === 'partial'),
      )
    }
    return list.filter((q) => q.grade === filter)
  }, [bySubject, filter, chapterFilter, slowThreshold])

  const counts = useMemo(() => {
    const scoped =
      chapterFilter === 'all'
        ? bySubject
        : bySubject.filter((q) => q.chapter === chapterFilter)
    return {
      all: scoped.length,
      correct: scoped.filter((q) => q.grade === 'correct').length,
      wrong: scoped.filter((q) => q.grade === 'wrong').length,
      unattempted: scoped.filter((q) => q.grade === 'unattempted').length,
      marked: scoped.filter((q) => q.marked).length,
      slow: scoped.filter(
        (q) =>
          Number(q.timeSpentSeconds ?? 0) >= slowThreshold &&
          (q.grade === 'wrong' || q.grade === 'partial'),
      ).length,
    }
  }, [bySubject, chapterFilter, slowThreshold])

  const selected = useMemo(
    () => filtered.find((q) => q.questionId === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId],
  )

  const selectedIndex = selected ? filtered.findIndex((q) => q.questionId === selected.questionId) : -1

  const selectedPeer = useMemo(() => {
    if (!selected || !peerStatsByQuestionId) return null
    return peerStatsByQuestionId.get(selected.questionId) ?? null
  }, [selected, peerStatsByQuestionId])

  useEffect(() => {
    if (initialQuestionId) {
      setSelectedId(initialQuestionId)
      setFilter('all')
      setChapterFilter('all')
    }
  }, [initialQuestionId])

  useEffect(() => {
    if (!filtered.length) {
      setSelectedId(null)
      return
    }
    if (!filtered.some((q) => q.questionId === selectedId)) {
      setSelectedId(filtered[0].questionId)
    }
  }, [filtered, selectedId])

  const goPrev = () => {
    if (selectedIndex > 0) {
      setSelectedId(filtered[selectedIndex - 1].questionId)
      setDetailTab('question')
    }
  }

  const goNext = () => {
    if (selectedIndex >= 0 && selectedIndex < filtered.length - 1) {
      setSelectedId(filtered[selectedIndex + 1].questionId)
      setDetailTab('question')
    }
  }

  if (!perQuestion.length) {
    return (
      <section className="rqw-panel card">
        <h2>{title}</h2>
        <p className="form-hint">No question data for this attempt.</p>
      </section>
    )
  }

  return (
    <section className="rqw-panel">
      <header className="rqw-header">
        <div>
          <h2>{title}</h2>
          <p className="rqw-subtitle">{subtitle}</p>
        </div>
        <div className="rqw-legend">
          <span>
            <i className="rqw-dot correct" /> Correct
          </span>
          <span>
            <i className="rqw-dot wrong" /> Wrong
          </span>
          <span>
            <i className="rqw-dot partial" /> Partial
          </span>
          <span>
            <i className="rqw-dot unattempted" /> Skipped
          </span>
        </div>
      </header>

      <div className="rqw-summary-strip">
        <div className="rqw-summary-item rqw-summary-correct">
          <strong>{counts.correct}</strong>
          <span>Correct</span>
        </div>
        <div className="rqw-summary-item rqw-summary-wrong">
          <strong>{counts.wrong}</strong>
          <span>Wrong</span>
        </div>
        <div className="rqw-summary-item rqw-summary-skipped">
          <strong>{counts.unattempted}</strong>
          <span>Skipped</span>
        </div>
        <div className="rqw-summary-item rqw-summary-total">
          <strong>{counts.all}</strong>
          <span>Total</span>
        </div>
      </div>

      <div className="rqw-filters">
        {FILTERS.map((f) => {
          const count =
            f.id === 'all'
              ? counts.all
              : f.id === 'marked'
                ? counts.marked
                : f.id === 'slow'
                  ? counts.slow
                  : counts[f.id] ?? 0
          return (
            <button
              key={f.id}
              type="button"
              className={`rqw-filter-chip ${filter === f.id ? 'active' : ''}${f.id === 'slow' ? ' rqw-filter-slow' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              <span className="rqw-filter-count">{count}</span>
            </button>
          )
        })}
        {chapters.length > 1 && (
          <label className="rqw-chapter-filter">
            <span>Chapter</span>
            <select
              value={chapterFilter}
              onChange={(e) => setChapterFilter(e.target.value)}
            >
              <option value="all">All chapters</option>
              {chapters.map((ch) => (
                <option key={ch} value={ch}>
                  {ch}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="rqw-split">
        <aside className="rqw-sidebar" aria-label="Question numbers">
          <p className="rqw-sidebar-label">Questions</p>
          <div className="rqw-q-grid">
            {filtered.map((pq) => (
              <button
                key={pq.questionId}
                type="button"
                className={`rqw-q-pill rqw-q-${pq.grade}${selected?.questionId === pq.questionId ? ' active' : ''}${pq.marked ? ' marked' : ''}`}
                onClick={() => {
                  setSelectedId(pq.questionId)
                  setDetailTab('question')
                }}
                title={`Q${pq.index} — ${GRADE_LABEL[pq.grade] ?? pq.grade}`}
              >
                <span className="rqw-q-pill-num">{pq.index}</span>
                <span className="rqw-q-pill-icon" aria-hidden>
                  {GRADE_ICON[pq.grade] ?? '·'}
                </span>
              </button>
            ))}
          </div>
          {filtered.length === 0 && (
            <p className="form-hint rqw-sidebar-empty">No questions match this filter.</p>
          )}
        </aside>

        <div className="rqw-detail card">
          {selected ? (
            <>
              <div className="rqw-detail-top">
                <div className="rqw-detail-title">
                  <span className={`rqw-detail-grade rqw-detail-grade--${selected.grade}`}>
                    {GRADE_ICON[selected.grade]} {GRADE_LABEL[selected.grade]}
                  </span>
                  <h3>Question {selected.index}</h3>
                  <div className="rqw-detail-meta">
                    <span>{selected.subject}</span>
                    {selected.chapter && <span>{selected.chapter}</span>}
                    <span>{getQuestionType(selected.questionType).name}</span>
                    <span className="rqw-marks">
                      {selected.marks}/{selected.maxMarks} marks
                    </span>
                    {selected.timeSpentSeconds > 0 && (
                      <span>{selected.timeSpentSeconds}s</span>
                    )}
                    {selected.marked && <span className="rqw-marked-badge">Marked</span>}
                  </div>
                </div>
                <div className="rqw-nav">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={selectedIndex <= 0}
                    onClick={goPrev}
                  >
                    ← Prev
                  </button>
                  <span className="rqw-nav-pos">
                    {selectedIndex + 1} / {filtered.length}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={selectedIndex < 0 || selectedIndex >= filtered.length - 1}
                    onClick={goNext}
                  >
                    Next →
                  </button>
                  <ReportQuestionButton
                    questionId={selected.questionId}
                    source="result"
                    compact
                  />
                  <AskDoubtButton
                    questionId={selected.questionId}
                    subject={selected.subject}
                    chapter={selected.chapter}
                    compact
                  />
                </div>
              </div>

              <div className="rqw-detail-tabs" role="tablist">
                {DETAIL_TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={detailTab === t.id}
                    className={`rqw-detail-tab ${detailTab === t.id ? 'active' : ''}`}
                    onClick={() => setDetailTab(t.id)}
                  >
                    <span aria-hidden>{t.icon}</span> {t.label}
                  </button>
                ))}
              </div>

              <div className="rqw-detail-body">
                {detailTab === 'question' && (
                  <div className="rqw-question-view">
                    <QuestionStem
                      text={selected.text}
                      options={selected.options}
                      questionImage={
                        shouldShowQuestionStemImage(selected) ? selected.questionImage : undefined
                      }
                      hideTextWithImage={shouldHideStemTextWithImage(selected)}
                    />
                  </div>
                )}

                {detailTab === 'answers' && (
                  <div className="rqw-answers-view">
                    <div
                      className={`rqw-answer-card ${selected.grade === 'correct' ? 'rqw-answer-card--correct' : selected.grade === 'wrong' ? 'rqw-answer-card--wrong' : ''}`}
                    >
                      <span className="rqw-answer-label">Your answer</span>
                      <p>{selected.userAnswerLabel || '— Not attempted'}</p>
                    </div>
                    <div className="rqw-answer-card rqw-answer-card--correct">
                      <span className="rqw-answer-label">Correct answer</span>
                      <p>{selected.correctAnswerLabel || '—'}</p>
                    </div>
                    <QuestionPeerStatsBlock
                      peer={selectedPeer}
                      yourTimeSeconds={selected.timeSpentSeconds}
                    />
                  </div>
                )}

                {detailTab === 'solution' && (
                  <div className="rqw-solution-view">
                    <p className="rqw-solution-correct">
                      <strong>Correct answer:</strong> {selected.correctAnswerLabel || '—'}
                    </p>
                    {(selected.solution || selected.solutionImage) && (
                      <div className="rqw-solution-media">
                        <strong>Solution</strong>
                        <SolutionMedia
                          solution={selected.solution}
                          solutionImage={selected.solutionImage}
                        />
                      </div>
                    )}
                    {!selected.solution && !selected.solutionImage && !selected.videoSolution && (
                      <p className="form-hint">No written solution uploaded for this question.</p>
                    )}
                    {selected.videoSolution && (
                      <a
                        href={selected.videoSolution}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-ghost btn-sm rqw-video-link"
                      >
                        ▶ Watch video solution
                      </a>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="rqw-detail-empty">
              <p>Select a question from the grid to view it here.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
