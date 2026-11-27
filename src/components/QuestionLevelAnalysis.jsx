import { useMemo, useState } from 'react'
import ResultQuestionWisePanel from './ResultQuestionWisePanel'
import { getQuestionType } from '../data/questionTypes'
import { buildQuestionLevelCohortStats, buildPerQuestionPeerStats, filterPerQuestionForSubject } from '../utils/testAnalysis.js'
import { buildDemoPeerStatsForQuestions } from '../utils/questionLevelDiagnostics.js'

const DIFF_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }

/** @param {string} text */
function stemSnippet(text) {
  const t = String(text ?? '')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$]+\$/g, ' ')
    .replace(/\\[a-zA-Z]+(\{[^}]*\})?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!t) return 'Question'
  return t.length > 72 ? `${t.slice(0, 69)}…` : t
}

function CohortTable({ rows, studentGrades }) {
  const studentCount = rows[0]?.studentCount ?? 0

  return (
    <>
      <div className="ql-analysis-table-wrap">
        <table className="ql-analysis-table">
          <thead>
            <tr>
              <th>Q</th>
              <th>Question</th>
              <th>Type</th>
              <th>Distribution</th>
              <th className="ql-num">Correct</th>
              <th className="ql-num">Wrong</th>
              <th className="ql-num">Not att.</th>
              <th>Level</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const you = studentGrades?.get(row.questionId)
              return (
                <tr
                  key={row.questionId}
                  className={`ql-row ql-row-${row.difficulty}${you ? ` ql-you-${you}` : ''}`}
                >
                  <td className="ql-q-num">
                    <span className="ql-q-badge">{row.index}</span>
                    {you && (
                      <span className={`ql-you-pill ${you}`} title="Your result">
                        You
                      </span>
                    )}
                  </td>
                  <td className="ql-stem" title={stemSnippet(row.text)}>
                    {stemSnippet(row.text)}
                    {row.chapter && <span className="ql-chapter">{row.chapter}</span>}
                  </td>
                  <td className="ql-type">{getQuestionType(row.questionType).shortName}</td>
                  <td className="ql-bar-cell">
                    <div className="ql-stacked-bar" aria-label={`Q${row.index} cohort distribution`}>
                      {row.correctPct > 0 && (
                        <span
                          className="ql-seg correct"
                          style={{ width: `${row.correctPct}%` }}
                          title={`${row.correctPct}% correct`}
                        />
                      )}
                      {row.wrongPct > 0 && (
                        <span
                          className="ql-seg wrong"
                          style={{ width: `${row.wrongPct}%` }}
                          title={`${row.wrongPct}% wrong`}
                        />
                      )}
                      {row.unattemptedPct > 0 && (
                        <span
                          className="ql-seg skipped"
                          style={{ width: `${row.unattemptedPct}%` }}
                          title={`${row.unattemptedPct}% not attempted`}
                        />
                      )}
                    </div>
                  </td>
                  <td className="ql-num ql-pct-correct">
                    <strong>{row.correctPct}%</strong>
                    <span className="ql-count">{row.correct}</span>
                  </td>
                  <td className="ql-num ql-pct-wrong">
                    <strong>{row.wrongPct}%</strong>
                    <span className="ql-count">{row.wrong}</span>
                  </td>
                  <td className="ql-num ql-pct-skipped">
                    <strong>{row.unattemptedPct}%</strong>
                    <span className="ql-count">{row.unattempted}</span>
                  </td>
                  <td>
                    <span className={`ql-diff ql-diff-${row.difficulty}`}>
                      {DIFF_LABEL[row.difficulty]}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {studentCount <= 1 && (
        <p className="form-hint ql-cohort-hint">
          When more students complete this test on the same device, percentages update automatically.
        </p>
      )}
    </>
  )
}

/**
 * @param {{
 *   testId: string
 *   questions: import('../data/tests').Question[]
 *   studentGrades?: Map<string, string>
 *   subjectFilter?: string
 *   perQuestion?: object[]
 *   sessionTelemetry?: object | null
 *   demoTimeline?: boolean
 *   initialQuestionId?: string | null
 *   wrongReasons?: Record<string, string>
 *   autoErrorTypes?: Record<string, string>
 *   onWrongReasonChange?: (questionId: string, tagId: string | null) => void
 * }} props
 */
export default function QuestionLevelAnalysis({
  testId,
  questions,
  studentGrades,
  subjectFilter = 'overall',
  perQuestion,
  sessionTelemetry = null,
  demoTimeline = false,
  initialQuestionId = null,
  wrongReasons = {},
  autoErrorTypes = {},
  onWrongReasonChange,
}) {
  const [cohortOpen, setCohortOpen] = useState(false)

  const allRows = useMemo(
    () => buildQuestionLevelCohortStats(testId, questions),
    [testId, questions],
  )

  const peerStatsByQuestionId = useMemo(() => {
    const real = buildPerQuestionPeerStats(testId, questions)
    const sample = real.values().next().value
    if (!demoTimeline || (sample && sample.studentCount >= 2)) return real
    return buildDemoPeerStatsForQuestions(questions, perQuestion)
  }, [testId, questions, perQuestion, demoTimeline])

  const questionsById = useMemo(() => {
    const m = new Map()
    for (const q of questions ?? []) {
      if (q?.id) m.set(q.id, q)
    }
    return m
  }, [questions])

  const rows = useMemo(() => {
    if (subjectFilter === 'overall') return allRows
    const ids = new Set(
      filterPerQuestionForSubject(
        allRows.map((r) => ({ questionId: r.questionId, subject: r.subject, index: r.index })),
        subjectFilter,
      ).map((r) => r.questionId),
    )
    return allRows.filter((r) => ids.has(r.questionId))
  }, [allRows, subjectFilter])

  const hasPerQuestion = (perQuestion?.length ?? 0) > 0

  if (!rows.length && !hasPerQuestion) {
    return (
      <section className="ql-analysis card">
        <h2>Question-level analysis</h2>
        <p className="form-hint">No questions in this test.</p>
      </section>
    )
  }

  if (hasPerQuestion) {
    return (
      <div className="ql-analysis-pro">
        <ResultQuestionWisePanel
          perQuestion={perQuestion}
          subjectFilter={subjectFilter}
          peerStatsByQuestionId={peerStatsByQuestionId}
          questionsById={questionsById}
          sessionTelemetry={sessionTelemetry}
          demoTimeline={demoTimeline}
          title="Question-wise analysis"
          subtitle="Green = correct, red = wrong. Open Your vs correct for accuracy bands, visit timeline, toughness, and ideal time."
          initialQuestionId={initialQuestionId}
          wrongReasons={wrongReasons}
          autoErrorTypes={autoErrorTypes}
          onWrongReasonChange={onWrongReasonChange}
        />

        {rows.length > 0 && (
          <details
            className="ql-cohort-collapse"
            open={cohortOpen}
            onToggle={(e) => setCohortOpen(e.currentTarget.open)}
          >
            <summary>Cohort comparison — how other students did on each question</summary>
            <div className="ql-analysis" style={{ padding: '1rem 1.1rem' }}>
              <CohortTable rows={rows} studentGrades={studentGrades} />
            </div>
          </details>
        )}
      </div>
    )
  }

  const studentCount = rows[0]?.studentCount ?? 0

  return (
    <section className="ql-analysis card">
      <div className="ql-analysis-head">
        <div>
          <h2>Question-level analysis</h2>
          <p className="ql-analysis-sub">
            Share of students who got each question correct, wrong, or did not attempt it.
            {studentCount > 0 ? (
              <>
                {' '}
                Based on <strong>{studentCount}</strong> student
                {studentCount === 1 ? '' : 's'} on this browser.
              </>
            ) : (
              ' Take the test with more students to see cohort percentages.'
            )}
          </p>
        </div>
        <div className="ql-analysis-legend-bar">
          <span>
            <i className="ql-dot correct" /> Correct
          </span>
          <span>
            <i className="ql-dot wrong" /> Wrong
          </span>
          <span>
            <i className="ql-dot skipped" /> Not attempted
          </span>
        </div>
      </div>

      <CohortTable rows={rows} studentGrades={studentGrades} />
    </section>
  )
}
