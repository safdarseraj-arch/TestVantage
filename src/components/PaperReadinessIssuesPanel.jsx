import { Link } from 'react-router-dom'
import MathText from './MathText'
import { questionBankEditUrl, resolveQuestionBankId } from '../utils/examQuestionHeal'
import { getQuestionType } from '../data/questionTypes'

/**
 * @param {{
 *   problems: { index: number, id?: string, text: string, issues: { message: string }[] }[]
 *   questions: import('../data/tests').Question[]
 *   bank?: import('../data/tests').Question[]
 * }} props
 */
export default function PaperReadinessIssuesPanel({ problems, questions, bank }) {
  const questionRows = problems.filter((p) => p.index > 0)

  if (!questionRows.length) return null

  return (
    <div className="card paper-readiness-panel" role="alert">
      <strong>
        {questionRows.length} question issue(s) — students get substitutes from the syllabus; fix
        below for a permanent repair.
      </strong>
      <ul className="paper-readiness-list">
        {questionRows.map((problem) => {
          const question =
            questions.find((q) => q.id === problem.id) ??
            questions[problem.index - 1] ??
            null
          const bankId = question ? resolveQuestionBankId(question, bank) : problem.id
          const typeDef = getQuestionType(question?.questionType ?? 'single_correct')
          const options = (question?.options ?? []).filter((o) => String(o ?? '').trim())

          return (
            <li key={`${problem.index}-${problem.id ?? 'row'}`} className="paper-readiness-item">
              <div className="paper-readiness-head">
                <span>
                  Q{problem.index}
                  {bankId ? (
                    <>
                      {' '}
                      · ID <code>{bankId}</code>
                    </>
                  ) : null}
                  {' '}
                  · {typeDef.name}
                </span>
                {bankId && (
                  <Link
                    to={questionBankEditUrl(bankId)}
                    className="btn btn-primary btn-sm"
                  >
                    Edit in Question Bank
                  </Link>
                )}
              </div>
              <p className="paper-readiness-issue">{problem.issues[0]?.message}</p>
              {question && (
                <div className="paper-readiness-preview">
                  {question.text ? <MathText text={question.text} /> : <em>(No question text)</em>}
                  {options.length > 0 && (
                    <ol className="paper-readiness-options">
                      {options.map((opt, i) => (
                        <li key={i}>
                          <MathText text={opt || `Option ${String.fromCharCode(65 + i)}`} />
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
              {!question && problem.text && (
                <p className="form-hint paper-readiness-preview">{problem.text}…</p>
              )}
            </li>
          )
        })}
      </ul>
      <p className="form-hint">
        You can still preview this paper. Students never see broken questions — ready ones from the
        same syllabus are used instead.
      </p>
    </div>
  )
}
